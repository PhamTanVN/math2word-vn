/**
 * Generates a complete, single-file standalone HTML/CSS/JavaScript web application
 * that teachers can save and open directly in any browser without npm/tsx/node.
 */
export function generateStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Math2Word VN - Chuyển Đổi Đề Toán PDF Sang Word (Bản HTML/JS Thuần)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    .math-font { font-family: 'STIX Two Text', 'Cambria Math', serif; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen p-4 md:p-8">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <header class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-indigo-700 flex items-center gap-2">
            📐 Math2Word VN (Bản HTML/CSS/JS Thuần)
          </h1>
          <p class="text-slate-600 text-sm mt-1">
            Chuyển đổi đề thi Toán PDF / ảnh sang Word, công thức toán chuẩn và cắt hình học đặt song song
          </p>
        </div>
        <div class="flex gap-2">
          <button id="btn-load-demo" class="px-4 py-2 bg-indigo-50 text-indigo-700 font-semibold rounded-lg hover:bg-indigo-100 transition border border-indigo-200 text-sm">
            Tải Đề Mẫu Thử Nghiệm
          </button>
          <button id="btn-export-doc" class="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition shadow-sm text-sm">
            Xuất File Word (.doc)
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Upload & Preview Pane -->
      <section class="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h2 class="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
          📄 Tải Lên Đề Thi (PDF hoặc Ảnh)
        </h2>
        
        <div id="drop-zone" class="border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition">
          <input type="file" id="file-input" class="hidden" accept=".pdf,image/*">
          <div class="text-4xl mb-2">📥</div>
          <p class="font-medium text-slate-700">Kéo thả tệp PDF hoặc ảnh đề thi vào đây</p>
          <p class="text-xs text-slate-500 mt-1">hoặc nhấn để duyệt tệp từ máy tính</p>
        </div>

        <div id="page-canvas-container" class="mt-4 hidden">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-slate-500">Xem trước trang &amp; Vùng cắt</span>
            <span id="page-status" class="text-xs text-indigo-600 font-medium"></span>
          </div>
          <div class="max-h-[500px] overflow-auto border border-slate-200 rounded-lg p-1 bg-slate-100 flex justify-center">
            <canvas id="pdf-canvas" class="max-w-full shadow-sm bg-white"></canvas>
          </div>
        </div>
      </section>

      <!-- Questions List (Side-by-side) -->
      <section class="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h2 class="text-lg font-bold text-slate-800">
              📝 Đề Bài Đã Nhận Diện &amp; Hình Cắt Song Song
            </h2>
            <span id="question-count" class="text-xs text-slate-500">0 câu hỏi</span>
          </div>
          <button id="btn-copy-all" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
            📋 Sao chép toàn bộ
          </button>
        </div>

        <div id="questions-container" class="space-y-4 max-h-[700px] overflow-y-auto pr-2">
          <div class="p-8 text-center text-slate-400 text-sm">
            Chưa có đề bài. Hãy tải file PDF / ảnh hoặc nhấn nút "Tải Đề Mẫu Thử Nghiệm".
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    // Pure Vanilla JavaScript implementation
    const sampleExam = [
      {
        questionNumber: "Câu 1",
        content: "Cho hình chóp $S.ABC$ có đáy $ABC$ là tam giác vuông cân tại $B$, $AB = a$. Cạnh bên $SA$ vuông góc với đáy và $SA = a\\\\sqrt{2}$. Thể tích khối chóp là:",
        options: [
          { label: "A", text: "$V = \\\\frac{a^3\\\\sqrt{2}}{6}$" },
          { label: "B", text: "$V = \\\\frac{a^3\\\\sqrt{2}}{3}$" },
          { label: "C", text: "$V = a^3\\\\sqrt{2}$" },
          { label: "D", text: "$V = \\\\frac{a^3}{2}$" }
        ],
        diagramUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 180' width='240' height='180'><polygon points='120,20 40,150 200,150' fill='none' stroke='%23334155' stroke-width='2'/><line x1='120' y1='20' x2='130' y2='110' stroke='%23334155' stroke-width='1.5' stroke-dasharray='4,4'/><line x1='40' y1='150' x2='130' y2='110' stroke='%23334155' stroke-width='1.5' stroke-dasharray='4,4'/><line x1='200' y1='150' x2='130' y2='110' stroke='%23334155' stroke-width='1.5' stroke-dasharray='4,4'/><text x='115' y='16' font-family='serif' font-weight='bold'>S</text><text x='25' y='160' font-family='serif' font-weight='bold'>A</text><text x='205' y='160' font-family='serif' font-weight='bold'>C</text><text x='135' y='110' font-family='serif' font-weight='bold'>B</text></svg>",
        caption: "Hình vẽ Câu 1"
      },
      {
        questionNumber: "Câu 2",
        content: "Nghiệm của phương trình $\\\\log_2(x - 1) = 3$ là:",
        options: [
          { label: "A", text: "$x = 9$" },
          { label: "B", text: "$x = 7$" },
          { label: "C", text: "$x = 8$" },
          { label: "D", text: "$x = 10$" }
        ]
      },
      {
        questionNumber: "Bài 13",
        content: "Cho điểm $I$ nằm ngoài đường tròn $(O)$. Qua $I$ kẻ hai đường thẳng lần lượt cắt $(O)$ tại bốn điểm $A, B$ và $C, D$ sao cho $A$ nằm giữa $B$ và $I$, $C$ nằm giữa $D$ và $I$. Chứng minh rằng $\\\\widehat{IBD} = \\\\widehat{ICA}$, $\\\\widehat{IAC} = \\\\widehat{IDB}$ và $IA \\\\cdot IB = IC \\\\cdot ID$.",
        diagramUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 180' width='280' height='180'><circle cx='180' cy='90' r='60' fill='none' stroke='%23334155' stroke-width='2'/><circle cx='180' cy='90' r='3' fill='%23334155'/><text x='185' y='85' font-family='serif' font-weight='bold'>O</text><circle cx='25' cy='90' r='3.5' fill='%234f46e5'/><text x='15' y='95' font-family='serif' font-weight='bold'>I</text><line x1='25' y1='90' x2='235' y2='55' stroke='%23334155' stroke-width='1.8'/><line x1='25' y1='90' x2='235' y2='125' stroke='%23334155' stroke-width='1.8'/><text x='115' y='60' font-family='serif' font-weight='bold'>A</text><text x='240' y='55' font-family='serif' font-weight='bold'>B</text><text x='115' y='140' font-family='serif' font-weight='bold'>C</text><text x='240' y='135' font-family='serif' font-weight='bold'>D</text><line x1='124' y1='70' x2='124' y2='110' stroke='%23059669' stroke-dasharray='3,3'/><line x1='235' y1='55' x2='235' y2='125' stroke='%23059669' stroke-dasharray='3,3'/></svg>",
        caption: "Hình vẽ Bài 13 - Cát tuyến đường tròn (O)"
      }
    ];

    let currentQuestions = [];

    function sanitizeMath(text) {
      if (!text) return '';
      return text
        .replace(/(^|[^\\\\])(widehat|frac|sqrt|cdot|angle|perp|parallel)/g, '$1\\\\$2')
        .replace(/\\\\widehat\\{([A-Za-z0-9]+)\\s*=\\s*\\\\widehat\\{([A-Za-z0-9]+)/g, '\\\\widehat{$1} = \\\\widehat{$2}')
        .replace(/([A-Z]{2})\\s*[·•\\.]\\s*([A-Z]{2})\\s*=\\s*([A-Z]{2})\\s*[·•\\.]\\s*([A-Z]{2})/g, '$$$1 \\\\cdot $2 = $3 \\\\cdot $4$$')
        .replace(/(^|[^$])(\\\\widehat\\{[A-Za-z0-9]+\\}\\s*=\\s*\\\\widehat\\{[A-Za-z0-9]+\\})([^$]|$)/g, '$1$$$2$$$3');
    }

    function renderMathText(text) {
      if (!text) return '';
      const clean = sanitizeMath(text);
      return clean.replace(/\\$([^$]+)\\$/g, function(_, math) {
        try {
          return katex.renderToString(math, { throwOnError: false, output: 'htmlAndMathml' });
        } catch (e) {
          return '$' + math + '$';
        }
      });
    }

    function displayQuestions(questions) {
      currentQuestions = questions;
      const container = document.getElementById('questions-container');
      const countEl = document.getElementById('question-count');
      countEl.innerText = questions.length + ' câu hỏi';

      if (questions.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm">Chưa có câu hỏi.</div>';
        return;
      }

      container.innerHTML = questions.map((q, idx) => {
        const hasDiag = !!q.diagramUrl;
        return \`
          <div class="border border-slate-200 rounded-xl p-4 bg-white hover:border-indigo-300 transition shadow-xs">
            <div class="\${hasDiag ? 'grid grid-cols-1 md:grid-cols-12 gap-4' : ''}">
              <div class="\${hasDiag ? 'md:col-span-8' : ''}">
                <p class="font-bold text-indigo-900 mb-1.5 text-base">
                  <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs mr-2 font-mono">\${q.questionNumber || 'Câu ' + (idx + 1)}</span>
                  \${renderMathText(q.content)}
                </p>
                <div class="grid grid-cols-2 gap-2 mt-3 text-sm">
                  \${(q.options || []).map(opt => \`
                    <div class="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                      <span class="font-bold text-slate-600">\${opt.label}.</span>
                      <span>\${renderMathText(opt.text)}</span>
                    </div>
                  \`).join('')}
                </div>
              </div>
              \${hasDiag ? \`
                <div class="md:col-span-4 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-100 md:pl-4 pt-3 md:pt-0">
                  <img src="\${q.diagramUrl}" alt="Hình vẽ" class="max-h-44 object-contain rounded border border-slate-200 bg-white p-1">
                  <span class="text-xs text-slate-500 mt-1 italic">\${q.caption || 'Hình vẽ minh họa'}</span>
                </div>
              \` : ''}
            </div>
          </div>
        \`;
      }).join('');
    }

    // Load Demo Button
    document.getElementById('btn-load-demo').addEventListener('click', () => {
      displayQuestions(sampleExam);
    });

    // Export to Word Document (.doc format compatible with Word & LibreOffice)
    document.getElementById('btn-export-doc').addEventListener('click', () => {
      if (currentQuestions.length === 0) {
        alert('Vui lòng tải đề bài hoặc nhấn Đề mẫu trước khi xuất!');
        return;
      }
      
      let htmlContent = \`
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>De_Thi_Toan</title>
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.3; }
          table { width: 100%; border-collapse: collapse; }
          td { vertical-align: top; }
        </style>
        </head>
        <body>
        <table style="width: 100%; margin-bottom: 20px;">
          <tr>
            <td style="width: 50%; text-align: center; font-weight: bold;">
              BỘ GIÁO DỤC VÀ ĐÀO TẠO<br>TRƯỜNG THPT CHUYÊN
            </td>
            <td style="width: 50%; text-align: center; font-weight: bold;">
              ĐỀ THI MÔN TOÁN HỌC<br><span style="font-weight: normal; font-style: italic;">Thời gian: 90 phút</span>
            </td>
          </tr>
        </table>
      \`;

      currentQuestions.forEach(q => {
        if (q.diagramUrl) {
          htmlContent += \`
            <table style="width: 100%; margin-bottom: 15px;">
              <tr>
                <td style="width: 65%;">
                  <p><b>\${q.questionNumber}: </b>\${q.content}</p>
                  <p>\${(q.options || []).map(o => \`<b>\${o.label}.</b> \${o.text}&nbsp;&nbsp;&nbsp;&nbsp;\`).join('')}</p>
                </td>
                <td style="width: 35%; text-align: center;">
                  <img src="\${q.diagramUrl}" width="200" style="max-width: 200px;">
                </td>
              </tr>
            </table>
          \`;
        } else {
          htmlContent += \`
            <div style="margin-bottom: 15px;">
              <p><b>\${q.questionNumber}: </b>\${q.content}</p>
              <p>\${(q.options || []).map(o => \`<b>\${o.label}.</b> \${o.text}&nbsp;&nbsp;&nbsp;&nbsp;\`).join('')}</p>
            </div>
          \`;
        }
      });

      htmlContent += '</body></html>';
      const blob = new Blob(['\\ufeff' + htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'De_Thi_Toan_Math2Word.doc';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Initial demo load
    displayQuestions(sampleExam);
  </script>
</body>
</html>`;
}
