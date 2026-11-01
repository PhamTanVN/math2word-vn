/**
 * formulaWorker.ts - Chạy mô hình nhận dạng công thức (ảnh -> LaTeX) trong Web Worker,
 * để trang web không bị đơ khi mô hình đang tính toán.
 */
import { pipeline, env, RawImage } from '@huggingface/transformers';
import { OCR_CONFIG } from './config.ts';

env.allowLocalModels = OCR_CONFIG.useLocalModel;
env.allowRemoteModels = true;
env.localModelPath = OCR_CONFIG.localModelPath;
// Dùng file WASM tự lưu trên web (không phụ thuộc CDN bên ngoài)
(env.backends.onnx as any).wasm.wasmPaths = OCR_CONFIG.paths.onnxRuntime;

let recognizer: any = null;

/** Gom tiến độ tải của nhiều file mô hình thành một phần trăm */
function makeProgressTracker(post: (percent: number) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (p: any) => {
    if (p?.status === 'progress' && p.file && p.total) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0, total = 0;
      files.forEach((f) => { loaded += f.loaded; total += f.total; });
      post(total > 0 ? Math.round((loaded / total) * 100) : 0);
    }
  };
}

async function load(post: (percent: number) => void) {
  if (recognizer) return;
  let lastError: unknown;
  for (const dtype of OCR_CONFIG.modelDtypes) {
    try {
      recognizer = await pipeline('image-to-text', OCR_CONFIG.formulaModelId, {
        dtype,
        device: 'wasm',
        progress_callback: makeProgressTracker(post),
      } as any);
      return;
    } catch (err) {
      lastError = err;
      console.warn(`Tải mô hình công thức (${dtype}) thất bại, thử kiểu khác...`, err);
    }
  }
  throw lastError;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      await load((percent) => self.postMessage({ type: 'progress', percent }));
      self.postMessage({ type: 'loaded', id: msg.id });
    } else if (msg.type === 'recognize') {
      await load(() => {});
      const image = await RawImage.fromBlob(msg.blob);
      const out = await recognizer(image, { max_new_tokens: OCR_CONFIG.maxNewTokens });
      const text = Array.isArray(out) ? out[0]?.generated_text ?? '' : out?.generated_text ?? '';
      self.postMessage({ type: 'result', id: msg.id, latex: String(text) });
    }
  } catch (err: any) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err?.message ?? err) });
  }
};
