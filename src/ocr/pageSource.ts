/**
 * pageSource.ts - Chuẩn bị ảnh (từ PDF, file ảnh hay camera) cho bộ nhận dạng.
 *  - Tự xoay đúng chiều ảnh chụp điện thoại (EXIF) và thu nhỏ ảnh quá lớn.
 *  - Khử bóng / làm trắng nền để Tesseract và mô hình công thức đọc chính xác hơn.
 */
import { OCR_CONFIG } from './config.ts';
import type { Box } from './types.ts';

export interface PageSource {
  width: number;
  height: number;
  /** canvas đã làm sạch để đưa vào Tesseract */
  ocrInput: HTMLCanvasElement;
  /** độ xám của ảnh đã làm sạch (dùng dò hình vẽ) */
  gray: Uint8ClampedArray;
  /** cắt một vùng thành PNG cho mô hình công thức */
  crop(box: Box): Promise<Blob>;
  /** cắt một vùng từ ảnh GỐC (giữ màu) thành data URL PNG, dùng cho hình minh hoạ */
  cropOriginalDataUrl(box: Box): string;
}

/** Đọc file ảnh thành canvas, tự xoay theo EXIF và giới hạn kích thước */
export async function fileToCanvas(file: Blob, maxSide = OCR_CONFIG.maxImageSide): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

/**
 * Khử bóng: ước lượng "màu nền giấy" theo từng khối 16x16 rồi chia ảnh cho nền đó.
 * Sau đó kéo giãn độ tương phản để chữ đen rõ, nền trắng đều.
 */
export function flattenToGray(source: HTMLCanvasElement): { canvas: HTMLCanvasElement; gray: Uint8ClampedArray } {
  const w = source.width;
  const h = source.height;
  const src = source.getContext('2d')!.getImageData(0, 0, w, h).data;

  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (src[p] * 299 + src[p + 1] * 587 + src[p + 2] * 114) / 1000;
  }

  // Nền giấy theo khối: trung bình của các điểm sáng hơn trung bình khối (bỏ qua nét chữ tối)
  const B = 16;
  const bw = Math.ceil(w / B);
  const bh = Math.ceil(h / B);
  const bg = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0, n = 0;
      const y1 = Math.min(h, (by + 1) * B), x1 = Math.min(w, (bx + 1) * B);
      for (let y = by * B; y < y1; y++) for (let x = bx * B; x < x1; x++) { sum += gray[y * w + x]; n++; }
      const mean = sum / Math.max(1, n);
      let s2 = 0, n2 = 0;
      for (let y = by * B; y < y1; y++) for (let x = bx * B; x < x1; x++) {
        const v = gray[y * w + x];
        if (v >= mean) { s2 += v; n2++; }
      }
      bg[by * bw + bx] = n2 > 0 ? s2 / n2 : mean;
    }
  }
  // Làm mịn nền một lượt (trung bình 3x3 giữa các khối)
  const bg2 = new Float32Array(bg.length);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = by + dy, xx = bx + dx;
      if (yy >= 0 && xx >= 0 && yy < bh && xx < bw) { s += bg[yy * bw + xx]; n++; }
    }
    bg2[by * bw + bx] = s / n;
  }

  for (let y = 0; y < h; y++) {
    const fy = Math.min(bh - 1, Math.max(0, (y - B / 2) / B));
    const y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1, Math.max(0, (x - B / 2) / B));
      const x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0;
      const b =
        bg2[y0 * bw + x0] * (1 - tx) * (1 - ty) + bg2[y0 * bw + x1] * tx * (1 - ty) +
        bg2[y1 * bw + x0] * (1 - tx) * ty + bg2[y1 * bw + x1] * tx * ty;
      let v = (gray[y * w + x] / Math.max(60, b)) * 255;
      // kéo giãn: <110 -> đen, >225 -> trắng
      v = ((v - 110) / (225 - 110)) * 255;
      gray[y * w + x] = v;
    }
  }

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(w, h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    img.data[p] = img.data[p + 1] = img.data[p + 2] = gray[i];
    img.data[p + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return { canvas: out, gray };
}

function cropCanvas(src: HTMLCanvasElement, box: Box): HTMLCanvasElement {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(src.width, Math.ceil(box.x1));
  const y1 = Math.min(src.height, Math.ceil(box.y1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, x1 - x0);
  c.height = Math.max(1, y1 - y0);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG'))), 'image/png'),
  );
}

/** Tạo PageSource từ canvas gốc (ảnh màu của trang) */
export function createPageSource(original: HTMLCanvasElement): PageSource {
  const { canvas: ocrCanvas, gray } = flattenToGray(original);
  return {
    width: original.width,
    height: original.height,
    ocrInput: ocrCanvas,
    gray,
    crop: (box) => canvasToBlob(cropCanvas(ocrCanvas, box)),
    cropOriginalDataUrl: (box) => cropCanvas(original, box).toDataURL('image/png'),
  };
}
