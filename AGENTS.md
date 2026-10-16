# Realce

PWA estática (sin build, sin npm) que mejora imágenes y videos a 2K/4K 100% en
local en el navegador. Nada se sube a ningún servidor.

## Estructura

- `index.html` — solo marcado (módulo ES `js/main.js`).
- `css/styles.css` — estilos (claro/oscuro, estilo Apple).
- `js/main.js` — arranque: crea el enhancer, conecta módulos, registra el SW.
- `js/state.js` — `state`, `DEFAULTS`/`PRESETS` por motor (Natural/Claridad/Vívido).
- `js/utils.js` — `$`, formatos, toast, progreso, descarga, `loadScript`.
- `js/gl-enhancer.js` — shaders Catmull-Rom + GLEnhancer + Canvas2DEnhancer.
- `js/ai.js` — Real-ESRGAN vía ONNX Runtime Web (teselado 128, PAD 12).
- `js/video.js` — proceso de video (WebCodecs o MediaRecorder, audio, wake lock, seek) y captura de fotogramas (guardar o abrir con IA).
- `js/video-export.js` — conversión fotograma a fotograma con Mediabunny (MP4).
- `js/compare.js` — comparador Antes/Después con zoom/pan/pinch.
- `js/segmented.js` — componente segmentado estilo iOS.
- `js/export.js` — exportar imagen, compartir, historial.
- `js/ui.js` — sliders, opciones, updateUI, entrada de archivos, processImage.
- `models/` — `realesr-general-x4v3.onnx` (BSD-3-Clause, ver
  `LICENSE-Real-ESRGAN.txt`, SHA-256 a946f7a9397021b9b6b7e71df3d2821b04cc09ff244423b7ca79cb191ce4a00e)
  ejecutado con onnxruntime-web 1.22.0 desde jsDelivr (WebGPU si existe, si no WASM).
- `vendor/` — Mediabunny 1.61.3 (MPL-2.0, self-hosted) + su licencia.
- `icons/`, `manifest.json`, `sw.js` — PWA.

Los módulos ES requieren servir por HTTP (no abrir con file://).

Probar en local: `python3 -m http.server 8081` → http://localhost:8081

## Deploy

- GitHub Pages desde la rama `main` (raíz) → https://leoonardosantana.github.io/realce/
  - Publicar cambios: `git add -A && git commit -m "..." && git push`
  - Al cambiar archivos de la app, subir la versión de `CACHE` en `sw.js` para que los usuarios reciban la actualización.
- GitHub CLI instalado en `~/.local/bin/gh` (no está en el PATH por defecto).
