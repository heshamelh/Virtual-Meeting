# 🏢 AI Company HQ

A CEO and 15 AI employees running as Claude agents. You get a live office board, a daily morning brief, a weekly Sunday all-hands, and levels with a skills library.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # optional: without it the app runs in simulation mode
npm start                             # http://127.0.0.1:3000
```

## What's inside

| Feature | How it works |
|---|---|
| **CEO + 15 employees** | Atlas (CEO) plus 15 people across Engineering, Product, Growth, Sales and Ops. Each one has a role, personality, level, XP and equipped skills (`src/seed.js`). The CEO runs on **Claude Fable 5.2** (high effort); the team runs on Claude Opus 5.5. |
| **Live office board** | Server-sent events push state to every open browser. Every employee sits at an animated desk. While they're on a real Claude call they type, their monitor scrolls code and their coffee steams. When idle they sit still with the monitor off. Animation only means real work. Optional ambient filler activity: `HQ_AMBIENT=1`. |
| **Tasks** | Assign a task to anyone. They run it with Claude, using their persona and skills as the system prompt. Each employee works one task at a time; extra tasks queue. |
| **Morning brief** | Runs daily at `HQ_BRIEF_TIME` (default 08:00). The CEO writes a TL;DR, wins, focus by department, risks and decisions needed, all based on real task data. |
| **Sunday meeting** | Runs every `HQ_MEETING_DAY` (0 = Sunday) at `HQ_MEETING_TIME` (default 10:00). It produces a scorecard, department updates, decisions, next week's priorities, action items and employee of the week. Action items go to the **backlog**. They don't run automatically, so cost stays under your control. The meeting also rewrites the company priorities. |
| **Levels** | L1 Junior → L6 Executive (thresholds at 0/100/300/700/1500/3000 XP). XP comes from tasks (+25), briefs (+10), meetings (+15) and employee of the week (+50). Skill slots = level + 2. |
| **Skills library** | 23 built-in skills. Each one is a block of instructions injected into the employee's prompt and has a minimum level. Add your own in the UI, then teach them to employees in their profile. |

## ⚖️ Debate panel (on demand only)
Three people who exist only to argue about one decision. They're not on the schedule and have no UI button. They run when you ask:

```bash
npm run debate -- "Should we launch the paid plan next week?" --context "40 beta users, 6 asked about pricing"
```

- **Naruto** (Opus 5.5) always supports the decision and makes the strongest honest case for it.
- **Sasuke** (Opus 5.5) challenges it round after round, up to `HQ_DEBATE_ROUNDS` (default 3). He stops when it's clear who's right, and he can concede.
- **Judge** (Fable 5.2) rules NARUTO, SASUKE or SPLIT and says what the company should actually do.

If the HQ server is running, watch it live in the **Debate Room** tab. Whoever is speaking animates, and the gavel bangs on the verdict. If the server isn't running, the debate runs standalone and is saved anyway. The characters are original designs, not the anime's.

## Config (env vars)

| Var | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables real AI work |
| `HQ_MODEL` | `claude-opus-5-5` | Claude model |
| `HQ_EFFORT` | `medium` | `low` / `medium` / `high` / `xhigh` / `max` |
| `HQ_CEO_MODEL` | `claude-fable-5-2` | CEO model ($8/$40 per MTok vs $4/$20 for Opus 5.5) |
| `HQ_CEO_EFFORT` | `high` | Anthropic's recommended starting effort for Fable 5.2 |
| `HQ_JUDGE_MODEL` / `HQ_DEBATE_MODEL` | Fable 5.2 / Opus 5.5 | Debate panel models |
| `HQ_DEBATE_ROUNDS` | `3` | Max Naruto↔Sasuke rounds (1–5) |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | |
| `HQ_TOKEN` | — | **Set this before exposing beyond localhost.** Without it, anyone who can reach the server can spend your API credits. |
| `TZ` | system | Timezone for the schedule, e.g. `TZ=Africa/Cairo` |
| `HQ_DATA_DIR` | `./data` | State is saved to `state.json` |

## Cost notes
- 1 call per task, 1 per morning brief, 1 per Sunday meeting. There is no per-employee fan-out.
- If the server starts after the brief time and today's brief hasn't run yet, it runs immediately.
- Automatic runs are attempted at most once per day, so a failing API can't retry in a loop.

## Dev
`npm test` runs roster, skill gating, level-up and brief/meeting tests in simulation mode.
