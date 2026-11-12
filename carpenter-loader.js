// Carpenter loading screen: a carpenter hammers nails while the accounts load.
//
// Shown when the app opens with a saved sign-in, and after signing in. It stays for at
// least one full swing-and-hit cycle (about 2.5 seconds) and goes as soon as the app is
// ready after that. The hammer sound plays when the phone allows it (always after you
// tap Sign in; on a cold start, after one tap on the screen). It never touches app data.
(function () {
  'use strict';

  const SPRITE = 'assets/carpenter/loader-sprite.webp',
    SOUND = 'assets/carpenter/loader-sound.m4a',
    FRAMES = 36, // 6 × 6 sheet, 12 frames a second = 3 seconds
    COLS = 6,
    ROWS = 6,
    FPS = 12,
    MIN_MS = 2500,
    MUTE_KEY = 'mi_loader_muted';

  const app = document.getElementById('app'),
    loginScreen = document.getElementById('loginScreen'),
    loginForm = document.getElementById('loginForm'),
    loginError = document.getElementById('loginError');
  if (!app) return;

  let el = null,
    shownAt = 0,
    raf = 0,
    t0 = 0,
    audio = null,
    buffer = null,
    source = null,
    hideTimer = 0;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const muted = () => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch (e) {
      return false;
    }
  };

  function build() {
    el = document.createElement('div');
    el.className = 'carpenter-loader';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="cl-figure" role="img" aria-label="A carpenter hammering nails into a workbench"></div>' +
      '<p class="cl-name">Mughal Interior and Decor</p>' +
      '<p class="cl-line">Getting your accounts ready…</p>' +
      '<span class="cl-bar" aria-hidden="true"><span></span></span>' +
      '<button class="cl-sound" type="button"></button>';
    const name = document.querySelector('.topbar > div span')?.textContent?.trim();
    if (name) el.querySelector('.cl-name').textContent = name;
    el.addEventListener('click', (event) => {
      if (event.target.closest('.cl-sound')) {
        try {
          localStorage.setItem(MUTE_KEY, muted() ? '0' : '1');
        } catch (e) {
          /* ignore */
        }
        if (muted()) stopSound();
        else unlockAndPlay();
        soundLabel();
        return;
      }
      unlockAndPlay();
    });
    document.body.append(el);
    soundLabel();
  }
  function soundLabel() {
    const button = el.querySelector('.cl-sound');
    const on = !muted();
    button.textContent = on ? (audio && audio.state === 'running' ? 'Sound on' : 'Tap for sound') : 'Sound off';
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // ---------- sound: the video's own hammer hits, started in step with the picture ----------
  function ensureAudio() {
    if (audio || muted()) return audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
    fetch(SOUND)
      .then((r) => r.arrayBuffer())
      .then((b) => audio.decodeAudioData(b))
      .then((decoded) => {
        buffer = decoded;
        playFromNow();
      })
      .catch(() => {});
    return audio;
  }
  function playFromNow() {
    if (!el || !audio || !buffer || muted() || audio.state !== 'running') return;
    const offset = ((performance.now() - t0) / 1000) % (FRAMES / FPS);
    stopSound();
    if (offset > buffer.duration - 0.05) return;
    source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(0, offset);
  }
  function stopSound() {
    if (source) {
      try {
        source.stop();
      } catch (e) {
        /* already stopped */
      }
      source = null;
    }
  }
  function unlockAndPlay() {
    if (muted()) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    resume.then(() => {
      playFromNow();
      if (el) soundLabel();
    }).catch(() => {});
  }

  // ---------- animation ----------
  let lastFrame = -1,
    lastLoop = 0;
  function tick(now) {
    if (!el) return;
    const elapsed = now - t0,
      frame = reduceMotion ? 3 : Math.floor((elapsed / 1000) * FPS) % FRAMES,
      loop = Math.floor(elapsed / ((FRAMES / FPS) * 1000));
    if (frame !== lastFrame) {
      const col = frame % COLS,
        row = Math.floor(frame / COLS);
      el.querySelector('.cl-figure').style.backgroundPosition = `${(col / (COLS - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`;
      lastFrame = frame;
    }
    if (loop !== lastLoop) {
      lastLoop = loop;
      playFromNow(); // keep the sound on the beat every time the clip repeats
    }
    el.querySelector('.cl-bar span').style.width = `${Math.min(100, (elapsed / MIN_MS) * 100)}%`;
    raf = requestAnimationFrame(tick);
  }

  function show() {
    if (el) return;
    build();
    shownAt = t0 = performance.now();
    lastFrame = -1;
    lastLoop = 0;
    raf = requestAnimationFrame(tick);
    if (!reduceMotion) unlockAndPlay();
  }
  function hide() {
    if (!el) return;
    clearTimeout(hideTimer);
    const wait = Math.max(0, MIN_MS - (performance.now() - shownAt));
    hideTimer = setTimeout(() => {
      cancelAnimationFrame(raf);
      stopSound();
      el.classList.add('cl-out');
      const node = el;
      el = null;
      setTimeout(() => node.remove(), 260);
    }, wait);
  }
  function hideNow() {
    if (!el) return;
    cancelAnimationFrame(raf);
    stopSound();
    el.remove();
    el = null;
  }

  // The app is ready when #app is shown; a failed sign-in shows the login screen or an error.
  new MutationObserver(() => {
    if (!el) return;
    if (!app.classList.contains('hidden')) hide();
    else if (loginScreen && !loginScreen.classList.contains('hidden') && !loginForm?.dataset.signingIn) hideNow();
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  if (loginError)
    new MutationObserver(() => {
      if (el && !loginError.classList.contains('hidden')) {
        delete loginForm.dataset.signingIn;
        hideNow();
      }
    }).observe(loginError, { attributes: true, attributeFilter: ['class'] });

  loginForm?.addEventListener(
    'submit',
    () => {
      loginForm.dataset.signingIn = '1';
      show();
      setTimeout(() => delete loginForm.dataset.signingIn, 60000);
    },
    true,
  );

  // Opening the app with a saved sign-in: the data is loading right now.
  let saved = false;
  try {
    saved = !!localStorage.getItem('mi_mobile_session');
  } catch (e) {
    saved = false;
  }
  if (saved && app.classList.contains('hidden')) show();

  window.MughalLoader = { show, hide, hideNow };
})();
