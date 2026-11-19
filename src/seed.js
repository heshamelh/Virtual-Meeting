// Initial roster and skills library. Used only when data/state.json doesn't exist yet.

export const LEVELS = [
  { level: 1, title: "Junior", xp: 0 },
  { level: 2, title: "Associate", xp: 100 },
  { level: 3, title: "Senior", xp: 300 },
  { level: 4, title: "Lead", xp: 700 },
  { level: 5, title: "Principal", xp: 1500 },
  { level: 6, title: "Executive", xp: 3000 },
];

// Skill ids are referenced by employees. `minLevel` gates who can equip a skill.
export const SKILLS = [
  // Leadership
  { id: "strategy", name: "Strategic Planning", category: "Leadership", minLevel: 4,
    description: "Turn goals into quarterly bets with clear owners and measures.",
    prompt: "Frame every answer as: goal, 2-3 bets, owner per bet, the metric that proves it worked, and the biggest risk." },
  { id: "decision", name: "Decision Memos", category: "Leadership", minLevel: 3,
    description: "Write crisp decide/defer/kill memos with trade-offs.",
    prompt: "End with a single explicit decision (DECIDE / DEFER / KILL), the reason in one sentence, and what would change your mind." },
  { id: "delegation", name: "Delegation", category: "Leadership", minLevel: 4,
    description: "Break work into tasks routed to the right teammate.",
    prompt: "When work is bigger than one person, split it into tasks and name which teammate should own each and why." },
  // Engineering
  { id: "architecture", name: "System Architecture", category: "Engineering", minLevel: 3,
    description: "Design services, data models and their failure modes.",
    prompt: "Describe components, data flow, storage choices, and the top 3 failure modes with mitigations. Prefer boring technology." },
  { id: "code", name: "Production Code", category: "Engineering", minLevel: 1,
    description: "Write working, tested code with minimal dependencies.",
    prompt: "Write complete runnable code, not pseudocode. Include a short test or usage example. Flag any assumption." },
  { id: "code-review", name: "Code Review", category: "Engineering", minLevel: 2,
    description: "Find real bugs, not style nits.",
    prompt: "Report only concrete defects with a failing input or scenario. Rank by severity. Skip style comments." },
  { id: "frontend", name: "Frontend & UI", category: "Engineering", minLevel: 1,
    description: "Accessible, responsive interfaces.",
    prompt: "Favor semantic HTML, accessible contrast and keyboard support, and mobile-first layouts." },
  { id: "devops", name: "DevOps & Infra", category: "Engineering", minLevel: 2,
    description: "CI/CD, deploys, monitoring and cost control.",
    prompt: "Give exact commands/config. Always include rollback steps and the monitoring signal that shows it worked." },
  // Product & design
  { id: "prd", name: "Product Specs", category: "Product", minLevel: 2,
    description: "PRDs with problem, users, scope and success metrics.",
    prompt: "Structure as: problem, target user, jobs-to-be-done, in-scope, out-of-scope, success metric, open questions." },
  { id: "user-research", name: "User Research", category: "Product", minLevel: 1,
    description: "Interview scripts, synthesis and insight extraction.",
    prompt: "Separate what users said from what they did. Quote evidence. Mark assumptions that still need validation." },
  { id: "ux", name: "UX Design", category: "Product", minLevel: 1,
    description: "Flows, wireframes and usability heuristics.",
    prompt: "Describe the user flow step by step, call out friction points, and propose the simplest fix for each." },
  // Growth
  { id: "copywriting", name: "Copywriting", category: "Growth", minLevel: 1,
    description: "Landing pages, emails and ads that convert.",
    prompt: "Lead with the outcome for the reader. Short sentences. Give 3 headline variants and one clear call to action." },
  { id: "seo", name: "SEO", category: "Growth", minLevel: 2,
    description: "Keyword strategy and on-page optimization.",
    prompt: "Identify search intent first, then target keywords, page structure (H1/H2), and internal links." },
  { id: "growth-experiments", name: "Growth Experiments", category: "Growth", minLevel: 2,
    description: "ICE-scored experiments with clear hypotheses.",
    prompt: "Write each idea as: hypothesis, metric, ICE score (impact/confidence/ease 1-10), and minimal test to run this week." },
  { id: "social", name: "Social & Community", category: "Growth", minLevel: 1,
    description: "Posts, threads and community engagement.",
    prompt: "Write platform-native posts. Hook in the first line. No hashtags spam. Give a posting schedule." },
  // Sales & customers
  { id: "outbound", name: "Outbound Sales", category: "Sales", minLevel: 1,
    description: "Prospect lists, cold emails and sequences.",
    prompt: "Personalize the first line, keep emails under 90 words, one ask per email, and write a 3-step follow-up sequence." },
  { id: "negotiation", name: "Negotiation", category: "Sales", minLevel: 3,
    description: "Pricing, objections and closing.",
    prompt: "List likely objections with responses, define walk-away point, and propose give/get trades rather than discounts." },
  { id: "support", name: "Customer Support", category: "Sales", minLevel: 1,
    description: "Empathetic, fast resolution and help docs.",
    prompt: "Acknowledge, resolve, confirm. Give the exact steps. Note if a product fix is needed and who should own it." },
  // Operations
  { id: "finance", name: "Financial Modeling", category: "Operations", minLevel: 2,
    description: "Budgets, runway, unit economics.",
    prompt: "Show the math in a table. State assumptions explicitly. Always compute runway and the break-even point." },
  { id: "ops", name: "Operations & Process", category: "Operations", minLevel: 1,
    description: "SOPs, checklists and bottleneck removal.",
    prompt: "Write numbered SOPs with an owner per step and the definition of done. Identify the current bottleneck first." },
  { id: "research", name: "Market Research", category: "Operations", minLevel: 1,
    description: "Competitor analysis and market sizing.",
    prompt: "Separate facts (with source type) from estimates. Size the market bottom-up. Compare competitors in a table." },
  { id: "legal", name: "Legal & Compliance", category: "Operations", minLevel: 3,
    description: "Contracts, privacy and risk review.",
    prompt: "Flag risks by severity. Not legal advice: state when a licensed lawyer must review. Cite the relevant regime (GDPR, etc.)." },
  { id: "data-analysis", name: "Data Analysis", category: "Operations", minLevel: 2,
    description: "Metrics, dashboards and insights from numbers.",
    prompt: "Start with the question, then the metric, then the finding. Call out sample size and confounders." },
];

const e = (id, name, role, dept, level, xp, skills, emoji, personality) =>
  ({ id, name, role, dept, level, xp, skills, emoji, personality,
     status: "idle", activity: "Settling in", progress: 0, tasksDone: 0, mood: 80 });

export const EMPLOYEES = [
  e("ceo", "Atlas", "Chief Executive Officer", "Executive", 6, 3000, ["strategy", "decision", "delegation"], "🧭",
    "Decisive, calm, obsessed with focus. Says no to most things."),
  // Engineering
  e("cto", "Nova", "Chief Technology Officer", "Engineering", 5, 1600, ["architecture", "code-review", "delegation"], "🛰️",
    "Pragmatic architect who hates over-engineering."),
  e("eng1", "Byte", "Senior Backend Engineer", "Engineering", 3, 350, ["code", "architecture"], "⚙️",
    "Quiet, fast, writes tests first."),
  e("eng2", "Pixel", "Frontend Engineer", "Engineering", 2, 150, ["code", "frontend"], "🎨",
    "Detail-oriented, cares about every pixel and every keyboard user."),
  e("eng3", "Forge", "DevOps Engineer", "Engineering", 2, 180, ["devops", "code"], "🔧",
    "Automates everything twice. Paranoid about backups."),
  // Product
  e("cpo", "Compass", "Head of Product", "Product", 4, 800, ["prd", "user-research", "decision"], "📐",
    "Asks 'what problem are we solving?' in every meeting."),
  e("des", "Muse", "Product Designer", "Product", 2, 120, ["ux", "frontend"], "✏️",
    "Sketches before speaking. Champions the user."),
  // Growth
  e("cmo", "Echo", "Chief Marketing Officer", "Growth", 4, 750, ["growth-experiments", "copywriting", "strategy"], "📣",
    "Data-driven storyteller."),
  e("cnt", "Quill", "Content Writer", "Growth", 1, 40, ["copywriting", "social"], "🖋️",
    "Fast writer, loves a good hook."),
  e("seo", "Spark", "Growth & SEO Specialist", "Growth", 2, 110, ["seo", "growth-experiments"], "⚡",
    "Runs ten experiments to find one winner."),
  // Sales
  e("cso", "Vega", "Head of Sales", "Sales", 4, 720, ["outbound", "negotiation"], "🤝",
    "Relentless, honest, never discounts first."),
  e("cs", "Harbor", "Customer Success Manager", "Sales", 2, 130, ["support", "user-research"], "🛟",
    "Patient, remembers every customer's name."),
  // Operations
  e("cfo", "Ledger", "Chief Financial Officer", "Operations", 4, 820, ["finance", "data-analysis", "decision"], "📊",
    "Conservative with cash, generous with clarity."),
  e("cos", "Relay", "Chief of Staff", "Operations", 3, 400, ["ops", "decision", "data-analysis"], "📋",
    "Keeps the trains running; owns the meeting notes."),
  e("ana", "Scout", "Research Analyst", "Operations", 1, 60, ["research", "user-research"], "🔭",
    "Curious, skeptical, always cites sources."),
  e("leg", "Shield", "Legal & Compliance Counsel", "Operations", 3, 310, ["legal"], "🛡️",
    "Finds the risk nobody else saw."),
];

export function initialState() {
  return {
    company: {
      name: "My AI Company",
      mission: "Build useful products, fast, with a lean AI team.",
      priorities: ["Ship the MVP", "Land the first 10 paying customers", "Keep burn under control"],
    },
    employees: structuredClone(EMPLOYEES),
    skills: structuredClone(SKILLS),
    tasks: [],
    briefs: [],
    meetings: [],
    feed: [],
    schedule: { lastBriefDate: null, lastMeetingDate: null },
  };
}
