/**
 * copy-ocr-assets.mjs
 * ------------------------------------------------------------
 * Copy các file cần cho việc nhận dạng chạy TRÊN TRÌNH DUYỆT vào thư mục
 * public/ocr/, để web không phụ thuộc CDN bên ngoài (mạng trường học hay chậm):
 *
 *   public/ocr/tesseract/worker.min.js        -> "công nhân" của Tesseract
 *   public/ocr/tesseract-core/*               -> lõi WASM của Tesseract
 *   public/ocr/tessdata/{vie,eng}.traineddata.gz -> dữ liệu ngôn ngữ Việt + Anh
 *   public/ocr/ort/*                          -> lõi WASM của onnxruntime-web
 *                                                (chạy mô hình công thức)
 *   public/ocr/mathlive-fonts/*                -> font của bộ gõ công thức MathLive
 *
 * Script tự chạy trước `npm run dev` và `npm run build`.
 */
import { cpSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const out = (...p) => join(root, 'public', 'ocr', ...p);

function copy(from, to) {
  if (!existsSync(from)) {
    console.warn(`[copy-ocr-assets] Không thấy: ${from} (bạn đã chạy "npm install" chưa?)`);
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

// 1) Tesseract: worker + lõi WASM (chỉ bản LSTM vì ta dùng engine LSTM)
copy(nm('tesseract.js', 'dist', 'worker.min.js'), out('tesseract', 'worker.min.js'));
const coreDir = nm('tesseract.js-core');
if (existsSync(coreDir)) {
  for (const f of readdirSync(coreDir)) {
    if (/-lstm\.(js|wasm|wasm\.js)$/.test(f)) copy(join(coreDir, f), out('tesseract-core', f));
  }
}

// 2) Dữ liệu ngôn ngữ (bản "best_int": chính xác cao, file nhỏ)
for (const lang of ['vie', 'eng']) {
  copy(
    nm('@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`),
    out('tessdata', `${lang}.traineddata.gz`),
  );
}

// 3) onnxruntime-web: chỉ cần bản WASM thường + asyncify (bỏ bản WebGPU cho nhẹ)
const ortDir = nm('onnxruntime-web', 'dist');
if (existsSync(ortDir)) {
  for (const f of readdirSync(ortDir)) {
    if (/^ort-wasm-simd-threaded(\.asyncify)?\.(wasm|mjs)$/.test(f)) copy(join(ortDir, f), out('ort', f));
  }
}

// 4) Font của bộ gõ công thức MathLive
copy(nm('mathlive', 'fonts'), out('mathlive-fonts'));

console.log('[copy-ocr-assets] Xong -> public/ocr/');
