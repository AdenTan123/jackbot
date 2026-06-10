import { DisTube } from 'distube';
import { logger } from './logger.js';

/** @type {DisTube} */
export let distube;

export function initDistube(client) {
  distube = new DisTube(client, {
    emitNewSongOnly: true,
  });

  distube.on('playSong', (queue, song) => {
    logger.info(`Playing: ${song.name} in guild ${queue.id}`);
  });

  distube.on('error', (error, queue) => {
    logger.error(`DisTube error in guild ${queue?.id}:`, error);
  });

  distube.on('finish', (queue) => {
    logger.info(`Queue finished in guild ${queue.id}`);
  });

  return distube;
}