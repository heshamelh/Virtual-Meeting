import fs from "node:fs";
import path from "node:path";
import { initialState, LEVELS } from "./seed.js";

const DATA_DIR = process.env.HQ_DATA_DIR || path.resolve("data");
const FILE = path.join(DATA_DIR, "state.json");
const MAX_FEED = 200;

let state;
let saveTimer = null;
const listeners = new Set();

export function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    state = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } else {
    state = initialState();
    saveNow();
  }
  // Interrupted work from a previous run can't resume; mark it so it can be retried.
  for (const t of state.tasks) if (t.status === "running" || t.status === "queued") t.status = "interrupted";
  return state;
}

export const get = () => state;

export function saveNow() {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

/** Mutate state, persist (debounced) and notify live clients. */
export function update(fn, event = "state") {
  fn(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
  for (const l of listeners) l(event);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function log(text, who = null, kind = "info") {
  update((s) => {
    s.feed.unshift({ at: new Date().toISOString(), who, text, kind });
    if (s.feed.length > MAX_FEED) s.feed.length = MAX_FEED;
  }, "feed");
}

export const employee = (id) => state.employees.find((e) => e.id === id);

export function levelFor(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  return cur;
}

/** Award XP; returns the new level object if the employee was promoted. */
export function awardXp(id, amount, reason) {
  const emp = employee(id);
  if (!emp) return null;
  let promoted = null;
  update(() => {
    emp.xp += amount;
    const lvl = levelFor(emp.xp);
    if (lvl.level > emp.level) {
      emp.level = lvl.level;
      promoted = lvl;
    }
  });
  if (promoted) log(`🎉 ${emp.name} promoted to L${promoted.level} ${promoted.title}!`, emp.id, "promotion");
  else if (reason) log(`+${amount} XP — ${reason}`, emp.id, "xp");
  return promoted;
}
