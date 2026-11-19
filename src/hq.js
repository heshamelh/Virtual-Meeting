// Company operations: tasks, morning brief, Sunday meeting, ambient office life, scheduler.
import crypto from "node:crypto";
import * as store from "./store.js";
import { ask, aiEnabled, personaPrompt } from "./ai.js";

const XP = { task: 25, brief: 10, meeting: 15, employeeOfWeek: 50 };
const id = () => crypto.randomUUID().slice(0, 8);
const today = (d = new Date()) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local TZ
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- tasks

export function createTask({ employeeId, title, details = "", source = "founder", run = true }) {
  const emp = store.employee(employeeId);
  if (!emp) throw new Error(`Unknown employee: ${employeeId}`);
  if (!title?.trim()) throw new Error("Task title is required");
  const task = {
    id: id(), employeeId, title: title.trim(), details: details.trim(), source,
    status: run ? "queued" : "backlog", createdAt: new Date().toISOString(),
    startedAt: null, finishedAt: null, result: null, error: null,
  };
  store.update((s) => s.tasks.unshift(task));
  store.log(`New task for ${emp.name}: “${task.title}”`, emp.id, "task");
  if (run) pump(employeeId);
  return task;
}

export function runTask(taskId) {
  const t = store.get().tasks.find((x) => x.id === taskId);
  if (!t) throw new Error("Task not found");
  if (["queued", "running"].includes(t.status)) return t;
  store.update(() => Object.assign(t, { status: "queued", error: null, result: null }));
  pump(t.employeeId);
  return t;
}

const busy = new Set();

/** Each employee works one task at a time, FIFO. */
async function pump(employeeId) {
  if (busy.has(employeeId)) return;
  const next = [...store.get().tasks].reverse().find((t) => t.employeeId === employeeId && t.status === "queued");
  if (!next) return;
  busy.add(employeeId);
  try {
    await execute(next);
  } finally {
    busy.delete(employeeId);
    const emp = store.employee(employeeId);
    store.update(() => Object.assign(emp, { status: "idle", activity: "Done — ready for the next task", progress: 0, real: false }));
    pump(employeeId);
  }
}

async function execute(task) {
  const s = store.get();
  const emp = store.employee(task.employeeId);
  store.update(() => {
    Object.assign(task, { status: "running", startedAt: new Date().toISOString() });
    Object.assign(emp, { status: "working", activity: task.title, progress: 5, real: true });
  });
  // Visual progress while waiting on the model (the API doesn't report % done; this is an estimate).
  const ticker = setInterval(() => store.update(() => { emp.progress = Math.min(92, emp.progress + 4 + Math.random() * 6); }), 1500);
  try {
    let result;
    if (aiEnabled) {
      const roster = s.employees.filter((x) => x.id !== emp.id);
      result = await ask({
        system: personaPrompt(s.company, emp, s.skills, roster),
        prompt: `Task from ${task.source}: ${task.title}\n\n${task.details || "(no extra details)"}`,
      });
    } else {
      await sleep(6000 + Math.random() * 6000);
      result = simulatedTaskResult(emp, task, s.skills);
    }
    store.update(() => {
      Object.assign(task, { status: "done", result, finishedAt: new Date().toISOString() });
      emp.tasksDone += 1;
      emp.progress = 100;
    });
    store.log(`✅ ${emp.name} finished “${task.title}”`, emp.id, "done");
    store.awardXp(emp.id, XP.task, `completed “${task.title}”`);
  } catch (err) {
    store.update(() => Object.assign(task, { status: "failed", error: String(err.message || err), finishedAt: new Date().toISOString() }));
    store.log(`❌ ${emp.name} failed “${task.title}”: ${task.error}`, emp.id, "error");
  } finally {
    clearInterval(ticker);
  }
}

function simulatedTaskResult(emp, task, skills) {
  const used = skills.filter((s) => emp.skills.includes(s.id)).map((s) => s.name);
  return `## ${task.title}

_Simulation mode — set \`ANTHROPIC_API_KEY\` to get real work from ${emp.name}._

**Owner:** ${emp.name} (${emp.role})
**Skills applied:** ${used.join(", ") || "none"}

### What a real run would deliver
1. The finished work product for: ${task.title}
2. Assumptions and open questions
3. Hand-offs to teammates where needed`;
}

// ---------------------------------------------------------------- shared context

function weekTasks(days = 7) {
  const since = Date.now() - days * 864e5;
  return store.get().tasks.filter((t) => t.finishedAt && Date.parse(t.finishedAt) >= since);
}

function snapshot(tasks) {
  const s = store.get();
  return s.employees.map((e) => {
    const done = tasks.filter((t) => t.employeeId === e.id && t.status === "done").map((t) => t.title);
    const failed = tasks.filter((t) => t.employeeId === e.id && t.status === "failed").map((t) => t.title);
    const open = s.tasks.filter((t) => t.employeeId === e.id && ["queued", "running", "backlog", "interrupted"].includes(t.status)).map((t) => t.title);
    return `- ${e.name} [id=${e.id}] (${e.role}, L${e.level}, ${e.xp} XP): done=${JSON.stringify(done)} failed=${JSON.stringify(failed)} open=${JSON.stringify(open)}`;
  }).join("\n");
}

function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function setEveryone(status, activity) {
  store.update((s) => s.employees.forEach((e) => { if (!e.real) Object.assign(e, { status, activity }); }));
}

// ---------------------------------------------------------------- morning brief

let briefRunning = false;
export async function runMorningBrief() {
  if (briefRunning) throw new Error("Morning brief already running");
  briefRunning = true;
  const s = store.get();
  const ceo = store.employee("ceo");
  store.log("☀️ Morning brief started", "ceo", "brief");
  setEveryone("meeting", "Morning brief");
  try {
    const recent = weekTasks(1);
    let body;
    if (aiEnabled) {
      body = await ask({
        system: personaPrompt(s.company, ceo, s.skills, s.employees.filter((e) => e.id !== "ceo")),
        prompt: `Write today's morning brief (${today()}) for the founder and the whole team.

Team status (last 24h):
${snapshot(recent)}

Format (markdown, under 350 words):
# Morning Brief — <date>
## TL;DR (3 bullets max)
## Yesterday's wins
## Today's focus by department (Engineering, Product, Growth, Sales, Operations) — one line each, name the owner
## Risks & blockers
## Founder decisions needed (or "None")
Base everything on the status above; if there's little activity, say so plainly and propose the single most important thing to do today.`,
      });
    } else {
      body = simulatedBrief(s, recent);
    }
    const brief = { id: id(), date: today(), at: new Date().toISOString(), body, mode: aiEnabled ? "ai" : "simulation" };
    store.update((st) => { st.briefs.unshift(brief); st.schedule.lastBriefDate = brief.date; });
    store.log("☀️ Morning brief published", "ceo", "brief");
    s.employees.forEach((e) => store.awardXp(e.id, XP.brief, null));
    return brief;
  } finally {
    briefRunning = false;
    setEveryone("idle", "Back at desk");
  }
}

function simulatedBrief(s, recent) {
  const done = recent.filter((t) => t.status === "done");
  const byDept = {};
  for (const e of s.employees) (byDept[e.dept] ||= []).push(e);
  return `# Morning Brief — ${today()}
_Simulation mode — add an API key for an AI-written brief._

## TL;DR
- ${done.length} task(s) completed in the last 24h.
- Top priority: **${s.company.priorities[0] ?? "set company priorities"}**.
- ${s.tasks.filter((t) => t.status === "backlog").length} item(s) in backlog.

## Yesterday's wins
${done.length ? done.map((t) => `- ${store.employee(t.employeeId)?.name}: ${t.title}`).join("\n") : "- No completed tasks. Assign work from the Office Board."}

## Today's focus by department
${Object.entries(byDept).filter(([d]) => d !== "Executive").map(([d, list]) => `- **${d}** — ${list[0].name} leads; push on “${s.company.priorities[0] ?? "priorities"}”.`).join("\n")}

## Risks & blockers
${s.tasks.filter((t) => t.status === "failed").map((t) => `- Failed: ${t.title}`).join("\n") || "- None reported."}

## Founder decisions needed
- None.`;
}

// ---------------------------------------------------------------- Sunday meeting

let meetingRunning = false;
export async function runSundayMeeting() {
  if (meetingRunning) throw new Error("Sunday meeting already running");
  meetingRunning = true;
  const s = store.get();
  const ceo = store.employee("ceo");
  store.log("🗓️ Sunday all-hands started", "ceo", "meeting");
  setEveryone("meeting", "Sunday all-hands");
  try {
    const week = weekTasks(7);
    let body, data;
    if (aiEnabled) {
      body = await ask({
        system: personaPrompt(s.company, ceo, s.skills, s.employees.filter((e) => e.id !== "ceo")),
        prompt: `Run the weekly Sunday all-hands meeting (${today()}) and write the minutes.
You chair. Each department head speaks for their team, using the real data below; do not invent completed work.

This week's data:
${snapshot(week)}

Current priorities: ${s.company.priorities.join("; ")}

Minutes format (markdown):
# Sunday All-Hands — <date>
## Scorecard (table: person, done, failed, open)
## Department updates (Engineering — Nova, Product — Compass, Growth — Echo, Sales — Vega, Operations — Ledger): 2-3 lines each, in their voice
## What went wrong & why
## Decisions (DECIDE / DEFER / KILL)
## Priorities for next week (max 3)
## Action items (owner — task)
## Employee of the week (and why, based on the data)

Then end with a fenced json block exactly like:
\`\`\`json
{"priorities": ["..."], "actionItems": [{"owner": "<employee id>", "title": "...", "details": "..."}], "employeeOfWeek": "<employee id>"}
\`\`\`
Use only these employee ids: ${s.employees.map((e) => e.id).join(", ")}. 3-8 action items.`,
      });
      data = extractJson(body);
      body = body.replace(/```json[\s\S]*?```/, "").trim();
    } else {
      ({ body, data } = simulatedMeeting(s, week));
    }

    const created = [];
    if (data?.actionItems?.length) {
      for (const a of data.actionItems.slice(0, 10)) {
        if (!store.employee(a.owner) || !a.title) continue;
        created.push(createTask({ employeeId: a.owner, title: a.title, details: a.details || "", source: "Sunday meeting", run: false }).id);
      }
    }
    if (Array.isArray(data?.priorities) && data.priorities.length) {
      store.update((st) => { st.company.priorities = data.priorities.slice(0, 3).map(String); });
    }
    const meeting = { id: id(), date: today(), at: new Date().toISOString(), body, actionTaskIds: created,
      employeeOfWeek: store.employee(data?.employeeOfWeek)?.id ?? null, mode: aiEnabled ? "ai" : "simulation" };
    store.update((st) => { st.meetings.unshift(meeting); st.schedule.lastMeetingDate = meeting.date; });
    s.employees.forEach((e) => store.awardXp(e.id, XP.meeting, null));
    if (meeting.employeeOfWeek) {
      const eow = store.employee(meeting.employeeOfWeek);
      store.log(`🏆 Employee of the week: ${eow.name}`, eow.id, "promotion");
      store.awardXp(eow.id, XP.employeeOfWeek, "employee of the week");
    }
    store.log(`🗓️ Sunday all-hands done — ${created.length} action item(s) added to backlog`, "ceo", "meeting");
    return meeting;
  } finally {
    meetingRunning = false;
    setEveryone("idle", "Back at desk");
  }
}

function simulatedMeeting(s, week) {
  const rows = s.employees.map((e) => {
    const mine = week.filter((t) => t.employeeId === e.id);
    return { e, done: mine.filter((t) => t.status === "done").length, failed: mine.filter((t) => t.status === "failed").length };
  });
  const top = [...rows].sort((a, b) => b.done - a.done)[0];
  const body = `# Sunday All-Hands — ${today()}
_Simulation mode — add an API key for AI-run meetings._

## Scorecard
| Person | Done | Failed |
|---|---|---|
${rows.map((r) => `| ${r.e.name} | ${r.done} | ${r.failed} |`).join("\n")}

## Priorities for next week
${s.company.priorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Action items
- Nova — Review engineering backlog
- Echo — Draft next week's growth experiment
- Ledger — Update runway model

## Employee of the week
${top.done ? `${top.e.name} (${top.done} tasks done)` : "No tasks completed this week."}`;
  const data = {
    actionItems: [
      { owner: "cto", title: "Review engineering backlog" },
      { owner: "cmo", title: "Draft next week's growth experiment" },
      { owner: "cfo", title: "Update runway model" },
    ],
    employeeOfWeek: top.done ? top.e.id : null,
  };
  return { body, data };
}

// ---------------------------------------------------------------- skills & levels

export function equipSkill(employeeId, skillId, on) {
  const emp = store.employee(employeeId);
  const skill = store.get().skills.find((x) => x.id === skillId);
  if (!emp || !skill) throw new Error("Unknown employee or skill");
  if (on) {
    if (emp.level < skill.minLevel) throw new Error(`${skill.name} needs L${skill.minLevel}; ${emp.name} is L${emp.level}`);
    if (emp.skills.length >= emp.level + 2) throw new Error(`${emp.name} can hold ${emp.level + 2} skills at L${emp.level}`);
    if (!emp.skills.includes(skillId)) store.update(() => emp.skills.push(skillId));
    store.log(`${emp.name} learned ${skill.name}`, emp.id, "skill");
  } else {
    store.update(() => { emp.skills = emp.skills.filter((x) => x !== skillId); });
  }
  return emp;
}

export function upsertSkill(input) {
  const { name, category, description, prompt } = input;
  if (!name?.trim() || !prompt?.trim()) throw new Error("Skill needs a name and instructions");
  const sid = input.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const skill = { id: sid, name: name.trim(), category: category?.trim() || "Custom",
    minLevel: Math.max(1, Math.min(6, Number(input.minLevel) || 1)),
    description: description?.trim() || "", prompt: prompt.trim() };
  store.update((s) => {
    const i = s.skills.findIndex((x) => x.id === sid);
    if (i >= 0) s.skills[i] = skill; else s.skills.push(skill);
  });
  return skill;
}

// ---------------------------------------------------------------- ambient office life

const AMBIENT = {
  Executive: ["Reviewing company metrics", "1:1 with Nova", "Thinking about strategy", "Reading the backlog"],
  Engineering: ["Reviewing a pull request", "Refactoring", "Pairing with Byte", "Reading logs", "Writing tests"],
  Product: ["Sketching a flow", "Reading user feedback", "Updating the roadmap", "Grooming the backlog"],
  Growth: ["Checking analytics", "Drafting copy", "Brainstorming hooks", "Reviewing campaign results"],
  Sales: ["Reviewing pipeline", "Updating CRM notes", "Prepping a demo", "Answering a customer"],
  Operations: ["Reconciling the books", "Updating SOPs", "Reading a contract", "Researching competitors"],
};
const AMBIENT_STATUS = ["focus", "focus", "focus", "idle", "break", "meeting"];

export function startAmbient(ms = 5000) {
  if (process.env.HQ_AMBIENT === "0") return;
  setInterval(() => {
    const free = store.get().employees.filter((e) => !e.real && e.status !== "working");
    if (!free.length || briefRunning || meetingRunning) return;
    const e = free[Math.floor(Math.random() * free.length)];
    const status = AMBIENT_STATUS[Math.floor(Math.random() * AMBIENT_STATUS.length)];
    const pool = status === "break" ? ["Coffee break", "Stretching"] : AMBIENT[e.dept] || ["Working"];
    store.update(() => Object.assign(e, { status, activity: pool[Math.floor(Math.random() * pool.length)] }), "ambient");
  }, ms);
}

// ---------------------------------------------------------------- scheduler

const BRIEF_TIME = process.env.HQ_BRIEF_TIME || "08:00";
const MEETING_TIME = process.env.HQ_MEETING_TIME || "10:00";
const MEETING_DAY = Number(process.env.HQ_MEETING_DAY ?? 0); // 0 = Sunday

export const scheduleInfo = () => ({ briefTime: BRIEF_TIME, meetingTime: MEETING_TIME, meetingDay: MEETING_DAY,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });

const hhmm = (d) => d.toTimeString().slice(0, 5);

export function startScheduler() {
  // One automatic attempt per day each, so a failing API call can't loop and burn money.
  const attempted = { brief: null, meeting: null };
  const tick = () => {
    const now = new Date();
    const sch = store.get().schedule;
    if (hhmm(now) >= BRIEF_TIME && sch.lastBriefDate !== today(now) && attempted.brief !== today(now) && !briefRunning) {
      attempted.brief = today(now);
      runMorningBrief().catch((e) => store.log(`Morning brief failed: ${e.message}`, "ceo", "error"));
    }
    if (now.getDay() === MEETING_DAY && hhmm(now) >= MEETING_TIME && sch.lastMeetingDate !== today(now) && attempted.meeting !== today(now) && !meetingRunning) {
      attempted.meeting = today(now);
      runSundayMeeting().catch((e) => store.log(`Sunday meeting failed: ${e.message}`, "ceo", "error"));
    }
  };
  setTimeout(tick, 3000);
  setInterval(tick, 30_000);
}
