import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { auditLog, authenticators } from "@/db/schema";
import {
  labelFromUserAgent,
  putChallenge,
  rpFrom,
  userHandle,
  takeChallenge,
} from "@/lib/webauthn";

/** Enrolling a passkey requires an existing session — you prove who you are
 *  with the password first, then bind a device (PRD §7). */
async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Belum masuk");
  return session.user;
}

export async function GET(req: Request) {
  let user;
  try {
    user = await requireSession();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  const { rpID, rpName, origin } = rpFrom(req.headers);
  const employeeId = Number(user.id);

  const existing = await db
    .select({
      credentialId: authenticators.credentialId,
      transports: authenticators.transports,
    })
    .from(authenticators)
    .where(eq(authenticators.employeeId, employeeId));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: userHandle(employeeId),
    userName: user.email ?? String(employeeId),
    userDisplayName: user.name ?? undefined,
    attestationType: "none",
    // stops the same device enrolling twice and creating a confusing duplicate
    excludeCredentials: existing.map((c) => ({
      id: Buffer.from(c.credentialId, "base64url"),
      type: "public-key" as const,
      transports: c.transports?.split(",") as never,
    })),
    authenticatorSelection: {
      residentKey: "required", // discoverable, so login needs no email first
      userVerification: "preferred",
    },
  });

  const challengeId = await putChallenge(options.challenge, employeeId);
  return Response.json({ options, challengeId, rpID, origin });
}

const verifyBody = z.object({
  challengeId: z.string().min(1),
  response: z.unknown(),
  label: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireSession();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = verifyBody.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const employeeId = Number(user.id);
  const stored = await takeChallenge(parsed.data.challengeId);
  if (!stored || stored.employeeId !== employeeId) {
    return Response.json(
      { error: "Sesi pendaftaran kedaluwarsa. Coba lagi." },
      { status: 400 },
    );
  }

  const { rpID, origins } = rpFrom(req.headers);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: parsed.data.response as RegistrationResponseJSON,
      expectedChallenge: stored.challenge,
      // an array: the same endpoint verifies browser and native ceremonies
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return Response.json(
      { error: "Passkey gagal diverifikasi" },
      { status: 400 },
    );
  }

  const info = verification.registrationInfo;
  const credentialId = Buffer.from(info.credentialID).toString("base64url");

  await db
    .insert(authenticators)
    .values({
      employeeId,
      credentialId,
      publicKey: Buffer.from(info.credentialPublicKey).toString("base64url"),
      counter: info.counter,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      transports:
        (
          parsed.data.response as RegistrationResponseJSON
        ).response?.transports?.join(",") ?? null,
      label:
        parsed.data.label?.trim() ||
        labelFromUserAgent(req.headers.get("user-agent")),
    })
    .onConflictDoNothing({ target: authenticators.credentialId });

  await db.insert(auditLog).values({
    actorId: employeeId,
    action: "passkey.register",
    entity: "authenticators",
    detail: credentialId.slice(0, 12),
  });

  return Response.json({ ok: true });
}

const deleteBody = z.object({ id: z.coerce.number().int().positive() });

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireSession();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  const parsed = deleteBody.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  // scoped to the owner, so one admin cannot delete another's passkey
  const [removed] = await db
    .delete(authenticators)
    .where(
      and(
        eq(authenticators.id, parsed.data.id),
        eq(authenticators.employeeId, Number(user.id)),
      ),
    )
    .returning({ id: authenticators.id });

  if (!removed) {
    return Response.json({ error: "Passkey tidak ditemukan" }, { status: 404 });
  }

  await db.insert(auditLog).values({
    actorId: Number(user.id),
    action: "passkey.revoke",
    entity: "authenticators",
    entityId: parsed.data.id,
  });

  return Response.json({ ok: true });
}
