import { environment } from '../environments/environment';

declare global {
  interface Window {
    __LIVE_SYNC_CONFIG__?: {
      apiBaseUrl?: string;
      realtimeBaseUrl?: string;
    };
  }
}

const runtimeConfig = (typeof window !== 'undefined' ? window.__LIVE_SYNC_CONFIG__ : {}) ?? {};
const normalize = (url?: string): string => (url || '').replace(/\/$/, '');

export const appEndpoints = {
  apiBaseUrl: normalize(runtimeConfig.apiBaseUrl || environment.apiBaseUrl),
  realtimeBaseUrl: normalize(
    runtimeConfig.realtimeBaseUrl || environment.realtimeBaseUrl
  ),
};
