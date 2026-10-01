/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MOCK?: string
  readonly VITE_HMR_CLIENT_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
