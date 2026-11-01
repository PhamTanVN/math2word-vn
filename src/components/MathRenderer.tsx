import React, { useMemo } from 'react';
import katex from 'katex';

interface MathRendererProps {
  content: string;
  className?: string;
  block?: boolean;
}

/**
 * Safely renders text with embedded LaTeX formulas ($...$ or $$...$$) using KaTeX
 */
export const MathRenderer: React.FC<MathRendererProps> = ({ content, className = '', block = false }) => {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    // Split by $...$ and $$...$$
    const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
    let result = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      // Normal text before formula
      if (match.index > lastIndex) {
        const textChunk = content.slice(lastIndex, match.index);
        result += escapeHtml(textChunk);
      }

      const rawFormula = match[0];
      const isDisplay = rawFormula.startsWith('$$');
      const mathExpr = rawFormula.replace(/^\$+|\$+$/g, '').trim();

      try {
        const renderedMath = katex.renderToString(mathExpr, {
          displayMode: isDisplay,
          throwOnError: false,
          output: 'htmlAndMathml',
        });
        result += renderedMath;
      } catch (err) {
        result += `<span class="text-amber-600 font-mono text-sm bg-amber-50 px-1 rounded">${escapeHtml(rawFormula)}</span>`;
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      result += escapeHtml(content.slice(lastIndex));
    }

    return result;
  }, [content]);

  return (
    <span
      className={`math-content ${block ? 'block' : 'inline'} ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
