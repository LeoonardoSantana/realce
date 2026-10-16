import { $ } from './utils.js';
import { state } from './state.js';
import { createEnhancer } from './gl-enhancer.js';
import { initCompare } from './compare.js';
import { initUI, renderCurrent, updateUI } from './ui.js';
import { initVideo } from './video.js';
import { initExport } from './export.js';

/* ================= Arranque ================= */
const { enhancer, glOK } = createEnhancer($('#cvAfter'));
state.enhancer = enhancer;
state.glOK = glOK;

initCompare();
initVideo({ renderCurrent, updateUI });
initExport();
initUI();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}
