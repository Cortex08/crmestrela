import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          radix: [
            '@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-popover',
            '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-alert-dialog',
          ],
        },
      },
    },
  },
});
