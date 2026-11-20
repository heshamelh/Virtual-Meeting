import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";
import * as hq from "./hq.js";
import { aiInfo, modelFor, aiEnabled, askVoice, personaPrompt } from "./ai.js";
import { LEVELS } from "./seed.js";
import * as debate from "./debate.js";

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

const publicState = () => ({ ...store.get(), panel: debate.PANEL, models: Object.fromEntries(store.get().employees.map((e) => [e.id, modelFor(e).model])), levels: LEVELS, ai: aiInfo(), schedule: { ...store.get().schedule, ...hq.scheduleInfo() } });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

// Long-running jobs (brief, meeting) return 202 immediately; results arrive over the live stream.
const background = (p, label) => p.catch((e) => store.log(`${label} failed: ${e.message}`, "ceo", "error"));


// Keep the last 20 turns, strings only, alternating roles, starting and ending with the user.
function cleanHistory(h) {
  if (!Array.isArray(h)) return null;
  const out = [];
  for (const m of h.slice(-20)) {
    const role = m?.role === "assistant" ? "assistant" : "user";
    const content = String(m?.content ?? "").trim().slice(0, 4000);
    if (!content) continue;
    if (out.at(-1)?.role === role) out.at(-1).content += "\n" + content; else out.push({ role, content });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out.at(-1)?.role === "user" ? out : null;
}

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
  ["POST", /^\/api\/goals$/, async (req, res) => { const b = await readBody(req); json(res, 202, hq.createGoal({ goal: b.goal, autoRun: b.autoRun, source: "founder" })); }],
  ["POST", /^\/api\/goals\/([\w-]+)\/approve$/, (req, res, [, gid]) => json(res, 200, hq.approveGoal(gid))],
  ["POST", /^\/api\/brief$/, (req, res) => { background(hq.runMorningBrief(), "Morning brief"); json(res, 202, { ok: true }); }],
  ["POST", /^\/api\/meeting$/, (req, res) => { background(hq.runSundayMeeting(), "Sunday meeting"); json(res, 202, { ok: true }); }],
  // Debate panel: started on demand only (npm run debate), never by the scheduler or a UI button.
  ["POST", /^\/api\/debates$/, async (req, res) => json(res, 202, debate.startDebate(await readBody(req)))],
  ["GET", /^\/api\/debates\/([\w-]+)$/, (req, res, [, did]) => {
    const d = (store.get().debates || []).find((x) => x.id === did);
    return d ? json(res, 200, d) : json(res, 404, { error: "Debate not found" });
  }],
  // Voice: streams the reply as plain text chunks so the browser can start speaking the first sentence early.
  ["POST", /^\/api\/voice\/([\w-]+)$/, async (req, res, [, eid]) => {
    const s = store.get();
    const emp = s.employees.find((e) => e.id === eid);
    if (!emp) return json(res, 404, { error: "Employee not found" });
    const history = cleanHistory((await readBody(req)).history);
    if (!history) return json(res, 400, { error: "history must end with a user turn" });
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no" });
    const ctrl = new AbortController();
    res.on("close", () => { if (!res.writableFinished) ctrl.abort(); }); // founder interrupted: stop paying for tokens
    try {
      if (!aiEnabled) {
        const said = history.at(-1).content;
        if (emp.id === "ceo" && /^(please )?(start|kick off|get (the )?team)/i.test(said)) {
          res.write("On it, I'll plan it now and send you the plan to approve. ");
          const g = hq.createGoal({ goal: said, source: "voice call" });
          res.write(`\n[goal] ${JSON.stringify({ id: g.id, goal: g.goal })}`);
          return res.end();
        }
        const words = `Simulation mode. I'm ${emp.name}, and I heard: ${history.at(-1).content}. Set an Anthropic API key and I'll give you a real answer.`.split(" ");
        for (const w of words) { if (ctrl.signal.aborted) break; res.write(w + " "); await new Promise((r) => setTimeout(r, 60)); }
      } else {
        let system = personaPrompt(s.company, emp, s.skills, s.employees.filter((e) => e.id !== emp.id));
        if (emp.id === "ceo") system += `\n\nOn this call you can put the team to work. Only when the founder clearly asks you to
start, kick off or get the team on something, say one sentence confirming it, then end your reply with this exact line:
[[GOAL: <the goal in one self-contained sentence, including any details the founder gave>]]
You then plan it and the founder approves the plan on screen. Never use that line for questions or brainstorming.`;
        // Forward speech as it streams, but hold back the [[GOAL: ...]] marker so it's never read aloud.
        let held = "", marker = null;
        const onText = (t) => {
          if (marker !== null) { marker += t; return; }
          held += t;
          const i = held.indexOf("[[");
          if (i >= 0) { res.write(held.slice(0, i)); marker = held.slice(i); held = ""; return; }
          const keep = held.endsWith("[") ? 1 : 0;
          res.write(held.slice(0, held.length - keep)); held = held.slice(held.length - keep);
        };
        await askVoice({ system, history, emp, signal: ctrl.signal, onText });
        res.write(held);
        const goal = marker?.match(/\[\[GOAL:\s*([\s\S]+?)\]\]/)?.[1]?.trim();
        if (goal) { const g = hq.createGoal({ goal, source: "voice call" }); res.write(`\n[goal] ${JSON.stringify({ id: g.id, goal: g.goal })}`); }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) res.write(`\n[error] ${e.message}`);
    }
    res.end();
  }],
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
  console.log(ai.enabled ? `🤖 Claude enabled — team: ${ai.model}, CEO: ${ai.ceoModel}` : "🧪 Simulation mode — set ANTHROPIC_API_KEY for real AI work");
  hq.startAmbient();
  hq.startScheduler();
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { store.saveNow(); process.exit(0); });
