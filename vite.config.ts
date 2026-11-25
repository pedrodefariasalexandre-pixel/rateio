import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // E2E_HARNESS=1: inclui páginas de apoio dos testes E2E (nunca no build de produção).
    rollupOptions: process.env.E2E_HARNESS
      ? { input: { main: 'index.html', relatorios: 'harness-relatorios.html' } }
      : undefined,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
