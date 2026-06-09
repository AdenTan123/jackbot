import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const downloadedYtDlpPath = path.resolve(__dirname, '../../.local/yt-dlp/yt-dlp');

export default {
    data: new SlashCommandBuilder()
        .setName('test-stream')
        .setDescription('Test if audio streaming works'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const results = [];
        
        // Test 1: Check yt-dlp path
        const ytDlpPath = process.env.YTDLP_PATH || 
                          (existsSync(downloadedYtDlpPath) ? downloadedYtDlpPath : 'yt-dlp');
        results.push(`📁 Using yt-dlp: ${ytDlpPath}`);
        results.push(`📁 Exists: ${existsSync(ytDlpPath)}`);
        
        // Test 2: Try to get video info
        try {
            const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            const checkProcess = spawn(ytDlpPath, ['--get-title', testUrl]);
            let title = '';
            checkProcess.stdout.on('data', d => title += d);
            
            await new Promise((resolve) => {
                checkProcess.on('close', (code) => {
                    results.push(`📺 yt-dlp exit code: ${code}`);
                    results.push(`📺 Video title: ${title.trim() || 'Failed to get title'}`);
                    resolve();
                });
                setTimeout(() => {
                    checkProcess.kill();
                    results.push(`⚠️ yt-dlp timeout`);
                    resolve();
                }, 10000);
            });
        } catch (e) {
            results.push(`❌ yt-dlp error: ${e.message}`);
        }
        
        // Test 3: Try to stream audio
        try {
            const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            const streamProcess = spawn(ytDlpPath, [
                '--ignore-config',
                '--no-playlist',
                '--quiet',
                '--format',
                'bestaudio',
                '--output',
                '-',
                testUrl
            ]);
            
            let receivedData = false;
            let errorOutput = '';
            
            streamProcess.stdout.on('data', (chunk) => {
                if (!receivedData && chunk.length > 0) {
                    receivedData = true;
                    results.push(`🎵 Audio stream started! Received ${chunk.length} bytes`);
                }
            });
            
            streamProcess.stderr.on('data', (chunk) => {
                errorOutput += chunk.toString();
            });
            
            await new Promise((resolve) => {
                setTimeout(() => {
                    if (receivedData) {
                        results.push(`✅ Audio streaming WORKS!`);
                    } else {
                        results.push(`❌ No audio data received`);
                        if (errorOutput) results.push(`⚠️ Error: ${errorOutput.substring(0, 200)}`);
                    }
                    streamProcess.kill();
                    resolve();
                }, 8000);
            });
        } catch (e) {
            results.push(`❌ Stream test error: ${e.message}`);
        }
        
        await interaction.editReply({
            embeds: [
                createEmbed({
                    title: '🔧 Audio Streaming Test',
                    description: '```\n' + results.join('\n') + '\n```',
                    color: results.some(r => r.includes('✅') && r.includes('WORKS')) ? 'success' : 'error',
                }),
            ],
        });
    }
};