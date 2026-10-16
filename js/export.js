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
  state.history.push({
    url: URL.createObjectURL(blob),
    name,
    thumb: th.toDataURL('image/jpeg', .7)
  });
  renderHistory();
}

export function exportImage(nameOverride) {
  const after = $('#cvAfter');
  const finish = b => {
    if (!b) {
      toast('No se pudo exportar', 'err');
      return;
    }
    const ext = state.format === 'jpg' ? 'jpg' : state.format;
    const name = nameOverride || outputName(ext);
    downloadBlob(b, name);
    addHistory(b, name);
    const file = new File([b], name, { type: MIME[state.format] });
    state.share = (navigator.canShare && navigator.canShare({ files: [file] }))
      ? { files: [file], title: name }
      : null;
    $('#btnShare').hidden = !state.share;
    toast('Imagen descargada', 'ok');
  };
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
    tmp.toBlob(finish, mime, q);
  } else {
    after.toBlob(finish, mime, q);
  }
}

export function initExport() {
  $('#btnClearH').onclick = () => {
    state.history.forEach(i => URL.revokeObjectURL(i.url));
    state.history = [];
    renderHistory();
  };
}
