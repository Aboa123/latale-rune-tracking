'use strict';

const { app, BrowserWindow, ipcMain, screen, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { captureRegion, detectPinkLineHints, extractPinkTextPng } = require('./src/capture');
const { recognize, terminate: terminateOcr } = require('./src/ocr');
const { analyzeFromOcr, analyzeFromRuneIds } = require('./src/analyzer');
const { pickKingAmongCandidates } = require('./src/rune-vision');
const { detectActiveRuneIds } = require('./src/rune-grid-vision');

let resultWin = null;
let captureWin = null;
let analyzing = false;

const isDev = !app.isPackaged;
const APP_ICON = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

function createResultWindow() {
  resultWin = new BrowserWindow({
    width: 920,
    height: 560,
    minWidth: 780,
    minHeight: 480,
    title: '룬워드 티어 분석',
    autoHideMenuBar: true,
    icon: APP_ICON,
    backgroundColor: '#120e0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  resultWin.loadFile(path.join(__dirname, 'renderer', 'result.html'));
  resultWin.on('closed', () => {
    resultWin = null;
    if (captureWin && !captureWin.isDestroyed()) captureWin.close();
  });
}

let captureClickThrough = true;
let captureHitPoll = null;

const CAPTURE_TOP_HIT = 42; // title bar
const CAPTURE_BOTTOM_HIT = 32; // hint bar
const CAPTURE_EDGE_HIT = 10; // resize edges

function setCaptureIgnore(ignore) {
  if (!captureWin || captureWin.isDestroyed()) return;
  if (captureClickThrough === ignore) return;
  captureClickThrough = ignore;
  if (ignore) {
    captureWin.setIgnoreMouseEvents(true, { forward: true });
  } else {
    captureWin.setIgnoreMouseEvents(false);
  }
}

function isCaptureChromeHit(localX, localY, width, height) {
  if (localX < 0 || localY < 0 || localX > width || localY > height) return false;
  if (localY <= CAPTURE_TOP_HIT) return true;
  if (localY >= height - CAPTURE_BOTTOM_HIT) return true;
  if (localX <= CAPTURE_EDGE_HIT || localX >= width - CAPTURE_EDGE_HIT) return true;
  return false;
}

function startCaptureHitPoll() {
  stopCaptureHitPoll();
  captureHitPoll = setInterval(() => {
    if (!captureWin || captureWin.isDestroyed() || !captureWin.isVisible()) return;
    // 분석 중 opacity 0 일 때는 통과 유지
    if (analyzing) {
      setCaptureIgnore(true);
      return;
    }

    const point = screen.getCursorScreenPoint();
    const bounds = captureWin.getBounds();
    const localX = point.x - bounds.x;
    const localY = point.y - bounds.y;
    const hit = isCaptureChromeHit(localX, localY, bounds.width, bounds.height);
    setCaptureIgnore(!hit);
  }, 16);
}

function stopCaptureHitPoll() {
  if (captureHitPoll) {
    clearInterval(captureHitPoll);
    captureHitPoll = null;
  }
}

function createCaptureWindow() {
  const primary = screen.getPrimaryDisplay().workArea;
  captureWin = new BrowserWindow({
    // 룬워드 창 전체(좌 리스트 + 우 원형 + 습득한 룬 효과)
    width: 1020,
    height: 920,
    x: Math.round(primary.x + primary.width / 2 - 510),
    y: Math.round(primary.y + 40),
    minWidth: 720,
    minHeight: 640,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    title: '룬워드 캡쳐',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  captureWin.setAlwaysOnTop(true, 'screen-saver');
  captureClickThrough = true;
  captureWin.setIgnoreMouseEvents(true, { forward: true });
  startCaptureHitPoll();
  captureWin.loadFile(path.join(__dirname, 'renderer', 'capture.html'));
  captureWin.on('closed', () => {
    stopCaptureHitPoll();
    captureWin = null;
  });
  captureWin.on('show', () => startCaptureHitPoll());
  captureWin.on('hide', () => {
    setCaptureIgnore(true);
  });
}

async function runAnalysis(opts = {}) {
  const quiet = !!(opts.quiet || opts.auto);
  if (analyzing) return { ok: false, error: '이미 분석 중입니다.', busy: true };
  if (!captureWin || captureWin.isDestroyed()) {
    return { ok: false, error: '캡쳐 창이 없습니다.' };
  }

  analyzing = true;
  try {
    if (resultWin && !resultWin.isDestroyed()) {
      resultWin.webContents.send('analysis-status', { status: 'capturing', auto: quiet });
    }

    const bounds = captureWin.getBounds();

    if (!quiet) {
      captureWin.setOpacity(0);
      await new Promise((r) => setTimeout(r, 100));
    }

    const insetBounds = {
      x: bounds.x + 6,
      y: bounds.y + (quiet ? 40 : 4),
      width: Math.max(40, bounds.width - 12),
      height: Math.max(40, bounds.height - (quiet ? 72 : 8)),
    };

    // 룬워드 UI 전체 → 내부에서 「습득한 룬 효과」패널 자동 크롭
    const shot = await captureRegion(insetBounds, { effectsOnly: true, zoom: 4 });

    if (!quiet && captureWin && !captureWin.isDestroyed()) {
      captureWin.setOpacity(1);
    }

    if (resultWin && !resultWin.isDestroyed()) {
      resultWin.webContents.send('analysis-status', { status: 'ocr', auto: quiet });
      if (!quiet) {
        resultWin.webContents.send('capture-preview', {
          preview: shot.previewPng.toString('base64'),
          effects: shot.processedPng.toString('base64'),
        });
      }
    }

    try {
      const dbg = path.join(app.getPath('userData'), 'last-capture');
      fs.mkdirSync(dbg, { recursive: true });
      fs.writeFileSync(path.join(dbg, 'full.png'), shot.previewPng);
      fs.writeFileSync(path.join(dbg, 'effects.png'), shot.processedPng);
      if (shot.circlePng) fs.writeFileSync(path.join(dbg, 'circle.png'), shot.circlePng);
      if (shot.colorPanelPng) fs.writeFileSync(path.join(dbg, 'effects-color.png'), shot.colorPanelPng);
      fs.writeFileSync(
        path.join(dbg, 'meta.json'),
        JSON.stringify(
          {
            panelFound: shot.panelFound,
            cropMode: shot.cropMode,
            region: shot.region,
            circleBox: shot.circleBox,
          },
          null,
          2
        )
      );
    } catch (_) {}

    if (!shot.panelFound && shot.cropMode === 'full') {
      const empty = analyzeFromOcr('');
      empty.ocrText = '';
      empty.warning =
        '「습득한 룬 효과」 텍스트가 캡쳐에 없습니다.\n첨부처럼 룬워드 창 전체(원형+효과목록)가 들어오게 맞춰주세요.';
      empty.matchedCount = 0;
      empty.rows = [];
      if (resultWin && !resultWin.isDestroyed()) {
        resultWin.webContents.send('analysis-result', empty);
        if (!quiet) resultWin.focus();
      }
      return { ok: true, result: empty };
    }

    // Grid color detection is the primary source for the 8 rune IDs.
    const gridPromise = detectActiveRuneIds(shot.previewPng).catch(() => null);
    const pinkBands = await detectPinkLineHints(shot.colorPanelPng || shot.processedPng, 16);
    let pinkText = '';
    if (shot.colorPanelPng) {
      try {
        const pinkPng = await extractPinkTextPng(shot.colorPanelPng);
        if (pinkPng) {
          pinkText = await recognize(pinkPng);
          try {
            const dbg = path.join(app.getPath('userData'), 'last-capture');
            fs.writeFileSync(path.join(dbg, 'king-pink.png'), pinkPng);
            fs.writeFileSync(path.join(dbg, 'king-pink.txt'), pinkText, 'utf8');
          } catch (_) {}
        }
      } catch (e) {
        console.warn('pink king OCR failed', e);
      }
    }

    const texts = [];
    const inkText = await recognize(shot.processedPng);
    texts.push(inkText);

    if (!quiet && shot.colorPanelPng) {
      try {
        const sharp = require('sharp');
        const meta = await sharp(shot.colorPanelPng).metadata();
        const colorUpscale = await sharp(shot.colorPanelPng)
          .resize({ width: Math.round((meta.width || 200) * 3) })
          .modulate({ brightness: 1.1, saturation: 1.3 })
          .sharpen()
          .withMetadata({ density: 300 })
          .png()
          .toBuffer();
        texts.push(await recognize(colorUpscale));
      } catch (_) {}
    }

    let best = null;
    for (const t of texts) {
      const r = analyzeFromOcr(t, { kingLineIndexes: pinkBands });
      r.ocrText = t;
      if (
        !best ||
        r.matchedCount > best.matchedCount ||
        (r.matchedCount === best.matchedCount && r.total > best.total)
      ) {
        best = r;
      }
    }

    const ocrText = best?.ocrText || inkText;
    const ocrResult = best || analyzeFromOcr(ocrText, { kingLineIndexes: pinkBands });
    const grid = await gridPromise;
    let result = ocrResult;

    if (grid?.matchedCount === 8) {
      // Separately OCR'd magenta text identifies the king. Only accept a grid-proven ID.
      const pinkResult = pinkText ? analyzeFromOcr(pinkText) : null;
      let kingId =
        pinkResult?.rows.find((r) => grid.ids.includes(r.id))?.id ||
        ocrResult.rows.find((r) => r.isKing && grid.ids.includes(r.id))?.id ||
        null;
      let kingVision = null;

      // Fallback: compare only the eight active candidates against the center rune.
      if (!kingId && shot.circlePng) {
        try {
          kingVision = await pickKingAmongCandidates(shot.circlePng, grid.ids);
          if (kingVision && kingVision.margin >= 3 && grid.ids.includes(kingVision.id)) {
            kingId = kingVision.id;
          }
        } catch (e) {
          console.warn('king vision failed', e);
        }
      }

      result = analyzeFromRuneIds(grid.ids, kingId);
      result.method = 'grid-active+effects-king';
      result.gridVision = {
        ids: grid.ids,
        confidence: grid.confidence,
        margin: grid.margin,
      };
      result.kingOcr = {
        text: pinkText,
        id: kingId,
      };
      if (kingVision) {
        result.kingVision = {
          id: kingVision.id,
          name: kingVision.rune
            ? String(kingVision.rune.name).replace(/[《》]/g, '').trim()
            : '',
          confidence: kingVision.confidence,
          margin: kingVision.margin,
        };
      }
      if (!kingId) {
        result.warning = '룬 8개는 확정했지만 왕룬을 판별하지 못했습니다.';
      }
    } else if (shot.circlePng && result.matchedCount > 0) {
      // Grid alignment failed: retain OCR fallback and use center among OCR candidates.
      try {
        const kingPick = await pickKingAmongCandidates(
          shot.circlePng,
          result.rows.map((r) => r.id)
        );
        if (kingPick && kingPick.id && kingPick.margin >= 4) {
          result = analyzeFromOcr(ocrText, {
            kingLineIndexes: pinkBands,
            forcedKingId: kingPick.id,
          });
          result.method = 'ocr+circle-king';
        }
      } catch (e) {
        console.warn('king vision failed', e);
      }
    }

    result.ocrText = ocrText;
    result.pinkBands = pinkBands;
    result.cropMode = shot.cropMode;
    if (!result.method) result.method = 'ocr+effects';

    if (resultWin && !resultWin.isDestroyed()) {
      resultWin.webContents.send('analysis-status', { status: 'matching', ocrText, auto: quiet });
    }

    if (!result.matchedCount) {
      result.warning =
        '효과를 읽지 못했습니다. 캡쳐 창에 룬워드 UI 전체(특히 「습득한 룬 효과」)가 들어오게 맞추세요.';
    } else {
      const kings = result.rows.filter((r) => r.isKing).length;
      const normals = result.rows.filter((r) => !r.isKing).length;
      if (result.matchedCount < 8 || kings !== 1) {
        const tip = `룬 ${result.matchedCount}/8 인식 (왕룬 ${kings}/1 · 일반 ${normals}/7).`;
        result.warning = result.warning ? `${result.warning}\n${tip}` : tip;
      }
    }

    if (resultWin && !resultWin.isDestroyed()) {
      resultWin.webContents.send('analysis-result', result);
      if (!quiet) resultWin.focus();
    }

    return { ok: true, result };
  } catch (err) {
    console.error(err);
    captureWin && !captureWin.isDestroyed() && captureWin.setOpacity(1);
    if (resultWin && !resultWin.isDestroyed()) {
      resultWin.webContents.send('analysis-status', {
        status: 'error',
        error: err.message || String(err),
        auto: quiet,
      });
    }
    return { ok: false, error: err.message || String(err) };
  } finally {
    analyzing = false;
  }
}

function registerIpc() {
  ipcMain.handle('analyze', (_e, opts) => runAnalysis(opts || {}));
  ipcMain.handle('toggle-capture', () => {
    if (!captureWin || captureWin.isDestroyed()) {
      createCaptureWindow();
      return { visible: true };
    }
    if (captureWin.isVisible()) {
      captureWin.hide();
      return { visible: false };
    }
    captureWin.show();
    return { visible: true };
  });
  ipcMain.handle('get-capture-bounds', () => {
    if (!captureWin || captureWin.isDestroyed()) return null;
    return captureWin.getBounds();
  });
  ipcMain.on('capture-close', () => {
    if (captureWin && !captureWin.isDestroyed()) captureWin.hide();
  });
  ipcMain.on('capture-click-through', (_e, ignore) => {
    // renderer hint는 보조, 실제 판정은 메인 폴링이 담당
    setCaptureIgnore(!!ignore);
  });
  ipcMain.on('capture-drag', () => {
    // no-op; HTML5 -webkit-app-region handles drag
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.latale.runeword-analyzer');
  }
  registerIpc();
  createResultWindow();
  createCaptureWindow();

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    runAnalysis();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createResultWindow();
      createCaptureWindow();
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  terminateOcr();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
