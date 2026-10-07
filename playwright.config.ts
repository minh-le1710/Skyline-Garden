import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
// Trong CI, bước build chạy riêng rồi chia sẻ thư mục dist; khi đó chỉ cần chạy preview.
const prebuilt = !!process.env.PW_PREBUILT;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    serviceWorkers: 'block',
    // WebGL bằng phần mềm để chạy được trong môi trường không có GPU (CI, container).
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    // Điện thoại là nền tảng chính: chạy toàn bộ test. Máy tính chỉ chạy các test gắn thẻ @smoke.
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    {
      name: 'desktop',
      grep: /@smoke/,
      use: { viewport: { width: 1280, height: 800 }, browserName: 'chromium' },
    },
  ],
  webServer: {
    command: prebuilt
      ? 'npx vite preview --port 4173 --strictPort'
      : 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
