'use strict';

const screenshot = require('screenshot-desktop');
const sharp = require('sharp');
const { screen } = require('electron');

/**
 * Find pale "습득한 룬 효과" panel. Uses strict near-white density.
 */
async function findEffectsTextPanel(pngBuffer) {
  const meta = await sharp(pngBuffer).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;

  const tw = Math.min(320, w);
  const scale = tw / w;
  const th = Math.max(1, Math.round(h * scale));

  const { data, info } = await sharp(pngBuffer)
    .resize(tw, th, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const light = new Uint8Array(tw * th);

  for (let i = 0; i < tw * th; i++) {
    const o = i * ch;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const br = (r + g + b) / 3;
    // Strict near-white / pale panel
    light[i] = br > 218 && Math.max(r, g, b) - Math.min(r, g, b) < 35 ? 1 : 0;
  }

  const density = (x0, y0, x1, y1) => {
    let c = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        n++;
        if (light[y * tw + x]) c++;
      }
    }
    return n ? c / n : 0;
  };

  // Tall right-panel crop (원형+효과): scan bottom band full-width first
  const portrait = h >= w * 1.25;
  const quadrants = portrait
    ? [
        { name: 'bottom', x0: 0, y0: Math.floor(th * 0.48), x1: tw, y1: th },
        { name: 'bottom-wide', x0: 0, y0: Math.floor(th * 0.4), x1: tw, y1: th },
        { name: 'full', x0: 0, y0: 0, x1: tw, y1: th },
      ]
    : [
        { name: 'lr', x0: Math.floor(tw * 0.48), y0: Math.floor(th * 0.42), x1: tw, y1: th },
        { name: 'r', x0: Math.floor(tw * 0.5), y0: 0, x1: tw, y1: th },
        { name: 'bottom', x0: 0, y0: Math.floor(th * 0.42), x1: tw, y1: th },
        { name: 'full', x0: 0, y0: 0, x1: tw, y1: th },
      ];

  let bestQ = null;
  for (const q of quadrants) {
    const d = density(q.x0, q.y0, q.x1, q.y1);
    if (d < 0.22) continue;
    const widthBias = (q.x1 - q.x0) / tw;
    const score = d + widthBias * (portrait ? 0.2 : 0.08);
    if (!bestQ || score > bestQ.score) bestQ = { ...q, d, score };
  }

  if (!bestQ) return null;

  // Tighten bbox inside chosen quadrant by row/col density
  const rowThresh = 0.25;
  const colThresh = 0.15;
  let y0 = -1;
  let y1 = -1;
  for (let y = bestQ.y0; y < bestQ.y1; y++) {
    let c = 0;
    const span = bestQ.x1 - bestQ.x0;
    for (let x = bestQ.x0; x < bestQ.x1; x++) if (light[y * tw + x]) c++;
    if (c / span >= rowThresh) {
      if (y0 < 0) y0 = y;
      y1 = y;
    }
  }
  let x0 = -1;
  let x1 = -1;
  for (let x = bestQ.x0; x < bestQ.x1; x++) {
    let c = 0;
    const span = (y1 >= 0 ? y1 - y0 + 1 : bestQ.y1 - bestQ.y0);
    const ya = y0 >= 0 ? y0 : bestQ.y0;
    const yb = y1 >= 0 ? y1 + 1 : bestQ.y1;
    for (let y = ya; y < yb; y++) if (light[y * tw + x]) c++;
    if (c / Math.max(span, 1) >= colThresh) {
      if (x0 < 0) x0 = x;
      x1 = x;
    }
  }

  if (y0 < 0 || x0 < 0) {
    x0 = bestQ.x0;
    y0 = bestQ.y0;
    x1 = bestQ.x1 - 1;
    y1 = bestQ.y1 - 1;
  }

  const left = Math.max(0, Math.floor(x0 / scale));
  const top = Math.max(0, Math.floor(y0 / scale));
  const right = Math.min(w, Math.ceil((x1 + 1) / scale));
  const bottom = Math.min(h, Math.ceil((y1 + 1) / scale));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  // Expand panel slightly — OCR needs top/bottom padding for first/last lines
  const padX = Math.round(width * 0.02);
  const padY = Math.round(height * 0.06);
  return {
    left: Math.max(0, left - padX),
    top: Math.max(0, top - padY),
    width: Math.min(w - Math.max(0, left - padX), width + padX * 2),
    height: Math.min(h - Math.max(0, top - padY), height + padY * 2),
    density: bestQ.d,
    mode: bestQ.name,
  };
}

/** Binarize pale panel → black text on white (works well for blue/pink game text) */
async function toInkPng(pngBuffer, zoom = 3) {
  const meta = await sharp(pngBuffer).metadata();
  const targetW = Math.max(1, Math.round((meta.width || 1) * zoom));

  const { data, info } = await sharp(pngBuffer)
    .resize({ width: targetW, kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const br = (r + g + b) / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    // Pale panel → white. Keep blue AND magenta/pink ink as black.
    const isBg = br > 200 && chroma < 45;
    const isPink = r > 140 && b > 95 && g < 175 && r - g > 25;
    const isBlue = b > r + 10 && b > g && br < 200;
    const isDark = br < 155;
    const v = isBg || !(isPink || isBlue || isDark) ? 255 : 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

async function captureRegion(bounds, opts = {}) {
  const displays = screen.getAllDisplays();
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const display =
    displays.find(
      (d) =>
        cx >= d.bounds.x &&
        cy >= d.bounds.y &&
        cx < d.bounds.x + d.bounds.width &&
        cy < d.bounds.y + d.bounds.height
    ) || screen.getPrimaryDisplay();

  const scale = display.scaleFactor || 1;
  const dispBounds = display.bounds;

  const screens = await screenshot.listDisplays().catch(() => null);
  let imgBuffer;

  if (screens && screens.length) {
    let target = screens[0];
    for (const s of screens) {
      if (typeof s.left === 'number') {
        if (
          cx >= s.left &&
          cy >= (s.top || 0) &&
          cx < s.left + (s.width || 0) &&
          cy < (s.top || 0) + (s.height || 0)
        ) {
          target = s;
          break;
        }
      }
    }
    imgBuffer = await screenshot({ screen: target.id, format: 'png' });
  } else {
    imgBuffer = await screenshot({ format: 'png' });
  }

  const meta = await sharp(imgBuffer).metadata();
  const screenW = meta.width;
  const screenH = meta.height;

  let left = Math.round((bounds.x - dispBounds.x) * scale);
  let top = Math.round((bounds.y - dispBounds.y) * scale);
  let width = Math.round(bounds.width * scale);
  let height = Math.round(bounds.height * scale);

  left = Math.max(0, Math.min(left, screenW - 1));
  top = Math.max(0, Math.min(top, screenH - 1));
  width = Math.max(1, Math.min(width, screenW - left));
  height = Math.max(1, Math.min(height, screenH - top));

  const fullCrop = await sharp(imgBuffer)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  // 원형 룬 패널만 캡쳐하는 모드
  if (opts.circleOnly) {
    const side = Math.min(width, height);
    const sqLeft = Math.max(0, Math.round((width - side) / 2));
    const sqTop = Math.max(0, Math.round((height - side) / 2));
    const circlePng = await sharp(fullCrop)
      .extract({ left: sqLeft, top: sqTop, width: side, height: side })
      .png()
      .toBuffer();
    return {
      processedPng: circlePng,
      processedMonoPng: circlePng,
      colorPanelPng: null,
      previewPng: fullCrop,
      circlePng,
      circleBox: { left: sqLeft, top: sqTop, width: side, height: side, mode: 'circle-only' },
      panelFound: false,
      cropMode: 'circle-only',
      region: { left, top, width, height, scale },
    };
  }

  let ocrSource = fullCrop;
  let panelFound = false;
  let cropMode = 'full';
  let panel = null;
  panel = await findEffectsTextPanel(fullCrop);
  if (panel) {
    ocrSource = await sharp(fullCrop)
      .extract({ left: panel.left, top: panel.top, width: panel.width, height: panel.height })
      .png()
      .toBuffer();
    panelFound = true;
    cropMode = `auto-panel:${panel.mode}`;
  } else if (width / Math.max(height, 1) > 1.05 && width > 400) {
    const eLeft = Math.floor(width * 0.52);
    const eTop = Math.floor(height * 0.46);
    const eW = Math.max(1, Math.min(Math.floor(width * 0.46), width - eLeft));
    const eH = Math.max(1, Math.min(Math.floor(height * 0.52), height - eTop));
    ocrSource = await sharp(fullCrop)
      .extract({ left: eLeft, top: eTop, width: eW, height: eH })
      .png()
      .toBuffer();
    cropMode = 'lower-right-fallback';
  }

  // If auto-panel looks short / low density, prefer aggressive lower-right on wide captures
  if (panelFound && width / Math.max(height, 1) > 1.05 && width > 400) {
    const eLeft = Math.floor(width * 0.52);
    const eTop = Math.floor(height * 0.46);
    const eW = Math.max(1, Math.min(Math.floor(width * 0.46), width - eLeft));
    const eH = Math.max(1, Math.min(Math.floor(height * 0.52), height - eTop));
    const fallback = await sharp(fullCrop)
      .extract({ left: eLeft, top: eTop, width: eW, height: eH })
      .png()
      .toBuffer();
    // Prefer fallback when it's larger (more likely to include all lines)
    const fbMeta = await sharp(fallback).metadata();
    const srcMeta = await sharp(ocrSource).metadata();
    if ((fbMeta.height || 0) > (srcMeta.height || 0) * 0.9) {
      ocrSource = fallback;
      cropMode = 'lower-right-preferred';
      panelFound = true;
    }
  }

  const zoom = opts.zoom || 4;
  const processed = await toInkPng(ocrSource, zoom);

  const circleBox = await findCirclePanel(fullCrop, panel);
  let circlePng = null;
  if (circleBox) {
    const cl = Math.max(0, Math.min(circleBox.left, width - 2));
    const ct = Math.max(0, Math.min(circleBox.top, height - 2));
    const cw = Math.max(1, Math.min(circleBox.width, width - cl));
    const ch = Math.max(1, Math.min(circleBox.height, height - ct));
    circlePng = await sharp(fullCrop).extract({ left: cl, top: ct, width: cw, height: ch }).png().toBuffer();
  }

  return {
    processedPng: processed,
    processedMonoPng: processed,
    colorPanelPng: ocrSource,
    previewPng: fullCrop,
    circlePng,
    circleBox,
    panelFound,
    cropMode,
    region: { left, top, width, height, scale },
  };
}

async function detectPinkLineHints(pngBuffer, lineCountHint = 14) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const bandH = Math.max(1, Math.floor(height / Math.max(lineCountHint, 1)));
  const pinkBands = [];

  for (let band = 0; band < Math.ceil(height / bandH); band++) {
    let pink = 0;
    let total = 0;
    const y0 = band * bandH;
    const y1 = Math.min(height, y0 + bandH);
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        total++;
        if (r > 160 && b > 100 && g < 160 && r - g > 35) pink++;
      }
    }
    if (total && pink / total > 0.002) pinkBands.push(band);
  }

  return pinkBands;
}

/**
 * Magenta/pink king-effect ink → black text on white.
 * Tolerant HSV-ish pink, row clustering, and mild dilation so thin strokes OCR well.
 */
async function extractPinkTextPng(pngBuffer, zoom = 4) {
  const { data, info } = await sharp(pngBuffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rowCounts = new Uint32Array(height);
  const xMin = Math.round(width * 0.03);
  const xMax = Math.round(width * 0.97);
  // King effects sit in the lower half of the effect list more often than the top
  const yMin = Math.round(height * 0.05);

  // Magenta UI text: reddish + purplish channels, not pure red UI chrome
  const isPink = (r, g, b) => {
    if (r < 150 || b < 90) return false;
    if (g > 190) return false;
    if (r - g < 25) return false;
    if (b - g < 8 && r - b > 80) return false; // pure red-ish UI highlights
    // Prefer purple-pink: blue still significant
    if (b < 100 && r > 220) return false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 28) return false; // grey
    return true;
  };

  const pinkMask = new Uint8Array(width * height);
  for (let y = yMin; y < height; y++) {
    for (let x = xMin; x < xMax; x++) {
      const i = (y * width + x) * 3;
      if (isPink(data[i], data[i + 1], data[i + 2])) {
        pinkMask[y * width + x] = 1;
        rowCounts[y]++;
      }
    }
  }

  // Keep densest consecutive pink row clusters (drop scattered chrome pixels)
  const activeRows = [];
  for (let y = yMin; y < height; y++) {
    if (rowCounts[y] >= 2) activeRows.push(y);
  }
  if (!activeRows.length) return null;

  // Prefer the bottom-most cluster of rows (king lines live under normal blue text)
  const clusters = [];
  let start = activeRows[0];
  let prev = activeRows[0];
  for (let i = 1; i < activeRows.length; i++) {
    const y = activeRows[i];
    if (y - prev > 8) {
      clusters.push({ start, end: prev });
      start = y;
    }
    prev = y;
  }
  clusters.push({ start, end: prev });
  // Score: favor lower + thicker bands
  clusters.sort((a, b) => {
    const ha = a.end - a.start;
    const hb = b.end - b.start;
    const ya = (a.start + a.end) / 2 / height;
    const yb = (b.start + b.end) / 2 / height;
    return hb + yb * 40 - (ha + ya * 40);
  });
  const best = clusters[0];
  // Include neighboring pink clusters that are still in lower half
  let top = best.start;
  let bottom = best.end;
  for (const c of clusters) {
    if (c.start >= height * 0.35 && c.start - bottom < 28) {
      top = Math.min(top, c.start);
      bottom = Math.max(bottom, c.end);
    }
  }

  top = Math.max(0, top - 6);
  bottom = Math.min(height, bottom + 8);
  const cropH = Math.max(1, bottom - top);
  const out = Buffer.alloc(width * cropH * 3, 255);

  // 1px dilate so thin glyphs stay connected after thresholding
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1 && !hit; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
          if (pinkMask[yy * width + xx]) hit = 1;
        }
      }
      if (!hit) continue;
      const dst = ((y - top) * width + x) * 3;
      out[dst] = 0;
      out[dst + 1] = 0;
      out[dst + 2] = 0;
    }
  }

  return sharp(out, { raw: { width, height: cropH, channels: 3 } })
    .resize({ width: Math.round(width * zoom), kernel: 'lanczos3' })
    .sharpen()
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

/**
 * Locate the circular rune panel (center = 왕룬).
 * Prefer region just above the effects text box; else cyan-aura density scan.
 */
async function findCirclePanel(pngBuffer, effectsPanel = null) {
  const meta = await sharp(pngBuffer).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;

  if (effectsPanel && effectsPanel.top > h * 0.25) {
    // Portrait right-panel: circle is almost the full width above effects
    const preferFullWidth = w / Math.max(h, 1) < 0.75;
    const left = preferFullWidth
      ? Math.max(0, Math.round(w * 0.02))
      : Math.max(0, effectsPanel.left - Math.round(effectsPanel.width * 0.04));
    const width = preferFullWidth
      ? Math.min(w - left, Math.round(w * 0.96))
      : Math.min(w - left, Math.round(effectsPanel.width * 1.08));
    const top = Math.max(0, Math.round(effectsPanel.top * 0.02));
    const height = Math.max(40, effectsPanel.top - top - Math.round(h * 0.01));
    const side = Math.min(width, height);
    const cx = left + width / 2;
    const cy = top + height / 2;
    return {
      left: Math.max(0, Math.round(cx - side / 2)),
      top: Math.max(0, Math.round(cy - side / 2)),
      width: Math.min(side, w),
      height: Math.min(side, h),
      mode: preferFullWidth ? 'above-effects-portrait' : 'above-effects',
    };
  }

  // Cyan aura density → likely circle region when capture is circle-only / no effects
  const tw = Math.min(200, w);
  const scale = tw / w;
  const th = Math.max(1, Math.round(h * scale));
  const { data, info } = await sharp(pngBuffer)
    .resize(tw, th, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const o = (y * tw + x) * ch;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      // cyan / teal glow around circle stones
      if (g > 110 && b > 120 && r < g * 0.85 && g + b > r * 2.2) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n < tw * th * 0.01) {
    // Whole capture may already be the circle panel
    const side = Math.min(w, h);
    return {
      left: Math.round((w - side) / 2),
      top: Math.round((h - side) / 2),
      width: side,
      height: side,
      mode: 'full-square',
    };
  }
  const cx = sx / n / scale;
  const cy = sy / n / scale;
  const side = Math.min(w, h) * 0.92;
  return {
    left: Math.max(0, Math.round(cx - side / 2)),
    top: Math.max(0, Math.round(cy - side / 2)),
    width: Math.min(Math.round(side), w),
    height: Math.min(Math.round(side), h),
    mode: 'cyan-centroid',
  };
}

module.exports = {
  captureRegion,
  detectPinkLineHints,
  extractPinkTextPng,
  findEffectsTextPanel,
  findCirclePanel,
  toInkPng,
};
