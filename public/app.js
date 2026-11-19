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
  renderOffice(); renderTasks(); renderDocs("brief"); renderDocs("meeting"); renderTeam(); renderSkills(); renderSettings();
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

connect();
setInterval(() => S && renderOffice(), 30_000); // refresh relative times
