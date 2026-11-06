import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createRelease, writeRelease } from "./release.mjs";

const require = createRequire(import.meta.url);
const release = createRelease({
  gitSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceDirty: !!execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim(),
});
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    STATIC_EXPORT: "true",
    NEXT_PUBLIC_APP_MODE: release.mode,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? "/feuerwehr-odenthal-app",
    NEXT_PUBLIC_RELEASE: JSON.stringify(release),
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
if (result.error) throw result.error;
if (result.status === 0) await writeRelease("out", release);
process.exit(result.status ?? 1);
