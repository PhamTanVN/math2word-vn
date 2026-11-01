# Math2Word VN (bản chạy hoàn toàn trên trình duyệt)

Chuyển đề thi Toán (PDF, nhiều ảnh, hoặc chụp trực tiếp bằng điện thoại) sang file Word có **công thức Word Equation gốc**.
Bản này **không dùng Gemini hay bất kỳ AI trên mạng nào** và **không cần máy chủ**: toàn bộ việc nhận dạng chạy ngay trong trình duyệt của thầy cô, ảnh đề thi không bị gửi đi đâu cả.

## Chạy thử trên máy

Cần cài [Node.js](https://nodejs.org) (bản 20 trở lên), rồi mở terminal trong thư mục dự án:

```bash
npm install
npm run dev
```

Mở địa chỉ hiện ra (thường là http://localhost:5173).

Các lệnh khác: `npm run build` (đóng gói để đưa lên web), `npm test` (chạy kiểm thử), `npm run lint` (kiểm tra kiểu dữ liệu).

## Đưa lên web cho thầy cô dùng

`npm run build` tạo thư mục `dist/` là một **trang web tĩnh** (chỉ có HTML/JS), đưa lên bất kỳ dịch vụ nào: Netlify, Vercel, Cloudflare Pages, GitHub Pages, hoặc máy chủ web của trường.

**Quan trọng - camera cần HTTPS.** Trình duyệt chỉ cho mở camera khi trang chạy bằng `https://` (hoặc `localhost`). Các dịch vụ trên đều có HTTPS sẵn. Nếu để trang chạy bằng `http://` trong mạng nội bộ thì nút **"Chụp nhiều tờ bằng camera"** sẽ báo lỗi, nhưng nút **"Camera của điện thoại"** (mở ứng dụng chụp ảnh của máy) vẫn dùng được.

### Đăng lên GitHub Pages (miễn phí, có HTTPS)

Dự án đã có sẵn `.github/workflows/deploy.yml`, tự build và đăng mỗi khi bạn đẩy code lên nhánh `main`.

1. Tạo repository mới trên github.com (ví dụ tên `math2word-vn`, chọn **Public**, **không** tick "Add a README").
2. Trong thư mục dự án, mở terminal và chạy (thay `TEN-BAN` bằng tên tài khoản GitHub của bạn):

   ```bash
   git init
   git add .
   git commit -m "Math2Word VN"
   git branch -M main
   git remote add origin https://github.com/TEN-BAN/math2word-vn.git
   git push -u origin main
   ```

3. Vào repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Vào tab **Actions**, chờ workflow "Deploy to GitHub Pages" chạy xong (vài phút). Nếu nó chưa tự chạy, bấm **Run workflow**.
5. Trang web nằm ở `https://TEN-BAN.github.io/math2word-vn/`.

Tài khoản GitHub miễn phí chỉ bật Pages cho repository **Public**.

Nếu đặt web trong thư mục con (ví dụ `https://truong.edu.vn/toan/`), build bằng `npx vite build --base=/toan/`.

## Cách nhận dạng hoạt động

1. **Chữ tiếng Việt + Anh**: Tesseract.js (đã kèm sẵn dữ liệu tiếng Việt, không tải từ CDN).
2. **Công thức**: mô hình TexTeller (ảnh → LaTeX) chạy bằng Transformers.js trong Web Worker. Các từ/đoạn nghi là công thức (có `=`, `^`, `√`, tên điểm `ABC`, biến `x`...) được cắt ra và đưa riêng cho mô hình.
3. **Hình vẽ**: dò bằng phân tích điểm ảnh (vùng có nét vẽ nằm ngoài chữ), gắn vào câu hỏi gần nhất. Có thể cắt tay bằng nút "Cắt hình thủ công".
4. **Tách câu hỏi và đáp án** (`optionExtractor.ts`, `optionRecovery.ts`): nhận "Câu 1.", "Bài 2:" và đáp án A. B. C. D. theo **thứ tự** A→B→C→D nên "điểm A." trong đề bài không bị nhầm. Chịu được lỗi OCR (`A,` `B;` `(C)` `Đ.`, A đọc thành 4, B thành 8, D thành 0), đáp án dính liền (`A.45`), bố cục mỗi đáp án một dòng / 2x2 / cả bốn trên một dòng, và kiểu `a) b) c) d)` của câu đúng/sai. Nếu một đáp án (thường là D ở mép phải) bị bỏ sót, hệ thống tự đọc lại vùng đó; nếu vẫn thiếu, thẻ câu hỏi hiện cảnh báo "Thiếu đáp án D" kèm nút "Thêm các đáp án còn thiếu" trong hộp sửa.
5. **Xuất Word**: chuyển LaTeX thành Word Equation gốc (`mathParser.ts`), tạo file `.docx` ngay trên trình duyệt.

### Lần đầu dùng mô hình công thức

Lần đầu bấm nhận dạng, trình duyệt tải mô hình từ huggingface.co rồi lưu lại, những lần sau không phải tải. **Mô hình khá nặng (ước tính vài trăm MB, chưa đo được dung lượng chính xác)**, nên cho thầy cô mở thử một lần bằng wifi tốt. Nếu muốn nhẹ hơn, bỏ chọn ô "Dùng mô hình đọc công thức": khi đó chỉ dùng Tesseract, công thức đọc kém hơn và cần sửa tay nhiều hơn.

Muốn tự lưu mô hình trên máy chủ của trường (không phụ thuộc huggingface.co): tải các file của `onnx-community/TexTeller-ONNX` vào `public/models/onnx-community/TexTeller-ONNX/`, rồi build với biến `VITE_LOCAL_MODEL=1`.

Muốn đổi sang mô hình khác: sửa `formulaModelId` trong `src/ocr/config.ts`. Lưu ý giấy phép: TexTeller là Apache-2.0 (dùng thoải mái); mô hình Texo/FormulaNet nhẹ hơn nhưng là AGPL-3.0 (phải công khai mã nguồn nếu đưa lên web).

## Sửa công thức trực tiếp trên web

- Bấm biểu tượng bút ở câu hỏi để sửa đề bài và đáp án.
- Bên dưới ô sửa có phần xem trước: **bấm vào một công thức** để sửa riêng công thức đó.
- Nút **"Chèn công thức / viết tay"** mở hộp soạn công thức với hai tab: bàn phím công thức (MathLive, có bàn phím ảo trên điện thoại) và **Viết tay**: viết bằng chuột/ngón tay/bút, dừng khoảng 0,7 giây là tự nhận dạng lại (thời gian thực).

## Giới hạn - nên biết trước

- Độ chính xác **thấp hơn Gemini**, nhất là trang có chữ lẫn công thức dày, phân số nhiều tầng, chữ viết tay. Hãy luôn kiểm tra lại, công thức sai thì bấm vào sửa.
- Ảnh chụp nên đủ sáng, thẳng, chữ rõ. Mỗi ảnh một tờ; ảnh nghiêng nhiều sẽ đọc kém.
- Đề hai cột có thể bị đọc lẫn thứ tự dòng.
- Hình vẽ dò tự động bằng quy tắc đơn giản, đôi khi cắt thiếu/thừa: dùng "Cắt hình thủ công" để chỉnh.
- Viết tay chỉ nhận dạng **một công thức mỗi lần**.
- Mô hình công thức cần trình duyệt hiện đại (Chrome, Edge, Safari 16+, Firefox). Điện thoại cũ có thể chạy chậm.

## Cấu trúc mã nguồn (để đọc và học)

```
src/
  App.tsx                    giao diện chính
  ocr/
    config.ts                mọi thiết lập (ngôn ngữ, tên mô hình, đường dẫn)
    textOcr.ts               đọc chữ bằng Tesseract
    pageSource.ts            xử lý ảnh: xoay đúng chiều, khử bóng, cắt vùng
    mathRuns.ts              đoán từ nào là công thức, ghép lại thành $...$
    formulaWorker.ts         chạy mô hình công thức trong Web Worker
    formulaEngine.ts         cầu nối giữa giao diện và worker
    latexClean.ts            làm sạch LaTeX do mô hình trả về
    diagramDetector.ts       dò hình vẽ
    examSegmenter.ts         tách "Câu n", gắn hình vào câu hỏi
    optionExtractor.ts       tách đề bài và đáp án A-B-C-D (chịu lỗi OCR)
    optionRecovery.ts        đọc lại vùng để cứu đáp án bị bỏ sót
    pipeline.ts              nối tất cả các bước trên
  components/
    FormulaDialog.tsx        hộp soạn công thức (MathLive + viết tay)
    HandwritingPad.tsx       ô viết tay nhận dạng thời gian thực
    MathTextEditor.tsx       ô sửa văn bản có công thức, bấm công thức để sửa
    CameraCapture.tsx        chụp nhiều tờ bằng camera
  utils/
    mathParser.ts            LaTeX → Word Equation (OMML)
    omml.ts                  các khối OMML mà thư viện docx còn thiếu
    mathSanitizer.ts         sửa lỗi LaTeX/khoảng trắng tiếng Việt
    docxExporter.ts          tạo file .docx
scripts/copy-ocr-assets.mjs  chép dữ liệu Tesseract, WASM, font vào public/ocr
```

Các tệp `*.test.ts` là kiểm thử tự động (`npm test`).

## Thư viện và giấy phép

Tesseract.js (Apache-2.0), Transformers.js (Apache-2.0), TexTeller (Apache-2.0), MathLive (MIT), KaTeX (MIT), PDF.js (Apache-2.0), docx (MIT).
