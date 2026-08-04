'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');

let workerPromise = null;

function resolveTessdataPath() {
  const bundled = path.join(__dirname, '..', 'tessdata');
  const unpacked = bundled.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  if (unpacked !== bundled && fs.existsSync(unpacked)) return unpacked;
  return bundled;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const cachePath = resolveTessdataPath();
      const worker = await Tesseract.createWorker('kor', 1, { cachePath });
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      return worker;
    })();
  }
  return workerPromise;
}

function cleanupOcrText(text) {
  return String(text || '')
    .replace(/[|]/g, '/')
    .replace(/＋/g, '+')
    .replace(/\*/g, '+')
    .replace(/\+\+/g, '+')
    .replace(/대머지|내미지|며이지|대미피|더미지/g, '대미지')
    .replace(/공격럭|공격련|송격력|승격력|공경력|플국력/g, '공격력')
    .replace(/지배릭/g, '지배력')
    .replace(/확율|발녁확률|말생확률/g, (m) => (m.includes('발') || m.includes('말') ? '발생확률' : '확률'))
    .replace(/확를/g, '확률')
    .replace(/크리티컵/g, '크리티컬')
    .replace(/크\s*[2Zz!]/g, '크리')
    .replace(/인첼트|인체트/g, '인챈트')
    .replace(/쿨리|울리|불리|를리|틀리/g, '물리')
    .replace(/고픔|고긍|교정/g, '고정')
    .replace(/최애|최매/g, '최대')
    .replace(/(근력|체력|행운)\s+(?=\d)/g, '$1 +')
    .replace(/\+\s*100\s*>\s*%/g, '+100%')
    .replace(/회소|죄고|죄개/g, (m) => (m.startsWith('회') || m.startsWith('죄') && m.includes('소') ? '최소' : m.includes('개') || m.includes('고') ? '최대' : m))
    .replace(/최소\/최대/g, '최소/최대')
    .replace(/케트\s*보상/g, '퀘스트 보상')
    .replace(/옴견|움견/g, '옵션')
    .replace(/[)\]}>。，,\s]+$/gm, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

async function withDpi(pngBuffer, dpi = 300) {
  return sharp(pngBuffer)
    .withMetadata({ density: dpi })
    .png()
    .toBuffer();
}

async function recognize(pngBuffer) {
  const prepared = await withDpi(pngBuffer, 300);
  try {
    const worker = await getWorker();
    const {
      data: { text },
    } = await worker.recognize(prepared);
    return cleanupOcrText(text);
  } catch (err) {
    console.warn('[ocr] worker failed, fallback:', err.message);
    const {
      data: { text },
    } = await Tesseract.recognize(prepared, 'kor', { logger: () => {} });
    return cleanupOcrText(text);
  }
}

async function terminate() {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch (_) {}
    workerPromise = null;
  }
}

module.exports = {
  recognize,
  terminate,
  cleanupOcrText,
};
