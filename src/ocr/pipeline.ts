/**
 * pipeline.ts - Dây chuyền nhận dạng đề thi, KHÔNG dùng AI trên mạng:
 *
 *   ảnh trang ─► Tesseract (đọc chữ + vị trí)
 *            ─► dò hình vẽ (phân tích điểm ảnh)
 *            ─► gộp tử/mẫu số bị tách dòng
 *            ─► mô hình công thức đọc các đoạn toán -> LaTeX
 *            ─► tách "Câu n" và đáp án A/B/C/D
 *            ─► gắn hình vẽ vào câu hỏi gần nhất
 */
import type { Box, CropFn, FormulaRecognizeFn, OcrLine } from './types.ts';
import { boxCenterY } from './types.ts';
import { detectFigures } from './diagramDetector.ts';
import { lineToText, mergeStackedFormulaLines } from './mathRuns.ts';
import { recoverMissingOptionLabels } from './optionRecovery.ts';
import { assignFiguresToQuestions, segmentQuestions, PageLine } from './examSegmenter.ts';
import { OCR_CONFIG } from './config.ts';
import type { MathQuestion } from '../utils/docxExporter.ts';

/** Phần của PageSource mà pipeline cần (tách ra để dễ chạy thử bằng Node) */
export interface PipelinePage {
  width: number;
  height: number;
  ocrInput: unknown;
  gray: Uint8ClampedArray;
  crop: CropFn;
  cropOriginalDataUrl(box: Box): string;
}

export interface PipelineDeps {
  textOcr: {
    recognize(image: any): Promise<OcrLine[]>;
    /** (tuỳ chọn) đọc lại một vùng để cứu đáp án bị bỏ sót */
    recognizeRegion?(image: any, box: Box): Promise<OcrLine[]>;
  };
  /** null nếu mô hình công thức chưa sẵn sàng/không tải được */
  recognizeFormula: FormulaRecognizeFn | null;
  onProgress?: (message: string, fraction: number) => void;
  /** trả về true để dừng giữa chừng */
  shouldCancel?: () => boolean;
}

export interface RecognizedExam {
  questions: MathQuestion[];
  meta: { schoolName?: string; title?: string; duration?: string };
}

const inside = (b: Box, outer: Box) =>
  (b.x0 + b.x1) / 2 >= outer.x0 && (b.x0 + b.x1) / 2 <= outer.x1 && boxCenterY(b) >= outer.y0 && boxCenterY(b) <= outer.y1;

/** Dòng chữ "dài và chắc chắn": dấu hiệu đây là văn bản thật chứ không phải nhãn trong hình */
const isSolidTextLine = (l: OcrLine) => l.text.length >= 20 && l.conf >= 70;

export async function recognizePages(pages: PipelinePage[], deps: PipelineDeps): Promise<RecognizedExam> {
  const allLines: PageLine[] = [];
  const allFigures: { page: number; box: Box }[] = [];
  const total = pages.length;

  for (let p = 0; p < total; p++) {
    if (deps.shouldCancel?.()) throw new Error('Đã dừng nhận dạng.');
    const page = pages[p];
    const base = p / total;
    const step = 1 / total;
    deps.onProgress?.(`Trang ${p + 1}/${total}: đang đọc chữ...`, base);

    let lines = await deps.textOcr.recognize(page.ocrInput);

    // 1) Dò hình vẽ, bỏ vùng nào thực chất là đoạn văn
    const textBoxes = lines.filter((l) => l.conf > 40 && l.text.length >= 2).map((l) => l.box);
    const figures = detectFigures(page.gray, page.width, page.height, textBoxes).filter(
      (f) => lines.filter((l) => isSolidTextLine(l) && inside(l.box, f)).length < 2,
    );

    // 2) Chữ nằm trong hình vẽ (nhãn A, B, S, số trên trục...) không phải nội dung câu hỏi
    lines = lines.filter((l) => !figures.some((f) => inside(l.box, f)));
    // Cứu các đáp án (thường là D ở mép phải) mà lần đọc đầu bỏ sót
    const { textOcr } = deps;
    if (textOcr.recognizeRegion) {
      deps.onProgress?.(`Trang ${p + 1}/${total}: kiểm tra đáp án bị sót...`, base + step * 0.15);
      lines = await recoverMissingOptionLabels(lines, page.width, (box) => textOcr.recognizeRegion!(page.ocrInput, box));
    }
    lines = mergeStackedFormulaLines(lines);

    // 3) Đọc từng dòng (có công thức thì gọi mô hình công thức)
    for (let i = 0; i < lines.length; i++) {
      if (deps.shouldCancel?.()) throw new Error('Đã dừng nhận dạng.');
      deps.onProgress?.(
        `Trang ${p + 1}/${total}: đọc công thức dòng ${i + 1}/${lines.length}...`,
        base + step * (0.2 + 0.8 * (i / Math.max(1, lines.length))),
      );
      const text = await lineToText(lines[i], deps.recognizeFormula, page.crop, OCR_CONFIG.formulaPadding);
      if (text) allLines.push({ text, box: lines[i].box, page: p });
    }
    figures.forEach((box) => allFigures.push({ page: p, box }));
  }

  deps.onProgress?.('Đang ghép câu hỏi và đáp án...', 0.98);
  const { header, questions: raw } = segmentQuestions(allLines);
  const figureOwner = assignFiguresToQuestions(raw, allFigures);

  const stamp = Date.now();
  const questions: MathQuestion[] = raw.map((q, i) => ({
    id: `q-${stamp}-${i}`,
    questionNumber: q.questionNumber,
    content: q.content,
    options: q.options.length > 0 ? q.options : undefined,
    warnings: q.warnings.length > 0 ? q.warnings : undefined,
  }));

  // Mỗi câu giữ hình lớn nhất được gán cho nó
  const bestByQuestion = new Map<number, number>();
  figureOwner.forEach((qi, fi) => {
    if (qi < 0) return;
    const area = (f: Box) => (f.x1 - f.x0) * (f.y1 - f.y0);
    const cur = bestByQuestion.get(qi);
    if (cur === undefined || area(allFigures[fi].box) > area(allFigures[cur].box)) bestByQuestion.set(qi, fi);
  });
  bestByQuestion.forEach((fi, qi) => {
    const { page, box } = allFigures[fi];
    const src = pages[page];
    questions[qi].diagram = {
      id: `fig-${stamp}-${qi}`,
      page,
      box2d: [
        Math.round((box.y0 / src.height) * 1000),
        Math.round((box.x0 / src.width) * 1000),
        Math.round((box.y1 / src.height) * 1000),
        Math.round((box.x1 / src.width) * 1000),
      ],
      base64Image: src.cropOriginalDataUrl(box),
    };
  });

  return { questions, meta: guessMeta(header.map((h) => h.text)) };
}

/** Đoán tên trường, tiêu đề, thời gian từ các dòng đầu đề */
export function guessMeta(headerLines: string[]): RecognizedExam['meta'] {
  const meta: RecognizedExam['meta'] = {};
  for (const raw of headerLines) {
    const t = raw.replace(/\$/g, '').trim();
    if (!meta.schoolName && /(SỞ|TRƯỜNG|PHÒNG|GIÁO DỤC)/i.test(t)) meta.schoolName = t;
    else if (!meta.title && /(ĐỀ|KIỂM TRA|KHẢO SÁT|THI)/i.test(t)) meta.title = t;
    else if (!meta.duration && /thời gian/i.test(t)) meta.duration = t;
  }
  return meta;
}
