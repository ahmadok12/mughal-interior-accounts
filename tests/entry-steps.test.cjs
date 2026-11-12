// Regression tests for the step-by-step entry layer (entry-steps.js).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://test.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => { dom.window.MughalControls?.destroy(); dom.window.close(); });
  const w = dom.window, d = w.document, ctx = dom.getInternalVMContext();
  w.scrollTo = () => {};
  w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const run = (code) => vm.runInContext(code, ctx);
  run(fs.readFileSync(path.join(root, 'app-mobile.js'), 'utf8').replace(/boot\(\);\s*$/, ''));
  w.fixture = structuredClone(require('./project-statement-fixture.cjs'));
  w.fixture.projects[0].closed = false;
  run(`Object.assign(state,fixture);state.labourers=[{id:'l1',name:'Sample worker',daily_wage_rate:1500}];state.paymentAccounts=[{id:'b1',name:'Sample bank',account_type:'Bank',opening_balance:100000},{id:'cash',name:'Cash',account_type:'Cash',opening_balance:100000}];`);
  run(fs.readFileSync(path.join(root, 'reports-mobile.js'), 'utf8'));
  run('render();');
  run(fs.readFileSync(path.join(root, 'mobile-controls.js'), 'utf8'));
  run(fs.readFileSync(path.join(root, 'entry-steps.js'), 'utf8'));
  const visible = (el) => !!el && !el.closest('.es-off');
  return { w, d, run, visible };
}

test('every step-by-step flow points at fields that exist in the page', (t) => {
  const { w, d } = setup(t);
  for (const [id, config] of Object.entries(w.MughalSteps.FLOWS)) {
    const form = d.getElementById(id);
    assert.ok(form, `${id} exists`);
    for (const step of config.steps) {
      for (const sel of [step.f, ...(step.with || [])].filter(Boolean)) assert.ok(form.querySelector(sel), `${id}: ${sel}`);
    }
    for (const sel of config.review || []) assert.ok(form.querySelector(sel), `${id}: review ${sel}`);
  }
});

test('payment received is asked one question at a time, then reviewed and saved through the same form', async (t) => {
  const { d, run, visible } = setup(t);
  run('openReceipt()');
  await wait(20);
  const form = d.getElementById('receiptForm'), sheet = form.closest('.sheet');
  const q = () => sheet.querySelector('.es-q').textContent;
  const err = () => sheet.querySelector('.es-error');
  const nextBtn = sheet.querySelector('.es-next');

  assert.equal(q(), 'Which project is this payment for?');
  assert.ok(visible(d.getElementById('receiptProject')));
  assert.ok(!visible(d.getElementById('receiptAmount')), 'later questions are hidden');
  assert.ok(!visible(form.querySelector('.form-actions')), 'Save waits for the review screen');
  assert.equal(run('isSheetDirty(getActiveEntrySheet())'), false, 'showing steps is not an unsaved change');

  nextBtn.click();
  assert.equal(err().hidden, false, 'a missing answer is pointed out');
  assert.equal(q(), 'Which project is this payment for?');

  const project = d.getElementById('receiptProject');
  project.value = project.options[1].value;
  project.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  await wait(220);
  assert.equal(q(), 'How much did they pay?', 'picking a project moves on by itself');

  nextBtn.click();
  assert.equal(err().hidden, false, 'an empty amount is not accepted');
  d.getElementById('receiptAmount').value = '5000';
  nextBtn.click();
  assert.equal(q(), 'Where did the money go?');
  const accountSel = d.getElementById('receiptAccount');
  accountSel.value = 'b1';
  accountSel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  await wait(220);

  assert.equal(q(), 'Check and save');
  const rows = Array.from(sheet.querySelectorAll('.es-row b')).map((b) => b.textContent);
  assert.equal(rows.length, 3);
  assert.equal(rows[1], 'Rs. 5,000');
  assert.match(rows[2], /Sample bank/);
  assert.ok(visible(d.getElementById('receiptDate')), 'the date is confirmed on the review screen');
  assert.ok(visible(form.querySelector('.form-actions')), 'Save is shown on the review screen');

  sheet.querySelectorAll('.es-row')[1].click();
  assert.equal(q(), 'How much did they pay?', 'Change goes back to that question');
  nextBtn.click();
  accountSel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  await wait(220);
  assert.equal(q(), 'Check and save');

  let submitted = null;
  form.addEventListener('submit', (e) => {
    submitted = { amount: d.getElementById('receiptAmount').value, account: accountSel.value };
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  form.querySelector('.form-actions [type="submit"]').click();
  assert.deepEqual(submitted, { amount: '5000', account: 'b1' }, 'Save submits the original form');
});

test('editing an existing payment keeps the full form', async (t) => {
  const { d, run, visible } = setup(t);
  run(`openReceipt(); $('#receiptId').value='existing'; closeSheets(true);`);
  await wait(20);
  run(`$('#receiptForm').reset(); $('#receiptId').value='existing'; openSheet('#receiptSheet');`);
  await wait(20);
  const form = d.getElementById('receiptForm');
  assert.ok(visible(d.getElementById('receiptAmount')));
  assert.ok(visible(form.querySelector('.form-actions')));
  assert.ok(!visible(form.closest('.sheet').querySelector('.es-head')));
});

test('closing and reopening starts again at the first question', async (t) => {
  const { d, run } = setup(t);
  run('openReceipt()');
  await wait(20);
  const sheet = d.getElementById('receiptSheet');
  d.getElementById('receiptProject').value = d.getElementById('receiptProject').options[1].value;
  sheet.querySelector('.es-next').click();
  run('closeSheets(true)');
  await wait(20);
  run('openReceipt()');
  await wait(20);
  assert.equal(sheet.querySelector('.es-q').textContent, 'Which project is this payment for?');
});

test('a purchase asks for the supplier, then the items, and a cash purchase skips the supplier and asks for the account', async (t) => {
  const { d, run, visible } = setup(t);
  run(`state.materials=[{id:'m1',name:'Plywood',unit:'sheet',default_unit_cost:100,tracking_type:'stock'}];state.suppliers=[{id:'s1',name:'Modern Hardware'}];`);
  const sheet = d.getElementById('purchaseSheet'), form = d.getElementById('purchaseForm');
  const q = () => sheet.querySelector('.es-q').textContent;
  const fillLine = () => {
    const line = form.querySelector('#purchaseLines .invoice-line') || (run(`$('#addPurchaseLine').click()`), form.querySelector('#purchaseLines .invoice-line'));
    const sel = line.querySelector('select');
    sel.value = 'm1';
    sel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
    line.querySelectorAll('input[type="number"]').forEach((input) => { if (!input.disabled && !input.readOnly) { input.value = '2'; input.dispatchEvent(new d.defaultView.Event('input', { bubbles: true })); } });
  };

  run(`openPurchase('credit')`);
  await wait(20);
  assert.equal(q(), 'Bought from which supplier?');
  const sup = d.getElementById('purchaseSupplier');
  sup.value = 's1';
  sup.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  await wait(220);
  assert.equal(q(), 'What is on the bill?');
  assert.ok(visible(d.getElementById('purchaseLines')));
  assert.ok(visible(form.querySelector('.totals-card')), 'the totals and discount stay with the items');
  fillLine();
  sheet.querySelector('.es-next').click();
  assert.equal(q(), 'Check and save', 'a credit purchase needs no account');
  const rows = Array.from(sheet.querySelectorAll('.es-row')).map((r) => r.querySelector('span').textContent);
  assert.deepEqual(rows, ['Supplier', 'Items']);
  assert.ok(visible(d.getElementById('purchaseDate')));

  run('closeSheets(true)');
  await wait(20);
  run(`openPurchase('cash')`);
  await wait(20);
  assert.equal(q(), 'What is on the bill?', 'a cash purchase has no supplier question');
  fillLine();
  sheet.querySelector('.es-next').click();
  assert.equal(q(), 'Paid from which account?');
});
