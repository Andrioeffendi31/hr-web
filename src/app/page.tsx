import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homeFor, type Role } from "@/lib/access";

/**
 * The role's own front door.
 *
 * This is also where post-login lands: login-form.tsx pushes whatever the server
 * handed it, which now defaults to "/". Resolving the destination here rather
 * than on the client is what fixes the old ordering bug — the form used to be
 * given a fixed target computed before anyone knew which role was signing in.
 */
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? homeFor(session.user.role as Role) : "/login");
}
