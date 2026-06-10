import { execSync } from 'child_process';
import { existsSync } from 'fs';

try {
  if (!existsSync('/usr/local/bin/yt-dlp')) {
    console.log('Installing yt-dlp...');
    execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp');
    console.log('✅ yt-dlp installed');
  } else {
    console.log('✅ yt-dlp already installed');
  }
} catch (e) {
  console.warn('⚠️ Could not install yt-dlp:', e.message);
}