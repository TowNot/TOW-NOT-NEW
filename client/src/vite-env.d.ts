/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_CHECKOUT_URL?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?: string;
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
  /** Injected by Express from CLERK_PUBLISHABLE_KEY when serving index.html. */
  __CLERK_PUBLISHABLE_KEY__?: string;
  /** Injected by Express from GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. */
  __GOOGLE_MAPS_API_KEY__?: string;
}
