/**
 * imageEnhancer.ts
 * High-performance client-side document image enhancement:
 * - Shadow flattening (background illumination estimation & division)
 * - Paper whitening (flat-field correction to pure #ffffff)
 * - Contrast & line darkening
 * - Sharpening & 90-degree rotations
 */

export interface EnhanceOptions {
  shadowRemoval: number; // 0 to 100 (strength of flat-field shadow removal)
  whiteLevel: number;    // 0 to 100 (paper whitening threshold)
  contrast: number;      // 0 to 100 (line darkness boost)
  monochrome: boolean;   // true for black & white document, false to retain color
  sharpen: boolean;      // slight unsharp masking for thin geometry lines
  rotation?: number;     // 0, 90, 180, 270 degrees
}

export const DEFAULT_ENHANCE_OPTIONS: EnhanceOptions = {
  shadowRemoval: 75,
  whiteLevel: 65,
  contrast: 60,
  monochrome: false,
  sharpen: true,
  rotation: 0,
};

/**
 * Enhances an image given as an HTMLImageElement or canvas, and returns a new data URL
 */
export async function enhanceDocumentImage(
  source: HTMLImageElement | HTMLCanvasElement | string,
  options: Partial<EnhanceOptions> = {}
): Promise<{ dataUrl: string; width: number; height: number }> {
  const opt: EnhanceOptions = { ...DEFAULT_ENHANCE_OPTIONS, ...options };

  // Load image if source is string
  let img: HTMLImageElement;
  if (typeof source === 'string') {
    img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = source;
    });
  } else if (source instanceof HTMLImageElement) {
    img = source;
  } else {
    // Canvas source
    img = new Image();
    img.src = source.toDataURL('image/png');
    await new Promise((res) => { img.onload = res; });
  }

  // Handle rotation
  const rotation = (opt.rotation || 0) % 360;
  const is90or270 = rotation === 90 || rotation === 270;
  const w = is90or270 ? img.naturalHeight || img.height : img.naturalWidth || img.width;
  const h = is90or270 ? img.naturalWidth || img.width : img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(w, 10);
  canvas.height = Math.max(h, 10);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot get 2d context');

  // Draw with rotation
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  ctx.drawImage(img, -origW / 2, -origH / 2);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const totalPixels = canvas.width * canvas.height;

  // 1. Estimate local background illumination using a 2D block grid (32x32 blocks)
  // In paper photos, the 90th percentile luminance in each local block represents the paper color
  const blockSize = Math.max(16, Math.min(48, Math.floor(Math.min(canvas.width, canvas.height) / 12)));
  const gridW = Math.ceil(canvas.width / blockSize);
  const gridH = Math.ceil(canvas.height / blockSize);
  const bgGrid = new Float32Array(gridW * gridH);

  // Compute local 85th-95th percentile luminance per block
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const startX = gx * blockSize;
      const startY = gy * blockSize;
      const endX = Math.min(canvas.width, startX + blockSize);
      const endY = Math.min(canvas.height, startY + blockSize);

      const lumSamples: number[] = [];
      for (let y = startY; y < endY; y += 2) {
        for (let x = startX; x < endX; x += 2) {
          const idx = (y * canvas.width + x) * 4;
          // Luminance formula
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          lumSamples.push(lum);
        }
      }

      if (lumSamples.length > 0) {
        lumSamples.sort((a, b) => a - b);
        // Take the 88th percentile as the local paper background
        const pIdx = Math.min(lumSamples.length - 1, Math.floor(lumSamples.length * 0.88));
        bgGrid[gy * gridW + gx] = Math.max(40, lumSamples[pIdx]);
      } else {
        bgGrid[gy * gridW + gx] = 200;
      }
    }
  }

  // 2. Bilinearly interpolate background illumination map and apply flat-field correction
  const shadowWeight = opt.shadowRemoval / 100;
  const whiteThresh = 255 - (opt.whiteLevel * 0.95); // threshold above which pixel is boosted to 255
  const contrastFactor = 1.0 + (opt.contrast / 60);

  for (let y = 0; y < canvas.height; y++) {
    const gy = (y / blockSize);
    const gy0 = Math.min(gridH - 1, Math.floor(gy));
    const gy1 = Math.min(gridH - 1, gy0 + 1);
    const ty = gy - gy0;

    for (let x = 0; x < canvas.width; x++) {
      const gx = (x / blockSize);
      const gx0 = Math.min(gridW - 1, Math.floor(gx));
      const gx1 = Math.min(gridW - 1, gx0 + 1);
      const tx = gx - gx0;

      // Bilinear interpolation
      const b00 = bgGrid[gy0 * gridW + gx0];
      const b10 = bgGrid[gy0 * gridW + gx1];
      const b01 = bgGrid[gy1 * gridW + gx0];
      const b11 = bgGrid[gy1 * gridW + gx1];
      const localBg = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * canvas.width + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      // Flat-field correction: divide by local background
      if (shadowWeight > 0 && localBg > 10) {
        const factor = (255 / localBg) * shadowWeight + 1 * (1 - shadowWeight);
        r = Math.min(255, r * factor);
        g = Math.min(255, g * factor);
        b = Math.min(255, b * factor);
      }

      // Paper Whitening: curve that pushes high values to pure 255
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= whiteThresh) {
        // Soft clamp towards pure white 255
        const ratio = (lum - whiteThresh) / (255 - whiteThresh + 0.001);
        const boost = ratio * ratio * (255 - lum);
        r = Math.min(255, r + boost);
        g = Math.min(255, g + boost);
        b = Math.min(255, b + boost);
      } else {
        // Line contrast: push dark geometry lines darker
        r = Math.max(0, 255 - Math.pow((255 - r) / 255, 1 / contrastFactor) * 255);
        g = Math.max(0, 255 - Math.pow((255 - g) / 255, 1 / contrastFactor) * 255);
        b = Math.max(0, 255 - Math.pow((255 - b) / 255, 1 / contrastFactor) * 255);
      }

      // Monochrome document mode (pure grayscale/black-white scan)
      if (opt.monochrome) {
        const monoVal = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        data[idx] = monoVal;
        data[idx + 1] = monoVal;
        data[idx + 2] = monoVal;
      } else {
        data[idx] = Math.round(r);
        data[idx + 1] = Math.round(g);
        data[idx + 2] = Math.round(b);
      }
    }
  }

  // Put filtered image back onto canvas
  ctx.putImageData(imgData, 0, 0);

  // 3. Optional Subtle Sharpen to keep geometry lines crisp
  if (opt.sharpen) {
    const sharpenCanvas = document.createElement('canvas');
    sharpenCanvas.width = canvas.width;
    sharpenCanvas.height = canvas.height;
    const sCtx = sharpenCanvas.getContext('2d');
    if (sCtx) {
      sCtx.drawImage(canvas, 0, 0);
      // Overlay slight unsharp mask
      ctx.globalAlpha = 0.25;
      ctx.drawImage(sharpenCanvas, -1, 0);
      ctx.drawImage(sharpenCanvas, 1, 0);
      ctx.drawImage(sharpenCanvas, 0, -1);
      ctx.drawImage(sharpenCanvas, 0, 1);
      ctx.globalAlpha = 1.0;
    }
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}
