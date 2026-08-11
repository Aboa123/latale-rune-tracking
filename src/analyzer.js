'use strict';

const RUNE_DATA = require('./rune-data.json');

function cleanName(name) {
  return String(name).replace(/[《》]/g, '').trim();
}

function doubleEffectText(desc) {
  return String(desc).replace(/([+-]?\d+(?:\.\d+)?)/g, (match) => {
    const n = Number(match);
    return String(Number((n * 2).toFixed(10)));
  });
}

function scoreRune(rune, isKing) {
  if (!isKing) return rune.score;
  if (typeof rune.kingScore === 'number') return rune.kingScore;
  return rune.score * 2;
}

function judge(total) {
  if (total < 300) {
    return { grade: 'd', label: 'D 티어', text: '점수 개선을 권장합니다.', color: '#ef4444' };
  }
  if (total < 350) {
    return { grade: 'c', label: 'C 티어', text: '임시로 사용할 수 있는 룬워드입니다.', color: '#f59e0b' };
  }
  if (total < 400) {
    return { grade: 'b', label: 'B 티어', text: '준수한 룬워드입니다.', color: '#3b82f6' };
  }
  if (total < 450) {
    return { grade: 'a', label: 'A 티어', text: '최종용으로 볼 만한 룬워드입니다.', color: '#8b5cf6' };
  }
  return { grade: 's', label: 'S 티어', text: '최상급 룬워드입니다.', color: '#ec4899' };
}

function normalize(text) {
  let s = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[|丨ㅣ]/g, '/')
    .replace(/[＊※✕xX!~]/g, '+')
    .replace(/\+\s*\+/g, '+')
    .replace(/[＝=]/g, '')
    .replace(/[%％]/g, '%')
    .replace(/[,，]/g, ',')
    .replace(/최대대미지/g, '최대 대미지')
    .replace(/최소대미지/g, '최소 대미지')
    .replace(/대머지|내미지|며이지|데미지|대미피|더미지|대미되|대미니|대대지/g, '대미지')
    .replace(/공격련|공격럭|송격력|승격력|공경력|플국력|공격랙|꼴곡력|곰격력|공걱력|공력력/g, '공격력')
    .replace(/지배릭|지틀랙|지배럭|지삐력/g, '지배력')
    .replace(/확율|확를|말생확률|말객확률|발생학를|발녁확률/g, '발생확률')
    .replace(/크리티컵|크리티큼|크러티컬/g, '크리티컬')
    .replace(/크리대미지|크리\s*대미지/g, '크리티컬 대미지')
    .replace(/크리티컬확를|크러티컬확를/g, '크리티컬 확률')
    .replace(/획독|확둑/g, '획득')
    .replace(/인체트|인첸트|인첼트/g, '인챈트')
    .replace(/인챈트\s*성공\s*확률|인챈트성공확률/g, '인챈트 성공확률')
    .replace(/미동속도|이통속도|미등속도|미동\s*속도|이통\s*속도|미등\s*속도/g, '이동 속도')
    .replace(/이동속도/g, '이동 속도')
    .replace(/최대\s*HP|최대HP|최대1[08OP『o]|최대\s*1\s*[0OP]|최대\s*10/gi, '최대 HP')
    .replace(/마미템|마이템|아아템|아이뎀/g, '아이템')
    .replace(/무기\s*공격력/g, '공격력')
    .replace(/물리\s*\/\s*마법\s*/g, '')
    .replace(/틀리|쿨리|울리|불리|쿨디|코리|뿔리|블리/g, '물리')
    .replace(/최소\s*\/\s*최대\s*공격력/g, '공격력/속성력')
    .replace(/최소\s*\/\s*최[대며애]\s*공격력/g, '공격력/속성력')
    .replace(/공격력\s*\/\s*속성력/g, '공격력/속성력')
    .replace(/(^|[^가-힣\/])속성력(\s*\+)/g, '$1공격력/속성력$2')
    .replace(/물리\s*/g, '')
    .replace(/마법\s*(?!관통)/g, '')
    .replace(/추가\s*대미지|주가\s*대미지/g, '대미지')
    .replace(/경험치\s*획득(?!량)/g, '경험치 획득량')
    .replace(/퀘스트\s*보상\s*강화|퀘스트\s*보상\s*광화|케트\s*보상\s*강화/g, '퀘스트 보상')
    .replace(/퀘스트\s*보상률/g, '퀘스트 보상')
    .replace(/옵션\s*발생\s*확률|옵션발생확률|옴견|움견/g, '옵션 발생 확률')
    .replace(/조합\s*성공\s*확률/g, '조합 성공확률')
    .replace(/근력\s*\+/g, '근력/마법력 +')
    .replace(/아이템\s*발생\s*확률/g, '아이템 발생 확률')
    .replace(/고정대미지/g, '고정 대미지')
    .replace(/고정\s*대미지|고픔\s*대미지|고긍\s*대미지|고금\s*대미지|고경\s*대미지/g, '고정 대미지')
    .replace(/열반|얼반/g, '일반')
    .replace(/일반\s*은\s*스터|일반\s*몬\s*스터|일반\s*몬스터/g, '일반 몬스터')
    .replace(/일반\s*몬(?!스터)/g, '일반 몬스터')
    .replace(/최애|최매|죄대/g, '최대')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s*%/g, '%')
    .replace(/\s+/g, ' ')
    .trim();

  return s.replace(/(\d+)\.0+%/g, '$1%');
}

function compact(text) {
  return normalize(text).replace(/\s+/g, '').toLowerCase();
}

function splitKeywordValue(effectText) {
  const n = normalize(effectText);
  const m = n.match(/^(.*?)([+-]?\d+(?:\.\d+)?)(%?)$/);
  if (!m) return { keyword: compact(n), value: null, unit: '', raw: n };
  let value = Number(m[2]);
  // 6.0 → 6 for catalog snap
  if (!Number.isNaN(value) && Math.abs(value - Math.round(value)) < 1e-9) value = Math.round(value);
  return {
    keyword: compact(m[1]),
    value,
    unit: m[3] || '',
    raw: n,
  };
}

function candidateValues(value) {
  if (value == null || Number.isNaN(value)) return [];
  const out = new Set([value]);
  const asStr = String(value);

  if (asStr.startsWith('1') && asStr.length > 1) out.add(Number(asStr.slice(1)));
  if (asStr.length >= 3 && asStr.endsWith('5')) out.add(Number(asStr.slice(0, -1)));
  if (asStr.includes('.')) {
    out.add(Number(asStr.replace(/(\.\d).*/, '$1')));
    out.add(Math.floor(value));
  }
  // OCR lost leading 1 on king normal dmg: 2000 → also try 12000 / 6000
  if (value === 2000 || value === 1200 || value === 20000) {
    out.add(12000);
    out.add(6000);
  }
  return [...out].filter((n) => !Number.isNaN(n));
}

function buildCatalog() {
  const byKeyword = new Map();

  function add(keyword, value, unit, rune, partIndex, isKingVariant) {
    if (!keyword) return;
    if (!byKeyword.has(keyword)) byKeyword.set(keyword, []);
    byKeyword.get(keyword).push({ value, unit, rune, partIndex, isKingVariant });
  }

  for (const rune of RUNE_DATA) {
    rune.effects.forEach((e, partIndex) => {
      const base = splitKeywordValue(e);
      add(base.keyword, base.value, base.unit, rune, partIndex, false);
      // aliases after normalize converge
      if (/퀘스트/.test(base.keyword) && /보상/.test(base.keyword)) {
        add('퀘스트보상', base.value, base.unit, rune, partIndex, false);
        add('퀘스트보상률', base.value, base.unit, rune, partIndex, false);
        add('퀘스트보상강화', base.value, base.unit, rune, partIndex, false);
      }
      if (/경험치/.test(base.keyword)) {
        add('경험치획득', base.value, base.unit, rune, partIndex, false);
        add('경험치획득량', base.value, base.unit, rune, partIndex, false);
      }
      if (/근력/.test(base.keyword)) {
        add('근력', base.value, base.unit, rune, partIndex, false);
        add('근력/마법력', base.value, base.unit, rune, partIndex, false);
      }
      const doubled = splitKeywordValue(doubleEffectText(e));
      add(doubled.keyword, doubled.value, doubled.unit, rune, partIndex, true);
      if (/퀘스트/.test(doubled.keyword) && /보상/.test(doubled.keyword)) {
        add('퀘스트보상', doubled.value, doubled.unit, rune, partIndex, true);
      }
      if (/크리티컬/.test(doubled.keyword)) {
        add(doubled.keyword.replace(/크리티컬/, '크리'), doubled.value, doubled.unit, rune, partIndex, true);
      }
    });
    if (Array.isArray(rune.aliases)) {
      rune.aliases.forEach((alias) => {
        const a = splitKeywordValue(alias);
        add(a.keyword, a.value, a.unit, rune, 0, false);
        const doubled = splitKeywordValue(doubleEffectText(alias));
        add(doubled.keyword, doubled.value, doubled.unit, rune, 0, true);
      });
    }
    if (rune.kingEffects) {
      rune.kingEffects.forEach((e, partIndex) => {
        const k = splitKeywordValue(e);
        add(k.keyword, k.value, k.unit, rune, partIndex, true);
      });
    }
  }
  return byKeyword;
}

const CATALOG = buildCatalog();

function keywordSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  // require shared meaningful Hangul chunks
  let inter = 0;
  const sa = new Set(a);
  const sb = new Set(b);
  for (const ch of sa) if (sb.has(ch)) inter++;
  const ratio = inter / Math.max(sa.size, sb.size);
  // Avoid weak matches like random noise → unrelated keywords
  if (ratio < 0.45) return ratio * 0.5;
  return ratio;
}

function bestKeywordKey(keyword) {
  let bestKey = null;
  let best = 0;
  for (const key of CATALOG.keys()) {
    const sim = keywordSimilarity(keyword, key);
    if (sim > best) {
      best = sim;
      bestKey = key;
    }
  }
  return best >= 0.58 ? { key: bestKey, sim: best } : null;
}

function repairOcrLine(raw) {
  let s = String(raw || '').trim();
  // Drop leading OCR junk slashes
  s = s.replace(/^[\s/|\\·•-]+/, '');
  // Drop trailing OCR junk
  s = s.replace(/[\s/|\\·•_-]+$/, '');
  s = s.replace(/\s{2,}.*$/, (m) => {
    // keep first effect token if trailing noise after spaces
    return '';
  });
  // If line has value then trailing garbage after %, trim
  s = s.replace(/(%|\d)\s*[\/|\\].*$/, '$1');
  s = s.trim();
  s = s.replace(/^(근력(?:\/마법력)?)\s*(?!\+)(\d+)/, '$1 +$2');
  s = s.replace(/^(체력|행운|올스탯)\s*(?!\+)(\d+)/, '$1 +$2');

  // Crit OCR: 크2 / 크 2 / 크! → 크리
  s = s.replace(/크\s*[2Zz!\|l]\s*/g, '크리');
  // Pink-crop OCR common garbling: 크리터필/크리터벨 → 크리티컬
  s = s.replace(/크리\s*터\s*[필벨컬궐펼벨]/g, '크리티컬');
  s = s.replace(/크리\s*티\s*[컬궐]/g, '크리티컬');
  s = s.replace(/크리\s*티컬/g, '크리티컬');
  s = s.replace(/크리티컬/g, '크리티컬');
  s = s.replace(/대매지|대미니|대대지|더미지|대미피/g, '대미지');
  s = s.replace(/크리\s*대미/g, '크리대미');
  s = s.replace(/크리대미지/g, '크리티컬 대미지');
  s = s.replace(/인첼트|인체트|인첸트/g, '인챈트');
  s = s.replace(/확뮬|확울|확를/g, '확률');
  s = s.replace(/를리|틀리|뿔리|블리|쿨리|빨건|즐긴/g, '물리');
  s = s.replace(/\+\s*100\s*>\s*%/g, '+100%');
  s = s.replace(/\+\s*100\s*["'.]\s*%?/g, '+100%');
  s = s.replace(/[~+\-]*[!liI|]00\s*%/gi, '+100%');

  // Soft repair for king-ish normal monster lines
  if (/일반/.test(s) && /지배|지틀/.test(s) && !/대미/.test(s)) {
    if (!/\d/.test(s)) s += ' +6%';
    else if (!/%/.test(s) && /6|3/.test(s)) s = s.replace(/([63](?:\.\d+)?).*$/, '+$1%');
  }
  if (/일반/.test(s) && /대미|대대|추가\s*대미/.test(s)) {
    if (!/\d{3,}/.test(s)) s += ' +12000';
    else {
      s = s.replace(/[^\d.+%\s가-힣/]/g, '');
      if (!/12000|6000/.test(s) && /2000/.test(s)) s = s.replace(/2000/, '12000');
    }
  }
  // Crit king OCR noise: ~!00% / +!00% → +100%, +?% → +2%
  if (/크리/.test(s) && /대미/.test(s)) {
    s = s.replace(/[~+\-]*[!liI|]00\s*%/gi, '+100%');
    s = s.replace(/[~+\-"'.]*100\s*%?/g, '+100%');
  }
  if (/크리/.test(s) && /확률|확를|티컬/.test(s)) {
    s = s.replace(/[~+\-]*[?？]\s*%/g, '+2%');
    s = s.replace(/[~+\-]*2\s*%/g, '+2%');
  }
  // 경험치 +100 / +100% OCR of +10%
  if (/경험치/.test(s) && /\+?\s*100\b/.test(s)) {
    s = s.replace(/\+?\s*100\s*%?/, '+10%');
  }
  // Crit rate missing digits → +2% (king) or keep trying
  if (/크리/.test(s) && /확률/.test(s) && !/\d/.test(s)) {
    s = s.replace(/[~+\-"'%?\s]+$/, '') + ' +2%';
  }
  // Crit dmg +1005% → +100%
  if (/크리/.test(s) && /대미/.test(s) && /\+?\s*1005\s*%/.test(s)) {
    s = s.replace(/\+?\s*1005\s*%/, '+100%');
  }
  // Crit / percent OCR without plus sign: "크리티컬 대미지 50%" → "+50%"
  s = s.replace(/(대미지|확률|속도|관통력|HP|지배력)\s+(?!\+)(\d+(?:\.\d+)?)\s*%/gi, '$1 +$2%');
  // Crit 150% OCR of 50%
  if (/크리/.test(s) && /\+?\s*150\s*%/.test(s)) s = s.replace(/\+?\s*150\s*%/, '+50%');
  // 최대대미지 150% → 50%
  if (/최대/.test(s) && /대미/.test(s) && /\+?\s*150\s*%/.test(s)) s = s.replace(/\+?\s*150\s*%/, '+50%');
  // 이동 150% → 50%
  if (/이동/.test(s) && /\+?\s*150\s*%/.test(s)) s = s.replace(/\+?\s*150\s*%/, '+50%');
  // 112000 → 12000
  if (/일반/.test(s) && /\+?\s*112000/.test(s)) s = s.replace(/\+?\s*112000/, '+12000');
  // 최대HP OCR
  s = s.replace(/최대\s*1[8P『]/gi, '최대 HP');
  s = s.replace(/미동속도/g, '이동 속도');
  s = s.replace(/마미템|마미덤/g, '아이템');
  s = s.replace(/무기공격력/g, '공격력');
  // 최소/최대 대미지 +0% → +50%
  if (/(최소|최대)/.test(s) && /대미/.test(s) && /\+?\s*0\s*%/.test(s)) {
    s = s.replace(/\+?\s*0\s*%/, '+50%');
  }
  return s;
}

function matchLineToCandidates(line) {
  const repaired = repairOcrLine(line);
  const parsed = splitKeywordValue(repaired);
  const hit = bestKeywordKey(parsed.keyword);
  if (!hit) return [];

  const entries = CATALOG.get(hit.key) || [];
  const values = candidateValues(parsed.value);
  const scored = [];

  for (const entry of entries) {
    if (parsed.unit && entry.unit && parsed.unit !== entry.unit) {
      // allow missing % on OCR
      if (!(parsed.unit === '' && entry.unit === '%')) continue;
    }
    let valueScore = 12;
    let rejectBadValue = false;
    if (values.length && entry.value != null) {
      let bestDist = Infinity;
      for (const v of values) bestDist = Math.min(bestDist, Math.abs(v - entry.value));
      if (bestDist < 0.001) valueScore = 30;
      else if (bestDist <= 1 || bestDist < Math.abs(entry.value) * 0.05 + 0.4) valueScore = 18;
      else if (bestDist < Math.abs(entry.value) * 0.15 + 1) valueScore = 6;
      else {
        valueScore = 0;
        rejectBadValue = true;
      }
    } else if (parsed.value == null) {
      // 숫자 없는 줄은 룬으로 쓰지 않음 (예: 최소/최대공격력 +%)
      continue;
    }
    if (rejectBadValue) continue;
    // Soft value matches are too risky for small percentages
    if (valueScore < 18 && entry.value != null && Math.abs(entry.value) <= 20) continue;
    scored.push({
      ...entry,
      score: hit.sim * 70 + valueScore,
      ocrLine: line,
      snappedValue: entry.value,
      keyword: hit.key,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score >= 55);
}

function matchLineToEffect(line) {
  return matchLineToCandidates(line)[0] || null;
}

function lineFitsPart(line, rune, partIndex, asKing) {
  return matchLineToCandidates(line).find(
    (c) => c.rune.id === rune.id && c.partIndex === partIndex && !!c.isKingVariant === !!asKing
  );
}

function parseOcrLines(ocrText) {
  return String(ocrText || '')
    .replace(/\*/g, '+')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2)
    .filter((l) => !/습득한\s*룬|룬\s*효과|룬워드|사용하기|룬\s*리스트/.test(l))
    .filter(
      (l) =>
        /[+\-]?\d/.test(l) ||
        /대미지|공격|지배|확률|보상|속도|스탯|관통|쿨타임|경험|체력|행운|명중|HP|올|옵션|퀘스트|일반|보스/.test(l)
    )
    .map((raw) => {
      const repaired = repairOcrLine(raw);
      return { raw: repaired, original: raw, norm: normalize(repaired), compact: compact(repaired) };
    });
}

function looksLikeKingLine(line) {
  const s = line.norm || normalize(line.raw || line);
  // Pink (doubled) effect fingerprints commonly seen in king line slots
  return (
    /일반/.test(s) ||
    /경험치/.test(s) ||
    (/보스/.test(s) && /\+?\s*(20000|10\.0|10%)/.test(s)) ||
    (/크리/.test(s) && /\+?\s*100\s*%/.test(s)) ||
    (/크리/.test(s) && /확률/.test(s) && /\+?\s*2\s*%/.test(s)) ||
    /\+?\s*12000\b/.test(s) ||
    (/지배/.test(s) && /\+?\s*6\s*%/.test(s))
  );
}

function groupIntoRunes(lines, kingLineIndexes = new Set(), options = {}) {
  const used = new Set();
  const matched = [];
  const combos = RUNE_DATA.filter((r) => r.effects.length === 2);
  const usedRuneIds = new Set();
  // Prevent rematching the same effect value after a combo already claimed it
  const usedEffectKeys = new Set();

  function effectKey(keyword, value, unit) {
    return `${keyword}|${value}|${unit || ''}`;
  }

  function markRuneEffectsUsed(rune, asKing) {
    rune.effects.forEach((e) => {
      const base = asKing ? splitKeywordValue(doubleEffectText(e)) : splitKeywordValue(e);
      usedEffectKeys.add(effectKey(base.keyword, base.value, base.unit));
      // Also mark compact aliases for 공격력/속성력 splits
      if (/공격력|속성력/.test(base.keyword)) {
        usedEffectKeys.add(effectKey('공격력/속성력', base.value, base.unit));
        usedEffectKeys.add(effectKey('속성력', base.value, base.unit));
        usedEffectKeys.add(effectKey('공격력', base.value, base.unit));
      }
    });
  }

  function lineAlreadyCovered(line) {
    const cands = matchLineToCandidates(line.raw || line);
    if (!cands.length) return false;
    return cands.some((c) => usedEffectKeys.has(effectKey(c.keyword || '', c.value, c.unit)));
  }

  // Boost: last 2 lines are usually king (pink)
  if (lines.length >= 2) {
    kingLineIndexes.add(lines.length - 1);
    kingLineIndexes.add(lines.length - 2);
  }
  lines.forEach((l, i) => {
    if (looksLikeKingLine(l)) kingLineIndexes.add(i);
  });

  for (let i = 0; i < lines.length - 1; i++) {
    if (used.has(i) || used.has(i + 1)) continue;
    let best = null;

    for (const rune of combos) {
      if (usedRuneIds.has(rune.id)) continue;
      for (const asKing of [true, false]) {
        const a0 = lineFitsPart(lines[i].raw, rune, 0, asKing);
        const b1 = lineFitsPart(lines[i + 1].raw, rune, 1, asKing);
        const a1 = lineFitsPart(lines[i].raw, rune, 1, asKing);
        const b0 = lineFitsPart(lines[i + 1].raw, rune, 0, asKing);
        const forward = a0 && b1 ? (a0.score + b1.score) / 2 : 0;
        const swapped = a1 && b0 ? (a1.score + b0.score) / 2 : 0;
        let score = Math.max(forward, swapped);
        if (score < 65) continue;

        // Prefer king parse on last lines / pink indexes
        const onKingZone = kingLineIndexes.has(i) || kingLineIndexes.has(i + 1);
        if (asKing && onKingZone) score += 8;
        if (!asKing && onKingZone && looksLikeKingLine(lines[i])) score -= 6;
        // Prefer combo over later singles when pink/king zone
        if (!asKing) score += 2;

        if (!best || score > best.score) {
          best = {
            rune,
            score,
            implyKing: asKing || onKingZone,
            lineIndexes: [i, i + 1],
            asKing,
          };
        }
      }
    }

    if (best) {
      used.add(i);
      used.add(i + 1);
      usedRuneIds.add(best.rune.id);
      markRuneEffectsUsed(best.rune, best.asKing);
      matched.push({
        rune: best.rune,
        lineIndexes: best.lineIndexes,
        isKing: !!best.implyKing && !!best.asKing,
        confidence: Math.round(best.score),
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (lineAlreadyCovered(lines[i])) {
      used.add(i);
      continue;
    }
    const cands = matchLineToCandidates(lines[i].raw).filter(
      (c) => c.rune.effects.length === 1 && !usedRuneIds.has(c.rune.id)
    );
    if (!cands.length) continue;
    const hit = cands[0];
    used.add(i);
    usedRuneIds.add(hit.rune.id);
    markRuneEffectsUsed(hit.rune, !!hit.isKingVariant);
    matched.push({
      rune: hit.rune,
      lineIndexes: [i],
      isKing: false,
      confidence: Math.round(hit.score),
    });
  }

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (lineAlreadyCovered(lines[i])) {
      used.add(i);
      continue;
    }
    const cands = matchLineToCandidates(lines[i].raw).filter((c) => !usedRuneIds.has(c.rune.id));
    if (!cands.length) continue;
    // Prefer full single-effect runes; allow multi-effect (통찰) only with strong score
    const chosen =
      cands.find((c) => c.rune.effects.length === 1) ||
      cands.find((c) => c.score >= 85) ||
      null;
    if (!chosen) continue;
    used.add(i);
    usedRuneIds.add(chosen.rune.id);
    markRuneEffectsUsed(chosen.rune, !!chosen.isKingVariant);
    matched.push({
      rune: chosen.rune,
      lineIndexes: [i],
      isKing: false,
      confidence: Math.round(chosen.score * 0.9),
    });
  }

  // Resolve exactly one king
  matched.forEach((m) => {
    m.isKing = false;
  });

  if (options.forcedKingId != null) {
    const forced = matched.findIndex((m) => m.rune.id === options.forcedKingId);
    if (forced >= 0) {
      matched[forced].isKing = true;
      return matched;
    }
  }

  let kingIdx = -1;
  let bestKingScore = -1;
  matched.forEach((m, idx) => {
    const onPink = m.lineIndexes.some((i) => kingLineIndexes.has(i));
    const hasIlban = m.lineIndexes.some((i) => /일반/.test(lines[i].norm || lines[i].raw));
    const hasExp = m.lineIndexes.some(
      (i) => /경험치/.test(lines[i].norm || lines[i].raw) && kingLineIndexes.has(i)
    );
    const hasCritKing = m.lineIndexes.some((i) => {
      const t = lines[i].norm || lines[i].raw || '';
      return (
        (/크리/.test(t) && /\+?\s*100\s*%/.test(t)) ||
        (/크리/.test(t) && /확률/.test(t) && /\+?\s*2\s*%/.test(t))
      );
    });
    const touchesBottom = m.lineIndexes.some((i) => i >= lines.length - 2);
    const finalScore =
      scoreRune(m.rune, true) +
      (onPink ? 50 : 0) +
      (hasIlban ? 120 : 0) +
      (hasExp ? 100 : 0) +
      (hasCritKing ? 130 : 0) +
      (touchesBottom ? 30 : 0);
    if (finalScore > bestKingScore) {
      bestKingScore = finalScore;
      kingIdx = idx;
    }
  });

  if (kingIdx >= 0) matched[kingIdx].isKing = true;

  // Prefer filling 8 slots: expand decomposable combos (축복&풍요 → 축복+풍요 등)
  expandCombosTowardEight(matched);

  return matched;
}

const COMBO_PARTS = {
  21: [18, 19], // 평화 & 조화
  22: [13, 5], // 열정 & 분노
  23: [2, 17], // 강철 & 생명
  24: [14, 4], // 인내 & 서약
  25: [16, 15], // 열광 & 격노
  26: [7, 9], // 헌신 & 파괴
  27: [6, 8], // 축복 & 풍요
};

function expandCombosTowardEight(matched) {
  const byId = new Map(RUNE_DATA.map((r) => [r.id, r]));
  let guard = 0;
  while (matched.length < 8 && guard++ < 4) {
    const idx = matched.findIndex((m) => COMBO_PARTS[m.rune.id] && !m.isKing);
    if (idx < 0) break;
    const m = matched[idx];
    const [aId, bId] = COMBO_PARTS[m.rune.id];
    if (matched.some((x) => x.rune.id === aId || x.rune.id === bId)) break;
    const a = byId.get(aId);
    const b = byId.get(bId);
    if (!a || !b) break;
    const lines = m.lineIndexes || [];
    matched.splice(
      idx,
      1,
      {
        rune: a,
        lineIndexes: lines[0] != null ? [lines[0]] : [],
        isKing: false,
        confidence: m.confidence,
      },
      {
        rune: b,
        lineIndexes: lines[1] != null ? [lines[1]] : [],
        isKing: false,
        confidence: m.confidence,
      }
    );
  }
}

function analyzeFromOcr(ocrText, options = {}) {
  const lines = parseOcrLines(ocrText);
  const kingLineIndexes = new Set(options.kingLineIndexes || []);
  const matched = groupIntoRunes(lines, kingLineIndexes, options);

  let total = 0;
  const rows = matched.map((m, order) => {
    const add = scoreRune(m.rune, m.isKing);
    total += add;
    return {
      order: order + 1,
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
          : doubleEffectText(m.rune.desc)
        : m.rune.desc,
      isKing: m.isKing,
      confidence: m.confidence,
      isMid: m.rune.score >= 20 && m.rune.score <= 29,
      isMajor: m.rune.score >= 30,
    };
  });

  rows.sort((a, b) => Number(a.isKing) - Number(b.isKing) || a.order - b.order);
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

  const unmatchedLines = lines
    .map((l, i) => ({ ...l, index: i }))
    .filter((_l, i) => !matched.some((m) => m.lineIndexes.includes(i)))
    .map((l) => l.original || l.raw);

  return {
    total,
    maxReference: 500,
    judge: judge(total),
    rows,
    allRunes,
    lines: lines.map((l) => l.raw),
    unmatchedLines,
    matchedCount: rows.length,
  };
}

function analyzeFromSampleEffects(effectLines, kingIndexes = []) {
  return analyzeFromOcr(effectLines.join('\n'), { kingLineIndexes: new Set(kingIndexes) });
}

function analyzeFromRuneIds(runeIds, kingId = null) {
  const ids = [...new Set((runeIds || []).map(Number).filter(Number.isFinite))];
  const selected = ids
    .map((id) => RUNE_DATA.find((r) => r.id === id))
    .filter(Boolean);
  const effectiveKingId = selected.some((r) => r.id === Number(kingId)) ? Number(kingId) : null;
  let total = 0;

  const rows = selected.map((rune, index) => {
    const isKing = rune.id === effectiveKingId;
    const add = scoreRune(rune, isKing);
    total += add;
    return {
      order: index + 1,
      id: rune.id,
      name: rune.name,
      cleanName: cleanName(rune.name),
      on: rune.on,
      off: rune.off,
      base: rune.score,
      add,
      desc: rune.desc,
      displayDesc: isKing
        ? rune.kingEffects
          ? rune.kingEffects.join(', ')
          : doubleEffectText(rune.desc)
        : rune.desc,
      isKing,
      confidence: 100,
      isMid: rune.score >= 20 && rune.score <= 29,
      isMajor: rune.score >= 30,
    };
  });

  rows.sort((a, b) => Number(a.isKing) - Number(b.isKing) || a.id - b.id);
  rows.forEach((r, i) => {
    r.order = i + 1;
  });

  const selectedIds = new Set(selected.map((r) => r.id));
  const allRunes = RUNE_DATA.map((r) => ({
    id: r.id,
    name: r.name,
    cleanName: cleanName(r.name),
    on: r.on,
    off: r.off,
    score: r.score,
    desc: r.desc,
    active: selectedIds.has(r.id),
    isKing: r.id === effectiveKingId,
    isMid: r.score >= 20 && r.score <= 29,
    isMajor: r.score >= 30,
  }));

  return {
    total,
    maxReference: 500,
    judge: judge(total),
    rows,
    allRunes,
    lines: [],
    unmatchedLines: [],
    matchedCount: rows.length,
  };
}

/** King (doubled) effect strings for a rune. */
function kingEffectParts(rune) {
  if (!rune) return [];
  if (Array.isArray(rune.kingEffects) && rune.kingEffects.length) return rune.kingEffects;
  return (rune.effects || []).map((e) => doubleEffectText(e));
}

/**
 * Rank candidate runes by how well OCR text matches their *king* (doubled) effects.
 * Pink / bottom-of-list text is the ideal input.
 */
function scoreKingCandidates(ocrText, candidateIds) {
  const ids = [...new Set((candidateIds || []).map(Number).filter(Number.isFinite))];
  if (!ids.length) return { id: null, confidence: 0, margin: 0, ranked: [] };

  const lines = parseOcrLines(ocrText);
  const tallies = new Map(ids.map((id) => [id, { score: 0, kingHits: 0, normalHits: 0 }]));

  for (const line of lines) {
    const cands = matchLineToCandidates(line.raw).filter((c) => tallies.has(c.rune.id));
    if (!cands.length) continue;

    // Prefer stronger candidates on this line only
    const best = cands[0].score;
    for (const c of cands) {
      if (c.score < best - 12) continue;
      const t = tallies.get(c.rune.id);
      if (c.isKingVariant) {
        t.score += c.score + 25;
        t.kingHits += 1;
      } else {
        // Base match from pink text is weak signal (usually wrong unit scale)
        t.score += c.score * 0.2;
        t.normalHits += 1;
      }
    }
  }

  // Direct part coverage: each expected king effect that fits a line
  for (const id of ids) {
    const rune = RUNE_DATA.find((r) => r.id === id);
    if (!rune) continue;
    const parts = kingEffectParts(rune);
    let covered = 0;
    parts.forEach((_e, partIndex) => {
      const hit = lines.some((line) => lineFitsPart(line.raw, rune, partIndex, true));
      if (hit) covered += 1;
    });
    if (covered) {
      const t = tallies.get(id);
      t.score += covered * 55;
      t.kingHits += covered;
      // Combo-style full cover
      if (parts.length >= 2 && covered === parts.length) t.score += 40;
    }
  }

  // Distinctive king values that appear as tokens (hard OCR anchors)
  const rawBlob = lines.map((l) => l.raw).join('\n');
  const blob = lines.map((l) => normalize(l.raw)).join('\n');
  for (const id of ids) {
    const rune = RUNE_DATA.find((r) => r.id === id);
    if (!rune) continue;
    const parts = kingEffectParts(rune);
    let anchors = 0;
    for (const e of parts) {
      const { value, unit } = splitKeywordValue(e);
      if (value == null) continue;
      const re =
        unit === '%'
          ? new RegExp(`(?:\\+|\\b)${String(value).replace('.', '\\.')}\\s*%`)
          : new RegExp(`(?:\\+|\\b)${String(value)}\\b`);
      if (re.test(blob) || re.test(rawBlob)) anchors += 1;
    }
    if (anchors) {
      const t = tallies.get(id);
      t.score += anchors * 18;
      // Value-only anchors still count when Hangul OCR is garbled (pink crop)
      if (anchors >= 2 && t.kingHits < anchors) t.kingHits = anchors;
    }
  }

  // Soft pattern fallback for severely garbled pink OCR (크리→크리터, 대매지…)
  const softCritDmg = /크\s*리?.{0,8}(대미|대매|대머)/.test(rawBlob) && /(?:\+|!|l|i)?\s*100\s*%/.test(rawBlob);
  const softCritRate = /크\s*리?.{0,10}(확률|확뮬|확를|확률)/.test(rawBlob) && /(?:\+|)\s*2\s*%/.test(rawBlob);
  const softIlban =
    /일반/.test(rawBlob) &&
    (/(?:\+|)\s*12000\b/.test(rawBlob) || (/(?:\+|)\s*6\s*%/.test(rawBlob) && /지배/.test(rawBlob)));
  if (softCritDmg || softCritRate) {
    for (const id of [30, 11]) {
      if (!tallies.has(id)) continue;
      const t = tallies.get(id);
      if (softCritDmg) {
        t.score += id === 30 ? 90 : 55;
        t.kingHits += 1;
      }
      if (softCritRate && id === 30) {
        t.score += 90;
        t.kingHits += 1;
      }
    }
  }
  if (softIlban && tallies.has(28)) {
    const t = tallies.get(28);
    t.score += 100;
    t.kingHits += 2;
  }

  const ranked = [...tallies.entries()]
    .map(([id, t]) => {
      const rune = RUNE_DATA.find((r) => r.id === id);
      return {
        id,
        name: rune ? cleanName(rune.name) : String(id),
        score: Math.round(t.score),
        kingHits: t.kingHits,
        normalHits: t.normalHits,
      };
    })
    .sort((a, b) => b.score - a.score || b.kingHits - a.kingHits);

  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < 40 || top.kingHits < 1) {
    return {
      id: null,
      confidence: 0,
      margin: 0,
      kingHits: top ? top.kingHits : 0,
      ranked,
      lines: lines.map((l) => l.raw),
    };
  }

  const margin = top.score - (second ? second.score : 0);
  // Need either clear lead or multi hit coverage of king parts
  const accept =
    margin >= 20 ||
    (top.kingHits >= 2 && margin >= 8) ||
    top.score >= 100 ||
    (top.kingHits >= 2 && top.score >= 70);
  return {
    id: accept ? top.id : null,
    confidence: Math.min(100, top.score),
    margin,
    kingHits: top.kingHits,
    ranked,
    lines: lines.map((l) => l.raw),
  };
}

/**
 * Fuse pink-effect OCR, full-panel OCR king, and circle vision votes.
 * sources: [{ id, weight, source, confidence?, margin? }, ...]
 */
function resolveKingFromVotes(candidateIds, sources) {
  const ids = new Set((candidateIds || []).map(Number).filter(Number.isFinite));
  const weights = new Map([...ids].map((id) => [id, 0]));
  const detail = [];

  for (const s of sources || []) {
    const id = Number(s?.id);
    if (!ids.has(id)) continue;
    const w = Number(s.weight) || 0;
    if (w <= 0) continue;
    weights.set(id, weights.get(id) + w);
    detail.push({
      id,
      source: s.source || '?',
      weight: w,
      confidence: s.confidence,
      margin: s.margin,
    });
  }

  const ranked = [...weights.entries()]
    .map(([id, weight]) => ({ id, weight: Math.round(weight * 10) / 10 }))
    .sort((a, b) => b.weight - a.weight);

  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.weight < 1.2) {
    return { id: null, confidence: 0, margin: 0, ranked, votes: detail };
  }

  const margin = top.weight - (second ? second.weight : 0);
  // Accept clear winner; soft-accept single strong source
  const accept = margin >= 0.6 || top.weight >= 2.5;
  return {
    id: accept ? top.id : null,
    confidence: Math.min(100, Math.round(top.weight * 25)),
    margin: Math.round(margin * 10) / 10,
    ranked,
    votes: detail,
  };
}

module.exports = {
  RUNE_DATA,
  analyzeFromOcr,
  analyzeFromRuneIds,
  analyzeFromSampleEffects,
  scoreKingCandidates,
  resolveKingFromVotes,
  kingEffectParts,
  normalize,
  judge,
  scoreRune,
  parseOcrLines,
  doubleEffectText,
  matchLineToEffect,
  matchLineToCandidates,
  lineFitsPart,
};
