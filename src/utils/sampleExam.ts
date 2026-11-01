/** Đề mẫu để thử nhanh (không cần ảnh). */
import type { ExamDocumentData } from './docxExporter.ts';

export const SAMPLE_EXAM_DATA: ExamDocumentData = {
  title: 'ĐỀ KHẢO SÁT CHẤT LƯỢNG TOÁN 12 - THPT',
  schoolName: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO - TỔ TOÁN',
  duration: '90 phút (50 câu trắc nghiệm)',
  questions: [
    {
      id: 'sample-1',
      questionNumber: 'Câu 1',
      topic: 'Hình học không gian',
      content: 'Cho hình chóp $S.ABC$ có đáy $ABC$ là tam giác vuông cân tại $B$, $AB = a$. Cạnh bên $SA$ vuông góc với mặt phẳng đáy và $SA = a\\sqrt{2}$. Tính thể tích $V$ của khối chóp $S.ABC$.',
      options: [
        { label: 'A', text: '$V = \\frac{a^3\\sqrt{2}}{6}$' },
        { label: 'B', text: '$V = \\frac{a^3\\sqrt{2}}{3}$' },
        { label: 'C', text: '$V = \\frac{a^3}{3}$' },
        { label: 'D', text: '$V = a^3\\sqrt{2}$' }
      ],
      diagram: {
        id: 'sample-diag-1',
        caption: 'Hình minh họa Câu 1',
        // A clean generated geometry diagram of pyramid S.ABC
        base64Image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 240" width="300" height="240"><rect width="300" height="240" fill="white"/><polygon points="150,30 50,190 250,190" fill="none" stroke="%23334155" stroke-width="2"/><line x1="150" y1="30" x2="160" y2="150" stroke="%23334155" stroke-width="1.5" stroke-dasharray="4,4"/><line x1="50" y1="190" x2="160" y2="150" stroke="%23334155" stroke-width="1.5" stroke-dasharray="4,4"/><line x1="250" y1="190" x2="160" y2="150" stroke="%23334155" stroke-width="1.5" stroke-dasharray="4,4"/><line x1="150" y1="30" x2="50" y2="190" stroke="%231e293b" stroke-width="2.5"/><text x="145" y="24" font-family="serif" font-size="16" font-weight="bold">S</text><text x="32" y="200" font-family="serif" font-size="16" font-weight="bold">A</text><text x="258" y="200" font-family="serif" font-size="16" font-weight="bold">C</text><text x="165" y="145" font-family="serif" font-size="16" font-weight="bold">B</text></svg>',
        width: 300,
        height: 240,
        box2d: [100, 600, 350, 950]
      }
    },
    {
      id: 'sample-2',
      questionNumber: 'Câu 2',
      topic: 'Khảo sát hàm số',
      content: 'Cho hàm số $y = f(x)$ xác định trên $\\mathbb{R} \\setminus \\{1\\}$ và có bảng biến thiên như hình vẽ. Đường tiệm cận đứng và tiệm cận ngang của đồ thị hàm số lần lượt là:',
      options: [
        { label: 'A', text: '$x = 1$ và $y = 2$' },
        { label: 'B', text: '$x = 2$ và $y = 1$' },
        { label: 'C', text: '$x = 1$ và $y = -1$' },
        { label: 'D', text: '$x = -1$ và $y = 2$' }
      ],
      diagram: {
        id: 'sample-diag-2',
        caption: 'Bảng biến thiên Câu 2',
        base64Image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 160" width="360" height="160"><rect width="360" height="160" fill="white" stroke="%2394a3b8"/><line x1="50" y1="0" x2="50" y2="160" stroke="%2364748b" stroke-width="1.5"/><line x1="0" y1="40" x2="360" y2="40" stroke="%2364748b" stroke-width="1.5"/><line x1="0" y1="80" x2="360" y2="80" stroke="%2364748b" stroke-width="1.5"/><text x="20" y="26" font-family="sans-serif" font-size="14" font-weight="bold">x</text><text x="70" y="26" font-family="sans-serif" font-size="13">-∞</text><text x="190" y="26" font-family="sans-serif" font-size="13">1</text><text x="310" y="26" font-family="sans-serif" font-size="13">+∞</text><text x="18" y="66" font-family="sans-serif" font-size="14" font-weight="bold">y\'</text><text x="120" y="66" font-family="sans-serif" font-size="16" font-weight="bold">-</text><text x="250" y="66" font-family="sans-serif" font-size="16" font-weight="bold">-</text><text x="18" y="125" font-family="sans-serif" font-size="14" font-weight="bold">y</text><line x1="188" y1="40" x2="188" y2="160" stroke="%23e11d48" stroke-width="2"/><line x1="192" y1="40" x2="192" y2="160" stroke="%23e11d48" stroke-width="2"/><text x="70" y="105" font-family="sans-serif" font-size="13">2</text><text x="165" y="145" font-family="sans-serif" font-size="13">-∞</text><text x="210" y="105" font-family="sans-serif" font-size="13">+∞</text><text x="320" y="145" font-family="sans-serif" font-size="13">2</text></svg>',
        width: 360,
        height: 160,
        box2d: [380, 550, 600, 950]
      }
    },
    {
      id: 'sample-3',
      questionNumber: 'Câu 3',
      topic: 'Giải tích - Tích phân',
      content: 'Tính tích phân $I = \\int_0^1 \\frac{2x + 1}{\\sqrt{x^2 + x + 1}} \\, dx$. Đặt $t = \\sqrt{x^2 + x + 1}$, mệnh đề nào dưới đây đúng?',
      options: [
        { label: 'A', text: '$I = 2\\int_1^{\\sqrt{3}} dt = 2(\\sqrt{3} - 1)$' },
        { label: 'B', text: '$I = \\int_1^{\\sqrt{3}} dt = \\sqrt{3} - 1$' },
        { label: 'C', text: '$I = \\int_0^1 t \\, dt = \\frac{1}{2}$' },
        { label: 'D', text: '$I = 2\\int_1^3 \\frac{dt}{t} = 2\\ln 3$' }
      ]
    },
    {
      id: 'sample-4',
      questionNumber: 'Câu 4',
      topic: 'Phương trình mũ - logarit',
      content: 'Tập nghiệm $S$ của bất phương trình $3^{2x+1} - 10 \\cdot 3^x + 3 \\le 0$ là:',
      options: [
        { label: 'A', text: '$S = [-1; 1]$' },
        { label: 'B', text: '$S = (-\\infty; -1] \\cup [1; +\\infty)$' },
        { label: 'C', text: '$S = [\\frac{1}{3}; 3]$' },
        { label: 'D', text: '$S = (-1; 1)$' }
      ]
    },
    {
      id: 'sample-5',
      questionNumber: 'Bài 13',
      topic: 'Hình học phẳng - Đường tròn',
      content: 'Cho điểm $I$ nằm ngoài đường tròn $(O)$. Qua $I$ kẻ hai đường thẳng lần lượt cắt $(O)$ tại bốn điểm $A, B$ và $C, D$ sao cho $A$ nằm giữa $B$ và $I$, $C$ nằm giữa $D$ và $I$. Chứng minh rằng $\\widehat{IBD} = \\widehat{ICA}$, $\\widehat{IAC} = \\widehat{IDB}$ và $IA \\cdot IB = IC \\cdot ID$.',
      diagram: {
        id: 'sample-diag-13',
        caption: 'Hình vẽ Bài 13 - Cát tuyến đường tròn (O)',
        base64Image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" width="320" height="220"><rect width="320" height="220" fill="white"/><circle cx="200" cy="110" r="75" fill="none" stroke="%23334155" stroke-width="2"/><circle cx="200" cy="110" r="3" fill="%23334155"/><text x="205" y="105" font-family="serif" font-size="14" font-weight="bold">O</text><circle cx="30" cy="110" r="3.5" fill="%234f46e5"/><text x="18" y="115" font-family="serif" font-size="15" font-weight="bold" fill="%234f46e5">I</text><line x1="30" y1="110" x2="270" y2="70" stroke="%23334155" stroke-width="1.8"/><line x1="30" y1="110" x2="270" y2="150" stroke="%23334155" stroke-width="1.8"/><circle cx="132" cy="86" r="3" fill="%23334155"/><text x="122" y="78" font-family="serif" font-size="14" font-weight="bold">A</text><circle cx="268" cy="70" r="3" fill="%23334155"/><text x="274" y="68" font-family="serif" font-size="14" font-weight="bold">B</text><circle cx="132" cy="134" r="3" fill="%23334155"/><text x="122" y="152" font-family="serif" font-size="14" font-weight="bold">C</text><circle cx="268" cy="150" r="3" fill="%23334155"/><text x="274" y="162" font-family="serif" font-size="14" font-weight="bold">D</text><line x1="132" y1="86" x2="132" y2="134" stroke="%23059669" stroke-width="1.5" stroke-dasharray="3,3"/><line x1="268" y1="70" x2="268" y2="150" stroke="%23059669" stroke-width="1.5" stroke-dasharray="3,3"/><line x1="132" y1="134" x2="268" y2="70" stroke="%23dc2626" stroke-width="1.2" stroke-dasharray="2,2"/><line x1="132" y1="86" x2="268" y2="150" stroke="%23dc2626" stroke-width="1.2" stroke-dasharray="2,2"/></svg>',
        width: 320,
        height: 220,
      }
    }
  ]
};
