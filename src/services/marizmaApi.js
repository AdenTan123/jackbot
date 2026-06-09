import axios from 'axios';
import { logger } from '../utils/logger.js';

const API_KEY = process.env.MARIZMA_API_KEY;
const BASE_URL = (process.env.MARIZMA_BASE_URL || 'https://maple-api.marizma.games/v1').replace(/\/+$/, '');

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    Accept: '*/*',
  },
});

client.interceptors.request.use(cfg => {
  if (API_KEY) cfg.headers['X-Api-Key'] = API_KEY;
  return cfg;
});

async function request(method, path, data = undefined, overrides = {}) {
  try {
    const headers = { Accept: '*/*' };
    if (overrides && overrides.apiKey) {
      headers['X-Api-Key'] = overrides.apiKey;
    } else if (API_KEY) {
      headers['X-Api-Key'] = API_KEY;
    }

    if (overrides && overrides.baseUrl) {
      const base = String(overrides.baseUrl).replace(/\/+$/, '');
      const fullUrl = `${base}${path.startsWith('/') ? path : `/${path}`}`;
      const res = await axios.request({ method, url: fullUrl, data, headers, timeout: 10000 });
      return res.data;
    }

    const res = await client.request({ method, url: path, data, headers });
    return res.data;
  } catch (error) {
    logger.warn('Marizma API request failed', { method, path, message: error?.message });
    if (error.response && error.response.data) return error.response.data;
    return { success: false, error: error?.message || 'Request failed' };
  }
}

export const getServer = (overrides) => request('get', '/server', undefined, overrides);
export const getPlayers = (overrides) => request('get', '/server/players', undefined, overrides);
export const getQueue = (overrides) => request('get', '/server/queue', undefined, overrides);
export const getBans = (overrides) => request('get', '/server/bans', undefined, overrides);
export const announce = (message, overrides) => request('post', '/server/announce', { message }, overrides);
export const shutdown = (overrides) => request('post', '/server/shutdown', undefined, overrides);
export const setSetting = (payload, overrides) => request('post', '/server/setSetting', payload, overrides);
export const banPlayer = (userId, banned = true, overrides) => request('post', '/server/banplayer', { Banned: !!banned, UserId: Number(userId) }, overrides);
export const kickPlayer = (userId, reason = '', overrides) => request('post', '/server/moderation/kick', { UserId: Number(userId), ModerationReason: reason }, overrides);
export const setBanner = (banner, overrides) => request('post', '/server/setbanner', { banner }, overrides);

export default {
  getServer,
  getPlayers,
  getQueue,
  getBans,
  announce,
  shutdown,
  setSetting,
  banPlayer,
  kickPlayer,
  setBanner
};
