/**
 * formulaEngine.ts - Cầu nối giữa giao diện và Web Worker nhận dạng công thức.
 * Dùng: await formulaEngine.recognize(pngBlob) -> chuỗi LaTeX.
 */
import { cleanFormulaLatex } from './latexClean.ts';

export type FormulaStatus = { state: 'idle' | 'loading' | 'ready' | 'error'; percent: number; message?: string };

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

class FormulaEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private loadPromise: Promise<void> | null = null;
  private listeners = new Set<(s: FormulaStatus) => void>();
  status: FormulaStatus = { state: 'idle', percent: 0 };

  subscribe(fn: (s: FormulaStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: FormulaStatus) {
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./formulaWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'progress') {
        this.setStatus({ state: 'loading', percent: m.percent });
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === 'error') p.reject(new Error(m.message));
      else p.resolve(m);
    };
    w.onerror = (e) => {
      const err = new Error(e.message || 'Worker công thức bị lỗi');
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
      this.setStatus({ state: 'error', percent: 0, message: err.message });
    };
    this.worker = w;
    return w;
  }

  private request(payload: Record<string, unknown>, transfer?: Transferable[]): Promise<any> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...payload, id }, transfer ?? []);
    });
  }

  /** Tải mô hình (chỉ tải một lần). Có thể gọi sớm để người dùng không phải chờ khi bấm nhận dạng. */
  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.setStatus({ state: 'loading', percent: 0 });
    this.loadPromise = this.request({ type: 'load' })
      .then(() => this.setStatus({ state: 'ready', percent: 100 }))
      .catch((err) => {
        this.loadPromise = null;
        this.setStatus({ state: 'error', percent: 0, message: err.message });
        throw err;
      });
    return this.loadPromise;
  }

  /** Nhận dạng một ảnh công thức -> LaTeX đã làm sạch (không có $) */
  async recognize(image: Blob): Promise<string> {
    await this.load();
    const res = await this.request({ type: 'recognize', blob: image });
    const { latex, trailing } = cleanFormulaLatex(res.latex);
    return latex + trailing;
  }
}

export const formulaEngine = new FormulaEngine();
