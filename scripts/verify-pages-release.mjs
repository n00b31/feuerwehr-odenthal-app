import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function verifyPages(directory, pageUrl, expectedId, expectedSha, request = fetch) {
  const root = new URL(pageUrl);
  if (root.href !== "https://n00b31.github.io/feuerwehr-odenthal-app/") throw new Error("Unexpected Pages verification target.");
  const release = JSON.parse(await readFile(path.join(directory, "release.json"), "utf8"));
  if (release.format !== 1 || release.gitSha !== expectedSha || release.buildId !== expectedId || release.sourceDirty !== false
    || release.mode !== "supabase-dev" || release.basePath !== root.pathname.slice(0, -1)
    || release.repository !== "n00b31/feuerwehr-odenthal-app") throw new Error("Artifact does not identify the expected clean DEV commit/build.");
  const files = [];
  async function list(location) {
    for (const entry of await readdir(location, { withFileTypes: true })) {
      const file = path.join(location, entry.name);
      if (entry.isDirectory()) await list(file);
      else files.push(file);
    }
  }
  await list(directory);
  files.sort((a, b) => Number(!a.endsWith("release.json")) - Number(!b.endsWith("release.json")));
  for (const file of files) {
    const relative = path.relative(directory, file).split(path.sep).join("/");
    const target = new URL(relative.endsWith("index.html") ? relative.slice(0, -"index.html".length) : relative, root);
    target.searchParams.set("_ff_verify", `${expectedId}-${Date.now()}`);
    const response = await request(target, { cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Published ${relative}: HTTP ${response.status}`);
    if (digest(Buffer.from(await response.arrayBuffer())) !== digest(await readFile(file))) {
      throw new Error(`Published ${relative} differs from this run's deployment artifact.`);
    }
  }
  return { files: files.length, gitSha: release.gitSha, buildId: release.buildId };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const { PAGES_ARTIFACT_DIR, PAGES_URL, EXPECTED_RELEASE_ID, GITHUB_SHA } = process.env;
  if (!PAGES_ARTIFACT_DIR || !PAGES_URL || !EXPECTED_RELEASE_ID || !GITHUB_SHA) throw new Error("Pages provenance inputs are required.");
  let verified = false;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      console.log(JSON.stringify(await verifyPages(PAGES_ARTIFACT_DIR, PAGES_URL, EXPECTED_RELEASE_ID, GITHUB_SHA)));
      verified = true; break;
    } catch (error) {
      if (attempt === 12) throw error;
      console.warn(`Pages not verified yet (${attempt}/12): ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
  }
  if (!verified) throw new Error("Pages verification did not complete.");
}
