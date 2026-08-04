'use strict';

const { analyzeFromSampleEffects } = require('../src/analyzer');

// Effects from the sample screenshot (first attachment)
const lines = [
  '물리 최대대미지 +50%',
  '최소/최대공격력 +70',
  '물리 고정 대미지 +1500',
  '최소/최대공격력 +70',
  '보스 몬스터 추가 대미지 +10000',
  '보스 몬스터 지배력 +5.0%',
  '물리 최소대미지 +50%',
  '물리 최대대미지 +50%',
  '퀘스트 보상 강화 +20%',
  '옵션 발생확률 +500%',
  '물리 크리티컬 대미지 +50%',
  '일반 몬스터 추가 대미지 +12000',
  '일반 몬스터 지배력 +6.0%',
];

const kingIndexes = [11, 12];
const result = analyzeFromSampleEffects(lines, kingIndexes);

console.log('Total:', result.total);
console.log('Grade:', result.judge);
console.log('Rows:');
for (const r of result.rows) {
  console.log(`  ${r.isKing ? '[왕]' : '   '} ${r.cleanName} +${r.add} (${r.confidence}%)`);
}
console.log('Unmatched:', result.unmatchedLines);
