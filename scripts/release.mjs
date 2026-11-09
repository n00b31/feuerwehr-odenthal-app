import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function createRelease({ gitSha, sourceDirty = false }, env = process.env, now = new Date(), nonce = randomUUID()) {
  if (!/^[a-f0-9]{40}$/.test(gitSha)) throw new Error("A full Git commit is required for a Pages release.");
  if (env.GITHUB_SHA && env.GITHUB_SHA !== gitSha) throw new Error("Workflow SHA does not match the checked-out commit.");
  if (env.GITHUB_ACTIONS === "true" && sourceDirty) throw new Error("A workflow cannot publish an uncommitted source tree.");
  const mode = env.NEXT_PUBLIC_APP_MODE ?? "supabase-dev";
  if (!["demo", "supabase-dev"].includes(mode)) throw new Error("Invalid release application mode.");
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "/feuerwehr-odenthal-app";
  if (!/^(?:\/[A-Za-z0-9_-]+)*$/.test(basePath)) throw new Error("Invalid release base path.");
  return {
    format: 1, version: "DEV 0.6.4", buildId: `${gitSha.slice(0, 12)}-${nonce}`,
    gitSha, sourceDirty, mode, basePath, builtAt: now.toISOString(),
    repository: env.GITHUB_REPOSITORY ?? "n00b31/feuerwehr-odenthal-app",
    runId: env.GITHUB_RUN_ID ?? null, runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
  };
}

export async function writeRelease(directory, release) {
  const workerPath = path.join(directory, "sw.js");
  const worker = await readFile(workerPath, "utf8");
  if (worker.split("__FF_RELEASE__").length !== 2) throw new Error("Service worker release placeholder is missing or ambiguous.");
  const manifestPath = path.join(directory, "manifest.webmanifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.description = `${manifest.description} ${release.version} · Build ${release.buildId}`;
  await writeFile(workerPath, worker.replace("__FF_RELEASE__", release.buildId));
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(path.join(directory, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
}
