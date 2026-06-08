import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const DISABLE_ACTIVITY = process.env.DISABLE_ACTIVITY_COMMAND === '1';

const ACTIVITIES = {
    youtube: '880218394199220334'
};

const ACTIVITY_NAMES = {
    youtube: 'YouTube Together'
};

export default {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Start a Discord Activity in your voice channel')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Connect)
        .addSubcommand((sub) => sub.setName('youtube').setDescription('Watch YouTube videos together in a voice channel')),

    category: 'Voice',

    async execute(interaction, config, client) {
        try {
            if (DISABLE_ACTIVITY) {
                await InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Command Disabled', 'The activity command has been disabled by the server administrator.')],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            const { member } = interaction;
            const activity = interaction.options.getSubcommand();
            const activityId = ACTIVITIES[activity];
            const activityName = ACTIVITY_NAMES[activity] || activity;

            if (!member?.voice?.channel) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not in Voice Channel', 'You need to be in a voice channel to start an activity!')]
                });
            }

            logger.debug('Activity command - validating permissions', {
                userId: interaction.user.id,
                voiceChannelId: member.voice.channel.id,
                voiceChannelName: member.voice.channel.name,
                activity: activity
            });

            const permissions = member.voice.channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has(PermissionsBitField.Flags.CreateInstantInvite)) {
                logger.warn('Activity command - missing permissions', {
                    userId: interaction.user.id,
                    voiceChannelId: member.voice.channel.id,
                    guildId: interaction.guildId,
                    activity: activity,
                    missingPermission: 'CreateInstantInvite'
                });

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Missing Permissions', 'I need the `Create Invite` permission to start an activity!')]
                });
            }

            const invite = await interaction.client.rest.post(`/channels/${member.voice.channel.id}/invites`, {
                body: {
                    max_age: 86400,
                    target_type: 2,
                    .setDMPermission(false)
                    .setDefaultMemberPermissions(PermissionFlagsBits.Connect)
                    .addSubcommand((sub) =>
                        sub
                            .setName('youtube')
                            .setDescription('Watch YouTube videos together in a voice channel')
                            .addChannelOption((opt) => opt.setName('channel').setDescription('Voice channel to start the activity in').addChannelTypes(ChannelType.GuildVoice).setRequired(false))
                    ),

        category: 'Voice',

        async execute(interaction) {
            try {
                if (DISABLE_ACTIVITY) {
                    return await InteractionHelper.safeReply(interaction, {
                        embeds: [errorEmbed('Command Disabled', 'The activity command has been disabled by the server administrator.')],
                        flags: MessageFlags.Ephemeral
                    });
                }

                await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

                const member = interaction.member;
                const channelOption = interaction.options.getChannel('channel');
                const voiceChannel = channelOption || member?.voice?.channel;

                if (!voiceChannel || (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice)) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Not in Voice Channel', 'You must specify or be in a voice channel to start this activity.')]
                    });
                }

                const activity = interaction.options.getSubcommand();
                const activityId = ACTIVITIES[activity];
                const activityName = ACTIVITY_NAMES[activity] || activity;

                const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
                if (!perms || !perms.has(PermissionsBitField.Flags.CreateInstantInvite)) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Missing Permissions', 'I need the `Create Invite` permission in that voice channel to start activities.')]
                    });
                }

                const invite = await interaction.client.rest.post(`/channels/${voiceChannel.id}/invites`, {
                    body: {
                        max_age: 3600,
                        max_uses: 0,
                        target_application_id: activityId,
                        target_type: 2
                    }
                });

                logger.info('Activity invite created', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    voiceChannelId: voiceChannel.id,
                    activity: activity,
                    inviteCode: invite.code
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: `🎮 ${activityName}`,
                            description: `Start **${activityName}** in ${voiceChannel.name}:\n\nhttps://discord.gg/${invite.code}`,
                            color: 'success'
                        })
                    ]
                });
            } catch (error) {
                logger.error('Error creating activity invite', { error: error?.message, stack: error?.stack, userId: interaction?.user?.id, guildId: interaction?.guildId });

                if (!interaction.deferred && !interaction.replied) {
                    await handleInteractionError(interaction, error, { commandName: 'activity' });
                } else {
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Failed to Create Activity', 'An error occurred while trying to create the activity. Please try again later.')]
                    });
                }
            }
        }
    };
            
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            const { member, options } = interaction;
            const activity = options.getSubcommand();
            const activityId = ACTIVITIES[activity];
            const activityName = ACTIVITY_NAMES[activity] || activity;

            if (!member.voice.channel) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Not in Voice Channel', 'You need to be in a voice channel to start an activity!')]
                });
            }

            logger.debug('Activity command - validating permissions', {
                userId: interaction.user.id,
                voiceChannelId: member.voice.channel.id,
                voiceChannelName: member.voice.channel.name,
                activity: activity
            });

            const permissions = member.voice.channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has(PermissionsBitField.Flags.CreateInstantInvite)) {
                logger.warn('Activity command - missing permissions', {
                    userId: interaction.user.id,
                    voiceChannelId: member.voice.channel.id,
                    guildId: interaction.guildId,
                    activity: activity,
                    missingPermission: 'CreateInstantInvite'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Missing Permissions', 'I need the `Create Invite` permission to start an activity!')]
                });
            }

            const invite = await interaction.client.rest.post(
                `/channels/${member.voice.channel.id}/invites`,
                {
                    body: {
                        max_age: 86400,
                        target_type: 2,
                        target_application_id: activityId,
                    },
                }
            );

            logger.info('Activity invite created successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                voiceChannelId: member.voice.channel.id,
                voiceChannelName: member.voice.channel.name,
                guildId: interaction.guildId,
                activity: activity,
                activityName: activityName,
                inviteCode: invite.code,
                commandName: 'activity'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: `🎮 ${activityName}`,
                    description: `Click the link below to start **${activityName}** in ${member.voice.channel.name}!\n\n[Join ${activityName} Activity](https://discord.gg/${invite.code})`,
                    color: 'success'
                })]
            });

        } catch (error) {
            const failedActivity = interaction?.options?.getSubcommand?.() || 'unknown';
            logger.error('Error creating activity invite', {
                error: error?.message,
                stack: error?.stack,
                userId: interaction?.user?.id,
                voiceChannelId: interaction?.member?.voice?.channel?.id,
                guildId: interaction?.guildId,
                activity: failedActivity,
                commandName: 'activity'
            });
            
            if (!interaction.deferred && !interaction.replied) {
                await handleInteractionError(interaction, error, {
                    commandName: 'activity',
                    source: 'discord_activity_api'
                });
            } else {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Failed to Create Activity', 'An error occurred while trying to create the activity. Please try again later.')]
                });
            }
        }
    },
};


