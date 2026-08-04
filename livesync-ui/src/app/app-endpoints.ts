import { environment } from '../environments/environment';

declare global {
  interface Window {
    __LIVE_SYNC_CONFIG__?: {
      apiBaseUrl?: string;
      realtimeBaseUrl?: string;
      sandboxBaseUrl?: string;
    };
  }
}

const runtimeConfig = (typeof window !== 'undefined' ? window.__LIVE_SYNC_CONFIG__ : {}) ?? {};
const normalize = (url?: string): string => (url || '').replace(/\/$/, '');

const apiBase = normalize(runtimeConfig.apiBaseUrl || environment.apiBaseUrl);

export const appEndpoints = {
  apiBaseUrl: apiBase,
  realtimeBaseUrl: normalize(runtimeConfig.realtimeBaseUrl || environment.realtimeBaseUrl),
  sandboxBaseUrl: normalize(runtimeConfig.sandboxBaseUrl || environment.sandboxBaseUrl) || apiBase,
};
