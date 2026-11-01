/**
 * mathSanitizer.ts
 * Autocorrects and repairs malformed LaTeX expressions, Vietnamese word-spacing,
 * and mathematical notation commonly found in Vietnamese math exam OCR.
 */

export interface ExtractedQuestionResult {
  cleanContent: string;
  extractedOptions?: { label: string; text: string }[];
}

/**
 * Chuẩn hóa khoảng trắng giữa chữ tiếng Việt và công thức $...$.
 *
 * Cách làm: tách chuỗi thành các đoạn "chữ" và "công thức" bằng cách GHÉP CẶP dấu $
 * (không xử lý từng dấu $ riêng lẻ, vì như vậy sẽ nhầm dấu mở với dấu đóng và
 * chèn dấu cách vào BÊN TRONG công thức, ví dụ "$ S.ABC $").
 *
 * Ví dụ: "hình chóp$S.ABC$có đáy" -> "hình chóp $S.ABC$ có đáy"
 */
export function normalizeVietnameseMathSpacing(text: string): string {
  if (!text) return '';

  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g);
  // Vì split có nhóm bắt (...), các phần tử lẻ (1, 3, 5...) chính là công thức.
  let res = '';
  parts.forEach((part, i) => {
    const isMath = i % 2 === 1;
    if (isMath) {
      // Cần dấu cách TRƯỚC công thức nếu ký tự liền trước là chữ/số
      if (/[A-Za-z0-9\u00C0-\u1EF9]$/u.test(res)) res += ' ';
      res += part;
    } else {
      // Cần dấu cách SAU công thức nếu đoạn chữ kế tiếp bắt đầu bằng chữ cái
      const afterMath = i > 0 && /^[A-Za-z\u00C0-\u1EF9]/u.test(part);
      res += (afterMath ? ' ' : '') + part;
    }
  });

  return res.replace(/ {2,}/g, ' ').trim();
}

/**
 * Unwraps common Vietnamese phrases that accidentally got caught inside math mode ($...$)
 * E.g. "$đường tròn (O)$" -> "đường tròn $(O)$"
 * E.g. "$thể tích V$" -> "thể tích $V$"
 */
export function fixWordsInsideMathMode(text: string): string {
  if (!text) return '';

  const VN_WORDS_PREFIX = [
    'đường tròn', 'hình chóp', 'tam giác', 'khối chóp', 'khối lăng trụ',
    'mặt phẳng', 'đồ thị', 'hàm số', 'tiệm cận đứng', 'tiệm cận ngang',
    'bảng biến thiên', 'thể tích', 'diện tích', 'góc giữa', 'khoảng cách',
    'tọa độ', 'vectơ', 'nghiệm của', 'tập nghiệm', 'giá trị lớn nhất', 'giá trị nhỏ nhất'
  ];

  let res = text;
  for (const prefix of VN_WORDS_PREFIX) {
    const reg = new RegExp(`\\$(${prefix})\\s*([A-Za-z0-9_\\^\\(\\)\\\\]+)\\$`, 'gi');
    res = res.replace(reg, (_m, p1, p2) => `${p1} $${p2}$`);
  }

  return res;
}

/**
 * Cân bằng dấu { } : bỏ } thừa, thêm } còn thiếu. \{ và \} (ngoặc nhọn hiển thị) không tính.
 */
export function balanceBraces(latex: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '\\') { out += ch + (latex[i + 1] ?? ''); i++; continue; }
    if (ch === '{') depth++;
    if (ch === '}') { if (depth === 0) continue; depth--; }
    out += ch;
  }
  return out + '}'.repeat(depth);
}

/** Cân bằng ngoặc nhọn trong từng đoạn $...$; nếu chuỗi không có $ thì coi cả chuỗi là công thức */
function balanceBracesInMath(text: string): string {
  if (!text.includes('$')) return balanceBraces(text);
  return text.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g, (seg) => {
    const fence = seg.startsWith('$$') ? '$$' : '$';
    return fence + balanceBraces(seg.slice(fence.length, seg.length - fence.length)) + fence;
  });
}

/**
 * Repairs broken LaTeX syntax (missing braces, broken widehat, missing backslashes)
 */
export function sanitizeMathString(text: string): string {
  if (!text) return '';

  let sanitized = text;

  // 1. Fix missing backslashes before unambiguous LaTeX math commands (not inside Vietnamese words like minh)
  const LONG_COMMANDS = 'widehat|widecheck|widetilde|frac|dfrac|sqrt|alpha|beta|gamma|delta|Delta|lambda|omega|infty|perp|parallel|triangle|overrightarrow|cdot';
  sanitized = sanitized.replace(new RegExp(`(^|[^\\\\a-zA-Z])(${LONG_COMMANDS})([{\\s_\\^]|$)`, 'g'), (_m, p1, p2, p3) => `${p1}\\${p2}${p3}`);

  // 2. Fix broken unclosed widehat like "widehat{IBD=widehat{ICA" or "\widehat{IBD=\widehat{ICA"
  sanitized = sanitized.replace(/\\?widehat\{([A-Za-z0-9]+)\s*=\s*\\?widehat\{([A-Za-z0-9]+)([\s,.;]|$)/g, '\\widehat{$1} = \\widehat{$2}$3');
  sanitized = sanitized.replace(/\\?widehat\{([A-Za-z0-9]+)\s*=\s*([^,}]+)/g, '\\widehat{$1} = $2');
  sanitized = sanitized.replace(/\\?widehat\{([A-Za-z0-9]+)(?![}\w])/g, '\\widehat{$1}');

  // 3. Cân bằng ngoặc nhọn { } (thiếu thì thêm, thừa thì bỏ) - CHỈ trong phần công thức.
  //    (Bản cũ dùng regex "(?!\})" làm hỏng cả công thức đúng như \sqrt{x^2+x+1}.)
  sanitized = balanceBracesInMath(sanitized);

  // 4. Fix segment multiplication dots: "IA·IB=IC·ID" or "IA.IB = IC.ID"
  sanitized = sanitized.replace(/([A-Z]{2})\s*[·•\.]\s*([A-Z]{2})\s*=\s*([A-Z]{2})\s*[·•\.]\s*([A-Z]{2})/g, (_m, a, b, c, d) => `$${a} \\cdot ${b} = ${c} \\cdot ${d}$`);
  sanitized = sanitized.replace(/([A-Z]{2})\s*[·•]\s*([A-Z]{2})/g, '$1 \\cdot $2');

  // 5. Fix standalone widehat equality without $
  sanitized = sanitized.replace(/(^|[^$])(\\widehat\{[A-Za-z0-9]+\}\s*=\s*\\widehat\{[A-Za-z0-9]+\})([^$]|$)/g, (_m, p1, p2, p3) => `${p1}$${p2}$${p3}`);

  // 6. Fix \mathbb{R} and common number sets
  sanitized = sanitized.replace(/\\?mathbb\s*R\b/g, '\\mathbb{R}');
  sanitized = sanitized.replace(/\\?mathbb\s*N\b/g, '\\mathbb{N}');
  sanitized = sanitized.replace(/\\?mathbb\s*Z\b/g, '\\mathbb{Z}');

  // 7. Clean consecutive duplicate $ signs
  sanitized = sanitized.replace(/\${3,}/g, '$$');
  sanitized = sanitized.replace(/\$\s+\$/g, ' ');

  // 8. Normalize spacing and remove accidental Vietnamese words in math mode
  sanitized = fixWordsInsideMathMode(sanitized);
  sanitized = normalizeVietnameseMathSpacing(sanitized);

  return sanitized;
}

/**
 * Extracts options (A, B, C, D) if they are embedded inside question content string
 */
export function extractEmbeddedOptions(content: string): ExtractedQuestionResult {
  if (!content) return { cleanContent: '' };

  // Look for options pattern like "A. ... B. ... C. ... D. ..."
  const optionRegex = /(?:\n|\s|^)([A-D])[\.\)]\s+([\s\S]+?)(?=(?:\n|\s|^)[A-D][\.\)]|\s*$)/g;
  const matches = [...content.matchAll(optionRegex)];

  // Check if we found at least 3 choices A, B, C (or all 4 A, B, C, D)
  const labels = matches.map(m => m[1]);
  const hasOptions = labels.includes('A') && labels.includes('B') && labels.includes('C');

  if (hasOptions && matches.length >= 3) {
    const firstOptionIndex = content.search(/(?:\n|\s|^)A[\.\)]\s+/);
    const cleanContent = firstOptionIndex > 0 ? content.slice(0, firstOptionIndex).trim() : content;

    const extractedOptions = matches.map(m => ({
      label: m[1],
      text: sanitizeMathString(m[2].trim()),
    }));

    return {
      cleanContent: sanitizeMathString(cleanContent),
      extractedOptions,
    };
  }

  return {
    cleanContent: sanitizeMathString(content),
  };
}

/**
 * Full sanitizer for a question
 */
export function sanitizeQuestionContent(content: string): string {
  if (!content) return '';

  let result = sanitizeMathString(content);

  // If there are unescaped single segments with dot like IA \cdot IB that are not wrapped in $, wrap them
  result = result.replace(/([A-Z]{2}\s*\\cdot\s*[A-Z]{2})/g, (match, _p1, offset, full) => {
    const before = full.slice(0, offset);
    const numDollars = (before.match(/\$/g) || []).length;
    if (numDollars % 2 === 1) return match;
    return `$${match}$`;
  });

  return result;
}
