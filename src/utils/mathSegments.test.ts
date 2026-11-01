import test from 'node:test';
import assert from 'node:assert/strict';
import { splitMathSegments, replaceMathSegment, insertMath } from './mathSegments.ts';

test('tách chữ và công thức', () => {
  const s = splitMathSegments('Cho $x = 1$ và $$y = 2$$ nhé');
  assert.deepEqual(s.map((x) => [x.type, x.value]), [
    ['text', 'Cho '], ['math', 'x = 1'], ['text', ' và '], ['math', 'y = 2'], ['text', ' nhé'],
  ]);
  assert.equal(s[3].display, true);
});

test('thay đúng công thức thứ hai, giữ nguyên phần còn lại', () => {
  const text = 'a $x$ b $x$ c';
  const segs = splitMathSegments(text).filter((x) => x.type === 'math');
  assert.equal(replaceMathSegment(text, segs[1], '\\frac{1}{2}'), 'a $x$ b $\\frac{1}{2}$ c');
});

test('xoá công thức khi LaTeX rỗng', () => {
  const text = 'a $x$ b';
  assert.equal(replaceMathSegment(text, splitMathSegments(text)[1], ''), 'a  b');
});

test('chèn công thức tại con trỏ, thêm dấu cách', () => {
  const r = insertMath('Tính giá trị', 5, 5, 'x^2');
  assert.equal(r.text, 'Tính $x^2$ giá trị'.replace('Tính ', 'Tính ').replace(' giá', ' giá'));
});
