import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor'
          if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) return 'firebase-firestore'
          if (id.includes('firebase/auth') || id.includes('@firebase/auth')) return 'firebase-auth'
          if (id.includes('firebase/storage') || id.includes('@firebase/storage')) return 'firebase-storage'
          if (id.includes('firebase') || id.includes('@firebase')) return 'firebase-core'
          if (id.includes('react-router')) return 'react-router'
          if (id.includes('react-dom') || id.includes('/react/')) return 'react'
          if (id.includes('zod')) return 'validation'
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    hmr: {
      clientPort: 3000
    }
  },
})
