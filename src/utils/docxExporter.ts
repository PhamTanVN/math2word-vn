/**
 * docxExporter.ts: Generates Microsoft Word (.docx) files from math exam questions.
 * Supports native Word equations (m:oMath) and side-by-side cropped geometry diagrams.
 */
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  AlignmentType,
  Packer,
  LineRuleType,
} from 'docx';
import { latexToDocxMath } from './mathParser.ts';
import { sanitizeQuestionContent } from './mathSanitizer.ts';

export interface QuestionOption {
  label: string; // 'A', 'B', 'C', 'D'
  text: string;  // e.g. "$x = 2$"
  isCorrect?: boolean;
}

export interface DiagramInfo {
  id: string;
  box2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in 0..1000
  base64Image?: string; // Cropped image PNG/JPG
  caption?: string;
  /** trang (ảnh) chứa hình này, bắt đầu từ 0 */
  page?: number;
  width?: number;
  height?: number;
}

export interface MathQuestion {
  id: string;
  questionNumber: string; // e.g. "Câu 1"
  content: string; // Full content with inline LaTeX $...$
  options?: QuestionOption[];
  /** cảnh báo hiển thị trên giao diện (không đưa vào file Word) */
  warnings?: string[];
  diagram?: DiagramInfo;
  solution?: string;
  topic?: string; // e.g. "Hình học không gian", "Hàm số", "Giải tích"
}

export interface ExamDocumentData {
  title: string;
  subTitle?: string;
  schoolName?: string;
  duration?: string;
  questions: MathQuestion[];
}

/** Chuyển "data:image/png;base64,...." thành byte + loại ảnh (chạy được cả Node và trình duyệt) */
function dataUrlToImage(dataUrl: string): { bytes: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } {
  const match = /^data:image\/(\w+);base64,/.exec(dataUrl);
  const mime = match ? match[1].toLowerCase() : 'png';
  const type = mime === 'jpeg' || mime === 'jpg' ? 'jpg' : mime === 'gif' ? 'gif' : mime === 'bmp' ? 'bmp' : 'png';
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, type };
}

/** Nhãn đáp án: "A." cho A-D, "a)" cho câu đúng/sai a) b) c) d) */
export function optionLabelText(label: string): string {
  return label === label.toLowerCase() ? `${label}) ` : `${label}. `;
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
};

/**
 * Parses mixed text containing inline ($...$) or display ($$...$$) math into docx runs
 */
export function formatMixedContentToDocxRuns(
  text: string,
  options?: { bold?: boolean; italic?: boolean; size?: number }
): any[] {
  const cleanText = sanitizeQuestionContent(text || '');
  const runs: any[] = [];
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleanText)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      const plainText = cleanText.slice(lastIndex, match.index);
      if (plainText) {
        runs.push(
          new TextRun({
            text: plainText,
            font: 'Times New Roman',
            size: options?.size ?? 24, // 12pt in half-points
            bold: options?.bold,
            italics: options?.italic,
          })
        );
      }
    }

    // Math match
    const mathRaw = match[0];
    const mathExpr = mathRaw.replace(/^\$+|\$+$/g, '').trim();
    if (mathExpr) {
      try {
        const mathDocx = latexToDocxMath(mathExpr);
        runs.push(mathDocx);
      } catch (err) {
        // Fallback to text run if parsing failed
        runs.push(
          new TextRun({
            text: mathRaw,
            font: 'Times New Roman',
            size: options?.size ?? 24,
            italics: true,
          })
        );
      }
    }

    lastIndex = regex.lastIndex;
  }

  // Trailing text
  if (lastIndex < text.length) {
    const trailing = text.slice(lastIndex);
    if (trailing) {
      runs.push(
        new TextRun({
          text: trailing,
          font: 'Times New Roman',
          size: options?.size ?? 24,
          bold: options?.bold,
          italics: options?.italic,
        })
      );
    }
  }

  return runs;
}

/**
 * Creates paragraphs for options (A, B, C, D)
 */
function createOptionsParagraphs(options: QuestionOption[]): Paragraph[] {
  if (!options || options.length === 0) return [];

  // If 4 options and they are relatively short, arrange in 2 columns or 4 inline
  const totalLength = options.reduce((sum, opt) => sum + opt.text.length, 0);

  if (options.length === 4 && totalLength < 80) {
    // 2 options per row or all 4 on one line if very short
    if (totalLength < 40) {
      const allRuns: any[] = [];
      options.forEach((opt, idx) => {
        allRuns.push(
          new TextRun({
            text: optionLabelText(opt.label),
            bold: true,
            font: 'Times New Roman',
            size: 24,
          })
        );
        allRuns.push(...formatMixedContentToDocxRuns(opt.text));
        if (idx < options.length - 1) {
          allRuns.push(new TextRun({ text: '\t\t', font: 'Times New Roman' }));
        }
      });
      return [
        new Paragraph({
          children: allRuns,
          spacing: { after: 120, line: 280, lineRule: LineRuleType.AUTO },
          indent: { left: 360 },
        }),
      ];
    } else {
      // 2 rows of 2
      const row1Runs: any[] = [
        new TextRun({ text: optionLabelText(options[0].label), bold: true, font: 'Times New Roman', size: 24 }),
        ...formatMixedContentToDocxRuns(options[0].text),
        new TextRun({ text: '\t\t\t', font: 'Times New Roman' }),
        new TextRun({ text: optionLabelText(options[1].label), bold: true, font: 'Times New Roman', size: 24 }),
        ...formatMixedContentToDocxRuns(options[1].text),
      ];
      const row2Runs: any[] = [
        new TextRun({ text: optionLabelText(options[2].label), bold: true, font: 'Times New Roman', size: 24 }),
        ...formatMixedContentToDocxRuns(options[2].text),
        new TextRun({ text: '\t\t\t', font: 'Times New Roman' }),
        new TextRun({ text: optionLabelText(options[3].label), bold: true, font: 'Times New Roman', size: 24 }),
        ...formatMixedContentToDocxRuns(options[3].text),
      ];

      return [
        new Paragraph({
          children: row1Runs,
          spacing: { after: 80, line: 280, lineRule: LineRuleType.AUTO },
          indent: { left: 360 },
        }),
        new Paragraph({
          children: row2Runs,
          spacing: { after: 120, line: 280, lineRule: LineRuleType.AUTO },
          indent: { left: 360 },
        }),
      ];
    }
  }

  // Standard: 1 option per line or 2 options per line
  return options.map(
    (opt) =>
      new Paragraph({
        children: [
          new TextRun({
            text: optionLabelText(opt.label),
            bold: true,
            font: 'Times New Roman',
            size: 24,
          }),
          ...formatMixedContentToDocxRuns(opt.text),
        ],
        spacing: { after: 80, line: 280, lineRule: LineRuleType.AUTO },
        indent: { left: 360 },
      })
  );
}

/**
 * Builds the entire .docx document structure
 */
function buildExamDocument(data: ExamDocumentData): Document {
  const children: any[] = [];

  // Header Table (School on Left, Exam title on Right)
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: data.schoolName || 'BỘ GIÁO DỤC VÀ ĐÀO TẠO',
                    bold: true,
                    font: 'Times New Roman',
                    size: 22,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'TỔ TOÁN - TIN HỌC',
                    bold: true,
                    font: 'Times New Roman',
                    size: 22,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: data.title || 'ĐỀ KHẢO SÁT CHẤT LƯỢNG MÔN TOÁN',
                    bold: true,
                    font: 'Times New Roman',
                    size: 24,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Thời gian làm bài: ${data.duration || '90 phút'}`,
                    italics: true,
                    font: 'Times New Roman',
                    size: 20,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  children.push(headerTable);
  children.push(
    new Paragraph({
      text: '',
      spacing: { after: 300 },
    })
  );

  // Render each question
  for (const q of data.questions) {
    const questionHeaderRuns: any[] = [
      new TextRun({
        text: `${q.questionNumber || 'Câu'}: `,
        bold: true,
        font: 'Times New Roman',
        size: 24,
      }),
      ...formatMixedContentToDocxRuns(q.content),
    ];

    const optionsParagraphs = createOptionsParagraphs(q.options || []);

    // Check if question has a cropped diagram/figure to display side-by-side
    if (q.diagram && q.diagram.base64Image) {
      try {
        const { bytes, type: imageType } = dataUrlToImage(q.diagram.base64Image);
        const imgBuffer = bytes;

        // Scale diagram nicely (approx 180-220 width)
        const targetWidth = 200;
        const targetHeight = q.diagram.height && q.diagram.width
          ? Math.round((targetWidth / q.diagram.width) * q.diagram.height)
          : 160;

        const imgRun = new ImageRun({
          data: imgBuffer,
          type: imageType,
          transformation: {
            width: targetWidth,
            height: Math.min(Math.max(targetHeight, 80), 300),
          },
        });

        const imageParagraphs: Paragraph[] = [
          new Paragraph({
            children: [imgRun],
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 60 },
          }),
        ];

        if (q.diagram.caption) {
          imageParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: q.diagram.caption,
                  italics: true,
                  size: 18,
                  font: 'Times New Roman',
                }),
              ],
              alignment: AlignmentType.CENTER,
            })
          );
        }

        // Side-by-side table: Left = Question + Options (65%), Right = Diagram (35%)
        const sideBySideTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: NO_BORDERS,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 68, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: questionHeaderRuns,
                      spacing: { line: 280, lineRule: LineRuleType.AUTO, after: 100 },
                    }),
                    ...optionsParagraphs,
                  ],
                }),
                new TableCell({
                  width: { size: 32, type: WidthType.PERCENTAGE },
                  children: imageParagraphs,
                }),
              ],
            }),
          ],
        });

        children.push(sideBySideTable);
        children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
        continue;
      } catch (imgErr) {
        console.error('Failed to attach image to docx question, falling back to full-width:', imgErr);
      }
    }

    // Default question layout (no diagram)
    children.push(
      new Paragraph({
        children: questionHeaderRuns,
        spacing: { line: 280, lineRule: LineRuleType.AUTO, after: 100 },
      })
    );

    for (const optP of optionsParagraphs) {
      children.push(optP);
    }

    children.push(new Paragraph({ text: '', spacing: { after: 140 } }));
  }

  // End of exam marker
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '---------- HẾT ----------',
          bold: true,
          font: 'Times New Roman',
          size: 22,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 300, after: 200 },
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134, // ~2cm
              right: 1134,
              bottom: 1134,
              left: 1134,
            },
          },
        },
        children,
      },
    ],
  });

  return doc;
}

/** Xuất ra Buffer (dùng trong Node, ví dụ khi chạy test) */
export async function buildExamDocx(data: ExamDocumentData): Promise<Buffer> {
  return await Packer.toBuffer(buildExamDocument(data));
}

/** Xuất ra Blob (dùng ngay trên trình duyệt, không cần server) */
export async function buildExamDocxBlob(data: ExamDocumentData): Promise<Blob> {
  return await Packer.toBlob(buildExamDocument(data));
}
