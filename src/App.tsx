/**
 * Math2Word VN - Chuyển đổi đề thi Toán PDF / Ảnh sang Word
 * Tự động nhận dạng chữ, phương trình Word Equation gốc, và cắt hình học đặt song song
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Upload,
  Download,
  Copy,
  Check,
  Edit3,
  Trash2,
  Plus,
  RefreshCw,
  Image as ImageIcon,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ExternalLink,
  Code,
  FileCheck,
  Maximize2,
  Wand2,
  Camera
} from 'lucide-react';
import { MathRenderer } from './components/MathRenderer.tsx';
import { MathQuestion, QuestionOption, buildExamDocxBlob, optionLabelText } from './utils/docxExporter.ts';
import { optionWarnings } from './ocr/optionExtractor.ts';
import { SAMPLE_EXAM_DATA } from './utils/sampleExam.ts';
import { createTextOcr, TextOcr } from './ocr/textOcr.ts';
import { createPageSource, fileToCanvas } from './ocr/pageSource.ts';
import { recognizePages } from './ocr/pipeline.ts';
import { formulaEngine, FormulaStatus } from './ocr/formulaEngine.ts';
import { MathTextEditor } from './components/MathTextEditor.tsx';
import { CameraCapture } from './components/CameraCapture.tsx';
import { loadAndRenderPdfPages, cropBoxFromCanvas, RenderedPdfPage } from './utils/pdfRenderer.ts';
import { generateStandaloneHtml } from './utils/generateStandaloneHtml.ts';
import { ImageEnhanceModal } from './components/ImageEnhanceModal.tsx';
import { enhanceDocumentImage, DEFAULT_ENHANCE_OPTIONS } from './utils/imageEnhancer.ts';
import { sanitizeQuestionContent } from './utils/mathSanitizer.ts';

/** Word không đọc được ảnh SVG: đổi sang PNG bằng canvas trước khi xuất */
async function rasterizeDiagram(q: MathQuestion): Promise<MathQuestion> {
  const src = q.diagram?.base64Image;
  if (!src || !src.startsWith('data:image/svg')) return q;
  try {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = src; });
    const scale = 2;
    const w = (img.naturalWidth || 400) * scale;
    const h = (img.naturalHeight || 300) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { ...q, diagram: { ...q.diagram!, base64Image: canvas.toDataURL('image/png'), width: w, height: h } };
  } catch {
    return q;
  }
}

export default function App() {
  const [examTitle, setExamTitle] = useState('ĐỀ KHẢO SÁT CHẤT LƯỢNG MÔN TOÁN');
  const [schoolName, setSchoolName] = useState('SỞ GIÁO DỤC VÀ ĐÀO TẠO - TỔ TOÁN');
  const [duration, setDuration] = useState('90 phút');
  const [questions, setQuestions] = useState<MathQuestion[]>([]);

  // PDF & Image Pages
  const [pages, setPages] = useState<RenderedPdfPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Manual Crop Mode
  const [isManualCropMode, setIsManualCropMode] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedQuestionForCrop, setSelectedQuestionForCrop] = useState<string>('');

  // Editing Question
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editOptions, setEditOptions] = useState<QuestionOption[]>([]);

  // Preview zoom image
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Image Enhancement Modal State
  const [enhanceModalOpen, setEnhanceModalOpen] = useState(false);
  const [enhancingTarget, setEnhancingTarget] = useState<{ questionId: string; image: string; title: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Nhận dạng chạy ngay trên trình duyệt (không dùng AI trên mạng)
  const [useFormulaModel, setUseFormulaModel] = useState(true);
  const [formulaStatus, setFormulaStatus] = useState<FormulaStatus>(formulaEngine.status);
  const [showCamera, setShowCamera] = useState(false);
  const cancelRef = useRef(false);
  const textOcrRef = useRef<TextOcr | null>(null);
  useEffect(() => formulaEngine.subscribe(setFormulaStatus), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load sample exam automatically on initial render
  useEffect(() => {
    loadSampleExam();
  }, []);

  const loadSampleExam = async () => {
    try {
      setIsProcessing(true);
      setProcessStatus('Đang tải dữ liệu đề thi mẫu...');
      const data = { success: true, data: SAMPLE_EXAM_DATA };
      if (data.success && data.data) {
        setExamTitle(data.data.title || 'ĐỀ KHẢO SÁT CHẤT LƯỢNG MÔN TOÁN 12');
        setSchoolName(data.data.schoolName || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO');
        setQuestions(data.data.questions || []);

        // Create sample exam page canvas for visual preview
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 800;
        sampleCanvas.height = 1100;
        const ctx = sampleCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 800, 1100);

          // Paper header
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 16px "Be Vietnam Pro", sans-serif';
          ctx.fillText('SỞ GIÁO DỤC VÀ ĐÀO TẠO', 40, 50);
          ctx.font = '13px "Be Vietnam Pro", sans-serif';
          ctx.fillText('ĐỀ KHẢO SÁT CHẤT LƯỢNG TOÁN 12', 40, 72);

          ctx.font = 'bold 15px "Be Vietnam Pro", sans-serif';
          ctx.fillText('MÔN: TOÁN HỌC (THPT)', 500, 50);
          ctx.font = 'italic 12px "Be Vietnam Pro", sans-serif';
          ctx.fillText('Thời gian: 90 phút', 500, 70);

          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(40, 90);
          ctx.lineTo(760, 90);
          ctx.stroke();

          // Question 1 text on left
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 13px "Be Vietnam Pro", sans-serif';
          ctx.fillText('Câu 1: Cho hình chóp S.ABC có đáy ABC là tam', 40, 130);
          ctx.font = '13px "Be Vietnam Pro", sans-serif';
          ctx.fillText('giác vuông cân tại B, AB = a. Cạnh bên SA', 40, 155);
          ctx.fillText('vuông góc với đáy và SA = a√2. Thể tích V là:', 40, 180);
          ctx.fillText('A. V = a³√2 / 6         B. V = a³√2 / 3', 40, 215);
          ctx.fillText('C. V = a³ / 3            D. V = a³√2', 40, 240);

          // Draw Pyramid S.ABC on right (within box2d [100, 600, 350, 950])
          // x: 480 to 760, y: 110 to 385
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(620, 130); // S
          ctx.lineTo(510, 340); // A
          ctx.lineTo(730, 340); // C
          ctx.closePath();
          ctx.stroke();

          // Dashed inner lines for S.ABC
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(620, 130); // S -> B
          ctx.lineTo(630, 280); // B
          ctx.lineTo(510, 340); // B -> A
          ctx.moveTo(630, 280); // B -> C
          ctx.lineTo(730, 340);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.font = 'bold 14px serif';
          ctx.fillText('S', 615, 120);
          ctx.fillText('A', 490, 350);
          ctx.fillText('C', 740, 350);
          ctx.fillText('B', 638, 280);

          // Divider
          ctx.strokeStyle = '#f1f5f9';
          ctx.beginPath();
          ctx.moveTo(40, 390);
          ctx.lineTo(760, 390);
          ctx.stroke();

          // Question 2 text on left
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 13px "Be Vietnam Pro", sans-serif';
          ctx.fillText('Câu 2: Cho hàm số y = f(x) xác định trên R \\ {1}', 40, 430);
          ctx.font = '13px "Be Vietnam Pro", sans-serif';
          ctx.fillText('và có bảng biến thiên như hình vẽ bên. Đường', 40, 455);
          ctx.fillText('tiệm cận đứng và tiệm cận ngang là:', 40, 480);
          ctx.fillText('A. x = 1 và y = 2       B. x = 2 và y = 1', 40, 520);
          ctx.fillText('C. x = 1 và y = -1      D. x = -1 và y = 2', 40, 545);

          // Draw Variation Table on right (box2d [380, 550, 600, 950])
          // x: 440 to 760, y: 418 to 660
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(450, 430, 300, 150);
          ctx.beginPath();
          ctx.moveTo(490, 430); ctx.lineTo(490, 580);
          ctx.moveTo(450, 470); ctx.lineTo(750, 470);
          ctx.moveTo(450, 510); ctx.lineTo(750, 510);
          ctx.stroke();

          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('x', 465, 455);
          ctx.fillText('y\'', 465, 495);
          ctx.fillText('y', 465, 550);

          ctx.font = '11px sans-serif';
          ctx.fillText('-∞', 510, 455);
          ctx.fillText('1', 610, 455);
          ctx.fillText('+∞', 710, 455);

          ctx.font = 'bold 14px sans-serif';
          ctx.fillText('-', 555, 495);
          ctx.fillText('-', 665, 495);

          // Double vertical line at x = 1
          ctx.strokeStyle = '#dc2626';
          ctx.beginPath();
          ctx.moveTo(608, 470); ctx.lineTo(608, 580);
          ctx.moveTo(612, 470); ctx.lineTo(612, 580);
          ctx.stroke();

          // Question 3 & 4
          ctx.strokeStyle = '#f1f5f9';
          ctx.beginPath();
          ctx.moveTo(40, 680);
          ctx.lineTo(760, 680);
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 13px "Be Vietnam Pro", sans-serif';
          ctx.fillText('Câu 3: Tính tích phân I = ∫ (2x + 1) / √(x² + x + 1) dx từ 0 đến 1.', 40, 720);
          ctx.fillText('Câu 4: Tập nghiệm S của bất phương trình 3^(2x+1) - 10.3^x + 3 ≤ 0.', 40, 820);
        }

        const samplePage: RenderedPdfPage = {
          pageNumber: 1,
          canvas: sampleCanvas,
          dataUrl: sampleCanvas.toDataURL('image/jpeg', 0.9),
          width: sampleCanvas.width,
          height: sampleCanvas.height,
        };

        setPages([samplePage]);
        setCurrentPageIndex(0);
        showToast('Đã tải đề thi mẫu với hình học và phương trình!');
      }
    } catch (err) {
      console.error('Lỗi tải đề mẫu:', err);
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  // Draw current page onto display canvas with detected bounding boxes
  useEffect(() => {
    if (pages.length === 0 || !pages[currentPageIndex]) return;
    const page = pages[currentPageIndex];
    const displayCanvas = canvasRef.current;
    if (!displayCanvas) return;

    displayCanvas.width = page.width;
    displayCanvas.height = page.height;
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    // Draw page image
    ctx.drawImage(page.canvas, 0, 0);

    // Overlay detected diagram boxes
    questions.forEach((q) => {
      if (q.diagram?.box2d && (q.diagram.page ?? 0) === currentPageIndex) {
        const [ymin, xmin, ymax, xmax] = q.diagram.box2d;
        const x = (xmin / 1000) * page.width;
        const y = (ymin / 1000) * page.height;
        const w = ((xmax - xmin) / 1000) * page.width;
        const h = ((ymax - ymin) / 1000) * page.height;

        // Semi-transparent highlight box
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        // Label tag
        ctx.fillStyle = '#059669';
        const labelText = `${q.questionNumber}: Hình vẽ`;
        ctx.font = 'bold 16px sans-serif';
        const textMetrics = ctx.measureText(labelText);
        ctx.fillRect(x, Math.max(0, y - 24), textMetrics.width + 12, 24);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, x + 6, Math.max(18, y - 6));
      }
    });

    // Draw manual crop preview if dragging
    if (cropStart && cropEnd) {
      const rx = Math.min(cropStart.x, cropEnd.x);
      const ry = Math.min(cropStart.y, cropEnd.y);
      const rw = Math.abs(cropEnd.x - cropStart.x);
      const rh = Math.abs(cropEnd.y - cropStart.y);

      ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
    }
  }, [pages, currentPageIndex, questions, cropStart, cropEnd]);

  // Handle file upload (PDF or Image)
  /** Đổi danh sách file (PDF / ảnh) thành các "trang" để hiển thị và nhận dạng */
  const filesToPages = async (files: File[]): Promise<RenderedPdfPage[]> => {
    const result: RenderedPdfPage[] = [];
    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        setProcessStatus(`Đang chuyển "${file.name}" thành ảnh độ nét cao...`);
        const rendered = await loadAndRenderPdfPages(await file.arrayBuffer(), 15, 2.5);
        result.push(...rendered);
      } else if (file.type.startsWith('image/')) {
        setProcessStatus(`Đang đọc ảnh "${file.name}"...`);
        const canvas = await fileToCanvas(file);
        result.push({
          pageNumber: 0,
          canvas,
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          width: canvas.width,
          height: canvas.height,
        });
      }
    }
    return result.slice(0, 30).map((pg, i) => ({ ...pg, pageNumber: i + 1 }));
  };

  /** Tải một hoặc NHIỀU file (PDF / ảnh) cùng lúc rồi nhận dạng tất cả */
  const handleFilesUpload = async (fileList: File[]) => {
    const files = fileList.filter((f) => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    if (files.length === 0) {
      alert('Vui lòng chọn file PDF hoặc ảnh (.png, .jpg, .jpeg, .webp).');
      return;
    }
    setSelectedFileName(files.length === 1 ? files[0].name : `${files.length} tệp`);
    setIsProcessing(true);
    setProcessStatus('Đang nạp tài liệu...');
    try {
      const newPages = await filesToPages(files);
      if (newPages.length === 0) throw new Error('Không đọc được trang nào từ tệp đã chọn.');
      setPages(newPages);
      setCurrentPageIndex(0);
      await recognizeAllPages(newPages);
    } catch (err: any) {
      console.error('Lỗi tải tệp:', err);
      alert('Không thể đọc tệp: ' + (err.message || 'Lỗi không xác định'));
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  /** Nhận dạng toàn bộ các trang bằng thư viện chạy trên trình duyệt */
  const recognizeAllPages = async (pagesToRead: RenderedPdfPage[]) => {
    setIsProcessing(true);
    cancelRef.current = false;
    try {
      setProcessStatus('Đang khởi động bộ đọc chữ (Tesseract)...');
      if (!textOcrRef.current) textOcrRef.current = await createTextOcr();

      let recognizeFormula: ((b: Blob) => Promise<string>) | null = null;
      if (useFormulaModel) {
        const unsubscribe = formulaEngine.subscribe((st) => {
          if (st.state === 'loading') setProcessStatus(`Đang tải mô hình đọc công thức... ${st.percent}% (chỉ tải lần đầu)`);
        });
        try {
          await formulaEngine.load();
          recognizeFormula = (blob) => formulaEngine.recognize(blob);
        } catch (e) {
          console.warn(e);
          showToast('Không tải được mô hình công thức - dùng chế độ cơ bản. Bạn có thể sửa công thức trực tiếp.');
        } finally {
          unsubscribe();
        }
      }

      const sources = pagesToRead.map((pg) => createPageSource(pg.canvas));
      const result = await recognizePages(sources, {
        textOcr: textOcrRef.current,
        recognizeFormula,
        onProgress: (msg) => setProcessStatus(msg),
        shouldCancel: () => cancelRef.current,
      });

      if (result.meta.title) setExamTitle(result.meta.title);
      if (result.meta.schoolName) setSchoolName(result.meta.schoolName);
      if (result.meta.duration) setDuration(result.meta.duration);
      setQuestions(result.questions);
      showToast(
        result.questions.length > 0
          ? `Đã nhận dạng ${result.questions.length} câu hỏi từ ${pagesToRead.length} trang. Hãy kiểm tra và sửa công thức nếu cần.`
          : 'Chưa tìm thấy câu hỏi nào. Hãy thử ảnh rõ nét hơn hoặc thêm câu hỏi thủ công.',
      );
    } catch (err: any) {
      if (cancelRef.current) showToast('Đã dừng nhận dạng.');
      else {
        console.error('Lỗi nhận dạng:', err);
        alert('Lỗi nhận dạng: ' + (err.message || 'Không xác định'));
      }
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  // Export to Microsoft Word (.docx)
  const handleExportDocx = async () => {
    if (questions.length === 0) {
      alert('Chưa có câu hỏi nào để xuất ra Word.');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessStatus('Đang đóng gói file Word (.docx) với phương trình Word Equation & hình học song song...');

      const readyQuestions = await Promise.all(questions.map(rasterizeDiagram));
      const blob = await buildExamDocxBlob({
        title: examTitle,
        schoolName,
        duration,
        questions: readyQuestions,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (examTitle || 'De_Thi_Toan').replace(/\s+/g, '_');
      a.download = `${safeName}_Chuan_Word.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast('Đã tải xuống file Word (.docx) chuẩn thành công!');
    } catch (err: any) {
      console.error('Lỗi xuất Word:', err);
      alert('Không thể tạo file Word: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  // Copy to Word Clipboard (HTML format compatible with Microsoft Word Ctrl+V)
  const handleCopyToClipboard = async () => {
    if (questions.length === 0) return;

    try {
      let html = `<div style="font-family: 'Times New Roman', serif; font-size: 12pt;">
        <h2 style="text-align: center; margin-bottom: 4px;">${examTitle}</h2>
        <p style="text-align: center; font-style: italic; margin-top: 0;">Thời gian: ${duration}</p>
        <hr style="border: 0.5px solid #ccc; margin: 16px 0;" />
      `;

      questions.forEach((q) => {
        if (q.diagram?.base64Image) {
          html += `
            <table style="width: 100%; border: none; margin-bottom: 16px; border-collapse: collapse;">
              <tr>
                <td style="width: 65%; vertical-align: top; padding-right: 12px;">
                  <p><b>${q.questionNumber}:</b> ${q.content}</p>
                  <div>
                    ${(q.options || []).map((opt) => `<b>${optionLabelText(opt.label).trim()}</b> ${opt.text}&nbsp;&nbsp;&nbsp;&nbsp;`).join('')}
                  </div>
                </td>
                <td style="width: 35%; text-align: center; vertical-align: middle;">
                  <img src="${q.diagram.base64Image}" style="max-width: 220px; max-height: 180px;" alt="Hình vẽ" />
                </td>
              </tr>
            </table>
          `;
        } else {
          html += `
            <div style="margin-bottom: 16px;">
              <p><b>${q.questionNumber}:</b> ${q.content}</p>
              <div>
                ${(q.options || []).map((opt) => `<b>${optionLabelText(opt.label).trim()}</b> ${opt.text}&nbsp;&nbsp;&nbsp;&nbsp;`).join('')}
              </div>
            </div>
          `;
        }
      });

      html += `</div>`;

      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([questions.map((q) => `${q.questionNumber}: ${q.content}`).join('\n\n')], { type: 'text/plain' });

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText,
        }),
      ]);

      showToast('Đã sao chép! Hãy mở Microsoft Word và nhấn Ctrl + V để dán.');
    } catch (err) {
      console.error('Lỗi clipboard:', err);
      // Fallback
      alert('Đã sao chép nội dung văn bản. Bạn có thể nhấn Tải file Word (.docx) để có định dạng chuẩn nhất!');
    }
  };

  // Download Standalone Pure HTML/JS Version
  const handleDownloadStandalone = () => {
    const htmlString = generateStandaloneHtml();
    const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Math2Word_Ban_HTML_JS_Thuan.html';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    showToast('Đã tải về mã nguồn HTML/CSS/JS thuần độc lập để chạy offline!');
  };

  // Canvas Mouse Events for Manual Cropping
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isManualCropMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setCropStart({ x, y });
    setCropEnd({ x, y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isManualCropMode || !cropStart) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setCropEnd({ x, y });
  };

  const handleCanvasMouseUp = () => {
    if (!isManualCropMode || !cropStart || !cropEnd || !selectedQuestionForCrop) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rx = Math.min(cropStart.x, cropEnd.x);
    const ry = Math.min(cropStart.y, cropEnd.y);
    const rw = Math.abs(cropEnd.x - cropStart.x);
    const rh = Math.abs(cropEnd.y - cropStart.y);

    if (rw > 20 && rh > 20) {
      // Calculate normalized 0..1000 box
      const ymin = Math.round((ry / canvas.height) * 1000);
      const xmin = Math.round((rx / canvas.width) * 1000);
      const ymax = Math.round(((ry + rh) / canvas.height) * 1000);
      const xmax = Math.round(((rx + rw) / canvas.width) * 1000);

      // Crop from current page canvas
      const cropped = cropBoxFromCanvas(canvas, [ymin, xmin, ymax, xmax]);

      // Assign to selected question
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id === selectedQuestionForCrop) {
            return {
              ...q,
              diagram: {
                id: `diag-manual-${Date.now()}`,
                box2d: [ymin, xmin, ymax, xmax],
                page: currentPageIndex,
                base64Image: cropped.dataUrl,
                caption: `Hình vẽ ${q.questionNumber}`,
                width: cropped.width,
                height: cropped.height,
              },
            };
          }
          return q;
        })
      );

      showToast(`Đã cắt và gắn hình vẽ vào ${questions.find((q) => q.id === selectedQuestionForCrop)?.questionNumber || 'câu hỏi'}!`);
    }

    setCropStart(null);
    setCropEnd(null);
    setIsManualCropMode(false);
  };

  // Start editing a question
  const startEditQuestion = (q: MathQuestion) => {
    setEditingQuestionId(q.id);
    setEditContent(q.content);
    setEditTopic(q.topic || 'Toán học');
    setEditOptions(q.options || []);
  };

  const saveEditQuestion = (id: string) => {
    const cleanContent = sanitizeQuestionContent(editContent);
    const cleanOptions = editOptions.map(o => ({
      ...o,
      text: sanitizeQuestionContent(o.text)
    }));
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id === id) {
          return {
            ...q,
            content: cleanContent,
            topic: editTopic,
            options: cleanOptions,
            warnings: optionWarnings(cleanOptions).length > 0 ? optionWarnings(cleanOptions) : undefined,
          };
        }
        return q;
      })
    );
    setEditingQuestionId(null);
    showToast('Đã lưu và tự động chuẩn hóa công thức toán!');
  };

  const openEnhanceModal = (questionId: string, image: string, title: string) => {
    setEnhancingTarget({ questionId, image, title });
    setEnhanceModalOpen(true);
  };

  const handleApplyEnhancement = (enhancedDataUrl: string, applyToAll?: boolean) => {
    if (!enhancingTarget) return;

    if (applyToAll) {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.diagram?.base64Image) {
            return {
              ...q,
              diagram: {
                ...q.diagram,
                base64Image: enhancedDataUrl,
              },
            };
          }
          return q;
        })
      );
      showToast('Đã làm phẳng & làm trắng đều cho tất cả hình vẽ!');
    } else {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id === enhancingTarget.questionId && q.diagram) {
            return {
              ...q,
              diagram: {
                ...q.diagram,
                base64Image: enhancedDataUrl,
              },
            };
          }
          return q;
        })
      );
      showToast(`Đã làm phẳng & làm trắng đều cho ${enhancingTarget.title}!`);
    }

    setEnhanceModalOpen(false);
    setEnhancingTarget(null);
  };

  const autoEnhanceAllDiagrams = async () => {
    setIsProcessing(true);
    setProcessStatus('Đang tự động làm phẳng và tẩy trắng tất cả hình vẽ...');
    try {
      const updated = await Promise.all(
        questions.map(async (q) => {
          if (q.diagram?.base64Image) {
            const res = await enhanceDocumentImage(q.diagram.base64Image, {
              shadowRemoval: 80,
              whiteLevel: 75,
              contrast: 65,
              monochrome: false,
              sharpen: true,
            });
            return {
              ...q,
              diagram: {
                ...q.diagram,
                base64Image: res.dataUrl,
              },
            };
          }
          return q;
        })
      );
      setQuestions(updated);
      showToast('Đã tự động làm phẳng & trắng đều toàn bộ hình học!');
    } catch (err: any) {
      console.error('Lỗi tự động lọc ảnh:', err);
      showToast('Không thể lọc ảnh: ' + err.message);
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  const removeDiagram = (qId: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, diagram: undefined } : q))
    );
    showToast('Đã xóa hình minh họa của câu này.');
  };

  const deleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    showToast('Đã xóa câu hỏi.');
  };

  const addNewQuestion = () => {
    const newQ: MathQuestion = {
      id: `q-new-${Date.now()}`,
      questionNumber: `Câu ${questions.length + 1}`,
      content: 'Cho hàm số $y = f(x)$ liên tục trên $\\mathbb{R}$. Tìm số điểm cực trị của hàm số.',
      topic: 'Hàm số',
      options: [
        { label: 'A', text: '$1$' },
        { label: 'B', text: '$2$' },
        { label: 'C', text: '$3$' },
        { label: 'D', text: '$0$' },
      ],
    };
    setQuestions([...questions, newQ]);
    showToast('Đã thêm một câu hỏi mới!');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900/90 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 backdrop-blur-sm border border-slate-700 animate-fade-in text-sm font-medium">
          <Check className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Math2Word VN
                </h1>
                <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-indigo-100">
                  PDF ➔ Word Equation Chuẩn
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Tự động nhận diện công thức toán, cắt hình học đặt song song với đề bài
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={loadSampleExam}
              disabled={isProcessing}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition flex items-center gap-1.5"
              title="Tải đề thi mẫu có hình chóp & bảng biến thiên"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Đề Mẫu</span>
            </button>

            <button
              onClick={handleDownloadStandalone}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition flex items-center gap-1.5"
              title="Tải mã nguồn HTML+JS thuần để chạy offline không cần cài đặt"
            >
              <Code className="w-4 h-4 text-emerald-600" />
              <span>Bản HTML/JS Thuần</span>
            </button>

            <button
              onClick={handleCopyToClipboard}
              disabled={questions.length === 0}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              title="Sao chép toàn bộ để dán trực tiếp vào Microsoft Word (Ctrl+V)"
            >
              <Copy className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">Sao chép sang Word</span>
              <span className="sm:hidden">Sao chép</span>
            </button>

            <button
              onClick={handleExportDocx}
              disabled={questions.length === 0 || isProcessing}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-sm shadow-indigo-200 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Tải File Word (.docx)</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Source PDF / Image & Diagram Cropper (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Upload Zone Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Nguồn Đề Thi (PDF hoặc Ảnh)</span>
              </h2>
              {selectedFileName && (
                <span className="text-xs text-slate-500 truncate max-w-[180px]">
                  {selectedFileName}
                </span>
              )}
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFilesUpload(Array.from(e.dataTransfer.files));
                }
              }}
              className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50/60 rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFilesUpload(Array.from(e.target.files));
                  }
                  e.target.value = '';
                }}
                accept=".pdf,image/png,image/jpeg,image/webp"
                className="hidden"
              />
              <div className="w-12 h-12 rounded-full bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center text-indigo-600 transition">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  Kéo thả hoặc chọn NHIỀU file PDF / ảnh đề thi cùng lúc
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Các ảnh được ghép theo thứ tự thành một đề. Hỗ trợ PDF nhiều trang, PNG, JPG, WEBP
                </p>
              </div>
              <span className="text-xs font-semibold text-indigo-700 bg-white px-3 py-1 rounded-full border border-indigo-200 shadow-xs mt-1">
                Chọn tệp từ máy
              </span>
            </div>

            {/* Chụp trực tiếp bằng camera */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={isProcessing}
                className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-3 py-2.5 flex items-center justify-center gap-1.5"
              >
                <Camera className="w-4 h-4" /> Chụp nhiều tờ bằng camera
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isProcessing}
                className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-50 rounded-lg px-3 py-2.5 flex items-center justify-center gap-1.5"
              >
                <Camera className="w-4 h-4" /> Camera của điện thoại
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) handleFilesUpload(Array.from(e.target.files));
                  e.target.value = '';
                }}
              />
            </div>

            {/* Tuỳ chọn mô hình đọc công thức */}
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={useFormulaModel}
                onChange={(e) => setUseFormulaModel(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Dùng mô hình đọc công thức (chính xác hơn, lần đầu cần tải mô hình, sau đó chạy ngay trên máy, không cần mạng).
                {formulaStatus.state === 'ready' && <b className="text-emerald-700"> Mô hình đã sẵn sàng.</b>}
                {formulaStatus.state === 'loading' && <b className="text-amber-700"> Đang tải {formulaStatus.percent}%...</b>}
                {formulaStatus.state === 'error' && <b className="text-red-600"> Không tải được mô hình.</b>}
              </span>
            </label>

            {pages.length > 0 && pages.length === 1 && (
              <button
                onClick={() => recognizeAllPages(pages)}
                disabled={isProcessing}
                className="mt-3 w-full text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-lg transition flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>Nhận dạng lại</span>
              </button>
            )}

            {/* Multi-page Navigation */}
            {pages.length > 1 && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPageIndex === 0}
                    onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    title="Trang trước"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700">
                    Trang {currentPageIndex + 1} / {pages.length}
                  </span>
                  <button
                    disabled={currentPageIndex === pages.length - 1}
                    onClick={() => setCurrentPageIndex((p) => Math.min(pages.length - 1, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                    title="Trang sau"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </button>
                </div>

                <button
                  onClick={() => recognizeAllPages(pages)}
                  disabled={isProcessing}
                  className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>Nhận dạng lại tất cả</span>
                </button>
              </div>
            )}
          </div>

          {/* Interactive Page Canvas & Cropper Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <span>Bản Xem Trước &amp; Vùng Cắt Hình Học</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Khung xanh là hình vẽ được tự động dò trên ảnh (có thể chỉnh bằng "Cắt hình thủ công")
                </p>
              </div>

              {/* Manual Crop Button Toggle */}
              {pages.length > 0 && (
                <div className="flex items-center gap-2">
                  {isManualCropMode ? (
                    <button
                      onClick={() => {
                        setIsManualCropMode(false);
                        setCropStart(null);
                        setCropEnd(null);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100"
                    >
                      Hủy cắt thủ công
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (questions.length === 0) {
                          alert('Vui lòng tạo hoặc nhận diện câu hỏi trước.');
                          return;
                        }
                        setSelectedQuestionForCrop(questions[0].id);
                        setIsManualCropMode(true);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Cắt hình thủ công</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Manual Crop Assignment selector */}
            {isManualCropMode && (
              <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex flex-wrap items-center justify-between gap-2">
                <span>Chọn câu muốn gắn hình:</span>
                <select
                  value={selectedQuestionForCrop}
                  onChange={(e) => setSelectedQuestionForCrop(e.target.value)}
                  className="bg-white border border-indigo-300 rounded px-2 py-1 text-xs font-medium text-slate-800 outline-none"
                >
                  {questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.questionNumber}: {q.topic || 'Câu hỏi'}
                    </option>
                  ))}
                </select>
                <span className="w-full text-indigo-600 text-[11px] italic">
                  👉 Kéo thả chuột trên hình vẽ bên dưới để quét vùng cắt.
                </span>
              </div>
            )}

            {/* Display Canvas Container */}
            <div className="border border-slate-200 rounded-xl bg-slate-100 overflow-auto max-h-[580px] p-2 flex justify-center items-start">
              {pages.length > 0 ? (
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  className={`max-w-full shadow-md bg-white rounded transition ${
                    isManualCropMode ? 'cursor-crosshair' : 'cursor-default'
                  }`}
                />
              ) : (
                <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <FileText className="w-10 h-10 text-slate-300" />
                  <span>Chưa có ảnh trang đề thi. Nhấn "Đề Mẫu" hoặc tải file để xem.</span>
                </div>
              )}
            </div>

            {/* Cropped Diagrams Gallery */}
            {questions.some((q) => q.diagram?.base64Image) && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 block">
                    Các hình học &amp; đồ thị đã cắt thành công:
                  </span>
                  <button
                    onClick={autoEnhanceAllDiagrams}
                    disabled={isProcessing}
                    className="px-2 py-0.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition flex items-center gap-1 shadow-2xs"
                    title="Tự động tẩy trắng nền và khử bóng mờ cho toàn bộ các hình"
                  >
                    <Wand2 className="w-3 h-3 text-indigo-600" />
                    <span>Làm trắng tất cả</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {questions
                    .filter((q) => q.diagram?.base64Image)
                    .map((q) => (
                      <div
                        key={q.id}
                        className="border border-slate-200 rounded-lg p-1.5 bg-slate-50 flex flex-col items-center text-center relative group"
                      >
                        <img
                          src={q.diagram?.base64Image}
                          alt={q.questionNumber}
                          className="h-16 object-contain bg-white rounded border border-slate-200 p-0.5 cursor-pointer"
                          onClick={() => setZoomedImage(q.diagram?.base64Image || null)}
                        />
                        <span className="text-[11px] font-bold text-slate-700 mt-1">
                          {q.questionNumber}
                        </span>
                        <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => openEnhanceModal(q.id, q.diagram!.base64Image!, q.questionNumber)}
                            className="bg-indigo-600 text-white rounded-full p-1 hover:bg-indigo-700 transition shadow-xs"
                            title="Làm phẳng & tẩy trắng hình này"
                          >
                            <Wand2 className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => removeDiagram(q.id)}
                            className="bg-rose-500 text-white rounded-full p-1 hover:bg-rose-600 transition shadow-xs"
                            title="Gỡ hình này"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Structured Exam Questions with Side-by-Side Presentation (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Exam Info Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Tên Cơ Quan / Trường:</label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Tiêu Đề Đề Thi:</label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Thời Gian Làm Bài:</label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Processing Status Banner */}
          {isProcessing && (
            <div className="bg-indigo-600 text-white rounded-xl p-4 shadow-md flex items-center gap-3 animate-pulse">
              <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">{processStatus || 'Đang xử lý...'}</p>
                <p className="text-xs text-indigo-100">
                  Đang đọc chữ, công thức và dò hình vẽ ngay trên máy của bạn (không gửi ảnh lên mạng).
                </p>
              </div>
              <button
                onClick={() => { cancelRef.current = true; }}
                className="ml-auto shrink-0 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5"
              >
                Dừng
              </button>
            </div>
          )}

          {/* Questions Header & Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span>Nội Dung Đề Thi Đã Số Hóa</span>
                  <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-semibold">
                    {questions.length} câu hỏi
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Công thức hiển thị chuẩn KaTeX, hình học được xếp song song theo form đề thi chuẩn
                </p>
              </div>

              <button
                onClick={addNewQuestion}
                className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm câu hỏi</span>
              </button>
            </div>

            {/* Questions List */}
            <div className="space-y-4 overflow-y-auto max-h-[720px] pr-1">
              {questions.length === 0 ? (
                <div className="py-24 text-center text-slate-400">
                  <FileText className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p className="font-medium text-sm text-slate-600">Chưa có câu hỏi nào</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Hãy kéo thả tệp PDF vào khung bên trái hoặc nhấn nút "Đề Mẫu" ở góc trên.
                  </p>
                </div>
              ) : (
                questions.map((q, idx) => {
                  const hasDiagram = !!q.diagram?.base64Image;

                  return (
                    <div
                      key={q.id}
                      className="border border-slate-200 hover:border-indigo-300 rounded-xl p-4 bg-white transition shadow-xs group relative"
                    >
                      {/* Question Top Bar */}
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-900 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-lg text-xs font-mono">
                            {q.questionNumber || `Câu ${idx + 1}`}
                          </span>
                          {q.topic && (
                            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              {q.topic}
                            </span>
                          )}
                          {hasDiagram && (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" />
                              <span>Có hình song song</span>
                            </span>
                          )}
                          {q.warnings?.map((w) => (
                            <span key={w} title="Bấm biểu tượng bút để sửa" className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md">
                              ⚠ {w}
                            </span>
                          ))}
                        </div>

                        {/* Question Action Buttons */}
                        <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition">
                          <button
                            onClick={() => startEditQuestion(q)}
                            className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                            title="Sửa nội dung & công thức"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteQuestion(q.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                            title="Xóa câu này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Side-by-side presentation if diagram exists */}
                      <div className={hasDiagram ? 'grid grid-cols-1 md:grid-cols-12 gap-4 items-start' : ''}>
                        {/* Question Content & Options (Left 68% if diagram, 100% otherwise) */}
                        <div className={hasDiagram ? 'md:col-span-8' : ''}>
                          {/* Question text with KaTeX formulas */}
                          <div className="text-sm text-slate-800 leading-relaxed font-serif">
                            <MathRenderer content={q.content} />
                          </div>

                          {/* Multiple Choice Options */}
                          {q.options && q.options.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-2">
                              {q.options.map((opt) => (
                                <div
                                  key={opt.label}
                                  className="flex items-center gap-2 bg-slate-50/80 border border-slate-200/70 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-serif"
                                >
                                  <span className="font-bold text-slate-700 font-sans">{optionLabelText(opt.label).trim()}</span>
                                  <MathRenderer content={opt.text} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Cropped Geometry Diagram (Right 32% side-by-side) */}
                        {hasDiagram && (
                          <div className="md:col-span-4 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-100 md:pl-4 pt-3 md:pt-0">
                            <div className="relative group/diag border border-slate-200 rounded-lg bg-slate-50 p-1.5 shadow-2xs hover:shadow-sm transition">
                              <img
                                src={q.diagram?.base64Image}
                                alt={q.diagram?.caption || 'Hình vẽ minh họa'}
                                className="max-h-48 max-w-full object-contain rounded bg-white cursor-pointer"
                                onClick={() => setZoomedImage(q.diagram?.base64Image || null)}
                              />
                              <button
                                onClick={() => setZoomedImage(q.diagram?.base64Image || null)}
                                className="absolute bottom-2 right-2 bg-slate-900/70 text-white p-1 rounded-md opacity-0 group-hover/diag:opacity-100 transition"
                                title="Xem phóng to"
                              >
                                <Maximize2 className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="text-[11px] text-slate-500 italic mt-1.5 text-center">
                              {q.diagram?.caption || 'Hình vẽ Câu ' + (idx + 1)}
                            </span>
                            <button
                              onClick={() => openEnhanceModal(q.id, q.diagram!.base64Image!, q.questionNumber)}
                              className="mt-2 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition flex items-center gap-1 shadow-2xs"
                              title="Làm phẳng hình & làm trắng đều nền để khử bóng chụp điện thoại"
                            >
                              <Wand2 className="w-3 h-3 text-indigo-600" />
                              <span>Làm phẳng &amp; Trắng nền</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {showCamera && (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onDone={(files) => {
            setShowCamera(false);
            handleFilesUpload(files);
          }}
        />
      )}

      {/* Edit Question Modal */}
      {editingQuestionId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 animate-scale-in">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center justify-between">
              <span>Chỉnh sửa nội dung câu hỏi &amp; Công thức LaTeX</span>
              <button
                onClick={() => setEditingQuestionId(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Chủ đề (ví dụ: Hình học không gian, Tích phân, Hàm số):
                </label>
                <input
                  type="text"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nội dung đề bài (đặt công thức toán trong dấu $...$):
                </label>
                <MathTextEditor value={editContent} onChange={setEditContent} rows={4} />
              </div>

              {/* Edit Options */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">
                  Các lựa chọn trắc nghiệm (A, B, C, D):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {editOptions.map((opt, oIdx) => (
                    <div key={opt.label} className="flex items-start gap-1.5">
                      <span className="font-bold text-xs text-slate-700 w-6 pt-2">{optionLabelText(opt.label).trim()}</span>
                      <div className="flex-1 min-w-0">
                        <MathTextEditor
                          singleLine
                          value={opt.text}
                          onChange={(text) => {
                            const updated = [...editOptions];
                            updated[oIdx] = { ...opt, text };
                            setEditOptions(updated);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {editOptions.length > 0 && editOptions.length < 4 && (
                    <button
                      type="button"
                      onClick={() => {
                        const lower = editOptions[0].label === editOptions[0].label.toLowerCase();
                        const labels = lower ? ['a', 'b', 'c', 'd'] : ['A', 'B', 'C', 'D'];
                        const have = new Map(editOptions.map((o) => [o.label, o]));
                        setEditOptions(labels.map((label) => have.get(label) ?? { label, text: '' }));
                      }}
                      className="col-span-1 sm:col-span-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg py-2"
                    >
                      Thêm các đáp án còn thiếu ({optionWarnings(editOptions)[0]?.replace('Thiếu đáp án ', '').split(':')[0]})
                    </button>
                  )}
                  {editOptions.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setEditOptions(['A', 'B', 'C', 'D'].map((label) => ({ label, text: '' })))}
                      className="col-span-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg py-2"
                    >
                      Thêm 4 đáp án A, B, C, D
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingQuestionId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={() => saveEditQuestion(editingQuestionId)}
                className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Image Lightbox Modal */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="bg-white p-2 rounded-2xl max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl relative">
            <img
              src={zoomedImage}
              alt="Hình phóng to"
              className="max-h-[85vh] max-w-full object-contain rounded-xl"
            />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 bg-slate-900/80 text-white rounded-full p-1.5 shadow"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Image Enhance Modal for Shadow Removal & Whitening */}
      {enhancingTarget && (
        <ImageEnhanceModal
          isOpen={enhanceModalOpen}
          onClose={() => {
            setEnhanceModalOpen(false);
            setEnhancingTarget(null);
          }}
          originalImage={enhancingTarget.image}
          questionNumber={enhancingTarget.title}
          onApply={handleApplyEnhancement}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            Math2Word VN © 2026 - Giải pháp số hóa đề thi Toán học Việt Nam chuẩn Microsoft Word.
          </p>
          <div className="flex items-center gap-4 font-medium">
            <button onClick={handleDownloadStandalone} className="hover:text-indigo-600 transition flex items-center gap-1">
              <Code className="w-3.5 h-3.5" />
              <span>Tải file HTML/JS độc lập</span>
            </button>
            <span>•</span>
            <span className="text-slate-400">Word Equation (m:oMath) &amp; nhận dạng ngay trên trình duyệt</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
