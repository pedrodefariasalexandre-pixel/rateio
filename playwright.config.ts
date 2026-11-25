import { defineConfig, devices } from '@playwright/test';

/**
 * E2E no navegador. Por padrão sobe o build local (`vite preview`).
 * Para testar um deploy (ex.: preview da Vercel), defina E2E_BASE_URL e o servidor local não sobe.
 */
const baseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: baseURL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    // Preview protegido da Vercel: o segredo de bypass vem do ambiente (secret do GitHub), nunca do repo.
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: baseURL
    ? undefined
    : [
        {
          command: 'VITE_LOCAL_MODE=1 npm run build && npm run preview -- --port 4173 --strictPort',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          // servidor de desenvolvimento só para os harness de tela (e2e/harness/*.html)
          command: 'npm run dev -- --port 4174 --strictPort',
          url: 'http://localhost:4174',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
