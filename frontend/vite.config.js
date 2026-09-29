import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Django runs on 8000 and FastAPI on 8001; the frontend stays on 5173.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  // Unit tests (Vitest) for the logic modules. UI components are covered by the
  // Playwright browser tests in e2e/, which Vitest must not pick up.
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/utils/**/*.js', 'src/services/**/*.js'],
      exclude: ['src/**/*.test.js'],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
