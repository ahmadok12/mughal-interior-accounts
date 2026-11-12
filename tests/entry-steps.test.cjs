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
  await wait(60);
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
  await wait(300);
  assert.equal(q(), 'How much did they pay?', 'picking a project moves on by itself');

  nextBtn.click();
  assert.equal(err().hidden, false, 'an empty amount is not accepted');
  d.getElementById('receiptAmount').value = '5000';
  nextBtn.click();
  assert.equal(q(), 'Where did the money go?');
  const accountSel = d.getElementById('receiptAccount');
  accountSel.value = 'b1';
  accountSel.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  await wait(300);

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
  await wait(300);
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
  await wait(60);
  run(`$('#receiptForm').reset(); $('#receiptId').value='existing'; openSheet('#receiptSheet');`);
  await wait(60);
  const form = d.getElementById('receiptForm');
  assert.ok(visible(d.getElementById('receiptAmount')));
  assert.ok(visible(form.querySelector('.form-actions')));
  assert.ok(!visible(form.closest('.sheet').querySelector('.es-head')));
});

test('closing and reopening starts again at the first question', async (t) => {
  const { d, run } = setup(t);
  run('openReceipt()');
  await wait(60);
  const sheet = d.getElementById('receiptSheet');
  d.getElementById('receiptProject').value = d.getElementById('receiptProject').options[1].value;
  sheet.querySelector('.es-next').click();
  run('closeSheets(true)');
  await wait(60);
  run('openReceipt()');
  await wait(60);
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
  await wait(60);
  assert.equal(q(), 'Bought from which supplier?');
  const sup = d.getElementById('purchaseSupplier');
  sup.value = 's1';
  sup.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  await wait(300);
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
  await wait(60);
  run(`openPurchase('cash')`);
  await wait(60);
  assert.equal(q(), 'What is on the bill?', 'a cash purchase has no supplier question');
  fillLine();
  sheet.querySelector('.es-next').click();
  assert.equal(q(), 'Paid from which account?');
});

const sprint3State = `state.paymentAccounts=[{id:'b1',name:'Sample bank',account_type:'Bank',bank_name:'HBL',opening_balance:100000},{id:'b2',name:'Second bank',account_type:'Bank',bank_name:'MCB',opening_balance:100000},{id:'cash',name:'Cash',account_type:'Cash',opening_balance:100000}];state.materials=[{id:'m1',name:'Plywood',unit:'sheet',default_unit_cost:100,tracking_type:'stock',opening_quantity:50}];state.expenseCategories=[{id:'e1',name:'Transport'},{id:'e2',name:'Fuel'}];`;

test('withdraw cash skips the only cash account but still shows it on the review', async (t) => {
  const { d, run } = setup(t);
  run(sprint3State);
  run(`openBankingTransfer('withdraw')`);
  await wait(60);
  const sheet = d.getElementById('bankTransferSheet'), q = () => sheet.querySelector('.es-q').textContent;
  assert.equal(q(), 'Which bank did you take cash out of?');
  assert.equal(sheet.querySelector('.es-count').textContent, 'Step 1 of 3');
  const from = d.getElementById('bankTransferFrom');
  from.value = 'b1';
  from.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  await wait(300);
  assert.equal(q(), 'How much?', 'the cash account is not asked');
  sheet.querySelector('.es-next').click();
  assert.equal(sheet.querySelector('.es-error').hidden, false, 'an empty amount is not accepted');
  d.getElementById('bankTransferAmount').value = '1000';
  sheet.querySelector('.es-next').click();
  assert.equal(q(), 'Check and save');
  const rows = Array.from(sheet.querySelectorAll('.es-row'));
  const to = rows.find((r) => r.querySelector('span').textContent === 'To');
  assert.ok(to && to.disabled, 'the fixed cash account is listed but cannot be changed');
  assert.ok(!d.getElementById('bankTransferDetails').closest('.es-off'), 'the optional note is on the review screen');
});

test('bank to bank asks for both banks', async (t) => {
  const { d, run } = setup(t);
  run(sprint3State);
  run(`openBankingTransfer('bank')`);
  await wait(60);
  const sheet = d.getElementById('bankTransferSheet');
  assert.equal(sheet.querySelector('.es-count').textContent, 'Step 1 of 4');
});

test('any sheet titled "Edit …" keeps the full form', async (t) => {
  const { d, run, visible } = setup(t);
  run(sprint3State);
  run(`openExpenseCharge()`);
  await wait(60);
  run(`closeSheets(true)`);
  await wait(60);
  run(`$('.sheet-head h2', $('#expenseChargeSheet')).textContent='Edit project expense'; openSheet('#expenseChargeSheet')`);
  await wait(60);
  assert.ok(visible(d.getElementById('expenseChargeAmount')));
  assert.ok(visible(d.getElementById('expenseChargeForm').querySelector('.form-actions')));
});

test('a quote is asked step by step and ends on its own Save buttons', async (t) => {
  const { d, run, visible } = setup(t);
  run(sprint3State);
  run(`openQuote()`);
  await wait(60);
  const sheet = d.getElementById('quoteSheet'), form = d.getElementById('quoteForm');
  assert.equal(sheet.querySelector('.es-q').textContent, 'Which project is this quote for?');
  assert.ok(!visible(form.querySelector('.stack-actions')), 'Save waits for the review');
  const flow = d.defaultView.MughalSteps.flows.get('quoteForm');
  flow.index = flow.config.steps.length - 1;
  sheet.querySelector('.es-next').click();
  assert.equal(sheet.querySelector('.es-q').textContent, 'Check and save');
  assert.ok(visible(form.querySelector('.stack-actions')), 'Save and Save and download PDF are on the review');
});

test('returning material asks what came back', async (t) => {
  const { d, run } = setup(t);
  run(sprint3State);
  run(`openMaterialAssignment('return')`);
  await wait(60);
  assert.match(d.getElementById('materialAssignmentSheet').querySelector('.es-q').textContent, /coming back from/);
});

test('adding a party asks its name, with optional details on the review; editing keeps the full form', async (t) => {
  const { d, run, visible } = setup(t);
  run(`openParty()`);
  await wait(60);
  const sheet = d.getElementById('partySheet');
  assert.equal(sheet.querySelector('.es-q').textContent, 'What is the party’s name?');
  assert.ok(!visible(d.getElementById('partyPhone')));
  sheet.querySelector('.es-next').click();
  assert.equal(sheet.querySelector('.es-error').hidden, false, 'a name is required');
  d.getElementById('partyName').value = 'Haji Nawaz';
  sheet.querySelector('.es-next').click();
  assert.equal(sheet.querySelector('.es-q').textContent, 'Check and save');
  assert.ok(visible(d.getElementById('partyPhone')), 'mobile number is on the review');
  run(`closeSheets(true)`);
  await wait(60);
  const party = run(`state.parties[0].id`);
  run(`openParty('${party}')`);
  await wait(60);
  assert.ok(visible(d.getElementById('partyPhone')), 'Edit party shows the full form');
  assert.ok(!visible(sheet.querySelector('.es-head')));
});
