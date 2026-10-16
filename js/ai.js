import { formatTime, showProgress, loadScript } from './utils.js';
import { state } from './state.js';

/* ================= Motor IA (Real-ESRGAN + ONNX Runtime Web) ================= */
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const ORT_SRI = {
  'ort.webgpu.min.js': 'sha384-XM2cMlQFAUJFJ3s2424PSr/v9zkRT4aXfi1cUz2SunZatAOwTR5GfTcIKLJIf3Ns',
  'ort.wasm.min.js': 'sha384-epp8GDQUoLKx5qHa6SoDHKv7fSHILsEYk4uEsHdPRBztXEIVWCe/lhhrQJUBMZcf'
};
const MODEL_URL = 'models/realesr-general-x4v3.onnx';
const TILE = 128;
const PAD = 12;
const STRIDE = TILE - 2 * PAD;
const TS = TILE * 4;
let session = null;

export function loadAI() {
  if (state.aiLoad) return state.aiLoad;
  state.aiLoad = (async () => {
    const file = navigator.gpu ? 'ort.webgpu.min.js' : 'ort.wasm.min.js';
    await loadScript(ORT_BASE + file, ORT_SRI[file]);
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads =
      (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
        ? Math.min(4, navigator.hardwareConcurrency || 1)
        : 1;
    ort.env.logLevel = 'error';
    const providers = navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
    let lastError;
    for (const ep of providers) {
      try {
        session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: [ep], logSeverityLevel: 3 });
        state.aiEP = ep;
        return;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('session');
  })();
  state.aiLoad.catch(() => {
    state.aiLoad = null;
    session = null;
  });
  return state.aiLoad;
}

const clampByte = v => v <= 0 ? 0 : v >= 1 ? 255 : v * 255;

export async function upscaleWithAI() {
  const ow = state.origW;
  const oh = state.origH;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = ow;
  srcCanvas.height = oh;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(state.image, 0, 0);
  const pixels = sctx.getImageData(0, 0, ow, oh).data;
  let hasAlpha = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  const k = Math.min(1, Math.max(state.target.w, state.target.h) / (4 * Math.max(ow, oh)));
  const out = document.createElement('canvas');
  out.width = Math.round(4 * ow * k);
  out.height = Math.round(4 * oh * k);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileCanvas.height = TS;
  const tctx = tileCanvas.getContext('2d');
  const tileData = tctx.createImageData(TS, TS);
  const td = tileData.data;
  const input = new Float32Array(3 * TILE * TILE);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const nx = Math.ceil(ow / STRIDE);
  const ny = Math.ceil(oh / STRIDE);
  const total = nx * ny;
  let done = 0;
  const t0 = performance.now();
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
      const feeds = {};
      feeds[inputName] = new ort.Tensor('float32', input, [1, 3, TILE, TILE]);
      const res = await session.run(feeds);
      const d = res[outputName].data;
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
      tctx.putImageData(tileData, 0, 0);
      const cw = Math.min(STRIDE, ow - ox);
      const ch = Math.min(STRIDE, oh - oy);
      const dx = Math.round(ox * 4 * k);
      const dw = Math.round((ox + cw) * 4 * k) - dx;
      const dy = Math.round(oy * 4 * k);
      const dh = Math.round((oy + ch) * 4 * k) - dy;
      octx.drawImage(tileCanvas, PAD * 4, PAD * 4, cw * 4, ch * 4, dx, dy, dw, dh);
      done++;
      const elapsed = (performance.now() - t0) / 1000;
      showProgress(done / total * 100,
        `IA · ${Math.round(done / total * 100)} % · quedan ${formatTime(elapsed / done * (total - done))}`);
      await new Promise(r => setTimeout(r));
    }
  }
  if (hasAlpha) {
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(state.image, 0, 0, out.width, out.height);
    octx.globalCompositeOperation = 'source-over';
  }
  return out;
}
