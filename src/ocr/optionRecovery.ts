/**
 * optionRecovery.ts
 * ------------------------------------------------------------
 * Tesseract đôi khi BỎ SÓT hẳn một đáp án (thường là D ở mép phải, nơi ảnh chụp tối/nhoè).
 * Cách cứu: khi một dòng đáp án dừng ở A/B/C mà dòng kế tiếp KHÔNG tiếp nối bằng nhãn kế tiếp,
 * ta đọc lại riêng vùng bên phải (rồi vùng bên dưới) của dòng đó ở chế độ "một dòng".
 * Chỉ khi tìm thấy đúng nhãn còn thiếu mới ghép vào, nên không sinh thêm rác.
 */
import type { Box, OcrLine, OcrWord } from './types.ts';
import { unionBox } from './types.ts';
import { detectLabelWords, splitAttachedLabels } from './mathRuns.ts';

export type ReadRegionFn = (box: Box) => Promise<OcrLine[]>;

const LABEL_LIKE = /^(?:\([A-DĐa-d]\)|[A-DĐ][.):;,]|[a-d]\))$/u;
const indexOfLabel = (text: string): number => {
  const ch = text.replace(/[()]/g, '')[0];
  return ch === 'Đ' ? 3 : 'ABCDabcd'.indexOf(ch) % 4;
};

/** Các nhãn (chỉ số 0..3) đã có trên một dòng */
function labelsOnLine(line: OcrLine): number[] {
  const words = splitAttachedLabels(line.words);
  const flags = detectLabelWords(words);
  return words.filter((_, i) => flags[i]).map((w) => indexOfLabel(w.text));
}

/** Tìm trong các từ đọc lại: từ đầu tiên là nhãn có chỉ số `k`; trả về từ đó và các từ sau */
function wordsFromLabel(words: OcrWord[], k: number): OcrWord[] | null {
  const split = splitAttachedLabels(words);
  const at = split.findIndex((w) => LABEL_LIKE.test(w.text) && indexOfLabel(w.text) === k);
  return at >= 0 ? split.slice(at) : null;
}

export async function recoverMissingOptionLabels(
  lines: OcrLine[],
  pageWidth: number,
  readRegion: ReadRegionFn,
  maxAttempts = 12,
): Promise<OcrLine[]> {
  const result = lines.map((l) => ({ ...l }));
  let attempts = 0;

  for (let i = 0; i < result.length && attempts < maxAttempts; i++) {
    const line = result[i];
    const ks = labelsOnLine(line);
    if (ks.length === 0) continue;
    const lastK = ks[ks.length - 1];
    if (lastK >= 3) continue;

    // Dòng kế tiếp đã tiếp nối đúng nhãn (đáp án xuống dòng / bố cục 2x2) -> không thiếu
    const nextKs = i + 1 < result.length ? labelsOnLine(result[i + 1]) : [];
    if (nextKs.length > 0 && nextKs[0] === lastK + 1) continue;

    const h = Math.max(12, line.box.y1 - line.box.y0);
    const lastWord = line.words[line.words.length - 1];
    const wantK = lastK + 1;

    // 1) Vùng bên phải trên cùng dòng
    const right: Box = { x0: lastWord.box.x1 + 4, y0: line.box.y0 - h * 0.4, x1: pageWidth - 2, y1: line.box.y1 + h * 0.4 };
    // 2) Vùng ngay bên dưới (đáp án xuống dòng nhưng bị bỏ sót), chỉ khi chưa có dòng khác ở đó
    const below: Box = { x0: Math.max(0, line.box.x0 - 10), y0: line.box.y1, x1: pageWidth - 2, y1: line.box.y1 + h * 1.9 };
    const belowOccupied = result.some((o, j) => j !== i && o.box.y0 < below.y1 && o.box.y1 > below.y0);

    const attemptsList: Box[] = [];
    if (right.x1 - right.x0 >= h * 3) attemptsList.push(right);
    if (!belowOccupied) attemptsList.push(below);

    for (const region of attemptsList) {
      attempts++;
      let found: OcrWord[] | null = null;
      try {
        const regionLines = await readRegion(region);
        found = wordsFromLabel(regionLines.flatMap((l) => l.words), wantK);
      } catch (err) {
        console.warn('Đọc lại vùng đáp án thất bại:', err);
      }
      if (found && found.length > 0) {
        const words = [...line.words, ...found];
        result[i] = {
          ...line,
          words,
          box: unionBox([line.box, ...found.map((w) => w.box)]),
          text: `${line.text} ${found.map((w) => w.text).join(' ')}`,
        };
        break;
      }
    }
  }
  return result;
}
