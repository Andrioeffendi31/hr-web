import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { employees } from "@/db/schema";

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
    // ponytail: WebAuthn/passkey (PRD §7) not wired yet — needs @simplewebauthn +
    // an adapter table and a real RP ID to test against. Credentials covers login
    // today; add the Passkey provider here when the app has a deployed domain.
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

/** Throws unless the caller is HR Admin. Every admin mutation calls this —
 *  authorization lives on the server, never in the UI (PRD §7). */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Belum masuk");
  if (session.user.role !== "hr_admin")
    throw new Error("Hanya HR Admin yang boleh melakukan aksi ini");
  return session.user;
}
