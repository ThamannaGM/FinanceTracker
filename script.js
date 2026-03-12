// ── Auth helpers ───────────────────────────────────────────────────────────────
function getCurrentUser() {
    return localStorage.getItem("ft_current_user");
}

function checkAuth() {
    const user = getCurrentUser();
    if (!user) { window.location.href = "auth.html"; return null; }
    return user;
}

function logout() {
    localStorage.removeItem("ft_current_user");
    localStorage.removeItem("ft_username");
    window.location.href = "auth.html";
}

// ── Toast notifications ────────────────────────────────────────────────────────
function toast(message, type = "success", duration = 3000) {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }
    const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || "✓"}</span><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => { el.classList.add("hiding"); setTimeout(() => el.remove(), 260); }, duration);
}

// ── In-memory state ────────────────────────────────────────────────────────────
let balance = 0;
let savings = 0;
let categories = [];
let transactions = [];
let incomeHistory = [];
let savingsGoals = [];
let recurringTransactions = [];
let currentUserId = null;
let saveTimeout = null;

// ── localStorage helpers ───────────────────────────────────────────────────────
function getDataKey() {
    return `ft_data_${currentUserId}`;
}

function loadData() {
    const raw = localStorage.getItem(getDataKey());
    if (!raw) {
        // First time — initialise
        const empty = {
            balance: 0, savings: 0, categories: [], transactions: [],
            incomeHistory: [], savingsGoals: [], recurringTransactions: []
        };
        localStorage.setItem(getDataKey(), JSON.stringify(empty));
        return;
    }
    const data = JSON.parse(raw);
    balance = data.balance || 0;
    savings = data.savings || 0;
    categories = data.categories || [];
    transactions = data.transactions || [];
    incomeHistory = data.incomeHistory || [];
    savingsGoals = data.savingsGoals || [];
    recurringTransactions = data.recurringTransactions || [];
}

function saveData() {
    if (!currentUserId) return;
    localStorage.setItem(getDataKey(), JSON.stringify({
        balance, savings, categories, transactions,
        incomeHistory, savingsGoals, recurringTransactions
    }));
}

function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveData(), 300);
}

// ── Update UI ──────────────────────────────────────────────────────────────────
function updateUI() {
    if (document.getElementById("total-balance")) {
        document.getElementById("total-balance").innerText = `${balance.toFixed(2)} AED`;
        document.getElementById("savings-balance").innerText = `${savings.toFixed(2)} AED`;
        document.getElementById("chart-balance").innerText = `${balance.toFixed(2)} AED`;
        if (myChart) {
            myChart.data.datasets[0].data = [balance, savings];
            myChart.update();
        }
    }
    scheduleSave();
}

// ── Chart ──────────────────────────────────────────────────────────────────────
let myChart;
function initChart() {
    const ctx = document.getElementById("budgetChart").getContext("2d");
    myChart = new Chart(ctx, {
        type: "doughnut",
        data: { datasets: [{ data: [balance, savings], backgroundColor: ["#f1a7b9", "#a8b79a"], borderWidth: 0 }] },
        options: {
            cutout: "75%",
            plugins: { legend: { display: false } },
            maintainAspectRatio: true,
            responsive: true,
        }
    });
}

// ── Page init ──────────────────────────────────────────────────────────────────
window.addEventListener("load", () => {
    const user = checkAuth();
    if (!user) return;
    currentUserId = user;

    const username = localStorage.getItem("ft_username") || user;
    const usernameEl = document.getElementById("welcome-username");
    const emailEl = document.getElementById("user-email");
    if (usernameEl) usernameEl.textContent = username;
    if (emailEl) emailEl.textContent = username;

    loadData();

    if (document.getElementById("budgetChart")) {
        initChart(); updateUI(); renderCategories();
        processRecurringTransactions();
        renderRecurringList();
    }
    if (document.getElementById("report-container")) { autoPopulateYears(); populateSearchDropdown(); renderSpendingPage(); }
    if (document.getElementById("income-report-container")) { renderIncomePage(); }
    if (document.getElementById("goals-container")) { renderGoals(); }

    initOnboarding();
});

// ── Income ─────────────────────────────────────────────────────────────────────
function addIncome() {
    const input = document.getElementById("income-amount");
    const amt = parseFloat(input.value);
    if (amt > 0) {
        balance += amt;
        incomeHistory.unshift({ id: Date.now(), date: new Date().toLocaleDateString("en-GB"), amt });
        updateUI();
        input.value = "";
        toast(`+${amt.toFixed(2)} AED income recorded`, "success");
    }
}

// ── Savings ────────────────────────────────────────────────────────────────────
function adjustSavings(type) {
    const amt = parseFloat(document.getElementById("savings-amount").value);
    if (amt > 0) {
        if (type === "add" && amt <= balance) {
            balance -= amt; savings += amt;
            toast(`${amt.toFixed(2)} AED moved to savings`, "success");
        } else if (type === "sub" && amt <= savings) {
            savings -= amt; balance += amt;
            toast(`${amt.toFixed(2)} AED moved to balance`, "success");
        } else {
            toast("Insufficient funds!", "error"); return;
        }
        updateUI();
        document.getElementById("savings-amount").value = "";
    }
}

// ── Note autocomplete ──────────────────────────────────────────────────────────
function updateNoteSuggestions() {
    const datalist = document.getElementById("note-suggestions");
    if (!datalist) return;
    const selectedCat = document.getElementById("expense-category")?.value;
    const pastNotes = transactions
        .filter(t => !selectedCat || t.cat === selectedCat)
        .map(t => t.note)
        .filter(n => n && n !== "Expense");
    const unique = [...new Set(pastNotes)];
    datalist.innerHTML = unique.slice(0, 20).map(n => `<option value="${n}">`).join("");
}

// ── Expenses ───────────────────────────────────────────────────────────────────
function addExpense() {
    const cat = document.getElementById("expense-category").value;
    const note = document.getElementById("expense-note").value.trim() || "Expense";
    const dateVal = document.getElementById("expense-date").value;
    const amt = parseFloat(document.getElementById("expense-amount").value);

    if (!cat) { toast("Please select a category", "error"); return; }
    if (!amt || amt <= 0) { toast("Please enter a valid amount", "error"); return; }
    if (amt > balance) { toast("Insufficient balance!", "error"); return; }

    let dateStr;
    if (dateVal) {
        const parts = dateVal.split("-");
        dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else {
        dateStr = new Date().toLocaleDateString("en-GB");
    }

    balance -= amt;
    transactions.unshift({ id: Date.now(), date: dateStr, cat, note, amt });
    updateUI();

    document.getElementById("expense-note").value = "";
    document.getElementById("expense-amount").value = "";
    document.getElementById("expense-date").value = "";
    toast(`-${amt.toFixed(2)} AED logged under ${cat}`, "success");
    updateNoteSuggestions();
}

// ── Categories ─────────────────────────────────────────────────────────────────
function renderCategories() {
    const select = document.getElementById("expense-category");
    const list = document.getElementById("category-delete-list");
    if (!select) return;
    select.innerHTML = ""; list.innerHTML = "";
    categories.forEach(cat => {
        select.innerHTML += `<option value="${cat}">${cat}</option>`;
        list.innerHTML += `<div>${cat} <span class="del-btn" onclick="removeCat('${cat}')">x</span></div>`;
    });
}

function showSection(id) {
    ["income-section", "expense-section", "category-section", "savings-section"]
        .forEach(s => document.getElementById(s).classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
    if (id === "expense-section") updateNoteSuggestions();
}

// ── Delete / edit ──────────────────────────────────────────────────────────────
function deleteSpend(id, amt) {
    if (confirm("Delete this transaction?")) {
        transactions = transactions.filter(t => t.id !== id);
        balance += amt;
        updateUI(); autoPopulateYears(); populateSearchDropdown(); renderSpendingPage();
        toast(`Transaction deleted, ${amt.toFixed(2)} AED refunded`, "warning");
    }
}

function deleteInc(id, amt) {
    if (confirm("Delete this income entry?")) {
        incomeHistory = incomeHistory.filter(i => i.id !== id);
        balance -= amt;
        updateUI(); renderIncomePage();
        toast("Income entry deleted", "warning");
    }
}

function removeCat(n) {
    categories = categories.filter(c => c !== n);
    renderCategories(); updateUI();
    toast(`Category "${n}" removed`, "warning");
}

function addNewCategory() {
    const n = document.getElementById("new-category-name").value.trim();
    if (n) {
        categories.push(n); renderCategories(); updateUI();
        document.getElementById("new-category-name").value = "";
        toast(`Category "${n}" created`, "success");
    }
}

function editAmount(id) {
    const t = transactions.find(t => t.id === id);
    if (!t) return;
    const newAmt = parseFloat(prompt(`Edit amount for "${t.note}":`, t.amt));
    if (!isNaN(newAmt) && newAmt > 0) {
        balance += t.amt - newAmt;
        t.amt = newAmt;
        updateUI(); renderSpendingPage();
        toast("Amount updated", "success");
    }
}

function editIncomeAmount(id) {
    const entry = incomeHistory.find(i => i.id === id);
    if (!entry) return;
    const newAmt = parseFloat(prompt("Edit income amount:", entry.amt));
    if (!isNaN(newAmt) && newAmt > 0) {
        balance += newAmt - entry.amt;
        entry.amt = newAmt;
        updateUI(); renderIncomePage();
        toast("Income updated", "success");
    }
}

function triggerEditDate(id) { document.getElementById(`date-picker-${id}`).showPicker(); }
function triggerEditDateInc(id) { document.getElementById(`date-picker-inc-${id}`).showPicker(); }

function updateDate(id, newDate) {
    if (!newDate) return;
    const parts = newDate.split("-");
    const target = transactions.find(t => t.id === id);
    if (target) { target.date = `${parts[2]}/${parts[1]}/${parts[0]}`; updateUI(); renderSpendingPage(); }
}

function updateIncomeDate(id, newDate) {
    if (!newDate) return;
    const parts = newDate.split("-");
    const entry = incomeHistory.find(i => i.id === id);
    if (entry) { entry.date = `${parts[2]}/${parts[1]}/${parts[0]}`; updateUI(); renderIncomePage(); }
}

// ── Income history ─────────────────────────────────────────────────────────────
function renderIncomePage() {
    const container = document.getElementById("income-report-container");
    if (!container) return;
    const totalIncome = incomeHistory.reduce((sum, entry) => sum + entry.amt, 0);
    let html = `<div class="category-block"><h3>History</h3><table>
        <thead><tr><th>Date</th><th>Type</th><th>Amount (AED)</th><th></th></tr></thead><tbody>`;
    incomeHistory.forEach(i => {
        html += `<tr>
            <td style="position:relative;">
                <span onclick="triggerEditDateInc(${i.id})" style="cursor:pointer;">${i.date}</span>
                <input type="date" id="date-picker-inc-${i.id}" style="position:absolute; opacity:0; pointer-events:none; left:0; width:0;" onchange="updateIncomeDate(${i.id}, this.value)">
            </td>
            <td>Income</td>
            <td onclick="editIncomeAmount(${i.id})" style="cursor:pointer; font-weight:bold;">${i.amt.toFixed(2)}</td>
            <td style="text-align:right"><span class="del-btn" onclick="deleteInc(${i.id}, ${i.amt})">x</span></td>
        </tr>`;
    });
    html += `</tbody></table><div class="total-row"><span>Total Income Earned</span><span>${totalIncome.toFixed(2)} AED</span></div></div>`;
    container.innerHTML = html;
}

// ── Filters ────────────────────────────────────────────────────────────────────
function autoPopulateYears() {
    const drop = document.getElementById("filter-year");
    if (!drop) return;
    const years = [...new Set(transactions.map(t => t.date.split("/")[2]))];
    if (!years.includes(new Date().getFullYear().toString())) years.push(new Date().getFullYear().toString());
    drop.innerHTML = '<option value="all">All Years</option>';
    years.sort((a, b) => b - a).forEach(y => drop.innerHTML += `<option value="${y}">${y}</option>`);
}

function populateSearchDropdown() {
    const drop = document.getElementById("category-search-dropdown");
    if (!drop) return;
    drop.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(c => drop.innerHTML += `<option value="${c}">${c}</option>`);
}

// ── Spending report ────────────────────────────────────────────────────────────
function renderSpendingPage() {
    const container = document.getElementById("report-container");
    if (!container) return;

    const catF = document.getElementById("category-search-dropdown").value;
    const yrF = document.getElementById("filter-year").value;
    const moF = document.getElementById("filter-month").value;
    const searchQ = document.getElementById("search-note")?.value?.toLowerCase() || "";

    let filtered = transactions.filter(t => {
        const parts = t.date.split("/");
        const d = new Date(parts[2], parts[1] - 1, parts[0]);
        return (catF === "all" || t.cat === catF) &&
               (yrF === "all" || d.getFullYear().toString() === yrF) &&
               (moF === "all" || d.getMonth().toString() === moF) &&
               (!searchQ || t.note.toLowerCase().includes(searchQ));
    });

    if (!filtered.length) { container.innerHTML = `<p style="color:#ccc; text-align:center; padding:40px 0;">No transactions found.</p>`; return; }

    const cats = [...new Set(filtered.map(t => t.cat))];
    let html = "";
    cats.forEach(cat => {
        const items = filtered.filter(t => t.cat === cat);
        const catTotal = items.reduce((s, i) => s + i.amt, 0);
        html += `<div class="category-block"><h3>${cat} <span style="float:right; color:#f1a7b9;">${catTotal.toFixed(2)} AED</span></h3><table>
            <thead><tr><th>Date</th><th>Note</th><th>Amount (AED)</th><th></th></tr></thead><tbody>`;
        items.forEach(t => {
            html += `<tr>
                <td style="position:relative;">
                    <span onclick="triggerEditDate(${t.id})" style="cursor:pointer;">${t.date}</span>
                    <input type="date" id="date-picker-${t.id}" style="position:absolute; opacity:0; pointer-events:none; left:0; width:0;" onchange="updateDate(${t.id}, this.value)">
                </td>
                <td>${t.note}</td>
                <td onclick="editAmount(${t.id})" style="cursor:pointer; font-weight:bold;">${t.amt.toFixed(2)}</td>
                <td style="text-align:right"><span class="del-btn" onclick="deleteSpend(${t.id}, ${t.amt})">x</span></td>
            </tr>`;
        });
        html += `</tbody></table><div class="total-row"><span>${cat} Total</span><span>${catTotal.toFixed(2)} AED</span></div></div>`;
    });

    const grand = filtered.reduce((s, t) => s + t.amt, 0);
    html += `<div class="total-row grand"><span>Grand Total</span><span>${grand.toFixed(2)} AED</span></div>`;
    container.innerHTML = html;

    const totalEl = document.getElementById("period-total");
    if (totalEl) totalEl.textContent = grand.toFixed(2);
}

// ── PDF Export ─────────────────────────────────────────────────────────────────
function exportToPDF() {
    const catF = document.getElementById("category-search-dropdown").value;
    const yrF = document.getElementById("filter-year").value;
    const moF = document.getElementById("filter-month").value;

    let filtered = transactions.filter(t => {
        const parts = t.date.split("/");
        const d = new Date(parts[2], parts[1] - 1, parts[0]);
        return (catF === "all" || t.cat === catF) &&
               (yrF === "all" || d.getFullYear().toString() === yrF) &&
               (moF === "all" || d.getMonth().toString() === moF);
    });

    const grandTotal = filtered.reduce((s, t) => s + t.amt, 0);
    const username = localStorage.getItem("ft_username") || "";
    const now = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    let filterLabel = [];
    if (yrF !== "all") filterLabel.push(yrF);
    if (moF !== "all") {
        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        filterLabel.push(months[parseInt(moF)]);
    }
    if (catF !== "all") filterLabel.push(catF);
    const period = filterLabel.length ? filterLabel.join(" · ") : "All Time";

    const cats = [...new Set(filtered.map(t => t.cat))];
    let categoryRows = "";
    cats.forEach(cat => {
        const items = filtered.filter(t => t.cat === cat);
        const catTotal = items.reduce((s, i) => s + i.amt, 0);
        categoryRows += `
            <div class="pdf-category">
                <div class="pdf-cat-header"><span>${cat}</span><span>${catTotal.toFixed(2)} AED</span></div>
                <table>
                    <thead><tr><th>Date</th><th>Note</th><th>Amount</th></tr></thead>
                    <tbody>${items.map(t => `<tr><td>${t.date}</td><td>${t.note}</td><td>${t.amt.toFixed(2)} AED</td></tr>`).join("")}</tbody>
                </table>
            </div>`;
    });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; color: #333; padding: 48px; background: white; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #fdf6f6; }
        .logo { font-size: 1.6rem; font-weight: 800; color: #f1a7b9; }
        .logo span { color: #a8b79a; font-weight: 300; }
        .meta { text-align: right; }
        .meta .period { font-size: 1rem; font-weight: 700; color: #333; }
        .meta .date { font-size: 0.8rem; color: #aaa; margin-top: 4px; }
        .summary-bar { display: flex; gap: 20px; margin-bottom: 36px; }
        .summary-item { flex: 1; background: #fdf6f6; border-radius: 16px; padding: 20px 24px; }
        .summary-item label { font-size: 0.75rem; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 6px; }
        .summary-item .val { font-size: 1.4rem; font-weight: 800; color: #f1a7b9; }
        .summary-item .val.green { color: #a8b79a; }
        .pdf-category { margin-bottom: 28px; }
        .pdf-cat-header { display: flex; justify-content: space-between; font-weight: 700; font-size: 0.95rem; color: #333; padding: 10px 0; border-bottom: 2px solid #f1a7b9; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 0.75rem; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; text-align: left; }
        td { padding: 10px 12px; border-bottom: 1px solid #fafafa; font-size: 0.88rem; vertical-align: middle; }
        td:first-child { width: 110px; color: #aaa; }
        td:nth-child(2) { text-align: center; color: #555; }
        td:last-child { font-weight: 600; text-align: right; width: 130px; }
        th:nth-child(2) { text-align: center; }
        th:last-child { text-align: right; }
        .grand-total { display: flex; justify-content: space-between; font-weight: 800; font-size: 1.1rem; padding: 20px 0; border-top: 2px solid #333; margin-top: 16px; }
        .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #f5f5f5; text-align: center; font-size: 0.75rem; color: #ccc; }
    </style></head><body>
    <div class="header">
        <div class="logo">Finance<span>Tracker</span></div>
        <div class="meta">
            <div class="period">Spending Report · ${period}</div>
            <div class="date">Generated ${now}${username ? " · " + username : ""}</div>
        </div>
    </div>
    <div class="summary-bar">
        <div class="summary-item"><label>Total Spent</label><div class="val">${grandTotal.toFixed(2)} AED</div></div>
        <div class="summary-item"><label>Transactions</label><div class="val">${filtered.length}</div></div>
        <div class="summary-item"><label>Categories</label><div class="val">${cats.length}</div></div>
        <div class="summary-item"><label>Current Balance</label><div class="val green">${balance.toFixed(2)} AED</div></div>
    </div>
    ${categoryRows}
    <div class="grand-total"><span>Grand Total</span><span>${grandTotal.toFixed(2)} AED</span></div>
    <div class="footer">Finance Tracker · Your personal money companion</div>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.focus();
    toast("PDF ready — use your browser's Print / Save as PDF option", "info", 5000);
}

// ── Savings Goals ──────────────────────────────────────────────────────────────
function renderGoals() {
    const container = document.getElementById("goals-container");
    if (!container) return;

    let html = '<div class="goals-grid">';
    savingsGoals.forEach(g => {
        const pct = Math.min((g.saved / g.target) * 100, 100).toFixed(1);
        const complete = g.saved >= g.target;
        html += `
        <div class="goal-card ${complete ? "goal-complete" : ""}">
            <div class="goal-card-header">
                <span class="goal-name">${g.name}</span>
                <span class="goal-del" onclick="deleteGoal('${g.id}')">x</span>
            </div>
            <div class="goal-amounts">
                <span class="goal-saved">${g.saved.toFixed(2)} AED</span>
                <span class="goal-target">of ${g.target.toFixed(2)} AED</span>
            </div>
            <div class="goal-progress-track">
                <div class="goal-progress-fill ${complete ? "complete" : ""}" style="width:${pct}%"></div>
            </div>
            <div class="goal-pct ${complete ? "complete" : ""}">${pct}%${complete ? " 🎉" : ""}</div>
            ${!complete ? `
            <div class="goal-contribute-row">
                <input type="number" id="contrib-${g.id}" placeholder="Amount (AED)">
                <button class="btn-sage" onclick="contributeToGoal('${g.id}')">Add</button>
            </div>` : ""}
        </div>`;
    });

    html += `
        <div class="add-goal-card">
            <h3>+ New Goal</h3>
            <input type="text" id="new-goal-name" placeholder="Goal name (e.g. Vacation)">
            <input type="number" id="new-goal-target" placeholder="Target amount (AED)">
            <button class="btn-pink" onclick="addGoal()">Create Goal</button>
        </div>
    </div>`;

    container.innerHTML = html;
}

function addGoal() {
    const name = document.getElementById("new-goal-name").value.trim();
    const target = parseFloat(document.getElementById("new-goal-target").value);
    if (!name || !target || target <= 0) { toast("Please enter a name and target amount", "error"); return; }
    savingsGoals.push({ id: Date.now().toString(), name, target, saved: 0 });
    scheduleSave();
    renderGoals();
    toast(`Goal "${name}" created!`, "success");
}

function contributeToGoal(id) {
    const goal = savingsGoals.find(g => g.id === id);
    const amt = parseFloat(document.getElementById(`contrib-${id}`).value);
    if (!amt || amt <= 0) { toast("Enter a valid amount", "error"); return; }
    if (amt > savings) {
        toast(`Not enough in savings! You only have ${savings.toFixed(2)} AED available.`, "error", 4000);
        return;
    }

    const remaining = goal.target - goal.saved;
    const actual = Math.min(amt, remaining);
    const surplus = amt - actual;

    savings -= actual;
    goal.saved += actual;

    if (surplus > 0) toast(`Goal reached! ${surplus.toFixed(2)} AED surplus returned to savings`, "success", 5000);

    scheduleSave();
    renderGoals();

    if (goal.saved >= goal.target) {
        setTimeout(() => toast(`🎉 You reached your goal: ${goal.name}!`, "success", 5000), 400);
    } else {
        toast(`${actual.toFixed(2)} AED added to "${goal.name}"`, "success");
    }
}

function deleteGoal(id) {
    const goal = savingsGoals.find(g => g.id === id);
    if (!goal) return;
    if (goal.saved <= 0) {
        savingsGoals = savingsGoals.filter(g => g.id !== id);
        scheduleSave(); renderGoals();
        toast(`Goal "${goal.name}" removed`, "warning");
        return;
    }
    showGoalPopup(goal);
}

function showGoalPopup(goal) {
    const existing = document.getElementById("goal-popup-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "goal-popup-overlay";
    overlay.innerHTML = `
        <div class="goal-popup">
            <div class="goal-popup-icon">🎯</div>
            <h3>${goal.name}</h3>
            <p>You have <strong>${goal.saved.toFixed(2)} AED</strong> saved towards this goal.<br>What would you like to do with it?</p>
            <div class="goal-popup-actions">
                <button class="goal-popup-btn cancel" onclick="resolveGoal('${goal.id}', 'cancel')">
                    <span class="goal-popup-btn-title">↩ Cancel Goal</span>
                    <span class="goal-popup-btn-sub">Return money to savings</span>
                </button>
                <button class="goal-popup-btn complete" onclick="resolveGoal('${goal.id}', 'complete')">
                    <span class="goal-popup-btn-title">✓ Goal Completed</span>
                    <span class="goal-popup-btn-sub">Log as a spend</span>
                </button>
            </div>
            <button class="goal-popup-dismiss" onclick="document.getElementById('goal-popup-overlay').remove()">Keep goal</button>
        </div>`;
    document.body.appendChild(overlay);
}

function resolveGoal(id, action) {
    const goal = savingsGoals.find(g => g.id === id);
    if (!goal) return;
    savingsGoals = savingsGoals.filter(g => g.id !== id);
    document.getElementById("goal-popup-overlay")?.remove();

    if (action === "cancel") {
        savings += goal.saved;
        updateUI();
        toast(`${goal.saved.toFixed(2)} AED returned to savings`, "info");
    } else {
        const today = new Date().toLocaleDateString("en-GB");
        transactions.unshift({ id: Date.now(), date: today, cat: "Savings", note: goal.name, amt: goal.saved });
        if (!categories.includes("Savings")) { categories.push("Savings"); renderCategories(); }
        updateUI();
        toast(`${goal.saved.toFixed(2)} AED logged as a spend under "Savings"`, "success", 4000);
    }
    scheduleSave(); renderGoals();
}

// ── Recurring Transactions ─────────────────────────────────────────────────────
function processRecurringTransactions() {
    if (!recurringTransactions.length) return;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${now.getMonth()}`;
    let autoLogged = 0;

    recurringTransactions.forEach(r => {
        const alreadyLogged = transactions.some(t => t.recurringId === r.id && t.recurringMonth === thisMonth);
        if (alreadyLogged) return;
        if (now.getDate() >= r.day) {
            const dd = String(r.day).padStart(2, "0");
            const mm = String(now.getMonth() + 1).padStart(2, "0");
            const dateStr = `${dd}/${mm}/${now.getFullYear()}`;
            if (r.amt <= balance) {
                balance -= r.amt;
                transactions.unshift({ id: Date.now() + Math.random(), date: dateStr, cat: r.cat, note: `🔁 ${r.note}`, amt: r.amt, recurringId: r.id, recurringMonth: thisMonth });
                autoLogged++;
            }
        }
    });

    if (autoLogged > 0) {
        updateUI();
        setTimeout(() => toast(`🔁 ${autoLogged} recurring transaction${autoLogged > 1 ? "s" : ""} auto-logged this month`, "info", 5000), 800);
    }
}

function renderRecurringList() {
    const container = document.getElementById("recurring-list");
    if (!container) return;
    if (!recurringTransactions.length) {
        container.innerHTML = `<p style="color:#ccc; font-size:0.85rem; text-align:center; padding: 10px 0;">No recurring transactions yet.</p>`;
        return;
    }
    const ordinal = n => { const s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };
    container.innerHTML = recurringTransactions.map(r => `
        <div class="recurring-item">
            <div class="recurring-info">
                <span class="recurring-note">🔁 ${r.note}</span>
                <span class="recurring-meta">${r.cat} · ${ordinal(r.day)} of each month</span>
            </div>
            <div class="recurring-right">
                <span class="recurring-amt">${r.amt.toFixed(2)} AED</span>
                <span class="del-btn" onclick="deleteRecurring('${r.id}')">x</span>
            </div>
        </div>`).join("");
}

function toggleRecurringFields() {
    const fields = document.getElementById("recurring-fields");
    const btn = document.getElementById("recurring-open-btn");
    const isHidden = fields.classList.contains("hidden");
    fields.classList.toggle("hidden", !isHidden);
    btn.classList.toggle("active", isHidden);
    btn.textContent = isHidden ? "✕ Cancel Recurring" : "🔁 Set as Monthly Recurring";
}

function addRecurring() {
    const note = document.getElementById("expense-note").value.trim() || "Expense";
    const cat  = document.getElementById("expense-category").value;
    const amt  = parseFloat(document.getElementById("expense-amount").value);
    const day  = parseInt(document.getElementById("recurring-day").value);

    if (!amt || amt <= 0) { toast("Enter an amount", "error"); return; }
    if (!day || day < 1 || day > 28) { toast("Enter a day between 1 and 28", "error"); return; }
    if (!cat) { toast("Select a category first", "error"); return; }

    recurringTransactions.push({ id: Date.now().toString(), note, cat, amt, day, createdAt: new Date().toISOString() });
    scheduleSave();
    renderRecurringList();

    document.getElementById("expense-note").value = "";
    document.getElementById("expense-amount").value = "";
    document.getElementById("recurring-day").value = "";
    document.getElementById("recurring-fields").classList.add("hidden");
    const btn = document.getElementById("recurring-open-btn");
    if (btn) { btn.textContent = "🔁 Set as Monthly Recurring"; btn.classList.remove("active"); }

    toast(`🔁 "${note}" set to repeat on the ${day}${["th","st","nd","rd"][day%10] || "th"} monthly`, "success", 4000);
}

function deleteRecurring(id) {
    const r = recurringTransactions.find(r => r.id === id);
    if (!r) return;
    if (confirm(`Remove recurring "${r.note}"?`)) {
        recurringTransactions = recurringTransactions.filter(r => r.id !== id);
        scheduleSave(); renderRecurringList();
        toast(`Recurring "${r.note}" removed`, "warning");
    }
}

// ── Master reset ───────────────────────────────────────────────────────────────
function masterReset() {
    if (confirm("Are you sure you want to reset ALL your financial data? This cannot be undone.")) {
        balance = 0; savings = 0; categories = []; transactions = [];
        incomeHistory = []; savingsGoals = []; recurringTransactions = [];
        saveData();
        location.reload();
    }
}

// ── Onboarding ─────────────────────────────────────────────────────────────────
const ONBOARDING_KEY = "ft_onboarding_done";
const TOTAL_SLIDES = 6;
let currentSlide = 0;

function initOnboarding() {
    if (!document.getElementById("onboarding-overlay")) return;
    if (localStorage.getItem(ONBOARDING_KEY)) return;
    const pips = document.getElementById("onboarding-progress");
    pips.innerHTML = "";
    for (let i = 0; i < TOTAL_SLIDES; i++) {
        const pip = document.createElement("div");
        pip.className = "onboarding-pip" + (i === 0 ? " active" : "");
        pip.id = `pip-${i}`;
        pips.appendChild(pip);
    }
    currentSlide = 0;
    updateOnboardingUI();
    document.getElementById("onboarding-overlay").style.display = "flex";
}

function updateOnboardingUI(goingBack = false) {
    document.querySelectorAll(".onboarding-slide").forEach((s, i) => {
        s.classList.remove("active", "going-back");
        if (i === currentSlide) { s.classList.add("active"); if (goingBack) s.classList.add("going-back"); }
    });
    for (let i = 0; i < TOTAL_SLIDES; i++) {
        const pip = document.getElementById(`pip-${i}`);
        pip.className = "onboarding-pip";
        if (i < currentSlide) pip.classList.add("done");
        else if (i === currentSlide) pip.classList.add("active");
    }
    document.getElementById("onboarding-step-count").textContent = `${currentSlide + 1} of ${TOTAL_SLIDES}`;
    document.getElementById("onboarding-back").style.display = currentSlide > 0 ? "block" : "none";
    const nextBtn = document.getElementById("onboarding-next");
    nextBtn.textContent = currentSlide === TOTAL_SLIDES - 1 ? "Let's go! 🌸" : "Next →";
    document.getElementById("onboarding-skip").style.display = currentSlide === TOTAL_SLIDES - 1 ? "none" : "inline-block";
}

function onboardingNext() {
    if (currentSlide < TOTAL_SLIDES - 1) { currentSlide++; updateOnboardingUI(false); }
    else { closeOnboarding(); }
}

function onboardingBack() {
    if (currentSlide > 0) { currentSlide--; updateOnboardingUI(true); }
}

function closeOnboarding() {
    const overlay = document.getElementById("onboarding-overlay");
    overlay.classList.add("hiding");
    setTimeout(() => { overlay.style.display = "none"; overlay.classList.remove("hiding"); }, 300);
    localStorage.setItem(ONBOARDING_KEY, "1");
}
