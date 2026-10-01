import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['src/test/setup.ts'],
        css: false,
        env: { TZ: 'America/Belem' },
      },
    }),
  ),
)
