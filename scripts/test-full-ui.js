'use strict';

delete require.cache[require.resolve('../src/analyzer')];
delete require.cache[require.resolve('../src/rune-data.json')];
const { analyzeFromOcr } = require('../src/analyzer');

const clean = [
  '물리/마법 관통력 +10%',
  '물리/마법 크리티컬 대미지 +50%',
  '물리/마법 최대대미지 +50%',
  '이동속도 +50%',
  '아이템 발생 확률 +20%',
  '체력 +1500',
  '최대HP +5%',
  '물리/마법 고정대미지 +8%',
  '무기공격력/속성력 +5%',
  '일반 몬스터 추가 대미지 +12000',
  '일반 몬스터 지배력 +6.0%',
].join('\n');

const ocr = [
  '드는                . 놀',
  '물리/마법 관통력 +10%',
  '물리/마법 크리티컬 대미지 +50%',
  '물리/마법 최대대미지 +150%',
  '미동속도 +50%                            /',
  '마미템 발생 확률 +20%',
  '체력 +1500',
  '최대10 +5%',
  '물리/마법 고정대미지 +8%',
  '무기공격력/속성력 +5%',
  '최소/최대곰격력 +5%',
  '속성력 +5%',
  '일반 몬스터 추가 대미지 +12000',
  '일반 몬스터 지배력 +6.0%',
].join('\n');

function dump(label, text, pink) {
  const r = analyzeFromOcr(text, { kingLineIndexes: new Set(pink) });
  console.log('==', label, 'total', r.total, 'matched', r.matchedCount, r.judge.label);
  console.log(r.rows.map((x) => `${x.isKing ? '[왕] ' : ''}${x.cleanName}+${x.add}`).join('\n'));
  console.log('unmatched', r.unmatchedLines);
}

dump('clean', clean, [9, 10]);
dump('ocr', ocr, [11, 12]);
