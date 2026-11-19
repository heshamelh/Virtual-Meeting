import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.HQ_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hq-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
const store = await import("../src/store.js");
const hq = await import("../src/hq.js");
store.load();

test("roster is CEO + 15", () => {
  const s = store.get();
  assert.equal(s.employees.length, 16);
  assert.equal(s.employees.filter((e) => e.id === "ceo").length, 1);
});

test("every employee skill exists in the library and respects level", () => {
  const s = store.get();
  for (const e of s.employees) for (const id of e.skills) {
    const sk = s.skills.find((x) => x.id === id);
    assert.ok(sk, `${e.name} has unknown skill ${id}`);
    assert.ok(e.level >= sk.minLevel, `${e.name} L${e.level} < ${sk.name} L${sk.minLevel}`);
  }
});

test("XP promotes across level thresholds", () => {
  const e = store.employee("cnt");
  const before = e.level;
  const promoted = store.awardXp("cnt", 100, "test");
  assert.ok(promoted);
  assert.equal(e.level, before + 1);
});

test("skill gating: level and slot limits", () => {
  assert.throws(() => hq.equipSkill("ana", "strategy", true), /needs L4/);
  const e = store.employee("ana"); // L1 => 3 slots, has 2
  hq.equipSkill("ana", "ops", true);
  assert.throws(() => hq.equipSkill("ana", "support", true), /can hold/);
  hq.equipSkill("ana", "ops", false);
  assert.ok(!e.skills.includes("ops"));
});

test("morning brief and sunday meeting run in simulation mode", async () => {
  const b = await hq.runMorningBrief();
  assert.match(b.body, /Morning Brief/);
  const m = await hq.runSundayMeeting();
  assert.match(m.body, /Sunday All-Hands/);
  assert.equal(m.actionTaskIds.length, 3);
  assert.ok(store.get().tasks.filter((t) => t.status === "backlog").length >= 3);
});

test("CEO runs on Fable 5.2 at high effort; team on Opus 5.5", async () => {
  const { modelFor } = await import("../src/ai.js");
  assert.deepEqual(modelFor(store.employee("ceo")), { model: "claude-fable-5-2", effort: "high" });
  assert.equal(modelFor(store.employee("eng1")).model, "claude-opus-5-5");
});
