import { getSupabasePublicConfig } from "../src/config/supabase";

const config = getSupabasePublicConfig();
console.log(config.status === "configured"
  ? "Supabase public DEV configuration valid. The UI still uses the local demo repository."
  : "Supabase not configured. The local demo remains available without credentials.");
