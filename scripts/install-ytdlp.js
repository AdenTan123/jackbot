#!/usr/bin/env node

import { createWriteStream } from 'node:fs';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputDir = process.env.YTDLP_DIR || path.join(repoRoot, '.local', 'yt-dlp');
const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const outputPath = path.join(outputDir, binaryName);

function isMuslLinux() {
  if (process.platform !== 'linux') return false;
  const report = process.report?.getReport?.();
  return !report?.header?.glibcVersionRuntime;
}

function getAssetName() {
  if (process.env.YTDLP_ASSET) return process.env.YTDLP_ASSET;

  if (process.platform === 'darwin') return 'yt-dlp_macos';

  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return 'yt-dlp_arm64.exe';
    if (process.arch === 'ia32') return 'yt-dlp_x86.exe';
    return 'yt-dlp.exe';
  }

  if (process.platform === 'linux') {
    const musl = isMuslLinux();
    if (process.arch === 'arm64') {
      return musl ? 'yt-dlp_musllinux_aarch64' : 'yt-dlp_linux_aarch64';
    }
    if (process.arch === 'x64') {
      return musl ? 'yt-dlp_musllinux' : 'yt-dlp_linux';
    }
  }

  return 'yt-dlp';
}

async function downloadBinary(url, destination) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'jackbot-ytdlp-installer',
    },
    redirect: 'follow',
  });

  if (!response.ok || !response.body) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

if (process.env.YTDLP_SKIP_DOWNLOAD === 'true') {
  console.log('[yt-dlp] Download skipped because YTDLP_SKIP_DOWNLOAD=true');
  process.exit(0);
}

const assetName = getAssetName();
const downloadUrl =
  process.env.YTDLP_URL ||
  `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
const tempPath = `${outputPath}.download`;

try {
  await mkdir(outputDir, { recursive: true });
  await rm(tempPath, { force: true });
  console.log(`[yt-dlp] Downloading ${assetName}...`);
  await downloadBinary(downloadUrl, tempPath);
  if (process.platform !== 'win32') {
    await chmod(tempPath, 0o755);
  }
  await rename(tempPath, outputPath);
  console.log(`[yt-dlp] Installed to ${outputPath}`);
} catch (error) {
  await rm(tempPath, { force: true }).catch(() => {});
  console.warn(`[yt-dlp] Download failed: ${error.message}`);
  console.warn('[yt-dlp] Music playback can still work if yt-dlp is installed on PATH or YTDLP_PATH is set.');
}
