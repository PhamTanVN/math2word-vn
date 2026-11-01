/**
 * optionExtractor.ts
 * ------------------------------------------------------------
 * Tách phần ĐỀ BÀI và các ĐÁP ÁN (A. B. C. D.) từ văn bản một câu hỏi.
 *
 * Ý tưởng chính: không tin mọi chỗ có "A." là đáp án. Ta tìm TẤT CẢ chỗ "có thể là nhãn"
 * rồi chọn ra CHUỖI nhãn hợp lý nhất theo thứ tự A -> B -> C -> D (quy hoạch động):
 *   - Điểm "A." nằm trong đề bài (ví dụ "cho điểm A.") sẽ bị loại vì sau nó không có B, C, D hợp lệ.
 *   - Chịu được lỗi OCR: A đọc thành 4, B thành 8, D thành 0/O/Đ, dấu "." đọc thành "," ";" ...
 *   - Nhận nhiều kiểu bố cục: mỗi đáp án một dòng, 2x2, cả 4 đáp án trên một dòng, "(A)", "a)".
 *   - Thiếu đáp án nào thì báo lại để giao diện nhắc người dùng kiểm tra.
 */
import { sanitizeMathString } from '../utils/mathSanitizer.ts';

export interface ExtractedOption {
  label: string;
  text: string;
}

export interface ExtractedOptions {
  /** phần đề bài (đã bỏ các đáp án) */
  stem: string;
  options: ExtractedOption[];
  /** các nhãn không tìm thấy, ví dụ ['D'] */
  missing: string[];
  /** 'upper' = A. B. C. D.   'lower' = a) b) c) d) (câu đúng/sai) */
  style: 'upper' | 'lower';
}

const UPPER = ['A', 'B', 'C', 'D'];
const LOWER = ['a', 'b', 'c', 'd'];

/** Ký tự có thể là nhãn: [thứ tự 0..3, độ tin cậy, có phải chữ số/O dễ nhầm không] */
const LABEL_CHARS: Record<string, { k: number; score: number; lookalike?: boolean; lower?: boolean }> = {
  A: { k: 0, score: 1 }, B: { k: 1, score: 1 }, C: { k: 2, score: 1 }, D: { k: 3, score: 1 },
  a: { k: 0, score: 0.8, lower: true }, b: { k: 1, score: 0.8, lower: true },
  c: { k: 2, score: 0.8, lower: true }, d: { k: 3, score: 0.8, lower: true },
  // Tesseract tiếng Việt hay thêm dấu / đọc nhầm
  À: { k: 0, score: 0.7 }, Á: { k: 0, score: 0.7 }, Ả: { k: 0, score: 0.7 }, Ã: { k: 0, score: 0.7 },
  Ạ: { k: 0, score: 0.7 }, Ă: { k: 0, score: 0.7 }, Â: { k: 0, score: 0.7 },
  Đ: { k: 3, score: 0.7 }, Ð: { k: 3, score: 0.7 },
  // Chữ số / chữ O đọc nhầm (chỉ được chọn nếu giúp hoàn thiện chuỗi A-D)
  '4': { k: 0, score: 0.45, lookalike: true },
  '8': { k: 1, score: 0.45, lookalike: true },
  '0': { k: 3, score: 0.45, lookalike: true },
  O: { k: 3, score: 0.5, lookalike: true },
};

/** Dấu đứng sau nhãn và độ tin cậy của nó */
const DELIMS: Record<string, number> = { '.': 1, ')': 1, ':': 0.9, ']': 0.8, ',': 0.7, ';': 0.7 };

interface Candidate {
  start: number; // vị trí bắt đầu nhãn (gồm dấu "(" nếu có)
  end: number; // vị trí ngay sau dấu kết thúc nhãn
  k: number; // 0..3
  score: number;
  char: string;
}

/** Thay nội dung $...$ bằng ký tự \u0000 (giữ nguyên độ dài) để không nhận nhầm nhãn nằm trong công thức */
function maskMath(text: string): string {
  return text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g, (m) => '\u0000'.repeat(m.length));
}

const isBoundary = (ch: string | undefined) => ch === undefined || ch === '' || /\s/.test(ch) || ch === '\u0000';

function findCandidates(masked: string): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    const info = LABEL_CHARS[ch];
    if (!info) continue;

    // Phải đứng đầu từ: sau khoảng trắng / đầu chuỗi / hết công thức (có thể có "(" ở trước)
    let start = i;
    let hasParen = false;
    if (masked[i - 1] === '(') {
      hasParen = true;
      start = i - 1;
      if (!isBoundary(masked[start - 1]) && masked[start - 1] !== '[') continue;
    } else if (!isBoundary(masked[i - 1])) {
      continue;
    }

    const delim = masked[i + 1];
    if (!delim || !(delim in DELIMS)) continue;
    if (hasParen && delim !== ')') continue;

    // Ký tự ngay sau nhãn: khoảng trắng / hết / công thức / số, dấu âm, ngoặc, căn, chữ thường.
    // Chữ HOA đứng liền sau (A.BC) là tên điểm/đoạn, không phải nhãn. Số thập phân (4.5) cũng loại.
    const after = masked[i + 2];
    const spaceAfter = after === undefined || /\s/.test(after) || after === '\u0000';
    const attachedOk = after !== undefined && /[\\\d\-−(√a-zà-ỹ]/u.test(after);
    if (!(spaceAfter || (!info.lookalike && attachedOk))) continue;

    const atLineStart = start === 0 || masked[start - 1] === '\n';

    // Chữ thường (a) b) c) d)) chỉ nhận khi có dấu ")": "a, b, c > 0" là biến, không phải nhãn
    if (info.lower && delim !== ')') continue;
    // Dấu "," ";" thường là OCR đọc nhầm dấu chấm, nhưng "Cho bốn điểm A, B, C, D" cũng giống vậy.
    // Vì thế chỉ nhận khi nhãn đứng ĐẦU DÒNG.
    if ((delim === ',' || delim === ';') && !atLineStart) continue;

    let score = info.score * DELIMS[delim];
    // đứng đầu dòng thì đáng tin hơn
    if (atLineStart) score += 0.3;

    out.push({ start, end: i + 2, k: info.k, score, char: ch });
  }
  return out;
}

/** Chọn chuỗi nhãn tốt nhất (quy hoạch động). Trả về chỉ số các ứng viên đã chọn. */
function chooseBestChain(c: Candidate[]): number[] {
  const n = c.length;
  if (n === 0) return [];

  const GAP_PENALTY = 0.6; // mỗi nhãn bị bỏ qua giữa chuỗi
  const LEAD_PENALTY = 0.6; // mỗi nhãn đầu bị thiếu (chuỗi không bắt đầu từ A)
  const TAIL_PENALTY = 0.35; // mỗi nhãn cuối bị thiếu (chuỗi không kết thúc ở D)

  const best = new Array<number>(n).fill(-Infinity);
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    best[i] = c[i].score - LEAD_PENALTY * c[i].k;
    for (let j = 0; j < i; j++) {
      if (c[j].k >= c[i].k || c[j].end > c[i].start) continue;
      const v = best[j] + c[i].score - GAP_PENALTY * (c[i].k - c[j].k - 1);
      if (v > best[i]) { best[i] = v; prev[i] = j; }
    }
  }

  let bestEnd = -1;
  let bestTotal = -Infinity;
  for (let i = 0; i < n; i++) {
    const total = best[i] - TAIL_PENALTY * (3 - c[i].k);
    if (total >= bestTotal) { bestTotal = total; bestEnd = i; } // ">=": nếu hoà, lấy chuỗi nằm sau cùng
  }

  const chain: number[] = [];
  for (let i = bestEnd; i !== -1; i = prev[i]) chain.unshift(i);
  return chain;
}

/** Làm sạch nội dung một đáp án */
function cleanOptionText(raw: string): string {
  let t = raw.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/[;,]+$/, '').trim();
  // dấu chấm cuối câu (không phải "..." hay số thập phân dở dang)
  if (/[^.\d]\.$/.test(t) || /\$\.$/.test(t)) t = t.slice(0, -1).trim();
  return sanitizeMathString(t);
}

export function extractOptions(text: string): ExtractedOptions {
  const empty: ExtractedOptions = { stem: text.replace(/\s*\n\s*/g, ' ').trim(), options: [], missing: [], style: 'upper' };
  if (!text) return empty;

  const masked = maskMath(text);
  const candidates = findCandidates(masked);
  const chainIdx = chooseBestChain(candidates);
  const chain = chainIdx.map((i) => candidates[i]);

  // Điều kiện chấp nhận: từ 3 nhãn trở lên; hoặc 2 nhãn nhưng cả hai đều chắc chắn và đứng đầu dòng
  const strong = chain.filter((x) => x.score >= 1.2).length;
  if (chain.length < 3 && !(chain.length === 2 && strong === 2)) return empty;

  const lowerCount = chain.filter((x) => x.char >= 'a' && x.char <= 'd').length;
  const style: 'upper' | 'lower' = lowerCount > chain.length / 2 ? 'lower' : 'upper';
  const labels = style === 'lower' ? LOWER : UPPER;

  const options: ExtractedOption[] = chain.map((cand, i) => {
    const endOfText = i + 1 < chain.length ? chain[i + 1].start : text.length;
    return { label: labels[cand.k], text: cleanOptionText(text.slice(cand.end, endOfText)) };
  });

  const found = new Set(chain.map((x) => x.k));
  const missing = labels.filter((_, k) => !found.has(k));

  return {
    stem: text.slice(0, chain[0].start).replace(/\s*\n\s*/g, ' ').trim(),
    options,
    missing,
    style,
  };
}

/**
 * Cảnh báo cho một danh sách đáp án (dùng cả khi người dùng sửa tay):
 * thiếu nhãn nào trong A-D (hoặc a-d), hoặc có đáp án trống.
 */
export function optionWarnings(options: { label: string; text: string }[] | undefined): string[] {
  if (!options || options.length === 0) return [];
  const lower = options[0].label === options[0].label.toLowerCase();
  const all = lower ? LOWER : UPPER;
  const have = new Set(options.map((o) => o.label));
  const missing = all.filter((l) => !have.has(l));
  const warnings: string[] = [];
  if (missing.length > 0) warnings.push(`Thiếu đáp án ${missing.join(', ')}: hãy đối chiếu với ảnh gốc`);
  const empty = options.filter((o) => !o.text.trim()).map((o) => o.label);
  if (empty.length > 0) warnings.push(`Đáp án ${empty.join(', ')} đang trống`);
  return warnings;
}
