import { defineConfig } from 'vite';

// Jira domain for proxy - can be overridden with VITE_JIRA_DOMAIN environment variable
// Run with: VITE_JIRA_DOMAIN=your-domain.atlassian.net npm run dev
const jiraDomain = process.env.VITE_JIRA_DOMAIN || 'tenderboard.atlassian.net';

export default defineConfig({
  server: {
    proxy: {
      '/rest': {
        target: `https://${jiraDomain}`,
        changeOrigin: true,
        secure: true,
      },
      '/agile': {
        target: `https://${jiraDomain}`,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
