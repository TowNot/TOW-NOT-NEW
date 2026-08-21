/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ProgressierClient {
  subscribe: () => Promise<unknown> | void;
  unsubscribe?: () => Promise<unknown> | void;
  add?: (data: { id?: string; email?: string; tags?: string | string[] }) => void;
}

interface Window {
  progressier?: ProgressierClient;
}
