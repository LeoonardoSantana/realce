/* ================= Exportación de video (WebCodecs + Mediabunny) ================= */
export async function exportVideoWebCodecs({ file, width, height, render, onProgress, signal }) {
  const mb = await import('../vendor/mediabunny-1.61.3.min.mjs');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const codec = await mb.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width, height });
  if (!codec) throw new Error('no-encoder');
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new mb.BufferTarget()
  });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: {
      codec,
      forceTranscode: true,
      allowTransformationMetadata: false,
      quality: new mb.Quality({
        bitrate: width * height >= 3840 * 2160 * 0.9 ? 40e6 : (width * height >= 2560 * 1440 * 0.9 ? 20e6 : 12e6)
      }),
      processedWidth: width,
      processedHeight: height,
      process: sample => render(sample)
    }
  });
  if (!conversion.isValid) throw new Error('invalid-conversion');
  conversion.onProgress = onProgress;
  signal.addEventListener('abort', () => conversion.cancel(), { once: true });
  await conversion.execute();
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
