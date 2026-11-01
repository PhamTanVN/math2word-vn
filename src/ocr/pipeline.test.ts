import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizePages, guessMeta, PipelinePage } from './pipeline.ts';
import type { OcrLine } from './types.ts';

const line = (text: string, y: number): OcrLine => ({
  text, conf: 90,
  box: { x0: 20, y0: y, x1: 20 + text.length * 10, y1: y + 22 },
  words: text.split(' ').map((t, i) => ({ text: t, conf: 90, box: { x0: 20 + i * 70, y0: y, x1: 20 + i * 70 + 60, y1: y + 22 } })),
});

test('pipeline: từ dòng OCR giả đến danh sách câu hỏi có đáp án và công thức', async () => {
  const page: PipelinePage = {
    width: 800, height: 1000, ocrInput: null,
    gray: new Uint8ClampedArray(800 * 1000).fill(255),
    crop: async () => new Blob(['x']),
    cropOriginalDataUrl: () => 'data:image/png;base64,AAAA',
  };
  const lines = [
    line('SỞ GIÁO DỤC VÀ ĐÀO TẠO', 10),
    line('Câu 1. Cho tam giác ABC vuông tại A', 60),
    line('A. 1 B. 2 C. 3 D. 4', 100),
    line('Câu 2. Tính x = 2', 160),
  ];
  const res = await recognizePages([page], {
    textOcr: { recognize: async () => lines },
    recognizeFormula: async () => 'ABC',
  });
  assert.equal(res.questions.length, 2);
  assert.equal(res.questions[0].options?.length, 4);
  assert.ok(res.questions[0].content.includes('$ABC$'));
  assert.equal(res.meta.schoolName, 'SỞ GIÁO DỤC VÀ ĐÀO TẠO');
});

test('pipeline: dừng khi người dùng huỷ', async () => {
  const page: PipelinePage = { width: 10, height: 10, ocrInput: null, gray: new Uint8ClampedArray(100), crop: async () => new Blob(), cropOriginalDataUrl: () => '' };
  await assert.rejects(recognizePages([page], { textOcr: { recognize: async () => [] }, recognizeFormula: null, shouldCancel: () => true }));
});

test('guessMeta', () => {
  const m = guessMeta(['SỞ GIÁO DỤC VÀ ĐÀO TẠO HẢI PHÒNG', 'ĐỀ KHẢO SÁT CHẤT LƯỢNG', 'Thời gian làm bài: 90 phút']);
  assert.ok(m.schoolName && m.title && m.duration);
});
