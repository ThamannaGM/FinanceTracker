let balance = parseFloat(localStorage.getItem('balance')) || 0;
let savings = parseFloat(localStorage.getItem('savings')) || 0;
let categories = JSON.parse(localStorage.getItem('categories')) || [];
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let incomeHistory = JSON.parse(localStorage.getItem('incomeHistory')) || [];

let myChart;

window.addEventListener('load', () => {
    if (document.getElementById('budgetChart')) {
        initChart();
        updateUI();
        renderCategories();
    }
});

function updateUI() {
    if (document.getElementById('total-balance')) {
        document.getElementById('total-balance').innerText = `${balance.toFixed(2)} AED`;
        document.getElementById('savings-balance').innerText = `${savings.toFixed(2)} AED`;
        document.getElementById('chart-balance').innerText = `${balance.toFixed(2)} AED`;
        if (myChart) {
            myChart.data.datasets[0].data = [balance, savings];
            myChart.update();
        }
    }
    localStorage.setItem('balance', balance);
    localStorage.setItem('savings', savings);
    localStorage.setItem('categories', JSON.stringify(categories));
    localStorage.setItem('transactions', JSON.stringify(transactions));
    localStorage.setItem('incomeHistory', JSON.stringify(incomeHistory));
}

function initChart() {
    const ctx = document.getElementById('budgetChart').getContext('2d');
    myChart = new Chart(ctx, { 
        type: 'doughnut', 
        data: { 
            datasets: [{ 
                data: [balance, savings], 
                backgroundColor: ['#f1a7b9', '#a8b79a'], // Blue and Green to match your text colors
                borderWidth: 0 
            }] 
        }, 
        options: { cutout: '85%', plugins: { legend: { display: false } } } 
    });
}

function addIncome() {
    const input = document.getElementById('income-amount');
    const amt = parseFloat(input.value);
    if (amt > 0) {
        balance += amt;
        incomeHistory.unshift({ id: Date.now(), date: new Date().toLocaleDateString('en-GB'), amt });
        updateUI();
        input.value = '';
    }
}

function adjustSavings(type) {
    const amt = parseFloat(document.getElementById('savings-amount').value);
    if (amt > 0) {
        if (type === 'add' && amt <= balance) { balance -= amt; savings += amt; }
        else if (type === 'sub' && amt <= savings) { savings -= amt; balance += amt; }
        else { alert("Check funds!"); return; }
        updateUI();
        document.getElementById('savings-amount').value = '';
    }
}

function addExpense() {
    const amt = parseFloat(document.getElementById('expense-amount').value);
    const cat = document.getElementById('expense-category').value;
    const note = document.getElementById('expense-note').value || "Expense";
    const dateInput = document.getElementById('expense-date').value;

    // Use calendar date or today if empty
    let finalDate;
    if (dateInput) {
        const parts = dateInput.split('-'); // YYYY-MM-DD
        finalDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else {
        finalDate = new Date().toLocaleDateString('en-GB');
    }

    if (amt > 0 && amt <= balance) {
        balance -= amt;
        transactions.unshift({ id: Date.now(), date: finalDate, cat, note, amt });
        updateUI();
        document.getElementById('expense-amount').value = '';
        document.getElementById('expense-note').value = '';
        document.getElementById('expense-date').value = '';
    }
}

function renderSpendingPage() {
    const container = document.getElementById('report-container');
    const periodTotal = document.getElementById('period-total');
    if(!container) return;

    const catF = document.getElementById('category-search-dropdown').value;
    const yrF = document.getElementById('filter-year').value;
    const moF = document.getElementById('filter-month').value;

    container.innerHTML = "";
    let filtered = transactions.filter(t => {
        const parts = t.date.split('/');
        const d = new Date(parts[2], parts[1]-1, parts[0]);
        return (catF === 'all' || t.cat === catF) && (yrF === 'all' || d.getFullYear().toString() === yrF) && (moF === 'all' || d.getMonth().toString() === moF);
    });

    periodTotal.innerText = filtered.reduce((s, t) => s + t.amt, 0).toFixed(2);
    [...new Set(filtered.map(t => t.cat))].forEach(cat => {
        const items = filtered.filter(t => t.cat === cat);
        const catTotal = items.reduce((s, i) => s + i.amt, 0);
        let html = `<div class="category-block"><h3>${cat}</h3><table>`;
        items.forEach(t => {
            html += `<tr>
                <td style="position:relative;">
                    <span onclick="triggerEditDate(${t.id})" style="cursor:pointer; text-decoration:none;">${t.date}</span>
                    <input type="date" id="date-picker-${t.id}" style="position:absolute; opacity:0; pointer-events:none; left:0; width:0;" onchange="updateTransactionDate(${t.id}, this.value)">
                </td>
                <td onclick="editNote(${t.id})" style="cursor:pointer;">${t.note}</td>
                <td onclick="editAmount(${t.id})" style="cursor:pointer; font-weight:bold;">${t.amt.toFixed(2)}</td>
                <td class="del-btn" onclick="deleteSpend(${t.id}, ${t.amt})">x</td>
            </tr>`;
        });
        container.innerHTML += html + `</table><div class="total-row"><span>Total</span><span>${catTotal.toFixed(2)} AED</span></div></div>`;
    });
}

// Logic to open calendar when clicking the date
function triggerEditDate(id) {
    document.getElementById(`date-picker-${id}`).showPicker();
}

function updateTransactionDate(id, newDate) {
    if(!newDate) return;
    const parts = newDate.split('-');
    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    const target = transactions.find(t => t.id === id);
    if(target) {
        target.date = formattedDate;
        updateUI();
        renderSpendingPage();
    }
}

function renderIncomePage() {
    const container = document.getElementById('income-report-container');
    if (!container) return;

    const totalIncome = incomeHistory.reduce((sum, entry) => sum + entry.amt, 0);

    let html = `
        <div class="category-block">
            <h3>History</h3>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount (AED)</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    incomeHistory.forEach(i => {
        html += `
            <tr>
                <td style="position:relative;">
                    <span onclick="triggerEditDateInc(${i.id})" style="cursor:pointer;">${i.date}</span>
                    <input type="date" id="date-picker-inc-${i.id}" style="position:absolute; opacity:0; pointer-events:none; left:0; width:0;" onchange="updateIncomeDate(${i.id}, this.value)">
                </td>
                <td>Income</td> <td onclick="editIncomeAmount(${i.id})" style="cursor:pointer; font-weight:bold;">${i.amt.toFixed(2)}</td>
                <td style="text-align:right"><span class="del-btn" onclick="deleteInc(${i.id}, ${i.amt})">x</span></td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            <div class="total-row">
                <span>Total Income Earned</span>
                <span>${totalIncome.toFixed(2)} AED</span>
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function autoPopulateYears() {
    const drop = document.getElementById('filter-year');
    if(!drop) return;
    const years = [...new Set(transactions.map(t => t.date.split('/')[2]))];
    if(!years.includes(new Date().getFullYear().toString())) years.push(new Date().getFullYear().toString());
    drop.innerHTML = '<option value="all">All Years</option>';
    years.sort((a,b)=>b-a).forEach(y => drop.innerHTML += `<option value="${y}">${y}</option>`);
}

function populateSearchDropdown() {
    const drop = document.getElementById('category-search-dropdown');
    if(!drop) return;
    drop.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(c => drop.innerHTML += `<option value="${c}">${c}</option>`);
}

function renderCategories() {
    const select = document.getElementById('expense-category');
    const list = document.getElementById('category-delete-list');
    if(!select) return;
    select.innerHTML = ""; list.innerHTML = "";
    categories.forEach(cat => {
        select.innerHTML += `<option value="${cat}">${cat}</option>`;
        list.innerHTML += `<div>${cat} <span class="del-btn" onclick="removeCat('${cat}')">x</span></div>`;
    });
}

function showSection(id) {
    ['income-section', 'expense-section', 'category-section', 'savings-section'].forEach(s => document.getElementById(s).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function deleteSpend(id, amt) {
    if (confirm("Are you sure?")) {
        transactions = transactions.filter(t => t.id !== id); 
        balance += amt; 
        updateUI(); 
        
        autoPopulateYears();
        populateSearchDropdown();
        renderSpendingPage(); 
    }
}

function deleteInc(id, amt) {
    if (confirm("Are you sure you want to delete this income entry? This will deduct the amount from your total balance.")) {
        incomeHistory = incomeHistory.filter(i => i.id !== id); 
        balance -= amt; 
        updateUI(); 
        renderIncomePage(); 
    }
}

function removeCat(n) { categories = categories.filter(c => c !== n); renderCategories(); updateUI(); }
function addNewCategory() { 
    const n = document.getElementById('new-category-name').value.trim();
    if(n) { categories.push(n); renderCategories(); updateUI(); document.getElementById('new-category-name').value = ''; }
}
function masterReset() { if(confirm("Are you sure you want to reset the website?")) { localStorage.clear(); location.reload(); } }
// EDIT SPENDING AMOUNT IN-PLACE
function editAmount(id) {
    const transaction = transactions.find(t => t.id === id);
    const cell = event.currentTarget; // The <td> you clicked
    
    // Create an input element
    const input = document.createElement('input');
    input.type = 'number';
    input.value = transaction.amt;
    input.style.width = '70px';
    input.className = 'inline-edit-input';

    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();

    // Save on Enter or Blur (clicking away)
    input.onkeydown = (e) => { if(e.key === 'Enter') input.blur(); };
    input.onblur = () => {
        const newAmt = parseFloat(input.value);
        if (!isNaN(newAmt) && newAmt >= 0) {
            const difference = newAmt - transaction.amt;
            if (difference <= balance) {
                balance -= difference;
                transaction.amt = newAmt;
                updateUI();
            } else {
                alert("Insufficient balance!");
            }
        }
        renderSpendingPage(); // Refresh to show text again
    };
}

// EDIT SPENDING NOTE IN-PLACE
function editNote(id) {
    const transaction = transactions.find(t => t.id === id);
    const cell = event.currentTarget;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = transaction.note;
    input.style.width = '100%';
    input.className = 'inline-edit-input';

    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();

    input.onkeydown = (e) => { if(e.key === 'Enter') input.blur(); };
    input.onblur = () => {
        transaction.note = input.value || "Expense";
        updateUI();
        renderSpendingPage();
    };
}

// EDIT INCOME AMOUNT IN-PLACE
function editIncomeAmount(id) {
    const entry = incomeHistory.find(i => i.id === id);
    const cell = event.currentTarget;
    
    const input = document.createElement('input');
    input.type = 'number';
    input.value = entry.amt;
    input.style.width = '70px';
    input.className = 'inline-edit-input';

    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();

    input.onkeydown = (e) => { if(e.key === 'Enter') input.blur(); };
    input.onblur = () => {
        const newAmt = parseFloat(input.value);
        if (!isNaN(newAmt) && newAmt >= 0) {
            const difference = newAmt - entry.amt;
            balance += difference;
            entry.amt = newAmt;
            updateUI();
        }
        renderIncomePage();
    };
}