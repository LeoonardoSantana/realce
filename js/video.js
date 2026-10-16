import { $, toast, formatTime, showProgress, hideProgress, downloadBlob } from './utils.js';
import { state } from './state.js';
import { exportImage, addHistory, outputName, baseName } from './export.js';

/* ================= Procesado de video ================= */
let renderFrame = () => {};
let updateUI = () => {};
let openFileFn = () => {};
let setEngineFn = () => {};
const video = () => $('#vid');

async function setupAudio(stream) {
  try {
    if (!state.audioCtx) return false;
    if (!state.mediaSource) {
      state.mediaSource = state.audioCtx.createMediaElementSource(video());
      state.mediaDest = state.audioCtx.createMediaStreamDestination();
      state.mediaSource.connect(state.mediaDest);
    }
    if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();
    state.mediaDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    video().muted = false;
    return true;
  } catch (e) {
    video().muted = true;
    return false;
  }
}

async function lockWake() {
  try {
    state.wakeLock = await (navigator.wakeLock && navigator.wakeLock.request('screen'));
  } catch (e) {}
}

async function unlockWake() {
  try {
    if (state.wakeLock) await state.wakeLock.release();
  } catch (e) {}
  state.wakeLock = null;
}

export async function processVideo() {
  const afterCanvas = $('#cvAfter');
  const vid = video();
  if (!afterCanvas.captureStream || !window.MediaRecorder) {
    toast('Tu navegador no permite grabar el video procesado', 'err');
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && !state.audioCtx) {
    try { state.audioCtx = new AC(); } catch (e) {}
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
  state.busy = true;
  state.cancelled = false;
  updateUI();
  showProgress(0, 'Preparando…');
  const stream = afterCanvas.captureStream(30);
  const endTracks = () => {
    stream.getVideoTracks().forEach(t => t.stop());
    stream.getAudioTracks().forEach(t => stream.removeTrack(t));
  };
  const hadAudio = await setupAudio(stream);
  await lockWake();
  const mime = [
    'video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
  ].find(m => MediaRecorder.isTypeSupported(m)) || '';
  let rec;
  try {
    rec = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: state.resolution === '4K' ? 40000000 : 20000000
    });
  } catch (e) {
    state.busy = false;
    hideProgress();
    updateUI();
    unlockWake();
    endTracks();
    toast('No se pudo iniciar la grabación', 'err');
    return;
  }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => rec.onstop = res);
  const abort = async msg => {
    try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
    await stopped;
    vid.pause();
    vid.muted = true;
    endTracks();
    await unlockWake();
    state.busy = false;
    hideProgress();
    updateUI();
    toast(msg, 'err');
  };
  try { vid.currentTime = 0; } catch (e) {}
  await new Promise(res => {
    vid.onseeked = res;
    setTimeout(res, 800);
  });
  rec.start(500);
  renderFrame();
  try {
    await vid.play();
  } catch (e) {
    vid.muted = true;
    try {
      await vid.play();
    } catch (e2) {
      await abort('No se pudo reproducir el video');
      return;
    }
    if (hadAudio) toast('Se grabará sin audio');
  }
  const loop = () => {
    if (state.cancelled || vid.ended) return;
    renderFrame();
    const p = vid.duration ? vid.currentTime / vid.duration : 0;
    showProgress(p * 100, `Quedan ${formatTime(vid.duration - vid.currentTime)}`);
    if ('requestVideoFrameCallback' in vid) vid.requestVideoFrameCallback(() => loop());
    else requestAnimationFrame(loop);
  };
  loop();
  await new Promise(res => {
    let iv;
    const done = () => { clearInterval(iv); res(); };
    iv = setInterval(() => { if (state.cancelled) done(); }, 150);
    vid.addEventListener('ended', done, { once: true });
  });
  vid.pause();
  vid.muted = true;
  if (rec.state !== 'inactive') rec.stop();
  await stopped;
  endTracks();
  await unlockWake();
  state.busy = false;
  hideProgress();
  updateUI();
  if (state.cancelled) {
    toast('Proceso cancelado');
    return;
  }
  const type = mime || 'video/webm';
  const blob = new Blob(chunks, { type });
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const name = outputName(ext);
  downloadBlob(blob, name);
  addHistory(blob, name);
  toast('Video mejorado descargado', 'ok');
}

function frameStamp(vid) {
  const t = vid.currentTime || 0;
  return Math.floor(t / 60) + 'm' + String(Math.floor(t % 60)).padStart(2, '0') + 's';
}

export function initVideo(callbacks) {
  renderFrame = callbacks.renderCurrent;
  updateUI = callbacks.updateUI;
  openFileFn = callbacks.openFile;
  setEngineFn = callbacks.setEngine;
  const vid = video();
  const seek = $('#seek');
  seek.addEventListener('input', () => {
    vid.currentTime = +seek.value;
    $('#seekT').textContent = formatTime(+seek.value);
  });
  vid.addEventListener('seeked', () => {
    if (state.mediaType === 'video' && !state.busy) renderFrame();
  });
  vid.addEventListener('timeupdate', () => {
    if (!state.busy) {
      seek.value = vid.currentTime;
      $('#seekT').textContent = formatTime(vid.currentTime);
    }
  });
  $('#btnFrame').onclick = () => {
    if (!state.busy) renderFrame();
    const ext = state.format === 'jpg' ? 'jpg' : state.format;
    exportImage(`${baseName()}-fotograma-${frameStamp(vid)}-${state.resolution}.${ext}`);
  };
  $('#btnFrameAI').onclick = () => {
    if (state.busy) return;
    const c = document.createElement('canvas');
    c.width = vid.videoWidth;
    c.height = vid.videoHeight;
    c.getContext('2d').drawImage(vid, 0, 0);
    c.toBlob(async b => {
      if (!b) {
        toast('No se pudo capturar el fotograma', 'err');
        return;
      }
      const f = new File([b], `${baseName()}-fotograma-${frameStamp(vid)}.png`, { type: 'image/png' });
      const ok = await openFileFn(f);
      if (!ok) return;
      setEngineFn('ia');
      toast('Fotograma abierto como imagen. Pulsa «Mejorar con IA».');
    }, 'image/png');
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.busy && state.mediaType === 'video' && !vid.paused) lockWake();
  });
}
