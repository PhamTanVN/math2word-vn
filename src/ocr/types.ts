/** Các kiểu dữ liệu dùng chung cho bộ nhận dạng (OCR) chạy trên trình duyệt. */

/** Hình chữ nhật theo toạ độ điểm ảnh của ảnh gốc */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  /** độ tin cậy 0..100 do Tesseract báo */
  conf: number;
  box: Box;
}

export interface OcrLine {
  text: string;
  conf: number;
  box: Box;
  words: OcrWord[];
}

/** Hàm nhận dạng công thức: nhận ảnh cắt (PNG), trả về LaTeX (không có dấu $) */
export type FormulaRecognizeFn = (crop: Blob) => Promise<string>;

/** Hàm cắt một vùng ảnh gốc thành ảnh PNG */
export type CropFn = (box: Box) => Promise<Blob>;

export const boxWidth = (b: Box) => b.x1 - b.x0;
export const boxHeight = (b: Box) => b.y1 - b.y0;
export const boxCenterY = (b: Box) => (b.y0 + b.y1) / 2;

export function unionBox(boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}
