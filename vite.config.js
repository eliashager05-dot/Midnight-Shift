import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build also works when opened from any folder/server path.
  base: './',
  server: { open: true, port: 5173 },
});
