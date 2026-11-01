import test from 'node:test';
import assert from 'node:assert/strict';
import { OcrLine, OcrWord } from './types.ts';
import { isStrongMathWord, segmentLine, lineToText, mergeStackedFormulaLines, splitAttachedLabels, detectLabelWords } from './mathRuns.ts';

/** Tạo dòng OCR giả: mỗi từ rộng 50px, cách nhau 10px */
function makeLine(text: string, y = 0, x0 = 0): OcrLine {
  const words: OcrWord[] = text.split(' ').map((t, i) => ({
    text: t, conf: 90, box: { x0: x0 + i * 60, y0: y, x1: x0 + i * 60 + 50, y1: y + 20 },
  }));
  return { text, conf: 90, words, box: { x0, y0: y, x1: x0 + words.length * 60, y1: y + 20 } };
}
const fakeCrop = async () => new Blob(['x']);

test('nhận biết từ công thức', () => {
  for (const w of ['=', 'ABC', 'S.ABC', 'x', '2x', '(O)', '√2', 'a^3', '\\int']) assert.ok(isStrongMathWord(w), w);
  for (const w of ['hình', 'chóp', 'Cho', 'tam', 'giác', 'vuông']) assert.ok(!isStrongMathWord(w), w);
});

test('chia dòng: chữ xen công thức', () => {
  const segs = segmentLine(makeLine('Cho hình chóp S.ABC có đáy ABC là tam giác vuông'));
  const kinds = segs.map((s) => s.kind + ':' + s.words.map((w) => w.text).join(' '));
  assert.deepEqual(kinds, [
    'text:Cho hình chóp', 'math:S.ABC', 'text:có đáy', 'math:ABC', 'text:là tam giác vuông',
  ]);
});

test('số đứng sát công thức được hút vào: AB = 3', () => {
  const segs = segmentLine(makeLine('Biết AB = 3 và SA vuông góc'));
  assert.equal(segs.find((s) => s.kind === 'math')!.words.map((w) => w.text).join(' '), 'AB = 3');
});

test('số đứng giữa chữ thì giữ là chữ: "50 câu"', () => {
  const segs = segmentLine(makeLine('Đề gồm 50 câu trắc nghiệm'));
  assert.ok(segs.every((s) => s.kind === 'text'));
});

test('tiêu đề viết hoa không bị coi là công thức', () => {
  const segs = segmentLine(makeLine('SỞ GIÁO DỤC VÀ ĐÀO TẠO'));
  assert.ok(segs.every((s) => s.kind === 'text'));
});

test('nhãn A. và "Câu 1." không nằm trong công thức', () => {
  const s1 = segmentLine(makeLine('A. V = 3'));
  assert.equal(s1[0].kind, 'text');
  assert.equal(s1[0].words[0].text, 'A.');
  const s2 = segmentLine(makeLine('Câu 1. Cho x = 2'));
  assert.equal(s2[0].kind, 'text');
  assert.equal(s2[0].words.map((w) => w.text).join(' '), 'Câu 1. Cho');
});

test('lineToText gọi mô hình công thức và đặt dấu câu ngoài $', async () => {
  const recognize = async () => '\\frac{1}{2} .';
  const out = await lineToText(makeLine('Tính giá trị của biểu thức x = 1'), recognize, fakeCrop);
  assert.ok(out.startsWith('Tính giá trị của biểu thức $'), out);
  assert.ok(out.includes('$\\frac{1}{2}$.'), out);
});

test('không có mô hình công thức: vẫn ra $...$ từ chữ OCR', async () => {
  const out = await lineToText(makeLine('Cho tam giác ABC vuông tại A'), null, fakeCrop);
  assert.ok(out.includes('$ABC$'), out);
});

test('mô hình lỗi: dùng chữ OCR dự phòng, không sập', async () => {
  const out = await lineToText(makeLine('Biết x = 2 thì'), async () => { throw new Error('boom'); }, fakeCrop);
  assert.ok(out.includes('$x = 2$'), out);
});

test('gộp tử số/mẫu số bị tách thành dòng riêng', () => {
  const main = makeLine('V = a^3', 100, 0);
  const denom = makeLine('6', 124, 60); // nằm ngay dưới, chồng theo chiều ngang
  const para = makeLine('Tính thể tích của khối chóp đã cho', 300, 0);
  const merged = mergeStackedFormulaLines([main, denom, para]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].words.length, 4);
});

test('tách nhãn đáp án bị Tesseract dính liền: A.45 B.9', async () => {
  const words = splitAttachedLabels(makeLine('A.45 B.9 C.-3 D.ABC').words);
  assert.deepEqual(words.map((w) => w.text), ['A.', '45', 'B.', '9', 'C.', '-3', 'D.ABC']);
  const out = await lineToText(makeLine('A.45 B.9 C.3 D.6'), null, fakeCrop);
  assert.ok(/^A\. ?45 B\. ?9 C\. ?3 D\. ?6$/.test(out), out);
});

test('nhánh dự phòng: dấu chấm cuối nằm ngoài $', async () => {
  const out = await lineToText(makeLine('Cho AB = 3.'), null, fakeCrop);
  assert.ok(out.includes('$AB = 3$.'), out);
});

test('nhãn bị đọc nhầm dấu (B, C;) vẫn là nhãn khi đúng thứ tự A-B-C-D', async () => {
  const flags = detectLabelWords(makeLine('A. 5 B, 7 C; 6 D. 4').words);
  assert.deepEqual(flags, [true, false, true, false, true, false, true, false]);
  const out = await lineToText(makeLine('A. 5 B, 7 C; 6 D. 4'), null, fakeCrop);
  assert.ok(/^A\. 5 B, 7 C; 6 D\. 4$/.test(out), out);
});

test('"tại điểm A." cuối câu vẫn là tên điểm (công thức), không phải nhãn', async () => {
  const out = await lineToText(makeLine('Cho tam giác ABC vuông tại A.'), null, fakeCrop);
  assert.ok(out.includes('$A$'), out);
});

test('tách nhãn dính: (A)5, a)x, D.ln3', () => {
  const w = splitAttachedLabels(makeLine('(A)5 a)x D.ln3 A.BC').words);
  assert.deepEqual(w.map((x) => x.text), ['(A)', '5', 'a)', 'x', 'D.', 'ln3', 'A.BC']);
});
