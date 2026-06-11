// ── WARN ──────────────────────────────────────────────────
if (sub === 'warn') {
  const target = interaction.options.getUser('target');
  const member = interaction.options.getMember('target');
  const reason = interaction.options.getString('reason');
  const moderator = interaction.user;

  if (!member) throw new Error('That user is not in this server.');

  const result = await WarningService.addWarning({
    guildId: interaction.guildId,
    userId: target.id,
    moderatorId: moderator.id,
    reason,
    timestamp: Date.now(),
  });

  if (!result.success) throw new Error('Failed to store warning in database.');

  await logModerationAction({
    client,
    guild: interaction.guild,
    event: {
      action: 'User Warned',
      target: `${target.tag} (${target.id})`,
      executor: `${moderator.tag} (${moderator.id})`,
      reason,
      metadata: {
        userId: target.id,
        moderatorId: moderator.id,
        totalWarns: result.totalCount,
        warningId: result.id,
      },
    },
  });

  await InteractionHelper.safeEditReply(interaction, {
    embeds: [successEmbed(
      `**Reason:** ${reason}\n**Warning ID:** \`${result.id}\`\n**Total Warnings:** ${result.totalCount}`,
      `⚠️ Warned ${target.tag}`
    )],
  });
}

// ── UNWARN ────────────────────────────────────────────────
else if (sub === 'unwarn') {
  const warningId = parseInt(interaction.options.getString('warning_id'));
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const moderator = interaction.user;

  // Need to find which user owns this warning first
  const target = interaction.options.getUser('target');
  if (!target) throw new Error('Please provide the target user for unwarn.');

  const result = await WarningService.removeWarning(
    interaction.guildId,
    target.id,
    warningId
  );

  if (!result.success) throw new Error(`No warning found with ID \`${warningId}\`.`);

  const remaining = await WarningService.getWarnings(interaction.guildId, target.id);

  await logModerationAction({
    client,
    guild: interaction.guild,
    event: {
      action: 'Warning Removed',
      target: `${target.tag} (${target.id})`,
      executor: `${moderator.tag} (${moderator.id})`,
      reason,
      metadata: { warningId, moderatorId: moderator.id },
    },
  });

  await InteractionHelper.safeEditReply(interaction, {
    embeds: [successEmbed(
      `**Warning ID:** \`${warningId}\`\n**Reason:** ${reason}\n**Remaining Warnings:** ${remaining.length}`,
      `✅ Warning Removed`
    )],
  });
}

// ── WARNINGS LIST ─────────────────────────────────────────
else if (sub === 'warnings') {
  const target = interaction.options.getUser('target');

  const warnings = await WarningService.getWarnings(interaction.guildId, target.id);

  if (!warnings.length) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('This user has no warnings.', `📋 Warnings for ${target.tag}`)],
    });
  }

  const list = warnings
    .map((w, i) =>
      `**${i + 1}.** \`ID: ${w.id}\`\n> **Reason:** ${w.reason}\n> **By:** <@${w.moderatorId}> • <t:${Math.floor(w.timestamp / 1000)}:R>`
    )
    .join('\n\n');

  await InteractionHelper.safeEditReply(interaction, {
    embeds: [successEmbed(
      `${list}\n\n**Total:** ${warnings.length}`,
      `📋 Warnings for ${target.tag}`
    )],
  });
}