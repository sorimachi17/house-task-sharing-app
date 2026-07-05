(function () {
  'use strict';

  var DEMO_MODE = CONFIG.SUPABASE_URL.indexOf('xxxx') !== -1 || CONFIG.SUPABASE_ANON_KEY === 'eyJ...';
  var sb = DEMO_MODE ? null : window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  var CATEGORY_ORDER = ['掃除', '洗濯', '風呂', 'キッチン', 'ゴミ出し', '買い物・補充', 'その他'];
  var WEEK_START_HOUR = 7;
  var WEEK_END_HOUR = 24;
  var WEEK_TOTAL_HOURS = WEEK_END_HOUR - WEEK_START_HOUR;
  var HOUR_PX = 40;
  var LEVEL_ALPHA = [0.06, 0.35, 0.65, 1];
  var DEMO_LOGS_KEY = 'kajilog_demo_logs';
  var DEMO_CHORES_KEY = 'kajilog_demo_chores';
  var DEMO_USER_NAMES_KEY = 'kajilog_demo_user_names';

  var DURATION_LABELS = {
    under5: '5分未満',
    '5to10': '5〜10分',
    '10to15': '10〜15分',
    '15to20': '15〜20分'
  };

  var DEMO_CHORE_SEED = [
    ['掃除機', '掃除'], ['埃取り', '掃除'], ['散らかり片づける', '掃除'], ['トイレ掃除', '掃除'], ['洗面所掃除', '掃除'],
    ['洗濯機回す', '洗濯'], ['洗濯干す', '洗濯'], ['洗濯畳む', '洗濯'], ['シーツ洗い', '洗濯'],
    ['お風呂掃除(湯舟)', '風呂'], ['お風呂掃除(髪の毛取り)', '風呂'], ['お風呂掃除(洗い場)', '風呂'],
    ['お皿洗い(一人分)', 'キッチン'], ['お皿洗い(二人分)', 'キッチン'], ['キッチンシンク', 'キッチン'], ['コンロ', 'キッチン'],
    ['ゴミ出し(燃えるゴミ)', 'ゴミ出し'], ['ゴミ出し(ペットボトル)', 'ゴミ出し'], ['ゴミ出し(段ボール)', 'ゴミ出し'], ['ゴミ出し(缶)', 'ゴミ出し'],
    ['シャンプー・ソープ補充', '買い物・補充'], ['R1買う', '買い物・補充'], ['水買う', '買い物・補充'], ['水やり', 'その他']
  ];

  var state = {
    currentUser: localStorage.getItem('kajilog_currentUser') || 'a',
    currentView: 'record',
    userNames: { a: CONFIG.USERS.a.name, b: CONFIG.USERS.b.name },
    allChores: [],
    chores: [],
    choresById: {},
    grassMonth: startOfMonth(new Date()),
    weekStart: startOfWeekMonday(new Date()),
    summaryPeriod: 'week',
    summaryAnchor: new Date(),
    editingLogId: null,
    modalChoreId: null,
    editingChoreId: null,
  };

  // ---------- 日付ユーティリティ(すべて端末ローカル時刻で計算する) ----------

  function pad2(n) { return String(n).padStart(2, '0'); }

  function startOfDay(d) {
    var r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function startOfWeekMonday(d) {
    var r = startOfDay(d);
    var day = r.getDay();
    var diff = day === 0 ? 6 : day - 1;
    return addDays(r, -diff);
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }

  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function toDatetimeLocalValue(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function formatDateJp(d) {
    var wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + wd + ')';
  }

  function formatWeekLabel(weekStart) {
    var end = addDays(weekStart, 6);
    return (weekStart.getMonth() + 1) + '/' + weekStart.getDate() + ' – ' + (end.getMonth() + 1) + '/' + end.getDate();
  }

  // 7:00〜24:00の時間割上での表示位置(時)を求める。範囲外は呼び出し側で除外する。
  function getDisplaySlot(doneAtDate) {
    return {
      displayDate: startOfDay(doneAtDate),
      displayHour: doneAtDate.getHours() + doneAtDate.getMinutes() / 60
    };
  }

  // ---------- その他ユーティリティ ----------

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function hexToRgb(hex) {
    var m = hex.replace('#', '');
    if (m.length === 3) m = m.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(m, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  function countLevel(n) {
    if (n <= 0) return 0;
    if (n === 1) return 1;
    if (n <= 3) return 2;
    return 3;
  }

  // 「二人で」は縦の二色塗り分けで表現する(A/Bどちらの色でもないキャンディー縞は使わない)。
  function dotColorForUser(u) {
    if (u === 'a') return CONFIG.USERS.a.color;
    if (u === 'b') return CONFIG.USERS.b.color;
    return 'linear-gradient(90deg,' + CONFIG.USERS.a.color + ' 50%,' + CONFIG.USERS.b.color + ' 50%)';
  }

  var toastTimer = null;
  function showToast(msg, isError) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2400);
  }

  function groupChoresByCategory(chores) {
    var map = new Map();
    chores.forEach(function (c) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category).push(c);
    });
    var orderedKeys = CATEGORY_ORDER.filter(function (k) { return map.has(k); })
      .concat(Array.from(map.keys()).filter(function (k) { return CATEGORY_ORDER.indexOf(k) === -1; }));
    return orderedKeys.map(function (k) { return { category: k, items: map.get(k) }; });
  }

  // ---------- 初期化 ----------

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindHeaderEvents();
    bindTabBar();
    bindModalEvents();
    bindSheetEvents();
    bindGrassNav();
    bindWeekNav();
    bindSummaryNav();
    bindSettingsEvents();
    bindChoreModalEvents();

    state.userNames = await loadUserNames();
    applyUserTheme();
    await loadChores();
    renderCurrentView();
  }

  function applyUserTheme() {
    document.documentElement.style.setProperty('--color-a', CONFIG.USERS.a.color);
    document.documentElement.style.setProperty('--color-b', CONFIG.USERS.b.color);

    document.querySelector('.user-toggle-btn[data-user="a"]').textContent = state.userNames.a;
    document.querySelector('.user-toggle-btn[data-user="b"]').textContent = state.userNames.b;
    updateUserToggleUI();

    document.querySelector('#doneBySegment .segment-btn[data-value="a"]').textContent = state.userNames.a;
    document.querySelector('#doneBySegment .segment-btn[data-value="b"]').textContent = state.userNames.b;

    document.querySelector('.grass-legend').innerHTML =
      '<span class="legend-swatch" style="background:' + CONFIG.USERS.a.color + '"></span>' + escapeHtml(state.userNames.a) + '=上半分&emsp;' +
      '<span class="legend-swatch" style="background:' + CONFIG.USERS.b.color + '"></span>' + escapeHtml(state.userNames.b) + '=下半分';
  }

  function updateUserToggleUI() {
    document.querySelectorAll('.user-toggle-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.user === state.currentUser);
    });
  }

  function bindHeaderEvents() {
    document.getElementById('userToggle').addEventListener('click', function (e) {
      var btn = e.target.closest('.user-toggle-btn');
      if (!btn) return;
      state.currentUser = btn.dataset.user;
      localStorage.setItem('kajilog_currentUser', state.currentUser);
      updateUserToggleUI();
    });
  }

  function bindTabBar() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchView(btn.dataset.view); });
    });
  }

  function switchView(view) {
    state.currentView = view;
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(function (sec) {
      sec.classList.toggle('hidden', sec.id !== 'view-' + view);
    });
    renderCurrentView();
  }

  function renderCurrentView() {
    if (state.currentView === 'record') renderRecordView();
    else if (state.currentView === 'grass') renderGrassView();
    else if (state.currentView === 'week') renderWeekView();
    else if (state.currentView === 'summary') renderSummaryView();
  }

  function finalizeChores() {
    state.allChores.sort(function (a, b) { return a.sort_order - b.sort_order; });
    state.choresById = {};
    state.allChores.forEach(function (c) { state.choresById[c.id] = c; });
    state.chores = state.allChores.filter(function (c) { return c.is_active; });
  }

  async function loadChores() {
    if (DEMO_MODE) {
      state.allChores = readDemoChores();
      finalizeChores();
      seedDemoLogsIfEmpty();
      document.getElementById('demoBadge').classList.remove('hidden');
      showToast('Supabase未設定のため、この端末だけのデモモードで表示しています');
      return;
    }
    var res = await sb.from('chores').select('*');
    if (res.error) {
      showToast('家事一覧の取得に失敗しました。電波状況を確認してもう一度お試しください。', true);
      state.allChores = [];
      finalizeChores();
      return;
    }
    state.allChores = res.data;
    finalizeChores();
  }

  // ---------- デモモード(Supabase未設定時、この端末のlocalStorageのみで完結する) ----------

  function readDemoLogs() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_LOGS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function writeDemoLogs(logs) {
    localStorage.setItem(DEMO_LOGS_KEY, JSON.stringify(logs));
  }

  function readDemoChores() {
    try {
      var saved = JSON.parse(localStorage.getItem(DEMO_CHORES_KEY) || 'null');
      if (saved && saved.length) return saved;
    } catch (e) { /* ignore, fall through to seed */ }
    var seeded = DEMO_CHORE_SEED.map(function (item, index) {
      return { id: 'demo-' + (index + 1), name: item[0], category: item[1], duration_bucket: 'under5', sort_order: index + 1, is_active: true };
    });
    writeDemoChores(seeded);
    return seeded;
  }

  function writeDemoChores(chores) {
    localStorage.setItem(DEMO_CHORES_KEY, JSON.stringify(chores));
  }

  function readDemoUserNames() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_USER_NAMES_KEY) || 'null') || {};
    } catch (e) {
      return {};
    }
  }

  function writeDemoUserNames(names) {
    localStorage.setItem(DEMO_USER_NAMES_KEY, JSON.stringify(names));
  }

  function seedDemoLogsIfEmpty() {
    if (readDemoLogs().length) return;
    var chores = state.allChores.length ? state.allChores : readDemoChores();
    var doneByOptions = ['a', 'a', 'b', 'b', 'both'];
    var logs = [];
    var uid = 1;
    for (var dayOffset = 44; dayOffset >= 0; dayOffset--) {
      var day = addDays(startOfDay(new Date()), -dayOffset);
      var entriesToday = Math.floor(Math.random() * 4);
      for (var i = 0; i < entriesToday; i++) {
        var chore = chores[Math.floor(Math.random() * chores.length)];
        var hour = Math.random() < 0.06 ? Math.floor(Math.random() * 4) : Math.floor(Math.random() * 19) + 6;
        var minute = Math.floor(Math.random() * 60);
        var doneAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
        logs.push({
          id: 'demo-log-' + (uid++),
          chore_id: chore.id,
          done_by: doneByOptions[Math.floor(Math.random() * doneByOptions.length)],
          done_at: doneAt.toISOString(),
          created_at: doneAt.toISOString()
        });
      }
    }
    writeDemoLogs(logs);
  }

  // 以降、記録・家事マスタ・表示名の取得/保存/削除はこれらの関数を経由する。
  // デモモードではlocalStorage、通常モードではSupabaseにアクセスする。

  async function fetchLogsRange(startDate, endDate) {
    if (DEMO_MODE) {
      var logs = readDemoLogs().filter(function (log) {
        var t = new Date(log.done_at);
        return t >= startDate && t < endDate;
      });
      return { data: logs, error: null };
    }
    return await sb.from('logs').select('*')
      .gte('done_at', startDate.toISOString())
      .lt('done_at', endDate.toISOString());
  }

  async function insertLogRecord(payload) {
    if (DEMO_MODE) {
      var logs = readDemoLogs();
      logs.push({
        id: 'demo-log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        chore_id: payload.chore_id,
        done_by: payload.done_by,
        done_at: payload.done_at,
        created_at: new Date().toISOString()
      });
      writeDemoLogs(logs);
      return { error: null };
    }
    return await sb.from('logs').insert(payload);
  }

  async function updateLogRecord(id, payload) {
    if (DEMO_MODE) {
      var logs = readDemoLogs();
      var idx = logs.findIndex(function (l) { return l.id === id; });
      if (idx >= 0) logs[idx] = Object.assign({}, logs[idx], payload);
      writeDemoLogs(logs);
      return { error: null };
    }
    return await sb.from('logs').update(payload).eq('id', id);
  }

  async function deleteLogRecord(id) {
    if (DEMO_MODE) {
      writeDemoLogs(readDemoLogs().filter(function (l) { return l.id !== id; }));
      return { error: null };
    }
    return await sb.from('logs').delete().eq('id', id);
  }

  async function loadUserNames() {
    if (DEMO_MODE) {
      var saved = readDemoUserNames();
      return { a: saved.a || CONFIG.USERS.a.name, b: saved.b || CONFIG.USERS.b.name };
    }
    var res = await sb.from('app_users').select('*');
    var names = { a: CONFIG.USERS.a.name, b: CONFIG.USERS.b.name };
    if (res.error || !res.data) return names;
    res.data.forEach(function (row) {
      if (row.id === 'a' || row.id === 'b') names[row.id] = row.name;
    });
    return names;
  }

  async function saveUserNames(names) {
    if (DEMO_MODE) {
      writeDemoUserNames(names);
      return { error: null };
    }
    return await sb.from('app_users').upsert([
      { id: 'a', name: names.a, color: CONFIG.USERS.a.color },
      { id: 'b', name: names.b, color: CONFIG.USERS.b.color }
    ]);
  }

  async function upsertChore(chore) {
    if (DEMO_MODE) {
      var list = readDemoChores();
      if (chore.id) {
        var idx = list.findIndex(function (c) { return c.id === chore.id; });
        if (idx >= 0) list[idx] = Object.assign({}, list[idx], chore);
      } else {
        var maxOrder = list.reduce(function (m, c) { return Math.max(m, c.sort_order || 0); }, 0);
        list.push({
          id: 'demo-chore-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          name: chore.name,
          category: chore.category,
          duration_bucket: chore.duration_bucket,
          sort_order: maxOrder + 1,
          is_active: true
        });
      }
      writeDemoChores(list);
      return { error: null };
    }
    if (chore.id) {
      return await sb.from('chores').update({
        name: chore.name,
        category: chore.category,
        duration_bucket: chore.duration_bucket
      }).eq('id', chore.id);
    }
    var maxOrder2 = state.allChores.reduce(function (m, c) { return Math.max(m, c.sort_order || 0); }, 0);
    return await sb.from('chores').insert({
      name: chore.name,
      category: chore.category,
      duration_bucket: chore.duration_bucket,
      sort_order: maxOrder2 + 1,
      is_active: true
    });
  }

  async function toggleChoreActive(id, isActive) {
    if (DEMO_MODE) {
      var list = readDemoChores();
      var idx = list.findIndex(function (c) { return c.id === id; });
      if (idx >= 0) { list[idx].is_active = isActive; writeDemoChores(list); }
      return { error: null };
    }
    return await sb.from('chores').update({ is_active: isActive }).eq('id', id);
  }

  // ---------- 記録タブ ----------

  function renderRecordView() {
    var listEl = document.getElementById('choreList');
    listEl.innerHTML = '';
    if (!state.chores.length) {
      listEl.innerHTML = '<div class="empty-state">表示できる家事がありません。設定から家事を追加してください</div>';
      return;
    }
    groupChoresByCategory(state.chores).forEach(function (g) {
      var catDiv = document.createElement('div');
      catDiv.className = 'chore-category';
      var title = document.createElement('div');
      title.className = 'chore-category-title';
      title.textContent = g.category;
      catDiv.appendChild(title);
      g.items.forEach(function (chore) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'chore-row';
        row.innerHTML = '<span>' + escapeHtml(chore.name) + '</span><span class="chore-row-arrow">›</span>';
        row.addEventListener('click', function () { openRecordModal({ choreId: chore.id }); });
        catDiv.appendChild(row);
      });
      listEl.appendChild(catDiv);
    });
  }

  // ---------- 記録モーダル ----------

  function openRecordModal(opts) {
    var log = opts.log;
    state.modalChoreId = opts.choreId || (log && log.chore_id);
    state.editingLogId = log ? log.id : null;
    var chore = state.choresById[state.modalChoreId];
    document.getElementById('recordModalTitle').textContent = chore ? chore.name : '(削除済みの家事)';

    var durationEl = document.getElementById('recordModalDuration');
    if (chore && DURATION_LABELS[chore.duration_bucket]) {
      durationEl.textContent = '目安時間: ' + DURATION_LABELS[chore.duration_bucket];
      durationEl.classList.remove('hidden');
    } else {
      durationEl.classList.add('hidden');
    }

    setSegmentValue('doneBySegment', log ? log.done_by : state.currentUser);
    styleDoneBySegment();

    var doneAt = log ? new Date(log.done_at) : new Date();
    document.getElementById('doneAtInput').value = toDatetimeLocalValue(doneAt);

    document.getElementById('deleteLogBtn').classList.toggle('hidden', !log);
    document.getElementById('recordModal').classList.remove('hidden');
  }

  function closeRecordModal() {
    document.getElementById('recordModal').classList.add('hidden');
    state.modalChoreId = null;
    state.editingLogId = null;
  }

  function setSegmentValue(containerId, value) {
    document.querySelectorAll('#' + containerId + ' .segment-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  function getSegmentValue(containerId) {
    var active = document.querySelector('#' + containerId + ' .segment-btn.active');
    return active ? active.dataset.value : null;
  }

  function styleDoneBySegment() {
    document.querySelectorAll('#doneBySegment .segment-btn').forEach(function (btn) {
      if (btn.classList.contains('active')) {
        btn.style.background = dotColorForUser(btn.dataset.value);
        btn.style.borderColor = 'transparent';
        btn.style.color = '#fff';
      } else {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    });
  }

  function bindModalEvents() {
    document.getElementById('doneBySegment').addEventListener('click', function (e) {
      var btn = e.target.closest('.segment-btn');
      if (!btn) return;
      setSegmentValue('doneBySegment', btn.dataset.value);
      styleDoneBySegment();
    });
    document.getElementById('cancelRecordBtn').addEventListener('click', closeRecordModal);
    document.getElementById('saveRecordBtn').addEventListener('click', saveRecord);
    document.getElementById('deleteLogBtn').addEventListener('click', deleteRecordFromModal);
    document.getElementById('recordModal').addEventListener('click', function (e) {
      if (e.target.id === 'recordModal') closeRecordModal();
    });
  }

  async function saveRecord() {
    var doneBy = getSegmentValue('doneBySegment');
    var doneAtStr = document.getElementById('doneAtInput').value;
    if (!doneBy || !doneAtStr) {
      showToast('実施者と日時を入力してください。', true);
      return;
    }
    var doneAtIso = new Date(doneAtStr).toISOString();
    var saveBtn = document.getElementById('saveRecordBtn');
    saveBtn.disabled = true;
    try {
      var error;
      if (state.editingLogId) {
        ({ error } = await updateLogRecord(state.editingLogId, { done_by: doneBy, done_at: doneAtIso }));
      } else {
        ({ error } = await insertLogRecord({ chore_id: state.modalChoreId, done_by: doneBy, done_at: doneAtIso }));
      }
      if (error) throw error;
      closeRecordModal();
      closeListSheet();
      showToast('記録しました');
      renderCurrentView();
    } catch (err) {
      showToast('保存できませんでした。電波状況を確認してもう一度お試しください。', true);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function deleteRecordFromModal() {
    if (!state.editingLogId) return;
    await deleteLogById(state.editingLogId);
    closeRecordModal();
  }

  async function quickDeleteLog(id) {
    await deleteLogById(id);
  }

  async function deleteLogById(id) {
    if (!confirm('この記録を削除しますか？')) return;
    try {
      var { error } = await deleteLogRecord(id);
      if (error) throw error;
      closeListSheet();
      showToast('削除しました');
      renderCurrentView();
    } catch (err) {
      showToast('削除できませんでした。電波状況を確認してもう一度お試しください。', true);
    }
  }

  // ---------- 一覧ボトムシート(カレンダータブ・週タブ共通) ----------

  function openListSheet(title, logs) {
    document.getElementById('listSheetTitle').textContent = title;
    var body = document.getElementById('listSheetBody');
    body.innerHTML = '';
    if (!logs.length) {
      body.innerHTML = '<div class="empty-state">記録はありません</div>';
    }
    logs.slice().sort(function (a, b) { return new Date(a.done_at) - new Date(b.done_at); }).forEach(function (log) {
      var chore = state.choresById[log.chore_id];
      var item = document.createElement('div');
      item.className = 'sheet-item';

      var dot = document.createElement('span');
      dot.className = 'sheet-item-dot';
      dot.style.background = dotColorForUser(log.done_by);

      var main = document.createElement('div');
      main.className = 'sheet-item-main';
      var t = new Date(log.done_at);
      main.innerHTML = '<div class="sheet-item-time">' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + '</div>' +
        '<div class="sheet-item-name">' + escapeHtml(chore ? chore.name : '(削除済みの家事)') + '</div>';

      var actions = document.createElement('div');
      actions.className = 'sheet-item-actions';
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'icon-btn';
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', function () { openRecordModal({ log: log }); });
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-btn';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', function () { quickDeleteLog(log.id); });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      item.appendChild(dot);
      item.appendChild(main);
      item.appendChild(actions);
      body.appendChild(item);
    });
    document.getElementById('listSheet').classList.remove('hidden');
  }

  function closeListSheet() {
    document.getElementById('listSheet').classList.add('hidden');
  }

  function bindSheetEvents() {
    document.getElementById('closeListSheetBtn').addEventListener('click', closeListSheet);
    document.getElementById('listSheet').addEventListener('click', function (e) {
      if (e.target.id === 'listSheet') closeListSheet();
    });
  }

  // ---------- カレンダータブ ----------

  function bindGrassNav() {
    document.getElementById('grassPrevBtn').addEventListener('click', function () {
      state.grassMonth = addMonths(state.grassMonth, -1);
      renderGrassView();
    });
    document.getElementById('grassNextBtn').addEventListener('click', function () {
      state.grassMonth = addMonths(state.grassMonth, 1);
      renderGrassView();
    });
  }

  function countTextColor(level) {
    return level >= 2 ? '#fff' : 'rgba(28,31,32,0.72)';
  }

  async function renderGrassView() {
    document.getElementById('grassMonthLabel').textContent =
      state.grassMonth.getFullYear() + '年' + (state.grassMonth.getMonth() + 1) + '月';

    var rangeStart = state.grassMonth;
    var rangeEnd = addMonths(state.grassMonth, 1);
    var res = await fetchLogsRange(rangeStart, rangeEnd);

    var grid = document.getElementById('grassGrid');
    var summaryEl = document.getElementById('grassSummary');

    if (res.error) {
      grid.innerHTML = '';
      summaryEl.innerHTML = '<div class="empty-state">読み込みに失敗しました。電波状況を確認してもう一度お試しください。</div>';
      return;
    }
    var data = res.data;

    var byDay = {};
    data.forEach(function (log) {
      var key = dateKey(new Date(log.done_at));
      if (!byDay[key]) byDay[key] = { a: 0, b: 0, logs: [] };
      byDay[key].logs.push(log);
      if (log.done_by === 'a' || log.done_by === 'both') byDay[key].a++;
      if (log.done_by === 'b' || log.done_by === 'both') byDay[key].b++;
    });

    grid.innerHTML = '';
    var leadingBlank = rangeStart.getDay() === 0 ? 6 : rangeStart.getDay() - 1;
    for (var i = 0; i < leadingBlank; i++) {
      var blank = document.createElement('div');
      blank.className = 'grass-cell empty';
      grid.appendChild(blank);
    }
    var daysInMonth = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0).getDate();
    for (var d = 1; d <= daysInMonth; d++) {
      var date = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), d);
      var key2 = dateKey(date);
      var info = byDay[key2] || { a: 0, b: 0, logs: [] };
      var cell = document.createElement('div');
      cell.className = 'grass-cell';

      var levelA = countLevel(info.a);
      var levelB = countLevel(info.b);

      var topHalf = document.createElement('div');
      topHalf.className = 'grass-cell-half';
      topHalf.style.background = rgba(CONFIG.USERS.a.color, LEVEL_ALPHA[levelA]);
      if (info.a > 0) {
        var countA = document.createElement('span');
        countA.className = 'grass-cell-count';
        countA.style.color = countTextColor(levelA);
        countA.textContent = String(info.a);
        topHalf.appendChild(countA);
      }

      var bottomHalf = document.createElement('div');
      bottomHalf.className = 'grass-cell-half';
      bottomHalf.style.background = rgba(CONFIG.USERS.b.color, LEVEL_ALPHA[levelB]);
      if (info.b > 0) {
        var countB = document.createElement('span');
        countB.className = 'grass-cell-count';
        countB.style.color = countTextColor(levelB);
        countB.textContent = String(info.b);
        bottomHalf.appendChild(countB);
      }

      var dateLabel = document.createElement('span');
      dateLabel.className = 'grass-cell-date';
      dateLabel.textContent = String(d);

      cell.appendChild(dateLabel);
      cell.appendChild(topHalf);
      cell.appendChild(bottomHalf);
      cell.addEventListener('click', function (dateArg, logsArg) {
        return function () { openListSheet(formatDateJp(dateArg), logsArg); };
      }(date, info.logs));
      grid.appendChild(cell);
    }

    var sumA = 0, sumB = 0, sumBoth = 0;
    data.forEach(function (log) {
      if (log.done_by === 'a') sumA++;
      else if (log.done_by === 'b') sumB++;
      else { sumA++; sumB++; sumBoth++; }
    });
    summaryEl.innerHTML = '今月: ' + escapeHtml(state.userNames.a) + ' ' + sumA + '件 / ' +
      escapeHtml(state.userNames.b) + ' ' + sumB + '件<br>うち二人で ' + sumBoth + '件';
  }

  // ---------- 週タブ ----------

  function bindWeekNav() {
    document.getElementById('weekPrevBtn').addEventListener('click', function () {
      state.weekStart = addDays(state.weekStart, -7);
      renderWeekView();
    });
    document.getElementById('weekNextBtn').addEventListener('click', function () {
      state.weekStart = addDays(state.weekStart, 7);
      renderWeekView();
    });
    document.getElementById('weekTodayBtn').addEventListener('click', function () {
      state.weekStart = startOfWeekMonday(new Date());
      renderWeekView();
    });
  }

  async function renderWeekView() {
    document.getElementById('weekLabel').textContent = formatWeekLabel(state.weekStart);

    var res = await fetchLogsRange(state.weekStart, addDays(state.weekStart, 7));

    var timetable = document.getElementById('weekTimetable');
    if (res.error) {
      timetable.innerHTML = '<div class="empty-state">読み込みに失敗しました。電波状況を確認してもう一度お試しください。</div>';
      return;
    }

    var dayBuckets = {};
    var dayKeysInOrder = [];
    for (var i = 0; i < 7; i++) {
      var k = dateKey(addDays(state.weekStart, i));
      dayKeysInOrder.push(k);
      dayBuckets[k] = [];
    }

    res.data.forEach(function (log) {
      var slot = getDisplaySlot(new Date(log.done_at));
      if (slot.displayHour < WEEK_START_HOUR || slot.displayHour >= WEEK_END_HOUR) return;
      var key = dateKey(slot.displayDate);
      if (dayBuckets[key]) dayBuckets[key].push({ log: log, displayHour: slot.displayHour });
    });

    buildWeekTimetableDom(timetable, dayKeysInOrder, dayBuckets);
  }

  function buildWeekTimetableDom(container, dayKeysInOrder, dayBuckets) {
    container.innerHTML = '';
    container.style.setProperty('--hour-px', HOUR_PX + 'px');

    var corner = document.createElement('div');
    corner.className = 'week-time-axis';
    corner.style.height = '24px';
    container.appendChild(corner);

    var weekdayNames = ['月', '火', '水', '木', '金', '土', '日'];
    dayKeysInOrder.forEach(function (key, i) {
      var parts = key.split('-');
      var header = document.createElement('div');
      header.className = 'week-day-header';
      header.textContent = Number(parts[1]) + '/' + Number(parts[2]) + '(' + weekdayNames[i] + ')';
      container.appendChild(header);
    });

    var axis = document.createElement('div');
    axis.className = 'week-time-axis';
    axis.style.height = (WEEK_TOTAL_HOURS * HOUR_PX) + 'px';
    for (var h = WEEK_START_HOUR; h <= WEEK_END_HOUR; h++) {
      var lbl = document.createElement('span');
      lbl.className = 'week-time-label';
      lbl.style.top = ((h - WEEK_START_HOUR) * HOUR_PX) + 'px';
      lbl.textContent = (h % 24) + ':00';
      axis.appendChild(lbl);
    }
    container.appendChild(axis);

    dayKeysInOrder.forEach(function (key) {
      var col = document.createElement('div');
      col.className = 'week-day-col';
      col.style.height = (WEEK_TOTAL_HOURS * HOUR_PX) + 'px';

      var buckets = groupByTimeSlot(dayBuckets[key]);
      buckets.forEach(function (bucket) {
        var top = (bucket.hour - WEEK_START_HOUR) * HOUR_PX;
        var maxShow = 3;
        var shown = bucket.items.slice(0, maxShow);
        var overflow = bucket.items.length - shown.length;
        var slotCount = shown.length + (overflow > 0 ? 1 : 0);
        var widthPct = 100 / slotCount;

        shown.forEach(function (item, idx) {
          var chip = document.createElement('div');
          chip.className = 'week-chip';
          chip.style.background = dotColorForUser(item.log.done_by);
          chip.style.top = top + 'px';
          chip.style.height = '18px';
          chip.style.left = (idx * widthPct) + '%';
          chip.style.width = Math.max(widthPct - 2, 4) + '%';
          var chore = state.choresById[item.log.chore_id];
          chip.textContent = chore ? chore.name.slice(0, 4) : '?';
          chip.addEventListener('click', function () {
            openListSheet('この時間帯の記録', bucket.items.map(function (i) { return i.log; }));
          });
          col.appendChild(chip);
        });
        if (overflow > 0) {
          var more = document.createElement('div');
          more.className = 'week-chip week-chip-more';
          more.style.top = top + 'px';
          more.style.height = '18px';
          more.style.left = (shown.length * widthPct) + '%';
          more.style.width = Math.max(widthPct - 2, 4) + '%';
          more.textContent = '+' + overflow;
          more.addEventListener('click', function () {
            openListSheet('この時間帯の記録', bucket.items.map(function (i) { return i.log; }));
          });
          col.appendChild(more);
        }
      });

      container.appendChild(col);
    });
  }

  function groupByTimeSlot(entries) {
    var map = new Map();
    entries.forEach(function (item) {
      var rounded = Math.round(item.displayHour * 4) / 4;
      if (!map.has(rounded)) map.set(rounded, []);
      map.get(rounded).push(item);
    });
    return Array.from(map.entries())
      .map(function (e) { return { hour: e[0], items: e[1] }; })
      .sort(function (a, b) { return a.hour - b.hour; });
  }

  // ---------- 集計タブ ----------

  function bindSummaryNav() {
    document.getElementById('summaryPeriodToggle').addEventListener('click', function (e) {
      var btn = e.target.closest('.segment-btn');
      if (!btn) return;
      state.summaryPeriod = btn.dataset.period;
      document.querySelectorAll('#summaryPeriodToggle .segment-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      state.summaryAnchor = new Date();
      renderSummaryView();
    });
    document.getElementById('summaryPrevBtn').addEventListener('click', function () {
      shiftSummaryAnchor(-1);
      renderSummaryView();
    });
    document.getElementById('summaryNextBtn').addEventListener('click', function () {
      shiftSummaryAnchor(1);
      renderSummaryView();
    });
  }

  function shiftSummaryAnchor(dir) {
    if (state.summaryPeriod === 'week') {
      state.summaryAnchor = addDays(state.summaryAnchor, dir * 7);
    } else {
      state.summaryAnchor = addMonths(startOfMonth(state.summaryAnchor), dir);
    }
  }

  function getSummaryRange() {
    if (state.summaryPeriod === 'week') {
      var start = startOfWeekMonday(state.summaryAnchor);
      return { start: start, end: addDays(start, 7), label: formatWeekLabel(start) };
    }
    var mStart = startOfMonth(state.summaryAnchor);
    return { start: mStart, end: addMonths(mStart, 1), label: mStart.getFullYear() + '年' + (mStart.getMonth() + 1) + '月' };
  }

  async function renderSummaryView() {
    var range = getSummaryRange();
    document.getElementById('summaryLabel').textContent = range.label;

    var res = await fetchLogsRange(range.start, range.end);

    var barsEl = document.getElementById('summaryBars');
    var tbody = document.getElementById('summaryTableBody');

    if (res.error) {
      barsEl.innerHTML = '<div class="empty-state">読み込みに失敗しました。電波状況を確認してもう一度お試しください。</div>';
      tbody.innerHTML = '';
      return;
    }
    var data = res.data;

    var countA = 0, countB = 0, countBoth = 0;
    var perChore = {};
    data.forEach(function (log) {
      if (!perChore[log.chore_id]) perChore[log.chore_id] = { aRaw: 0, bRaw: 0, bothRaw: 0 };
      var p = perChore[log.chore_id];
      if (log.done_by === 'a') { countA++; p.aRaw++; }
      else if (log.done_by === 'b') { countB++; p.bRaw++; }
      else { countA++; countB++; countBoth++; p.bothRaw++; }
    });

    var maxCount = Math.max(countA, countB, 1);
    barsEl.innerHTML =
      barRowHtml(state.userNames.a, countA, maxCount, CONFIG.USERS.a.color) +
      barRowHtml(state.userNames.b, countB, maxCount, CONFIG.USERS.b.color) +
      '<div class="summary-both-note">うち二人で: ' + countBoth + '件</div>';

    var rows = Object.keys(perChore).map(function (id) {
      var p = perChore[id];
      var chore = state.choresById[id];
      return {
        name: chore ? chore.name : '(削除済み)',
        a: p.aRaw + p.bothRaw,
        b: p.bRaw + p.bothRaw,
        both: p.bothRaw,
        total: p.aRaw + p.bRaw + p.bothRaw
      };
    }).sort(function (x, y) { return y.total - x.total; });

    tbody.innerHTML = rows.length ? rows.map(function (r) {
      return '<tr><td>' + escapeHtml(r.name) + '</td><td>' + r.a + '</td><td>' + r.b + '</td><td>' + r.both + '</td><td>' + r.total + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty-state">記録はありません</td></tr>';
  }

  function barRowHtml(name, count, max, color) {
    var pct = Math.round((count / max) * 100);
    return '<div class="summary-bar-row">' +
      '<div class="summary-bar-label">' + escapeHtml(name) + '</div>' +
      '<div class="summary-bar-track"><div class="summary-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="summary-bar-count">' + count + '</div>' +
      '</div>';
  }

  // ---------- 設定シート(表示名・家事マスタ管理) ----------

  function bindSettingsEvents() {
    document.getElementById('settingsBtn').addEventListener('click', openSettingsSheet);
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsSheet);
    document.getElementById('settingsSheet').addEventListener('click', function (e) {
      if (e.target.id === 'settingsSheet') closeSettingsSheet();
    });
    document.getElementById('saveNamesBtn').addEventListener('click', saveNamesFromSettings);
    document.getElementById('addChoreBtn').addEventListener('click', function () { openChoreModal(null); });
  }

  function openSettingsSheet() {
    document.getElementById('userNameAInput').value = state.userNames.a;
    document.getElementById('userNameBInput').value = state.userNames.b;
    renderChoreManageList();
    document.getElementById('settingsSheet').classList.remove('hidden');
  }

  function closeSettingsSheet() {
    document.getElementById('settingsSheet').classList.add('hidden');
  }

  async function saveNamesFromSettings() {
    var nameA = document.getElementById('userNameAInput').value.trim();
    var nameB = document.getElementById('userNameBInput').value.trim();
    if (!nameA || !nameB) {
      showToast('名前を入力してください。', true);
      return;
    }
    var res = await saveUserNames({ a: nameA, b: nameB });
    if (res.error) {
      showToast('保存できませんでした。電波状況を確認してもう一度お試しください。', true);
      return;
    }
    state.userNames = { a: nameA, b: nameB };
    applyUserTheme();
    showToast('名前を保存しました');
  }

  function renderChoreManageList() {
    var listEl = document.getElementById('choreManageList');
    listEl.innerHTML = '';
    var sorted = state.allChores.slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
    if (!sorted.length) {
      listEl.innerHTML = '<div class="empty-state">家事がまだありません</div>';
      return;
    }
    sorted.forEach(function (chore) {
      var row = document.createElement('div');
      row.className = 'chore-manage-row' + (chore.is_active ? '' : ' is-inactive');

      var toggleLabel = document.createElement('label');
      toggleLabel.className = 'chore-active-toggle';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = chore.is_active;
      checkbox.addEventListener('change', function () { handleToggleChoreActive(chore.id, checkbox.checked); });
      toggleLabel.appendChild(checkbox);

      var main = document.createElement('div');
      main.className = 'chore-manage-main';
      main.innerHTML = '<div class="chore-manage-name">' + escapeHtml(chore.name) + '</div>' +
        '<div class="chore-manage-meta">' + escapeHtml(chore.category) + ' ・ ' + escapeHtml(DURATION_LABELS[chore.duration_bucket] || '') + '</div>';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'icon-btn';
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', function () { openChoreModal(chore); });

      row.appendChild(toggleLabel);
      row.appendChild(main);
      row.appendChild(editBtn);
      listEl.appendChild(row);
    });
  }

  async function handleToggleChoreActive(id, isActive) {
    var res = await toggleChoreActive(id, isActive);
    if (res.error) {
      showToast('更新できませんでした。電波状況を確認してもう一度お試しください。', true);
      renderChoreManageList();
      return;
    }
    var chore = state.choresById[id];
    if (chore) chore.is_active = isActive;
    state.chores = state.allChores.filter(function (c) { return c.is_active; });
    renderChoreManageList();
    if (state.currentView === 'record') renderRecordView();
  }

  // ---------- 家事の追加・編集モーダル ----------

  function bindChoreModalEvents() {
    document.getElementById('choreDurationSegment').addEventListener('click', function (e) {
      var btn = e.target.closest('.segment-btn');
      if (!btn) return;
      setSegmentValue('choreDurationSegment', btn.dataset.value);
    });
    document.getElementById('cancelChoreBtn').addEventListener('click', closeChoreModal);
    document.getElementById('saveChoreBtn').addEventListener('click', saveChoreFromModal);
    document.getElementById('choreModal').addEventListener('click', function (e) {
      if (e.target.id === 'choreModal') closeChoreModal();
    });
  }

  function openChoreModal(chore) {
    state.editingChoreId = chore ? chore.id : null;
    document.getElementById('choreModalTitle').textContent = chore ? '家事を編集' : '家事を追加';
    document.getElementById('choreNameInput').value = chore ? chore.name : '';
    document.getElementById('choreCategoryInput').value = chore ? chore.category : '';
    updateCategoryOptions();
    setSegmentValue('choreDurationSegment', chore ? chore.duration_bucket : 'under5');
    document.getElementById('choreModal').classList.remove('hidden');
  }

  function closeChoreModal() {
    document.getElementById('choreModal').classList.add('hidden');
    state.editingChoreId = null;
  }

  function updateCategoryOptions() {
    var datalist = document.getElementById('categoryOptions');
    var cats = Array.from(new Set(state.allChores.map(function (c) { return c.category; })));
    datalist.innerHTML = cats.map(function (c) { return '<option value="' + escapeHtml(c) + '"></option>'; }).join('');
  }

  async function saveChoreFromModal() {
    var name = document.getElementById('choreNameInput').value.trim();
    var category = document.getElementById('choreCategoryInput').value.trim();
    var duration = getSegmentValue('choreDurationSegment');
    if (!name || !category || !duration) {
      showToast('家事名・カテゴリ・目安時間を入力してください。', true);
      return;
    }
    var saveBtn = document.getElementById('saveChoreBtn');
    saveBtn.disabled = true;
    try {
      var res = await upsertChore({ id: state.editingChoreId, name: name, category: category, duration_bucket: duration });
      if (res.error) throw res.error;
      closeChoreModal();
      await loadChores();
      renderChoreManageList();
      if (state.currentView === 'record') renderRecordView();
      showToast('保存しました');
    } catch (err) {
      showToast('保存できませんでした。電波状況を確認してもう一度お試しください。', true);
    } finally {
      saveBtn.disabled = false;
    }
  }

})();
