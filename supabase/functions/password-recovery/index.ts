import { createRecoveryHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL");
const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (url !== "https://orxinqhhbtjpkzwlfaxq.supabase.co" || !publicKey || !serviceKey) {
  throw new Error("Existing DEV project and server-only recovery credentials required");
}
Deno.serve(createRecoveryHandler({
  url, publicKey, serviceKey,
  recoveryUrl: "https://n00b31.github.io/feuerwehr-odenthal-app/auth/recovery/",
  allowedOrigins: ["https://n00b31.github.io"],
}));
