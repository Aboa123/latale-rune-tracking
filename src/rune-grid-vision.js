'use strict';

const sharp = require('sharp');

// Calibrated from the complete Rune Word window:
// 5 columns x 6 rows, IDs are row-major 1..30.
const X_RATIOS = [0.1095, 0.2033, 0.2962, 0.39, 0.482];
const Y_RATIOS = [0.245, 0.349, 0.451, 0.553, 0.656, 0.757];

async function detectActiveRuneIds(fullUiPng) {
  const { data, info } = await sharp(fullUiPng)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const half = Math.max(16, Math.round(Math.min(width, height) * 0.04));
  const cells = [];

  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = Math.round(width * X_RATIOS[col]);
      const cy = Math.round(height * Y_RATIOS[row]);
      let orange = 0;
      let strength = 0;
      let total = 0;

      for (let y = Math.max(0, cy - half); y <= Math.min(height - 1, cy + half); y++) {
        for (let x = Math.max(0, cx - half); x <= Math.min(width - 1, cx + half); x++) {
          const i = (y * width + x) * 3;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          total++;

          // Selected slots have a broad orange/gold border and stone.
          if (r > 145 && g > 62 && b < 110 && r > b * 1.65 && r > g * 1.12) {
            orange++;
            strength += r + g - b * 2;
          }
        }
      }

      const ratio = total ? orange / total : 0;
      const meanStrength = total ? strength / total : 0;
      cells.push({
        id: row * 5 + col + 1,
        row,
        col,
        x: cx,
        y: cy,
        ratio,
        strength: meanStrength,
        score: ratio * 1.5 + meanStrength / 250,
      });
    }
  }

  const ranked = [...cells].sort((a, b) => b.score - a.score);
  const strong = ranked.filter((c) => c.ratio >= 0.08 && c.strength >= 12);
  const active = (strong.length >= 8 ? strong.slice(0, 8) : strong).sort((a, b) => a.id - b.id);
  const eighth = ranked[7]?.score || 0;
  const ninth = ranked[8]?.score || 0;

  return {
    ids: active.map((c) => c.id),
    active,
    cells,
    matchedCount: active.length,
    confidence: Math.round(Math.max(0, Math.min(1, (eighth - ninth) * 4)) * 100),
    margin: Math.round((eighth - ninth) * 1000) / 10,
    method: 'grid-active-color',
  };
}

module.exports = {
  detectActiveRuneIds,
};
