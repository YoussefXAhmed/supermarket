import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const erpTarget = (env.VITE_ERPNEXT_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: erpTarget,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: '127.0.0.1',
        },
      },
    },
  }
})
