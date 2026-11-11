/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: { globals: true },
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
