/**
 * examSegmenter.ts
 * ------------------------------------------------------------
 * Nhận danh sách dòng chữ (đã có $công thức$) của một hay nhiều trang,
 * tách thành từng câu hỏi: "Câu 1.", "Bài 2:" ... và các đáp án A. B. C. D.
 */
import { Box, boxCenterY } from './types.ts';
import { sanitizeQuestionContent } from '../utils/mathSanitizer.ts';
import { extractOptions, optionWarnings } from './optionExtractor.ts';

export interface PageLine {
  text: string;
  box: Box;
  /** số thứ tự trang/ảnh (bắt đầu từ 0) */
  page: number;
}

export interface RawQuestion {
  /** ví dụ "Câu 1" */
  questionNumber: string;
  content: string;
  options: { label: string; text: string }[];
  /** cảnh báo cho người dùng, ví dụ thiếu đáp án D */
  warnings: string[];
  lines: PageLine[];
}

export interface SegmentResult {
  /** các dòng đứng trước "Câu 1" (tên trường, tiêu đề đề thi...) */
  header: PageLine[];
  questions: RawQuestion[];
}

const QUESTION_START = /^\s*(Câu|Bài|Cau|Bai)\s*(\d+)\s*[.:)\-–]?\s*/i;

export function segmentQuestions(lines: PageLine[]): SegmentResult {
  const header: PageLine[] = [];
  const groups: { number: string; lines: PageLine[] }[] = [];

  for (const line of lines) {
    const m = QUESTION_START.exec(line.text);
    if (m) {
      groups.push({ number: `Câu ${m[2]}`, lines: [{ ...line, text: line.text.slice(m[0].length) }] });
    } else if (groups.length > 0) {
      groups[groups.length - 1].lines.push(line);
    } else {
      header.push(line);
    }
  }

  // Không thấy chữ "Câu n" nào: coi toàn bộ là một câu để người dùng tự chia
  if (groups.length === 0 && header.length > 0) {
    return { header: [], questions: [buildQuestion('Câu 1', header)] };
  }

  return { header, questions: groups.map((g) => buildQuestion(g.number, g.lines)) };
}

function buildQuestion(number: string, lines: PageLine[]): RawQuestion {
  const body = lines.map((l) => l.text).join('\n');
  const extracted = extractOptions(body);
  return {
    questionNumber: number,
    content: sanitizeQuestionContent(extracted.stem).trim(),
    options: extracted.options,
    warnings: optionWarnings(extracted.options),
    lines,
  };
}

/**
 * Gán mỗi hình vẽ cho câu hỏi gần nhất theo chiều dọc (trên cùng một trang).
 * Trả về mảng: figureIndex -> chỉ số câu hỏi (hoặc -1 nếu không gán được).
 */
export function assignFiguresToQuestions(
  questions: RawQuestion[],
  figures: { page: number; box: Box }[],
): number[] {
  return figures.map((fig) => {
    let best = -1;
    let bestDist = Infinity;
    questions.forEach((q, qi) => {
      const onPage = q.lines.filter((l) => l.page === fig.page);
      if (onPage.length === 0) return;
      const top = Math.min(...onPage.map((l) => l.box.y0));
      const bottom = Math.max(...onPage.map((l) => l.box.y1));
      const cy = boxCenterY(fig.box);
      // Khoảng cách 0 nếu tâm hình nằm trong vùng của câu hỏi
      const dist = cy >= top && cy <= bottom ? 0 : Math.min(Math.abs(cy - top), Math.abs(cy - bottom));
      if (dist < bestDist) { bestDist = dist; best = qi; }
    });
    return best;
  });
}
