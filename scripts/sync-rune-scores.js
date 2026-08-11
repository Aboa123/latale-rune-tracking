'use strict';

const fs = require('fs');
const path = require('path');

// 8 slots + king score x2 => max 500
const SCORES = {
  1: 6,
  2: 2.5,
  3: 0,
  4: 0,
  5: 14,
  6: 0,
  7: 15,
  8: 0,
  9: 50,
  10: 0,
  11: 50,
  12: 0,
  13: 3,
  14: 0,
  15: 20,
  16: 20,
  17: 10,
  18: 8.5,
  19: 22.5,
  20: 75,
  21: 31,
  22: 17,
  23: 12.5,
  24: 0,
  25: 40,
  26: 65,
  27: 0,
  28: 45,
  29: 45,
  30: 55,
};

const target = path.join(__dirname, '..', 'src', 'rune-data.json');
const data = JSON.parse(fs.readFileSync(target, 'utf8'));

for (const rune of data) {
  if (!(rune.id in SCORES)) throw new Error(`Missing score for rune ${rune.id}`);
  rune.score = SCORES[rune.id];
  if ('kingScore' in rune) delete rune.kingScore;
  rune.on = `../assets/runes/ON_${rune.id}.jpg`;
  rune.off = `../assets/runes/OFF_${rune.id}.jpg`;
}

fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Synced ${data.length} rune scores (max 500).`);
