/// <reference types="vite/client" />

declare global {
  interface Window {
    __TPF_RENDER__?: () => void;
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: unknown;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

export {};
