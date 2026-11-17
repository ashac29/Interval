import { createAdminClient } from "./admin";

/** Opaque (already encrypted) token storage. Service role only. */
export async function saveCredentials(userId: string, encryptedToken: string, keyVersion = 1): Promise<void> {
  const { error } = await createAdminClient()
    .from("calendar_credentials")
    .upsert({ user_id: userId, refresh_token_enc: encryptedToken, key_version: keyVersion }, { onConflict: "user_id" });
  if (error) throw new Error(`saveCredentials failed: ${error.code ?? "error"}`);
}

export async function loadCredentials(userId: string): Promise<{ token: string; keyVersion: number } | null> {
  const { data, error } = await createAdminClient().from("calendar_credentials").select("refresh_token_enc,key_version").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`loadCredentials failed: ${error.code ?? "error"}`);
  return data ? { token: data.refresh_token_enc as string, keyVersion: data.key_version as number } : null;
}

export async function deleteCredentials(userId: string): Promise<void> {
  const { error } = await createAdminClient().from("calendar_credentials").delete().eq("user_id", userId);
  if (error) throw new Error(`deleteCredentials failed: ${error.code ?? "error"}`);
}
