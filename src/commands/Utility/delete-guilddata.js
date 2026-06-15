import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { EMOJIS, EMOJI_IDS } from '../../config/emojis.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('delete-guilddata')
        .setDescription('Purges all database configurations and saved data vectors for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
        if (!deferred) return;

        const guildId = interaction.guildId;

        const warningEmbed = createEmbed({
            title: 'CRITICAL ACTION REQUIRED',
            color: 'warning', // Injects your custom warning icon asset dynamically
            description: [
                `You are executing an instruction to wipe **all stored data metrics** for **${interaction.guild.name}** from the persistent clusters.`,
                '',
                '**Data vectors slated for deletion:**',
                `${EMOJIS.cross} User experience levels and leveling tables`,
                `${EMOJIS.cross} Custom configurations, welcomes, and logging channels`,
                `${EMOJIS.cross} Saved application forms and join-to-create frameworks`,
                '',
                '*This protocol is unrecoverable. Please confirm validation below.*'
            ].join('\n')
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('wipe_confirm')
                .setLabel('Confirm Database Wipe')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJI_IDS.danger), // Premium custom danger icon bound directly
            new ButtonBuilder()
                .setCustomId('wipe_cancel')
                .setLabel('Cancel Action')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(EMOJI_IDS.cross) // Premium custom cross icon bound directly
        );

        const response = await InteractionHelper.safeEditReply(interaction, {
            embeds: [warningEmbed],
            components: [row]
        });

        if (!response) return;

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000
        });

        collector.on('collect', async (btnInteraction) => {
            if (btnInteraction.user.id !== interaction.user.id) {
                return btnInteraction.reply({ 
                    content: `${EMOJIS.cross} Execution terminal locked to command architect.`, 
                    flags: ['Ephemeral'] 
                });
            }

            await btnInteraction.deferUpdate();
            collector.stop('answered');

            if (btnInteraction.customId === 'wipe_cancel') {
                const cancelEmbed = createEmbed({
                    title: 'Purge Sequence Aborted',
                    color: 'info',
                    description: 'The request was terminated cleanly. Stored server configuration tables remain untouched.'
                });
                return InteractionHelper.safeEditReply(interaction, { embeds: [cancelEmbed], components: [] });
            }

            if (btnInteraction.customId === 'wipe_confirm') {
                try {
                    const client = interaction.client;
                    const targetKeys = [
                        `guild:${guildId}:leveling`,
                        `guild:${guildId}:logging`,
                        `guild:${guildId}:welcome`,
                        `guild:${guildId}:birthdays`,
                        `guild:${guildId}:birthdays:left`,
                        `guild:${guildId}:applications`,
                        `guild:${guildId}:jointocreate`
                    ];

                    if (client.db) {
                        for (const key of targetKeys) {
                            await client.db.delete(key).catch(() => null);
                        }
                    }

                    logger.warn(`DATABASE PURGE: Guild ${guildId} dropped by ${interaction.user.tag}`);

                    const successEmbed = createEmbed({
                        title: 'System Purge Complete',
                        color: 'success', // Injects your custom check icon asset dynamically
                        description: `Data storage arrays linked to **${interaction.guild.name}** have been flushed. The bot has fallen back to default factory parameters.`
                    });

                    await InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed], components: [] });

                } catch (error) {
                    logger.error(`Failed to execute guild database wipe for ${guildId}:`, error);
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Database Purge Error', 'A high-level runtime conflict blocked complete storage deletion.')],
                        components: []
                    });
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = createEmbed({
                    title: 'Operation Termed Out',
                    color: 'warning',
                    description: 'No selection validation was received within less than 30 seconds. Process closed safely.'
                });
                await InteractionHelper.safeEditReply(interaction, { embeds: [timeoutEmbed], components: [] }).catch(() => null);
            }
        });
    }
};