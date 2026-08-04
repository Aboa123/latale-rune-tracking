const scoreValue = document.getElementById('score-value');
const scoreProgress = document.getElementById('score-progress');
const scoreFill = document.getElementById('score-fill');
const tierBadge = document.getElementById('tier-badge');
const tierText = document.getElementById('tier-text');
const statusEl = document.getElementById('status');
const runesEl = document.getElementById('runes');
const effectsBox = document.getElementById('effects-box');
const runeCircle = document.getElementById('rune-circle');
const runeGrid = document.getElementById('rune-grid');
const ocrTextEl = document.getElementById('ocr-text');
const btnAnalyze = document.getElementById('btn-analyze');
const btnToggle = document.getElementById('btn-toggle-capture');
const btnAuto = document.getElementById('btn-auto');

const MAX_SCORE = 500;
const AUTO_INTERVAL_MS = 1000;

let autoMode = false;
let autoTimer = null;
let autoRunning = false;

const STATUS_MAP = {
  capturing: '룬워드 캡쳐 중…',
  ocr: '효과 OCR 중…',
  matching: '룬 매칭 중…',
  error: '오류',
};

function setBusy(busy) {
  if (autoMode) {
    btnAnalyze.disabled = false;
    btnAnalyze.textContent = '분석';
    return;
  }
  btnAnalyze.disabled = busy;
  btnAnalyze.textContent = busy ? '…' : '분석';
}

function setAutoMode(on) {
  autoMode = !!on;
  btnAuto.classList.toggle('is-on', autoMode);
  btnAuto.textContent = autoMode ? '자동 ON' : '자동 OFF';
  btnAuto.title = autoMode ? '자동분석 중지' : '1초 자동분석 시작';

  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }

  if (autoMode) {
    statusEl.textContent = '자동분석 ON (1초)';
    tickAuto();
    autoTimer = setInterval(tickAuto, AUTO_INTERVAL_MS);
  } else {
    statusEl.textContent = '자동분석 OFF';
  }
}

async function tickAuto() {
  if (!autoMode || autoRunning) return;
  autoRunning = true;
  try {
    const res = await window.api.analyze({ auto: true, quiet: true });
    if (!res.ok && res.error && !res.busy) {
      statusEl.textContent = `자동분석: ${res.error}`;
    }
  } catch (err) {
    statusEl.textContent = `자동분석 오류: ${err.message || err}`;
  } finally {
    autoRunning = false;
  }
}

function setScore(total) {
  const n = Number(total) || 0;
  scoreValue.textContent = String(total ?? '—');
  scoreProgress.textContent = `${n}/${MAX_SCORE}`;
  scoreFill.style.width = `${Math.max(0, Math.min(100, (n / MAX_SCORE) * 100))}%`;
}

function placeRunesOnCircle(rows) {
  if (!rows.length) {
    runeCircle.innerHTML = '<div class="rw-circle-empty">분석을 실행하세요</div>';
    return;
  }

  const king = rows.find((r) => r.isKing);
  const others = rows.filter((r) => !r.isKing);
  const slots = [];
  const count = Math.min(others.length, 7);

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const radius = 42;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    const r = others[i];
    slots.push(
      `<div class="rw-slot" style="left:${x}%;top:${y}%;" title="${r.cleanName}">
         <img src="${r.on}" alt="${r.cleanName}" />
       </div>`
    );
  }

  if (king) {
    slots.push(
      `<div class="rw-slot is-king" style="left:50%;top:50%;" title="왕룬 ${king.cleanName}">
         <img src="${king.on}" alt="${king.cleanName}" />
       </div>`
    );
  }

  runeCircle.innerHTML = slots.join('');
}

function renderEffects(rows) {
  if (!rows.length) {
    effectsBox.innerHTML = '<div class="rw-effects-empty">아직 분석된 효과가 없습니다.</div>';
    return;
  }

  const ordered = [...rows].sort((a, b) => Number(a.isKing) - Number(b.isKing));
  const lines = [];
  for (const r of ordered) {
    const parts = String(r.displayDesc || r.desc || '')
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      lines.push(`<div class="rw-effect-line${r.isKing ? ' is-king' : ''}">${p}</div>`);
    }
  }
  effectsBox.innerHTML = lines.join('') || '<div class="rw-effects-empty">효과 없음</div>';
}

function renderRuneGrid(allRunes) {
  if (!allRunes?.length) {
    runeGrid.innerHTML = '<div class="rw-effects-empty" style="grid-column:1/-1">분석 후 표시</div>';
    return;
  }

  runeGrid.innerHTML = allRunes
    .map((r) => {
      const cls = ['rw-grid-cell', r.active ? 'is-active' : '', r.isKing ? 'is-king' : '']
        .filter(Boolean)
        .join(' ');
      const src = r.active || r.isKing ? r.on : r.off;
      return `<div class="${cls}" title="${r.cleanName} (${r.score}점)\n${r.desc}">
        <img src="${src}" alt="" draggable="false" />
        <span class="rw-cell-score">${r.score}</span>
      </div>`;
    })
    .join('');
}

btnAnalyze.addEventListener('click', async () => {
  setBusy(true);
  statusEl.textContent = '분석 시작…';
  try {
    const res = await window.api.analyze({});
    if (!res.ok && !res.busy) statusEl.textContent = res.error || '실패';
  } finally {
    setBusy(false);
  }
});

btnAuto.addEventListener('click', () => {
  setAutoMode(!autoMode);
});

btnToggle.addEventListener('click', async () => {
  const res = await window.api.toggleCapture();
  statusEl.textContent = res.visible ? '캡쳐 창 표시' : '캡쳐 창 숨김';
});

window.api.onStatus((data) => {
  if (data.status === 'error') {
    statusEl.textContent = `오류: ${data.error || ''}`;
    setBusy(false);
    return;
  }
  if (data.ocrText) ocrTextEl.textContent = data.ocrText;
  const label = STATUS_MAP[data.status] || data.status;
  statusEl.textContent = data.auto ? `자동 · ${label}` : label;
  if (!data.auto && (data.status === 'ocr' || data.status === 'capturing' || data.status === 'matching')) {
    setBusy(true);
  }
});

window.api.onPreview((data) => {
  if (data.preview) {
    document.getElementById('preview-full').src = `data:image/png;base64,${data.preview}`;
  }
  if (data.effects) {
    document.getElementById('preview-effects').src = `data:image/png;base64,${data.effects}`;
  }
});

window.api.onResult((result) => {
  setBusy(false);
  const kingCount = (result.rows || []).filter((r) => r.isKing).length;
  const normalCount = (result.rows || []).filter((r) => !r.isKing).length;
  const slotHint = `왕룬 ${kingCount}/1 · 일반 ${normalCount}/7`;
  const base = result.warning
    ? result.warning.split('\n')[0]
    : `${slotHint} · ${result.total ?? 0}점`;
  statusEl.textContent = autoMode ? `자동 · ${base}` : base;
  ocrTextEl.textContent = result.ocrText || '';

  if (result.matchedCount) {
    setScore(result.total);
    tierBadge.textContent = result.judge.label;
    tierBadge.style.background = result.judge.color;
    tierBadge.style.color = '#0b1020';
    let text = result.judge.text;
    if (result.matchedCount < 8 || kingCount !== 1) {
      text += ` (인식 ${result.matchedCount}/8 · ${slotHint})`;
    }
    tierText.textContent = text;
  } else {
    setScore(0);
    scoreValue.textContent = '—';
    scoreProgress.textContent = `0/${MAX_SCORE}`;
    scoreFill.style.width = '0%';
    tierBadge.textContent = '인식 실패';
    tierBadge.style.background = '#64748b';
    tierBadge.style.color = '#fff';
    tierText.textContent =
      result.warning ||
      '캡쳐 창에 룬워드 UI 전체(원형 + 「습득한 룬 효과」)가 들어오게 맞춰주세요.';
  }

  placeRunesOnCircle(result.rows || []);
  renderEffects(result.rows || []);
  renderRuneGrid(result.allRunes || []);
});
