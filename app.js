const state = {
  tab: "home",
  activeUser: localStorage.getItem("kaji-log-user") || "a",
  chores: [],
  logs: [],
  grassMonth: startOfMonth(new Date()),
  weekStart: startOfWeek(new Date()),
  statsMode: "week",
  statsBase: new Date(),
  editingLog: null,
  selectedChore: null,
  demoMode: CONFIG.SUPABASE_URL.includes("xxxx") || CONFIG.SUPABASE_ANON_KEY === "eyJ...",
};

const USERS = CONFIG.USERS;
document.documentElement.style.setProperty("--a", USERS.a.color);
document.documentElement.style.setProperty("--b", USERS.b.color);
const db = state.demoMode ? null : supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const DEMO_CHORES = [
  ["掃除機", "掃除"], ["埃取り", "掃除"], ["散らかり片づける", "掃除"], ["トイレ掃除", "掃除"], ["洗面所掃除", "掃除"],
  ["洗濯機回す", "洗濯"], ["洗濯干す", "洗濯"], ["洗濯畳む", "洗濯"], ["シーツ洗い", "洗濯"],
  ["お風呂掃除(湯舟)", "風呂"], ["お風呂掃除(髪の毛取り)", "風呂"], ["お風呂掃除(洗い場)", "風呂"],
  ["お皿洗い(一人分)", "キッチン"], ["お皿洗い(二人分)", "キッチン"], ["キッチンシンク", "キッチン"], ["コンロ", "キッチン"],
  ["ゴミ出し(燃えるゴミ)", "ゴミ出し"], ["ゴミ出し(ペットボトル)", "ゴミ出し"], ["ゴミ出し(段ボール)", "ゴミ出し"], ["ゴミ出し(缶)", "ゴミ出し"],
  ["シャンプー・ソープ補充", "買い物・補充"], ["R1買う", "買い物・補充"], ["水買う", "買い物・補充"], ["水やり", "その他"],
].map(([name, category], index) => ({ id: `demo-${index + 1}`, name, category, sort_order: index + 1, is_active: true }));

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderUserToggle();
  bindEvents();
  renderWeekdays();
  await loadChores();
  await refreshCurrentView();
}

function bindEvents() {
  document.querySelectorAll(".tab-bar button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  document.body.addEventListener("click", handleActionClick);
  document.getElementById("logForm").addEventListener("submit", saveLog);
  document.getElementById("doneByButtons").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-done-by]");
    if (!button) return;
    selectDoneBy(button.dataset.doneBy);
  });
  document.getElementById("statsMode").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    state.statsMode = button.dataset.mode;
    state.statsBase = new Date();
    document.querySelectorAll("#statsMode button").forEach((b) => b.classList.toggle("is-selected", b === button));
    renderStats();
  });
}

async function loadChores() {
  if (state.demoMode) {
    state.chores = DEMO_CHORES;
    renderHome();
    showToast("Supabase未設定のため、この端末だけのデモモードで表示しています");
    return;
  }
  const { data, error } = await db.from("chores").select("*").eq("is_active", true).order("category").order("sort_order");
  if (error) return showToast("家事リストを読み込めませんでした。Supabase設定を確認してください");
  state.chores = data || [];
  renderHome();
}

async function fetchLogs(start, end) {
  if (state.demoMode) {
    return readDemoLogs()
      .filter((log) => {
        const doneAt = new Date(log.done_at);
        return doneAt >= start && doneAt < end;
      })
      .sort((a, b) => new Date(a.done_at) - new Date(b.done_at))
      .map((log) => ({ ...log, chores: state.chores.find((chore) => chore.id === log.chore_id) }));
  }
  const { data, error } = await db
    .from("logs")
    .select("id,chore_id,done_by,done_at,created_at,chores(name,category)")
    .gte("done_at", start.toISOString())
    .lt("done_at", end.toISOString())
    .order("done_at", { ascending: true });
  if (error) {
    showToast("記録を読み込めませんでした。電波状況を確認してください");
    return [];
  }
  return data || [];
}

function renderUserToggle() {
  const wrap = document.getElementById("activeUserToggle");
  wrap.innerHTML = ["a", "b"].map((id) => `<button type="button" data-user="${id}">${escapeHtml(USERS[id].name)}</button>`).join("");
  wrap.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.user === state.activeUser);
    button.addEventListener("click", () => {
      state.activeUser = button.dataset.user;
      localStorage.setItem("kaji-log-user", state.activeUser);
      renderUserToggle();
    });
  });
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${tab}`));
  document.querySelectorAll(".tab-bar button").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
  document.getElementById("screenTitle").textContent = { home: "記録", grass: "草", week: "週", stats: "集計" }[tab];
  refreshCurrentView();
}

async function refreshCurrentView() {
  if (state.tab === "home") return renderHome();
  if (state.tab === "grass") return renderGrass();
  if (state.tab === "week") return renderWeek();
  return renderStats();
}

async function renderHome() {
  renderChoresList();
  const since = addDays(new Date(), -30);
  const logs = await fetchLogs(startOfLocalDay(since), addDays(endOfLocalDay(new Date()), 1));
  const counts = new Map();
  logs.forEach((log) => counts.set(log.chore_id, (counts.get(log.chore_id) || 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => state.chores.find((c) => c.id === id)).filter(Boolean);
  document.getElementById("quickButtons").innerHTML = top.length
    ? top.map((chore) => `<button type="button" data-open-log="${chore.id}">${escapeHtml(chore.name)}</button>`).join("")
    : `<p class="empty">まだ記録がありません</p>`;
}

function renderChoresList() {
  const grouped = groupBy(state.chores, "category");
  document.getElementById("choresList").innerHTML = Object.entries(grouped).map(([category, chores]) => `
    <section class="category">
      <h2>${escapeHtml(category)}</h2>
      ${chores.map((chore) => `<button class="chore-row" type="button" data-open-log="${chore.id}"><span>${escapeHtml(chore.name)}</span><span>＋</span></button>`).join("")}
    </section>
  `).join("");
}

async function renderGrass() {
  const start = startOfMonth(state.grassMonth);
  const end = addMonths(start, 1);
  const logs = await fetchLogs(start, end);
  state.logs = logs;
  document.getElementById("grassTitle").textContent = `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
  const gridStart = startOfWeek(start);
  const gridEnd = addDays(startOfWeek(end), 7);
  const byDay = new Map();
  logs.forEach((log) => {
    const key = localDateKey(new Date(log.done_at));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(log);
  });
  let html = "";
  for (let d = new Date(gridStart); d < gridEnd; d = addDays(d, 1)) {
    const key = localDateKey(d);
    const counts = countUsers(byDay.get(key) || []);
    html += `<button class="day-cell ${d.getMonth() !== start.getMonth() ? "is-outside" : ""}" type="button" data-day="${key}">
      <div class="day-inner">
        <span class="day-num">${d.getDate()}</span>
        <div class="day-half" style="background:${heat(USERS.a.color, counts.a)}"></div>
        <div class="day-half" style="background:${heat(USERS.b.color, counts.b)}"></div>
      </div>
    </button>`;
  }
  document.getElementById("calendarGrid").innerHTML = html;
  const total = countUsers(logs);
  document.getElementById("monthSummary").textContent = `${USERS.a.name} ${total.a}件 / ${USERS.b.name} ${total.b}件、うち二人で ${total.both}件`;
}

async function renderWeek() {
  const start = state.weekStart;
  const end = addDays(start, 7);
  const logs = await fetchLogs(start, end);
  document.getElementById("weekTitle").textContent = `${fmtDate(start)} - ${fmtDate(addDays(end, -1))}`;
  const heads = ["時", "月", "火", "水", "木", "金", "土", "日"].map((v, i) => `<div class="${i ? "week-day-head" : "time-label"}">${v}</div>`).join("");
  const lanes = Array.from({ length: 7 }, (_, i) => {
    const dayLogs = logs.filter((log) => sameLocalDay(new Date(log.done_at), addDays(start, i)));
    return `<div class="day-lane" style="grid-column:${i + 2};grid-row:2 / span 20">${dayLogs.map((log, index) => chipHtml(log, index)).join("")}</div>`;
  }).join("");
  const labels = Array.from({ length: 20 }, (_, i) => `<div class="time-label" style="grid-column:1;grid-row:${i + 2};">${i + 5}:00</div>`).join("");
  document.getElementById("weekTable").innerHTML = heads + labels + lanes;
}

async function renderStats() {
  const rangeStart = state.statsMode === "week" ? startOfWeek(state.statsBase) : startOfMonth(state.statsBase);
  const rangeEnd = state.statsMode === "week" ? addDays(rangeStart, 7) : addMonths(rangeStart, 1);
  const logs = await fetchLogs(rangeStart, rangeEnd);
  document.getElementById("statsTitle").textContent = state.statsMode === "week"
    ? `${fmtDate(rangeStart)} - ${fmtDate(addDays(rangeEnd, -1))}`
    : `${rangeStart.getFullYear()}年 ${rangeStart.getMonth() + 1}月`;
  const total = countUsers(logs);
  const max = Math.max(total.a, total.b, 1);
  document.getElementById("statsBars").innerHTML = `
    <div class="stat-card">
      ${barHtml(USERS.a.name, total.a, max, USERS.a.color)}
      ${barHtml(USERS.b.name, total.b, max, USERS.b.color)}
      <strong>二人で ${total.both}件</strong>
    </div>`;
  const rows = state.chores.map((chore) => {
    const target = logs.filter((log) => log.chore_id === chore.id);
    const c = countUsers(target);
    return { chore, ...c, total: target.length };
  }).filter((row) => row.total > 0).sort((a, b) => b.total - a.total);
  document.getElementById("statsRows").innerHTML = rows.length ? rows.map((row) => `
    <tr><td>${escapeHtml(row.chore.name)}</td><td>${row.a}</td><td>${row.b}</td><td>${row.both}</td><td>${row.total}</td></tr>
  `).join("") : `<tr><td colspan="5" class="empty">この期間の記録はありません</td></tr>`;
}

function handleActionClick(event) {
  const open = event.target.closest("[data-open-log]");
  if (open) return openLogModal(open.dataset.openLog);
  const day = event.target.closest("[data-day]");
  if (day) return openDaySheet(day.dataset.day);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "grass-prev") state.grassMonth = addMonths(state.grassMonth, -1), renderGrass();
  if (action === "grass-next") state.grassMonth = addMonths(state.grassMonth, 1), renderGrass();
  if (action === "week-prev") state.weekStart = addDays(state.weekStart, -7), renderWeek();
  if (action === "week-next") state.weekStart = addDays(state.weekStart, 7), renderWeek();
  if (action === "week-today") state.weekStart = startOfWeek(new Date()), renderWeek();
  if (action === "stats-prev") moveStats(-1);
  if (action === "stats-next") moveStats(1);
  if (action === "sheet-close") closeSheet();
  if (action === "modal-close") document.getElementById("logDialog").close();
  if (action === "edit-log") editLog(event.target.dataset.id);
  if (action === "delete-log") deleteLog(event.target.dataset.id);
}

function openLogModal(choreId, log = null) {
  state.selectedChore = state.chores.find((chore) => chore.id === choreId);
  state.editingLog = log;
  document.getElementById("modalMode").textContent = log ? "編集" : "記録";
  document.getElementById("modalChoreName").textContent = state.selectedChore.name;
  document.getElementById("doneAtInput").value = toDatetimeLocal(log ? new Date(log.done_at) : new Date());
  selectDoneBy(log ? log.done_by : state.activeUser);
  document.getElementById("logDialog").showModal();
}

function selectDoneBy(value) {
  document.querySelectorAll("#doneByButtons button").forEach((button) => button.classList.toggle("is-selected", button.dataset.doneBy === value));
}

async function saveLog(event) {
  event.preventDefault();
  const doneBy = document.querySelector("#doneByButtons .is-selected").dataset.doneBy;
  const doneAt = new Date(document.getElementById("doneAtInput").value);
  const payload = { chore_id: state.selectedChore.id, done_by: doneBy, done_at: doneAt.toISOString() };
  if (state.demoMode) {
    const logs = readDemoLogs();
    if (state.editingLog) {
      const index = logs.findIndex((log) => log.id === state.editingLog.id);
      if (index >= 0) logs[index] = { ...logs[index], ...payload };
    } else {
      logs.push({ id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString() });
    }
    writeDemoLogs(logs);
    document.getElementById("logDialog").close();
    showToast("記録しました");
    closeSheet();
    refreshCurrentView();
    return;
  }
  const query = state.editingLog
    ? db.from("logs").update(payload).eq("id", state.editingLog.id)
    : db.from("logs").insert(payload);
  const { error } = await query;
  if (error) return showToast("保存できませんでした。電波状況を確認してもう一度お試しください");
  document.getElementById("logDialog").close();
  showToast("記録しました");
  closeSheet();
  refreshCurrentView();
}

function openDaySheet(key) {
  const logs = state.logs.filter((log) => localDateKey(new Date(log.done_at)) === key);
  document.getElementById("sheetTitle").textContent = key;
  document.getElementById("sheetLogs").innerHTML = logs.length ? logs.map((log) => `
    <div class="log-row">
      <div><strong>${escapeHtml(log.chores?.name || choreName(log.chore_id))}</strong><span>${timeText(log.done_at)} / ${doneByLabel(log.done_by)}</span></div>
      <div class="log-actions">
        <button type="button" data-action="edit-log" data-id="${log.id}">編集</button>
        <button type="button" data-action="delete-log" data-id="${log.id}">削除</button>
      </div>
    </div>`).join("") : `<p class="empty">この日の記録はありません</p>`;
  document.getElementById("sheetBackdrop").hidden = false;
}

function closeSheet() {
  document.getElementById("sheetBackdrop").hidden = true;
}

function editLog(id) {
  const log = state.logs.find((item) => item.id === id);
  if (log) openLogModal(log.chore_id, log);
}

async function deleteLog(id) {
  if (!confirm("この記録を削除しますか？")) return;
  if (state.demoMode) {
    writeDemoLogs(readDemoLogs().filter((log) => log.id !== id));
    showToast("削除しました");
    closeSheet();
    renderGrass();
    return;
  }
  const { error } = await db.from("logs").delete().eq("id", id);
  if (error) return showToast("削除できませんでした。もう一度お試しください");
  showToast("削除しました");
  closeSheet();
  renderGrass();
}

function moveStats(step) {
  state.statsBase = state.statsMode === "week" ? addDays(state.statsBase, step * 7) : addMonths(state.statsBase, step);
  renderStats();
}

function chipHtml(log, index) {
  const date = new Date(log.done_at);
  let hour = date.getHours() + date.getMinutes() / 60;
  if (hour < 5) hour = 25;
  const top = Math.min(Math.max((hour - 5) * 48, 0), 936);
  const color = log.done_by === "a" ? USERS.a.color : USERS.b.color;
  const cls = log.done_by === "both" ? "both-bg" : "";
  const style = log.done_by === "both" ? `top:${top + (index % 3) * 8}px` : `top:${top + (index % 3) * 8}px;background:${color}`;
  return `<div class="log-chip ${cls}" style="${style}" title="${escapeHtml(choreName(log.chore_id))}">${escapeHtml(shortName(choreName(log.chore_id)))}</div>`;
}

function renderWeekdays() {
  document.querySelector(".weekday-row").innerHTML = ["月", "火", "水", "木", "金", "土", "日"].map((d) => `<span>${d}</span>`).join("");
}

function countUsers(logs) {
  return logs.reduce((acc, log) => {
    if (log.done_by === "both") acc.a++, acc.b++, acc.both++;
    else acc[log.done_by]++;
    return acc;
  }, { a: 0, b: 0, both: 0 });
}

function barHtml(label, value, max, color) {
  return `<div class="bar-row"><div class="bar-meta"><span>${escapeHtml(label)}</span><span>${value}件</span></div><div class="bar-track"><div class="bar-fill" style="width:${value / max * 100}%;background:${color}"></div></div></div>`;
}

function heat(color, count) {
  const alpha = count === 0 ? .08 : count === 1 ? .32 : count <= 3 ? .62 : .92;
  return hexToRgba(color, alpha);
}
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
function groupBy(items, key) {
  return items.reduce((acc, item) => ((acc[item[key]] ||= []).push(item), acc), {});
}
function choreName(id) {
  return state.chores.find((chore) => chore.id === id)?.name || "家事";
}
function shortName(name) {
  return name.length > 7 ? `${name.slice(0, 7)}…` : name;
}
function doneByLabel(value) {
  return value === "both" ? "二人で" : USERS[value].name;
}
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  setTimeout(() => toast.classList.remove("is-visible"), 2800);
}
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function endOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}
function startOfWeek(date) {
  const d = startOfLocalDay(date);
  const diff = (d.getDay() + 6) % 7;
  return addDays(d, -diff);
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function sameLocalDay(a, b) {
  return localDateKey(a) === localDateKey(b);
}
function toDatetimeLocal(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function fmtDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function timeText(value) {
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}
function readDemoLogs() {
  try {
    return JSON.parse(localStorage.getItem("kaji-log-demo-logs") || "[]");
  } catch {
    return [];
  }
}
function writeDemoLogs(logs) {
  localStorage.setItem("kaji-log-demo-logs", JSON.stringify(logs));
}
