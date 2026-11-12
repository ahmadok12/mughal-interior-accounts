// Regression tests for the language layer (i18n.js): English, Urdu and Roman Urdu.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(t, lang, { app = true } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://test.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => { dom.window.MughalControls?.destroy(); dom.window.close(); });
  const w = dom.window, d = w.document, ctx = dom.getInternalVMContext(), run = (code) => vm.runInContext(code, ctx);
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {};
  w.HTMLDialogElement.prototype.close = function () {};
  if (lang) w.localStorage.setItem('mi_lang', lang);
  run(fs.readFileSync(path.join(root, 'i18n-strings.js'), 'utf8'));
  run(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'));
  if (app) {
    run(fs.readFileSync(path.join(root, 'app-mobile.js'), 'utf8').replace(/boot\(\);\s*$/, ''));
    w.fixture = structuredClone(require('./project-statement-fixture.cjs'));
    w.fixture.projects[0].closed = false;
    run(`Object.assign(state, fixture); state.paymentAccounts = [{id:'b1',name:'Sample bank',account_type:'Bank',bank_name:'HBL',opening_balance:100000},{id:'cash',name:'Cash',account_type:'Cash',opening_balance:100000}]; state.labourers=[{id:'l1',name:'Sample worker',daily_wage_rate:1500}];`);
    run(fs.readFileSync(path.join(root, 'reports-mobile.js'), 'utf8'));
    run('render();');
    run(fs.readFileSync(path.join(root, 'mobile-controls.js'), 'utf8'));
    run(fs.readFileSync(path.join(root, 'entry-steps.js'), 'utf8'));
  }
  return { w, d, run, i18n: w.MughalI18n };
}

test('English is the default and nothing on screen changes', async (t) => {
  const { d, i18n } = setup(t, null);
  await wait(20);
  assert.equal(i18n.lang(), 'en');
  assert.equal(d.documentElement.dir, 'ltr');
  assert.equal(d.querySelector('#loginForm h1').textContent, 'Welcome back');
});

test('Urdu turns the page right-to-left and translates buttons, headings and placeholders', async (t) => {
  const { d } = setup(t, 'ur');
  await wait(30);
  assert.equal(d.documentElement.dir, 'rtl');
  assert.equal(d.documentElement.lang, 'ur');
  assert.equal(d.querySelector('#loginForm h1').textContent, 'خوش آمدید');
  assert.equal(d.querySelector('#loginForm button[type=submit]').textContent, 'سائن اِن');
  const search = d.querySelector('[placeholder]');
  assert.match(search.getAttribute('placeholder'), /[؀-ۿ]/);
});

test('names, amounts and dates stay exactly as entered', async (t) => {
  const { d } = setup(t, 'ur');
  await wait(30);
  const text = d.body.textContent;
  assert.match(text, /Sample Customer|Sample woodwork project/, 'a customer or project name is unchanged');
  assert.match(text, /Rs\. [\d,]+/, 'money keeps its Rs. format');
});

test('switching back to English restores the original words exactly', async (t) => {
  const { d, i18n } = setup(t, null);
  await wait(20);
  const before = d.body.textContent;
  i18n.setLang('ur');
  await wait(20);
  assert.notEqual(d.body.textContent, before);
  i18n.setLang('roman');
  await wait(20);
  assert.equal(d.querySelector('#loginForm h1').textContent, 'Khush aamdeed');
  assert.equal(d.documentElement.dir, 'ltr');
  i18n.setLang('en');
  await wait(20);
  assert.equal(d.body.textContent.replace(/\s+/g, ' '), before.replace(/\s+/g, ' '));
});

test('the chosen language is remembered', async (t) => {
  const { w, i18n } = setup(t, null, { app: false });
  i18n.setLang('roman');
  assert.equal(w.localStorage.getItem('mi_lang'), 'roman');
});

test('text the app writes later (messages, step questions) is translated too', async (t) => {
  const { d, run } = setup(t, 'roman');
  run("toast('Payment received.')");
  await wait(20);
  assert.equal(d.querySelector('#toast').textContent, 'Payment wusool ho gayi.');
  run('openReceipt()');
  await wait(60);
  const q = d.querySelector('#receiptSheet .es-question, #receiptSheet .es-q, #receiptSheet h3');
  assert.ok(q, 'the step question shows');
  assert.match(d.querySelector('#receiptSheet').textContent, /Ye payment kis project ki hai\?/);
  assert.match(d.querySelector('#receiptSheet').textContent, /Marhala 1 \//);
});

test('step-by-step edit detection still works in Urdu', async (t) => {
  const { d, w } = setup(t, 'ur');
  await wait(20);
  const h2 = d.querySelector('#receiptSheet .sheet-head h2');
  h2.textContent = 'Edit received payment';
  await wait(20);
  assert.match(h2.textContent, /ترمیم/);
  assert.equal(w.MughalI18n.source(h2), 'Edit received payment');
});

test('the language layer never fights the app over a label (no endless loop)', async (t) => {
  const { d, w } = setup(t, 'ur', { app: false });
  const span = d.createElement('span');
  d.body.append(span);
  let writes = 0;
  const fight = new w.MutationObserver(() => {
    if (writes++ < 500 && span.textContent !== 'Select paid from') span.textContent = 'Select paid from';
  });
  fight.observe(span, { childList: true, characterData: true, subtree: true });
  span.textContent = 'Select paid from';
  await wait(200);
  fight.disconnect();
  assert.ok(writes < 100, `settled after ${writes} writes`);
});

test('pop-up questions follow the language', async (t) => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://test.invalid', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  let asked = '';
  w.confirm = (m) => ((asked = m), true);
  w.localStorage.setItem('mi_lang', 'ur');
  vm.runInContext(fs.readFileSync(path.join(root, 'i18n-strings.js'), 'utf8'), dom.getInternalVMContext());
  vm.runInContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), dom.getInternalVMContext());
  w.confirm('Delete this record? This cannot be undone.');
  assert.equal(asked, 'یہ ریکارڈ حذف کریں؟ یہ واپس نہیں ہو سکتا۔');
});

test('every translation line has English, Urdu and Roman Urdu', () => {
  const src = fs.readFileSync(path.join(root, 'i18n-strings.js'), 'utf8');
  const body = src.slice(src.indexOf('`') + 1, src.lastIndexOf('`'));
  body.split('\n').filter((l) => l.trim()).forEach((line) => {
    const parts = line.split(' | ');
    assert.equal(parts.length, 3, `bad line: ${line}`);
    assert.match(parts[1], /[؀-ۿ]|^[\W\d]*$/, `Urdu missing: ${line}`);
  });
});

test('Urdu PDFs get a copy where English and numbers sit in their own left-to-right pieces', async (t) => {
  const { d, i18n } = setup(t, 'ur', { app: false });
  const doc = d.createElement('div');
  doc.innerHTML = '<p>Proprietor Ali Raza Mughal</p><p>As of 12 Nov 2026</p><b>Rs. 5,000</b>';
  d.body.append(doc);
  await wait(10);
  const copy = i18n.pdfSource(doc);
  assert.notEqual(copy, doc, 'the screen itself is left alone');
  assert.ok(!/[⁦-⁩]/.test(copy.textContent), 'no invisible direction marks reach the PDF');
  const spans = [...copy.querySelectorAll('span[dir=ltr]')].map((s) => s.textContent);
  assert.ok(spans.includes('Ali Raza Mughal'));
  assert.ok(spans.some((s) => s.includes('12 Nov 2026')));
  assert.match(copy.textContent, /مالک/);
  i18n.setLang('en');
  assert.equal(i18n.pdfSource(doc), doc, 'English PDFs are made exactly as before');
});

test('document labels and app messages with numbers are translated, names kept', async (t) => {
  const { i18n } = setup(t, 'ur', { app: false });
  assert.equal(i18n.t('Number of days'), 'دنوں کی تعداد');
  assert.match(i18n.t('Enter an amount up to Rs. 2,000.'), /Rs\. 2,000.*تک رقم درج کریں/);
  assert.match(i18n.t('Supplier payment - Ali Timber'), /سپلائر ادائیگی - .*Ali Timber/);
  assert.match(i18n.t('Delete party'), /پارٹی حذف کریں/);
  assert.equal(i18n.t('Mughal Interior'), 'Mughal Interior', 'the business name stays as written');
  assert.equal(i18n.t('Project receipt', 'roman'), 'Project raseed');
});
