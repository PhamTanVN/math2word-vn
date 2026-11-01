import test from 'node:test';
import assert from 'node:assert/strict';
import type { Box, OcrLine } from './types.ts';
import { recoverMissingOptionLabels } from './optionRecovery.ts';

/** Dòng giả: danh sách [chữ, x] ở độ cao y (mỗi từ rộng 40, cao 24) */
function line(y: number, ...items: [string, number][]): OcrLine {
  const words = items.map(([text, x]) => ({ text, conf: 90, box: { x0: x, y0: y, x1: x + 40, y1: y + 24 } }));
  return { text: items.map((i) => i[0]).join(' '), conf: 90, box: { x0: items[0][1], y0: y, x1: items[items.length - 1][1] + 40, y1: y + 24 }, words };
}

function spy(reply: OcrLine[]) {
  const calls: Box[] = [];
  return { calls, read: async (b: Box) => { calls.push(b); return reply; } };
}

test('dòng A. B. C. thiếu D: đọc lại bên phải và ghép D vào', async () => {
  const s = spy([line(100, ['D.4', 1080])]);
  const lines = [line(100, ['A.5', 50], ['B.7', 390], ['C.6', 730]), line(300, ['Câu', 50], ['5.', 110])];
  const out = await recoverMissingOptionLabels(lines, 1500, s.read);
  assert.equal(s.calls.length, 1);
  assert.ok(s.calls[0].x0 > 730 && s.calls[0].x1 === 1498, 'vùng đọc lại nằm bên phải từ cuối cùng');
  // từ mới ghép được tách nhãn: "D.4" -> "D." + "4"
  assert.deepEqual(out[0].words.map((w) => w.text), ['A.5', 'B.7', 'C.6', 'D.', '4']);
  assert.ok(out[0].box.x1 >= 1100);
});

test('đáp án xuống dòng đã tiếp nối đúng nhãn: KHÔNG đọc lại', async () => {
  const s = spy([]);
  const lines = [line(100, ['A.', 50], ['5', 90]), line(150, ['B.', 50], ['7', 90]), line(200, ['C.', 50], ['6', 90]), line(250, ['D.', 50], ['4', 90])];
  await recoverMissingOptionLabels(lines, 1500, s.read);
  assert.equal(s.calls.length, 0);
});

test('bố cục 2x2 đủ: KHÔNG đọc lại', async () => {
  const s = spy([]);
  const lines = [line(100, ['A.', 50], ['5', 90], ['B.', 600], ['7', 640]), line(160, ['C.', 50], ['6', 90], ['D.', 600], ['4', 640])];
  await recoverMissingOptionLabels(lines, 1500, s.read);
  assert.equal(s.calls.length, 0);
});

test('dòng đã đủ A B C D: KHÔNG đọc lại', async () => {
  const s = spy([]);
  await recoverMissingOptionLabels([line(100, ['A.', 50], ['B.', 300], ['C.', 550], ['D.', 800])], 1500, s.read);
  assert.equal(s.calls.length, 0);
});

test('kết quả đọc lại là rác (không có nhãn đúng): không ghép', async () => {
  const s = spy([line(100, ['xyz', 1080])]);
  const lines = [line(100, ['A.5', 50], ['B.7', 390], ['C.6', 730])];
  const out = await recoverMissingOptionLabels(lines, 1500, s.read);
  assert.equal(out[0].words.length, 3);
});

test('thiếu cả C và D: đọc lại và ghép cả hai', async () => {
  const s = spy([line(100, ['C.6', 740], ['D.4', 1080])]);
  const out = await recoverMissingOptionLabels([line(100, ['A.5', 50], ['B.7', 390])], 1500, s.read);
  assert.deepEqual(out[0].words.map((w) => w.text), ['A.5', 'B.7', 'C.', '6', 'D.', '4']);
});

test('lỗi khi đọc lại không làm sập', async () => {
  const out = await recoverMissingOptionLabels([line(100, ['A.5', 50], ['B.7', 390], ['C.6', 730])], 1500, async () => { throw new Error('boom'); });
  assert.equal(out[0].words.length, 3);
});

test('dòng không có nhãn: không làm gì', async () => {
  const s = spy([]);
  await recoverMissingOptionLabels([line(100, ['Cho', 50], ['tam', 120], ['giác', 190])], 1500, s.read);
  assert.equal(s.calls.length, 0);
});
