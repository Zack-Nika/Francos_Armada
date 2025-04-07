// index.js
// Franco's Armada Bot – Final Complete Code (with Global & One-Tap Commands, Jail System, Verification Logging, Need Help One-Tap)
// FEATURES:
// • Connects to MongoDB for per‑server settings (language, prefix, role/channel IDs, custom welcome message, and new keys for need help).
// • On guild join, creates "bot‑setup" and "bot‑config" channels visible only to the owner.
// • New members receive the unverified role and a welcome DM tagging them.
// • Interactive multi‑language setup (English, Darija, Spanish, Russian, French) is triggered by the owner typing "ready" in "bot‑setup".
// • Verification Process:
//     – When an unverified user joins the permanent verification channel, an ephemeral VC named "Verify – [displayName]" (userLimit: 2) is created and the user is moved there.
//     – A plain‑text notification ("(# Member Jdid 🙋‍♂️)") plus a "Join Verification" button is sent to the alert channel (both auto-deleted after 10 seconds).
//     – When a verificator clicks the button (if the VC isn’t full), they’re moved in and their ID is stored.
//     – In that VC, the verificator types "+boy" or "+girl" (no mention required) to verify the user (removing the unverified role and adding the corresponding verified role).
//     – When the verificator leaves, the bot moves the verified user to the nearest open VC (or falls back to the verification channel).
//     – Additionally, if a verification log channel is configured, a log message is sent there.
// • One‑Tap Process:
//     – When a verified user joins the designated one‑tap channel, an ephemeral VC named "[displayName]'s Room" is created with permission overwrites denying VIEW_CHANNEL and CONNECT for the unverified role.
//     – The room is open by default and auto‑deletes when empty.
// • New "Need Help" One‑Tap Process:
//     – When a member joins the designated need-help channel, the bot creates a temporary VC named "[displayName] needs help".
//     – It then pings all users with the helper role in a designated help log channel (if configured).
// • Global slash commands (e.g. /setprefix, /setwelcome, /showwelcome, /jail, /jinfo, /unban, /binfo, /topvrf, /toponline) work globally (admins/owners only).
// • One‑Tap management slash commands (e.g. /claim, /mute, /unmute, /lock, /unlock, /limit, /reject, /perm, /hide, /unhide, /transfer, /name, /status, /help) require that the user is in a one‑tap room and respond with blue embed messages.
// • The "R" command shows a user’s profile picture with Avatar/Banner buttons.

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField
} = require('discord.js');
const { MongoClient } = require('mongodb');

// ------------------------------
// MongoDB Setup
// ------------------------------
const mongoUri = process.env.MONGODB_URI;
const mongoClient = new MongoClient(mongoUri);
let settingsCollection;
async function connectToMongo() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
    const db = mongoClient.db("botRentalDB");
    settingsCollection = db.collection("serverSettings");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
connectToMongo();

// ------------------------------
// Create Discord Client
// ------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ------------------------------
// Global Variables for Setup, Verification, One-Tap, Jail, and Need Help
// ------------------------------
const setupStarted = new Map();
const verificationSessions = new Map(); // For ephemeral verification VCs
const onetapSessions = new Map();       // For ephemeral one-tap VCs
const jailData = new Map();             // For storing jail reasons

// ------------------------------
// Multi-Language Data (Added keys for need help)
// ------------------------------
const languagePrompts = {
  english: {
    verifiedRoleId: "🔹 **# Provide the Verified Boy Role ID**",
    unverifiedRoleId: "🔹 **# Provide the Unverified Role ID**",
    verifiedGirlRoleId: "🔹 **# Provide the Verified Girl Role ID**",
    verificatorRoleId: "🔹 **# Provide the Verificator Role ID**",
    voiceVerificationChannelId: "🔹 **# Provide the Permanent Verification Channel ID**",
    oneTapChannelId: "🔹 **# Provide the One-Tap Channel ID**",
    verificationAlertChannelId: "🔹 **# Provide the Verification Alert Channel ID**",
    jailRoleId: "🔹 **# Provide the Jail Role ID** (or type `none`)",
    voiceJailChannelId: "🔹 **# Provide the Voice Jail Channel ID** (or type `none`)",
    verificationLogChannelId: "🔹 **# Provide the Verification Log Channel ID** (or type `none`)",
    needHelpChannelId: "🔹 **# Provide the Need Help Channel ID**",
    helperRoleId: "🔹 **# Provide the Helper Role ID**",
    needHelpLogChannelId: "🔹 **# Provide the Need Help Log Channel ID** (or type `none`)"
  },
  darija: {
    verifiedRoleId: "🔹 **# 3afak 3tini l'ID dyal Verified Boy Role**",
    unverifiedRoleId: "🔹 **# 3afak 3tini l'ID dyal Unverified Role**",
    verifiedGirlRoleId: "🔹 **# 3afak 3tini l'ID dyal Verified Girl Role**",
    verificatorRoleId: "🔹 **# 3tini l'ID dyal Verificator Role**",
    voiceVerificationChannelId: "🔹 **# 3afak 3tini l'ID dyal Voice Verification Channel (permanent)**",
    oneTapChannelId: "🔹 **# 3tini l'ID dyal One-Tap Channel**",
    verificationAlertChannelId: "🔹 **# 3afak 3tini l'ID dyal Verification Alert Channel**",
    jailRoleId: "🔹 **# 3afak 3tini l'ID dyal Jailed Role** (awla la m3ndksh ktb `none`)",
    voiceJailChannelId: "🔹 **# 3afak 3tini l'ID dyal Voice Jail Channel** (awla la m3ndksh ktb `none`)",
    verificationLogChannelId: "🔹 **# 3afak 3tini l'ID dyal Verification Log Channel** (awla la m3ndksh ktb`none`)",
    needHelpChannelId: "🔹 **# 3afak 3tini l'ID dyal Need Help Channel**",
    helperRoleId: "🔹 **# 3afak 3tini l'ID dyal Helper Role**",
    needHelpLogChannelId: "🔹 **# 3afak 3tini l'ID dyal Need Help Log Channel** (awla la m3ndksh ktb `none`)"
  },
  spanish: {
    verifiedRoleId: "🔹 **# Proporciona el ID del Rol de Chico Verificado**",
    unverifiedRoleId: "🔹 **# Proporciona el ID del Rol No Verificado**",
    verifiedGirlRoleId: "🔹 **# Proporciona el ID del Rol de Chica Verificada**",
    verificatorRoleId: "🔹 **# Proporciona el ID del Rol de Verificador**",
    voiceVerificationChannelId: "🔹 **# Proporciona el ID del Canal de Verificación Permanente**",
    oneTapChannelId: "🔹 **# Proporciona el ID del Canal One-Tap**",
    verificationAlertChannelId: "🔹 **# Proporciona el ID del Canal de Alertas de Verificación**",
    jailRoleId: "🔹 **# Proporciona el ID del Rol de Cárcel** (o `none`)",
    voiceJailChannelId: "🔹 **# Proporciona el ID del Canal de Voz de Cárcel** (o `none`)",
    verificationLogChannelId: "🔹 **# Proporciona el ID del Canal de Logs de Verificación** (o `none`)",
    needHelpChannelId: "🔹 **# Proporciona el ID del Canal de Need Help**",
    helperRoleId: "🔹 **# Proporciona el ID del Rol de Helper**",
    needHelpLogChannelId: "🔹 **# Proporciona el ID del Canal de Logs de Need Help** (o `none`)"
  },
  russian: {
    verifiedRoleId: "🔹 **# Укажите ID роли для мальчиков (Verified Boy)**",
    unverifiedRoleId: "🔹 **# Укажите ID роли для новичков (Unverified)**",
    verifiedGirlRoleId: "🔹 **# Укажите ID роли для девочек (Verified Girl)**",
    verificatorRoleId: "🔹 **# Укажите ID роли Verificator**",
    voiceVerificationChannelId: "🔹 **# Укажите ID постоянного канала верификации**",
    oneTapChannelId: "🔹 **# Укажите ID канала One-Tap**",
    verificationAlertChannelId: "🔹 **# Укажите ID канала для уведомлений о верификации**",
    jailRoleId: "🔹 **# Укажите ID роли Jail** (или `none`)",
    voiceJailChannelId: "🔹 **# Укажите ID голосового канала Jail** (или `none`)",
    verificationLogChannelId: "🔹 **# Укажите ID канала для логов верификации** (или `none`)",
    needHelpChannelId: "🔹 **# Укажите ID канала Need Help**",
    helperRoleId: "🔹 **# Укажите ID роли Helper**",
    needHelpLogChannelId: "🔹 **# Укажите ID канала для логов Need Help** (или `none`)"
  },
  french: {
    verifiedRoleId: "🔹 **# Fournissez l'ID du rôle Garçon Vérifié**",
    unverifiedRoleId: "🔹 **# Fournissez l'ID du rôle Non Vérifié**",
    verifiedGirlRoleId: "🔹 **# Fournissez l'ID du rôle Fille Vérifiée**",
    verificatorRoleId: "🔹 **# Fournissez l'ID du rôle Vérificateur**",
    voiceVerificationChannelId: "🔹 **# Fournissez l'ID du canal de vérification permanent**",
    oneTapChannelId: "🔹 **# Fournissez l'ID du canal One-Tap**",
    verificationAlertChannelId: "🔹 **# Fournissez l'ID du canal d'alertes de vérification**",
    jailRoleId: "🔹 **# Fournissez l'ID du rôle Jail** (ou `none`)",
    voiceJailChannelId: "🔹 **# Fournissez l'ID du canal vocal Jail** (ou `none`)",
    verificationLogChannelId: "🔹 **# Fournissez l'ID du canal de logs de vérification** (ou `none`)",
    needHelpChannelId: "🔹 **# Fournissez l'ID du canal Need Help**",
    helperRoleId: "🔹 **# Fournissez l'ID du rôle Helper**",
    needHelpLogChannelId: "🔹 **# Fournissez l'ID du canal de logs Need Help** (ou `none`)"
  }
};
const languageExtras = {
  english: {
    setupStart: "Let's begin setup. Please copy/paste each ID as prompted.",
    setupComplete: "Setup complete! 🎉"
  },
  darija: {
    setupStart: "Nbda setup. Copier-coller chaque ID quand demandé.",
    setupComplete: "Setup sali! 🎉"
  },
  spanish: {
    setupStart: "Empecemos la configuración. Copia/pega cada ID cuando se te pida.",
    setupComplete: "¡Configuración completa! 🎉"
  },
  russian: {
    setupStart: "Начнем настройку. Вставьте каждый ID по запросу.",
    setupComplete: "Настройка завершена! 🎉"
  },
  french: {
    setupStart: "Commençons la configuration. Copiez/collez chaque ID demandé.",
    setupComplete: "Configuration terminée! 🎉"
  }
};

// ------------------------------
// Helper: Await Single Message (90s Timeout)
// ------------------------------
async function awaitResponse(channel, userId, prompt, lang) {
  await channel.send(prompt + "\n*(90 seconds to respond.)*");
  const filter = m => m.author.id === userId;
  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 90000, errors: ['time'] });
    return collected.first().content.trim();
  } catch {
    await channel.send(
      lang === "darija" ? "Setup t9llat. Kteb `ready` bach tbda men jdod." :
      lang === "spanish" ? "Tiempo agotado. Escribe `ready` para reiniciar." :
      lang === "russian" ? "Время истекло. Введите `ready` чтобы начать заново." :
      lang === "french" ? "Le temps est écoulé. Tapez `ready` pour recommencer." :
      "Setup timed out. Type `ready` to restart setup."
    );
    throw new Error("Setup timed out");
  }
}

// ------------------------------
// Interactive Setup Process Function
// ------------------------------
async function runSetup(ownerId, setupChannel, guildId, lang) {
  const config = { serverId: guildId };
  const prompts = languagePrompts[lang] || languagePrompts.english;
  const extras = languageExtras[lang] || languageExtras.english;
  await setupChannel.send(extras.setupStart);
  for (const [key, prompt] of Object.entries(prompts)) {
    const response = await awaitResponse(setupChannel, ownerId, prompt, lang);
    config[key] = (response.toLowerCase() === "none") ? null : response;
  }
  try {
    await settingsCollection.updateOne({ serverId: guildId }, { $set: config }, { upsert: true });
    await setupChannel.send(extras.setupComplete);
  } catch (err) {
    console.error("Error saving config:", err);
    await setupChannel.send("Error saving config. Try again or contact support.");
  }
}

// ------------------------------
// Global Slash Commands Registration (Global and One-Tap Commands)
// ------------------------------
client.commands = new Collection();
const slashCommands = [
  // Global commands (do not require a voice channel)
  new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set a custom prefix')
    .addStringOption(o => o.setName('prefix').setDescription('New prefix').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Set a custom welcome message')
    .addStringOption(o => o.setName('message').setDescription('Welcome message').setRequired(true)),
  new SlashCommandBuilder()
    .setName('showwelcome')
    .setDescription('Show the current welcome message'),
  new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Jail a user')
    .addStringOption(o => o.setName('userid').setDescription('User ID to jail').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for jailing').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('jinfo')
    .setDescription('Get jail info for a user')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unjail a user')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('binfo')
    .setDescription('Show total number of banned users')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('topvrf')
    .setDescription('Show top verificators')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('toponline')
    .setDescription('Show top online users')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  // One-Tap Management commands (require user to be in a one-tap VC)
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user in your tap')
    .addUserOption(o => o.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user in your tap')
    .addUserOption(o => o.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your tap (deny Connect)'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your tap'),
  new SlashCommandBuilder()
    .setName('limit')
    .setDescription('Set a user limit for your tap')
    .addIntegerOption(o => o.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Reject a user from your tap (kick and block)')
    .addUserOption(o => o.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder()
    .setName('perm')
    .setDescription('Permit a rejected user to join again')
    .addUserOption(o => o.setName('target').setDescription('User to permit').setRequired(true)),
  new SlashCommandBuilder().setName('hide').setDescription('Hide your tap'),
  new SlashCommandBuilder().setName('unhide').setDescription('Unhide your tap'),
  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer tap ownership')
    .addUserOption(o => o.setName('target').setDescription('User to transfer to').setRequired(true)),
  new SlashCommandBuilder()
    .setName('name')
    .setDescription('Rename your tap')
    .addStringOption(o => o.setName('text').setDescription('New name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Set a status for your tap')
    .addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('Show available commands')
];

const { Routes: Routes2 } = require('discord-api-types/v10');

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering global slash commands...');
    await rest.put(
      Routes2.applicationCommands(process.env.CLIENT_ID),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('Global slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

// ------------------------------
// Slash Command Interaction Handler – Separate Global and One-Tap Commands
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const commandName = interaction.commandName;
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  if (!config) {
    return interaction.reply({ content: "Bot is not configured for this server.", ephemeral: true });
  }
  // Global commands (do not require a voice channel)
  const globalCommands = ["setprefix", "setwelcome", "showwelcome", "jail", "jinfo", "unban", "binfo", "topvrf", "toponline"];
  if (globalCommands.includes(commandName)) {
    // Only guild owner or users with Administrator permissions can use these.
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator) &&
        interaction.member.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: "You are not allowed to use this command.", ephemeral: true });
    }
    if (commandName === "setprefix") {
      const prefix = interaction.options.getString('prefix');
      try {
        await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { prefix } }, { upsert: true });
        return interaction.reply({ content: `Prefix updated to ${prefix}.`, ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: "Failed to update prefix.", ephemeral: true });
      }
    } else if (commandName === "setwelcome") {
      const message = interaction.options.getString('message');
      try {
        await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { customWelcome: message } }, { upsert: true });
        return interaction.reply({ content: "Welcome message updated!", ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: "Failed to update welcome message.", ephemeral: true });
      }
    } else if (commandName === "showwelcome") {
      try {
        return interaction.reply({ content: `Current welcome message: ${config.customWelcome || "Default message"}`, ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: "Failed to show welcome message.", ephemeral: true });
      }
    } else if (commandName === "jail") {
      const userid = interaction.options.getString('userid');
      const reason = interaction.options.getString('reason');
      let targetMember = await interaction.guild.members.fetch(userid).catch(() => null);
      if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
      try {
        // Remove all roles and add the jail role
        await targetMember.roles.set([]);
        if (config.jailRoleId && config.jailRoleId !== "none") {
          const jailRole = targetMember.guild.roles.cache.get(config.jailRoleId);
          if (jailRole) {
            await targetMember.roles.add(jailRole);
          }
        }
        if (config.voiceJailChannelId && config.voiceJailChannelId !== "none" && targetMember.voice.channel) {
          const jailChannel = targetMember.guild.channels.cache.get(config.voiceJailChannelId);
          if (jailChannel) {
            await targetMember.voice.setChannel(jailChannel);
          }
        }
        jailData.set(targetMember.id, reason);
        return interaction.reply({ content: `User ${targetMember.displayName} has been jailed for: ${reason}`, ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: "Failed to jail user.", ephemeral: true });
      }
    } else if (commandName === "jinfo") {
      const userid = interaction.options.getString('userid');
      const info = jailData.get(userid) || "No jail reason found.";
      return interaction.reply({ content: `Jail info for ${userid}: ${info}`, ephemeral: true });
    } else if (commandName === "unban") {
      const userid = interaction.options.getString('userid');
      let targetMember = await interaction.guild.members.fetch(userid).catch(() => null);
      if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
      try {
        if (config.jailRoleId && config.jailRoleId !== "none") {
          const jailRole = targetMember.guild.roles.cache.get(config.jailRoleId);
          if (jailRole && targetMember.roles.cache.has(jailRole.id)) {
            await targetMember.roles.remove(jailRole);
          }
        }
        jailData.delete(targetMember.id);
        return interaction.reply({ content: `User ${targetMember.displayName} has been unjailed.`, ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: "Failed to unjail user.", ephemeral: true });
      }
    } else if (commandName === "binfo") {
      try {
        const bans = await interaction.guild.bans.fetch();
        return interaction.reply({ content: `Total banned users: ${bans.size}`, ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: "Failed to fetch ban info.", ephemeral: true });
      }
    } else if (commandName === "topvrf") {
      return interaction.reply({ content: "Top verificators: [Feature coming soon...]", ephemeral: true });
    } else if (commandName === "toponline") {
      return interaction.reply({ content: "Top online users: [Feature coming soon...]", ephemeral: true });
    }
    return; // End global command handling
  }
  // One-Tap Management commands (require user to be in a one-tap VC)
  const member = interaction.member;
  const currentVC = member.voice.channel;
  if (!currentVC || !onetapSessions.has(currentVC.id)) {
    return interaction.reply({ content: "You are not in a one-tap room.", ephemeral: true });
  }
  let session = onetapSessions.get(currentVC.id);
  // Blue embed color: 0x3498DB
  if (commandName === "claim") {
    if (session.owner === member.id)
      return interaction.reply({ content: "You already own this tap.", ephemeral: true });
    if (currentVC.members.has(session.owner))
      return interaction.reply({ content: "Owner is still present; cannot claim ownership.", ephemeral: true });
    session.owner = member.id;
    onetapSessions.set(currentVC.id, session);
    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("Ownership Claimed")
      .setDescription("You have claimed ownership of your tap.");
    return interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (commandName === "mute") {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id)
      return interaction.reply({ content: "That user is not in your tap.", ephemeral: true });
    try {
      await targetMember.voice.setMute(true);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("User Muted")
        .setDescription(`${targetMember.displayName} has been muted.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to mute.", ephemeral: true });
    }
  } else if (commandName === "unmute") {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id)
      return interaction.reply({ content: "That user is not in your tap.", ephemeral: true });
    try {
      await targetMember.voice.setMute(false);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("User Unmuted")
        .setDescription(`${targetMember.displayName} has been unmuted.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to unmute.", ephemeral: true });
    }
  } else if (commandName === "lock") {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Locked")
        .setDescription("Your tap has been locked.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to lock tap.", ephemeral: true });
    }
  } else if (commandName === "unlock") {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Unlocked")
        .setDescription("Your tap has been unlocked.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to unlock tap.", ephemeral: true });
    }
  } else if (commandName === "limit") {
    const number = interaction.options.getInteger('number');
    try {
      await currentVC.setUserLimit(number);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("User Limit Set")
        .setDescription(`User limit set to ${number}.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to set limit.", ephemeral: true });
    }
  } else if (commandName === "reject") {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user to reject.", ephemeral: true });
    try {
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (targetMember && targetMember.voice.channelId === currentVC.id) {
        await targetMember.voice.disconnect("Rejected from tap");
      }
      session.rejectedUsers = session.rejectedUsers || [];
      if (!session.rejectedUsers.includes(target.id)) session.rejectedUsers.push(target.id);
      onetapSessions.set(currentVC.id, session);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("User Rejected")
        .setDescription(`User ${target.username} has been rejected and kicked.`);
      interaction.reply({ embeds: [embed], ephemeral: true });
      // Log the verification action if a log channel is configured
      if (config.verificationLogChannelId && config.verificationLogChannelId !== "none") {
        const logChannel = interaction.guild.channels.cache.get(config.verificationLogChannelId);
        if (logChannel) {
          logChannel.send(`${interaction.member.displayName} has verified ${targetMember ? targetMember.toString() : target.username} ✅`).catch(console.error);
        }
      }
      return;
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to reject user.", ephemeral: true });
    }
  } else if (commandName === "perm") {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user to permit.", ephemeral: true });
    session.rejectedUsers = session.rejectedUsers || [];
    const index = session.rejectedUsers.indexOf(target.id);
    if (index === -1) return interaction.reply({ content: "User is not rejected.", ephemeral: true });
    session.rejectedUsers.splice(index, 1);
    onetapSessions.set(currentVC.id, session);
    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("User Permitted")
      .setDescription(`User ${target.username} is now permitted.`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (commandName === "hide") {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Hidden")
        .setDescription("Your tap is now hidden.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to hide tap.", ephemeral: true });
    }
  } else if (commandName === "unhide") {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Unhidden")
        .setDescription("Your tap is now visible.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to unhide tap.", ephemeral: true });
    }
  } else if (commandName === "transfer") {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user to transfer ownership to.", ephemeral: true });
    try {
      session.owner = target.id;
      onetapSessions.set(currentVC.id, session);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Ownership Transferred")
        .setDescription(`Ownership transferred to ${target.username}.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to transfer ownership.", ephemeral: true });
    }
  } else if (commandName === "name") {
    const newName = interaction.options.getString('text');
    try {
      await currentVC.setName(newName);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Renamed")
        .setDescription(`Tap renamed to ${newName}.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to rename tap.", ephemeral: true });
    }
  } else if (commandName === "status") {
    const statusText = interaction.options.getString('text');
    try {
      session.status = statusText;
      onetapSessions.set(currentVC.id, session);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Status Set")
        .setDescription(`Tap status set to: ${statusText}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to set status.", ephemeral: true });
    }
  } else if (commandName === "help") {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("Available Commands")
      .setDescription("Commands for configuration and one-tap management.")
      .addFields(
        { name: "Global", value: "/setprefix, /setwelcome, /showwelcome, /jail, /jinfo, /unban, /binfo, /topvrf, /toponline" },
        { name: "One-Tap", value: "/claim, /mute, /unmute, /lock, /unlock, /limit, /reject, /perm, /hide, /unhide, /transfer, /name, /status" }
      );
    return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  }
});

// ------------------------------
// Interaction Handler for Profile Viewer Buttons (Avatar/Banner)
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("lang_") || interaction.customId.startsWith("join_verification_")) return;
  const [action, userId] = interaction.customId.split('_');
  if (!userId) return;
  try {
    const targetUser = await client.users.fetch(userId, { force: true });
    if (action === 'avatar') {
      const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`${targetUser.username}'s Avatar`)
        .setImage(avatarURL);
      return interaction.update({ embeds: [embed], components: [] });
    } else if (action === 'banner') {
      const bannerURL = targetUser.bannerURL({ dynamic: true, size: 1024 });
      if (!bannerURL) return interaction.reply({ content: "No banner set.", ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`${targetUser.username}'s Banner`)
        .setImage(bannerURL);
      return interaction.update({ embeds: [embed], components: [] });
    }
  } catch (err) {
    console.error("Error fetching user for profile:", err);
    return interaction.reply({ content: "Error fetching user data.", ephemeral: true });
  }
});

// ------------------------------
// "R" Command for Profile Viewer
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  if ((content === 'r' || content.startsWith('r ')) && content !== 'ready') {
    let targetUser = message.mentions.users.first() || message.author;
    try {
      targetUser = await targetUser.fetch();
    } catch (err) {
      console.error("Error fetching user data:", err);
      return message.reply("Error fetching user data.");
    }
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`${targetUser.username}'s Profile Picture`)
      .setDescription("Click a button below to view Avatar or Banner.")
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }));
    const avatarButton = new ButtonBuilder()
      .setCustomId(`avatar_${targetUser.id}`)
      .setLabel("Avatar")
      .setStyle(ButtonStyle.Primary);
    const bannerButton = new ButtonBuilder()
      .setCustomId(`banner_${targetUser.id}`)
      .setLabel("Banner")
      .setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder().addComponents(avatarButton, bannerButton);
    message.channel.send({ embeds: [embed], components: [row] });
  }
});

// ------------------------------
// Need Help One-Tap Process
// ------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const config = await settingsCollection.findOne({ serverId: guild.id });
  if (!config) return;
  
  // Existing Verification Process
  if (newState.channelId === config.voiceVerificationChannelId) {
    try {
      const member = newState.member;
      const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);
      if (!unverifiedRole || !member.roles.cache.has(unverifiedRole.id)) {
        console.log(`${member.displayName} is not unverified; skipping ephemeral VC creation.`);
        return;
      }
      const tempVC = await guild.channels.create({
        name: `Verify – ${member.displayName}`,
        type: 2,
        parent: newState.channel.parentId,
        userLimit: 2
      });
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
      if (alertChannel) {
        const notifMsg = await alertChannel.send("(# Member Jdid 🙋‍♂️)");
        setTimeout(() => notifMsg.delete().catch(() => {}), 10000);
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        const buttonMsg = await alertChannel.send({ components: [row] });
        setTimeout(() => buttonMsg.delete().catch(() => {}), 10000);
      }
    } catch (err) {
      console.error("Error in verification VC creation:", err);
    }
  }
  
  // One-Tap Process: When a verified user joins the designated one-tap channel
  if (newState.channelId === config.oneTapChannelId) {
    try {
      const member = newState.member;
      const displayName = member.displayName || member.user.username;
      const permissionOverwrites = [];
      if (config.unverifiedRoleId) {
        const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);
        if (unverifiedRole) {
          permissionOverwrites.push({ id: unverifiedRole.id, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] });
        } else {
          console.error("Unverified role not found in guild", guild.id);
        }
      }
      permissionOverwrites.push({ id: member.id, allow: [PermissionsBitField.Flags.Connect] });
      const tempVC = await guild.channels.create({
        name: `${displayName}'s Room`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites
      });
      onetapSessions.set(tempVC.id, { owner: member.id, rejectedUsers: [], status: "" });
      await member.voice.setChannel(tempVC);
    } catch (err) {
      console.error("Error creating one-tap VC:", err);
    }
  }
  
  // Need Help Process: When a member joins the designated need help channel
  if (newState.channelId === config.needHelpChannelId) {
    try {
      const member = newState.member;
      const displayName = member.displayName || member.user.username;
      const permissionOverwrites = [];
      if (config.unverifiedRoleId) {
        const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);
        if (unverifiedRole) {
          permissionOverwrites.push({ id: unverifiedRole.id, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] });
        }
      }
      const helpVC = await guild.channels.create({
        name: `${displayName} needs help`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites
      });
      onetapSessions.set(helpVC.id, { owner: member.id, rejectedUsers: [], status: "need help" });
      await member.voice.setChannel(helpVC);
      if (config.helperRoleId && config.needHelpLogChannelId && config.needHelpLogChannelId !== "none") {
        const helperRole = guild.roles.cache.get(config.helperRoleId);
        const helpLogChannel = guild.channels.cache.get(config.needHelpLogChannelId);
        if (helperRole && helpLogChannel) {
          helpLogChannel.send(`Hey ${helperRole.toString()}, ${member.displayName} needs help!`).catch(console.error);
        }
      }
    } catch (err) {
      console.error("Error creating need help VC:", err);
    }
  }
  
  // One-Tap: Auto-delete VC if empty and reassign owner if needed
  if (oldState.channel && onetapSessions.has(oldState.channel.id)) {
    let session = onetapSessions.get(oldState.channel.id);
    if (oldState.member.id === session.owner) {
      const remaining = oldState.channel.members;
      if (remaining.size > 0) {
        const newOwner = remaining.first();
        session.owner = newOwner.id;
        onetapSessions.set(oldState.channel.id, session);
      }
    }
    if (oldState.channel.members.size === 0) {
      oldState.channel.delete().catch(() => {});
      onetapSessions.delete(oldState.channel.id);
    }
  }
  
  // Verification VC: If verificator leaves, move verified user to nearest open VC
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    if (oldState.member.id === session.assignedVerificator) {
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        let activeVC = guild.channels.cache
          .filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0)
          .first();
        if (!activeVC) activeVC = guild.channels.cache.get(config.voiceVerificationChannelId);
        if (activeVC) {
          await verifiedMember.voice.setChannel(activeVC);
        }
      }
    }
    if (oldState.channel.members.size === 0) {
      oldState.channel.delete().catch(() => {});
      verificationSessions.delete(oldState.channel.id);
    }
  }
});

// ------------------------------
// +boy / +girl Verification Command Handler (No mention required)
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.content.startsWith('+boy') || message.content.startsWith('+girl')) {
    const config = await settingsCollection.findOne({ serverId: message.guild.id });
    if (!config) return message.reply("Bot is not configured for this server.");
    
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel || !verificationSessions.has(voiceChannel.id)) {
      return message.reply("You must be in a verification session VC to verify a user.");
    }
    const session = verificationSessions.get(voiceChannel.id);
    const memberToVerify = message.guild.members.cache.get(session.userId);
    if (!memberToVerify) return message.reply("No unverified user found in this session.");
    try {
      if (config.unverifiedRoleId) await memberToVerify.roles.remove(config.unverifiedRoleId);
      if (message.content.startsWith('+boy')) {
        if (config.verifiedRoleId) await memberToVerify.roles.add(config.verifiedRoleId);
        message.channel.send(`${memberToVerify.displayName} verified as Boy!`);
      } else {
        if (config.verifiedGirlRoleId) await memberToVerify.roles.add(config.verifiedGirlRoleId);
        message.channel.send(`${memberToVerify.displayName} verified as Girl!`);
      }
    } catch (err) {
      console.error("Verification error:", err);
      message.reply("Verification failed. Check my permissions or role hierarchy.");
    }
  }
});

// ------------------------------
// "R" Command for Profile Viewer
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  if ((content === 'r' || content.startsWith('r ')) && content !== 'ready') {
    let targetUser = message.mentions.users.first() || message.author;
    try {
      targetUser = await targetUser.fetch();
    } catch (err) {
      console.error("Error fetching user data:", err);
      return message.reply("Error fetching user data.");
    }
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`${targetUser.username}'s Profile Picture`)
      .setDescription("Click a button below to view Avatar or Banner.")
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }));
    const avatarButton = new ButtonBuilder()
      .setCustomId(`avatar_${targetUser.id}`)
      .setLabel("Avatar")
      .setStyle(ButtonStyle.Primary);
    const bannerButton = new ButtonBuilder()
      .setCustomId(`banner_${targetUser.id}`)
      .setLabel("Banner")
      .setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder().addComponents(avatarButton, bannerButton);
    message.channel.send({ embeds: [embed], components: [row] });
  }
});

// ------------------------------
// Interaction Handler for Profile Viewer Buttons (Avatar/Banner)
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("lang_") || interaction.customId.startsWith("join_verification_")) return;
  const [action, userId] = interaction.customId.split('_');
  if (!userId) return;
  try {
    const targetUser = await client.users.fetch(userId, { force: true });
    if (action === 'avatar') {
      const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`${targetUser.username}'s Avatar`)
        .setImage(avatarURL);
      return interaction.update({ embeds: [embed], components: [] });
    } else if (action === 'banner') {
      const bannerURL = targetUser.bannerURL({ dynamic: true, size: 1024 });
      if (!bannerURL) return interaction.reply({ content: "No banner set.", ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`${targetUser.username}'s Banner`)
        .setImage(bannerURL);
      return interaction.update({ embeds: [embed], components: [] });
    }
  } catch (err) {
    console.error("Error fetching user for profile:", err);
    return interaction.reply({ content: "Error fetching user data.", ephemeral: true });
  }
});

// ------------------------------
// Client Login
// ------------------------------
client.login(process.env.DISCORD_TOKEN);
