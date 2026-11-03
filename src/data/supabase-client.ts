import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BASE_PATH } from "../config/app";
import { getSupabasePublicConfig } from "../config/supabase";

let client: SupabaseClient | undefined;

export function getSupabaseClient() {
  if (typeof window === "undefined") throw new Error("Supabase Auth darf nur im Browser initialisiert werden.");
  if (client) return client;
  const config = getSupabasePublicConfig();
  if (config.status !== "configured") throw new Error("Supabase DEV ist nicht konfiguriert.");
  client = createClient(config.url, config.publishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: `ff-supabase-dev:${new URL(config.url).hostname}:${BASE_PATH || "/"}`,
    },
  });
  return client;
}
