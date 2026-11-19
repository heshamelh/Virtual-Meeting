#!/usr/bin/env node
// Run the debate panel on demand:
//   npm run debate -- "Should we launch the paid plan next week?" [--context "extra background"] [--context-file notes.md]
// If the HQ server is running, the debate runs there so you can watch it live in the Debate Room tab.
// Otherwise it runs standalone and is saved to the HQ data file.
import fs from "node:fs";

const args = process.argv.slice(2);
let question = "", context = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--context") context = args[++i] ?? "";
  else if (args[i] === "--context-file") context = fs.readFileSync(args[++i], "utf8");
  else question += (question ? " " : "") + args[i];
}
if (!question) {
  console.error('Usage: npm run debate -- "<decision to debate>" [--context "..."] [--context-file path]');
  process.exit(1);
}

const BASE = `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3000}`;
const headers = { "content-type": "application/json", "x-hq-token": process.env.HQ_TOKEN || "" };
const NAMES = { naruto: "🟡 NARUTO (supports)", sasuke: "🔵 SASUKE (challenges)", judge: "⚖️  JUDGE" };
const printTurn = (t) => console.log(`\n${NAMES[t.who]}${t.round ? ` — round ${t.round}` : ""}\n${"-".repeat(50)}\n${t.text}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function viaServer() {
  const res = await fetch(`${BASE}/api/debates`, { method: "POST", headers, body: JSON.stringify({ question, context }) });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { fatal: true });
  console.log(`⚖️  Debate ${body.id} running on the HQ server — watch it live in the Debate Room tab (${BASE}/#debate)`);
  let shown = 0;
  for (;;) {
    await sleep(1500);
    const d = await (await fetch(`${BASE}/api/debates/${body.id}`, { headers })).json();
    while (shown < d.turns.length) printTurn(d.turns[shown++]);
    if (d.status !== "running") return d;
  }
}

async function standalone() {
  const store = await import("../src/store.js");
  const { startDebate } = await import("../src/debate.js");
  store.load();
  let shown = 0;
  store.subscribe(() => {
    const d = store.get().debates[0];
    while (d && shown < d.turns.length) printTurn(d.turns[shown++]);
  });
  console.log("⚖️  HQ server not running — debating standalone (result is saved to the HQ data file)");
  startDebate({ question, context });
  for (;;) {
    await sleep(500);
    const d = store.get().debates[0];
    if (d.status !== "running" && d.speaker === null) { store.saveNow(); return d; }
  }
}

let d;
try {
  d = await viaServer();
} catch (err) {
  if (err.fatal) { console.error("❌", err.message); process.exit(1); }
  d = await standalone(); // server unreachable
}
if (d.status === "failed") { console.error(`❌ Debate failed: ${d.error}`); process.exit(1); }
const w = d.verdict.winner;
console.log(`\n🏛️  RULING: ${w === "split" ? "SPLIT DECISION" : `${w.toUpperCase()} IS RIGHT`}  (Sasuke ended with: ${d.endedBy})`);
process.exit(0);
