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
| **CEO + 15 employees** | Atlas (CEO) plus 15 people across Engineering, Product, Growth, Sales and Ops. Each one has a role, personality, level, XP and equipped skills (`src/seed.js`). |
| **Live office board** | Server-sent events push state to every open browser. A desk with a green pulsing dot means real work on a Claude call. Grey italic text is *ambient* filler so the office doesn't look dead. Turn it off with `HQ_AMBIENT=0`. |
| **Tasks** | Assign a task to anyone. They run it with Claude, using their persona and skills as the system prompt. Each employee works one task at a time; extra tasks queue. |
| **Morning brief** | Runs daily at `HQ_BRIEF_TIME` (default 08:00). The CEO writes a TL;DR, wins, focus by department, risks and decisions needed, all based on real task data. |
| **Sunday meeting** | Runs every `HQ_MEETING_DAY` (0 = Sunday) at `HQ_MEETING_TIME` (default 10:00). It produces a scorecard, department updates, decisions, next week's priorities, action items and employee of the week. Action items go to the **backlog**. They don't run automatically, so cost stays under your control. The meeting also rewrites the company priorities. |
| **Levels** | L1 Junior → L6 Executive (thresholds at 0/100/300/700/1500/3000 XP). XP comes from tasks (+25), briefs (+10), meetings (+15) and employee of the week (+50). Skill slots = level + 2. |
| **Skills library** | 23 built-in skills. Each one is a block of instructions injected into the employee's prompt and has a minimum level. Add your own in the UI, then teach them to employees in their profile. |

## Config (env vars)

| Var | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables real AI work |
| `HQ_MODEL` | `claude-opus-5-5` | Claude model |
| `HQ_EFFORT` | `medium` | `low` / `medium` / `high` / `xhigh` / `max` |
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
