import { getSupabasePublicConfig } from "../src/config/supabase";
import { getAppMode } from "../src/config/mode";

const config = getSupabasePublicConfig();
const mode = getAppMode();
console.log(`Application mode: ${mode}.`);
console.log(config.status === "configured"
  ? "Public Supabase configuration valid. This does not verify connectivity, migrations or Auth settings."
  : "Supabase not configured. DEV shows a locked setup notice, never a demo fallback.");
