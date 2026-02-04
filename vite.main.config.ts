import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['uiohook-napi', '@lancedb/lancedb', 'onnxruntime-node', 'onnxruntime-common', 'sharp', 'active-win'],
    },
  },
});
