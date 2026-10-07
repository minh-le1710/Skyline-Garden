import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  // Đường dẫn tương đối để build chạy được ở GitHub Pages hoặc thư mục con bất kỳ.
  base: './',
  plugins: [preact()],
  define: {
    __BUILD_SHA__: JSON.stringify(process.env.VITE_BUILD_SHA ?? 'dev'),
  },
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Tách thư viện ra chunk riêng: bản cập nhật chỉ đổi code game thì người chơi không phải tải lại three.js.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'preact', test: /node_modules[\\/](preact|@preact)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
