declare global {
  interface Window {
    __LIVE_SYNC_CONFIG__?: {
      apiBaseUrl?: string;
      realtimeBaseUrl?: string;
      signalRBaseUrl?: string;
    };
  }
}

const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const runtimeConfig = window.__LIVE_SYNC_CONFIG__ ?? {};
const normalize = (url: string): string => url.replace(/\/$/, '');

const defaultBaseUrl = normalize(
  runtimeConfig.realtimeBaseUrl ??
    runtimeConfig.signalRBaseUrl ??
    (isLocalhost ? 'http://localhost:5038' : '')
);

export const appEndpoints = {
  apiBaseUrl: normalize(runtimeConfig.apiBaseUrl ?? (isLocalhost ? 'http://localhost:5038' : '')),
  realtimeBaseUrl: defaultBaseUrl,
  signalRBaseUrl: defaultBaseUrl,
};
