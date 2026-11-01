import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Khi đưa lên GitHub Pages, trang nằm ở /ten-repo/ nên cần BASE_PATH (workflow tự đặt).
    // Chạy máy bạn (npm run dev) thì để trống = "/".
    base: process.env.BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Web Worker (nhận dạng công thức) dùng ES module
    worker: { format: 'es' as const },
    // Transformers.js tự nạp file WASM nên không để Vite tiền xử lý
    optimizeDeps: { exclude: ['@huggingface/transformers'] },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
