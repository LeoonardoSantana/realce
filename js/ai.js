import { formatTime, showProgress, loadScript, toast } from './utils.js';
import { state, AI_MODELS } from './state.js';

/* ================= Motor IA (ONNX Runtime Web) ================= */
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const ORT_SRI = {
  'ort.webgpu.min.js': 'sha384-XM2cMlQFAUJFJ3s2424PSr/v9zkRT4aXfi1cUz2SunZatAOwTR5GfTcIKLJIf3Ns',
  'ort.wasm.min.js': 'sha384-epp8GDQUoLKx5qHa6SoDHKv7fSHILsEYk4uEsHdPRBztXEIVWCe/lhhrQJUBMZcf'
};
const TILE = 128;
const PAD = 12;
const STRIDE = TILE - 2 * PAD;
const TS = TILE * 4;
let ortReady = null;
const sessions = {};
let session = null;

function ensureOrt() {
  if (ortReady) return ortReady;
  ortReady = (async () => {
    const file = navigator.gpu ? 'ort.webgpu.min.js' : 'ort.wasm.min.js';
    await loadScript(ORT_BASE + file, ORT_SRI[file]);
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads =
      (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
        ? Math.min(4, navigator.hardwareConcurrency || 1)
        : 1;
    ort.env.logLevel = 'error';
  })();
  ortReady.catch(() => { ortReady = null; });
  return ortReady;
}

export async function loadAI(modelKey = state.aiModel, forceEP = null) {
  const key = AI_MODELS[modelKey] ? modelKey : 'nomos8k';
  if (!forceEP && sessions[key]) {
    session = sessions[key];
    return session;
  }
  await ensureOrt();
  const modelUrl = AI_MODELS[key].url;
  const providers = forceEP ? [forceEP] : (navigator.gpu ? ['webgpu', 'wasm'] : ['wasm']);
  let lastError;
  for (const ep of providers) {
    try {
      const s = await ort.InferenceSession.create(modelUrl, { executionProviders: [ep], logSeverityLevel: 3 });
      sessions[key] = s;
      session = s;
      state.aiEP = ep;
      return s;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('session');
}

async function runTile(input) {
  const makeFeeds = () => ({
    [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, TILE, TILE])
  });
  try {
    return await session.run(makeFeeds());
  } catch (e) {
    if (state.aiEP === 'webgpu') {
      await loadAI(state.aiModel, 'wasm');
      return await session.run(makeFeeds());
    }
    throw e;
  }
}

const clampByte = v => v <= 0 ? 0 : v >= 1 ? 255 : v * 255;

const yieldTick = () => new Promise(resolve => {
  const ch = new MessageChannel();
  ch.port1.onmessage = resolve;
  ch.port2.postMessage(null);
});

let sharedWork = null;
let sharedOut = null;
let sharedTile = null;
let sharedTileCtx = null;
let sharedTileData = null;
let sharedInput = null;

export async function upscaleWithAI(sourceOverride = null, silentProgress = false) {
  const isVideoFrame = !!sourceOverride;
  const srcImg = sourceOverride || state.image;
  const ow0 = isVideoFrame ? sourceOverride.width : state.origW;
  const oh0 = isVideoFrame ? sourceOverride.height : state.origH;
  const destLong = Math.max(state.target.w, state.target.h);
  const srcLong = Math.max(ow0, oh0);
  // Los modelos son redes 4x:
  // - En video: alimentamos a destLong/4 exacto (ej. 480x270 -> 1080p, 640x360 -> 2K) para que 4x dé la resolución final en segundos.
  // - En imagen: si ya alcanza o supera la salida (o si 4x excede destLong), limitamos la base a destLong/2 (máx 1280px) para limpiar grano y reconstruir detalle sin generar 8K-16K innecesarios.
  const maxInputLong = isVideoFrame
    ? Math.max(160, Math.round(destLong / 4))
    : (srcLong >= destLong
      ? Math.min(1280, Math.max(320, Math.round(destLong / 2)))
      : Math.min(srcLong, Math.max(320, Math.round(destLong / 2))));
  let work = srcImg;
  let ow = ow0;
  let oh = oh0;
  if (srcLong > maxInputLong) {
    const f = maxInputLong / srcLong;
    ow = Math.max(1, Math.round(ow0 * f));
    oh = Math.max(1, Math.round(oh0 * f));
    work = sharedWork || (sharedWork = document.createElement('canvas'));
    if (work.width !== ow || work.height !== oh) {
      work.width = ow;
      work.height = oh;
    }
    const wctx = work.getContext('2d', { willReadFrequently: true });
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = 'high';
    wctx.drawImage(srcImg, 0, 0, ow, oh);
  }
  const pixels = work.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, ow, oh).data;
  let hasAlpha = false;
  if (!isVideoFrame) {
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 255) {
        hasAlpha = true;
        break;
      }
    }
  }
  const k = Math.min(1, destLong / (4 * Math.max(ow, oh)));
  const outW = Math.max(1, Math.round(4 * ow * k));
  const outH = Math.max(1, Math.round(4 * oh * k));
  const out = isVideoFrame
    ? (sharedOut || (sharedOut = document.createElement('canvas')))
    : document.createElement('canvas');
  if (out.width !== outW || out.height !== outH) {
    out.width = outW;
    out.height = outH;
  }
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  if (!sharedTile) {
    sharedTile = document.createElement('canvas');
    sharedTile.width = sharedTile.height = TS;
    sharedTileCtx = sharedTile.getContext('2d');
    sharedTileData = sharedTileCtx.createImageData(TS, TS);
    sharedInput = new Float32Array(3 * TILE * TILE);
  }
  const tileCanvas = sharedTile;
  const tctx = sharedTileCtx;
  const tileData = sharedTileData;
  const td = tileData.data;
  const input = sharedInput;
  const nx = Math.ceil(ow / STRIDE);
  const ny = Math.ceil(oh / STRIDE);
  const total = nx * ny;
  if (!silentProgress && total > 300)
    toast(`Imagen grande: la IA puede tardar unos minutos (${total} bloques)`);
  let done = 0;
  const t0 = performance.now();
  let lastYield = t0;
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      if (state.cancelled)
        throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      const ox = tx * STRIDE;
      const oy = ty * STRIDE;
      for (let c = 0; c < 3; c++) {
        const off = c * TILE * TILE;
        for (let y = 0; y < TILE; y++) {
          const sy = Math.min(oh - 1, Math.max(0, oy - PAD + y));
          const row = sy * ow;
          for (let x = 0; x < TILE; x++) {
            const sx = Math.min(ow - 1, Math.max(0, ox - PAD + x));
            input[off + y * TILE + x] = pixels[(row + sx) * 4 + c] / 255;
          }
        }
      }
      const res = await runTile(input);
      const outTensor = res[session.outputNames[0]];
      const d = outTensor.data;
      const plane = TS * TS;
      for (let y = 0; y < TS; y++) {
        for (let x = 0; x < TS; x++) {
          const i = (y * TS + x) * 4;
          td[i] = clampByte(d[y * TS + x]);
          td[i + 1] = clampByte(d[plane + y * TS + x]);
          td[i + 2] = clampByte(d[2 * plane + y * TS + x]);
          td[i + 3] = 255;
        }
      }
      if (typeof outTensor.dispose === 'function') outTensor.dispose();
      tctx.putImageData(tileData, 0, 0);
      const cw = Math.min(STRIDE, ow - ox);
      const ch = Math.min(STRIDE, oh - oy);
      const dx = Math.round(ox * 4 * k);
      const dw = Math.round((ox + cw) * 4 * k) - dx;
      const dy = Math.round(oy * 4 * k);
      const dh = Math.round((oy + ch) * 4 * k) - dy;
      octx.drawImage(tileCanvas, PAD * 4, PAD * 4, cw * 4, ch * 4, dx, dy, dw, dh);
      done++;
      const now = performance.now();
      if (!silentProgress) {
        const elapsed = (now - t0) / 1000;
        showProgress(done / total * 100,
          `IA · ${Math.round(done / total * 100)} % · quedan ${formatTime(elapsed / done * (total - done))}`);
      }
      if (now - lastYield > 32) {
        await yieldTick();
        lastYield = performance.now();
      }
    }
  }
  if (hasAlpha) {
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(work, 0, 0, out.width, out.height);
    octx.globalCompositeOperation = 'source-over';
  }
  return out;
}
