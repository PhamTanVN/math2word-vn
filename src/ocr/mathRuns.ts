/**
 * mathRuns.ts
 * ------------------------------------------------------------
 * Tesseract đọc chữ tiếng Việt tốt nhưng đọc công thức rất kém. Cách xử lý:
 *   1. Với mỗi dòng, đoán TỪ nào là công thức (có dấu =, ^, √... hoặc tên điểm ABC, biến x...).
 *   2. Gom các từ công thức liền nhau thành một "đoạn công thức".
 *   3. Cắt ảnh đoạn đó, đưa cho mô hình nhận dạng công thức -> LaTeX -> chèn $...$ vào câu.
 */
import { Box, CropFn, FormulaRecognizeFn, OcrLine, OcrWord, boxHeight, unionBox } from './types.ts';
import { cleanFormulaLatex } from './latexClean.ts';
import { sanitizeMathString } from '../utils/mathSanitizer.ts';

export interface LineSegment {
  kind: 'text' | 'math';
  words: OcrWord[];
  box: Box;
}

const OPERATOR_CHARS = /[=<>^_√∫∑∏±∓≤≥≠≈≡→⇒⇔∞∈∉∪∩⊂⊃⊆⊇∠⊥∥°′″\\{}|×÷·∆πθαβγδλμσφω]/;
/** Từ tiếng Việt thông thường: có từ 3 chữ cái thường liên tiếp (kể cả có dấu) */
const VIET_WORD = /[a-zà-ỹ]{3,}/u;
const LABEL = /^[A-D][.)]$/;

export function isLabelWord(text: string): boolean {
  return LABEL.test(text);
}

/** Từ "chắc chắn là công thức" */
export function isStrongMathWord(text: string): boolean {
  const t = text.trim();
  // (Nhãn đáp án được nhận riêng bằng detectLabelWords theo vị trí trên dòng, không loại cứng ở đây,
  //  để "tại điểm A." vẫn là tên điểm.)
  if (!t) return false;
  if (OPERATOR_CHARS.test(t)) return true;
  if (/^[A-Z](\.[A-Z]+)+[.,;:]?$/.test(t)) return true;          // S.ABC
  if (/^[A-Z]{1,4}[.,;:]?$/.test(t)) return true;                // A, AB, ABC, SABC
  if (/^[a-zA-Z][.,;:]?$/.test(t)) return true;                  // biến x, y, a, b
  if (/\d/.test(t) && /[A-Za-z]/.test(t) && !VIET_WORD.test(t)) return true; // 2x, a3, 3a
  if (/[()[\]]/.test(t) && !VIET_WORD.test(t)) return true;      // (O), [1;3]
  return false;
}

/** Từ "yếu": số hoặc dấu phép toán. Chỉ coi là công thức khi nằm sát từ công thức */
function isWeakMathWord(text: string): boolean {
  const t = text.trim();
  return /^[0-9][0-9.,]*$/.test(t) || /^[+\-−*/·×:;,.]+$/.test(t);
}

/** Dòng tiêu đề viết hoa toàn bộ (SỞ GIÁO DỤC...) thì không coi là công thức */
function isAllCapsLine(words: OcrWord[]): boolean {
  const letters = words.map((w) => w.text).join('').replace(/[^\p{L}]/gu, '');
  return letters.length >= 6 && letters === letters.toUpperCase();
}

/** Từ thuộc phần "Câu 1." / "Bài 13:" ở đầu dòng */
function isQuestionMarker(words: OcrWord[], i: number): boolean {
  const t = words[i].text;
  if (i === 0 && /^(Câu|Bài|Cau|Bai)$/i.test(t)) return true;
  if (i === 1 && /^(Câu|Bài|Cau|Bai)$/i.test(words[0].text) && /^\d+[.:)]?$/.test(t)) return true;
  if (i === 0 && /^(Câu|Bài|Cau|Bai)\s*\d+[.:)]?$/i.test(t)) return true;
  return false;
}

/**
 * Tesseract hay dính nhãn đáp án với giá trị: "A.45" -> "A." + "45", "(A)5" -> "(A)" + "5", "a)x" -> "a)" + "x".
 * Với nhãn viết hoa chỉ tách khi phần sau KHÔNG bắt đầu bằng chữ hoa (để giữ "A.BC" là tên đoạn/điểm).
 */
export function splitAttachedLabels(words: OcrWord[]): OcrWord[] {
  const patterns: RegExp[] = [
    /^([A-DĐ][.:;,)])([0-9\-−(√\\$a-zà-ỹ].*)$/u, // A.45  B.x  C.-3  D.ln3
    /^(\([A-DĐa-d]\))(.+)$/u,                     // (A)5
    /^([a-d]\))(.+)$/u,                            // a)x
  ];
  const out: OcrWord[] = [];
  for (const w of words) {
    let split: [string, string] | null = null;
    for (const re of patterns) {
      const m = re.exec(w.text);
      if (m) { split = [m[1], m[2]]; break; }
    }
    if (!split) { out.push(w); continue; }
    const cut = w.box.x0 + ((w.box.x1 - w.box.x0) * split[0].length) / w.text.length;
    out.push({ ...w, text: split[0], box: { ...w.box, x1: cut } });
    out.push({ ...w, text: split[1], box: { ...w.box, x0: cut } });
  }
  return out;
}

/** Từ trông giống nhãn đáp án: "A." "B)" "(C)" "D:" "a)" ; nhãn chữ thường chỉ khi có ")" */
const LABEL_LIKE = /^(?:\([A-DĐa-d]\)|[A-DĐ][.):;,]|[a-d]\))$/u;
const labelIndex = (text: string): number => {
  const ch = text.replace(/[()]/g, '')[0];
  return ch === 'Đ' ? 3 : 'ABCDabcd'.indexOf(ch) % 4;
};

/**
 * Đánh dấu những từ là NHÃN ĐÁP ÁN trong một dòng (không được coi là công thức).
 * Một từ giống nhãn được tính là nhãn nếu:
 *   - đứng đầu dòng, hoặc
 *   - cách từ trước một khoảng trống lớn (kiểu bố cục 2 cột / 4 cột), hoặc
 *   - đúng là nhãn kế tiếp trong chuỗi A -> B -> C -> D vừa gặp ở trên dòng.
 * Nhờ vậy "tại điểm A." (cuối câu) vẫn là tên điểm, còn "A. 5   B. 7" thì A, B là nhãn.
 */
export function detectLabelWords(words: OcrWord[]): boolean[] {
  const flags = words.map(() => false);
  const heights = words.map((w) => w.box.y1 - w.box.y0).sort((x, y) => x - y);
  const lineH = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 20;
  let lastK = -1;
  words.forEach((w, i) => {
    if (!LABEL_LIKE.test(w.text)) return;
    const k = labelIndex(w.text);
    const bigGap = i > 0 && w.box.x0 - words[i - 1].box.x1 >= lineH * 0.9;
    const nextInSequence = lastK >= 0 && k === lastK + 1;
    if (i === 0 || bigGap || nextInSequence) {
      flags[i] = true;
      lastK = k;
    }
  });
  return flags;
}

/** Chia một dòng thành các đoạn chữ / công thức */
export function segmentLine(line: OcrLine): LineSegment[] {
  const words = splitAttachedLabels(line.words.filter((w) => w.text.trim() !== ''));
  if (words.length === 0) return [];

  const caps = isAllCapsLine(words);
  const isLabel = detectLabelWords(words);
  const skip = (i: number) => caps || isLabel[i] || isQuestionMarker(words, i);
  const isMath: boolean[] = words.map((w, i) => !skip(i) && isStrongMathWord(w.text));

  // Hút các từ yếu (số, dấu +,-) nằm sát đoạn công thức (lặp 2 chiều cho chắc)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < words.length; i++) {
      if (!isMath[i] && !skip(i) && isWeakMathWord(words[i].text) && (isMath[i - 1] || isMath[i + 1])) isMath[i] = true;
    }
    for (let i = words.length - 1; i >= 0; i--) {
      if (!isMath[i] && !skip(i) && isWeakMathWord(words[i].text) && (isMath[i - 1] || isMath[i + 1])) isMath[i] = true;
    }
  }

  // Dòng gần như toàn công thức: gộp thành MỘT đoạn (trừ nhãn A. B. C. D. và "Câu n.")
  const mathCount = isMath.filter(Boolean).length;
  const textWords = words.filter((_, i) => !isMath[i] && !isLabel[i] && !isQuestionMarker(words, i));
  const hasVietnameseWord = textWords.some((w) => /[a-zà-ỹ]{2,}/u.test(w.text));
  if (mathCount > 0 && !hasVietnameseWord && (mathCount / words.length >= 0.7 || textWords.length === 0)) {
    for (let i = 0; i < words.length; i++) {
      if (!isLabel[i] && !isQuestionMarker(words, i)) isMath[i] = true;
    }
  }

  // Gom các từ cùng loại liền nhau
  const segments: LineSegment[] = [];
  let cur: OcrWord[] = [];
  let curKind: 'text' | 'math' | null = null;
  const flush = () => {
    if (cur.length > 0 && curKind) segments.push({ kind: curKind, words: cur, box: unionBox(cur.map((w) => w.box)) });
    cur = [];
  };
  words.forEach((w, i) => {
    const kind = isMath[i] ? 'math' : 'text';
    if (kind !== curKind) { flush(); curKind = kind; }
    cur.push(w);
  });
  flush();
  return segments;
}

/** Chuyển một đoạn công thức thành "$latex$" (kèm dấu câu cuối nếu có) */
async function recognizeSegment(
  seg: LineSegment,
  recognize: FormulaRecognizeFn,
  crop: CropFn,
  pad: number,
): Promise<string> {
  const rawText = seg.words.map((w) => w.text).join(' ');
  try {
    const box: Box = { x0: seg.box.x0 - pad, y0: seg.box.y0 - pad, x1: seg.box.x1 + pad, y1: seg.box.y1 + pad };
    const latexRaw = await recognize(await crop(box));
    const { latex, trailing } = cleanFormulaLatex(latexRaw);
    if (latex) return `$${latex}$${trailing}`;
  } catch (err) {
    console.warn('Không nhận dạng được công thức, dùng chữ OCR thay thế:', err);
  }
  // Dự phòng: dùng chữ Tesseract đọc được rồi để bộ sửa lỗi cơ bản xử lý
  return fallbackMath(rawText);
}

function fallbackMath(raw: string): string {
  // Tách dấu câu cuối trước, rồi mới sửa lỗi phần công thức
  const m = /^(.*?)\s*([.,;:]*)\s*$/s.exec(raw.trim())!;
  const inner = m[1].replace(/\$/g, '').trim();
  if (!inner) return raw;
  const fixed = sanitizeMathString(inner);
  return (fixed.includes('$') ? fixed : `$${inner}$`) + m[2];
}

/**
 * Hợp các đoạn của một dòng thành chuỗi có $...$.
 * Nếu `recognize` là null (mô hình công thức chưa sẵn sàng) thì dùng chữ Tesseract + sửa lỗi cơ bản.
 */
export async function lineToText(
  line: OcrLine,
  recognize: FormulaRecognizeFn | null,
  crop: CropFn,
  pad = 6,
): Promise<string> {
  const segments = segmentLine(line);
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.kind === 'text') {
      parts.push(seg.words.map((w) => w.text).join(' '));
    } else if (recognize) {
      parts.push(await recognizeSegment(seg, recognize, crop, pad));
    } else {
      parts.push(fallbackMath(seg.words.map((w) => w.text).join(' ')));
    }
  }
  return parts.join(' ').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Phân số, tích phân... hay bị Tesseract tách thành nhiều dòng ngắn (tử số, mẫu số).
 * Hàm này gộp các dòng ngắn nằm sát/chồng lên một dòng công thức vào dòng đó.
 */
export function mergeStackedFormulaLines(lines: OcrLine[]): OcrLine[] {
  const used = new Set<number>();
  const result: OcrLine[] = [];

  lines.forEach((line, i) => {
    if (used.has(i)) return;
    const segs = segmentLine(line);
    const hasMath = segs.some((s) => s.kind === 'math');
    let merged = line;

    if (hasMath) {
      const h = boxHeight(line.box);
      lines.forEach((other, j) => {
        if (j === i || used.has(j)) return;
        if (other.words.length > 4 || other.text.length > 14) return;        // chỉ gộp dòng ngắn
        // dòng ngắn phải toàn công thức/số/dấu phép toán
        if (!other.words.every((w) => !LABEL_LIKE.test(w.text) && (isStrongMathWord(w.text) || isWeakMathWord(w.text)))) return;
        const vGap = Math.max(other.box.y0 - merged.box.y1, merged.box.y0 - other.box.y1);
        const xOverlap = Math.min(other.box.x1, merged.box.x1) - Math.max(other.box.x0, merged.box.x0);
        if (vGap < h * 0.8 && xOverlap > 0) {
          used.add(j);
          merged = {
            text: merged.text,
            conf: Math.min(merged.conf, other.conf),
            box: unionBox([merged.box, other.box]),
            // Giữ các từ theo thứ tự trái -> phải để ghép chuỗi đúng
            words: [...merged.words, ...other.words].sort((a, b) => a.box.x0 - b.box.x0),
          };
        }
      });
    }
    result.push(merged);
  });
  return result;
}
