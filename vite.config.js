import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/rest': {
        target: 'https://tenderboard.atlassian.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
      '/agile': {
        target: 'https://tenderboard.atlassian.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
    },
  },
});
