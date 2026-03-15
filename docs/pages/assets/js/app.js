const BASE = './assets/providers/';

// ── Mock quota panel ──────────────────────────────────────
const mockData = [
  { id: 'claude',     name: 'Claude Pro',      pct: 31,  reset: '9d left' },
  { id: 'copilot',   name: 'Copilot',          pct: 48,  reset: '11d left' },
  { id: 'openrouter',name: 'OpenRouter',       pct: 73,  reset: '5d left' },
  { id: 'cursor',    name: 'Cursor Business',  pct: 86,  reset: '2d left' },
  { id: 'kimi',      name: 'Kimi',             pct: 95,  reset: '1d left' },
];
const mb = document.getElementById('mock-body');
mockData.forEach(m => {
  const isDanger = m.pct >= 85;
  const isWarn   = !isDanger && m.pct >= 60;
  const fillCls  = isDanger ? 'fill-warn' : isWarn ? 'fill-ok' : 'fill-green';
  const txtCls   = isDanger ? ' danger'   : isWarn ? ' warn'   : '';
  const el = document.createElement('div');
  el.className = 'mock-row';
  el.innerHTML = `
    <span class="mock-name">
      <img src="${BASE}${m.id}.svg" alt="" onerror="this.style.display='none'">
      <span>${m.name}</span>
    </span>
    <div class="mock-track">
      <div class="mock-fill ${fillCls}" style="width:${m.pct}%"></div>
    </div>
    <span class="mock-pct${txtCls}">${m.pct}%</span>
    <span class="mock-reset${txtCls}">${m.reset}</span>
  `;
  mb.appendChild(el);
});

// ── Provider chips ────────────────────────────────────────
const providers = [
  { id: 'claude',      name: 'Claude' },
  { id: 'copilot',     name: 'Copilot' },
  { id: 'cursor',      name: 'Cursor' },
  { id: 'openrouter',  name: 'OpenRouter' },
  { id: 'kimi',        name: 'Kimi' },
  { id: 'minimax',     name: 'MiniMax' },
  { id: 'zai',         name: 'z.ai' },
  { id: 'aliyun',      name: 'Aliyun' },
  { id: 'ollama',      name: 'Ollama' },
  { id: 'opencode',    name: 'OpenCode' },
  { id: 'codex',       name: 'Codex' },
  { id: 'antigravity', name: 'Antigravity' },
];
const pc = document.getElementById('prov-chips');
providers.forEach(p => {
  const c = document.createElement('div');
  c.className = 'pchip';
  c.innerHTML = `<img src="${BASE}${p.id}.svg" alt="" onerror="this.style.display='none'">${p.name}`;
  pc.appendChild(c);
});

// ── Screenshot tabs / mobile carousel ─────────────────────
const vtabsEl = document.getElementById('vtabs');
const spansEl = document.getElementById('spanels');
const dotWrap = document.getElementById('shots-dots');
const vtabs = Array.from(document.querySelectorAll('#vtabs .vtab'));
const spanels = Array.from(document.querySelectorAll('#spanels .spanel'));
const dots = Array.from(document.querySelectorAll('#shots-dots .sdot'));

function setShotActive(key) {
  vtabs.forEach(v => v.classList.toggle('on', v.dataset.s === key));
  spanels.forEach(p => p.classList.toggle('on', p.dataset.s === key));
  dots.forEach(d => d.classList.toggle('on', d.dataset.s === key));
}

function goShot(key, smooth = true) {
  setShotActive(key);
  if (window.matchMedia('(max-width: 600px)').matches) {
    const panel = spansEl.querySelector(`.spanel[data-s="${key}"]`);
    if (panel) {
      panel.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        inline: 'start',
        block: 'nearest',
      });
    }
  }
}

vtabsEl.addEventListener('click', e => {
  const t = e.target.closest('.vtab');
  if (!t) return;
  goShot(t.dataset.s);
});

if (dotWrap) {
  dotWrap.addEventListener('click', e => {
    const d = e.target.closest('.sdot');
    if (!d) return;
    goShot(d.dataset.s);
  });
}

let shotTicking = false;
spansEl.addEventListener('scroll', () => {
  if (!window.matchMedia('(max-width: 600px)').matches || shotTicking) return;
  shotTicking = true;
  requestAnimationFrame(() => {
    const base = spansEl.getBoundingClientRect().left;
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    spanels.forEach(p => {
      const d = Math.abs(p.getBoundingClientRect().left - base);
      if (d < bestDist) { best = p; bestDist = d; }
    });
    if (best) setShotActive(best.dataset.s);
    shotTicking = false;
  });
}, { passive: true });
setShotActive('dashboard');

// ── Hero mobile preview toggle ────────────────────────────
const previewBtn = document.getElementById('hero-preview-toggle');
if (previewBtn) {
  previewBtn.addEventListener('click', () => {
    const on = document.body.classList.toggle('preview-on');
    previewBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    previewBtn.textContent = on ? 'hide dashboard preview' : 'show dashboard preview';
  });
}

// ── Lightbox ──────────────────────────────────────────────
function openLb(el) {
  const img = el.querySelector('img');
  document.getElementById('lb-img').src = img.src;
  document.getElementById('lb-img').alt = img.alt;
  document.getElementById('lb').classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeLb() {
  document.getElementById('lb').classList.remove('on');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLb(); });

// ── Code tabs ─────────────────────────────────────────────
const ctabsEl = document.getElementById('ctabs');
if (ctabsEl) {
  ctabsEl.addEventListener('click', e => {
    const btn = e.target.closest('.ctab');
    if (!btn) return;
    document.querySelectorAll('#ctabs .ctab').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('.cpanel').forEach(p => p.classList.remove('on'));
    btn.classList.add('on');
    const panel = document.getElementById('cp-' + btn.dataset.p);
    if (panel) panel.classList.add('on');
  });
}

// ── Copy ──────────────────────────────────────────────────
function _copyFeedback(btn, original) {
  btn.textContent = 'Copied!';
  setTimeout(() => { btn.textContent = original; }, 1500);
}
function _writeClipboard(text, btn, original) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => _copyFeedback(btn, original)).catch(() => _execCopy(text, btn, original));
  } else {
    _execCopy(text, btn, original);
  }
}
function _execCopy(text, btn, original) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
  _copyFeedback(btn, original);
}
function doCopy(id, btn) {
  _writeClipboard(document.getElementById(id).innerText, btn, 'Copy');
}

// ── Tools tabs ────────────────────────────────────────────
const toolsVtabsEl  = document.getElementById('tools-vtabs');
const toolsPanelsEl = document.getElementById('tools-panels');
if (toolsVtabsEl && toolsPanelsEl) {
  toolsVtabsEl.addEventListener('click', e => {
    const t = e.target.closest('.vtab');
    if (!t) return;
    const key = t.dataset.t;
    toolsVtabsEl.querySelectorAll('.vtab').forEach(v => v.classList.toggle('on', v.dataset.t === key));
    toolsPanelsEl.querySelectorAll('.tools-panel').forEach(p => p.classList.toggle('on', p.dataset.t === key));
  });
}

// ── Key Generator ─────────────────────────────────────────
function kgenRand(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}
function kgenOne(inputId, bytes) {
  const el = document.getElementById(inputId);
  if (el) el.value = kgenRand(bytes);
}
function kgenRoute() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint8Array(128);
  let result = '';
  while (result.length < 32) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length && result.length < 32; i++) {
      if (arr[i] < 248) result += chars[arr[i] % 62]; // unbiased rejection sampling
    }
  }
  const el = document.getElementById('kv-route');
  if (el) el.value = result;
}
function kgenAll() {
  kgenOne('kv-cron',     16);
  kgenOne('kv-endpoint', 16);
  kgenOne('kv-encrypt',  32);
  kgenOne('kv-session',  32);
  kgenRoute();
}
function kgenCopy(inputId, btn) {
  const val = document.getElementById(inputId)?.value;
  if (!val) return;
  _writeClipboard(val, btn, 'Copy');
}

// ── Password Hash Generator ────────────────────────────────
async function phHashPassword(password, encryptionKey) {
  const enc = new TextEncoder();
  const randomSaltSeed = crypto.getRandomValues(new Uint8Array(16));
  const keyBytes = enc.encode(encryptionKey);
  const mixed = new Uint8Array(randomSaltSeed.length + keyBytes.length);
  mixed.set(randomSaltSeed, 0);
  mixed.set(keyBytes, randomSaltSeed.length);
  const derived = await crypto.subtle.digest('SHA-256', mixed);
  const saltRaw = new Uint8Array(derived).slice(0, 16);
  // Encode salt as base64url string — Node passes this string's UTF-8 bytes to PBKDF2
  const salt = btoa(String.fromCharCode(...saltRaw))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  const digest = btoa(String.fromCharCode(...new Uint8Array(bits)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `pbkdf2_sha256$100000$${salt}$${digest}`;
}
function phValidate(role) {
  const pwEl  = document.getElementById(`ph-${role}-pw`);
  const reqs  = document.querySelectorAll(`#ph-${role}-reqs .phash-req`);
  const errorEl = document.getElementById(`ph-${role}-error`);
  const pw = pwEl?.value ?? '';
  pwEl?.classList.remove('phash-pw-error');
  if (errorEl) errorEl.textContent = '';
  const rules = [
    { r: 'len',    ok: pw.length >= 12 },
    { r: 'letter', ok: /[a-zA-Z]/.test(pw) },
    { r: 'digit',  ok: /[0-9]/.test(pw) },
  ];
  reqs.forEach(el => {
    const rule = rules.find(r => r.r === el.dataset.r);
    if (!rule) return;
    el.classList.toggle('ok',   rule.ok);
    el.classList.toggle('fail', pw.length > 0 && !rule.ok);
  });
}
function phSetHashActions(role, enabled) {
  const copyBtn = document.getElementById(`ph-${role}-cpbtn`);
  if (copyBtn) copyBtn.disabled = !enabled;
}
async function phGenerate(role) {
  const pwEl    = document.getElementById(`ph-${role}-pw`);
  const hashEl  = document.getElementById(`ph-${role}-hash`);
  const errorEl = document.getElementById(`ph-${role}-error`);
  const genBtn  = document.getElementById(`ph-${role}-gen`);
  const encryptKey = document.getElementById('kv-encrypt')?.value?.trim() ?? '';
  const pw = pwEl?.value ?? '';

  // Clear previous error state
  if (errorEl) errorEl.textContent = '';
  pwEl?.classList.remove('phash-pw-error');

  if (!encryptKey) {
    if (errorEl) errorEl.textContent = 'AIMETER_ENCRYPTION_KEY is required';
    phSetHashActions(role, false);
    return;
  }

  // Validate
  if (!pw) {
    if (errorEl) errorEl.textContent = 'Password is required';
    pwEl?.classList.add('phash-pw-error');
    return;
  }
  if (pw.length < 12) {
    if (errorEl) errorEl.textContent = 'Password must be at least 12 characters';
    pwEl?.classList.add('phash-pw-error');
    return;
  }
  if (!/[a-zA-Z]/.test(pw)) {
    if (errorEl) errorEl.textContent = 'Password must contain at least one letter';
    pwEl?.classList.add('phash-pw-error');
    return;
  }
  if (!/[0-9]/.test(pw)) {
    if (errorEl) errorEl.textContent = 'Password must contain at least one digit';
    pwEl?.classList.add('phash-pw-error');
    return;
  }

  if (genBtn) { genBtn.textContent = 'Generating…'; genBtn.disabled = true; }
  try {
    const hash = await phHashPassword(pw, encryptKey);
    if (hashEl)  hashEl.value  = hash;
    phSetHashActions(role, true);
  } finally {
    if (genBtn) { genBtn.textContent = 'Generate'; genBtn.disabled = false; }
  }
}
function phCopy(inputId, btn) {
  const val = document.getElementById(inputId)?.value;
  if (!val) return;
  _writeClipboard(val, btn, 'Copy');
}
