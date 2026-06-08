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

async function request(method, path, data = undefined) {
  try {
    const res = await client.request({ method, url: path, data });
    return res.data;
  } catch (error) {
    logger.warn('Marizma API request failed', { method, path, message: error?.message });
    if (error.response && error.response.data) return error.response.data;
    return { success: false, error: error?.message || 'Request failed' };
  }
}

export const getServer = () => request('get', '/server');
export const getPlayers = () => request('get', '/server/players');
export const getQueue = () => request('get', '/server/queue');
export const getBans = () => request('get', '/server/bans');
export const announce = (message) => request('post', '/server/announce', { message });
export const shutdown = () => request('post', '/server/shutdown');
export const setSetting = (payload) => request('post', '/server/setSetting', payload);
export const banPlayer = (userId, banned = true) => request('post', '/server/banplayer', { Banned: !!banned, UserId: Number(userId) });
export const kickPlayer = (userId, reason = '') => request('post', '/server/moderation/kick', { UserId: Number(userId), ModerationReason: reason });
export const setBanner = (banner) => request('post', '/server/setbanner', { banner });

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
