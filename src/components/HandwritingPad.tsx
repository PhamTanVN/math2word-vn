/**
 * HandwritingPad.tsx - Viết tay công thức bằng chuột / ngón tay / bút cảm ứng.
 * Cứ dừng bút khoảng 0,7 giây là công thức được nhận dạng lại (thời gian thực),
 * bằng mô hình chạy ngay trong trình duyệt - không cần mạng sau lần tải đầu.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import { formulaEngine, FormulaStatus } from '../ocr/formulaEngine.ts';
import { MathRenderer } from './MathRenderer.tsx';

type Point = { x: number; y: number };
type Stroke = Point[];

interface Props {
  /** gọi mỗi khi có kết quả nhận dạng mới */
  onLatex: (latex: string) => void;
  height?: number;
}

const PEN_WIDTH = 3.5;
const IDLE_MS = 700;

/** Vẽ toàn bộ nét lên canvas */
function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale = 1, dx = 0, dy = 0, width = PEN_WIDTH) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineWidth = width;
  for (const s of strokes) {
    if (s.length === 0) continue;
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc((s[0].x - dx) * scale, (s[0].y - dy) * scale, width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo((s[0].x - dx) * scale, (s[0].y - dy) * scale);
    for (let i = 1; i < s.length; i++) ctx.lineTo((s[i].x - dx) * scale, (s[i].y - dy) * scale);
    ctx.stroke();
  }
}

/** Tạo ảnh PNG (nền trắng, nét đen) chứa riêng phần đã viết, có lề, để đưa vào mô hình */
function renderForModel(strokes: Stroke[]): Promise<Blob> {
  const pts = strokes.flat();
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const pad = 24;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  // Chữ viết nhỏ thì phóng lên để mô hình đọc rõ; chữ quá lớn thì thu nhỏ
  const scale = Math.min(3, Math.max(0.5, 160 / Math.max(h, 1)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(32, Math.round(w * scale));
  canvas.height = Math.max(32, Math.round(h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStrokes(ctx, strokes, scale, minX - pad, minY - pad, Math.max(2.5, PEN_WIDTH * scale * 0.9));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), 'image/png'));
}

export const HandwritingPad: React.FC<Props> = ({ onLatex, height = 220 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);

  const [latex, setLatex] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [engine, setEngine] = useState<FormulaStatus>(formulaEngine.status);

  useEffect(() => formulaEngine.subscribe(setEngine), []);
  // Bắt đầu tải mô hình ngay khi mở ô viết tay để lúc viết xong là có kết quả
  useEffect(() => { formulaEngine.load().catch(() => {}); }, []);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    drawStrokes(ctx, strokesRef.current);
  }, []);

  // Đặt kích thước canvas theo độ rộng khung (sắc nét trên màn hình điện thoại)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => {
      const rect = c.getBoundingClientRect();
      c.width = Math.max(200, Math.round(rect.width));
      c.height = height;
      redraw();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [height, redraw]);

  const recognize = useCallback(async () => {
    const strokes = strokesRef.current;
    if (strokes.length === 0) { setLatex(''); onLatex(''); return; }
    const myRequest = ++requestRef.current;
    setBusy(true);
    setError('');
    try {
      const blob = await renderForModel(strokes);
      const result = await formulaEngine.recognize(blob);
      if (myRequest !== requestRef.current) return;   // đã có nét mới hơn, bỏ kết quả cũ
      setLatex(result);
      onLatex(result);
    } catch (e: any) {
      if (myRequest !== requestRef.current) return;
      setError(e?.message || 'Không nhận dạng được');
    } finally {
      if (myRequest === requestRef.current) setBusy(false);
    }
  }, [onLatex]);

  const scheduleRecognize = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(recognize, IDLE_MS);
  }, [recognize]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width, y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    drawingRef.current = true;
    strokesRef.current.push([pointFromEvent(e)]);
    redraw();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const cur = strokesRef.current[strokesRef.current.length - 1];
    cur.push(pointFromEvent(e));
    redraw();
  };
  const onUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    scheduleRecognize();
  };

  const undo = () => {
    strokesRef.current.pop();
    redraw();
    scheduleRecognize();
  };
  const clear = () => {
    strokesRef.current = [];
    requestRef.current++;
    redraw();
    setLatex('');
    setBusy(false);
    onLatex('');
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-indigo-200 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full block"
          style={{ height, touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
        />
        {strokesRef.current.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none px-4 text-center">
            Viết công thức vào đây (bằng chuột, ngón tay hoặc bút)
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <button type="button" onClick={undo} className="p-1.5 rounded-lg bg-white/90 border border-slate-200 hover:bg-slate-50" title="Xóa nét cuối">
            <Undo2 className="w-4 h-4 text-slate-600" />
          </button>
          <button type="button" onClick={clear} className="p-1.5 rounded-lg bg-white/90 border border-slate-200 hover:bg-slate-50" title="Xóa hết">
            <Eraser className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="text-xs min-h-[1.25rem]">
        {engine.state === 'loading' && (
          <span className="text-amber-700">Đang tải mô hình nhận dạng công thức... {engine.percent}% (chỉ tải lần đầu)</span>
        )}
        {engine.state === 'error' && (
          <span className="text-red-600">Không tải được mô hình công thức: {engine.message}. Bạn vẫn có thể gõ công thức ở tab "Bàn phím công thức".</span>
        )}
        {engine.state !== 'loading' && engine.state !== 'error' && busy && <span className="text-indigo-700">Đang nhận dạng...</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>

      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[3.5rem]">
        <span className="text-[11px] text-slate-500 font-semibold block mb-1">Kết quả nhận dạng (thời gian thực):</span>
        {latex ? (
          <>
            <div className="text-base"><MathRenderer content={`$${latex}$`} /></div>
            <code className="block mt-1 text-[11px] text-slate-500 break-all">{latex}</code>
          </>
        ) : (
          <span className="text-xs text-slate-400">Chưa có</span>
        )}
      </div>
    </div>
  );
};
