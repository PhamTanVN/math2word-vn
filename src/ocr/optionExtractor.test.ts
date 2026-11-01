import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOptions } from './optionExtractor.ts';

const texts = (r: ReturnType<typeof extractOptions>) => r.options.map((o) => `${o.label}=${o.text}`);

test('mỗi đáp án một dòng', () => {
  const r = extractOptions('Cho hàm số $y = x^2$. Giá trị nhỏ nhất là\nA. $0$\nB. $1$\nC. $2$\nD. $3$');
  assert.equal(r.stem, 'Cho hàm số $y = x^2$. Giá trị nhỏ nhất là');
  assert.deepEqual(texts(r), ['A=$0$', 'B=$1$', 'C=$2$', 'D=$3$']);
  assert.deepEqual(r.missing, []);
});

test('bố cục 2x2 (hai đáp án trên một dòng)', () => {
  const r = extractOptions('Tính giá trị\nA. 5 B. 7\nC. 6 D. 4');
  assert.deepEqual(texts(r), ['A=5', 'B=7', 'C=6', 'D=4']);
});

test('cả bốn đáp án trên một dòng', () => {
  const r = extractOptions('Tính $\\int_0^1 x dx$ bằng\nA. $\\frac{1}{2}$ B. $1$ C. $2$ D. $0$');
  assert.equal(r.options.length, 4);
  assert.equal(r.options[0].text, '$\\frac{1}{2}$');
});

test('nhãn dính liền giá trị: A.45 B.9', () => {
  const r = extractOptions('Thể tích bằng\nA.45 B.9 C.3 D.6');
  assert.deepEqual(texts(r), ['A=45', 'B=9', 'C=3', 'D=6']);
});

test('OCR đọc nhầm dấu: A, B; C. D)', () => {
  const r = extractOptions('Chọn đáp án đúng\nA, 5\nB; 7\nC. 6\nD) 4');
  assert.deepEqual(texts(r), ['A=5', 'B=7', 'C=6', 'D=4']);
});

test('OCR đọc nhầm chữ: 4. 8. C. 0. (A->4, B->8, D->0)', () => {
  const r = extractOptions('Chọn đáp án đúng\n4. 5\n8. 7\nC. 6\n0. 4');
  assert.deepEqual(r.options.map((o) => o.label), ['A', 'B', 'C', 'D']);
  assert.deepEqual(r.options.map((o) => o.text), ['5', '7', '6', '4']);
});

test('Đ. được hiểu là D.', () => {
  const r = extractOptions('Chọn\nA. 1\nB. 2\nC. 3\nĐ. 4');
  assert.deepEqual(r.options.map((o) => o.label), ['A', 'B', 'C', 'D']);
});

test('nhãn trong ngoặc (A) (B) (C) (D)', () => {
  const r = extractOptions('Chọn\n(A) 5 (B) 7 (C) 6 (D) 4');
  assert.deepEqual(texts(r), ['A=5', 'B=7', 'C=6', 'D=4']);
});

test('chữ thường a. b. c. d. vẫn nhận thành A-D? không: nhận a) b) c) d) là kiểu câu đúng/sai', () => {
  const r = extractOptions('Xét các mệnh đề sau\na) Hàm số đồng biến\nb) Hàm số có cực trị\nc) Đồ thị có tiệm cận\nd) Giá trị lớn nhất bằng 2');
  assert.equal(r.style, 'lower');
  assert.deepEqual(r.options.map((o) => o.label), ['a', 'b', 'c', 'd']);
  assert.equal(r.options[1].text, 'Hàm số có cực trị');
});

test('điểm A. trong đề bài KHÔNG bị cắt thành đáp án (lỗi cũ)', () => {
  const r = extractOptions('Cho tam giác ABC vuông tại A. Biết AB = 3, AC = 4. Tính BC.\nA. 5\nB. 7\nC. 6\nD. 4');
  assert.equal(r.stem, 'Cho tam giác ABC vuông tại A. Biết AB = 3, AC = 4. Tính BC.');
  assert.deepEqual(texts(r), ['A=5', 'B=7', 'C=6', 'D=4']);
});

test('tên điểm A. B. trong đề: lấy đúng chuỗi A-B-C-D ở cuối', () => {
  const r = extractOptions('Trên đường thẳng lấy các điểm A. B. rồi nối. Tính độ dài\nA. 1\nB. 2\nC. 3\nD. 4');
  assert.equal(r.options.length, 4);
  assert.equal(r.options[0].text, '1');
  assert.ok(r.stem.includes('điểm A. B.'));
});

test('thiếu đáp án D: vẫn nhận A, B, C và báo thiếu D', () => {
  const r = extractOptions('Chọn\nA. 1\nB. 2\nC. 3');
  assert.equal(r.options.length, 3);
  assert.deepEqual(r.missing, ['D']);
});

test('nhận B, C, D khi A bị mất, báo thiếu A', () => {
  const r = extractOptions('Chọn\nxx 1\nB. 2\nC. 3\nD. 4');
  assert.deepEqual(r.options.map((o) => o.label), ['B', 'C', 'D']);
  assert.deepEqual(r.missing, ['A']);
});

test('đáp án nhiều dòng (xuống dòng giữa chừng)', () => {
  const r = extractOptions('Chọn\nA. Hàm số đồng biến\ntrên khoảng đã cho\nB. Hàm số nghịch biến\nC. Có cực đại\nD. Không có cực trị');
  assert.equal(r.options[0].text, 'Hàm số đồng biến trên khoảng đã cho');
  assert.equal(r.options.length, 4);
});

test('nhãn nằm trong công thức $...$ không bị nhận nhầm', () => {
  const r = extractOptions('Cho $A.B$ và $C. D$ bằng nhau, chọn\nA. 1\nB. 2\nC. 3\nD. 4');
  assert.deepEqual(r.options.map((o) => o.text), ['1', '2', '3', '4']);
});

test('số thập phân 4.5 / 8.2 không bị coi là nhãn', () => {
  const r = extractOptions('Chọn\nA. 4.5\nB. 8.2\nC. 6.1\nD. 0.5');
  assert.deepEqual(r.options.map((o) => o.text), ['4.5', '8.2', '6.1', '0.5']);
  assert.deepEqual(r.options.map((o) => o.label), ['A', 'B', 'C', 'D']);
});

test('làm sạch dấu cuối đáp án', () => {
  const r = extractOptions('Chọn\nA. $x = 1$;\nB. $x = 2$;\nC. $x = 3$;\nD. $x = 4$.');
  assert.deepEqual(r.options.map((o) => o.text), ['$x = 1$', '$x = 2$', '$x = 3$', '$x = 4$']);
});

test('không có đáp án: trả về nguyên đề bài', () => {
  const r = extractOptions('Chứng minh rằng $a + b \\ge 2\\sqrt{ab}$ với mọi $a, b > 0$.');
  assert.equal(r.options.length, 0);
  assert.ok(r.stem.startsWith('Chứng minh'));
});

test('một nhãn A. lẻ loi trong đề không tạo đáp án', () => {
  const r = extractOptions('Cho điểm A. Tính khoảng cách từ A đến mặt phẳng.');
  assert.equal(r.options.length, 0);
});

test('"Cho bốn điểm A, B, C, D" không bị coi là đáp án', () => {
  const r = extractOptions('Cho bốn điểm A, B, C, D trong không gian. Tính thể tích khối tứ diện.');
  assert.equal(r.options.length, 0);
  const r2 = extractOptions('A, B, C, D là bốn đỉnh của hình vuông. Tính diện tích.');
  assert.equal(r2.options.length, 0);
});

test('"a, b, c > 0" là biến, không phải nhãn thường', () => {
  const r = extractOptions('Cho a, b, c > 0 thỏa mãn điều kiện. Chứng minh bất đẳng thức.');
  assert.equal(r.options.length, 0);
  const r2 = extractOptions('a. b. c. d. là gì');
  assert.equal(r2.options.length, 0);
});
