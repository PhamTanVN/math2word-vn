/**
 * diagramDetector.ts
 * ------------------------------------------------------------
 * Tìm các hình vẽ (hình học, đồ thị, bảng biến thiên) trên trang đề mà KHÔNG dùng AI:
 *   1. Xoá phần "mực" nằm trong các dòng chữ đã nhận dạng.
 *   2. Phần mực còn lại là hình vẽ -> nối các nét gần nhau thành từng cụm.
 *   3. Lọc bỏ cụm quá nhỏ, đường kẻ mảnh, khung viền cả trang.
 */
import { Box } from './types.ts';

export interface DetectOptions {
  /** pixel có độ sáng thấp hơn mức này là "mực" (0..255) */
  inkThreshold?: number;
  /** kích thước tối thiểu của hình (tỉ lệ so với trang) */
  minWidthRatio?: number;
  minHeightRatio?: number;
}

export function detectFigures(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  textBoxes: Box[],
  options: DetectOptions = {},
): Box[] {
  const inkThreshold = options.inkThreshold ?? 150;
  const minW = Math.max(40, width * (options.minWidthRatio ?? 0.06));
  const minH = Math.max(40, height * (options.minHeightRatio ?? 0.035));

  // Mỗi "ô" lưới gồm cell x cell điểm ảnh (giảm khối lượng tính toán)
  const cell = Math.max(4, Math.round(Math.max(width, height) / 350));
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const ink = new Uint8Array(gw * gh);

  for (let y = 0; y < height; y++) {
    const gy = Math.floor(y / cell);
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x] < inkThreshold) ink[gy * gw + Math.floor(x / cell)] = 1;
    }
  }

  // Xoá mực trong vùng chữ
  for (const b of textBoxes) {
    const x0 = Math.max(0, Math.floor((b.x0 - cell) / cell));
    const x1 = Math.min(gw - 1, Math.ceil((b.x1 + cell) / cell));
    const y0 = Math.max(0, Math.floor((b.y0 - cell) / cell));
    const y1 = Math.min(gh - 1, Math.ceil((b.y1 + cell) / cell));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) ink[gy * gw + gx] = 0;
  }

  // Nối các nét gần nhau (cách tối đa `reach` ô) bằng loang theo vùng
  const reach = 2;
  const label = new Int32Array(gw * gh).fill(-1);
  const comps: { x0: number; y0: number; x1: number; y1: number; count: number }[] = [];

  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || label[start] !== -1) continue;
    const id = comps.length;
    const comp = { x0: gw, y0: gh, x1: 0, y1: 0, count: 0 };
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const cx = cur % gw;
      const cy = (cur - cx) / gw;
      comp.x0 = Math.min(comp.x0, cx); comp.x1 = Math.max(comp.x1, cx);
      comp.y0 = Math.min(comp.y0, cy); comp.y1 = Math.max(comp.y1, cy);
      comp.count++;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (ink[ni] && label[ni] === -1) { label[ni] = id; stack.push(ni); }
        }
      }
    }
    comps.push(comp);
  }

  const pad = cell * 2;
  const figures: Box[] = [];
  for (const c of comps) {
    const box: Box = {
      x0: Math.max(0, c.x0 * cell - pad),
      y0: Math.max(0, c.y0 * cell - pad),
      x1: Math.min(width, (c.x1 + 1) * cell + pad),
      y1: Math.min(height, (c.y1 + 1) * cell + pad),
    };
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    if (w < minW || h < minH) continue;                              // quá nhỏ (nét vụn, dấu chấm)
    if (w > width * 0.85 && h > height * 0.85) continue;            // khung viền cả trang
    if (h < height * 0.02 && w > width * 0.4) continue;             // đường kẻ ngang
    const density = c.count / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1));
    if (density < 0.02) continue;                                    // gần như trống
    figures.push(box);
  }

  // Sắp xếp từ trên xuống dưới
  return figures.sort((a, b) => a.y0 - b.y0);
}
