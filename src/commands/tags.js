// Custom Tags — server-defined text snippets invoked by name. Admins/mods create
// and delete tags via `$tag create|delete`; anyone can invoke one via
// `$tag <name>` or the configured shortcut. Tags are per-guild and stored in
// SQLite. Placeholders {user}, {server}, {count} are substituted at call time.
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../db");
const theme = require("../theme");
const { OWNER_IDS } = require("../utils");

const MAX_TAGS_PER_GUILD = 200;
const MAX_CONTENT = 2000;
const NAME_RE = /^[a-z0-9_-]{1,32}$/;

function canManage(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageMessages) || OWNER_IDS.has(member?.id);
}

function parseAliases(arr) {
  return db.safeJsonParse(arr, []);
}

function parseRoles(arr) {
  return db.safeJsonParse(arr, []);
}

function render(content, ctx) {
  return String(content || "")
    .replace(/\{user\}/g, `<@${ctx.userId}>`)
    .replace(/\{username\}/g, ctx.username)
    .replace(/\{server\}/g, ctx.serverName)
    .replace(/\{count\}/g, ctx.memberCount);
}

// A tag can be restricted to specific roles (allowed_roles JSON). When the list
// is empty, anyone may invoke it.
function canUse(member, tag) {
  if (!tag) return false;
  const roles = parseRoles(tag.allowed_roles);
  if (!roles.length) return true;
  if (canManage(member)) return true; // managers bypass restrictions
  return roles.some(id => member?.roles?.cache?.has(id));
}

// Resolve by name OR alias, enforcing role restrictions. Returns rendered text
// or null when the tag doesn't exist / isn't usable.
function invokeTag(member, guildId, name, ctx) {
  const tag = db.getTagByAlias(guildId, name);
  if (!tag || !canUse(member, tag)) return null;
  db.incrementTagUses(guildId, tag.name);
  return render(tag.content, ctx);
}

function listEmbed(guildId) {
  const tags = db.getTags(guildId);
  if (!tags.length) return theme.embed(guildId, "info", "No tags yet. Create one with `$tag create <name> <content>`.").setTitle("🏷️ Tags");
  const names = tags.map(t => {
    const aliases = parseAliases(t.aliases);
    const suffix = aliases.length ? ` *(alias: ${aliases.map(a => `\`${a}\``).join(", ")})*` : "";
    return `\`${t.name}\`${suffix}`;
  }).join(", ");
  return theme.embed(guildId, "info", names).setTitle(`🏷️ Tags (${tags.length})`);
}

function statsEmbed(guildId) {
  const tags = db.getTags(guildId);
  if (!tags.length) return theme.embed(guildId, "info", "No tags yet.").setTitle("🏷️ Tag Stats");
  const totalUses = tags.reduce((sum, t) => sum + (t.uses || 0), 0);
  const mostUsed = [...tags].sort((a, b) => (b.uses || 0) - (a.uses || 0)).slice(0, 10);
  const lines = mostUsed.map((t, i) => `\`${i + 1}.\` **${t.name}** — ${t.uses || 0} use${t.uses === 1 ? "" : "s"}`);
  return theme.embed(guildId, "info", lines.join("\n"))
    .setTitle(`🏷️ Tag Stats — ${tags.length} tags, ${totalUses} total uses`);
}

module.exports = [
  {
    name: "tag",
    description: "Create, invoke, or manage custom tags",
    aliases: ["t"],
    category: "fun",
    prefix: async (m, args) => {
      const sub = (args[0] || "").toLowerCase();
      const ctx = { userId: m.author.id, username: m.author.username, serverName: m.guild.name, memberCount: m.guild.memberCount };

      if (!sub) return m.reply({ embeds: [listEmbed(m.guild.id)] });

      if (sub === "list") return m.reply({ embeds: [listEmbed(m.guild.id)] });

      if (sub === "create" || sub === "add" || sub === "edit") {
        if (!canManage(m.member)) return m.reply({ embeds: [theme.error(m.guild.id, "You need **Manage Messages** to manage tags.")] });
        const name = (args[1] || "").toLowerCase();
        const content = args.slice(2).join(" ");
        if (!NAME_RE.test(name)) return m.reply({ embeds: [theme.error(m.guild.id, "Tag name must be 1–32 chars: letters, numbers, `-`, `_`.")] });
        if (!content) return m.reply({ embeds: [theme.error(m.guild.id, "Provide tag content: `$tag create <name> <content>`.")] });
        if (content.length > MAX_CONTENT) return m.reply({ embeds: [theme.error(m.guild.id, `Content too long (max ${MAX_CONTENT}).`)] });
        const existing = db.getTag(m.guild.id, name);
        if (!existing && db.getTags(m.guild.id).length >= MAX_TAGS_PER_GUILD)
          return m.reply({ embeds: [theme.error(m.guild.id, `This server has reached the tag limit (${MAX_TAGS_PER_GUILD}).`)] });
        db.createTag(m.guild.id, name, content, m.author.id);
        return m.reply({ embeds: [theme.success(m.guild.id, `🏷️ Tag \`${name}\` ${existing ? "updated" : "created"}.`)] });
      }

      if (sub === "delete" || sub === "remove") {
        if (!canManage(m.member)) return m.reply({ embeds: [theme.error(m.guild.id, "You need **Manage Messages** to manage tags.")] });
        const name = (args[1] || "").toLowerCase();
        const ok = db.deleteTag(m.guild.id, name);
        return m.reply({ embeds: ok ? [theme.success(m.guild.id, `🗑️ Tag \`${name}\` deleted.`)] : [theme.error(m.guild.id, "No tag with that name.")] });
      }

      if (sub === "alias" || sub === "aliases") {
        if (!canManage(m.member)) return m.reply({ embeds: [theme.error(m.guild.id, "You need **Manage Messages** to manage tags.")] });
        const name = (args[1] || "").toLowerCase();
        const tag = db.getTag(m.guild.id, name);
        if (!tag) return m.reply({ embeds: [theme.error(m.guild.id, `No tag named \`${name}\`.`)] });
        const alias = (args[2] || "").toLowerCase();
        if (!alias) {
          const current = parseAliases(tag.aliases);
          return m.reply({ embeds: [theme.embed(m.guild.id, "info", current.length ? `Aliases for \`${name}\`: ${current.map(a => `\`${a}\``).join(", ")}` : `\`${name}\` has no aliases.`).setTitle(`🏷️ ${name}`)] });
        }
        if (!NAME_RE.test(alias)) return m.reply({ embeds: [theme.error(m.guild.id, "Alias must be 1–32 chars: letters, numbers, `-`, `_`.")] });
        if (alias === name) return m.reply({ embeds: [theme.error(m.guild.id, "An alias can't match the tag name.")] });
        const clash = db.getTagByAlias(m.guild.id, alias);
        if (clash && clash.name !== name) return m.reply({ embeds: [theme.error(m.guild.id, `\`${alias}\` already belongs to tag \`${clash.name}\`.`)] });
        const next = [...new Set([...parseAliases(tag.aliases), alias])].slice(0, 10);
        db.setTagAliases(m.guild.id, name, next);
        return m.reply({ embeds: [theme.success(m.guild.id, `🏷️ Added alias \`${alias}\` → \`${name}\`.`)] });
      }

      if (sub === "unalias") {
        if (!canManage(m.member)) return m.reply({ embeds: [theme.error(m.guild.id, "You need **Manage Messages** to manage tags.")] });
        const name = (args[1] || "").toLowerCase();
        const alias = (args[2] || "").toLowerCase();
        const tag = db.getTag(m.guild.id, name);
        if (!tag) return m.reply({ embeds: [theme.error(m.guild.id, `No tag named \`${name}\`.`)] });
        if (!alias) return m.reply({ embeds: [theme.error(m.guild.id, "Usage: `$tag unalias <name> <alias>`.")] });
        const next = parseAliases(tag.aliases).filter(a => a !== alias);
        db.setTagAliases(m.guild.id, name, next);
        return m.reply({ embeds: [theme.success(m.guild.id, `🏷️ Removed alias \`${alias}\` from \`${name}\`.`)] });
      }

      if (sub === "restrict" || sub === "lock") {
        if (!canManage(m.member)) return m.reply({ embeds: [theme.error(m.guild.id, "You need **Manage Messages** to manage tags.")] });
        const name = (args[1] || "").toLowerCase();
        const tag = db.getTag(m.guild.id, name);
        if (!tag) return m.reply({ embeds: [theme.error(m.guild.id, `No tag named \`${name}\`.`)] });
        // Roles = all mentioned roles; only the explicit "everyone" keyword (or
        // an empty mention list with the keyword) clears restrictions.
        const roleIds = [...new Set([...m.mentions.roles.values()].map(r => r.id))];
        if (args[2]?.toLowerCase() === "everyone") {
          db.setTagAllowedRoles(m.guild.id, name, []);
          return m.reply({ embeds: [theme.success(m.guild.id, `🏷️ \`${name}\` is now usable by **everyone**.`)] });
        }
        if (!roleIds.length) {
          return m.reply({ embeds: [theme.error(m.guild.id, "Usage: `$tag restrict <name> <@role…>` (mention at least one role), or `$tag restrict <name> everyone` to clear restrictions.")] });
        }
        db.setTagAllowedRoles(m.guild.id, name, roleIds);
        return m.reply({ embeds: [theme.success(m.guild.id, `🏷️ \`${name}\` is now restricted to: ${roleIds.map(id => `<@&${id}>`).join(", ")}`)] });
      }

      if (sub === "transfer") {
        if (!canManage(m.member)) return m.reply({ embeds: [theme.error(m.guild.id, "You need **Manage Messages** to manage tags.")] });
        const name = (args[1] || "").toLowerCase();
        const target = m.mentions.users.first();
        const tag = db.getTag(m.guild.id, name);
        if (!tag) return m.reply({ embeds: [theme.error(m.guild.id, `No tag named \`${name}\`.`)] });
        if (!target) return m.reply({ embeds: [theme.error(m.guild.id, "Usage: `$tag transfer <name> <@user>`.")] });
        db.transferTag(m.guild.id, name, target.id);
        return m.reply({ embeds: [theme.success(m.guild.id, `🏷️ \`${name}\` ownership transferred to <@${target.id}>.`)] });
      }

      if (sub === "info") {
        const name = (args[1] || "").toLowerCase();
        const tag = db.getTagByAlias(m.guild.id, name);
        if (!tag) return m.reply({ embeds: [theme.error(m.guild.id, "No tag with that name.")] });
        const aliases = parseAliases(tag.aliases);
        const roles = parseRoles(tag.allowed_roles);
        const lines = [
          `**Uses:** ${tag.uses || 0}`,
          `**Created by:** <@${tag.created_by}>`,
          `**Created:** ${tag.created_at ? `<t:${Math.floor(tag.created_at / 1000)}:f>` : "unknown"}`,
          `**Last used:** ${tag.last_used ? `<t:${Math.floor(tag.last_used / 1000)}:R>` : "never"}`,
        ];
        if (aliases.length) lines.push(`**Aliases:** ${aliases.map(a => `\`${a}\``).join(", ")}`);
        if (roles.length) lines.push(`**Restricted to:** ${roles.map(id => `<@&${id}>`).join(", ")}`);
        else lines.push("**Restricted to:** everyone");
        return m.reply({ embeds: [theme.embed(m.guild.id, "info", lines.join("\n")).setTitle(`🏷️ ${tag.name}`)] });
      }

      if (sub === "stats") return m.reply({ embeds: [statsEmbed(m.guild.id)] });

      // Otherwise treat the first arg as a tag name (or alias) to invoke.
      const out = invokeTag(m.member, m.guild.id, sub, ctx);
      if (out === null) return m.reply({ embeds: [theme.error(m.guild.id, `No tag named \`${sub}\` (or you don't have permission to use it). Use \`$tag list\`.`)] });
      return m.reply({ content: out, allowedMentions: { parse: [] } });
    },
    slash: new SlashCommandBuilder().setName("tag").setDescription("Create, invoke, or manage custom tags")
      .addSubcommand(c => c.setName("show").setDescription("Show a tag")
        .addStringOption(o => o.setName("name").setDescription("Tag name or alias").setRequired(true)))
      .addSubcommand(c => c.setName("list").setDescription("List all tags"))
      .addSubcommand(c => c.setName("stats").setDescription("Most-used tags and totals"))
      .addSubcommand(c => c.setName("info").setDescription("Tag details: uses, owner, aliases, restrictions")
        .addStringOption(o => o.setName("name").setDescription("Tag name").setRequired(true)))
      .addSubcommand(c => c.setName("create").setDescription("Create or edit a tag (Manage Messages)")
        .addStringOption(o => o.setName("name").setDescription("Tag name (a-z, 0-9, -, _)").setRequired(true))
        .addStringOption(o => o.setName("content").setDescription("Tag content").setRequired(true)))
      .addSubcommand(c => c.setName("delete").setDescription("Delete a tag (Manage Messages)")
        .addStringOption(o => o.setName("name").setDescription("Tag name").setRequired(true)))
      .addSubcommand(c => c.setName("alias").setDescription("Add an alias to a tag (Manage Messages)")
        .addStringOption(o => o.setName("name").setDescription("Tag name").setRequired(true))
        .addStringOption(o => o.setName("alias").setDescription("Alias to add").setRequired(true)))
      .addSubcommand(c => c.setName("unalias").setDescription("Remove an alias from a tag (Manage Messages)")
        .addStringOption(o => o.setName("name").setDescription("Tag name").setRequired(true))
        .addStringOption(o => o.setName("alias").setDescription("Alias to remove").setRequired(true)))
      .addSubcommand(c => c.setName("restrict").setDescription("Restrict a tag to specific roles (Manage Messages)")
        .addStringOption(o => o.setName("name").setDescription("Tag name").setRequired(true))
        .addRoleOption(o => o.setName("role").setDescription("Role (repeat the command to add more)"))
        .addStringOption(o => o.setName("everyone").setDescription("Set 'true' to clear restrictions")
          .addChoices({ name: "Clear restrictions", value: "true" })))
      .addSubcommand(c => c.setName("transfer").setDescription("Transfer tag ownership (Manage Messages)")
        .addStringOption(o => o.setName("name").setDescription("Tag name").setRequired(true))
        .addUserOption(o => o.setName("user").setDescription("New owner").setRequired(true))),
    execute: async (i) => {
      const sub = i.options.getSubcommand();
      const ctx = { userId: i.user.id, username: i.user.username, serverName: i.guild.name, memberCount: i.guild.memberCount };
      const reply = (embed, ephemeral = true) => i.reply({ embeds: [embed], flags: ephemeral ? 64 : undefined });

      if (sub === "list") return i.reply({ embeds: [listEmbed(i.guild.id)] });
      if (sub === "stats") return i.reply({ embeds: [statsEmbed(i.guild.id)] });

      if (sub === "show") {
        const name = i.options.getString("name").toLowerCase();
        const out = invokeTag(i.member, i.guild.id, name, ctx);
        if (out === null) return reply(theme.error(i.guild.id, `No tag named \`${name}\` (or you don't have permission to use it).`));
        return i.reply({ content: out, allowedMentions: { parse: [] } });
      }

      if (sub === "info") {
        const name = i.options.getString("name").toLowerCase();
        const tag = db.getTagByAlias(i.guild.id, name);
        if (!tag) return reply(theme.error(i.guild.id, "No tag with that name."));
        const aliases = parseAliases(tag.aliases);
        const roles = parseRoles(tag.allowed_roles);
        const lines = [
          `**Uses:** ${tag.uses || 0}`,
          `**Created by:** <@${tag.created_by}>`,
          `**Created:** ${tag.created_at ? `<t:${Math.floor(tag.created_at / 1000)}:f>` : "unknown"}`,
          `**Last used:** ${tag.last_used ? `<t:${Math.floor(tag.last_used / 1000)}:R>` : "never"}`,
        ];
        if (aliases.length) lines.push(`**Aliases:** ${aliases.map(a => `\`${a}\``).join(", ")}`);
        if (roles.length) lines.push(`**Restricted to:** ${roles.map(id => `<@&${id}>`).join(", ")}`);
        else lines.push("**Restricted to:** everyone");
        return reply(theme.embed(i.guild.id, "info", lines.join("\n")).setTitle(`🏷️ ${tag.name}`));
      }

      if (!canManage(i.member)) return reply(theme.error(i.guild.id, "You need **Manage Messages** to manage tags."));

      if (sub === "create") {
        const name = i.options.getString("name").toLowerCase();
        const content = i.options.getString("content");
        if (!NAME_RE.test(name)) return reply(theme.error(i.guild.id, "Tag name must be 1–32 chars: letters, numbers, `-`, `_`."));
        if (content.length > MAX_CONTENT) return reply(theme.error(i.guild.id, `Content too long (max ${MAX_CONTENT}).`));
        const existing = db.getTag(i.guild.id, name);
        if (!existing && db.getTags(i.guild.id).length >= MAX_TAGS_PER_GUILD)
          return reply(theme.error(i.guild.id, `This server has reached the tag limit (${MAX_TAGS_PER_GUILD}).`));
        db.createTag(i.guild.id, name, content, i.user.id);
        return reply(theme.success(i.guild.id, `🏷️ Tag \`${name}\` ${existing ? "updated" : "created"}.`));
      }

      if (sub === "delete") {
        const name = i.options.getString("name").toLowerCase();
        const ok = db.deleteTag(i.guild.id, name);
        return reply(ok ? theme.success(i.guild.id, `🗑️ Tag \`${name}\` deleted.`) : theme.error(i.guild.id, "No tag with that name."));
      }

      if (sub === "alias" || sub === "unalias") {
        const name = i.options.getString("name").toLowerCase();
        const alias = (i.options.getString("alias") || "").toLowerCase();
        const tag = db.getTag(i.guild.id, name);
        if (!tag) return reply(theme.error(i.guild.id, `No tag named \`${name}\`.`));
        if (sub === "unalias") {
          const next = parseAliases(tag.aliases).filter(a => a !== alias);
          db.setTagAliases(i.guild.id, name, next);
          return reply(theme.success(i.guild.id, `🏷️ Removed alias \`${alias}\` from \`${name}\`.`));
        }
        if (!NAME_RE.test(alias)) return reply(theme.error(i.guild.id, "Alias must be 1–32 chars: letters, numbers, `-`, `_`."));
        if (alias === name) return reply(theme.error(i.guild.id, "An alias can't match the tag name."));
        const clash = db.getTagByAlias(i.guild.id, alias);
        if (clash && clash.name !== name) return reply(theme.error(i.guild.id, `\`${alias}\` already belongs to tag \`${clash.name}\`.`));
        const next = [...new Set([...parseAliases(tag.aliases), alias])].slice(0, 10);
        db.setTagAliases(i.guild.id, name, next);
        return reply(theme.success(i.guild.id, `🏷️ Added alias \`${alias}\` → \`${name}\`.`));
      }

      if (sub === "restrict") {
        const name = i.options.getString("name").toLowerCase();
        const tag = db.getTag(i.guild.id, name);
        if (!tag) return reply(theme.error(i.guild.id, `No tag named \`${name}\`.`));
        if (i.options.getString("everyone") === "true") {
          db.setTagAllowedRoles(i.guild.id, name, []);
          return reply(theme.success(i.guild.id, `🏷️ \`${name}\` is now usable by **everyone**.`));
        }
        const role = i.options.getRole("role");
        if (!role) return reply(theme.error(i.guild.id, "Mention a role to restrict to, or set everyone=true to clear."));
        const current = parseRoles(tag.allowed_roles);
        const next = [...new Set([...current, role.id])].slice(0, 50);
        db.setTagAllowedRoles(i.guild.id, name, next);
        return reply(theme.success(i.guild.id, `🏷️ \`${name}\` is now restricted to: ${next.map(id => `<@&${id}>`).join(", ")}`));
      }

      // transfer
      const name = i.options.getString("name").toLowerCase();
      const target = i.options.getUser("user");
      if (!db.getTag(i.guild.id, name)) return reply(theme.error(i.guild.id, `No tag named \`${name}\`.`));
      db.transferTag(i.guild.id, name, target.id);
      return reply(theme.success(i.guild.id, `🏷️ \`${name}\` ownership transferred to <@${target.id}>.`));
    },
  },
];
