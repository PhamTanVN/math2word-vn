/**
 * mathParser.ts
 * ------------------------------------------------------------
 * Chuyển công thức LaTeX (ví dụ "\frac{a^3\sqrt{2}}{6}") thành công thức gốc
 * của Microsoft Word (Word Equation / OMML) để thầy cô bấm vào là sửa được.
 *
 * Gồm 3 bước, mỗi bước là một hàm riêng để dễ đọc:
 *   1. tokenizeLatex()   : cắt chuỗi LaTeX thành các "mảnh" (token)
 *   2. parseLatexToAST() : ghép các mảnh thành cây cấu trúc (AST)
 *   3. astToDocxMath()   : đổi cây cấu trúc thành các thành phần của thư viện docx
 *
 * Hỗ trợ: phân số, căn (kể cả căn bậc n), số mũ / chỉ số dưới (kể cả {...}),
 * \left...\right, tích phân, tổng, giới hạn, hàm (sin, log...), dấu mũ góc \widehat,
 * vectơ \overrightarrow, gạch ngang \overline, hệ phương trình (cases), ma trận,
 * ký hiệu Hy Lạp & ký hiệu toán học thường gặp trong đề Toán Việt Nam.
 */
import {
  Math as DocxMath,
  MathRun,
  MathFraction,
  MathRadical,
  MathSuperScript,
  MathSubScript,
  MathSubSuperScript,
  MathLimitLower,
} from 'docx';
import {
  ommlAccent,
  ommlBar,
  ommlDelimiter,
  ommlEqArray,
  ommlMatrix,
  ommlNary,
  ommlNoBarFraction,
} from './omml.ts';

/* ------------------------------------------------------------------ */
/* Kiểu dữ liệu                                                        */
/* ------------------------------------------------------------------ */

type RunStyle = 'plain' | 'bold' | 'italic' | 'boldItalic';
type RunScript = 'roman' | 'script' | 'fraktur' | 'doubleStruck' | 'sansSerif' | 'monospace';

export type MathNode =
  | { type: 'run'; text: string; normal?: boolean; style?: RunStyle; script?: RunScript }
  | { type: 'frac'; num: MathNode[]; den: MathNode[]; noBar?: boolean }
  | { type: 'sqrt'; body: MathNode[]; degree?: MathNode[] }
  | { type: 'script'; base: MathNode[]; sub?: MathNode[]; sup?: MathNode[] }
  | { type: 'nary'; chr: string; sub?: MathNode[]; sup?: MathNode[]; body: MathNode[]; aboveBelow: boolean }
  | { type: 'limit'; name: string; sub: MathNode[] }
  | { type: 'delim'; open: string; close: string; body: MathNode[] }
  | { type: 'accent'; chr: string; body: MathNode[] }
  | { type: 'bar'; pos: 'top' | 'bot'; body: MathNode[] }
  | { type: 'cases'; rows: MathNode[][][]; braces: boolean }
  | { type: 'matrix'; rows: MathNode[][][]; open: string; close: string };

/* ------------------------------------------------------------------ */
/* Bảng ký hiệu                                                         */
/* ------------------------------------------------------------------ */

const SYMBOLS: Record<string, string> = {
  // Chữ Hy Lạp thường
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
  sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω',
  // Chữ Hy Lạp hoa
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // Phép toán, quan hệ
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗', star: '⋆', circ: '∘',
  le: '≤', leq: '≤', leqslant: '⩽', ge: '≥', geq: '≥', geqslant: '⩾',
  ne: '≠', neq: '≠', approx: '≈', equiv: '≡', propto: '∝', sim: '∼', simeq: '≃', cong: '≅',
  ll: '≪', gg: '≫', mid: '|', nmid: '∤',
  // Tập hợp, logic
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇',
  nsubseteq: '⊈', cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅', setminus: '∖',
  forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬', land: '∧', lor: '∨',
  wedge: '∧', vee: '∨', because: '∵', therefore: '∴',
  // Hình học
  perp: '⊥', parallel: '∥', angle: '∠', triangle: '△', square: '□', degree: '°',
  measuredangle: '∡',
  // Mũi tên
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', mapsto: '↦',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⇔', implies: '⇒',
  uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', Longrightarrow: '⟹',
  // Khác
  infty: '∞', partial: '∂', nabla: '∇', prime: '′', ell: 'ℓ', hbar: 'ℏ',
  dots: '…', ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', langle: '⟨', rangle: '⟩',
  lvert: '|', rvert: '|', vert: '|', lVert: '‖', rVert: '‖', Vert: '‖',
  '{': '{', '}': '}', '%': '%', $: '$', '&': '&', '#': '#', _: '_', '|': '‖',
};

/** Khoảng trắng: phải bọc dạng "normal text" thì Word mới giữ lại */
const SPACES: Record<string, string> = {
  ',': '\u2009', ':': '\u2005', ';': '\u2004', ' ': ' ', quad: '\u2003', qquad: '\u2003\u2003', '!': '',
};

/** Hàm có tên: hiển thị chữ đứng (không nghiêng) */
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'arccot',
  'sinh', 'cosh', 'tanh', 'coth', 'ln', 'log', 'lg', 'exp', 'det', 'gcd', 'dim', 'deg', 'ker', 'arg', 'Pr',
]);

/** Toán tử có cận nằm dưới: \lim_{x \to 0} */
const LIMIT_OPS = new Set(['lim', 'max', 'min', 'sup', 'inf', 'limsup', 'liminf', 'argmax', 'argmin']);

/** Toán tử cỡ lớn: [ký tự, cận nằm trên/dưới (true) hay bên cạnh (false)] */
const NARY: Record<string, [string, boolean]> = {
  sum: ['∑', true], prod: ['∏', true], coprod: ['∐', true],
  bigcup: ['⋃', true], bigcap: ['⋂', true],
  int: ['∫', false], iint: ['∬', false], iiint: ['∭', false], oint: ['∮', false],
};

/** Dấu đặt trên chữ (accent). Ký tự là dấu "kết hợp" của Unicode */
const ACCENTS: Record<string, string> = {
  hat: '\u0302', widehat: '\u0302', check: '\u030C', tilde: '\u0303', widetilde: '\u0303',
  vec: '\u20D7', overrightarrow: '\u20D7', overleftarrow: '\u20D6', overleftrightarrow: '\u20E1',
  dot: '\u0307', ddot: '\u0308', acute: '\u0301', grave: '\u0300',
};

/** Lệnh bỏ qua (chỉ ảnh hưởng cách trình bày trong LaTeX) */
const IGNORED = new Set([
  'displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'relax', 'nonumber',
  'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'Biggl', 'Biggr',
  'hfill', 'strut', 'protect',
]);

const BLACKBOARD: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ' };

/** Ký tự ngoặc dùng với \left / \right */
function delimiterChar(raw: string): string {
  if (raw === '.' || raw === '') return '';
  if (raw === '{' || raw === '\\{') return '{';
  if (raw === '}' || raw === '\\}') return '}';
  if (raw === '\\|' || raw === '\\Vert' || raw === '\\lVert' || raw === '\\rVert') return '‖';
  if (raw === '\\lvert' || raw === '\\rvert' || raw === '\\vert' || raw === '|') return '|';
  if (raw.startsWith('\\')) return SYMBOLS[raw.slice(1)] ?? raw.slice(1);
  return raw;
}

/* ------------------------------------------------------------------ */
/* Bước 1: Tách token                                                   */
/* ------------------------------------------------------------------ */

type TokKind = 'cmd' | 'ch' | 'num' | 'lbrace' | 'rbrace' | 'sup' | 'sub' | 'amp' | 'nl' | 'text' | 'begin' | 'end';

export interface Token {
  kind: TokKind;
  value: string;
  /** chỉ dùng cho 'text': 'text' (chữ thường), 'plain' (chữ đứng trong toán), 'bold' */
  mode?: 'text' | 'plain' | 'bold';
}

const TEXT_COMMANDS: Record<string, 'text' | 'plain' | 'bold'> = {
  text: 'text', textrm: 'text', mbox: 'text', textit: 'text',
  mathrm: 'plain', operatorname: 'plain', mathsf: 'plain', textbf: 'bold',
};

/** Đọc nội dung trong {...} thô, trả về [nội dung, vị trí sau dấu }] */
function readRawGroup(s: string, from: number): [string, number] | null {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== '{') return null;
  let depth = 0;
  const start = i + 1;
  for (; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return [s.slice(start, i), i + 1];
    }
  }
  return [s.slice(start), s.length]; // thiếu dấu }: lấy hết phần còn lại
}

export function tokenizeLatex(latex: string): Token[] {
  const s = latex.trim();
  const tokens: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (/\s/.test(ch)) { i++; continue; }

    if (ch === '\\') {
      // "\\" = xuống dòng
      if (s[i + 1] === '\\') { tokens.push({ kind: 'nl', value: '\\\\' }); i += 2; continue; }
      let j = i + 1;
      if (j < s.length && /[a-zA-Z]/.test(s[j])) {
        while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        const name = s.slice(i + 1, j);

        if (name === 'begin' || name === 'end') {
          const raw = readRawGroup(s, j);
          if (raw) {
            tokens.push({ kind: name, value: raw[0].trim() });
            i = raw[1];
            continue;
          }
        }
        if (name in TEXT_COMMANDS) {
          const raw = readRawGroup(s, j);
          if (raw) {
            tokens.push({ kind: 'text', value: raw[0], mode: TEXT_COMMANDS[name] });
            i = raw[1];
            continue;
          }
        }
        tokens.push({ kind: 'cmd', value: name });
        i = j;
        continue;
      }
      // "\{", "\,", "\;", "\ " ... (lệnh 1 ký tự)
      tokens.push({ kind: 'cmd', value: s[j] ?? '' });
      i = j + 1;
      continue;
    }

    if (ch === '{') { tokens.push({ kind: 'lbrace', value: ch }); i++; continue; }
    if (ch === '}') { tokens.push({ kind: 'rbrace', value: ch }); i++; continue; }
    if (ch === '^') { tokens.push({ kind: 'sup', value: ch }); i++; continue; }
    if (ch === '_') { tokens.push({ kind: 'sub', value: ch }); i++; continue; }
    if (ch === '&') { tokens.push({ kind: 'amp', value: ch }); i++; continue; }

    // Số: 12, 3.14, 3,5 (dấu , hoặc . chỉ dính vào số nếu theo sau là chữ số)
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && (/[0-9]/.test(s[j]) || ((s[j] === '.' || s[j] === ',') && /[0-9]/.test(s[j + 1] ?? '')))) j++;
      tokens.push({ kind: 'num', value: s.slice(i, j) });
      i = j;
      continue;
    }

    tokens.push({ kind: 'ch', value: ch });
    i++;
  }

  return tokens;
}

/* ------------------------------------------------------------------ */
/* Bước 2: Dựng cây (AST)                                               */
/* ------------------------------------------------------------------ */

class Parser {
  private pos = 0;
  constructor(private readonly toks: Token[]) {}

  private peek(): Token | undefined { return this.toks[this.pos]; }
  private next(): Token | undefined { return this.toks[this.pos++]; }
  private atEnd(): boolean { return this.pos >= this.toks.length; }
  private isCmd(t: Token | undefined, name: string): boolean { return !!t && t.kind === 'cmd' && t.value === name; }

  /** Đọc chuỗi các thành phần cho đến khi gặp điều kiện dừng (hoặc hết) */
  parseSequence(stop: (t: Token) => boolean): MathNode[] {
    const out: MathNode[] = [];
    while (!this.atEnd()) {
      const t = this.peek()!;
      if (stop(t)) break;
      if (t.kind === 'rbrace') { this.next(); continue; } // } thừa -> bỏ qua
      out.push(...this.parseTerm());
    }
    return out;
  }

  /** Một "số hạng" = một nguyên tử + các số mũ / chỉ số theo sau */
  private parseTerm(): MathNode[] {
    const first = this.peek();
    const atom = this.parseAtom();

    // Toán tử cỡ lớn đã tự xử lý cận của nó
    if (atom.length === 1 && (atom[0].type === 'nary' || atom[0].type === 'limit')) return atom;

    let sub: MathNode[] | undefined;
    let sup: MathNode[] | undefined;
    while (this.peek() && (this.peek()!.kind === 'sup' || this.peek()!.kind === 'sub')) {
      const op = this.next()!;
      const arg = this.parseScriptArg();
      if (op.kind === 'sup') sup = arg; else sub = arg;
    }

    let result = atom;
    if (sub || sup) result = [{ type: 'script', base: atom, sub, sup }];

    // Sau tên hàm (sin, log...) thêm một khoảng mỏng để không dính vào biến: "sin x"
    if (first?.kind === 'cmd' && FUNCTIONS.has(first.value)) {
      const after = this.peek();
      const startsParen = after && ((after.kind === 'ch' && after.value === '(') || this.isCmd(after, 'left'));
      if (after && !startsParen) result = [...result, { type: 'run', text: '\u2009', normal: true }];
    }
    return result;
  }

  /** Đối số của ^ hoặc _ : nhóm {...} hoặc đúng 1 nguyên tử */
  private parseScriptArg(): MathNode[] {
    const t = this.peek();
    if (!t) return [];
    if (t.kind === 'lbrace') return this.parseGroup();
    return this.parseAtom();
  }

  /** Nhóm {...} */
  private parseGroup(): MathNode[] {
    this.next(); // {
    const body = this.parseSequence((t) => t.kind === 'rbrace');
    if (this.peek()?.kind === 'rbrace') this.next();
    return body;
  }

  /** Đối số bắt buộc của lệnh (như \frac{..}{..}) */
  private parseArg(): MathNode[] {
    return this.parseScriptArg();
  }

  /** Đọc ký tự ngoặc sau \left hoặc \right */
  private readDelimiter(): string {
    const t = this.next();
    if (!t) return '';
    if (t.kind === 'cmd') return delimiterChar('\\' + t.value);
    if (t.kind === 'lbrace') return '{';
    return delimiterChar(t.value);
  }

  private run(text: string, extra: Partial<Extract<MathNode, { type: 'run' }>> = {}): MathNode {
    return { type: 'run', text, ...extra };
  }

  /** Áp kiểu chữ (đậm, nghiêng, chữ rỗng...) lên các ký tự trong nhóm */
  private styled(nodes: MathNode[], patch: { style?: RunStyle; script?: RunScript; blackboard?: boolean }): MathNode[] {
    return nodes.map((n): MathNode => {
      if (n.type !== 'run' || n.normal) return n;
      if (patch.blackboard) {
        const mapped = BLACKBOARD[n.text];
        if (mapped) return { type: 'run', text: mapped, style: 'plain' };
      }
      return { ...n, style: patch.style ?? n.style, script: patch.script ?? n.script };
    });
  }

  /** Thân của \int, \sum...: lấy một "số hạng" (đến dấu + - = , ; hoặc hết nhóm) */
  private parseNaryBody(): MathNode[] {
    const body: MathNode[] = [];
    // Cho phép dấu +/- đứng đầu (số âm)
    const first = this.peek();
    if (first?.kind === 'ch' && (first.value === '-' || first.value === '+')) {
      body.push(this.run(this.next()!.value));
    }
    while (!this.atEnd()) {
      const t = this.peek()!;
      if (t.kind === 'rbrace' || t.kind === 'amp' || t.kind === 'nl' || t.kind === 'end') break;
      if (this.isCmd(t, 'right')) break;
      if (t.kind === 'ch' && '+-=,;<>)]'.includes(t.value)) break;
      if (t.kind === 'cmd' && ['le', 'leq', 'ge', 'geq', 'ne', 'neq', 'approx', 'to', 'pm', 'mp', 'leqslant', 'geqslant'].includes(t.value)) break;
      body.push(...this.parseTerm());
    }
    return body;
  }

  /** Một nguyên tử (chữ, số, lệnh, nhóm) */
  private parseAtom(): MathNode[] {
    const t = this.peek();
    if (!t) return [];
    if (t.kind === 'lbrace') return this.parseGroup();
    this.next();

    switch (t.kind) {
      case 'num':
        return [this.run(t.value)];
      case 'text':
        return [this.run(t.value, t.mode === 'text' ? { normal: true } : { style: t.mode === 'bold' ? 'bold' : 'plain' })];
      case 'amp':
      case 'nl':
        return [this.run(' ', { normal: true })];
      case 'begin':
        return this.parseEnvironment(t.value);
      case 'ch':
        if ((t.value === '(' || t.value === '[') && this.hasCloser()) return [this.parseBracket(t.value)];
        if (t.value === "'") return [this.run('′')];
        if (t.value === '~') return [this.run('\u00A0', { normal: true })];
        return [this.run(t.value)];
      case 'cmd':
        return this.parseCommand(t.value);
      default:
        return []; // end, rbrace, sup, sub lạc chỗ
    }
  }

  /**
   * Từ vị trí hiện tại (ngay sau dấu mở), có dấu đóng ) hoặc ] tương ứng không?
   * Cho phép cặp lệch như [a; b) hay (a; b] (khoảng nửa mở trong Toán VN).
   */
  private hasCloser(): boolean {
    let depth = 0;
    let braces = 0;
    for (let i = this.pos; i < this.toks.length; i++) {
      const t = this.toks[i];
      if (t.kind === 'lbrace') braces++;
      else if (t.kind === 'rbrace') { braces--; if (braces < 0) return false; }
      else if (t.kind === 'cmd' && (t.value === 'left' || t.value === 'right' || t.value === 'sqrt')) {
        if (t.value !== 'sqrt') i++; // bỏ qua ký tự ngoặc đi kèm \left / \right
      } else if (braces === 0 && t.kind === 'ch') {
        if (t.value === '(' || t.value === '[') depth++;
        else if (t.value === ')' || t.value === ']') {
          if (depth === 0) return true;
          depth--;
        }
      }
    }
    return false;
  }

  /** Đã đọc dấu mở; đọc nội dung đến dấu đóng và tạo khối ngoặc */
  private parseBracket(open: string): MathNode {
    const body = this.parseSequence((x) => x.kind === 'ch' && (x.value === ')' || x.value === ']'));
    const close = this.next()?.value ?? '';
    return { type: 'delim', open, close, body };
  }

  private parseCommand(name: string): MathNode[] {
    if (IGNORED.has(name)) return [];

    if (name in SPACES) {
      const sp = SPACES[name];
      return sp ? [this.run(sp, { normal: true })] : [];
    }

    switch (name) {
      case 'frac': case 'dfrac': case 'tfrac': case 'cfrac': {
        const num = this.parseArg();
        const den = this.parseArg();
        return [{ type: 'frac', num, den }];
      }
      case 'binom': case 'dbinom': case 'tbinom': {
        const n = this.parseArg();
        const k = this.parseArg();
        return [{ type: 'delim', open: '(', close: ')', body: [{ type: 'frac', num: n, den: k, noBar: true }] }];
      }
      case 'sqrt': {
        let degree: MathNode[] | undefined;
        if (this.peek()?.kind === 'ch' && this.peek()!.value === '[') {
          this.next();
          degree = this.parseSequence((x) => x.kind === 'ch' && x.value === ']');
          this.next(); // ]
        }
        return [{ type: 'sqrt', body: this.parseArg(), degree }];
      }
      case 'left': {
        const open = this.readDelimiter();
        const body = this.parseSequence((x) => this.isCmd(x, 'right'));
        let close = '';
        if (this.isCmd(this.peek(), 'right')) { this.next(); close = this.readDelimiter(); }
        return [{ type: 'delim', open, close, body }];
      }
      case 'right': // \right lạc (không có \left): bỏ qua cả ký tự ngoặc sau nó
        this.readDelimiter();
        return [];
      case 'overline': case 'bar': return [{ type: 'bar', pos: 'top', body: this.parseArg() }];
      case 'underline': return [{ type: 'bar', pos: 'bot', body: this.parseArg() }];
      case 'overbrace': case 'underbrace': case 'boxed': case 'phantom': case 'mathop':
        return this.parseArg();
      case 'mathbb': return this.styled(this.parseArg(), { blackboard: true, script: 'doubleStruck' });
      case 'mathcal': case 'mathscr': return this.styled(this.parseArg(), { script: 'script' });
      case 'mathfrak': return this.styled(this.parseArg(), { script: 'fraktur' });
      case 'mathbf': case 'bm': return this.styled(this.parseArg(), { style: 'bold' });
      case 'boldsymbol': return this.styled(this.parseArg(), { style: 'boldItalic' });
      case 'mathit': return this.styled(this.parseArg(), { style: 'italic' });
      default:
        break;
    }

    if (name in ACCENTS) return [{ type: 'accent', chr: ACCENTS[name], body: this.parseArg() }];

    if (name in NARY) {
      const [chr, aboveBelowDefault] = NARY[name];
      let aboveBelow = aboveBelowDefault;
      let sub: MathNode[] | undefined;
      let sup: MathNode[] | undefined;
      // \limits / \nolimits và các cận _ ^ (thứ tự bất kỳ)
      for (let guard = 0; guard < 4; guard++) {
        const p = this.peek();
        if (this.isCmd(p, 'limits')) { aboveBelow = true; this.next(); }
        else if (this.isCmd(p, 'nolimits')) { aboveBelow = false; this.next(); }
        else if (p?.kind === 'sub') { this.next(); sub = this.parseScriptArg(); }
        else if (p?.kind === 'sup') { this.next(); sup = this.parseScriptArg(); }
        else break;
      }
      return [{ type: 'nary', chr, sub, sup, body: this.parseNaryBody(), aboveBelow }];
    }

    if (LIMIT_OPS.has(name)) {
      if (this.isCmd(this.peek(), 'limits') || this.isCmd(this.peek(), 'nolimits')) this.next();
      if (this.peek()?.kind === 'sub') {
        this.next();
        return [{ type: 'limit', name, sub: this.parseScriptArg() }];
      }
      return [this.run(name, { style: 'plain' }), this.run('\u2009', { normal: true })];
    }

    if (FUNCTIONS.has(name)) return [this.run(name, { style: 'plain' })];

    if (name in SYMBOLS) {
      const sym = SYMBOLS[name];
      return sym ? [this.run(sym)] : [];
    }

    // Lệnh lạ: hiện tên lệnh để người dùng thấy và tự sửa
    return [this.run(name, { normal: true })];
  }

  /** \begin{cases} ... \end{cases} và các môi trường tương tự */
  private parseEnvironment(env: string): MathNode[] {
    const rows: MathNode[][][] = [];
    let row: MathNode[][] = [];
    let cell: MathNode[] = [];

    const endCell = () => { row.push(cell); cell = []; };
    const endRow = () => { endCell(); rows.push(row); row = []; };

    while (!this.atEnd()) {
      const t = this.peek()!;
      if (t.kind === 'end') { this.next(); break; }
      if (t.kind === 'amp') { this.next(); endCell(); continue; }
      if (t.kind === 'nl') { this.next(); endRow(); continue; }
      cell.push(...this.parseTerm());
    }
    // Dòng cuối (nếu có nội dung)
    if (cell.length > 0 || row.length > 0) endRow();

    const base = env.replace('*', '');
    if (base === 'cases') return [{ type: 'cases', rows, braces: true }];

    const fences: Record<string, [string, string]> = {
      pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'],
      vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], matrix: ['', ''], smallmatrix: ['', ''],
    };
    if (base in fences) {
      return [{ type: 'matrix', rows, open: fences[base][0], close: fences[base][1] }];
    }
    // array, aligned, align, gathered, split, eqnarray ... : các dòng xếp chồng, không ngoặc
    return [{ type: 'cases', rows, braces: false }];
  }
}

export function parseLatexToAST(latex: string): MathNode[] {
  const parser = new Parser(tokenizeLatex(latex));
  return parser.parseSequence(() => false);
}

/* ------------------------------------------------------------------ */
/* Bước 3: Đổi cây sang thành phần của thư viện docx                     */
/* ------------------------------------------------------------------ */

/** Nối các ô của một dòng bằng khoảng trắng (dùng cho hệ phương trình) */
function joinCells(cells: MathNode[][]): unknown[] {
  const out: unknown[] = [];
  cells.forEach((cell, i) => {
    if (i > 0) out.push(new MathRun({ text: '\u2003', normalText: true }));
    out.push(...astToDocxMath(cell));
  });
  return out;
}

export function astToDocxMath(nodes: MathNode[]): any[] {
  const out: any[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'run': {
        if (node.normal) {
          out.push(new MathRun({ text: node.text, normalText: true }));
        } else if (node.script || node.style) {
          out.push(new MathRun({ text: node.text, style: node.style, script: node.script }));
        } else {
          out.push(new MathRun(node.text));
        }
        break;
      }
      case 'frac':
        if (node.noBar) out.push(ommlNoBarFraction(astToDocxMath(node.num), astToDocxMath(node.den)));
        else out.push(new MathFraction({ numerator: astToDocxMath(node.num), denominator: astToDocxMath(node.den) }));
        break;
      case 'sqrt':
        out.push(new MathRadical({
          children: astToDocxMath(node.body),
          degree: node.degree && node.degree.length > 0 ? astToDocxMath(node.degree) : undefined,
        }));
        break;
      case 'script': {
        const children = astToDocxMath(node.base);
        const sub = node.sub ? astToDocxMath(node.sub) : undefined;
        const sup = node.sup ? astToDocxMath(node.sup) : undefined;
        if (sub && sup) out.push(new MathSubSuperScript({ children, subScript: sub, superScript: sup }));
        else if (sup) out.push(new MathSuperScript({ children, superScript: sup }));
        else if (sub) out.push(new MathSubScript({ children, subScript: sub }));
        else out.push(...children);
        break;
      }
      case 'nary':
        out.push(ommlNary(node.chr, {
          sub: node.sub ? astToDocxMath(node.sub) : undefined,
          sup: node.sup ? astToDocxMath(node.sup) : undefined,
          body: astToDocxMath(node.body),
          limitsAboveBelow: node.aboveBelow,
        }));
        break;
      case 'limit':
        out.push(new MathLimitLower({
          children: [new MathRun({ text: node.name, style: 'plain' })],
          limit: astToDocxMath(node.sub),
        }));
        break;
      case 'delim':
        out.push(ommlDelimiter(node.open, node.close, astToDocxMath(node.body)));
        break;
      case 'accent':
        out.push(ommlAccent(node.chr, astToDocxMath(node.body)));
        break;
      case 'bar':
        out.push(ommlBar(node.pos, astToDocxMath(node.body)));
        break;
      case 'cases': {
        const eq = ommlEqArray(node.rows.map(joinCells));
        out.push(node.braces ? ommlDelimiter('{', '', [eq]) : eq);
        break;
      }
      case 'matrix': {
        const m = ommlMatrix(node.rows.map((r) => r.map((cell) => astToDocxMath(cell))));
        out.push(node.open || node.close ? ommlDelimiter(node.open, node.close, [m]) : m);
        break;
      }
    }
  }
  return out;
}

/** Tên cũ, giữ lại để mã khác dùng được */
export const astToDocxMathComponents = astToDocxMath;

/**
 * Hàm tiện lợi: nhận chuỗi LaTeX, trả về một công thức Word.
 * Nếu phân tích lỗi, hiện nguyên chuỗi LaTeX dạng chữ để không mất dữ liệu.
 */
export function latexToDocxMath(latex: string): InstanceType<typeof DocxMath> {
  const clean = latex.replace(/^\$+|\$+$/g, '').trim();
  try {
    const children = astToDocxMath(parseLatexToAST(clean));
    return new DocxMath({ children: children.length > 0 ? children : [new MathRun({ text: clean, normalText: true })] });
  } catch (err) {
    console.warn('Không phân tích được công thức:', clean, err);
    return new DocxMath({ children: [new MathRun({ text: clean, normalText: true })] });
  }
}
