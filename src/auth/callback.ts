import type { SupabaseClient } from "@supabase/supabase-js";
import { publicPath } from "../config/app";
import { exchangeServerRecovery } from "./recovery-client";

export type AuthCallback =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "hash"; token: string }
  | { kind: "server-pkce"; code: string; requestId: string }
  | { kind: "pkce"; code: string; flowId?: string; recovery: boolean };

export function readAuthCallback(url: URL): AuthCallback {
  const path = url.pathname.replace(/\/$/, "");
  const recovery = path === publicPath("/auth/recovery");
  if (!recovery && path !== publicPath("/auth/callback")) return {
    kind: url.searchParams.has("code") || url.searchParams.has("token_hash")
      || /access_token=|refresh_token=/.test(url.hash) ? "invalid" : "none",
  };
  if (url.hash || url.searchParams.has("error")) return { kind: "invalid" };
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token_hash");
  if (token) return !code && url.searchParams.get("type") === "recovery" && token.length <= 1024
    ? { kind: "hash", token } : { kind: "invalid" };
  if (code && code.length <= 1024) {
    const requestId = url.searchParams.get("recovery_request");
    if (requestId !== null) return recovery && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)
      ? { kind: "server-pkce", code, requestId } : { kind: "invalid" };
    const flowId = url.searchParams.get("sb_flow_id");
    return { kind: "pkce", code, ...(flowId !== null ? { flowId } : {}), recovery };
  }
  return { kind: recovery ? "invalid" : "none" };
}

export async function exchangeAuthCallback(client: SupabaseClient, callback: AuthCallback): Promise<string | null> {
  if (callback.kind === "none") return null;
  if (callback.kind === "invalid") throw Object.assign(new Error("Invalid recovery callback"), { code: "recovery_invalid" });
  if (callback.kind === "server-pkce") return exchangeServerRecovery(client, callback.requestId, callback.code);
  if (callback.kind === "hash") {
    const { data, error } = await client.auth.verifyOtp({ type: "recovery", token_hash: callback.token });
    if (error) throw error;
    if (!data.session || !data.user) throw Object.assign(new Error("Missing recovery identity"), { code: "recovery_invalid" });
    return data.user.id;
  }
  const { data, error } = await client.auth.exchangeCodeForSession(callback.code,
    callback.flowId !== undefined ? { flowId: callback.flowId } : undefined);
  if (error) throw error;
  const isRecovery = "redirectType" in data && data.redirectType === "recovery";
  if (callback.recovery && !isRecovery) {
    throw Object.assign(new Error("Not a recovery flow"), { code: "recovery_invalid" });
  }
  return isRecovery ? data.user.id : null;
}
