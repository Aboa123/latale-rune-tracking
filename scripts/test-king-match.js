'use strict';

const {
  scoreKingCandidates,
  resolveKingFromVotes,
  analyzeFromRuneIds,
} = require('../src/analyzer');

const ids = [9, 11, 15, 20, 23, 25, 27, 28];

const pinkClean = [
  '일반 몬스터 추가 대미지 +12000',
  '일반 몬스터 지배력 +6%',
].join('\n');

const pinkNoisy = [
  '일반 몬 스터 추가 대미지 +12000',
  '일반 몬스터 지배력 +6.0%',
].join('\n');

const panel = [
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

function show(label, r) {
  console.log(
    label,
    '→',
    r.id,
    'conf',
    r.confidence,
    'margin',
    r.margin,
    'top',
    (r.ranked || []).slice(0, 3).map((x) => `${x.id}:${x.score}k${x.kingHits}`)
  );
}

show('pink clean', scoreKingCandidates(pinkClean, ids));
show('pink noisy', scoreKingCandidates(pinkNoisy, ids));
show('panel full', scoreKingCandidates(panel, ids));

// Wrong-ish pink (only normal values of 야성)
show('pink normal vals (should miss)', scoreKingCandidates('일반 몬스터 대미지 +6000\n일반 몬스터 지배력 +3%', ids));

// Crit king scenario
const critIds = [9, 11, 15, 20, 25, 26, 28, 30];
show(
  'crit king pink',
  scoreKingCandidates('크리티컬 대미지 +100%\n크리티컬 확률 +2%', critIds)
);

// Real pink-crop OCR garbage from last-capture
const critIdsUser = [3, 5, 10, 14, 15, 17, 24, 30];
show(
  'crit pink garbled OCR',
  scoreKingCandidates('/ 、 빨건 크리터필 대매지 +!00%\n즐긴 크리터벨확뮬 +2%', critIdsUser)
);

// panel OCR for user screenshot: vision must not overpower
const panelUser = [
  '최대 HP +5%',
  '행운 +1500',
  '경험치 획득 +10.0%',
  '최소/최대공격력 +5%',
  '조합 성공 확률 +5%',
  '경험치 획득 +10.0%',
  '퀘스트 보상 강화 +30%',
  '최소/최대공격력 +70',
  '물리 크리티컬 대미지 +100%',
  '물리 크리티컬확률 +2%',
].join('\n');
const panelKing = scoreKingCandidates(panelUser, critIdsUser);
show('user panel effects', panelKing);
const fused = resolveKingFromVotes(critIdsUser, [
  { id: panelKing.id, weight: 3.6, source: 'panel' },
  { id: 17, weight: 0.5, source: 'bad-vision' }, // capped vision after solid effects
]);
console.log('fuse prefers panel king', fused.id, fused.ranked.slice(0, 3));

const total = analyzeFromRuneIds(critIdsUser, fused.id);
console.log('total', total.total, total.rows.find((r) => r.isKing)?.cleanName);
