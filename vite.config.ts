import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vimeoResolvePlugin } from './vite-plugin-vimeo.ts'

export default defineConfig({
  plugins: [react(), vimeoResolvePlugin()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: [
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-backend-cpu',
      '@tensorflow/tfjs-backend-webgl',
      '@tensorflow/tfjs-backend-webgpu',
      '@tensorflow/tfjs-backend-wasm',
      'nsfwjs/core',
      'nsfwjs/models/mobilenet_v2',
      'hls.js',
    ],
  },
  assetsInclude: ['**/*.wasm'],
})
