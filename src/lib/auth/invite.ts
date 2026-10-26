import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** 256-bit single-use token. Only its SHA-256 hash is stored. */
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type PendingInvite = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

/** Looks up a still-valid invite by its plaintext token (server only). */
export async function findPendingInvite(token: string): Promise<PendingInvite | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("invites")
    .select("id, email, full_name, role, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (!data || data.accepted_at || data.revoked_at || new Date(data.expires_at) < new Date()) return null;
  return { id: data.id, email: data.email, fullName: data.full_name, role: data.role };
}

export type AcceptResult =
  | { ok: true; email: string }
  | { ok: false; error: "invalid_invite" | "weak_password" | "generic" };

/**
 * Creates the auth user for an invite. The plaintext token travels to the
 * database, where private.validate_invite_signup() hashes and matches it and
 * strips it from the stored metadata, and private.handle_new_auth_user()
 * creates the profile/team membership and consumes the invite in the same
 * transaction, so a race or replay cannot create a second account.
 */
export async function acceptInvite(token: string, password: string): Promise<AcceptResult> {
  const invite = await findPendingInvite(token);
  if (!invite) return { ok: false, error: "invalid_invite" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { invite_token: token },
  });
  if (error) {
    if (error.code === "weak_password") return { ok: false, error: "weak_password" };
    if (error.code === "email_exists" || /database error/i.test(error.message)) {
      return { ok: false, error: "invalid_invite" };
    }
    return { ok: false, error: "generic" };
  }
  return { ok: true, email: invite.email };
}
