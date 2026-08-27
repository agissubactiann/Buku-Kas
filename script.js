const CATEGORIES = {
  income: ["Gaji", "Bonus", "Usaha", "Investasi", "Lainnya"],
  expense: ["Makanan", "Transportasi", "Belanja", "Tagihan", "Hiburan", "Kesehatan", "Pendidikan", "Lainnya"],
};
const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_LABELS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const STORAGE_KEY = "buku-kas-transactions";
const NAME_KEY = "buku-kas-username";
const BALANCE_KEY = "buku-kas-saldo-awal";
const BALANCE_SET_KEY = "buku-kas-saldo-set";

let userName = "";
let startingBalance = 0;
let balanceSet = false;
let transactions = [];

let activeTab = "harian"; // harian | mingguan | bulanan | history
let pendingSource = "harian";
let editingId = null;
let editingSource = null;
let confirmDeleteId = null;
let formType = "expense";

let historySubView = "calendar";
let historyCalAnchor = new Date();
let historySelectedDate = null;
let historyMonthsYear = new Date().getFullYear();
let historySelectedMonth = null; // {year, month(0-11)}

/* ---------- helpers ---------- */
function toISO(d) {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}
function todayISO() {
  return toISO(new Date());
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatIDR(n) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.round(n || 0));
}
function formatShort(n) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "jt";
  if (abs >= 1000) return (n / 1000).toFixed(0) + "rb";
  return String(Math.round(n));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function animateNumberText(el, toValue, duration = 600) {
  const fromValue = parseFloat(el.dataset.rawValue || "0");
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatIDR(fromValue + (toValue - fromValue) * eased);
    if (p < 1) requestAnimationFrame(step);
    else {
      el.textContent = formatIDR(toValue);
      el.dataset.rawValue = toValue;
    }
  }
  requestAnimationFrame(step);
}
function shakeEl(el) {
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

/* ---------- nama pengguna ---------- */
function loadName() {
  try {
    userName = localStorage.getItem(NAME_KEY) || "";
  } catch (e) {
    userName = "";
  }
}
function saveName(name) {
  userName = name;
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (e) {
    console.error("Gagal menyimpan nama", e);
  }
  updateBrandTitle();
}
function updateBrandTitle() {
  document.getElementById("brandTitle").textContent = userName ? `Buku Kas ${userName}` : "Buku Kas";
}
function openNameForm(isRename) {
  document.getElementById("fName").value = isRename ? userName : "";
  document.getElementById("nameError").style.display = "none";
  document.getElementById("nameModalTitle").textContent = isRename ? "Ubah nama" : "Selamat datang";
  document.getElementById("nameModalDesc").textContent = isRename ? "Ganti nama pemilik buku kas ini." : "Siapa nama pemilik buku kas ini?";
  document.getElementById("nameCloseBtn").style.display = isRename ? "block" : "none";
  document.getElementById("nameOverlay").classList.add("open");
}
function closeNameForm() {
  if (!userName) return;
  document.getElementById("nameOverlay").classList.remove("open");
}
function handleNameSubmit(e) {
  e.preventDefault();
  const val = document.getElementById("fName").value.trim();
  const errEl = document.getElementById("nameError");
  if (!val) {
    errEl.textContent = "Masukkan nama dulu ya.";
    errEl.style.display = "block";
    shakeEl(errEl);
    return;
  }
  saveName(val);
  document.getElementById("nameOverlay").classList.remove("open");
  if (!balanceSet) openBalanceForm(true);
}

/* ---------- saldo awal ---------- */
function loadBalance() {
  try {
    const v = localStorage.getItem(BALANCE_KEY);
    startingBalance = v !== null ? parseFloat(v) : 0;
    balanceSet = localStorage.getItem(BALANCE_SET_KEY) === "true";
  } catch (e) {
    startingBalance = 0;
    balanceSet = false;
  }
}
function saveBalance(val) {
  startingBalance = val;
  balanceSet = true;
  try {
    localStorage.setItem(BALANCE_KEY, String(val));
    localStorage.setItem(BALANCE_SET_KEY, "true");
  } catch (e) {
    console.error("Gagal menyimpan saldo awal", e);
  }
  renderCurrentView();
}
function openBalanceForm(isOnboarding) {
  document.getElementById("fStartBalance").value = startingBalance || "";
  document.getElementById("balanceError").style.display = "none";
  document.getElementById("balanceSkipBtn").style.display = isOnboarding ? "block" : "none";
  document.getElementById("balanceCloseBtn").style.display = isOnboarding ? "none" : "block";
  document.getElementById("balanceModalTitle").textContent = isOnboarding ? "Saldo rekening saat ini" : "Atur saldo awal";
  document.getElementById("balanceOverlay").classList.add("open");
}
function closeBalanceForm() {
  document.getElementById("balanceOverlay").classList.remove("open");
}
function skipBalance() {
  saveBalance(startingBalance || 0);
  closeBalanceForm();
}
function handleBalanceSubmit(e) {
  e.preventDefault();
  const raw = document.getElementById("fStartBalance").value;
  const val = raw === "" ? 0 : parseFloat(raw);
  const errEl = document.getElementById("balanceError");
  if (isNaN(val) || val < 0) {
    errEl.textContent = "Masukkan angka yang valid.";
    errEl.style.display = "block";
    shakeEl(errEl);
    return;
  }
  saveBalance(val);
  closeBalanceForm();
}

/* ---------- modal bantuan ---------- */
function openHelpModal() {
  document.getElementById("helpOverlay").classList.add("open");
}
function closeHelpModal() {
  document.getElementById("helpOverlay").classList.remove("open");
}

/* ---------- data storage ---------- */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) transactions = JSON.parse(raw);
  } catch (e) {
    console.error("Gagal memuat data", e);
  }
}
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (e) {
    console.error("Gagal menyimpan data", e);
  }
}

/* ---------- tab utama ---------- */
function setTab(tab) {
  activeTab = tab;
  ["Harian", "Mingguan", "Bulanan", "History"].forEach((t) => {
    document.getElementById("tab" + t).classList.toggle("active", t.toLowerCase() === tab);
  });
  document.getElementById("panelHarian").style.display = tab === "harian" ? "block" : "none";
  document.getElementById("panelMingguan").style.display = tab === "mingguan" ? "block" : "none";
  document.getElementById("panelBulanan").style.display = tab === "bulanan" ? "block" : "none";
  document.getElementById("panelHistory").style.display = tab === "history" ? "block" : "none";
  document.getElementById("addTxBtn").style.display = tab === "history" ? "none" : "flex";
  if (tab !== "history") pendingSource = tab;
  renderCurrentView();
}

function renderCurrentView() {
  renderTotalBalance();
  if (activeTab === "history") renderHistory();
  else renderSourceTab(activeTab);
}

function renderTotalBalance() {
  // Saldo total: saldo awal + akumulasi transaksi sepanjang waktu, TIDAK reset tiap bulan
  const totalBalance = startingBalance + transactions.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);

  // Pemasukan & pengeluaran: hanya bulan berjalan, otomatis reset tiap ganti bulan
  const now = new Date();
  const monthStart = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const monthTx = transactions.filter((t) => t.date >= monthStart && t.date <= monthEnd);
  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const balEl = document.getElementById("totalBalance");
  animateNumberText(balEl, totalBalance);
  balEl.style.color = totalBalance >= 0 ? "var(--ink)" : "var(--expense)";
  animateNumberText(document.getElementById("allIncome"), monthIncome);
  animateNumberText(document.getElementById("allExpense"), monthExpense);
}

/* ---------- ledger row renderer (dipakai di semua tempat) ---------- */
function ledgerRowsHtml(txArray, emptyMessage) {
  if (txArray.length === 0) {
    return `<div class="empty-state">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <div style="font-size:13px">${emptyMessage || "Belum ada catatan."}</div>
      <a onclick="openAddForm()">Catat transaksi</a>
    </div>`;
  }
  return txArray
    .map((t, i) => {
      const d = new Date(t.date + "T00:00:00");
      const dateStr = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      const color = t.type === "income" ? "var(--income)" : "var(--expense)";
      const sign = t.type === "income" ? "+" : "-";
      const actions =
        confirmDeleteId === t.id
          ? `<div style="display:flex;gap:4px">
           <button onclick="confirmDelete('${t.id}')" style="background:var(--expense);color:#fff;border:2px solid var(--border);padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer">Hapus</button>
           <button onclick="cancelDelete()" style="background:var(--surface);border:2px solid var(--border);color:var(--ink);padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer">Batal</button>
         </div>`
          : `<div class="row-actions" style="display:flex;gap:2px">
           <button onclick="openEditForm('${t.id}')" aria-label="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
           <button onclick="requestDelete('${t.id}')" aria-label="Hapus"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg></button>
         </div>`;
      return `<div class="ledger-row" style="--i:${i}">
      <div class="ledger-date">${dateStr}</div>
      <div class="ledger-main">
        <div class="ledger-cat">${escapeHtml(t.category)}</div>
        ${t.note ? `<div class="ledger-note">${escapeHtml(t.note)}</div>` : ""}
      </div>
      <div class="ledger-amt mono" style="color:${color}">${sign}${formatIDR(t.amount)}</div>
      ${actions}
    </div>`;
    })
    .join("");
}

/* ---------- render tab HARIAN/MINGGUAN/BULANAN ---------- */
function renderSourceTab(source) {
  const now = new Date();
  const monthStart = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const list = transactions.filter((t) => t.source === source && t.date >= monthStart && t.date <= monthEnd).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id > a.id ? 1 : -1));

  const capitalized = source.charAt(0).toUpperCase() + source.slice(1);
  const ledgerEl = document.getElementById("ledger" + capitalized);
  if (ledgerEl) ledgerEl.innerHTML = ledgerRowsHtml(list, "Belum ada catatan di sini bulan ini.");

  const catEl = document.getElementById("cat" + capitalized);
  if (catEl) {
    const html = categoryBreakdownHtml(list);
    catEl.innerHTML = html || `<div class="empty-note">Belum ada kategori yang tercatat bulan ini.</div>`;
  }
}

/* ---------- form tambah/edit transaksi ---------- */
function openAddForm() {
  if (activeTab === "history") return;
  editingId = null;
  editingSource = null;
  pendingSource = activeTab;
  document.getElementById("modalTitle").textContent = "Catat transaksi";
  document.getElementById("submitBtn").textContent = "Simpan";
  setFormType("expense");
  document.getElementById("fAmount").value = "";
  document.getElementById("fDate").value = todayISO();
  document.getElementById("fNote").value = "";
  document.getElementById("formError").style.display = "none";
  document.getElementById("modalOverlay").classList.add("open");
}
function openEditForm(id) {
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;
  editingId = id;
  editingSource = tx.source;
  document.getElementById("modalTitle").textContent = "Ubah transaksi";
  document.getElementById("submitBtn").textContent = "Simpan perubahan";
  setFormType(tx.type);
  document.getElementById("fCategory").value = tx.category;
  document.getElementById("fAmount").value = tx.amount;
  document.getElementById("fDate").value = tx.date;
  document.getElementById("fNote").value = tx.note || "";
  document.getElementById("formError").style.display = "none";
  document.getElementById("modalOverlay").classList.add("open");
}
function closeForm() {
  document.getElementById("modalOverlay").classList.remove("open");
  editingId = null;
  editingSource = null;
}

function setFormType(type) {
  formType = type;
  document.getElementById("btnTypeExpense").classList.toggle("active", type === "expense");
  document.getElementById("btnTypeIncome").classList.toggle("active", type === "income");
  const sel = document.getElementById("fCategory");
  sel.innerHTML = "";
  CATEGORIES[type].forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function handleSubmit(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("fAmount").value);
  const date = document.getElementById("fDate").value;
  const category = document.getElementById("fCategory").value;
  const note = document.getElementById("fNote").value.trim();
  const errEl = document.getElementById("formError");
  if (!amount || isNaN(amount) || amount <= 0) {
    errEl.textContent = "Masukkan jumlah yang valid.";
    errEl.style.display = "block";
    shakeEl(errEl);
    return;
  }
  if (!date) {
    errEl.textContent = "Pilih tanggal.";
    errEl.style.display = "block";
    shakeEl(errEl);
    return;
  }
  const source = editingId ? editingSource : pendingSource;
  const tx = { id: editingId || uid(), type: formType, amount, category, date, note, source };
  if (editingId) {
    transactions = transactions.map((t) => (t.id === editingId ? tx : t));
  } else {
    transactions = [tx, ...transactions];
  }
  saveData();
  closeForm();
  renderCurrentView();
}

function requestDelete(id) {
  confirmDeleteId = id;
  renderCurrentView();
}
function cancelDelete() {
  confirmDeleteId = null;
  renderCurrentView();
}
function confirmDelete(id) {
  transactions = transactions.filter((t) => t.id !== id);
  confirmDeleteId = null;
  saveData();
  renderCurrentView();
}

/* ---------- HISTORY: subtabs ---------- */
function setHistorySubView(view) {
  historySubView = view;
  document.getElementById("subtabCalendar").classList.toggle("active", view === "calendar");
  document.getElementById("subtabMonths").classList.toggle("active", view === "months");
  document.getElementById("calendarView").style.display = view === "calendar" ? "block" : "none";
  document.getElementById("monthsView").style.display = view === "months" ? "block" : "none";
  renderHistory();
}
function renderHistory() {
  if (historySubView === "calendar") renderCalendar();
  else renderMonthsGrid();
}

/* ---------- HISTORY: kalender ---------- */
function historyCalPrev() {
  historyCalAnchor = new Date(historyCalAnchor.getFullYear(), historyCalAnchor.getMonth() - 1, 1);
  historySelectedDate = null;
  renderCalendar();
}
function historyCalNext() {
  historyCalAnchor = new Date(historyCalAnchor.getFullYear(), historyCalAnchor.getMonth() + 1, 1);
  historySelectedDate = null;
  renderCalendar();
}
function historyCalToday() {
  historyCalAnchor = new Date();
  historySelectedDate = todayISO();
  renderCalendar();
}

function buildCalendarCells(anchor) {
  const y = anchor.getFullYear(),
    m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Senin = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function selectHistoryDate(iso) {
  historySelectedDate = historySelectedDate === iso ? null : iso;
  renderCalendar();
}

function renderCalendar() {
  const y = historyCalAnchor.getFullYear(),
    m = historyCalAnchor.getMonth();
  document.getElementById("historyCalLabel").textContent = `${MONTH_LABELS[m]} ${y}`;
  const cells = buildCalendarCells(historyCalAnchor);
  const today = todayISO();
  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = cells
    .map((d, i) => {
      if (!d) return `<div class="cal-cell empty"></div>`;
      const iso = toISO(d);
      const dayTx = transactions.filter((t) => t.date === iso);
      const inc = dayTx.some((t) => t.type === "income");
      const exp = dayTx.some((t) => t.type === "expense");
      const dots = (inc ? '<span class="cal-dot inc"></span>' : "") + (exp ? '<span class="cal-dot exp"></span>' : "");
      const cls = ["cal-cell"];
      if (iso === today) cls.push("today");
      if (iso === historySelectedDate) cls.push("selected");
      return `<button type="button" class="${cls.join(" ")}" style="--i:${i}" onclick="selectHistoryDate('${iso}')">
      <span class="cal-daynum">${d.getDate()}</span>
      <span class="cal-dots">${dots}</span>
    </button>`;
    })
    .join("");

  const detailEl = document.getElementById("dateDetail");
  if (!historySelectedDate) {
    detailEl.innerHTML = `<div class="empty-note">Klik salah satu tanggal untuk lihat detail transaksi hari itu.</div>`;
    return;
  }
  const dayTx = transactions.filter((t) => t.date === historySelectedDate).sort((a, b) => (b.id > a.id ? 1 : -1));
  const inc = dayTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp = dayTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const dLabel = new Date(historySelectedDate + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  detailEl.innerHTML = `
    <div class="detail-block">
      <div class="detail-title">${dLabel}</div>
      <div class="detail-totals">
        <div><div class="l" style="color:var(--income)">Pemasukan</div><div class="v">${formatIDR(inc)}</div></div>
        <div><div class="l" style="color:var(--expense)">Pengeluaran</div><div class="v">${formatIDR(exp)}</div></div>
        <div><div class="l">Selisih</div><div class="v" style="color:${inc - exp >= 0 ? "var(--income)" : "var(--expense)"}">${inc - exp >= 0 ? "+" : ""}${formatIDR(inc - exp)}</div></div>
      </div>
      ${ledgerRowsHtml(dayTx, "Tidak ada transaksi di tanggal ini.")}
    </div>`;
}

/* ---------- HISTORY: 12 bulan ---------- */
function historyMonthsPrevYear() {
  historyMonthsYear--;
  historySelectedMonth = null;
  renderMonthsGrid();
}
function historyMonthsNextYear() {
  historyMonthsYear++;
  historySelectedMonth = null;
  renderMonthsGrid();
}

function selectHistoryMonth(m) {
  if (historySelectedMonth && historySelectedMonth.year === historyMonthsYear && historySelectedMonth.month === m) {
    historySelectedMonth = null;
  } else {
    historySelectedMonth = { year: historyMonthsYear, month: m };
  }
  renderMonthsGrid();
}

function renderMonthsGrid() {
  document.getElementById("historyYearLabel").textContent = historyMonthsYear;
  const grid = document.getElementById("monthsGrid");
  const cardsHtml = [];
  const nowD = new Date();
  const currentYear = nowD.getFullYear(),
    currentMonth = nowD.getMonth();
  for (let m = 0; m < 12; m++) {
    const prefix = `${historyMonthsYear}-${pad2(m + 1)}`;
    const monthTx = transactions.filter((t) => t.date.startsWith(prefix));
    const inc = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const exp = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const net = inc - exp;
    const isActive = historySelectedMonth && historySelectedMonth.year === historyMonthsYear && historySelectedMonth.month === m;
    const isEmpty = monthTx.length === 0;
    const isCurrent = historyMonthsYear === currentYear && m === currentMonth;
    cardsHtml.push(`<button type="button" class="month-card ${isActive ? "active" : ""} ${isEmpty ? "empty-month" : ""} ${isCurrent ? "current-month" : ""}" style="--i:${m}" onclick="selectHistoryMonth(${m})">
      <div class="name">${MONTH_SHORT[m]}${isCurrent ? " <span class='current-dot'></span>" : ""}</div>
      <div class="net">${isEmpty ? "—" : (net >= 0 ? "+" : "") + formatShort(net)}</div>
    </button>`);
  }
  grid.innerHTML = cardsHtml.join("");

  const detailEl = document.getElementById("monthDetail");
  if (!historySelectedMonth || historySelectedMonth.year !== historyMonthsYear) {
    detailEl.innerHTML = `<div class="empty-note">Klik salah satu bulan untuk lihat rekap dan kurva performa keuangan bulan itu.</div>`;
    return;
  }
  const { year, month } = historySelectedMonth;
  const prefix = `${year}-${pad2(month + 1)}`;
  const monthTx = transactions.filter((t) => t.date.startsWith(prefix)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id > a.id ? 1 : -1));
  const inc = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const net = inc - exp;

  detailEl.innerHTML = `
    <div class="detail-block">
      <div class="detail-title">${MONTH_LABELS[month]} ${year}</div>
      <div class="detail-totals">
        <div><div class="l" style="color:var(--income)">Pemasukan</div><div class="v">${formatIDR(inc)}</div></div>
        <div><div class="l" style="color:var(--expense)">Pengeluaran</div><div class="v">${formatIDR(exp)}</div></div>
        <div><div class="l">Selisih</div><div class="v" style="color:${net >= 0 ? "var(--income)" : "var(--expense)"}">${net >= 0 ? "+" : ""}${formatIDR(net)}</div></div>
      </div>
      <div class="section-label">Kurva performa keuangan</div>
      <div class="curve-wrap">${generateCurveSvg(monthTx, year, month)}</div>
      ${categoryBreakdownHtml(monthTx)}
      <div class="section-label">Catatan transaksi</div>
      ${ledgerRowsHtml(monthTx, "Tidak ada transaksi di bulan ini.")}
    </div>`;

  requestAnimationFrame(() => {
    const path = detailEl.querySelector(".curve-line");
    if (path) {
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = 0;
      });
    }
  });
}

function categoryBreakdownHtml(txArray) {
  function build(type) {
    const totals = {};
    txArray
      .filter((t) => t.type === type)
      .forEach((t) => {
        totals[t.category] = (totals[t.category] || 0) + t.amount;
      });
    const sum = Object.values(totals).reduce((a, b) => a + b, 0);
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount, pct: sum ? (amount / sum) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }
  const expenseCats = build("expense");
  const incomeCats = build("income");
  if (expenseCats.length === 0 && incomeCats.length === 0) return "";
  function block(title, items, color) {
    if (items.length === 0) return "";
    return `<div>
      <div class="section-label">${title}</div>
      ${items
        .map(
          (c) => `
        <div class="cat-row">
          <div class="top"><span>${escapeHtml(c.category)}</span><span class="mono" style="color:var(--ink-muted)">${formatShort(c.amount)}</span></div>
          <div class="bar-bg"><div class="bar-fg" style="width:${c.pct}%;background:${color}"></div></div>
        </div>`,
        )
        .join("")}
    </div>`;
  }
  return `<div class="cat-grid">${block("Kategori pengeluaran", expenseCats, "var(--expense)")}${block("Kategori pemasukan", incomeCats, "var(--income)")}</div>`;
}

/* ---------- kurva performa bulanan (SVG) ---------- */
function generateCurveSvg(txArray, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (txArray.length === 0) {
    return `<div class="empty-note">Belum ada transaksi untuk digambar kurvanya.</div>`;
  }
  const dailyNet = new Array(daysInMonth).fill(0);
  txArray.forEach((t) => {
    const day = parseInt(t.date.slice(8, 10), 10);
    if (day >= 1 && day <= daysInMonth) dailyNet[day - 1] += t.type === "income" ? t.amount : -t.amount;
  });
  const cumulative = [];
  let running = 0;
  dailyNet.forEach((v) => {
    running += v;
    cumulative.push(running);
  });

  const W = 700,
    H = 200,
    padL = 46,
    padR = 14,
    padT = 16,
    padB = 24;
  const chartW = W - padL - padR,
    chartH = H - padT - padB;
  const maxV = Math.max(...cumulative, 0);
  const minV = Math.min(...cumulative, 0);
  const range = maxV - minV || 1;
  const points = cumulative.map((v, i) => ({
    x: padL + (daysInMonth === 1 ? 0 : (i / (daysInMonth - 1)) * chartW),
    y: padT + chartH - ((v - minV) / range) * chartH,
  }));
  const zeroY = padT + chartH - ((0 - minV) / range) * chartH;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i],
      p1 = points[i + 1];
    const mx = (p0.x + p1.x) / 2,
      my = (p0.y + p1.y) / 2;
    path += ` Q ${p0.x} ${p0.y} ${mx} ${my}`;
  }
  path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  const areaPath = `${path} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`;

  const finalNet = cumulative[cumulative.length - 1];
  const curveColor = finalNet >= 0 ? "var(--income)" : "var(--expense)";

  const labelStep = Math.ceil(daysInMonth / 8);
  let axisLabels = "";
  for (let i = 0; i < daysInMonth; i += labelStep) {
    axisLabels += `<text x="${points[i].x}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--ink-muted)">${i + 1}</text>`;
  }

  return `<svg width="100%" height="200" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="var(--border)" stroke-width="2" stroke-dasharray="4 4"/>
    <path d="${areaPath}" fill="${curveColor}" fill-opacity="0.15" stroke="none"/>
    <path class="curve-line" d="${path}" fill="none" stroke="${curveColor}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="5" fill="${curveColor}" stroke="var(--border)" stroke-width="2"/>
    ${axisLabels}
  </svg>`;
}

/* ---------- init ---------- */
function init() {
  loadName();
  updateBrandTitle();
  loadBalance();
  loadData();
  historySelectedDate = null;
  setFormType("expense");
  document.getElementById("fDate").value = todayISO();
  document.getElementById("footerYear").textContent = new Date().getFullYear();
  setTab("harian");
  if (!userName) {
    openNameForm(false);
  } else if (!balanceSet) {
    openBalanceForm(true);
  }
}
init();
