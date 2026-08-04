'use strict';

const { analyzeFromOcr } = require('../src/analyzer');

const ocr = [
  '물리 최대대미지 +150%',
  '최소/최대공격력 +70',
  '물리 고정 대미지 *+11500',
  '최소/최대공격력 +70',
  '보스 몬스터 추가 대미지 10000',
  '보스 몬스터 지배력 +5.0%',
  '물리 최소대미지 +50%',
  '물리 최대대미지 +150%',
  '퀘스트 보상 강화 *+20%',
  '옵션 발생확률 *+500%',
  '물리 크리티컬 대미지 +150%',
  '일반 몬스터 추가 대미지 +112000',
  '일반 몬스터 지배력 *6.0%',
].join('\n');

const r = analyzeFromOcr(ocr, { kingLineIndexes: new Set([11, 12]) });
console.log('total', r.total, r.judge.label);
for (const row of r.rows) {
  console.log((row.isKing ? '[왕] ' : '    ') + row.cleanName + ' +' + row.add);
}
console.log('unmatched', r.unmatchedLines);
