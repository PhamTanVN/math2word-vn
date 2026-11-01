/**
 * omml.ts
 * ------------------------------------------------------------
 * "OMML" là định dạng công thức gốc của Microsoft Word (thẻ <m:...>).
 * Thư viện `docx` đã có sẵn một số khối (phân số, căn, mũ, chỉ số dưới...),
 * nhưng còn thiếu: dấu mũ/vectơ trên chữ, gạch ngang trên chữ, ngoặc co giãn
 * tùy ý, hệ phương trình (cases), ma trận, tích phân/tổng đầy đủ.
 *
 * File này cung cấp một "viên gạch" đơn giản `omml(tag, attrs, children)`
 * để tự dựng các khối còn thiếu đó.
 */
import { XmlComponent, XmlAttributeComponent } from 'docx';

/** Thuộc tính của thẻ, ví dụ { 'm:val': '(' } -> <m:chr m:val="(" /> */
class OmmlAttrs extends XmlAttributeComponent<Record<string, string>> {}

class OmmlNode extends XmlComponent {
  constructor(tag: string, attrs?: Record<string, string>, children: unknown[] = []) {
    super(tag);
    if (attrs && Object.keys(attrs).length > 0) {
      this.root.push(new OmmlAttrs(attrs));
    }
    for (const child of children) {
      this.root.push(child as XmlComponent);
    }
  }
}

/** Tạo một thẻ OMML. Ví dụ: omml('m:e', {}, [new MathRun('x')]) */
export function omml(tag: string, attrs?: Record<string, string>, children: unknown[] = []): XmlComponent {
  return new OmmlNode(tag, attrs, children);
}

/** Tạo thẻ chỉ có thuộc tính m:val, ví dụ <m:chr m:val="∑"/> */
export function ommlVal(tag: string, val: string): XmlComponent {
  return omml(tag, { 'm:val': val });
}

/** Khối "m:e" (element) bọc nội dung */
export function ommlE(children: unknown[]): XmlComponent {
  return omml('m:e', {}, children);
}

/** Dấu/ký tự nằm trên chữ: mũ ^ (góc), vectơ →, ngã ~, chấm... */
export function ommlAccent(chr: string, body: unknown[]): XmlComponent {
  return omml('m:acc', {}, [omml('m:accPr', {}, [ommlVal('m:chr', chr)]), ommlE(body)]);
}

/** Gạch ngang trên (overline) hoặc dưới (underline) chữ */
export function ommlBar(position: 'top' | 'bot', body: unknown[]): XmlComponent {
  return omml('m:bar', {}, [omml('m:barPr', {}, [ommlVal('m:pos', position)]), ommlE(body)]);
}

/** Ngoặc co giãn theo nội dung. open/close để '' nghĩa là không vẽ ngoặc phía đó */
export function ommlDelimiter(open: string, close: string, body: unknown[]): XmlComponent {
  return omml('m:d', {}, [
    omml('m:dPr', {}, [ommlVal('m:begChr', open), ommlVal('m:endChr', close)]),
    ommlE(body),
  ]);
}

/** Các dòng xếp chồng (dùng cho hệ phương trình / cases / aligned) */
export function ommlEqArray(rows: unknown[][]): XmlComponent {
  return omml('m:eqArr', {}, rows.map((r) => ommlE(r)));
}

/** Ma trận: rows[hàng][cột] = danh sách thành phần của ô */
export function ommlMatrix(rows: unknown[][][]): XmlComponent {
  return omml(
    'm:m',
    {},
    rows.map((cols) => omml('m:mr', {}, cols.map((cell) => ommlE(cell)))),
  );
}

/** Toán tử có cận: tích phân, tổng, tích... */
export function ommlNary(
  chr: string,
  opts: { sub?: unknown[]; sup?: unknown[]; body: unknown[]; limitsAboveBelow: boolean },
): XmlComponent {
  const pr: XmlComponent[] = [
    ommlVal('m:chr', chr),
    ommlVal('m:limLoc', opts.limitsAboveBelow ? 'undOvr' : 'subSup'),
  ];
  if (!opts.sub || opts.sub.length === 0) pr.push(ommlVal('m:subHide', '1'));
  if (!opts.sup || opts.sup.length === 0) pr.push(ommlVal('m:supHide', '1'));
  return omml('m:nary', {}, [
    omml('m:naryPr', {}, pr),
    omml('m:sub', {}, opts.sub ?? []),
    omml('m:sup', {}, opts.sup ?? []),
    ommlE(opts.body),
  ]);
}

/** Phân số không có gạch ngang (dùng cho tổ hợp \binom) */
export function ommlNoBarFraction(num: unknown[], den: unknown[]): XmlComponent {
  return omml('m:f', {}, [
    omml('m:fPr', {}, [ommlVal('m:type', 'noBar')]),
    omml('m:num', {}, num),
    omml('m:den', {}, den),
  ]);
}
