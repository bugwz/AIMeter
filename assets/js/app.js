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
function doCopy(id, btn) {
  navigator.clipboard.writeText(document.getElementById(id).innerText).then(() => {
    btn.textContent = 'copied!';
    setTimeout(() => btn.textContent = 'copy', 1500);
  });
}
