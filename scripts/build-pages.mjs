import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    STATIC_EXPORT: "true",
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? "/feuerwehr-odenthal-app",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
