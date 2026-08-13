"use client";

import { useRouter } from "next/navigation";
import { PasswordForm } from "../ganti-sandi/password-form";

/** The same form as /ganti-sandi, pointed at the public endpoint and carrying the
 *  token. No session exists here, so it ends at /login instead of re-signing in. */
export function AturForm({ token }: { token: string }) {
  const router = useRouter();
  return (
    <PasswordForm
      requireCurrent={false}
      endpoint="/api/password/reset"
      extra={{ token }}
      onDone={() => router.replace("/login")}
    />
  );
}
