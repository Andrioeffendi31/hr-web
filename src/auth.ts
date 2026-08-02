import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { authenticators, employees } from "@/db/schema";
import { rpFrom, takeChallenge } from "@/lib/webauthn";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "hr_admin" | "manager" | "employee";
      division: string;
      position: string;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const passkeySchema = z.object({
  challengeId: z.string().min(1),
  response: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const [user] = await db
          .select()
          .from(employees)
          .where(eq(employees.email, parsed.data.email.toLowerCase()))
          .limit(1);
        if (!user || !user.active) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          division: user.division,
          position: user.position,
        };
      },
    }),
    /**
     * Passkey / WebAuthn (PRD §7).
     *
     * The assertion is verified here rather than in a route handler so the
     * session is only ever minted after a cryptographically valid signature —
     * there is no intermediate "verified" state a caller could forge.
     */
    Credentials({
      id: "passkey",
      name: "Passkey",
      credentials: { challengeId: {}, response: {} },
      async authorize(raw) {
        const parsed = passkeySchema.safeParse(raw);
        if (!parsed.success) return null;

        let assertion: AuthenticationResponseJSON;
        try {
          assertion = JSON.parse(parsed.data.response);
        } catch {
          return null;
        }

        const stored = await takeChallenge(parsed.data.challengeId);
        if (!stored) return null;

        const credentialId = assertion.id;
        const [row] = await db
          .select({
            authId: authenticators.id,
            counter: authenticators.counter,
            publicKey: authenticators.publicKey,
            credentialId: authenticators.credentialId,
            employee: employees,
          })
          .from(authenticators)
          .innerJoin(employees, eq(employees.id, authenticators.employeeId))
          .where(eq(authenticators.credentialId, credentialId))
          .limit(1);
        if (!row || !row.employee.active) return null;

        // rpID/origin must come from the request, never from the client payload
        const { rpID, origin } = rpFrom(await headers());

        let verification;
        try {
          verification = await verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge: stored.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: false,
            authenticator: {
              credentialID: Buffer.from(row.credentialId, "base64url"),
              credentialPublicKey: Buffer.from(row.publicKey, "base64url"),
              counter: row.counter,
            },
          });
        } catch {
          return null;
        }
        if (!verification.verified) return null;

        // a counter that fails to advance signals a cloned authenticator
        await db
          .update(authenticators)
          .set({
            counter: verification.authenticationInfo.newCounter,
            lastUsedAt: new Date(),
          })
          .where(eq(authenticators.id, row.authId));

        const u = row.employee;
        return {
          id: String(u.id),
          name: u.name,
          email: u.email,
          role: u.role,
          division: u.division,
          position: u.position,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role: string }).role;
        token.division = (user as { division: string }).division;
        token.position = (user as { position: string }).position;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as "hr_admin" | "manager" | "employee";
      session.user.division = token.division as string;
      session.user.position = token.position as string;
      return session;
    },
  },
});

/** Throws unless someone is signed in. Used where the check is per-row rather
 *  than per-role — e.g. a file download an employee may only see if it is
 *  their own document (PRD §6.6). */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Belum masuk");
  return session.user;
}

/** Throws unless the caller is HR Admin. Every admin mutation calls this —
 *  authorization lives on the server, never in the UI (PRD §7). */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Belum masuk");
  if (session.user.role !== "hr_admin")
    throw new Error("Hanya HR Admin yang boleh melakukan aksi ini");
  return session.user;
}
