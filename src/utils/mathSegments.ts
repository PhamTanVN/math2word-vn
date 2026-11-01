/**
 * mathSegments.ts - Tách một đoạn văn có công thức ($...$) thành các phần "chữ" và "công thức",
 * để giao diện hiển thị từng công thức và cho phép bấm vào sửa riêng từng công thức.
 */

export interface Segment {
  type: 'text' | 'math';
  /** nội dung: với công thức là LaTeX không có dấu $ */
  value: string;
  /** vị trí trong chuỗi gốc (dùng để thay thế đúng chỗ) */
  start: number;
  end: number;
  display?: boolean;
}

const MATH_RE = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;

export function splitMathSegments(content: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MATH_RE.source, 'g');
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: content.slice(last, m.index), start: last, end: m.index });
    const raw = m[0];
    const display = raw.startsWith('$$');
    out.push({
      type: 'math',
      value: raw.replace(/^\$+|\$+$/g, '').trim(),
      start: m.index,
      end: m.index + raw.length,
      display,
    });
    last = m.index + raw.length;
  }
  if (last < content.length) out.push({ type: 'text', value: content.slice(last), start: last, end: content.length });
  return out;
}

/** Thay công thức tại segment bằng LaTeX mới. latex rỗng nghĩa là xoá công thức. */
export function replaceMathSegment(content: string, seg: Segment, latex: string): string {
  const clean = latex.trim();
  const wrapped = clean ? (seg.display ? `$$${clean}$$` : `$${clean}$`) : '';
  return content.slice(0, seg.start) + wrapped + content.slice(seg.end);
}

/** Chèn công thức mới vào vị trí con trỏ (hoặc thay phần đang bôi đen) */
export function insertMath(content: string, selStart: number, selEnd: number, latex: string): { text: string; cursor: number } {
  const clean = latex.trim();
  if (!clean) return { text: content, cursor: selStart };
  const before = content.slice(0, selStart);
  const after = content.slice(selEnd);
  // Thêm dấu cách để công thức không dính vào chữ
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const tail = after && !/^[\s.,;:)]/.test(after) ? ' ' : '';
  const piece = `${lead}$${clean}$${tail}`;
  return { text: before + piece + after, cursor: (before + piece).length };
}
