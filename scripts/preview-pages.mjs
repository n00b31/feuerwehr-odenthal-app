import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const root = resolve("out");
const prefix = process.env.NEXT_PUBLIC_BASE_PATH ?? "/feuerwehr-odenthal-app";
const port = Number(process.env.PORT ?? 3100);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};
async function exists(path) {
  try { return await stat(path); }
  catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return null; throw error; }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }); res.end(); return;
    }
    if (pathname === prefix && prefix) {
      res.writeHead(308, { Location: `${prefix}/${url.search}` }); res.end(); return;
    }
    let path = resolve(root, `.${pathname.slice(prefix.length)}`);
    const inScope = !prefix || pathname.startsWith(`${prefix}/`);
    if (!inScope || (path !== root && !path.startsWith(`${root}${sep}`))) {
      res.writeHead(404); res.end("Not found"); return;
    }
    let info = await exists(path);
    if (info?.isDirectory()) {
      if (!pathname.endsWith("/")) {
        res.writeHead(308, { Location: `${pathname}/${url.search}` }); res.end(); return;
      }
      path = resolve(path, "index.html");
      info = await exists(path);
    }
    const status = info?.isFile() ? 200 : 404;
    if (status === 404) path = resolve(root, "404.html");
    const extension = path.slice(path.lastIndexOf("."));
    const content = await readFile(path);
    res.writeHead(status, { "Content-Type": types[extension] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error("Static preview request failed:", error);
    res.writeHead(500); res.end("Static preview error");
  }
});
server.on("error", (error) => { console.error(error); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Static Pages preview: http://localhost:${port}${prefix}/`));
