/// <reference types="vite/client" />

interface ProgressierClient {
  subscribe: () => Promise<unknown> | void;
  unsubscribe?: () => Promise<unknown> | void;
  add?: (data: { id?: string; email?: string; tags?: string | string[] }) => void;
}

interface Window {
  progressier?: ProgressierClient;
}
