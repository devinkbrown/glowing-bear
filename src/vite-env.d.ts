/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Pin the orochi bridge WS endpoint (unset = auto node probing). */
  readonly VITE_IRC_WS?: string;
  /** Upload base URL override (unset = settings uploadUrl / same-origin). */
  readonly VITE_MEDIA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
