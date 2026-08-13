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
      /**
       * The value of employees.passwordChangedAt at sign-in, in epoch ms (0 for
       * never). Compared against the live column wherever a DB read already
       * happens, so a token minted before the last password change stops working.
       *
       * NOT `iat`: Auth.js re-issues the JWT on every request, so `iat` is always
       * "now" and a spent session would silently renew itself past the check.
       */
      pwdAt: number;
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

        const ok = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!ok) return null;

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          division: user.division,
          position: user.position,
          pwdAt: user.passwordChangedAt?.getTime() ?? 0,
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
        const { rpID, origins } = rpFrom(await headers());

        let verification;
        try {
          verification = await verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge: stored.challenge,
            expectedOrigin: origins,
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
          pwdAt: u.passwordChangedAt?.getTime() ?? 0,
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
        token.pwdAt = (user as { pwdAt: number }).pwdAt;
      }
      return token;
    },
    session({ session, token }) {
      // No database call here on purpose: this callback also runs inside the Edge
      // proxy, where `pg` cannot go, and it runs on every navigation. The staleness
      // comparison happens in the three places that already load the row —
      // lib/me.ts, (app)/layout.tsx and requireAdmin().
      session.user.pwdAt = (token.pwdAt as number) ?? 0;
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

  /**
   * Re-read the row rather than trust the token.
   *
   * The JWT is a 30-day snapshot of what was true at sign-in, so without this an
   * admin who has been deactivated or demoted keeps full rights on every admin
   * route for the rest of the month — and a password change cannot evict a stolen
   * session. One indexed lookup by primary key, and only on admin actions, which
   * are the rarest and most consequential requests in the app.
   */
  const [row] = await db
    .select({
      role: employees.role,
      active: employees.active,
      changedAt: employees.passwordChangedAt,
      must: employees.mustChangePassword,
    })
    .from(employees)
    .where(eq(employees.id, Number(session.user.id)))
    .limit(1);

  if (!row?.active || row.role !== "hr_admin")
    throw new Error("Hanya HR Admin yang boleh melakukan aksi ini");
  if (row.must) throw new Error("Buat kata sandi baru dulu untuk melanjutkan");
  if (stale(row.changedAt, session.user.pwdAt))
    throw new Error("Sesi berakhir, silakan masuk lagi");

  return session.user;
}

/**
 * Does this session still match the account's current password epoch?
 *
 * Exact equality against the value captured at sign-in, not a "was it issued
 * before" comparison. Two earlier attempts failed for instructive reasons:
 * `iat` in milliseconds called a token minted 200 ms after the change stale, and
 * rounding to seconds then let a stale token through — because Auth.js re-issues
 * the JWT on every request, so `iat` is perpetually current and cannot witness
 * when the session began.
 *
 * A claim written once at sign-in has no such problem, and a mismatch is exactly
 * the question being asked: the password changed since this session started.
 */
export function stale(changedAt: Date | null, pwdAt: number | undefined) {
  return (changedAt?.getTime() ?? 0) !== (pwdAt ?? 0);
}
