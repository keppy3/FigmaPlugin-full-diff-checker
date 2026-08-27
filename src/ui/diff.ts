// Computes a diff percentage for the threshold check / sort order. This
// mirrors the Figma-native blendMode:"DIFFERENCE" composite used in the
// generated report page (see main/report/buildReportPage.ts): draw Before,
// composite After on top with a "difference" blend, and measure how many
// pixels come out non-black.
const NOISE_EPSILON = 6; // per-channel tolerance for PNG compression / antialiasing noise

export async function computeDiffPercent(beforeBytes: Uint8Array, afterBytes: Uint8Array): Promise<number> {
  const [beforeImg, afterImg] = await Promise.all([toImage(beforeBytes), toImage(afterBytes)]);

  const width = Math.max(beforeImg.width, afterImg.width);
  const height = Math.max(beforeImg.height, afterImg.height);
  if (width === 0 || height === 0) return 0;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context を取得できませんでした');

  ctx.drawImage(beforeImg, 0, 0);
  ctx.globalCompositeOperation = 'difference';
  ctx.drawImage(afterImg, 0, 0);

  const { data } = ctx.getImageData(0, 0, width, height);
  let diffPixels = 0;
  const totalPixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > NOISE_EPSILON || data[i + 1] > NOISE_EPSILON || data[i + 2] > NOISE_EPSILON) {
      diffPixels++;
    }
  }

  return (diffPixels / totalPixels) * 100;
}

function toImage(bytes: Uint8Array): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    // TS's DOM lib types BlobPart as requiring a plain ArrayBuffer, not the
    // wider ArrayBufferLike that Uint8Array.buffer carries -- slice() gives
    // back a real ArrayBuffer to satisfy that at no runtime cost.
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'image/png' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像のデコードに失敗しました'));
    };
    img.src = url;
  });
}
