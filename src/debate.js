// The Debate Panel: three people who exist only to argue about one decision.
//   Naruto — always supports the decision and builds the strongest case for it.
//   Sasuke — challenges it, round after round, until it's clear who is right (he may concede).
//   Judge  — listens to both and rules who is right.
// They are NOT on the schedule and have no UI button: they run only on demand (`npm run debate`).
import crypto from "node:crypto";
import * as store from "./store.js";
import { ask, aiEnabled, CEO_MODEL } from "./ai.js";

export const PANEL = {
  naruto: { id: "naruto", name: "Naruto", role: "The Supporter", model: process.env.HQ_DEBATE_MODEL || "claude-opus-5-5", effort: "medium" },
  sasuke: { id: "sasuke", name: "Sasuke", role: "The Challenger", model: process.env.HQ_DEBATE_MODEL || "claude-opus-5-5", effort: "high" },
  judge: { id: "judge", name: "Judge", role: "The Judge", model: process.env.HQ_JUDGE_MODEL || CEO_MODEL, effort: "high" },
};
const MAX_ROUNDS = Math.max(1, Math.min(5, Number(process.env.HQ_DEBATE_ROUNDS) || 3));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = {
  naruto: `You are Naruto, the Supporter on a company debate panel.
Your job: ALWAYS support the decision under debate and build the strongest honest case for it.
- Never switch sides, but never lie or invent facts: argue from real benefits, evidence and reasoning.
- When challenged, answer the specific objection directly; acknowledge a fair point, then show why the decision still holds or how to fix the weakness.
- Energetic, optimistic, never gives up. Under 200 words per turn.`,
  sasuke: `You are Sasuke, the Challenger on a company debate panel.
Your job: argue against the decision until it is clear who is right.
- Attack the weakest assumptions, risks, costs, second-order effects and better alternatives. Be specific; no vague doubt.
- You care about the truth more than winning. If Naruto has answered your objections convincingly, say so and concede.
- Cool, sharp, precise. Under 200 words per turn.
- End EVERY turn with exactly one final line:
  STATUS: CONTINUE   (open objections remain)
  STATUS: CONCEDE    (Naruto is right; the decision holds)
  STATUS: SETTLED    (you have shown decisively the decision is wrong; nothing more to argue)`,
  judge: `You are the Judge of a company debate panel. You listened to Naruto (supports the decision) and Sasuke (challenges it).
Rule on who is right based only on the quality of the arguments and evidence, not on who spoke more or more confidently.
Format (markdown, under 250 words):
## Verdict
## Strongest point from Naruto
## Strongest point from Sasuke
## What would change the ruling
## Recommendation (what the company should actually do)
End with exactly one final line: WINNER: NARUTO | WINNER: SASUKE | WINNER: SPLIT`,
};

let running = null;
export const isRunning = () => Boolean(running);

function context(debate) {
  const c = store.get().company;
  return `Company: ${c.name}. Mission: ${c.mission}. Priorities: ${c.priorities.join("; ")}.

DECISION UNDER DEBATE: ${debate.question}
${debate.context ? `\nBackground from the founder:\n${debate.context}\n` : ""}`;
}

function transcript(debate) {
  return debate.turns.map((t) => `### ${PANEL[t.who].name} (round ${t.round})\n${t.text}`).join("\n\n") || "(no arguments yet)";
}

export function startDebate({ question, context: ctx = "" }) {
  if (!question?.trim()) throw new Error("A decision/question to debate is required");
  if (running) throw new Error("A debate is already running");
  const debate = { id: crypto.randomUUID().slice(0, 8), question: question.trim(), context: String(ctx).trim(),
    at: new Date().toISOString(), status: "running", speaker: null, turns: [], verdict: null, error: null,
    mode: aiEnabled ? "ai" : "simulation" };
  store.update((s) => { (s.debates ||= []).unshift(debate); });
  store.log(`⚖️ Debate opened: “${debate.question}”`, null, "debate");
  running = run(debate).finally(() => { running = null; });
  return debate;
}

async function speak(debate, who, round, prompt) {
  store.update(() => { debate.speaker = who; });
  let text;
  if (aiEnabled) {
    text = await ask({ emp: PANEL[who], system: SYSTEM[who], prompt, maxTokens: 32000 });
  } else {
    await sleep(2500);
    text = simulated(who, round);
  }
  store.update(() => debate.turns.push({ who, round, text, at: new Date().toISOString() }));
  return text;
}

async function run(debate) {
  try {
    const base = context(debate);
    let status = "CONTINUE";
    for (let round = 1; round <= MAX_ROUNDS && status === "CONTINUE"; round++) {
      await speak(debate, "naruto", round, `${base}\nDebate so far:\n${transcript(debate)}\n\n${round === 1
        ? "Open the debate: make the case FOR this decision."
        : "Respond to Sasuke's latest objections."}`);
      const s = await speak(debate, "sasuke", round, `${base}\nDebate so far:\n${transcript(debate)}\n\nRound ${round} of at most ${MAX_ROUNDS}. Challenge the decision.${round === MAX_ROUNDS ? " This is the final round: if objections remain, state the single most important one." : ""}`);
      status = s.match(/STATUS:\s*(CONTINUE|CONCEDE|SETTLED)/i)?.[1]?.toUpperCase() ?? "CONTINUE";
    }
    const v = await speak(debate, "judge", 0, `${base}\nFull debate:\n${transcript(debate)}\n\nSasuke's final status: ${status}. Deliver your ruling.`);
    const winner = v.match(/WINNER:\s*(NARUTO|SASUKE|SPLIT)/i)?.[1]?.toLowerCase() ?? "split";
    store.update(() => Object.assign(debate, { verdict: { winner, text: v }, status: "done", speaker: "verdict", endedBy: status }));
    store.log(`⚖️ Verdict: ${winner === "split" ? "split decision" : `${PANEL[winner].name} is right`} — “${debate.question}”`, null, "debate");
    await sleep(6000); // let the gavel animation play, then everyone sits down
    store.update(() => { debate.speaker = null; });
  } catch (err) {
    store.update(() => Object.assign(debate, { status: "failed", error: String(err.message || err), speaker: null }));
    store.log(`⚖️ Debate failed: ${debate.error}`, null, "error");
  }
  return debate;
}

function simulated(who, round) {
  if (who === "naruto") return round === 1
    ? "_(simulation)_ This decision moves us toward our #1 priority. It's cheap to try, easy to reverse, and doing nothing has a cost too. Let's go!"
    : "_(simulation)_ Fair point — so we add a checkpoint after two weeks and a kill metric. The upside still beats the risk.";
  if (who === "sasuke") return round === 1
    ? "_(simulation)_ You haven't priced the opportunity cost. What does the team stop doing to make room for this?\n\nSTATUS: CONTINUE"
    : "_(simulation)_ The checkpoint answers my main objection. The decision holds.\n\nSTATUS: CONCEDE";
  return "## Verdict\n_(simulation)_ Naruto answered the opportunity-cost objection with a concrete checkpoint and kill metric.\n\n## Recommendation\nProceed, with a 2-week review.\n\nWINNER: NARUTO";
}
