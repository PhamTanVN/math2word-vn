/**
 * textOcr.ts - Đọc chữ (tiếng Việt + Anh) bằng Tesseract.js, chạy hoàn toàn trên trình duyệt.
 * Trả về từng dòng cùng vị trí, để các bước sau biết chỗ nào là công thức / hình vẽ.
 */
import { createWorker, PSM } from 'tesseract.js';
import type { Worker as TessWorker, ImageLike } from 'tesseract.js';
import { OCR_CONFIG } from './config.ts';
import type { Box, OcrLine, OcrWord } from './types.ts';

export interface TextOcr {
  recognize(image: ImageLike): Promise<OcrLine[]>;
  /** Đọc lại riêng một vùng ở chế độ "một dòng" (dùng để cứu đáp án bị bỏ sót). Toạ độ trả về theo ảnh gốc. */
  recognizeRegion(image: ImageLike, box: Box): Promise<OcrLine[]>;
  terminate(): Promise<void>;
}

export interface TextOcrOptions {
  /** ghi đè đường dẫn (dùng khi chạy thử bằng Node) */
  workerOptions?: Record<string, unknown>;
  onProgress?: (percent: number, status: string) => void;
}

export async function createTextOcr(opts: TextOcrOptions = {}): Promise<TextOcr> {
  // Trên trình duyệt: dùng file tự lưu trong public/ocr. Trong Node (khi chạy thử): để thư viện tự chọn.
  const inBrowser = typeof window !== 'undefined';
  const worker: TessWorker = await createWorker(OCR_CONFIG.tesseractLangs, 1, {
    ...(inBrowser
      ? {
          workerPath: OCR_CONFIG.paths.tesseractWorker,
          corePath: OCR_CONFIG.paths.tesseractCore,
          workerBlobURL: false,
        }
      : {}),
    langPath: OCR_CONFIG.paths.tessdata,
    gzip: true,
    cacheMethod: 'none',
    logger: (m: any) => opts.onProgress?.(Math.round((m.progress ?? 0) * 100), m.status),
    ...(opts.workerOptions ?? {}),
  } as any);

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
  } as any);

  /** Chuyển kết quả Tesseract thành danh sách OcrLine */
  const toLines = (data: any): OcrLine[] => {
    const lines: OcrLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const l of para.lines ?? []) {
          const text = (l.text ?? '').replace(/\s+/g, ' ').trim();
          if (!text) continue;
          const words: OcrWord[] = (l.words ?? [])
            .filter((w: any) => (w.text ?? '').trim() !== '')
            .map((w: any) => ({
              text: w.text.trim(),
              conf: w.confidence,
              box: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
            }));
          lines.push({
            text,
            conf: l.confidence,
            box: { x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 },
            words,
          });
        }
      }
    }
    return lines;
  };

  return {
    async recognize(image) {
      const { data } = await worker.recognize(image, {}, { blocks: true });
      return toLines(data);
    },
    async recognizeRegion(image, box) {
      const rectangle = {
        left: Math.max(0, Math.round(box.x0)),
        top: Math.max(0, Math.round(box.y0)),
        width: Math.max(1, Math.round(box.x1 - box.x0)),
        height: Math.max(1, Math.round(box.y1 - box.y0)),
      };
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE } as any);
      try {
        const { data } = await worker.recognize(image, { rectangle }, { blocks: true });
        return toLines(data);
      } finally {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO } as any);
      }
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
