import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works from any path (GitHub Pages, a subfolder, a file server).
export default defineConfig({
  base: './',
  plugins: [react()],
});
