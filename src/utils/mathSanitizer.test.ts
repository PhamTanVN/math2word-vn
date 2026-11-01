import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeMathString,
  sanitizeQuestionContent,
  normalizeVietnameseMathSpacing,
  fixWordsInsideMathMode,
  extractEmbeddedOptions,
} from './mathSanitizer.ts';

test('sanitizeMathString fixes broken widehat and missing backslash', () => {
  const brokenInput = 'Chứng minh rằng widehat{IBD=widehat{ICA, widehat{IAC=widehat{IDB và IA·IB=IC·ID.';
  const cleaned = sanitizeQuestionContent(brokenInput);

  assert.ok(cleaned.includes(String.raw`\widehat{IBD} = \widehat{ICA}`), 'Should repair widehat{IBD=widehat{ICA');
  assert.ok(cleaned.includes(String.raw`\widehat{IAC} = \widehat{IDB}`), 'Should repair widehat{IAC=widehat{IDB');
  assert.ok(cleaned.includes(String.raw`IA \cdot IB = IC \cdot ID`), 'Should convert dot product to cdot');
});

test('sanitizeQuestionContent correctly wraps equations into math mode', () => {
  const input = 'Bài 13: Cho điểm I. Chứng minh widehat{IBD=widehat{ICA và IA·IB=IC·ID.';
  const sanitized = sanitizeQuestionContent(input);
  assert.ok(sanitized.includes('$\\widehat{IBD} = \\widehat{ICA}$'));
  assert.ok(sanitized.includes('$IA \\cdot IB = IC \\cdot ID$'));
});

test('normalizeVietnameseMathSpacing adds spaces around $ math markers', () => {
  const unspaced = 'Cho hình chóp$S.ABC$có đáy$ABC$vuông tại$B$';
  const spaced = normalizeVietnameseMathSpacing(unspaced);
  assert.ok(spaced.includes('hình chóp $S.ABC$ có đáy $ABC$ vuông tại $B$'));
});

test('fixWordsInsideMathMode unrolls Vietnamese words trapped in $...$', () => {
  const trapped = 'Cho $đường tròn (O)$ và $thể tích V$';
  const fixed = fixWordsInsideMathMode(trapped);
  assert.ok(fixed.includes('đường tròn $(O)$'));
  assert.ok(fixed.includes('thể tích $V$'));
});

test('extractEmbeddedOptions extracts A, B, C, D choices from question content', () => {
  const contentWithOptions = 'Nghiệm của phương trình log2(x - 1) = 3 là:\nA. x = 9\nB. x = 7\nC. x = 8\nD. x = 10';
  const result = extractEmbeddedOptions(contentWithOptions);

  assert.ok(result.extractedOptions, 'Should have extracted choices');
  assert.equal(result.extractedOptions?.length, 4);
  assert.equal(result.extractedOptions?.[0]?.label, 'A');
  assert.equal(result.extractedOptions?.[0]?.text, 'x = 9');
  assert.ok(result.cleanContent.startsWith('Nghiệm của phương trình'));
});

test('KHÔNG làm hỏng công thức đúng có \\sqrt{...} và \\frac{...}{...} (lỗi cũ)', () => {
  const good = [
    '$t = \\sqrt{x^2 + x + 1}$',
    '$I = \\int_0^1 \\frac{2x + 1}{\\sqrt{x^2 + x + 1}} \\, dx$',
    '$V = \\frac{a^3\\sqrt{2}}{6}$',
    '$\\widehat{IBD} = \\widehat{ICA}$',
  ];
  for (const f of good) {
    assert.equal(sanitizeQuestionContent(f), f, f);
  }
});

test('vẫn sửa được công thức thiếu ngoặc đóng', () => {
  assert.equal(sanitizeQuestionContent('$\\frac{a}{b + \\sqrt{x$'), '$\\frac{a}{b + \\sqrt{x}}$');
  assert.equal(sanitizeQuestionContent('$\\sqrt{x}}$'), '$\\sqrt{x}$');
});

test('chuỗi OCR không có $ cũng được cân bằng ngoặc', () => {
  assert.equal(sanitizeMathString('\\frac{1}{2'), '\\frac{1}{2}');
});
