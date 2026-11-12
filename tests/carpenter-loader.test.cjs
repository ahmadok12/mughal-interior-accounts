// Regression tests for the carpenter loading screen (carpenter-loader.js).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(t, savedSession) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'https://test.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  if (savedSession) w.localStorage.setItem('mi_mobile_session', '{"token":"x"}');
  vm.runInContext(fs.readFileSync(path.join(root, 'carpenter-loader.js'), 'utf8'), dom.getInternalVMContext());
  return { w, d, loader: () => d.querySelector('.carpenter-loader') };
}

test('opening the app with a saved sign-in shows the carpenter until the accounts are ready', async (t) => {
  const { d, loader } = setup(t, true);
  assert.ok(loader(), 'the loader shows straight away');
  assert.match(loader().textContent, /Getting your accounts ready/);
  d.getElementById('app').classList.remove('hidden');
  await wait(300);
  assert.ok(loader() && !loader().classList.contains('cl-out'), 'it stays for at least one hammer swing');
  await wait(2700);
  assert.equal(loader(), null, 'it leaves once the app is ready');
});

test('no saved sign-in: nothing shows until you tap Sign in, and a failed sign-in removes it at once', async (t) => {
  const { d, w, loader } = setup(t, false);
  assert.equal(loader(), null);
  d.getElementById('loginScreen').classList.remove('hidden');
  d.getElementById('loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.ok(loader(), 'signing in shows the carpenter');
  d.getElementById('loginError').classList.remove('hidden');
  await wait(20);
  assert.equal(loader(), null, 'a sign-in error removes it immediately');
});

test('an expired sign-in that falls back to the login screen removes the loader', async (t) => {
  const { d, loader } = setup(t, true);
  assert.ok(loader());
  d.getElementById('loginScreen').classList.remove('hidden');
  await wait(20);
  assert.equal(loader(), null);
});
