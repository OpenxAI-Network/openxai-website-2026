import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

export default defineConfig({
  vite: {
    ssr: {
      noExternal: true
    },
  },
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  server: { host: '0.0.0.0', port: 8080 },
});
