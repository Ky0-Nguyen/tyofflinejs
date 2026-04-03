import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      'tyofflinejs': path.resolve(__dirname, '../../src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
