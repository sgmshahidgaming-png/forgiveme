import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  envDir: process.cwd(),
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        story: resolve(__dirname, 'src/story.html'),
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})