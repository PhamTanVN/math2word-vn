import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { Document, Paragraph, Packer } from 'docx';
import { tokenizeLatex, parseLatexToAST, latexToDocxMath, MathNode } from './mathParser.ts';

/** Dựng file Word nhỏ chứa 1 công thức rồi trả về nội dung XML của nó */
async function latexToXml(latex: string): Promise<string> {
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [latexToDocxMath(latex)] })] }] });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  return await zip.file('word/document.xml')!.async('string');
}

const types = (nodes: MathNode[]) => nodes.map((n) => n.type);

test('tokenizeLatex: tách lệnh, số, nhóm', () => {
  const t = tokenizeLatex(String.raw`\frac{-b \pm \sqrt{\Delta}}{2a} + 3,14`);
  const values = t.map((x) => x.value);
  assert.ok(values.includes('frac') && values.includes('pm') && values.includes('sqrt') && values.includes('Delta'));
  assert.ok(values.includes('3,14'), 'số thập phân dùng dấu phẩy phải là 1 token');
});

test('parse: phân số và số mũ', () => {
  const ast = parseLatexToAST(String.raw`x = \frac{1}{2} + y^2`);
  assert.ok(types(ast).includes('frac'));
  assert.ok(types(ast).includes('script'));
});

test('parse: x^{2} và x_{i}^{3} dùng nhóm ngoặc nhọn (lỗi cũ)', () => {
  const ast = parseLatexToAST(String.raw`a^{3} + x_{i}^{n+1}`);
  const scripts = ast.filter((n) => n.type === 'script') as Extract<MathNode, { type: 'script' }>[];
  assert.equal(scripts.length, 2);
  assert.equal((scripts[0].sup![0] as any).text, '3');
  assert.ok(scripts[1].sub && scripts[1].sup && scripts[1].sup.length === 3, 'n+1 là 3 thành phần trong cùng số mũ');
});

test('parse: \\left( ... \\right) thành một khối ngoặc (lỗi cũ in chữ "left")', async () => {
  const ast = parseLatexToAST(String.raw`\left( \frac{a}{b} \right)^2`);
  assert.equal(ast.length, 1);
  assert.equal(ast[0].type, 'script');
  const xml = await latexToXml(String.raw`\left( \frac{a}{b} \right)^2`);
  assert.ok(xml.includes('<m:d>'));
  assert.ok(!xml.includes('>left<'), 'không được in chữ "left"');
});

test('khoảng nửa mở [0; 1) thành khối ngoặc lệch cặp của Word', async () => {
  const xml = await latexToXml(String.raw`S = [0; 1) \cup (2; +\infty)`);
  assert.ok(xml.includes('m:begChr m:val="["') && xml.includes('m:endChr m:val=")"'));
  assert.ok(xml.includes('m:begChr m:val="("'));
});

test('ngoặc mở không có ngoặc đóng vẫn là ký tự thường', async () => {
  const xml = await latexToXml(String.raw`f(x = 1`);
  assert.ok(!xml.includes('<m:d>'));
});

test('thân tích phân (2x+1) không bị cắt ở dấu +', () => {
  const ast = parseLatexToAST(String.raw`\int_0^1 (2x+1) dx + 5`);
  const nary = ast[0] as Extract<MathNode, { type: 'nary' }>;
  assert.equal(nary.type, 'nary');
  assert.equal(nary.body[0].type, 'delim');
  assert.equal(ast.length, 3, 'tích phân, dấu +, số 5');
});

test('tích phân giữ cận và thân, không để ô trống', async () => {
  const xml = await latexToXml(String.raw`\int_0^1 (2x+1) \, dx = 2`);
  assert.ok(xml.includes('<m:nary>'));
  assert.ok(xml.includes('m:val="∫"'));
  assert.ok(xml.includes('m:val="subSup"'));
});

test('tổng ∑ có cận trên/dưới', async () => {
  const xml = await latexToXml(String.raw`\sum_{i=1}^{n} i^2`);
  assert.ok(xml.includes('m:val="∑"'));
  assert.ok(xml.includes('m:val="undOvr"'));
});

test('giới hạn lim_{x→0} và log_a x', async () => {
  const xml = await latexToXml(String.raw`\lim_{x \to 0} \frac{\sin x}{x} = 1, \quad \log_2 8 = 3`);
  assert.ok(xml.includes('<m:limLow>'));
  assert.ok(xml.includes('<m:sSub>'));
});

test('góc \\widehat{ABC} và vectơ \\overrightarrow{AB} dùng dấu accent thật', async () => {
  const xml = await latexToXml(String.raw`\widehat{ABC} = 60^\circ, \overrightarrow{AB} \perp \overline{CD}`);
  assert.equal((xml.match(/<m:acc>/g) ?? []).length, 2);
  assert.ok(xml.includes('<m:bar>'));
});

test('căn bậc n và căn thường', async () => {
  const xml = await latexToXml(String.raw`\sqrt[3]{x} + \sqrt{x^2+1}`);
  assert.equal((xml.match(/<m:rad>/g) ?? []).length, 2);
});

test('hệ phương trình cases', async () => {
  const xml = await latexToXml(String.raw`\begin{cases} x + y = 1 \\ x - y = 3 \end{cases}`);
  assert.ok(xml.includes('<m:eqArr>'));
  assert.equal((xml.match(/<m:e>/g) ?? []).length >= 3, true);
  assert.ok(xml.includes('m:begChr m:val="{"'));
});

test('ma trận pmatrix', async () => {
  const xml = await latexToXml(String.raw`\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}`);
  assert.equal((xml.match(/<m:mr>/g) ?? []).length, 2);
});

test('\\text{...} giữ khoảng trắng; \\mathbb{R} thành ℝ', async () => {
  const xml = await latexToXml(String.raw`x \in \mathbb{R} \setminus \{1\} \text{ và } y`);
  assert.ok(xml.includes('ℝ'));
  assert.ok(xml.includes(' và '));
});

test('tổ hợp \\binom{n}{k} và ký hiệu ≤ ≥ viết kiểu \\leqslant', async () => {
  const xml = await latexToXml(String.raw`\binom{n}{k} \leqslant 5 \geqslant 1`);
  assert.ok(xml.includes('noBar'));
  assert.ok(xml.includes('⩽') && xml.includes('⩾'));
});

test('công thức hỏng (thiếu dấu }) không làm sập', async () => {
  const xml = await latexToXml(String.raw`\frac{a}{b + \sqrt{x`);
  assert.ok(xml.includes('<m:oMath>'));
});

test('latexToDocxMath tạo file docx hợp lệ', async () => {
  const buffer = await Packer.toBuffer(
    new Document({ sections: [{ children: [new Paragraph({ children: [latexToDocxMath(String.raw`\int_0^1 x^2 \, dx = \frac{1}{3}`)] })] }] }),
  );
  assert.ok(buffer.length > 3000);
});
