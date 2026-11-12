// Regression tests for report drill-downs (tap a row to see what is behind it).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');

function setup(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://test.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, ctx = dom.getInternalVMContext();
  w.scrollTo = () => {};
  const run = (code) => vm.runInContext(code, ctx);
  run(fs.readFileSync(path.join(root, 'app-mobile.js'), 'utf8').replace(/boot\(\);\s*$/, ''));
  w.fixture = structuredClone(require('./project-statement-fixture.cjs'));
  w.fixture.projects[0].closed = false;
  run('Object.assign(state,fixture);');
  run(fs.readFileSync(path.join(root, 'reports-mobile.js'), 'utf8'));
  run('render();');
  const openReport = (type) => d.querySelector(`[data-open-report="${type}"]`).click();
  const allDates = () => { d.getElementById('reportFrom').value = ''; d.getElementById('reportTo').value = ''; d.getElementById('reportFrom').dispatchEvent(new w.Event('change')); };
  return { w, d, openReport, allDates, content: () => d.getElementById('reportContent'), title: () => d.getElementById('reportTitle').textContent };
}

test('a profit row opens that project’s profit with every cost, and Back returns to the profit report', (t) => {
  const { d, openReport, allDates, content, title } = setup(t);
  openReport('profit');
  allDates();
  const row = content().querySelector('tr[data-drill^="profit:project:"]');
  assert.ok(row, 'project rows can be tapped');
  row.click();
  assert.match(title(), /profit$/);
  assert.notEqual(title(), 'Profit report');
  assert.match(content().innerHTML, /Sales/);
  assert.match(content().innerHTML, /Total costs|No costs yet/);
  assert.match(content().innerHTML, /See payments received and balance/);
  const back = d.getElementById('reportDrillBack');
  assert.ok(back && !back.classList.contains('hidden'));
  assert.match(back.textContent, /Back to Profit report/);
  back.click();
  assert.equal(title(), 'Profit report');
  assert.ok(content().querySelector('tr[data-drill^="profit:"]'), 'the profit table is back');
  assert.ok(d.getElementById('reportDrillBack').classList.contains('hidden'));
});

test('a receivable row opens the project statement with its payments, keeping the date', (t) => {
  const { d, openReport, content, title } = setup(t);
  openReport('receivables');
  const row = content().querySelector('tr[data-drill^="statement:project:"]');
  assert.ok(row, 'receivable rows can be tapped');
  row.click();
  assert.match(title(), /statement/i);
  assert.match(content().innerHTML, /Period totals \/ closing balance/);
  assert.equal(d.getElementById('reportTo').value, d.getElementById('reportAsOf').value, 'the as-of date carries over');
});

test('profit view link goes on to the statement and Back steps back one level at a time', (t) => {
  const { d, openReport, allDates, content, title } = setup(t);
  openReport('profit');
  allDates();
  content().querySelector('tr[data-drill^="profit:project:"]').click();
  const profitTitle = title();
  content().querySelector('.drill-link').click();
  assert.match(content().innerHTML, /Period totals \/ closing balance/);
  d.getElementById('reportDrillBack').click();
  assert.equal(title(), profitTitle);
  d.getElementById('reportDrillBack').click();
  assert.equal(title(), 'Profit report');
});

test('opening a report from the grid starts without a Back link', (t) => {
  const { d, openReport, allDates, content } = setup(t);
  openReport('profit');
  allDates();
  content().querySelector('tr[data-drill^="profit:"]').click();
  openReport('expenses');
  assert.ok(d.getElementById('reportDrillBack').classList.contains('hidden'));
});
