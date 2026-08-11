'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const RUNE_DATA = require('./rune-data.json');

const MAP_SIZE = 40;
const RUNES_DIR = path.join(__dirname, '..', 'assets', 'runes');

let templateCache = null;

function cleanName(name) {
  return String(name).replace(/[《》]/g, '').trim();
}

function scoreRune(rune, isKing) {
  if (!isKing) return rune.score;
  if (typeof rune.kingScore === 'number') return rune.kingScore;
  return rune.score * 2;
}

function judge(total) {
  if (total < 300) return { grade: 'd', label: 'D 티어', text: '점수 개선을 권장합니다.', color: '#ef4444' };
  if (total < 350) return { grade: 'c', label: 'C 티어', text: '임시로 사용할 수 있는 룬워드입니다.', color: '#f59e0b' };
  if (total < 400) return { grade: 'b', label: 'B 티어', text: '준수한 룬워드입니다.', color: '#3b82f6' };
  if (total < 450) return { grade: 'a', label: 'A 티어', text: '최종용으로 볼 만한 룬워드입니다.', color: '#8b5cf6' };
  return { grade: 's', label: 'S 티어', text: '최상급 룬워드입니다.', color: '#ec4899' };
}

function doubleDesc(desc) {
  return String(desc).replace(/([+-]?\d+(?:\.\d+)?)/g, (m) => String(Number((Number(m) * 2).toFixed(10))));
}

function largestCenterComponent(bin, size) {
  const seen = new Uint8Array(size * size);
  const comps = [];
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  for (let i = 0; i < size * size; i++) {
    if (!bin[i] || seen[i]) continue;
    const q = [i];
    const comp = [];
    seen[i] = 1;
    while (q.length) {
      const p = q.pop();
      comp.push(p);
      const x = p % size;
      const y = (p / size) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const j = yy * size + xx;
        if (bin[j] && !seen[j]) {
          seen[j] = 1;
          q.push(j);
        }
      }
    }
    let sx = 0;
    let sy = 0;
    for (const p of comp) {
      sx += p % size;
      sy += (p / size) | 0;
    }
    const mx = sx / comp.length;
    const my = sy / comp.length;
    const dist = Math.hypot(mx - cx, my - cy);
    comps.push({ comp, dist, n: comp.length, mx, my });
  }
  if (!comps.length) return null;
  comps.sort((a, b) => b.n / (1 + b.dist * 0.55) - a.n / (1 + a.dist * 0.55));
  return comps[0];
}

/**
 * Extract glyph-only map: ignore brown stone & cyan aura & bright rim highlight.
 * Keep centered yellow stroke as the match feature.
 */
async function extractOrangeMap(imgBuffer, size = MAP_SIZE, options = {}) {
  const coreRadius = options.coreRadius || 0.34;
  const { data } = await sharp(imgBuffer)
    .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let map = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const o = i * 3;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    // Exclude near-white stone bevel highlights
    if (r > 248 && g > 235) continue;
    // Hot yellow/orange glyph stroke (not stone body)
    const glyph =
      r > 175 &&
      g > 125 &&
      b < 150 &&
      r - b > 55 &&
      g - b > 22 &&
      r >= g * 0.82 &&
      r + g > b * 2.3;
    if (glyph) {
      map[i] = (r - b) * 0.65 + (g - b) * 0.3;
    }
  }

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = size * coreRadius;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > maxR * maxR) map[y * size + x] = 0;
    }
  }

  const vals = [];
  for (let i = 0; i < map.length; i++) if (map[i] > 0) vals.push(map[i]);
  vals.sort((a, b) => a - b);
  const thr = vals.length ? vals[Math.floor(vals.length * 0.42)] : 1;
  const bin = new Uint8Array(size * size);
  for (let i = 0; i < map.length; i++) bin[i] = map[i] >= thr ? 1 : 0;

  const best = largestCenterComponent(bin, size);
  map = new Float32Array(size * size);
  if (best && best.n >= 6) {
    for (const p of best.comp) map[p] = 1;
    // Recenter glyph to map center
    const sx = Math.round(cx - best.mx);
    const sy = Math.round(cy - best.my);
    if (sx !== 0 || sy !== 0) {
      const shifted = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const ox = x - sx;
          const oy = y - sy;
          if (ox < 0 || oy < 0 || ox >= size || oy >= size) continue;
          shifted[y * size + x] = map[oy * size + ox];
        }
      }
      map = shifted;
    }
  }

  // Soft dilate once to tolerate 1px jitter
  if (options.dilate !== 0) {
    const rounds = options.dilate == null ? 1 : options.dilate;
    for (let round = 0; round < rounds; round++) {
      const next = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let m = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
              m = Math.max(m, map[yy * size + xx]);
            }
          }
          next[y * size + x] = m;
        }
      }
      map = next;
    }
  }

  let sumSq = 0;
  for (let i = 0; i < map.length; i++) sumSq += map[i] * map[i];
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < map.length; i++) map[i] /= norm;
  return map;
}

function ncc(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function radialSignature(map, size = MAP_SIZE, bins = 36) {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const sig = new Float32Array(bins);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = map[y * size + x];
      if (v <= 0) continue;
      const ang = Math.atan2(y - cy, x - cx);
      let bin = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * bins);
      if (bin < 0) bin = 0;
      if (bin >= bins) bin = bins - 1;
      sig[bin] += v;
    }
  }
  let sumSq = 0;
  for (let i = 0; i < bins; i++) sumSq += sig[i] * sig[i];
  const n = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < bins; i++) sig[i] /= n;
  return sig;
}

function bestCircularCorr(a, b) {
  let best = -1;
  const n = a.length;
  for (let shift = 0; shift < n; shift++) {
    let dot = 0;
    for (let i = 0; i < n; i++) dot += a[i] * b[(i + shift) % n];
    if (dot > best) best = dot;
  }
  return best;
}

function similarity(mapA, mapB, sigA, sigB) {
  const shape = ncc(mapA, mapB);
  const radial = bestCircularCorr(sigA, sigB);
  return shape * 0.78 + radial * 0.22;
}

async function loadTemplates() {
  if (templateCache) return templateCache;
  const templates = [];
  for (const rune of RUNE_DATA) {
    const src = path.join(RUNES_DIR, `ON_${rune.id}.jpg`);
    if (!fs.existsSync(src)) continue;
    const buf = fs.readFileSync(src);
    const meta = await sharp(buf).metadata();
    const w = meta.width || 64;
    const h = meta.height || 64;
    const inset = Math.round(Math.min(w, h) * 0.28);
    const cropped = await sharp(buf)
      .extract({
        left: inset,
        top: inset,
        width: Math.max(8, w - inset * 2),
        height: Math.max(8, h - inset * 2),
      })
      .png()
      .toBuffer();
    const map = await extractOrangeMap(cropped, MAP_SIZE, { dilate: 1, coreRadius: 0.36 });
    const sig = radialSignature(map);
    templates.push({ rune, map, sig });
  }
  templateCache = templates;
  return templates;
}

/** Clear template cache (tests / reload). */
function clearTemplateCache() {
  templateCache = null;
}

/** Center = 왕룬, 바깥 7 = 일반 */
function buildSlots(width, height, angleOffsetDeg = 0, radiusScale = 0.34, center = null) {
  const cx = center?.x ?? width / 2;
  // Content center sits slightly below geometric mid when chrome was partial
  const cy = center?.y ?? height * 0.52;
  const m = Math.min(width, height);
  const radius = m * radiusScale;
  const crop = Math.max(28, Math.round(m * 0.16));
  const kingCrop = Math.max(34, Math.round(m * 0.2));
  const slots = [{ id: 'king', isKing: true, x: cx, y: cy, crop: kingCrop }];
  const offset = (angleOffsetDeg * Math.PI) / 180;
  for (let i = 0; i < 7; i++) {
    const ang = -Math.PI / 2 + offset + (i * Math.PI * 2) / 7;
    slots.push({
      id: `o${i}`,
      isKing: false,
      x: cx + Math.cos(ang) * radius,
      y: cy + Math.sin(ang) * radius,
      crop,
    });
  }
  return slots;
}

/** Detect 1 center + 7 outer slot centers from yellow/orange glyph heat. */
async function detectSlotsFromGlow(imgBuffer) {
  // Caller should pass title-trimmed circle (see analyzeCircleImage / trimCircleChrome)
  const { data, info } = await sharp(imgBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const heat = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 3;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (r > 248 && g > 235) continue;
    if (r > 175 && g > 125 && b < 150 && r - b > 55 && g - b > 22 && r >= g * 0.82) {
      heat[i] = (r - b) * 0.65 + (g - b) * 0.3;
    }
  }
  const blur = new Float32Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let s = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) s += heat[(y + dy) * w + (x + dx)];
      }
      blur[y * w + x] = s;
    }
  }
  const peaks = [];
  for (let y = 8; y < h - 8; y++) {
    for (let x = 8; x < w - 8; x++) {
      const v = blur[y * w + x];
      if (v < 50) continue;
      let ok = true;
      for (let dy = -5; dy <= 5 && ok; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          if (blur[(y + dy) * w + (x + dx)] > v) ok = false;
        }
      }
      if (ok) peaks.push({ x, y, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);

  // NMS / cluster into stones
  const stones = [];
  const mergeR = Math.max(18, Math.round(Math.min(w, h) * 0.055));
  for (const p of peaks) {
    const hit = stones.find((s) => (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < mergeR * mergeR);
    if (hit) {
      const wSum = hit.v + p.v;
      hit.x = (hit.x * hit.v + p.x * p.v) / wSum;
      hit.y = (hit.y * hit.v + p.y * p.v) / wSum;
      hit.v = wSum;
    } else {
      stones.push({ x: p.x, y: p.y, v: p.v });
    }
  }

  if (stones.length < 5) return null;

  // Center = nearest to content center (king), not strongest flame blob
  const imgCx = w / 2;
  const imgCy = h * 0.52;
  const kingCand = [...stones]
    .map((s) => ({ ...s, r: Math.hypot(s.x - imgCx, s.y - imgCy) }))
    .filter((s) => s.r < Math.min(w, h) * 0.22)
    .sort((a, b) => a.r - b.r || b.v - a.v);
  const king = kingCand[0] || [...stones].sort((a, b) => Math.hypot(a.x - imgCx, a.y - imgCy) - Math.hypot(b.x - imgCx, b.y - imgCy))[0];
  if (!king) return null;

  const cx = king.x;
  const cy = king.y;
  const withR = stones
    .filter((s) => Math.hypot(s.x - cx, s.y - cy) > 8)
    .map((s) => ({ ...s, r: Math.hypot(s.x - cx, s.y - cy), ang: Math.atan2(s.y - cy, s.x - cx) }))
    .filter((s) => s.r > Math.min(w, h) * 0.16 && s.r < Math.min(w, h) * 0.58);

  if (withR.length < 5) return null;

  // Prefer strongest in ring, NMS by angle (~360/7)
  const picked = [];
  for (const s of [...withR].sort((a, b) => b.v - a.v)) {
    if (
      picked.some((p) => {
        let d = Math.abs(p.ang - s.ang);
        if (d > Math.PI) d = Math.PI * 2 - d;
        return d < ((Math.PI * 2) / 7) * 0.45;
      })
    ) {
      continue;
    }
    picked.push(s);
    if (picked.length === 7) break;
  }
  if (picked.length < 6) return null;
  picked.sort((a, b) => a.ang - b.ang);
  // rotate so first is closest to 12 o'clock
  let bestI = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < picked.length; i++) {
    let d = Math.abs(picked[i].ang + Math.PI / 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < bestAbs) {
      bestAbs = d;
      bestI = i;
    }
  }
  const ordered = [...picked.slice(bestI), ...picked.slice(0, bestI)];

  const m = Math.min(w, h);
  const crop = Math.max(28, Math.round(m * 0.16));
  const kingCrop = Math.max(34, Math.round(m * 0.2));
  // 왕룬: title-trimmed content center (or nearest stone) + optional heat peak
  const slots = [{ id: 'king', isKing: true, x: imgCx, y: imgCy, crop: kingCrop }];
  ordered.forEach((s, i) => {
    slots.push({ id: `o${i}`, isKing: false, x: s.x, y: s.y, crop });
  });
  const medianR =
    ordered.map((s) => s.r).sort((a, b) => a - b)[Math.floor(ordered.length / 2)] || m * 0.34;
  return { slots, center: { x: imgCx, y: imgCy }, radiusScale: medianR / m, detected: true };
}

async function cropSlot(imgBuffer, slot, imgW, imgH) {
  const half = Math.round(slot.crop / 2);
  let left = Math.round(slot.x - half);
  let top = Math.round(slot.y - half);
  let width = slot.crop;
  let height = slot.crop;
  left = Math.max(0, Math.min(left, imgW - 2));
  top = Math.max(0, Math.min(top, imgH - 2));
  width = Math.min(width, imgW - left);
  height = Math.min(height, imgH - top);
  return sharp(imgBuffer).extract({ left, top, width, height }).png().toBuffer();
}

/**
 * Drop title chrome ("신규 룬 워드 효과") so geometric center = 왕룬 stone.
 * Also return content-space center usable for king crop.
 */
async function trimCircleChrome(circlePng) {
  const meta = await sharp(circlePng).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  // Title bar is typically 9~14% of square crops that include the panel header
  const topTrim = Math.round(height * 0.12);
  if (topTrim < 8 || height - topTrim < 80) {
    return {
      png: circlePng,
      width,
      height,
      kingCx: width / 2,
      kingCy: height / 2,
      trimmed: false,
    };
  }
  const png = await sharp(circlePng)
    .extract({ left: 0, top: topTrim, width, height: height - topTrim })
    .png()
    .toBuffer();
  const h2 = height - topTrim;
  return {
    png,
    width,
    height: h2,
    // After trim, king sits near content center (blue fire drifts slightly up)
    kingCx: width / 2,
    kingCy: h2 * 0.5 + h2 * 0.02,
    trimmed: true,
    topTrim,
  };
}

/**
 * Locate king glyph center: orange heat nearest content-center after chrome trim.
 * Prefer stone core over outer ring cyan and rising flame (which pulls y up).
 */
async function findKingCenter(circlePng) {
  const trimmed = await trimCircleChrome(circlePng);
  const { data, info } = await sharp(trimmed.png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const heat = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 3;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    if (r > 248 && g > 235) continue;
    // Yellow glyph stroke only
    if (r > 175 && g > 125 && b < 150 && r - b > 55 && g - b > 22 && r >= g * 0.82) {
      heat[i] = (r - b) * 0.65 + (g - b) * 0.3;
    }
  }
  const blur = new Float32Array(w * h);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      let s = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) s += heat[(y + dy) * w + (x + dx)];
      }
      blur[y * w + x] = s;
    }
  }
  const cx0 = w / 2;
  const cy0 = h * 0.52;
  const maxR = Math.min(w, h) * 0.2;
  let best = null;
  for (let y = Math.floor(h * 0.28); y < h * 0.72; y++) {
    for (let x = Math.floor(w * 0.28); x < w * 0.72; x++) {
      const v = blur[y * w + x];
      if (v < 90) continue;
      const r = Math.hypot(x - cx0, y - cy0);
      if (r > maxR) continue;
      let ok = true;
      for (let dy = -4; dy <= 4 && ok; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (blur[(y + dy) * w + (x + dx)] > v) ok = false;
        }
      }
      if (!ok) continue;
      const score = v / (1 + r * 1.4);
      if (!best || score > best.score) best = { x, y, v, r, score };
    }
  }
  return {
    ...trimmed,
    kingCx: best ? best.x : trimmed.kingCx,
    kingCy: best ? best.y : trimmed.kingCy,
    peak: best,
  };
}

async function pickKingAmongCandidates(circlePng, candidateIds) {
  const ids = [...new Set((candidateIds || []).filter((id) => Number.isFinite(id)))];
  if (!ids.length || !circlePng) return null;
  const templates = await loadTemplates();
  const cands = templates.filter((t) => ids.includes(t.rune.id));
  if (!cands.length) return null;

  const region = await findKingCenter(circlePng);
  const img = region.png;
  const width = region.width;
  const height = region.height;
  const m = Math.min(width, height);
  const cx = region.kingCx;
  const cy = region.kingCy;

  const bestById = new Map(cands.map((t) => [t.rune.id, { id: t.rune.id, rune: t.rune, score: -1 }]));

  async function probe(cropScale, dy, dilate, coreRadius) {
    const crop = Math.max(32, Math.round(m * cropScale));
    const cropBuf = await cropSlot(
      img,
      { x: cx, y: cy + dy, crop },
      width,
      height
    );
    const map = await extractOrangeMap(cropBuf, MAP_SIZE, { dilate, coreRadius });
    let energy = 0;
    for (let i = 0; i < map.length; i++) energy += map[i] * map[i];
    if (energy < 0.05) return;
    const sig = radialSignature(map);
    for (const t of cands) {
      const score = similarity(map, t.map, sig, t.sig);
      const cur = bestById.get(t.rune.id);
      if (score > cur.score) cur.score = score;
    }
  }

  // Coarse pass around blue-core king (tiny dy only — flame already accounted for by peak)
  for (const scale of [0.17, 0.2, 0.24, 0.28]) {
    for (const dy of [0, m * 0.02, -m * 0.02, m * 0.04]) {
      await probe(scale, dy, 1, 0.34);
    }
  }

  let scored = [...bestById.values()].filter((s) => s.score >= 0).sort((a, b) => b.score - a.score);
  let top = scored[0];
  let second = scored[1];
  let marginPct = top && second ? (top.score - second.score) * 100 : top ? 100 : 0;

  // Refine if still ambiguous
  if (!top || top.score < 0.28 || marginPct < 5) {
    for (const scale of [0.19, 0.23, 0.27]) {
      for (const dy of [0, m * 0.03, -m * 0.015]) {
        for (const core of [0.3, 0.36, 0.42]) {
          await probe(scale, dy, 0, core);
          await probe(scale, dy, 1, core);
        }
      }
    }
    scored = [...bestById.values()].filter((s) => s.score >= 0).sort((a, b) => b.score - a.score);
    top = scored[0];
    second = scored[1];
    marginPct = top && second ? (top.score - second.score) * 100 : top ? 100 : 0;
  }

  if (!top || top.score < 0.18) return null;

  const margin = Math.round((top.score - (second ? second.score : 0)) * 100);
  const confidence = Math.round(top.score * 100);
  // Vision is noisy for fire-wreathed center: require clearer separation to "accept"
  const accepted = confidence >= 28 && margin >= 6;
  return {
    id: top.id,
    rune: top.rune,
    confidence,
    margin,
    accepted,
    center: { x: cx, y: cy, trimmed: region.trimmed },
    alternatives: scored.slice(0, 4).map((r) => ({
      id: r.id,
      name: cleanName(r.rune.name),
      score: Math.round(r.score * 100),
    })),
  };
}

async function analyzeCircleImage(pngBuffer) {
  const templates = await loadTemplates();
  // Work in title-trimmed space so center slot = 왕룬
  const region = await trimCircleChrome(pngBuffer);
  pngBuffer = region.png;
  const width = region.width;
  const height = region.height;

  const slotPlans = [];
  const detected = await detectSlotsFromGlow(pngBuffer).catch(() => null);
  if (detected?.slots?.length >= 7) {
    slotPlans.push({
      slots: detected.slots,
      offset: 0,
      radiusScale: detected.radiusScale,
      detected: true,
      center: detected.center,
    });
  }

  const angleOffsets = [-25.7, -12.8, 0, 12.8, 25.7];
  const radiusScales = [0.3, 0.33, 0.36, 0.39];
  const centers = detected?.center
    ? [detected.center, { x: width / 2, y: height * 0.52 }, null]
    : [{ x: width / 2, y: height * 0.52 }, null];
  for (const center of centers) {
    for (const radiusScale of radiusScales) {
      for (const offset of angleOffsets) {
        slotPlans.push({
          slots: buildSlots(width, height, offset, radiusScale, center),
          offset,
          radiusScale,
          detected: false,
          center,
        });
      }
    }
  }

  let bestPlan = null;

  for (const plan of slotPlans) {
      const slots = plan.slots;
      const observations = [];
      for (const slot of slots) {
        const cropBuf = await cropSlot(pngBuffer, slot, width, height);
        const map = await extractOrangeMap(cropBuf, MAP_SIZE, { dilate: 1, coreRadius: 0.34 });
        const sig = radialSignature(map);
        observations.push({ slot, map, sig });
      }

      const candidates = [];
      for (let oi = 0; oi < observations.length; oi++) {
        const obs = observations[oi];
        for (const t of templates) {
          const score = similarity(obs.map, t.map, obs.sig, t.sig);
          candidates.push({
            oi,
            runeId: t.rune.id,
            rune: t.rune,
            score,
            isKing: obs.slot.isKing,
            slotId: obs.slot.id,
          });
        }
      }
      candidates.sort((a, b) => b.score - a.score);

      const usedObs = new Set();
      const usedRune = new Set();
      const matched = [];

      // 1) 가운데(왕룬) 슬롯 먼저 확정
      const kingOi = observations.findIndex((o) => o.slot.isKing);
      if (kingOi >= 0) {
        const kingBest = candidates.find((c) => c.oi === kingOi && c.score >= 0.18);
        if (kingBest) {
          matched.push({ ...kingBest, isKing: true });
          usedObs.add(kingOi);
          usedRune.add(kingBest.runeId);
        }
      }

      // 2) 바깥 슬롯 unique 매칭
      for (const c of candidates) {
        if (usedObs.has(c.oi) || usedRune.has(c.runeId)) continue;
        if (c.score < 0.22) continue;
        usedObs.add(c.oi);
        usedRune.add(c.runeId);
        matched.push({ ...c, isKing: false });
        if (matched.length === 8) break;
      }

      matched.forEach((m) => {
        m.isKing = !!observations[m.oi]?.slot.isKing;
      });

      if (matched.length < 6) continue;
      const avg = matched.reduce((s, m) => s + m.score, 0) / matched.length;
      let marginSum = 0;
      for (const m of matched) {
        const seconds = candidates.filter((c) => c.oi === m.oi && c.runeId !== m.runeId);
        const sec = seconds[0]?.score || 0;
        marginSum += Math.max(0, m.score - sec);
      }
      const kingBoost = matched.some((m) => m.isKing) ? 0.02 : 0;
      const detectBoost = plan.detected ? 0.12 : 0;
      const planScore = avg + kingBoost + detectBoost + matched.length * 0.01 + marginSum * 0.08;
      if (!bestPlan || planScore > bestPlan.planScore) {
        bestPlan = {
          matched,
          avg,
          offset: plan.offset,
          radiusScale: plan.radiusScale,
          planScore,
          observations,
          marginSum,
          detected: !!plan.detected,
        };
      }
  }

  const matched = bestPlan?.matched || [];
  let total = 0;
  const rows = matched.map((m) => {
    const add = scoreRune(m.rune, m.isKing);
    total += add;
    return {
      order: 0,
      id: m.rune.id,
      name: m.rune.name,
      cleanName: cleanName(m.rune.name),
      on: m.rune.on,
      off: m.rune.off,
      base: m.rune.score,
      add,
      desc: m.rune.desc,
      displayDesc: m.isKing
        ? m.rune.kingEffects
          ? m.rune.kingEffects.join(', ')
          : doubleDesc(m.rune.desc)
        : m.rune.desc,
      isKing: m.isKing,
      confidence: Math.round(m.score * 100),
      isMid: m.rune.score >= 20 && m.rune.score <= 29,
      isMajor: m.rune.score >= 30,
      slotId: m.slotId,
    };
  });

  rows.sort((a, b) => Number(a.isKing) - Number(b.isKing));
  rows.forEach((r, i) => {
    r.order = i + 1;
  });

  const matchedIds = new Set(rows.map((r) => r.id));
  const allRunes = RUNE_DATA.map((r) => ({
    id: r.id,
    name: r.name,
    cleanName: cleanName(r.name),
    on: r.on,
    off: r.off,
    score: r.score,
    desc: r.desc,
    active: matchedIds.has(r.id),
    isKing: rows.some((row) => row.id === r.id && row.isKing),
    isMid: r.score >= 20 && r.score <= 29,
    isMajor: r.score >= 30,
  }));

  const kingCount = rows.filter((r) => r.isKing).length;
  const normalCount = rows.filter((r) => !r.isKing).length;
  const lowConf = rows.filter((r) => r.confidence < 35).length;

  return {
    total,
    maxReference: 500,
    judge: judge(total),
    rows,
    allRunes,
    matchedCount: rows.length,
    method: 'circle-vision',
    angleOffset: bestPlan?.offset ?? 0,
    radiusScale: bestPlan?.radiusScale ?? 0.34,
    avgConfidence: Math.round((bestPlan?.avg || 0) * 100),
    slotDetected: !!bestPlan?.detected,
    warning:
      rows.length !== 8 || kingCount !== 1 || lowConf > 2
        ? `왕룬 ${kingCount}/1 · 일반 ${normalCount}/7 (총 ${rows.length}/8). 첨부처럼 원형만 꽉 맞게 캡쳐하세요.`
        : undefined,
  };
}

module.exports = {
  analyzeCircleImage,
  pickKingAmongCandidates,
  loadTemplates,
  clearTemplateCache,
  extractOrangeMap,
  buildSlots,
  detectSlotsFromGlow,
  trimCircleChrome,
  findKingCenter,
};
