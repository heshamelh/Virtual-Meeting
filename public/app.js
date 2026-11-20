// AI Company HQ — client. No framework, no build step.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let S = null;            // latest server state
let token = localStorage.getItem("hqToken") || "";
const ui = { taskFilter: "all", briefId: null, meetingId: null, empOpen: null, skillQuery: "" };
const DEPT_ORDER = ["Executive", "Engineering", "Product", "Growth", "Sales", "Operations"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ------------------------------------------------------------ api

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json", "x-hq-token": token }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { askToken(); throw new Error("Unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function askToken() {
  const t = prompt("This HQ is protected. Enter the HQ token:");
  if (t) { token = t; localStorage.setItem("hqToken", t); connect(); }
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3000);
}
const act = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast("⚠️ " + e.message); } };

// ------------------------------------------------------------ live stream

let es;
function connect() {
  es?.close();
  es = new EventSource("/api/stream" + (token ? `?token=${encodeURIComponent(token)}` : ""));
  es.onmessage = (ev) => { S = JSON.parse(ev.data); render(); setLive(true); };
  es.onerror = async () => {
    setLive(false);
    const r = await fetch("/api/state", { headers: { "x-hq-token": token } }).catch(() => null);
    if (r?.status === 401) { es.close(); askToken(); }
  };
}
const setLive = (on) => { const b = $("#live"); b.textContent = on ? "● live" : "○ reconnecting"; b.className = "badge " + (on ? "live" : "off"); };

// ------------------------------------------------------------ markdown (small, safe subset)

function md(src) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>");
  const lines = String(src || "").split("\n");
  let out = "", list = null, i = 0;
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("```")) {
      close(); const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      out += `<pre><code>${esc(buf.join("\n"))}</code></pre>`; i++; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      close();
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      out += "<table><thead><tr>" + cells(l).map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) out += "<tr>" + cells(lines[i++]).map((c) => `<td>${c}</td>`).join("") + "</tr>";
      out += "</tbody></table>"; continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { close(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (list !== "ul") { close(); out += "<ul>"; list = "ul"; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); out += "<ol>"; list = "ol"; } out += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) close();
    else { close(); out += `<p>${inline(l)}</p>`; }
    i++;
  }
  close();
  return out;
}

// ------------------------------------------------------------ helpers

const emp = (id) => S.employees.find((e) => e.id === id);
const levelTitle = (n) => S.levels.find((l) => l.level === n)?.title ?? "";
function xpProgress(e) {
  const cur = S.levels.find((l) => l.level === e.level), next = S.levels.find((l) => l.level === e.level + 1);
  if (!next) return { pct: 100, label: "Max level" };
  return { pct: Math.min(100, ((e.xp - cur.xp) / (next.xp - cur.xp)) * 100), label: `${e.xp} / ${next.xp} XP → L${next.level}` };
}
const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// ------------------------------------------------------------ render

function render() {
  if (!S) return;
  $("#company-name").textContent = S.company.name;
  $("#company-mission").textContent = S.company.mission;
  document.title = `${S.company.name} · HQ`;
  $("#ai-badge").textContent = S.ai.enabled ? `🤖 ${S.ai.model}` : "🧪 simulation mode";
  renderOffice(); renderTasks(); renderDocs("brief"); renderDocs("meeting"); renderTeam(); renderSkills(); renderSettings(); renderDebate(); voice.renderRoster();
  // Don't clobber what the user is typing/choosing inside the dialog.
  const typing = $("#emp-dialog").contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (ui.empOpen && !typing) renderEmp(ui.empOpen);
}

function renderOffice() {
  const working = S.employees.filter((e) => e.status === "working").length;
  const queued = S.tasks.filter((t) => t.status === "queued").length;
  const done = S.tasks.filter((t) => t.status === "done").length;
  const backlog = S.tasks.filter((t) => t.status === "backlog").length;
  $("#stats").innerHTML = [
    [working, "on real tasks now"], [queued, "queued"], [backlog, "backlog"], [done, "tasks completed"],
    [S.employees.reduce((a, e) => a + e.xp, 0), "total team XP"],
    [S.company.priorities[0] || "—", "#1 priority"],
  ].map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");

  renderFloor();

  $("#feed").innerHTML = S.feed.slice(0, 60).map((f) => {
    const e = f.who && emp(f.who);
    return `<li class="k-${f.kind}"><time>${ago(f.at)}</time>${e ? e.emoji + " " : ""}${esc(f.text)}</li>`;
  }).join("") || `<li class="muted">No activity yet.</li>`;
}

// ------------------------------------------------------------ animated desks
// The floor is built once and then patched in place: replacing the DOM on every
// update would restart the CSS animations several times a second.

const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#a86b3c"];
const HAIR = ["#2b1d0e", "#4a3020", "#151515", "#a0522d", "#d6b370", "#6b6b6b"];
const SHIRT = { Executive: "#7c4dff", Engineering: "#2f81f7", Product: "#e3762b", Growth: "#db61a2", Sales: "#2da44e", Operations: "#0fa3a3" };
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const prettyModel = (m = "") => m.replace(/^claude-/, "").replace(/-(\d+)-(\d+)$/, " $1.$2").replace(/-(\d+)$/, " $1").replace(/^\w/, (c) => c.toUpperCase());

function sceneSvg(e) {
  const h = hash(e.id);
  const skin = SKIN[h % SKIN.length], hair = HAIR[(h >> 3) % HAIR.length], shirt = SHIRT[e.dept] || "#6e7681";
  const colors = ["#7ee787", "#79c0ff", "#d2a8ff", "#ffa657"];
  // 12 code lines, 4px apart; the group scrolls up 24px and loops, so lines 6-11 repeat 0-5.
  const lines = Array.from({ length: 12 }, (_, i) => {
    const j = i % 6, w = 8 + ((h >> j) % 26), x = 102 + (j % 3) * 4;
    return `<rect x="${x}" y="${16 + i * 4}" width="${w}" height="1.8" rx=".9" fill="${colors[j % 4]}"/>`;
  }).join("");
  const tie = e.id === "ceo" ? `<path d="M32 32 L36 32 L35.5 36 L37 47 L34 50 L31 47 L32.5 36 Z" fill="#d4af37"/>` : "";
  return `<svg class="scene" viewBox="0 0 160 100" aria-hidden="true">
    <defs><clipPath id="clip-${e.id}"><rect x="99" y="13" width="44" height="26" rx="1"/></clipPath></defs>
    <rect class="floor-line" x="0" y="94" width="160" height="6"/>
    <g class="chair">
      <rect x="14" y="28" width="6" height="40" rx="3"/><rect x="14" y="62" width="38" height="6" rx="3"/>
      <rect x="30" y="68" width="4" height="18"/><rect x="18" y="86" width="28" height="3" rx="1.5"/>
      <circle cx="20" cy="91" r="2.5"/><circle cx="44" cy="91" r="2.5"/>
    </g>
    <rect x="26" y="55" width="30" height="9" rx="4" fill="#30363d"/>
    <rect x="50" y="58" width="8" height="30" rx="3" fill="#30363d"/>
    <rect x="50" y="86" width="15" height="5" rx="2" fill="#0d1117"/>
    <rect x="66" y="54" width="90" height="6" rx="2" class="desktop"/>
    <rect x="72" y="60" width="5" height="34" class="desktop"/><rect x="146" y="60" width="5" height="34" class="desktop"/>
    <rect x="118" y="40" width="5" height="14" fill="#484f58"/><rect x="110" y="52" width="21" height="3" rx="1" fill="#484f58"/>
    <rect x="96" y="10" width="50" height="32" rx="3" fill="#21262d"/>
    <rect class="screen" x="99" y="13" width="44" height="26" rx="1"/>
    <g class="code-wrap" clip-path="url(#clip-${e.id})"><g class="code">${lines}</g></g>
    <circle class="led" cx="141" cy="40" r="1"/>
    <rect x="74" y="51" width="26" height="3" rx="1" fill="#6e7681"/>
    <rect x="136" y="45" width="8" height="9" rx="1.5" fill="#e6edf3"/><path d="M144 47 q4 2.5 0 5" stroke="#e6edf3" stroke-width="1.5" fill="none"/>
    <g class="steam"><path d="M139 43 q-2 -3 0 -6"/><path d="M142 43 q2 -3 0 -6"/></g>
    <g class="body">
      <rect x="23" y="30" width="22" height="31" rx="9" fill="${shirt}"/>${tie}
      <g class="arms-rest">
        <line x1="35" y1="37" x2="38" y2="55" stroke="${shirt}" stroke-width="6.5" stroke-linecap="round"/>
        <line x1="38" y1="55" x2="56" y2="56" stroke="${skin}" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g class="arms-work">
        <line x1="37" y1="36" x2="53" y2="47" stroke="${shirt}" stroke-width="6.5" stroke-linecap="round" opacity=".7"/>
        <g class="hand-b"><line x1="53" y1="47" x2="81" y2="49.5" stroke="${skin}" stroke-width="5" stroke-linecap="round" opacity=".75"/></g>
        <line x1="34" y1="38" x2="49" y2="50" stroke="${shirt}" stroke-width="6.5" stroke-linecap="round"/>
        <g class="hand-a"><line x1="49" y1="50" x2="76" y2="50.5" stroke="${skin}" stroke-width="5" stroke-linecap="round"/></g>
      </g>
      <g class="head">
        <rect x="31" y="24" width="7" height="8" fill="${skin}"/>
        <circle cx="35" cy="17" r="11" fill="${skin}"/>
        <path d="M24 18 A11 11 0 0 1 45 12 Q37 9.5 31 14 Q27 17 26.5 23 Z" fill="${hair}"/>
        <circle cx="42" cy="16.5" r="1.3" fill="#0d1117"/>
        <path d="M41 22 q2 0.8 3.2 -0.4" stroke="#0d1117" stroke-width="1" fill="none" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`;
}

let floorKey = "";
function renderFloor() {
  const key = S.employees.map((e) => e.id + e.dept).join("|");
  if (key !== floorKey) {
    floorKey = key;
    const depts = DEPT_ORDER.filter((d) => S.employees.some((e) => e.dept === d));
    $("#floor").innerHTML = depts.map((d) => `
      <div class="dept"><h3>${d}</h3><div class="desks">
        ${S.employees.filter((e) => e.dept === d).map((e) => `
          <button class="desk ${e.id === "ceo" ? "ceo" : ""}" data-id="${e.id}">
            <span class="queue"></span>
            <div class="who"><span class="avatar">${e.emoji}</span>
              <div><div class="name">${esc(e.name)}</div><div class="role">${esc(e.role)}</div></div>
              <span class="lvl"></span></div>
            ${sceneSvg(e)}
            <div class="act"></div>
            <div class="bar"><i></i></div>
          </button>`).join("")}
      </div></div>`).join("");
    $$(".desk").forEach((el) => el.onclick = () => openEmp(el.dataset.id));
  }
  for (const e of S.employees) {
    const el = $(`.desk[data-id="${e.id}"]`);
    const working = e.status === "working";
    const label = working || e.status === "meeting" ? e.activity : "Idle — waiting for a task";
    const q = S.tasks.filter((t) => t.employeeId === e.id && t.status === "queued").length;
    el.classList.toggle("is-working", working);
    el.title = label;
    el.setAttribute("aria-label", `${e.name}, ${e.role}: ${label}`);
    $(".queue", el).textContent = q ? `${q} queued` : "";
    const model = S.models?.[e.id];
    $(".lvl", el).textContent = `L${e.level}` + (e.id === "ceo" && model ? ` · ${prettyModel(model)}` : "");
    $(".act", el).innerHTML = `<span class="dot s-${working ? "working" : e.status === "meeting" ? "meeting" : "idle"}"></span>${esc(label)}`;
    const bar = $(".bar", el);
    bar.classList.toggle("xp", !working);
    $("i", bar).style.width = (working ? e.progress : xpProgress(e).pct) + "%";
  }
}

function renderTasks() {
  const sel = $("#task-emp");
  if (document.activeElement !== sel) {
    const v = sel.value;
    sel.innerHTML = S.employees.map((e) => `<option value="${e.id}">${e.emoji} ${esc(e.name)} — ${esc(e.role)}</option>`).join("");
    if (v) sel.value = v;
  }
  const filters = ["all", "running", "queued", "backlog", "done", "failed"];
  $("#task-filters").innerHTML = filters.map((f) => `<button data-f="${f}" class="${ui.taskFilter === f ? "active" : ""}">${f} (${f === "all" ? S.tasks.length : S.tasks.filter((t) => t.status === f || (f === "failed" && t.status === "interrupted")).length})</button>`).join("");
  $$("#task-filters button").forEach((b) => b.onclick = () => { ui.taskFilter = b.dataset.f; renderTasks(); });

  const open = new Set($$("#task-list details[open]").map((d) => d.dataset.id));
  const list = S.tasks.filter((t) => ui.taskFilter === "all" || t.status === ui.taskFilter || (ui.taskFilter === "failed" && t.status === "interrupted"));
  $("#task-list").innerHTML = list.map((t) => taskHtml(t, open.has(t.id))).join("") || `<p class="muted">No tasks here. Assign one above.</p>`;
  $$("#task-list [data-run]").forEach((b) => b.onclick = act(async (ev) => { ev.preventDefault(); await api("POST", `/api/tasks/${b.dataset.run}/run`); toast("Task queued"); }));
}

function taskHtml(t, open) {
  const e = emp(t.employeeId);
  const canRun = ["backlog", "failed", "interrupted"].includes(t.status);
  return `<details class="task" data-id="${t.id}" ${open ? "open" : ""}>
    <summary><span class="pill st-${t.status}">${t.status}</span> ${e?.emoji ?? ""} <b>${esc(e?.name)}</b> ${esc(t.title)}
      <span class="meta">${esc(t.source)} · ${ago(t.createdAt)} ago</span>
      ${canRun ? `<button data-run="${t.id}">▶ Run</button>` : ""}</summary>
    ${t.details ? `<p class="muted">${esc(t.details)}</p>` : ""}
    ${t.error ? `<p class="st-failed">Error: ${esc(t.error)}</p>` : ""}
    ${t.result ? `<div class="doc">${md(t.result)}</div>` : ""}
  </details>`;
}

function renderDocs(kind) {
  const items = kind === "brief" ? S.briefs : S.meetings;
  const key = kind + "Id";
  if (!items.find((x) => x.id === ui[key])) ui[key] = items[0]?.id ?? null;
  const sch = S.schedule;
  $(`#${kind}-sched`).textContent = kind === "brief"
    ? `Runs automatically every day at ${sch.briefTime} (${sch.timezone}). Last: ${sch.lastBriefDate ?? "never"}.`
    : `Runs automatically every ${DAYS[sch.meetingDay]} at ${sch.meetingTime} (${sch.timezone}). Action items land in the Tasks backlog. Last: ${sch.lastMeetingDate ?? "never"}.`;
  $(`#${kind}-list`).innerHTML = items.map((x) => `<li><button data-id="${x.id}" class="${x.id === ui[key] ? "active" : ""}">${fmt(x.at)}${x.mode === "simulation" ? " 🧪" : ""}</button></li>`).join("") || `<li class="muted">None yet.</li>`;
  $$(`#${kind}-list button`).forEach((b) => b.onclick = () => { ui[key] = b.dataset.id; renderDocs(kind); });
  const cur = items.find((x) => x.id === ui[key]);
  let html = cur ? md(cur.body) : `<p class="muted">Nothing yet — click “Run ${kind === "brief" ? "morning brief" : "Sunday meeting"} now”.</p>`;
  if (cur && kind === "meeting" && cur.actionTaskIds?.length) {
    html += `<h2>Action items → backlog</h2>` + cur.actionTaskIds.map((id) => S.tasks.find((t) => t.id === id)).filter(Boolean).map((t) => taskHtml(t, false)).join("");
  }
  $(`#${kind}-view`).innerHTML = html;
  $$(`#${kind}-view [data-run]`).forEach((b) => b.onclick = act(async (ev) => { ev.preventDefault(); await api("POST", `/api/tasks/${b.dataset.run}/run`); toast("Task queued"); }));
}

function renderTeam() {
  $("#levels").innerHTML = S.levels.map((l) => `<span class="pill">L${l.level} ${l.title} · ${l.xp} XP · ${l.level + 2} skill slots</span>`).join("");
  const sorted = [...S.employees].sort((a, b) => b.xp - a.xp);
  $("#leaderboard").innerHTML = sorted.map((e, i) => {
    const p = xpProgress(e);
    return `<div class="lb" data-id="${e.id}"><b>#${i + 1}</b><span class="avatar">${e.emoji}</span>
      <div><b>${esc(e.name)}</b> <span class="muted">${esc(e.role)}</span><div class="bar xp"><i style="width:${p.pct}%"></i></div><small class="muted">${p.label}</small></div>
      <span class="hide-sm">L${e.level} ${levelTitle(e.level)}</span><span>${e.tasksDone} tasks</span></div>`;
  }).join("");
  $$(".lb").forEach((el) => el.onclick = () => openEmp(el.dataset.id));
}

function renderSkills() {
  const q = ui.skillQuery.toLowerCase();
  const skills = S.skills.filter((s) => !q || (s.name + s.category + s.description).toLowerCase().includes(q));
  const cats = [...new Set(skills.map((s) => s.category))];
  $("#skill-grid").innerHTML = cats.map((c) => skills.filter((s) => s.category === c).map((s) => {
    const holders = S.employees.filter((e) => e.skills.includes(s.id));
    return `<div class="skill"><div><span class="pill">${esc(s.category)}</span> <span class="pill">min L${s.minLevel}</span></div>
      <h4>${esc(s.name)}</h4><p class="muted">${esc(s.description)}</p>
      <details><summary class="muted">Instructions</summary><p>${esc(s.prompt)}</p></details>
      <div class="holders">${holders.length ? holders.map((e) => `${e.emoji} ${esc(e.name)}`).join(", ") : "Nobody has this yet"}</div>
      <button data-edit="${s.id}">Edit</button></div>`;
  }).join("")).join("");
  $$("#skill-grid [data-edit]").forEach((b) => b.onclick = () => openSkill(S.skills.find((s) => s.id === b.dataset.edit)));
}

function renderSettings() {
  const f = $("#company-form");
  if (f.contains(document.activeElement) || f.dataset.loaded) return;
  f.name.value = S.company.name; f.mission.value = S.company.mission; f.priorities.value = S.company.priorities.join("\n");
  f.dataset.loaded = "1";
}

// ------------------------------------------------------------ debate room
// Original character designs (not the anime's): Naruto = sunny supporter with a thumbs-up,
// Sasuke = sharp challenger in a blazer and glasses, Judge = robe, wig and gavel.
// Whoever is speaking animates; everyone else sits still. The gavel bangs on the verdict.

const COURT_SVG = `<svg viewBox="0 0 480 230" class="court-svg" role="img" aria-label="Debate room with Naruto, the Judge and Sasuke">
  <rect x="0" y="0" width="480" height="210" class="wall"/>
  <rect x="0" y="210" width="480" height="20" class="floor"/>
  <!-- Judge -->
  <g class="p judge">
    <g class="bubble"><rect x="262" y="8" width="44" height="20" rx="10"/><circle cx="276" cy="18" r="2.2"/><circle cx="284" cy="18" r="2.2"/><circle cx="292" cy="18" r="2.2"/></g>
    <rect x="212" y="72" width="56" height="50" rx="18" fill="#15171c"/>
    <path d="M232 74 L240 88 L248 74 Z" fill="#f5f5f5"/>
    <g class="head">
      <circle cx="223" cy="48" r="7" class="wig"/><circle cx="257" cy="48" r="7" class="wig"/>
      <circle cx="222" cy="60" r="6" class="wig"/><circle cx="258" cy="60" r="6" class="wig"/>
      <circle cx="240" cy="54" r="17" fill="#e0ac69"/>
      <path d="M224 46 Q240 28 256 46 Q248 38 240 39 Q232 38 224 46 Z" class="wig"/>
      <circle cx="234" cy="52" r="1.8" fill="#0d1117"/><circle cx="246" cy="52" r="1.8" fill="#0d1117"/>
      <path d="M231 46 h6 M243 46 h6" stroke="#0d1117" stroke-width="1.6" stroke-linecap="round"/>
      <path class="m-closed" d="M235 62 h10" stroke="#0d1117" stroke-width="1.6" stroke-linecap="round"/>
      <ellipse class="m-open" cx="240" cy="62.5" rx="4" ry="2.6" fill="#5a1d1d"/>
    </g>
    <g class="gavel">
      <line x1="262" y1="90" x2="292" y2="104" stroke="#15171c" stroke-width="9" stroke-linecap="round"/>
      <line x1="292" y1="104" x2="306" y2="86" stroke="#a0522d" stroke-width="3" stroke-linecap="round"/>
      <rect x="298" y="76" width="18" height="10" rx="2" fill="#7a3e1d" transform="rotate(38 307 81)"/>
      <circle cx="292" cy="104" r="5" fill="#e0ac69"/>
    </g>
    <g class="bang"><path d="M296 118 l-8 6 M312 118 l8 6 M304 116 v-8" stroke="#ffd33d" stroke-width="2.5" stroke-linecap="round"/></g>
  </g>
  <rect x="160" y="112" width="160" height="10" rx="2" class="wood-top"/>
  <rect x="170" y="122" width="140" height="88" class="wood"/>
  <rect x="294" y="106" width="22" height="6" rx="1" fill="#5c3317"/>
  <circle cx="240" cy="166" r="20" class="seal"/><text x="240" y="174" text-anchor="middle" font-size="22">⚖️</text>

  <!-- Naruto: the Supporter -->
  <g class="p naruto">
    <g class="bubble"><rect x="98" y="16" width="44" height="20" rx="10"/><circle cx="112" cy="26" r="2.2"/><circle cx="120" cy="26" r="2.2"/><circle cx="128" cy="26" r="2.2"/></g>
    <g class="bodyg">
      <rect x="56" y="100" width="48" height="48" rx="18" fill="#f2c94c"/>
      <path d="M68 102 Q80 112 92 102" stroke="#2bb3a3" stroke-width="5" fill="none" stroke-linecap="round"/>
      <g class="head">
        <circle cx="80" cy="80" r="19" fill="#f1c27d"/>
        <path d="M61 78 Q60 58 80 58 Q100 58 99 78 Q94 68 88 70 Q84 64 78 68 Q70 64 66 72 Z" fill="#7b4a2a"/>
        <circle cx="73" cy="80" r="2" fill="#0d1117"/><circle cx="87" cy="80" r="2" fill="#0d1117"/>
        <circle cx="68" cy="87" r="3" fill="#f4978e" opacity=".7"/><circle cx="92" cy="87" r="3" fill="#f4978e" opacity=".7"/>
        <path class="m-closed" d="M72 88 Q80 95 88 88" stroke="#0d1117" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <ellipse class="m-open" cx="80" cy="90" rx="5" ry="3.5" fill="#5a1d1d"/>
      </g>
      <g class="thumb">
        <line x1="100" y1="112" x2="118" y2="94" stroke="#f2c94c" stroke-width="10" stroke-linecap="round"/>
        <circle cx="120" cy="91" r="6.5" fill="#f1c27d"/><rect x="117.5" y="76" width="5" height="12" rx="2.5" fill="#f1c27d"/>
      </g>
    </g>
  </g>
  <rect x="34" y="140" width="92" height="9" rx="2" class="wood-top"/>
  <rect x="40" y="149" width="80" height="61" class="wood"/>
  <text x="80" y="185" text-anchor="middle" class="podium-label">FOR</text>
  <rect class="glow naruto-glow" x="30" y="136" width="100" height="78" rx="8"/>

  <!-- Sasuke: the Challenger -->
  <g class="p sasuke">
    <g class="bubble"><rect x="338" y="14" width="44" height="20" rx="10"/><circle cx="352" cy="24" r="2.2"/><circle cx="360" cy="24" r="2.2"/><circle cx="368" cy="24" r="2.2"/></g>
    <g class="bodyg">
      <rect x="376" y="96" width="48" height="52" rx="14" fill="#34405e"/>
      <path d="M392 98 L400 114 L408 98 Z" fill="#e6edf3"/><path d="M398 102 L400 118 L402 102 Z" fill="#8b1e3f"/>
      <g class="head">
        <circle cx="400" cy="76" r="18" fill="#c68642"/>
        <path d="M382 74 Q381 56 400 56 Q419 56 418 72 L418 66 Q406 60 392 66 Q386 68 382 74 Z" fill="#9aa4b2"/>
        <rect x="389" y="73" width="9" height="7" rx="2" fill="none" stroke="#0d1117" stroke-width="1.4"/>
        <rect x="402" y="73" width="9" height="7" rx="2" fill="none" stroke="#0d1117" stroke-width="1.4"/>
        <path d="M398 76 h4" stroke="#0d1117" stroke-width="1.4"/>
        <circle cx="393.5" cy="76.5" r="1.5" fill="#0d1117"/><circle cx="406.5" cy="76.5" r="1.5" fill="#0d1117"/>
        <path d="M389 69 l8 -1 M403 66 l8 2" stroke="#0d1117" stroke-width="1.6" stroke-linecap="round"/>
        <path class="m-closed" d="M395 87 h10" stroke="#0d1117" stroke-width="1.6" stroke-linecap="round"/>
        <ellipse class="m-open" cx="400" cy="87.5" rx="4" ry="2.6" fill="#5a1d1d"/>
      </g>
      <rect class="crossed" x="378" y="118" width="44" height="10" rx="5" fill="#27304a"/>
      <g class="point">
        <line x1="382" y1="108" x2="356" y2="98" stroke="#34405e" stroke-width="10" stroke-linecap="round"/>
        <circle cx="352" cy="97" r="5.5" fill="#c68642"/><line x1="350" y1="96" x2="340" y2="94" stroke="#c68642" stroke-width="3.5" stroke-linecap="round"/>
      </g>
    </g>
  </g>
  <rect x="354" y="140" width="92" height="9" rx="2" class="wood-top"/>
  <rect x="360" y="149" width="80" height="61" class="wood"/>
  <text x="400" y="185" text-anchor="middle" class="podium-label">AGAINST</text>
  <rect class="glow sasuke-glow" x="350" y="136" width="100" height="78" rx="8"/>
</svg>`;

function renderDebate() {
  const court = $("#court");
  if (!court.firstChild) court.innerHTML = COURT_SVG; // built once so animations never restart
  const debates = S.debates || [];
  const live = debates.find((d) => d.status === "running" || d.speaker);
  const speaker = live?.speaker || "";
  court.dataset.speaker = speaker;
  court.dataset.winner = speaker === "verdict" ? live.verdict?.winner ?? "" : "";
  const P = S.panel || {};
  $("#court-caption").textContent = !live ? "The panel is seated. They only debate when you ask."
    : speaker === "verdict" ? `🔨 The Judge rules: ${live.verdict.winner === "split" ? "split decision" : `${P[live.verdict.winner]?.name} is right`}`
    : `${P[speaker]?.name ?? ""} is speaking — “${live.question}”`;

  if (live && ui.debateFollow !== false) ui.debateId = live.id;
  if (!debates.find((d) => d.id === ui.debateId)) ui.debateId = debates[0]?.id ?? null;
  $("#debate-list").innerHTML = debates.map((d) => `<li><button data-id="${d.id}" class="${d.id === ui.debateId ? "active" : ""}">
    ${d.status === "running" ? "🔴 " : d.verdict ? (d.verdict.winner === "naruto" ? "🟡 " : d.verdict.winner === "sasuke" ? "🔵 " : "⚪ ") : "❌ "}${esc(d.question.slice(0, 60))}</button></li>`).join("")
    || `<li class="muted">No debates yet.</li>`;
  $$("#debate-list button").forEach((b) => b.onclick = () => { ui.debateId = b.dataset.id; ui.debateFollow = false; renderDebate(); });

  const d = debates.find((x) => x.id === ui.debateId);
  if (!d) { $("#debate-view").innerHTML = `<p class="muted">Ask Claude: “run a debate on …”</p>`; return; }
  const who = { naruto: "🟡 Naruto — supports", sasuke: "🔵 Sasuke — challenges", judge: "⚖️ Judge" };
  $("#debate-view").innerHTML = `<h2>${esc(d.question)}</h2>
    <p class="muted">${fmt(d.at)} · ${d.mode === "simulation" ? "🧪 simulation" : `Naruto & Sasuke: ${esc(prettyModel(P.naruto?.model))} · Judge: ${esc(prettyModel(P.judge?.model))}`}</p>
    ${d.context ? `<details><summary class="muted">Background</summary><p>${esc(d.context)}</p></details>` : ""}
    ${d.turns.map((t) => `<div class="turn turn-${t.who}"><h4>${who[t.who]}${t.round ? ` · round ${t.round}` : ""}</h4>${md(t.text.replace(/^(STATUS|WINNER):.*$/gim, "**$&**"))}</div>`).join("")}
    ${d.status === "running" ? `<p class="muted">… ${esc(P[d.speaker]?.name ?? "")} is thinking</p>` : ""}
    ${d.error ? `<p class="st-failed">Error: ${esc(d.error)}</p>` : ""}`;
}

// ------------------------------------------------------------ employee dialog

function openEmp(id) { ui.empOpen = id; renderEmp(id); const d = $("#emp-dialog"); if (!d.open) d.showModal(); }
function renderEmp(id) {
  const e = emp(id); if (!e) return;
  const p = xpProgress(e);
  const slots = e.level + 2;
  const available = S.skills.filter((s) => !e.skills.includes(s.id));
  const tasks = S.tasks.filter((t) => t.employeeId === id).slice(0, 8);
  const draft = $("#emp-task-title")?.value || "";
  $("#emp-body").innerHTML = `
    <div class="who" style="display:flex;gap:12px;align-items:center"><span class="avatar" style="font-size:30px;width:52px;height:52px">${e.emoji}</span>
      <div><h3>${esc(e.name)}</h3><p class="muted">${esc(e.role)} · ${esc(e.dept)} · L${e.level} ${levelTitle(e.level)} · 🤖 ${esc(prettyModel(S.models?.[e.id] ?? ""))}</p></div>
      <button style="margin-left:auto" id="emp-close">✕</button></div>
    <p><i>${esc(e.personality)}</i></p>
    <p><span class="dot s-${e.status}"></span>${esc(e.activity)}</p>
    <div class="bar xp"><i style="width:${p.pct}%"></i></div><small class="muted">${p.label} · ${e.tasksDone} tasks done</small>
    <h4 style="margin-top:14px">Skills (${e.skills.length}/${slots} slots)</h4>
    <div class="chips">${e.skills.map((sid) => { const s = S.skills.find((x) => x.id === sid); return `<span class="chip">${esc(s?.name ?? sid)}<button data-unequip="${sid}" aria-label="Remove">×</button></span>`; }).join("")}</div>
    <div class="row" style="justify-content:flex-start;margin-top:8px">
      <select id="equip-sel">${available.map((s) => `<option value="${s.id}" ${s.minLevel > e.level ? "disabled" : ""}>${esc(s.name)} (L${s.minLevel})</option>`).join("")}</select>
      <button id="equip-btn" ${e.skills.length >= slots ? "disabled" : ""}>Teach skill</button></div>
    <h4 style="margin-top:14px">Assign a task</h4>
    <div class="row" style="justify-content:flex-start"><input id="emp-task-title" style="flex:1" placeholder="What should ${esc(e.name)} do?" value="${esc(draft)}"><button class="primary" id="emp-task-btn">Assign</button></div>
    <h4 style="margin-top:14px">Recent tasks</h4>
    <div class="list">${tasks.map((t) => taskHtml(t, false)).join("") || `<p class="muted">None yet.</p>`}</div>`;
  $("#emp-close").onclick = () => { ui.empOpen = null; $("#emp-dialog").close(); };
  $$("[data-unequip]", $("#emp-body")).forEach((b) => b.onclick = act(() => api("POST", `/api/employees/${id}/skills`, { skillId: b.dataset.unequip, on: false })));
  $("#equip-btn").onclick = act(async () => { await api("POST", `/api/employees/${id}/skills`, { skillId: $("#equip-sel").value, on: true }); toast("Skill learned"); });
  $("#emp-task-btn").onclick = act(async () => {
    const title = $("#emp-task-title").value.trim(); if (!title) return;
    $("#emp-task-title").value = "";
    await api("POST", "/api/tasks", { employeeId: id, title }); toast(`Assigned to ${e.name}`);
  });
  $$("#emp-body [data-run]").forEach((b) => b.onclick = act(async (ev) => { ev.preventDefault(); await api("POST", `/api/tasks/${b.dataset.run}/run`); }));
}
$("#emp-dialog").addEventListener("close", () => { ui.empOpen = null; });

// ------------------------------------------------------------ skill dialog

function openSkill(s = {}) {
  const f = $("#skill-form");
  for (const k of ["id", "name", "category", "minLevel", "description", "prompt"]) f[k].value = s[k] ?? (k === "minLevel" ? 1 : "");
  f.name.readOnly = Boolean(s.id);
  $("#skill-dialog").showModal();
}
$("#new-skill").onclick = () => openSkill();
$("#skill-dialog").addEventListener("close", act(async () => {
  if ($("#skill-dialog").returnValue !== "save") return;
  const f = $("#skill-form");
  await api("POST", "/api/skills", Object.fromEntries(new FormData(f)));
  toast("Skill saved");
}));
$("#skill-search").oninput = (e) => { ui.skillQuery = e.target.value; renderSkills(); };

// ------------------------------------------------------------ static wiring

$$(".tabs button").forEach((b) => b.onclick = () => {
  $$(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
  history.replaceState(null, "", "#" + b.dataset.tab);
});
const initial = location.hash.slice(1);
if (initial) $(`.tabs button[data-tab="${initial}"]`)?.click();

$("#task-form").onsubmit = act(async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  await api("POST", "/api/tasks", Object.fromEntries(new FormData(f)));
  f.title.value = ""; f.details.value = "";
  toast("Task assigned");
});
const runJob = (btn, url, label) => act(async () => {
  btn.disabled = true;
  try { await api("POST", url); toast(`${label} started — watch the Office Board`); }
  finally { setTimeout(() => (btn.disabled = false), 4000); }
});
$("#run-brief").onclick = runJob($("#run-brief"), "/api/brief", "Morning brief");
$("#run-meeting").onclick = runJob($("#run-meeting"), "/api/meeting", "Sunday meeting");
$("#company-form").onsubmit = act(async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  await api("PATCH", "/api/company", { name: f.name.value, mission: f.mission.value, priorities: f.priorities.value.split("\n").map((s) => s.trim()).filter(Boolean) });
  delete f.dataset.loaded; toast("Saved");
});

// ------------------------------------------------------------ voice call
// Browser speech-to-text -> streamed Claude reply -> browser text-to-speech, one sentence at a time.
// Latency budget: speech end (~0.5s, browser) + model time to first sentence + TTS start (~0.1s).
// We start speaking the first complete sentence while the rest is still generating.
const voice = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const st = { on: false, history: [], rec: null, recRunning: false, ctrl: null, speaking: false, pending: 0, interimEl: null, voices: [] };
  const pref = (k, d) => { try { return localStorage.getItem("voice." + k) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem("voice." + k, v); } catch {} };

  const status = (text, cls = "") => { const el = $("#voice-status"); el.textContent = text; el.className = "voice-status muted " + cls; };
  const empName = () => S?.employees.find((e) => e.id === $("#voice-emp").value)?.name || "Claude";

  function addTurn(role, text, extra = "") {
    const el = document.createElement("div");
    el.className = `turn ${role} ${extra}`;
    el.innerHTML = `<span class="who">${role === "user" ? "You" : esc(empName())}</span><span class="txt"></span>`;
    el.querySelector(".txt").textContent = text;
    const log = $("#voice-log"); log.append(el); log.scrollTop = log.scrollHeight;
    return el;
  }

  // ---- text-to-speech
  function loadVoices() {
    if (!synth) return;
    const en = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    // Neural/online voices sound far better than the default robotic ones.
    const score = (v) => (/natural|neural|premium|enhanced|google|siri/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
    st.voices = en.sort((a, b) => score(b) - score(a));
    const sel = $("#voice-voice"), want = pref("voice", "");
    sel.innerHTML = st.voices.map((v, i) => `<option value="${i}">${esc(v.name)}</option>`).join("");
    const i = st.voices.findIndex((v) => v.name === want);
    sel.value = String(i >= 0 ? i : 0);
  }
  function speak(text) {
    text = text.replace(/[*_#`>|]/g, "").replace(/\s+/g, " ").trim();
    if (!text || !synth) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = st.voices[Number($("#voice-voice").value)] || null;
    u.rate = Number($("#voice-rate").value);
    st.pending++; st.speaking = true;
    if (!$("#voice-bargein").checked) pauseListening(); // no headphones: don't let the mic hear the speaker
    status(`${empName()} is speaking…`, "speaking");
    const done = () => { if (--st.pending <= 0) { st.pending = 0; st.speaking = false; afterSpeaking(); } };
    u.onend = done; u.onerror = done;
    synth.speak(u);
  }
  function afterSpeaking() {
    if (st.ctrl) return status(`${empName()} is thinking…`, "thinking");
    if (st.on) { resumeListening(); status("Listening… go ahead", "listening"); } else status("Idle");
  }

  // ---- interruption: stop audio and the in-flight request (server aborts the Claude stream too)
  function stopTalking() {
    if (st.ctrl) {
      // Record what was already said, synchronously, so history order stays user/assistant/user.
      const partial = st.partial?.().trim();
      if (partial) st.history.push({ role: "assistant", content: partial + " [interrupted]" });
      st.ctrl.abort(); st.ctrl = null;
    }
    synth?.cancel(); st.pending = 0; st.speaking = false;
  }

  // ---- one turn
  async function send(text) {
    text = text.trim();
    if (!text) return;
    stopTalking();
    st.history.push({ role: "user", content: text });
    addTurn("user", text);
    const el = addTurn("assistant", "");
    const txt = el.querySelector(".txt");
    const ctrl = new AbortController(); st.ctrl = ctrl; st.partial = () => full;
    status(`${empName()} is thinking…`, "thinking");
    let full = "", buf = "";
    const t0 = performance.now(); let firstAt = 0;
    const flush = (force) => {
      // Speak whole sentences as soon as they're complete; long clauses break at a comma.
      let m;
      while ((m = buf.match(/^([\s\S]*?[.!?…:;](?=\s|$)|[\s\S]{140,}?[,—](?=\s))\s*/))) {
        if (!firstAt) firstAt = performance.now();
        speak(m[1]); buf = buf.slice(m[0].length);
      }
      if (force && buf.trim()) { speak(buf); buf = ""; }
    };
    try {
      const res = await fetch(`/api/voice/${$("#voice-emp").value}`, {
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-hq-token": token },
        body: JSON.stringify({ history: st.history }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      const reader = res.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        full += chunk; buf += chunk; txt.textContent = full;
        $("#voice-log").scrollTop = 1e9;
        flush(false);
      }
      flush(true);
      const [reply, err] = full.split("\n[error] ");
      if (err) throw new Error(err);
      st.history.push({ role: "assistant", content: reply.trim() });
      if (firstAt) el.title = `first sentence after ${Math.round(firstAt - t0)} ms`;
    } catch (e) {
      if (e.name === "AbortError") {
        el.classList.add("interim"); // stopTalking() already saved the partial reply to history
      } else { txt.textContent = "⚠️ " + e.message; st.history.pop(); }
    } finally {
      if (st.ctrl === ctrl) st.ctrl = null;
      if (!st.speaking) afterSpeaking();
    }
  }

  // ---- speech-to-text
  function makeRec() {
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US";
    r.onresult = (ev) => {
      let interim = "", final = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += t; else interim += t;
      }
      // Barge-in: you started talking over the reply -> cut it off immediately.
      if ((interim + final).trim().length > 2 && (st.speaking || st.ctrl)) stopTalking();
      if (interim) {
        st.interimEl ||= addTurn("user", "", "interim");
        st.interimEl.querySelector(".txt").textContent = interim;
        status("Listening…", "listening");
      }
      if (final.trim()) { st.interimEl?.remove(); st.interimEl = null; send(final); }
    };
    r.onend = () => { st.recRunning = false; if (st.on && !st.paused) startRec(); }; // Chrome stops after silence
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { toast("⚠️ Microphone blocked: allow it in the address bar"); endCall(); }
    };
    return r;
  }
  function startRec() { if (st.recRunning || !st.rec) return; try { st.rec.start(); st.recRunning = true; } catch {} }
  function pauseListening() { st.paused = true; if (st.recRunning) st.rec.abort(); st.interimEl?.remove(); st.interimEl = null; }
  function resumeListening() { st.paused = false; startRec(); }

  function startCall() {
    if (!SR) return toast("Speech recognition isn't available in this browser; type instead");
    st.on = true; st.rec ||= makeRec(); resumeListening();
    const b = $("#voice-call"); b.textContent = "📞 End call"; b.setAttribute("aria-pressed", "true");
    status("Listening… go ahead", "listening");
  }
  function endCall() {
    st.on = false; pauseListening(); stopTalking();
    const b = $("#voice-call"); b.textContent = "🎙️ Start call"; b.setAttribute("aria-pressed", "false");
    status("Idle");
  }

  function init() {
    if (!SR) $("#voice-unsupported").hidden = false;
    loadVoices(); synth?.addEventListener?.("voiceschanged", loadVoices);
    $("#voice-rate").value = pref("rate", "1.1");
    $("#voice-bargein").checked = pref("bargein", "0") === "1";
    $("#voice-voice").onchange = () => save("voice", st.voices[Number($("#voice-voice").value)]?.name || "");
    $("#voice-rate").onchange = () => save("rate", $("#voice-rate").value);
    $("#voice-bargein").onchange = () => save("bargein", $("#voice-bargein").checked ? "1" : "0");
    $("#voice-call").onclick = () => (st.on ? endCall() : startCall());
    $("#voice-stop").onclick = () => { stopTalking(); afterSpeaking(); };
    $("#voice-reset").onclick = () => { stopTalking(); st.history = []; $("#voice-log").innerHTML = ""; afterSpeaking(); };
    $("#voice-emp").onchange = () => { save("emp", $("#voice-emp").value); $("#voice-reset").click(); };
    $("#voice-form").onsubmit = (ev) => { ev.preventDefault(); const i = $("#voice-text"); send(i.value); i.value = ""; };
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && (st.speaking || st.ctrl)) { stopTalking(); afterSpeaking(); } });
  }

  function renderRoster() {
    const sel = $("#voice-emp");
    if (sel.options.length === S.employees.length) return;
    sel.innerHTML = S.employees.map((e) => `<option value="${esc(e.id)}">${esc(e.name)} — ${esc(e.role)}</option>`).join("");
    sel.value = pref("emp", "ceo"); if (!sel.value) sel.selectedIndex = 0;
  }
  return { init, renderRoster };
})();
voice.init();

connect();
setInterval(() => S && renderOffice(), 30_000); // refresh relative times
