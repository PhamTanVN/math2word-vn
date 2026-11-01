import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExamDocx, formatMixedContentToDocxRuns } from './docxExporter.ts';

test('formatMixedContentToDocxRuns splits text and LaTeX formulas', () => {
  const text = 'Cho hàm số $y = \\frac{2x+1}{x-1}$ có đồ thị $(C)$.';
  const runs = formatMixedContentToDocxRuns(text);
  assert.ok(runs.length >= 3, 'Should have text and math runs');
});

test('buildExamDocx builds valid docx buffer with side-by-side diagram', async () => {
  // 1x1 transparent png base64
  const mockPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const docBuffer = await buildExamDocx({
    title: 'ĐỀ THI THỬ TỐT NGHIỆP THPT TOÁN',
    schoolName: 'TRƯỜNG THPT CHUYÊN HÀ NỘI - AMSTERDAM',
    duration: '90 phút',
    questions: [
      {
        id: 'q1',
        questionNumber: 'Câu 1',
        content: 'Cho khối chóp $S.ABC$ có đáy $ABC$ là tam giác vuông tại $B$, $SA \\perp (ABC)$. Tính thể tích khối chóp.',
        options: [
          { label: 'A', text: '$V = \\frac{a^3\\sqrt{3}}{6}$' },
          { label: 'B', text: '$V = \\frac{a^3\\sqrt{3}}{3}$' },
          { label: 'C', text: '$V = a^3\\sqrt{3}$' },
          { label: 'D', text: '$V = \\frac{a^3}{2}$' },
        ],
        diagram: {
          id: 'diag-1',
          base64Image: mockPngBase64,
          caption: 'Hình 1',
          width: 100,
          height: 100,
        },
      },
      {
        id: 'q2',
        questionNumber: 'Câu 2',
        content: 'Nghiệm của phương trình $\\log_2(x - 1) = 3$ là:',
        options: [
          { label: 'A', text: '$x = 9$' },
          { label: 'B', text: '$x = 7$' },
          { label: 'C', text: '$x = 8$' },
          { label: 'D', text: '$x = 10$' },
        ],
      },
    ],
  });

  assert.ok(docBuffer.length > 5000, 'Document buffer should be generated');
});
