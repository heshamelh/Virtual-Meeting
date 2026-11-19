import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";
import * as hq from "./hq.js";
import { aiInfo } from "./ai.js";
import { LEVELS } from "./seed.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "..", "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const TOKEN = process.env.HQ_TOKEN || ""; // set this before exposing the server beyond localhost

store.load();

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("Invalid JSON")); } });
});

const publicState = () => ({ ...store.get(), levels: LEVELS, ai: aiInfo(), schedule: { ...store.get().schedule, ...hq.scheduleInfo() } });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

// Long-running jobs (brief, meeting) return 202 immediately; results arrive over the live stream.
const background = (p, label) => p.catch((e) => store.log(`${label} failed: ${e.message}`, "ceo", "error"));

const routes = [
  ["GET", /^\/api\/state$/, (req, res) => json(res, 200, publicState())],
  ["GET", /^\/api\/stream$/, (req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    let pending = null;
    const push = () => { pending = null; res.write(`data: ${JSON.stringify(publicState())}\n\n`); };
    push();
    const unsub = store.subscribe(() => { pending ||= setTimeout(push, 250); });
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => { unsub(); clearInterval(ping); clearTimeout(pending); });
  }],
  ["POST", /^\/api\/tasks$/, async (req, res) => json(res, 201, hq.createTask({ ...(await readBody(req)), source: "founder" }))],
  ["POST", /^\/api\/tasks\/([\w-]+)\/run$/, (req, res, [, tid]) => json(res, 200, hq.runTask(tid))],
  ["POST", /^\/api\/brief$/, (req, res) => { background(hq.runMorningBrief(), "Morning brief"); json(res, 202, { ok: true }); }],
  ["POST", /^\/api\/meeting$/, (req, res) => { background(hq.runSundayMeeting(), "Sunday meeting"); json(res, 202, { ok: true }); }],
  ["POST", /^\/api\/employees\/([\w-]+)\/skills$/, async (req, res, [, eid]) => {
    const { skillId, on } = await readBody(req);
    json(res, 200, hq.equipSkill(eid, skillId, Boolean(on)));
  }],
  ["POST", /^\/api\/skills$/, async (req, res) => json(res, 201, hq.upsertSkill(await readBody(req)))],
  ["PATCH", /^\/api\/company$/, async (req, res) => {
    const b = await readBody(req);
    store.update((s) => {
      if (b.name) s.company.name = String(b.name).slice(0, 80);
      if (b.mission) s.company.mission = String(b.mission).slice(0, 500);
      if (Array.isArray(b.priorities)) s.company.priorities = b.priorities.map(String).filter(Boolean).slice(0, 5);
    });
    json(res, 200, store.get().company);
  }],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/api/")) {
      if (TOKEN && req.headers["x-hq-token"] !== TOKEN && url.searchParams.get("token") !== TOKEN) {
        return json(res, 401, { error: "Missing or wrong HQ token" });
      }
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) return await handler(req, res, m);
      }
      return json(res, 404, { error: "Not found" });
    }
    const file = path.normalize(path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end("Not found");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    json(res, 400, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  const ai = aiInfo();
  console.log(`🏢 AI Company HQ running at http://${HOST}:${PORT}`);
  console.log(ai.enabled ? `🤖 Claude enabled (${ai.model})` : "🧪 Simulation mode — set ANTHROPIC_API_KEY for real AI work");
  hq.startAmbient();
  hq.startScheduler();
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { store.saveNow(); process.exit(0); });
