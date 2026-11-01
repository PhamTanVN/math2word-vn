/**
 * FormulaDialog.tsx - Hộp soạn công thức. Hai cách nhập:
 *   1) "Bàn phím công thức": ô nhập toán trực quan MathLive (có bàn phím ảo trên điện thoại)
 *   2) "Viết tay": viết trực tiếp, nhận dạng thời gian thực
 */
import React, { useEffect, useRef, useState } from 'react';
import { MathfieldElement } from 'mathlive';
import { X, Keyboard, PenLine } from 'lucide-react';
import { HandwritingPad } from './HandwritingPad.tsx';
import { MathRenderer } from './MathRenderer.tsx';

// Font của MathLive được script copy-ocr-assets.mjs chép vào public/ocr/mathlive-fonts
const BASE: string = (import.meta as any).env?.BASE_URL ?? '/';
MathfieldElement.fontsDirectory = `${BASE}ocr/mathlive-fonts`;
MathfieldElement.soundsDirectory = null;

interface Props {
  /** LaTeX ban đầu (rỗng nếu là công thức mới) */
  initialLatex: string;
  title?: string;
  onCancel: () => void;
  onSubmit: (latex: string) => void;
  /** cho phép xoá công thức đang sửa */
  onDelete?: () => void;
}

/** Các mẫu công thức hay dùng, bấm là chèn vào ô nhập */
const QUICK: { label: string; latex: string; title: string }[] = [
  { label: 'a/b', latex: '\\frac{#@}{#?}', title: 'Phân số' },
  { label: '√', latex: '\\sqrt{#@}', title: 'Căn bậc hai' },
  { label: 'xⁿ', latex: '#@^{#?}', title: 'Số mũ' },
  { label: 'xₙ', latex: '#@_{#?}', title: 'Chỉ số dưới' },
  { label: '∫', latex: '\\int_{#?}^{#?} #@', title: 'Tích phân' },
  { label: '∑', latex: '\\sum_{#?}^{#?} #@', title: 'Tổng' },
  { label: 'lim', latex: '\\lim_{#?\\to #?} #@', title: 'Giới hạn' },
  { label: 'AB⃗', latex: '\\overrightarrow{#@}', title: 'Vectơ' },
  { label: '∠', latex: '\\widehat{#@}', title: 'Góc' },
  { label: 'Hệ', latex: '\\begin{cases} #? \\\\ #? \\end{cases}', title: 'Hệ phương trình' },
  { label: '≤', latex: '\\leqslant ', title: 'Nhỏ hơn hoặc bằng' },
  { label: '≥', latex: '\\geqslant ', title: 'Lớn hơn hoặc bằng' },
  { label: '∞', latex: '\\infty ', title: 'Vô cùng' },
  { label: 'ℝ', latex: '\\mathbb{R}', title: 'Tập số thực' },
];

export const FormulaDialog: React.FC<Props> = ({ initialLatex, title = 'Soạn công thức', onCancel, onSubmit, onDelete }) => {
  const fieldHost = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [tab, setTab] = useState<'keyboard' | 'pen'>('keyboard');
  const [latex, setLatex] = useState(initialLatex);

  // Tạo ô nhập MathLive một lần
  useEffect(() => {
    const mf = new MathfieldElement();
    mf.value = initialLatex;
    mf.mathVirtualKeyboardPolicy = 'auto';     // tự hiện bàn phím ảo trên màn hình cảm ứng
    mf.smartFence = true;
    mf.style.cssText = 'display:block;width:100%;font-size:1.4rem;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;';
    mf.addEventListener('input', () => setLatex(mf.value));
    fieldHost.current?.appendChild(mf);
    fieldRef.current = mf;
    setTimeout(() => mf.focus(), 50);
    return () => { mf.remove(); fieldRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertQuick = (snippet: string) => {
    const mf = fieldRef.current;
    if (!mf) return;
    mf.focus();
    mf.executeCommand(['insert', snippet, { format: 'latex', selectionMode: 'placeholder' }] as any);
    setLatex(mf.value);
  };

  /** Dùng kết quả viết tay: đưa vào ô nhập để chỉnh tiếp */
  const adoptHandwriting = (l: string) => {
    if (!l) return;
    fieldRef.current && (fieldRef.current.value = l);
    setLatex(l);
  };
  const [penLatex, setPenLatex] = useState('');

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 flex gap-2 border-b border-slate-100">
          <button type="button" onClick={() => setTab('keyboard')}
            className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 ${tab === 'keyboard' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>
            <Keyboard className="w-4 h-4" /> Bàn phím công thức
          </button>
          <button type="button" onClick={() => setTab('pen')}
            className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 ${tab === 'pen' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>
            <PenLine className="w-4 h-4" /> Viết tay
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Ô MathLive luôn tồn tại (chỉ ẩn khi ở tab viết tay) để không mất nội dung */}
          <div className={tab === 'keyboard' ? 'space-y-3' : 'hidden'}>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button key={q.title} type="button" title={q.title} onClick={() => insertQuick(q.latex)}
                  className="px-2.5 py-1 text-sm rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 min-w-[2.5rem]">
                  {q.label}
                </button>
              ))}
            </div>
            <div ref={fieldHost} />
            <p className="text-[11px] text-slate-500">Mẹo: trên điện thoại, bấm vào ô để hiện bàn phím công thức. Gõ <code>/</code> để tạo phân số, <code>^</code> cho số mũ, <code>sqrt</code> cho căn.</p>
          </div>

          {tab === 'pen' && (
            <div className="space-y-2">
              <HandwritingPad onLatex={setPenLatex} />
              <button type="button" disabled={!penLatex}
                onClick={() => { adoptHandwriting(penLatex); setTab('keyboard'); }}
                className="w-full py-2 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40">
                Dùng kết quả này và chỉnh sửa tiếp
              </button>
            </div>
          )}

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block mb-1">Xem trước:</span>
            <div className="text-lg min-h-[1.75rem]">{latex ? <MathRenderer content={`$${latex}$`} /> : <span className="text-xs text-slate-400">Chưa có công thức</span>}</div>
          </div>
        </div>

        <div className="px-5 pb-5 flex items-center justify-between gap-3">
          <div>{onDelete && <button type="button" onClick={onDelete} className="text-xs font-semibold text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg">Xóa công thức</button>}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Hủy</button>
            <button type="button" disabled={!latex.trim()} onClick={() => onSubmit(latex)}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-40">
              Chèn công thức
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
