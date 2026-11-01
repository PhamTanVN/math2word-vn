/**
 * latexClean.ts - Làm sạch LaTeX do mô hình nhận dạng công thức trả về.
 * Mô hình đôi khi thêm $...$, lặp token vô hạn, thiếu ngoặc... Hàm ở đây sửa các lỗi đó.
 */

import { balanceBraces as balance } from '../utils/mathSanitizer.ts';

export interface CleanedFormula {
  latex: string;
  /** dấu câu cuối (. , ;) tách ra để đặt NGOÀI công thức */
  trailing: string;
}

const STRIP_WRAPPERS: [RegExp, string][] = [
  [/^\$\$([\s\S]*)\$\$$/, '$1'],
  [/^\$([\s\S]*)\$$/, '$1'],
  [/^\\\[([\s\S]*)\\\]$/, '$1'],
  [/^\\\(([\s\S]*)\\\)$/, '$1'],
  [/^\\begin\{(?:equation|displaymath)\*?\}([\s\S]*)\\end\{(?:equation|displaymath)\*?\}$/, '$1'],
];

/**
 * Cắt bớt khi một cụm token (dài 1-4 token) bị lặp lại quá 6 lần liên tiếp
 * (lỗi "lặp vô hạn" thường gặp của mô hình sinh chuỗi).
 */
function collapseRepetition(latex: string): string {
  let tokens = latex.split(/\s+/);
  for (let period = 1; period <= 4; period++) {
    let i = 0;
    while (i + period <= tokens.length) {
      let reps = 1;
      while (
        i + (reps + 1) * period <= tokens.length &&
        tokens.slice(i, i + period).join(' ') === tokens.slice(i + reps * period, i + (reps + 1) * period).join(' ')
      ) reps++;
      if (reps > 6) {
        tokens = [...tokens.slice(0, i + 6 * period), ...tokens.slice(i + reps * period)];
        i += 6 * period;
      } else {
        i += 1;
      }
    }
  }
  return tokens.join(' ');
}

export { balanceBraces } from '../utils/mathSanitizer.ts';

export function cleanFormulaLatex(raw: string): CleanedFormula {
  let s = (raw ?? '').trim();
  if (!s) return { latex: '', trailing: '' };

  for (let i = 0; i < 2; i++) {
    for (const [re, rep] of STRIP_WRAPPERS) s = s.replace(re, rep).trim();
  }

  s = collapseRepetition(s)
    .replace(/\\displaystyle|\\textstyle|\\scriptstyle/g, '')
    .replace(/\\(?:d|t|c)frac\b/g, '\\frac')
    .replace(/\\left\s*\.\s*/g, '')
    .replace(/\\right\s*\.\s*/g, '')
    .replace(/\\(?:big|Big|bigg|Bigg)[lr]?(?![a-zA-Z])/g, '')
    .replace(/\\(?:mathrm|operatorname)\s*\{\s*d\s*\}/g, 'd')
    .replace(/\\hspace\*?\{[^}]*\}/g, ' ')
    .replace(/\\(?:quad|qquad)\b/g, ' ')
    .replace(/\\[,;:!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Dấu câu ở cuối thuộc về câu văn, không thuộc công thức
  let trailing = '';
  const m = /\s*([.,;]+)\s*$/.exec(s);
  if (m) { trailing = m[1]; s = s.slice(0, m.index).trim(); }

  s = balance(s);
  return { latex: s, trailing };
}
