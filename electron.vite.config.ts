import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
      rollupOptions: {
        external: [
          'uiohook-napi',
          '@lancedb/lancedb',
          'onnxruntime-node',
          'onnxruntime-common',
          'sharp',
          'active-win',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
    },
  },
  renderer: {
    plugins: [tailwindcss()],
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
        },
      },
    },
  },
});
