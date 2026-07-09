import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          bpmn: ['bpmn-js'],
        }
      }
    }
  },
  optimizeDeps: {
    include: ['bpmn-js']
  }
})
