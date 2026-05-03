// Wrapper Node.js para servir o build do TanStack Start em VPS.
// O dist/server/server.js exporta um handler (fetch-style ou default).
// Aqui criamos um servidor HTTP nativo que adapta Request/Response.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(__dirname, "dist", "client");
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

// Importa o handler do build SSR
const serverModule = await import("./dist/server/server.js");
const handler =
  serverModule.default ||
  serverModule.handler ||
  serverModule.fetch ||
  serverModule.GET;

if (typeof handler !== "function") {
  console.error("[server-entry] Não encontrei handler exportado em dist/server/server.js");
  console.error("Exports:", Object.keys(serverModule));
  process.exit(1);
}

async function tryServeStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") return false;
  // Bloqueia path traversal
  const safe = normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = join(CLIENT_DIR, safe);
  if (!filePath.startsWith(CLIENT_DIR)) return false;
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return false;
    const ext = extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": data.length,
      "Cache-Control": urlPath.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    });
    res.end(req.method === "HEAD" ? null : data);
    return true;
  } catch {
    return false;
  }
}

function nodeReqToWebRequest(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `${HOST}:${PORT}`;
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, String(v));
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = new ReadableStream({
      start(controller) {
        req.on("data", (chunk) => controller.enqueue(chunk));
        req.on("end", () => controller.close());
        req.on("error", (err) => controller.error(err));
      },
    });
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function webResponseToNodeRes(webRes, res) {
  const headers = {};
  webRes.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(webRes.status, headers);
  if (!webRes.body) return res.end();
  const reader = webRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    if (await tryServeStatic(req, res)) return;
    const webReq = nodeReqToWebRequest(req);
    const webRes = await handler(webReq);
    if (webRes instanceof Response) {
      await webResponseToNodeRes(webRes, res);
    } else {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Handler did not return a Response");
    }
  } catch (err) {
    console.error("[server-entry] Erro:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server-entry] Listening on http://${HOST}:${PORT}`);
});
