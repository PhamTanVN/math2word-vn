import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFormulaLatex, balanceBraces } from './latexClean.ts';

test('bỏ $...$ bao quanh và tách dấu chấm cuối', () => {
  const r = cleanFormulaLatex('$ x = \\frac{1}{2} . $');
  assert.equal(r.latex, 'x = \\frac{1}{2}');
  assert.equal(r.trailing, '.');
});

test('\\dfrac thành \\frac, bỏ \\displaystyle', () => {
  assert.equal(cleanFormulaLatex('\\displaystyle \\dfrac{a}{b}').latex, '\\frac{a}{b}');
});

test('cắt token lặp vô hạn của mô hình', () => {
  const r = cleanFormulaLatex('x ' + '+ 1 '.repeat(40));
  assert.ok(r.latex.length < 60, r.latex);
});

test('cân bằng ngoặc nhọn', () => {
  assert.equal(balanceBraces('\\frac{a}{b + \\sqrt{x'), '\\frac{a}{b + \\sqrt{x}}');
  assert.equal(balanceBraces('a}}b'), 'ab');
  assert.equal(balanceBraces('\\{1\\}'), '\\{1\\}');
});

test('chuỗi rỗng', () => {
  assert.deepEqual(cleanFormulaLatex('  '), { latex: '', trailing: '' });
});
