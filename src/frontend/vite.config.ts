import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT ? Number(env.VITE_HMR_CLIENT_PORT) : undefined
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': '/src' },
    },
    server: {
      host: true,
      port: 5173,
      allowedHosts: ['.ngrok-free.app'],
      proxy: { '/api': 'http://localhost:8000' },
      hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
    },
  }
})
