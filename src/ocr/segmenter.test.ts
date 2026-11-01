import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentQuestions, assignFiguresToQuestions, PageLine } from './examSegmenter.ts';
import { detectFigures } from './diagramDetector.ts';

const L = (text: string, y: number, page = 0): PageLine => ({ text, page, box: { x0: 10, y0: y, x1: 500, y1: y + 20 } });

test('tách câu hỏi và đáp án nằm trên từng dòng', () => {
  const r = segmentQuestions([
    L('SỞ GIÁO DỤC VÀ ĐÀO TẠO', 0),
    L('Câu 1. Cho hàm số $y = x^2$. Giá trị nhỏ nhất là', 40),
    L('A. $0$', 60), L('B. $1$', 80), L('C. $2$', 100), L('D. $3$', 120),
    L('Câu 2: Tính $\\int_0^1 x dx$ bằng', 160),
    L('A. $\\frac{1}{2}$ B. $1$ C. $2$ D. $0$', 180),
  ]);
  assert.equal(r.header.length, 1);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].questionNumber, 'Câu 1');
  assert.equal(r.questions[0].options.length, 4);
  assert.equal(r.questions[0].options[1].text, '$1$');
  assert.ok(r.questions[0].content.startsWith('Cho hàm số'));
  assert.equal(r.questions[1].options.length, 4, 'đáp án cùng một dòng cũng tách được');
});

test('câu hỏi kéo dài sang trang sau', () => {
  const r = segmentQuestions([L('Câu 5. Cho hình chóp $S.ABC$', 700, 0), L('có đáy là tam giác đều. Tính thể tích.', 20, 1)]);
  assert.equal(r.questions.length, 1);
  assert.ok(r.questions[0].content.includes('có đáy là tam giác đều'));
});

test('không có chữ "Câu": gom thành một câu', () => {
  const r = segmentQuestions([L('Tính $1 + 1$', 0), L('rồi nhân 2', 20)]);
  assert.equal(r.questions.length, 1);
});

test('gán hình cho câu hỏi gần nhất trên cùng trang', () => {
  const r = segmentQuestions([L('Câu 1. Xét hình', 100), L('A. 1 B. 2 C. 3 D. 4', 140), L('Câu 2. Khác', 400)]);
  const idx = assignFiguresToQuestions(r.questions, [
    { page: 0, box: { x0: 0, y0: 200, x1: 100, y1: 300 } },   // gần Câu 1 (kết thúc ở y=160)... và Câu 2 bắt đầu y=400
  ]);
  assert.equal(idx[0], 0);
});

/** Tạo ảnh xám trắng và vẽ hình chữ nhật đen rỗng (khung) */
function page(w: number, h: number) {
  const g = new Uint8ClampedArray(w * h).fill(255);
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = x0; x <= x1; x++) { g[y0 * w + x] = 0; g[y1 * w + x] = 0; }
    for (let y = y0; y <= y1; y++) { g[y * w + x0] = 0; g[y * w + x1] = 0; }
  };
  return { g, rect };
}

test('dò hình vẽ: tìm khung hình, bỏ qua vùng chữ', () => {
  const { g, rect } = page(700, 900);
  rect(400, 300, 600, 450);                       // hình vẽ
  for (let y = 100; y < 112; y++) for (let x = 50; x < 600; x++) g[y * 700 + x] = 0;   // một dòng chữ (khối đen)
  const figs = detectFigures(g, 700, 900, [{ x0: 40, y0: 95, x1: 610, y1: 118 }]);
  assert.equal(figs.length, 1);
  assert.ok(figs[0].x0 <= 400 && figs[0].x1 >= 600 && figs[0].y0 <= 300 && figs[0].y1 >= 450);
});

test('dò hình vẽ: bỏ nét vụn và đường kẻ ngang mảnh', () => {
  const { g } = page(700, 900);
  for (let x = 20; x < 680; x++) g[600 * 700 + x] = 0;   // đường kẻ ngang
  g[200 * 700 + 200] = 0;                                  // chấm nhỏ
  assert.equal(detectFigures(g, 700, 900, []).length, 0);
});
