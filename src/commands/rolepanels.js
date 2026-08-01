const {
  EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils');
const roles = require('../roles');
const safe = require('../safe');
const db = require('../db');

const BLURPLE = 0x5865f2;

// ─── Helper: build a preview embed + components from a panel object ──────
function buildPreview(panel, guild) {
  const embeds = [];
  if (panel.embedJson) {
    embeds.push(EmbedBuilder.from(panel.embedJson));
  } else if (panel.name) {
    embeds.push(new EmbedBuilder()
      .setColor(BLURPLE)
      .setTitle(panel.name)
      .setDescription(panel.description || ''));
  }

  const components = [];
  if (panel.panelType === 'button') {
    for (let i = 0; i < panel.options.length; i += 5) {
      const slice = panel.options.slice(i, i + 5);
      components.push(new ActionRowBuilder().addComponents(
        ...slice.map(opt => {
          const btn = new ButtonBuilder()
            .setCustomId(`rolepanel:${panel.id}:${opt.roleId}`)
            .setLabel(opt.label.slice(0, 80))
            .setStyle(opt.style === 'danger' ? ButtonStyle.Danger
              : opt.style === 'success' ? ButtonStyle.Success
              : ButtonStyle.Secondary);
          if (opt.emoji) btn.setEmoji(opt.emoji);
          return btn;
        })
      ));
    }
  } else {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rolepanel:${panel.id}`)
        .setPlaceholder(panel.description || 'Select a role…')
        .setMinValues(panel.exclusive ? 0 : 1)
        .setMaxValues(panel.exclusive ? 1 : Math.min(panel.options.length, 25))
        .addOptions(panel.options.map(opt => ({
          label: opt.label.slice(0, 100),
          value: opt.roleId,
          emoji: opt.emoji || undefined,
          description: (opt.description || '').slice(0, 100) || undefined,
        })))
    ));
  }
  return { embeds, components };
}

function formatOptionsList(panel) {
  return panel.options.map((opt, i) =>
    `${i + 1}. ${opt.emoji || ''} **${opt.label}** → <@&${opt.roleId}>${opt.description ? ` — ${opt.description}` : ''}`
  ).join('\n');
}

// ─── Subcommand handlers ────────────────────────────────────────────────

async function handleCreate(message, args, ctx) {
  // Open a modal to create a panel
  const modal = new ModalBuilder()
    .setCustomId('rp_modal:create')
    .setTitle('Create Role Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Panel Name').setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Choose Your Roles').setRequired(true).setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Description (optional)').setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Select the roles you want').setMaxLength(200)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('type').setLabel('Type: button or select').setStyle(TextInputStyle.Short)
          .setPlaceholder('button').setValue('button').setRequired(true).setMaxLength(10)
      ),
    );
  // Store guild/channel context in the session via the ui panel system
  message._rpGuild = message.guild;
  message._rpChannel = message.channel;
  return message.reply({ components: [], embeds: [
    new EmbedBuilder().setColor(BLURPLE).setTitle('🎭 Role Panels').setDescription(
      'Use the slash command `/rolepanel create` for the full interactive wizard.\n\n' +
      '**Prefix commands:**\n' +
      '• `$rolepanel list` — list all panels\n' +
      '• `$rolepanel delete <id>` — delete a panel\n' +
      '• `$rolepanel publish <id> [channel]` — publish a panel\n' +
      '• `$rolepanel add-option <panelId> <emoji> <label> <@role>` — add an option\n' +
      '• `$rolepanel remove-option <panelId> <index>` — remove an option'
    )
  ], allowedMentions: { parse: [] } });
}

async function handleList(message, args, ctx) {
  const panels = roles.getPanels(message.guild.id);
  if (!panels.length) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLURPLE).setDescription('No role panels configured.')], allowedMentions: { parse: [] } });
  }
  const lines = panels.map(p =>
    `**#${p.id}** ${p.name} (${p.panelType}) — ${p.options.length} option${p.options.length !== 1 ? 's' : ''}${p.messageId ? ' ✅ published' : ' 📝 draft'}${!p.enabled ? ' 🔇 disabled' : ''}`
  );
  return message.reply({
    embeds: [new EmbedBuilder().setColor(BLURPLE).setTitle('🎭 Role Panels').setDescription(lines.join('\n').slice(0, 4000))],
    allowedMentions: { parse: [] }
  });
}

async function handleDelete(message, args, ctx) {
  const id = parseInt(args[0], 10);
  if (!Number.isInteger(id)) {
    return message.reply({ embeds: [errorEmbed('Usage: `$rolepanel delete <id>`')] });
  }
  const panel = roles.getPanel(id);
  if (!panel || panel.guildId !== message.guild.id) {
    return message.reply({ embeds: [errorEmbed('Panel not found.')] });
  }
  await roles.deletePanel(id);
  return message.reply({ embeds: [successEmbed(`Deleted panel **${panel.name}** (#${id}).`)], allowedMentions: { parse: [] } });
}

async function handlePublish(message, args, ctx) {
  const id = parseInt(args[0], 10);
  if (!Number.isInteger(id)) {
    return message.reply({ embeds: [errorEmbed('Usage: `$rolepanel publish <id> [#channel]`')] });
  }
  const panel = roles.getPanel(id);
  if (!panel || panel.guildId !== message.guild.id) {
    return message.reply({ embeds: [errorEmbed('Panel not found.')] });
  }
  if (!panel.options.length) {
    return message.reply({ embeds: [errorEmbed('Panel has no options. Add options first.')] });
  }
  // Resolve target channel
  let channel = message.channel;
  if (args[1]) {
    const chMatch = args[1].match(/^<#(\d+)>$/) || args[1].match(/^(\d{17,20})$/);
    if (chMatch) channel = message.guild.channels.cache.get(chMatch[1]);
    if (!channel) return message.reply({ embeds: [errorEmbed('Channel not found.')] });
  }
  const perms = channel.permissionsFor(message.guild.members.me);
  if (!perms?.has(PermissionFlagsBits.SendMessages)) {
    return message.reply({ embeds: [errorEmbed(`I can't send messages in <#${channel.id}>.`)] });
  }

  const { embeds, components } = buildPreview(panel, message.guild);
  let msg;
  if (panel.messageId) {
    try {
      msg = await channel.messages.fetch(panel.messageId);
      await msg.edit({ embeds, components });
    } catch {
      msg = await safe.send(channel, { embeds, components }, 'role panel publish');
    }
  } else {
    msg = await safe.send(channel, { embeds, components }, 'role panel publish');
  }
  if (msg?.id) await roles.updatePanel(id, { messageId: msg.id, channelId: channel.id });
  return message.reply({ embeds: [successEmbed(`Panel **${panel.name}** published to <#${channel.id}>.`)], allowedMentions: { parse: [] } });
}

async function handleAddOption(message, args, ctx) {
  const panelId = parseInt(args[0], 10);
  if (!Number.isInteger(panelId)) {
    return message.reply({ embeds: [errorEmbed('Usage: `$rolepanel add-option <panelId> <emoji> <label> <@role>`')] });
  }
  const panel = roles.getPanel(panelId);
  if (!panel || panel.guildId !== message.guild.id) {
    return message.reply({ embeds: [errorEmbed('Panel not found.')] });
  }
  if (panel.options.length >= 25) {
    return message.reply({ embeds: [errorEmbed('Max 25 options per panel.')] });
  }
  const emoji = args[1] || '';
  const label = args[2] || '';
  const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[3]);
  if (!label || !role) {
    return message.reply({ embeds: [errorEmbed('Usage: `$rolepanel add-option <panelId> <emoji> <label> <@role>`')] });
  }
  if (role.position >= message.guild.members.me.roles.highest.position) {
    return message.reply({ embeds: [errorEmbed('That role is higher than my highest role — I can\'t assign it.')] });
  }
  if (role.managed) {
    return message.reply({ embeds: [errorEmbed('That role is managed by an integration and can\'t be self-assigned.')] });
  }
  const options = [...panel.options, { label: label.slice(0, 100), emoji: emoji || undefined, roleId: role.id }];
  await roles.updatePanel(panelId, { options });
  return message.reply({ embeds: [successEmbed(`Added **${label}** → ${role} to panel **${panel.name}**.`)], allowedMentions: { parse: [] } });
}

async function handleRemoveOption(message, args, ctx) {
  const panelId = parseInt(args[0], 10);
  const idx = parseInt(args[1], 10);
  if (!Number.isInteger(panelId) || !Number.isInteger(idx)) {
    return message.reply({ embeds: [errorEmbed('Usage: `$rolepanel remove-option <panelId> <index>` (1-based)')] });
  }
  const panel = roles.getPanel(panelId);
  if (!panel || panel.guildId !== message.guild.id) {
    return message.reply({ embeds: [errorEmbed('Panel not found.')] });
  }
  const i = idx - 1;
  if (i < 0 || i >= panel.options.length) {
    return message.reply({ embeds: [errorEmbed(`Invalid index. Panel has ${panel.options.length} option(s).`)] });
  }
  const removed = panel.options[i];
  const options = panel.options.filter((_, j) => j !== i);
  await roles.updatePanel(panelId, { options });
  return message.reply({ embeds: [successEmbed(`Removed **${removed.label}** from panel **${panel.name}**.`)], allowedMentions: { parse: [] } });
}

async function handleHelp(message, args, ctx) {
  const prefix = ctx.utils?.PREFIX || '$';
  return message.reply({
    embeds: [new EmbedBuilder().setColor(BLURPLE).setTitle('🎭 Role Panels').setDescription([
      `**${prefix}rolepanel list** — list all panels`,
      `**${prefix}rolepanel create** — create a new panel (wizard)`,
      `**${prefix}rolepanel delete <id>** — delete a panel`,
      `**${prefix}rolepanel publish <id> [#channel]** — publish to a channel`,
      `**${prefix}rolepanel add-option <id> <emoji> <label> <@role>** — add a role option`,
      `**${prefix}rolepanel remove-option <id> <index>** — remove an option (1-based)`,
      '',
      'Or use `/rolepanel` slash commands for the full interactive experience.',
    ].join('\n'))],
    allowedMentions: { parse: [] }
  });
}

// ─── Prefix command router ──────────────────────────────────────────────
async function handleRolePanel(message, args, ctx) {
  const sub = args[0]?.toLowerCase();
  switch (sub) {
    case 'list':     return handleList(message, args.slice(1), ctx);
    case 'delete':   return handleDelete(message, args.slice(1), ctx);
    case 'publish':  return handlePublish(message, args.slice(1), ctx);
    case 'add-option':  return handleAddOption(message, args.slice(1), ctx);
    case 'remove-option': return handleRemoveOption(message, args.slice(1), ctx);
    case 'create':   return handleCreate(message, args.slice(1), ctx);
    case 'help': default: return handleHelp(message, args, ctx);
  }
}

// ─── Exports ────────────────────────────────────────────────────────────
module.exports = [
  {
    name: 'rolepanels',
    description: 'Manage button and select-menu role panels',
    defaultPermission: 'admin',
    aliases: ['rp', 'rolepanel'],
    prefix: handleRolePanel,
    slash: new SlashCommandBuilder()
      .setName('rolepanel')
      .setDescription('Manage button and select-menu role panels (admin only)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s.setName('list').setDescription('List all role panels'))
      .addSubcommand(s => s.setName('create').setDescription('Create a new role panel')
        .addStringOption(o => o.setName('name').setDescription('Panel name').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Panel description'))
        .addStringOption(o => o.setName('type').setDescription('Panel type').addChoices(
          { name: 'Button', value: 'button' },
          { name: 'Select Menu', value: 'select' },
        ))
        .addBooleanOption(o => o.setName('exclusive').setDescription('Select-only: allow only one role at a time'))
      )
      .addSubcommand(s => s.setName('delete').setDescription('Delete a role panel')
        .addIntegerOption(o => o.setName('id').setDescription('Panel ID').setRequired(true))
      )
      .addSubcommand(s => s.setName('add-option').setDescription('Add a role option to a panel')
        .addIntegerOption(o => o.setName('id').setDescription('Panel ID').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji (optional)'))
        .addStringOption(o => o.setName('label').setDescription('Button/menu label').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to grant').setRequired(true))
      )
      .addSubcommand(s => s.setName('remove-option').setDescription('Remove an option from a panel')
        .addIntegerOption(o => o.setName('id').setDescription('Panel ID').setRequired(true))
        .addIntegerOption(o => o.setName('index').setDescription('Option index (1-based)').setRequired(true))
      )
      .addSubcommand(s => s.setName('publish').setDescription('Publish a panel to a channel')
        .addIntegerOption(o => o.setName('id').setDescription('Panel ID').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText))
      )
      .addSubcommand(s => s.setName('preview').setDescription('Preview a panel')
        .addIntegerOption(o => o.setName('id').setDescription('Panel ID').setRequired(true))
      ),
    execute: async (interaction, ctx) => {
      const sub = interaction.options.getSubcommand();

      if (sub === 'list') {
        const panels = roles.getPanels(interaction.guild.id);
        if (!panels.length) {
          return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLURPLE).setDescription('No role panels configured.')], flags: MessageFlags.Ephemeral });
        }
        const lines = panels.map(p =>
          `**#${p.id}** ${p.name} (${p.panelType}) — ${p.options.length} option(s)${p.messageId ? ' ✅ published' : ' 📝 draft'}${!p.enabled ? ' 🔇 disabled' : ''}`
        );
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLURPLE).setTitle('🎭 Role Panels').setDescription(lines.join('\n').slice(0, 4000))], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'create') {
        const name = interaction.options.getString('name');
        const description = interaction.options.getString('description') || '';
        const panelType = interaction.options.getString('type') || 'button';
        const exclusive = interaction.options.getBoolean('exclusive') || false;
        const panel = await roles.createPanel(interaction.guild.id, {
          name, description, panelType, exclusive, options: [],
        });
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(BLURPLE).setTitle('🎭 Panel Created')
            .setDescription(`Panel **${name}** created (ID: #${panel.id}).\n\nUse \`/rolepanel add-option\` to add roles, then \`/rolepanel publish\` to deploy it.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'delete') {
        const id = interaction.options.getInteger('id');
        const panel = roles.getPanel(id);
        if (!panel || panel.guildId !== interaction.guild.id) {
          return interaction.reply({ embeds: [errorEmbed('Panel not found.')], flags: MessageFlags.Ephemeral });
        }
        await roles.deletePanel(id);
        return interaction.reply({ embeds: [successEmbed(`Deleted panel **${panel.name}** (#${id}).`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'add-option') {
        const id = interaction.options.getInteger('id');
        const panel = roles.getPanel(id);
        if (!panel || panel.guildId !== interaction.guild.id) {
          return interaction.reply({ embeds: [errorEmbed('Panel not found.')], flags: MessageFlags.Ephemeral });
        }
        if (panel.options.length >= 25) {
          return interaction.reply({ embeds: [errorEmbed('Max 25 options per panel.')], flags: MessageFlags.Ephemeral });
        }
        const emoji = interaction.options.getString('emoji') || '';
        const label = interaction.options.getString('label');
        const role = interaction.options.getRole('role');
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
          return interaction.reply({ embeds: [errorEmbed('That role is higher than my highest role.')], flags: MessageFlags.Ephemeral });
        }
        if (role.managed) {
          return interaction.reply({ embeds: [errorEmbed('That role is managed by an integration.')], flags: MessageFlags.Ephemeral });
        }
        const options = [...panel.options, { label: label.slice(0, 100), emoji: emoji || undefined, roleId: role.id }];
        await roles.updatePanel(id, { options });
        return interaction.reply({ embeds: [successEmbed(`Added **${label}** → ${role} to panel **${panel.name}**.`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'remove-option') {
        const id = interaction.options.getInteger('id');
        const idx = interaction.options.getInteger('index');
        const panel = roles.getPanel(id);
        if (!panel || panel.guildId !== interaction.guild.id) {
          return interaction.reply({ embeds: [errorEmbed('Panel not found.')], flags: MessageFlags.Ephemeral });
        }
        const i = idx - 1;
        if (i < 0 || i >= panel.options.length) {
          return interaction.reply({ embeds: [errorEmbed(`Invalid index. Panel has ${panel.options.length} option(s).`)], flags: MessageFlags.Ephemeral });
        }
        const removed = panel.options[i];
        const options = panel.options.filter((_, j) => j !== i);
        await roles.updatePanel(id, { options });
        return interaction.reply({ embeds: [successEmbed(`Removed **${removed.label}** from panel **${panel.name}**.`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === 'publish') {
        const id = interaction.options.getInteger('id');
        const panel = roles.getPanel(id);
        if (!panel || panel.guildId !== interaction.guild.id) {
          return interaction.reply({ embeds: [errorEmbed('Panel not found.')], flags: MessageFlags.Ephemeral });
        }
        if (!panel.options.length) {
          return interaction.reply({ embeds: [errorEmbed('Panel has no options. Add options first.')], flags: MessageFlags.Ephemeral });
        }
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const perms = channel.permissionsFor(interaction.guild.members.me);
        if (!perms?.has(PermissionFlagsBits.SendMessages)) {
          return interaction.reply({ embeds: [errorEmbed(`I can't send messages in <#${channel.id}>.`)], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { embeds, components } = buildPreview(panel, interaction.guild);
        let msg;
        if (panel.messageId) {
          try {
            msg = await channel.messages.fetch(panel.messageId);
            await msg.edit({ embeds, components });
          } catch {
            msg = await safe.send(channel, { embeds, components }, 'role panel publish');
          }
        } else {
          msg = await safe.send(channel, { embeds, components }, 'role panel publish');
        }
        if (msg?.id) await roles.updatePanel(id, { messageId: msg.id, channelId: channel.id });
        return interaction.editReply({ embeds: [successEmbed(`Panel **${panel.name}** published to <#${channel.id}>.`)] });
      }

      if (sub === 'preview') {
        const id = interaction.options.getInteger('id');
        const panel = roles.getPanel(id);
        if (!panel || panel.guildId !== interaction.guild.id) {
          return interaction.reply({ embeds: [errorEmbed('Panel not found.')], flags: MessageFlags.Ephemeral });
        }
        if (!panel.options.length) {
          return interaction.reply({ embeds: [errorEmbed('Panel has no options.')], flags: MessageFlags.Ephemeral });
        }
        const { embeds, components } = buildPreview(panel, interaction.guild);
        return interaction.reply({ embeds, components, flags: MessageFlags.Ephemeral });
      }
    },
  },
];
