import { $, toast, downloadBlob } from './utils.js';
import { state } from './state.js';

/* ================= Exportar / historial ================= */
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export function baseName() {
  return state.file ? state.file.name.replace(/\.[^.]+$/, '') : 'realce';
}

export function outputName(ext) {
  return `${baseName()}-${state.resolution}.${ext}`;
}

function renderHistory() {
  const h = $('#hist');
  h.innerHTML = '';
  $('#hwrap').hidden = !state.history.length;
  state.history.forEach(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Descargar ' + item.name);
    const im = document.createElement('img');
    im.src = item.thumb;
    im.alt = item.name;
    im.title = item.name;
    b.appendChild(im);
    b.onclick = () => downloadBlob(null, item.name, item.url);
    h.appendChild(b);
  });
}

export function addHistory(blob, name) {
  const th = document.createElement('canvas');
  th.width = 140;
  th.height = Math.max(40, Math.round(140 * state.target.h / state.target.w));
  th.getContext('2d').drawImage($('#cvAfter'), 0, 0, th.width, th.height);
  const item = {
    url: URL.createObjectURL(blob),
    name,
    thumb: th.toDataURL('image/jpeg', .7)
  };
  state.history.push(item);
  renderHistory();
  return item;
}

export function downloadLastVideo() {
  if (!state.lastVideo) {
    toast('Primero procesa el video para descargarlo');
    return;
  }
  downloadBlob(state.lastVideo.blob, state.lastVideo.name, state.lastVideo.url);
  toast('Video descargado', 'ok');
}

export function canvasToBlob(after = $('#cvAfter')) {
  return new Promise(resolve => {
    const mime = MIME[state.format];
    const q = state.format === 'png' ? undefined : state.quality;
    if (state.format === 'jpg') {
      const tmp = document.createElement('canvas');
      tmp.width = after.width;
      tmp.height = after.height;
      const tctx = tmp.getContext('2d');
      tctx.fillStyle = '#fff';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(after, 0, 0);
      tmp.toBlob(resolve, mime, q);
    } else {
      after.toBlob(resolve, mime, q);
    }
  });
}

export async function exportImage(nameOverride) {
  const b = await canvasToBlob($('#cvAfter'));
  if (!b) {
    toast('No se pudo exportar', 'err');
    return;
  }
  const ext = state.format === 'jpg' ? 'jpg' : state.format;
  const name = nameOverride || outputName(ext);
  const item = addHistory(b, name);
  downloadBlob(null, name, item.url);
  const file = new File([b], name, { type: MIME[state.format] });
  state.share = (navigator.canShare && navigator.canShare({ files: [file] }))
    ? { files: [file], title: name }
    : null;
  toast('Imagen descargada', 'ok');
}

export async function shareCurrent() {
  if (!navigator.share) {
    toast('Tu navegador no soporta compartir archivos directamente', 'err');
    return;
  }
  if (state.mediaType === 'video') {
    if (!state.lastVideo || !state.lastVideo.blob) {
      toast('Primero procesa el video para poder compartirlo');
      return;
    }
    try {
      const vf = new File([state.lastVideo.blob], state.lastVideo.name, {
        type: state.lastVideo.type || 'video/mp4'
      });
      if (!navigator.canShare || navigator.canShare({ files: [vf] })) {
        await navigator.share({ files: [vf], title: state.lastVideo.name });
      } else {
        toast('Tu navegador no permite compartir este video; usa Descargar video', 'err');
      }
    } catch (e) {}
    return;
  }
  const b = await canvasToBlob($('#cvAfter'));
  if (!b) {
    toast('No se pudo preparar para compartir', 'err');
    return;
  }
  const ext = state.format === 'jpg' ? 'jpg' : state.format;
  const name = outputName(ext);
  const file = new File([b], name, { type: MIME[state.format] });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {}
  } else {
    toast('Tu navegador no permite compartir este archivo; usa Descargar', 'err');
  }
}

export function initExport() {
  $('#btnClearH').onclick = () => {
    state.history.forEach(i => URL.revokeObjectURL(i.url));
    state.history = [];
    renderHistory();
  };
}
