/* Mughal Interior — language layer (English, اردو, Roman Urdu).
   The app keeps writing English. This layer swaps the words on screen (text, placeholders, labels,
   tooltips) for the chosen language and remembers the English, so switching back is exact.
   Names, amounts and dates are never in the word list, so they stay as typed. Saved data is not touched. */
(function () {
  'use strict';
  const KEY = 'mi_lang',
    LANGS = {
      en: { label: 'English', short: 'EN', dir: 'ltr', html: 'en' },
      ur: { label: 'اردو', short: 'اردو', dir: 'rtl', html: 'ur' },
      roman: { label: 'Roman Urdu', short: 'RU', dir: 'ltr', html: 'ur-Latn' },
    },
    ATTRS = ['placeholder', 'aria-label', 'title'],
    SKIP = 'script,style,textarea,code,pre,[data-no-i18n]',
    LRI = '\u2066',
    PDI = '\u2069',
    ARABIC = /[؀-ۿ]/;

  const norm = (s) => s.replace(/[\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const dict = { ur: new Map(), roman: new Map() },
    reverse = new Map();

  function load() {
    const lines = String(window.MUGHAL_I18N_STRINGS || '').split('\n'),
      rows = [];
    lines.forEach((line) => {
      const parts = line.split(' | ');
      if (parts.length !== 3) return;
      const [en, ur, roman] = parts.map((p) => p.trim());
      rows.push([en, ur, roman]);
      dict.ur.set(norm(en), ur);
      dict.roman.set(norm(en), roman);
    });
    // A translated phrase maps back to English only when it isn't itself an English phrase.
    rows.forEach(([en, ur, roman]) => {
      [ur, roman].forEach((t) => {
        const k = norm(t);
        if (!dict.ur.has(k) && !reverse.has(k)) reverse.set(k, en);
      });
    });
  }
  load();

  let lang = 'en';
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS[saved]) lang = saved;
  } catch (_) {}

  /* ---------- translating one piece of text ---------- */
  // Only mixed runs like "5 Jan 2026" need wrapping; plain numbers already read correctly in Urdu.
  const isolate = (s) => (lang === 'ur' && s && !ARABIC.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s) ? LRI + s + PDI : s);
  // Kept parts (names, amounts, dates) inside an Urdu sentence keep their own left-to-right order.
  const keepOrder = (s) => (lang === 'ur' && s && !ARABIC.test(s) && /[A-Za-z\d]/.test(s) ? LRI + s + PDI : s);
  const caps = (src, out) => {
    if (lang !== 'roman') return out;
    if (/[A-Z]/.test(src) && src === src.toUpperCase() && src.length > 1) return out.toUpperCase();
    if (/^[A-Z]/.test(src) && /^[a-z]/.test(out)) return out[0].toUpperCase() + out.slice(1);
    return out;
  };
  const STOP = { ur: '۔', roman: '.' };

  // {n} = the group translated (or kept), $n = the group kept exactly (names, dates, amounts).
  const PATTERNS = [
    [/^Step (\d+) of (\d+)$/, { ur: 'مرحلہ $1 از $2', roman: 'Marhala $1 / $2' }],
    [/^(\d+½?|½) days?$/, { ur: '$1 دن', roman: '$1 din' }],
    [/^As of (.+)$/, { ur: '$1 تک', roman: '$1 tak' }],
    [/^(.+?\d{4}) to (.+?\d{4})$/, { ur: '$1 تا $2', roman: '$1 se $2' }],
    [/^Generated (.+?)(\.?)$/, { ur: 'تیاری: $1', roman: 'Tayyar: $1' }],
    [/^Period: (.+?) · Generated (.+)$/, { ur: 'مدت: {1} · تیاری: $2', roman: 'Muddat: {1} · Tayyar: $2' }],
    [/^Period: (.+)$/, { ur: 'مدت: $1', roman: 'Muddat: $1' }],
    [/^Available in (.+): (.+)$/, { ur: '$1 میں دستیاب: $2', roman: '$1 mein dastiyab: $2' }],
    [/^← Back to (.+)$/, { ur: '← واپس: {1}', roman: '← Wapas: {1}' }],
    [/^Back to (.+)$/, { ur: 'واپس: {1}', roman: 'Wapas: {1}' }],
    [/^([\d.,]+) (.+) in stock$/, { ur: '$1 {2} اسٹاک میں', roman: '$1 {2} stock mein' }],
    [/^Record a (.+) partner drawing\.$/, { ur: '$1 کی پارٹنر نکاسی درج کریں۔', roman: '$1 ki partner nikasi darj karein.' }],
    [/^Record (.+) drawing$/, { ur: '$1 کی نکاسی درج کریں', roman: '$1 ki nikasi darj karein' }],
    [/^No (.+) drawings match this date range\.$/, { ur: 'ان تاریخوں میں $1 کی کوئی نکاسی نہیں۔', roman: 'In tareekhon mein $1 ki koi nikasi nahin.' }],
    [/^(.+) partner drawings$/, { ur: '$1 پارٹنر نکاسی', roman: '$1 partner nikasi' }],
    [/^(.+) drawing statement$/, { ur: '$1 نکاسی کھاتہ', roman: '$1 nikasi khata' }],
    [/^(.+) drawings$/, { ur: '$1 کی نکاسی', roman: '$1 ki nikasi' }],
    [/^Please attach the downloaded (.+)$/, { ur: 'براہِ کرم ڈاؤن لوڈ شدہ فائل لگائیں: $1', roman: 'Barah-e-karam download shuda file lagayein: $1' }],
    [/^(Rs\. [-\d.,]+) daily$/, { ur: '$1 روزانہ', roman: '$1 rozana' }],
    [/^(Rs\. [-\d.,]+) latest cost$/, { ur: '$1 تازہ قیمت', roman: '$1 taaza qeemat' }],
    [/^(.+) - ([-\d.,]+) (\S+) available$/, { ur: '$1 - $2 {3} دستیاب', roman: '$1 - $2 {3} dastiyab' }],
    [/^([-\d.,]+) (\S+) available$/, { ur: '$1 {2} دستیاب', roman: '$1 {2} dastiyab' }],
    [/^Proprietor (.+)$/, { ur: 'مالک $1', roman: 'Maalik: $1' }],
    [/^PAYMENT RECEIPT · (.+)$/, { ur: 'ادائیگی رسید · $1', roman: 'PAYMENT RASEED · $1' }],
    [/^(.+) · Due (Rs\. .+)$/, { ur: '$1 · باقی $2', roman: '$1 · baqi $2' }],
    [/^Invoice (Rs\. .+) · received to date (Rs\. .+)$/, { ur: 'انوائس $1 · اب تک وصول $2', roman: 'Invoice $1 · ab tak wusool $2' }],
    [/^Initial opening: (.+)$/, { ur: 'ابتدائی رقم: $1', roman: 'Ibtidai raqam: $1' }],
    [/^All entries for this (project|order)$/, { ur: 'اس {1} کے تمام اندراج', roman: 'Is {1} ke tamaam indiraaj' }],
    [/^Enter an amount up to (.+)\.$/, { ur: '$1 تک رقم درج کریں۔', roman: '$1 tak raqam darj karein.' }],
    [/^Select the (project|order)\.$/, { ur: '{1} منتخب کریں۔', roman: '{1} chunein.' }],
    [/^Please choose (.+)\.$/, { ur: '{1} منتخب کریں۔', roman: '{1} chunein.' }],
    [/^Select (.+)$/, { ur: '{1} منتخب کریں', roman: '{1} chunein' }],
    [/^Use (.+)$/, { ur: '$1 استعمال کریں', roman: '$1 istemal karein' }],
    [/^Delete (.+)$/, { ur: '{1} حذف کریں', roman: '{1} delete karein' }],
    [/^Deleting (.+)…$/, { ur: '{1} حذف ہو رہا ہے…', roman: '{1} delete ho raha hai…' }],
    [/^Assigning (\d+) materials?…$/, { ur: '$1 میٹیریل دیے جا رہے ہیں…', roman: '$1 material diye ja rahe hain…' }],
    [/^Labour: (.+) \(([\d.½]+) days?\)$/, { ur: 'لیبر: $1 ($2 دن)', roman: 'Labour: $1 ($2 din)' }],
    [/^(Cash purchase|Project receipt|Order receipt|Supplier payment|Partner drawing) - (.+)$/, { ur: '{1} - $2', roman: '{1} - $2' }],
    [/^Customer (\d)-column statement$/, { ur: 'کسٹمر کھاتہ ($1 کالم)', roman: 'Customer khata ($1 column)' }],
    [/^Supplier (\d)-column statement$/, { ur: 'سپلائر کھاتہ ($1 کالم)', roman: 'Supplier khata ($1 column)' }],
  ];

  function fill(template, match, depth) {
    return template
      .replace(/\{(\d)\}/g, (_, n) => {
        const part = match[n] || '',
          done = phrase(part, depth + 1);
        return done == null ? isolate(part) : done;
      })
      .replace(/\$(\d)/g, (_, n) => keepOrder(match[n] || ''));
  }

  function phrase(text, depth = 0) {
    const core = text.trim();
    if (!core) return null;
    const hit = dict[lang].get(norm(core));
    if (hit != null) return caps(core, hit);
    if (depth > 4) return null;
    let m;
    if ((m = core.match(/^(.*\S)\s*\*$/))) {
      const r = phrase(m[1], depth + 1);
      if (r != null) return r + ' *';
    }
    if ((m = core.match(/^([+✎]\s*)(.+)$/))) {
      const r = phrase(m[2], depth + 1);
      if (r != null) return m[1] + r;
    }
    for (const [re, out] of PATTERNS) {
      if ((m = core.match(re))) return fill(out[lang], m, depth);
    }
    if (core.includes(' · ')) {
      let changed = false;
      const parts = core.split(' · ').map((p) => {
        const r = phrase(p, depth + 1);
        if (r != null) changed = true;
        return r == null ? isolate(p) : r;
      });
      if (changed) return parts.join(' · ');
    }
    if ((m = core.match(/^([^:]{2,40}): (.+)$/))) {
      const left = phrase(m[1], depth + 1);
      if (left != null) {
        const right = phrase(m[2], depth + 1);
        return `${left}: ${right == null ? isolate(m[2]) : right}`;
      }
    }
    // Several sentences: translate each one; only use it when every sentence is known.
    const sentences = core.split(/(?<=[.?!])\s+(?=[A-Z])/);
    if (sentences.length > 1) {
      const done = sentences.map((s) => phrase(s, depth + 1));
      if (done.every((s) => s != null)) return done.join(' ');
    }
    return null;
  }

  function t(text, toLang) {
    const keep = lang;
    if (toLang) lang = toLang;
    try {
      if (lang === 'en' || text == null) return text;
      const s = String(text);
      if (ARABIC.test(s)) return s; // already Urdu (e.g. copied from a translated label)
      if (!/[A-Za-z]/.test(s)) return isolate(s.trim()) === s.trim() ? s : s.replace(s.trim(), isolate(s.trim()));
      const lead = s.match(/^\s*/)[0],
        tail = s.match(/\s*$/)[0],
        out = phrase(s);
      return out == null ? lead + isolate(s.trim()) + tail : lead + out + tail;
    } finally {
      lang = keep;
    }
  }

  /* ---------- the page ---------- */
  const textState = new WeakMap(),
    attrState = new WeakMap();
  const skipped = (el) => !el || el.closest(SKIP);

  // What the app wrote: our own output stays mapped to its English; anything else is new English.
  function englishOf(current, rec) {
    if (rec && current === rec.out) return rec.en;
    const k = norm(current);
    if (!k || dict.ur.has(k)) return current;
    const back = reverse.get(k);
    return back ? current.replace(current.trim(), back) : current;
  }

  // Some app code re-writes a label when it differs from what it expects. If it only dropped our
  // direction marks, accept its version; and never fight over one node more than a few times a second.
  const sameShown = (a, b) => a != null && b != null && norm(a) === norm(b) && a.replace(/[\u2066-\u2069]/g, '') === b.replace(/[\u2066-\u2069]/g, '');
  const busy = new WeakMap();
  function tooBusy(el) {
    if (!el) return false;
    const now = Date.now(),
      b = busy.get(el) || { since: now, writes: 0 };
    if (now - b.since > 1000) {
      b.since = now;
      b.writes = 0;
    }
    busy.set(el, b);
    return ++b.writes > 30;
  }

  function doText(node) {
    if (skipped(node.parentElement)) return;
    let rec = textState.get(node);
    if (rec && node.data !== rec.out && sameShown(node.data, rec.out)) {
      rec.out = node.data;
      return;
    }
    const en = englishOf(node.data, rec);
    if (!rec || rec.en !== en) textState.set(node, (rec = { en, out: null }));
    const out = lang === 'en' ? en : t(en);
    rec.out = out;
    if (node.data !== out) {
      if (tooBusy(node.parentElement)) return void (rec.out = node.data);
      node.data = out;
    }
  }

  function doAttrs(el) {
    if (!el || el.closest('[data-no-i18n]')) return;
    let recs = attrState.get(el);
    ATTRS.forEach((name) => {
      if (!el.hasAttribute(name)) return;
      if (!recs) attrState.set(el, (recs = {}));
      const current = el.getAttribute(name),
        prev = recs[name];
      if (prev && current !== prev.out && sameShown(current, prev.out)) {
        prev.out = current;
        return;
      }
      const en = englishOf(current, prev),
        out = lang === 'en' ? en : t(en),
        rec = (recs[name] = { en, out });
      if (current !== out) {
        if (tooBusy(el)) return void (rec.out = current);
        el.setAttribute(name, out);
      }
    });
  }

  function translateTree(root) {
    if (!root) return root;
    if (root.nodeType === 3) {
      doText(root);
      return root;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return root;
    if (root.nodeType === 1) doAttrs(root);
    const doc = root.ownerDocument || root,
      walker = doc.createTreeWalker(root, 5 /* elements + text */);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) doText(node);
      else doAttrs(node);
    }
    return root;
  }

  // The English text of an element, whatever language is showing (used for logic, never shown).
  function source(node) {
    if (!node) return '';
    if (node.nodeType === 3) return textState.get(node)?.out === node.data ? textState.get(node).en : node.data;
    if (node.nodeType !== 1) return node.textContent || '';
    let out = '';
    const walker = node.ownerDocument.createTreeWalker(node, 4);
    let n;
    while ((n = walker.nextNode())) out += source(n);
    return out;
  }
  function sourceAttr(el, name) {
    const rec = attrState.get(el)?.[name],
      cur = el.getAttribute(name);
    return rec && rec.out === cur ? rec.en : cur;
  }

  /* ---------- PDFs ----------
     The PDF maker draws text word by word and gets mixed Urdu/English lines wrong. For Urdu, a copy of
     the document is made in which every English or number run sits in its own left-to-right span. */
  const RUNS = /([A-Za-z0-9][A-Za-z0-9.,:;'’()\-\/+%&@#×·\s]*[A-Za-z0-9.)%]|[A-Za-z0-9])/g;
  function splitMixed(root) {
    const doc = root.ownerDocument,
      walker = doc.createTreeWalker(root, 4),
      nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      const text = n.data.replace(/[\u2066-\u2069]/g, '');
      if (text !== n.data) n.data = text;
      if (ARABIC.test(text) && /[A-Za-z0-9]/.test(text)) nodes.push(n);
    }
    nodes.forEach((node) => {
      const frag = doc.createDocumentFragment();
      let last = 0;
      node.data.replace(RUNS, (run, _g, at) => {
        if (at > last) frag.append(node.data.slice(last, at));
        const span = doc.createElement('span');
        span.dir = 'ltr';
        span.style.unicodeBidi = 'isolate';
        span.textContent = run;
        frag.append(span);
        last = at + run.length;
        return run;
      });
      if (last < node.data.length) frag.append(node.data.slice(last));
      node.replaceWith(frag);
    });
    return root;
  }
  // Returns the node to hand to the PDF maker: the node itself, or (Urdu) a prepared copy.
  function pdfSource(node) {
    if (!node || lang !== 'ur') return node;
    translateTree(node);
    return splitMixed(node.cloneNode(true));
  }

  let observer = null;
  function watch() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((records) => {
      if (lang === 'en') return;
      records.forEach((r) => {
        if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') doAttrs(r.target);
        else r.addedNodes.forEach((n) => translateTree(n));
      });
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }

  function applyDocument() {
    const info = LANGS[lang],
      root = document.documentElement;
    root.lang = info.html;
    root.dir = info.dir;
    root.dataset.lang = lang;
    document.title = lang === 'en' ? 'Mughal Interior Accounts' : t('Mughal Interior Accounts');
  }

  const listeners = new Set();
  function setLang(next) {
    if (!LANGS[next] || next === lang) return lang;
    lang = next;
    try {
      localStorage.setItem(KEY, next);
    } catch (_) {}
    applyDocument();
    translateTree(document.body);
    updateSwitches();
    listeners.forEach((fn) => {
      try {
        fn(lang);
      } catch (_) {}
    });
    return lang;
  }

  /* ---------- the switch (top bar and sign-in card) ---------- */
  let menu = null;
  function updateSwitches() {
    document.querySelectorAll('.lang-switch').forEach((b) => {
      b.querySelector('b').textContent = LANGS[lang].short;
      b.setAttribute('aria-label', `Language: ${LANGS[lang].label}`);
    });
    menu?.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === lang)));
  }
  function makeSwitch(extraClass) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `lang-switch ${extraClass || ''}`.trim();
    b.setAttribute('data-no-i18n', '');
    b.setAttribute('aria-haspopup', 'menu');
    b.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><b></b>';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu(b);
    });
    return b;
  }
  function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function outside(e) {
    if (menu && !menu.contains(e.target) && !e.target.closest('.lang-switch')) closeMenu();
  }
  function onKey(e) {
    if (e.key === 'Escape') closeMenu();
  }
  function openMenu(anchor) {
    if (menu) return closeMenu();
    menu = document.createElement('div');
    menu.className = 'lang-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('data-no-i18n', '');
    menu.innerHTML = Object.entries(LANGS)
      .map(
        ([code, info]) =>
          `<button type="button" role="menuitemradio" data-lang="${code}" lang="${info.html}" dir="${info.dir}" aria-checked="${code === lang}"><span>${info.label}</span><i aria-hidden="true">✓</i></button>`,
      )
      .join('');
    menu.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-lang]');
      if (!pick) return;
      setLang(pick.dataset.lang);
      closeMenu();
    });
    document.body.append(menu);
    const r = anchor.getBoundingClientRect(),
      w = menu.offsetWidth || 180;
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
    const left = Math.min(Math.max(8, r.right - w), (window.innerWidth || 360) - w - 8);
    menu.style.left = `${Math.round(left)}px`;
    setTimeout(() => {
      document.addEventListener('click', outside, true);
      document.addEventListener('keydown', onKey, true);
    });
    menu.querySelector('[aria-checked="true"]')?.focus?.();
  }
  function mountSwitches() {
    const top = document.querySelector('.topbar');
    if (top && !top.querySelector('.lang-switch')) {
      const logout = top.querySelector('#logoutBtn');
      top.insertBefore(makeSwitch('on-topbar'), logout || null);
      top.classList.add('has-lang');
    }
    const card = document.querySelector('#loginForm');
    if (card && !card.querySelector('.lang-switch')) card.prepend(makeSwitch('on-login'));
    updateSwitches();
  }

  /* ---------- browser pop-ups follow the language too ---------- */
  ['confirm', 'alert', 'prompt'].forEach((name) => {
    const native = window[name];
    if (typeof native !== 'function') return;
    window[name] = function (message, ...rest) {
      return native.call(window, lang === 'en' ? message : t(message), ...rest);
    };
  });

  function start() {
    mountSwitches();
    applyDocument();
    if (lang !== 'en') translateTree(document.body);
    watch();
  }

  window.MughalI18n = {
    t,
    lang: () => lang,
    setLang,
    source,
    sourceAttr,
    translateTree,
    pdfSource,
    onChange: (fn) => listeners.add(fn),
    languages: LANGS,
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
