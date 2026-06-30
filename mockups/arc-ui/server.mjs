import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 8910;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || "/").split("?")[0]);
    if (path === "/") path = "/build-home.html";
    // prevent path traversal
    const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(ROOT, safe);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const data = await readFile(filePath);
    const ext = "." + filePath.split(".").pop();
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`Arc UI mockups gallery → http://localhost:${PORT}`);
});
