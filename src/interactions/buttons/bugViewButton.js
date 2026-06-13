import { ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Creates a button that triggers the /bug view command.
 * Only the bot owner(s) may use it, but the button itself can be placed anywhere.
 */
export function createBugViewButton() {
  return new ButtonBuilder()
    .setCustomId('bugView')
    .setLabel('View Bug Reports')
    .setStyle(ButtonStyle.Primary);
}
