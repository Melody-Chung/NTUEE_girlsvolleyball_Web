const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync(join(__dirname, '../static/script.js'), 'utf8');
const storage = new Map();
const context = vm.createContext({
    assert, console, Date,
    localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
    },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    getMonthData: () => ({ id: '2026-10' }),
    normalizeCourtDateValue: value => value.split(' ')[0],
    normalizeMonthString: value => value,
    alert: () => {},
});
vm.runInContext(source.slice(source.indexOf('const LOTTERY_WEEKDAY_KEY'),
    source.indexOf("window.addEventListener('load', initLotteryWeekdayFilters)")), context);
vm.runInContext(`
    const month = '2026-10';
    const rows = buildZeroLotteryRows(month);
    rows[0].slot1['Court 4'] = 1;
    saveAccountPlanRows(month, rows);
    let plan = getAccountAssignmentPlan(month, rows);
    assert.equal(plan.accounts.length, 5);
    assert.equal(getStrategyTicketBudget(), 50);
    assert.equal(moveAccountTicket(month, 'A', 0, 'E'), true);
    plan = getAccountAssignmentPlan(month, getStoredAccountPlanRows(month));
    assert.equal(plan.accounts[4].ticketsUsed, 1);
    assert.equal(plan.accounts[0].ticketsUsed, 0);
    assert.equal(getAccountAssignmentPlan('2026-11', rows).accounts[0].ticketsUsed, 1);

    // Two full accounts can exchange tickets without changing total bids.
    const fullRows = buildZeroLotteryRows(month);
    for (let i = 0; i < 20; i++) fullRows[i].slot1['Court 4'] = 1;
    saveAccountPlanRows(month, fullRows);
    plan = getAccountAssignmentPlan(month, fullRows);
    const a = plan.accounts.find(account => account.ticketsUsed === 10);
    const b = plan.accounts.find(account => account !== a && account.ticketsUsed === 10);
    const first = a.assignments[0].date;
    const second = b.assignments[0].date;
    assert.equal(moveAccountTicket(month, a.account, 0, b.account), false);
    assert.equal(moveAccountTicket(month, a.account, 0, b.account, 0), true);
    plan = getAccountAssignmentPlan(month, fullRows);
    assert.equal(plan.accounts.find(account => account.account === a.account).assignments[0].date, second);
    assert.equal(plan.accounts.find(account => account.account === b.account).assignments[0].date, first);
    assert.deepEqual(getStoredAccountPlanRows(month), fullRows);

    // Changing the distribution resets manual owners.
    fullRows[20].slot1['Court 4'] = 1;
    saveAccountPlanRows(month, fullRows);
    assert.equal(localStorage.getItem(accountAssignmentStorageKey(month)), null);

    const duplicateRows = buildZeroLotteryRows(month);
    duplicateRows[0].slot1['Court 4'] = 2;
    saveAccountPlanRows(month, duplicateRows);
    assert.equal(moveAccountTicket(month, 'A', 0, 'B'), false);
    assert.equal(moveAccountTicket(month, 'A', 99, 'E'), false);

    // All fifty tickets fit, with five distinct accounts per pool.
    const fifty = buildZeroLotteryRows(month);
    for (let i = 0; i < 10; i++) fifty[i].slot1['Court 4'] = 5;
    const capacity = buildAccountAssignmentsFromRows(fifty);
    assert.equal(capacity.unassigned.length, 0);
    assert(capacity.accounts.every(account => account.ticketsUsed === 10));
    console.log('PASS: move, swap at capacity, persistence, month isolation, reset, duplicate protection, 50-ticket capacity');
`, context);
