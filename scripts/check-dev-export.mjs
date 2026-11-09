import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

if (process.env.NEXT_PUBLIC_APP_MODE !== "supabase-dev") throw new Error("Pages must publish a DEV export, not the demo.");
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await check(target);
    else if (/\.(js|html|json|txt)$/.test(entry.name)) {
      const content = await readFile(target, "utf8");
      if (/sb_secret_[A-Za-z0-9_-]+|sb_publishable_SYNTHETIC_CI_ONLY|https:\/\/syntheticci\.supabase\.co/.test(content)) {
        throw new Error(`Non-publishable key or synthetic endpoint in ${target}`);
      }
      if (/FF_VAPID_PRIVATE_KEY|FF_PUSH_CRON_SECRET|-----BEGIN [^-]*PRIVATE KEY-----/.test(content)) {
        throw new Error(`Server-only Push configuration in ${target}`);
      }
      for (const token of content.match(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g) ?? []) {
        let claims;
        try { claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
        catch { continue; }
        if (claims.role === "service_role") throw new Error(`Privileged JWT in ${target}`);
      }
    }
  }
}
await check("out");
console.log("DEV export contains no secret-key value, privileged JWT, server-only Push configuration or synthetic CI endpoint/key.");
