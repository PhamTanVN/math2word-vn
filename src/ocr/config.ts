/**
 * config.ts - Mọi thiết lập của bộ nhận dạng gom về một chỗ để dễ chỉnh.
 */

// Vite cung cấp BASE_URL (mặc định "/"). Khi chạy bằng Node (test) thì không có.
const BASE: string = (import.meta as any).env?.BASE_URL ?? '/';

export const OCR_CONFIG = {
  /** Ngôn ngữ Tesseract: tiếng Việt + tiếng Anh (cho ký hiệu, chữ cái latinh) */
  tesseractLangs: 'vie+eng',

  /** Đường dẫn file tài nguyên (được script copy-ocr-assets.mjs chép vào public/ocr) */
  paths: {
    tesseractWorker: `${BASE}ocr/tesseract/worker.min.js`,
    tesseractCore: `${BASE}ocr/tesseract-core`,
    tessdata: `${BASE}ocr/tessdata`,
    onnxRuntime: `${BASE}ocr/ort/`,
  },

  /**
   * Mô hình nhận dạng công thức (ảnh -> LaTeX), chạy bằng Transformers.js ngay trên trình duyệt.
   * TexTeller: giấy phép Apache-2.0. Lần đầu dùng sẽ tải mô hình về (rồi được lưu cache trình duyệt).
   * Muốn tự lưu mô hình trên server của trường: đặt VITE_LOCAL_MODEL=1 và chép mô hình vào public/models/
   */
  formulaModelId: 'onnx-community/TexTeller-ONNX',
  useLocalModel: (import.meta as any).env?.VITE_LOCAL_MODEL === '1',
  localModelPath: `${BASE}models/`,
  /** Thử lần lượt các kiểu nén; q8 nhẹ hơn nhiều, fp32 là phương án dự phòng */
  modelDtypes: ['q8', 'fp32'] as const,
  maxNewTokens: 256,

  /** Chiều dài cạnh dài nhất của ảnh khi nhận dạng (ảnh điện thoại thường rất lớn) */
  maxImageSide: 2600,
  /** Chiều cao tối thiểu (px) của ảnh công thức đưa vào mô hình */
  formulaPadding: 6,
} as const;
