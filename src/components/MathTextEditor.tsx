/**
 * MathTextEditor.tsx - Ô sửa nội dung có công thức, xem trước ngay lập tức:
 *   - Gõ chữ bình thường; công thức nằm trong $...$
 *   - Bấm "Chèn công thức" để soạn công thức bằng bàn phím toán hoặc viết tay
 *   - Bấm trực tiếp vào một công thức ở phần xem trước để sửa riêng công thức đó
 */
import React, { useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { Sigma } from 'lucide-react';
import { FormulaDialog } from './FormulaDialog.tsx';
import { splitMathSegments, replaceMathSegment, insertMath, Segment } from '../utils/mathSegments.ts';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** true: ô một dòng (dùng cho đáp án A/B/C/D) */
  singleLine?: boolean;
  rows?: number;
  placeholder?: string;
}

type DialogState = { mode: 'insert' } | { mode: 'edit'; segment: Segment } | null;

function renderKatex(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' });
  } catch {
    return `<span class="text-amber-600 font-mono text-xs">${latex.replace(/</g, '&lt;')}</span>`;
  }
}

export const MathTextEditor: React.FC<Props> = ({ value, onChange, singleLine = false, rows = 4, placeholder }) => {
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const selection = useRef({ start: value.length, end: value.length });
  const [dialog, setDialog] = useState<DialogState>(null);

  const segments = useMemo(() => splitMathSegments(value), [value]);

  const rememberSelection = () => {
    const el = inputRef.current;
    if (el) selection.current = { start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length };
  };

  const submit = (latex: string) => {
    if (dialog?.mode === 'edit') {
      onChange(replaceMathSegment(value, dialog.segment, latex));
    } else {
      const { text } = insertMath(value, selection.current.start, selection.current.end, latex);
      onChange(text);
    }
    setDialog(null);
  };

  const common = {
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onChange(e.target.value),
    onSelect: rememberSelection,
    onBlur: rememberSelection,
    onKeyUp: rememberSelection,
    onClick: rememberSelection,
    placeholder,
    className: 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500',
  };

  return (
    <div className="space-y-1.5">
      {singleLine ? (
        <input ref={inputRef as React.RefObject<HTMLInputElement>} type="text" {...common} />
      ) : (
        <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} rows={rows} {...common} />
      )}

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => { rememberSelection(); setDialog({ mode: 'insert' }); }}
          className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
          <Sigma className="w-3.5 h-3.5" /> Chèn công thức / viết tay
        </button>
        <span className="text-[10px] text-slate-400">Bấm vào công thức bên dưới để sửa</span>
      </div>

      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-sm leading-relaxed min-h-[2.5rem] whitespace-pre-wrap">
        {segments.length === 0 && <span className="text-xs text-slate-400">Xem trước sẽ hiện ở đây</span>}
        {segments.map((seg, i) =>
          seg.type === 'text' ? (
            <span key={i}>{seg.value}</span>
          ) : (
            <button key={i} type="button" title="Bấm để sửa công thức này"
              onClick={() => setDialog({ mode: 'edit', segment: seg })}
              className="inline-block align-middle px-0.5 mx-0.5 rounded hover:bg-indigo-100 hover:ring-1 hover:ring-indigo-300 cursor-pointer"
              dangerouslySetInnerHTML={{ __html: renderKatex(seg.value, !!seg.display) }} />
          ),
        )}
      </div>

      {dialog && (
        <FormulaDialog
          key={dialog.mode === 'edit' ? `edit-${dialog.segment.start}` : 'insert'}
          title={dialog.mode === 'edit' ? 'Sửa công thức' : 'Chèn công thức mới'}
          initialLatex={dialog.mode === 'edit' ? dialog.segment.value : ''}
          onCancel={() => setDialog(null)}
          onSubmit={submit}
          onDelete={dialog.mode === 'edit' ? () => { onChange(replaceMathSegment(value, dialog.segment, '')); setDialog(null); } : undefined}
        />
      )}
    </div>
  );
};
