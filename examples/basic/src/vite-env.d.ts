/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AIRPOINT_API_KEY?: string;
  readonly VITE_AIRPOINT_LICENSE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}