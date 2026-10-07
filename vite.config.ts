import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  // Đường dẫn tương đối để build chạy được ở GitHub Pages hoặc thư mục con bất kỳ.
  base: './',
  plugins: [preact()],
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
