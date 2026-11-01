/**
 * pdfRenderer.ts: Client-side PDF page rendering into HTML5 Canvas using pdfjs-dist.
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Worker của PDF.js lấy từ chính gói pdfjs-dist (Vite đóng gói sẵn), không phụ thuộc CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface RenderedPdfPage {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Loads a PDF file from an ArrayBuffer and renders all or specific pages to canvas
 */
export async function loadAndRenderPdfPages(
  arrayBuffer: ArrayBuffer,
  maxPages: number = 10,
  scale: number = 2.0 // High DPI for crisp OCR & diagram cropping
): Promise<RenderedPdfPage[]> {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = Math.min(pdfDoc.numPages, maxPages);
  const pages: RenderedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const context = canvas.getContext('2d');
    if (!context) continue;

    // Fill white background
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // @ts-ignore
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    pages.push({
      pageNumber: pageNum,
      canvas,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    });
  }

  return pages;
}

/**
 * Crops a normalized [ymin, xmin, ymax, xmax] (0..1000) bounding box from a canvas
 */
export function cropBoxFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  box2d: [number, number, number, number]
): { dataUrl: string; width: number; height: number } {
  const [ymin, xmin, ymax, xmax] = box2d;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  // Add slight 1.5% margin around the crop so diagram labels are not cut off
  const padX = (xmax - xmin) * 0.015;
  const padY = (ymax - ymin) * 0.015;

  const cropX = Math.max(0, Math.round(((xmin - padX) / 1000) * w));
  const cropY = Math.max(0, Math.round(((ymin - padY) / 1000) * h));
  const cropW = Math.min(w - cropX, Math.round(((xmax - xmin + 2 * padX) / 1000) * w));
  const cropH = Math.min(h - cropY, Math.round(((ymax - ymin + 2 * padY) / 1000) * h));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(cropW, 10);
  cropCanvas.height = Math.max(cropH, 10);

  const ctx = cropCanvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropW,
      cropH,
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    );
  }

  return {
    dataUrl: cropCanvas.toDataURL('image/png'),
    width: cropCanvas.width,
    height: cropCanvas.height,
  };
}
