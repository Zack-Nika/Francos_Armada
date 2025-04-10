// index.js
// Franco's Armada Bot – Complete Code with Setup, Multi-Language Configuration,
// Verification (/boy and /girl), One-Tap, Need-Help, Profile Viewer (via "R" message),
// /aji and Notifications

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
// Create Discord Client (single declaration)
// ------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (client.user.username !== "Franco's Armada 🔱") {
    client.user.setUsername("Franco's Armada 🔱").catch(console.error);
  }
});

// ------------------------------
// Global Maps for Sessions & Setup
// ------------------------------
const setupStarted = new Map(); // Prevent duplicate setups per guild
// verificationSessions: { channelId: { userId, verified?: boolean } }
const verificationSessions = new Map();
// onetapSessions: { channelId: { owner, type, rejectedUsers, baseName, status } }
const onetapSessions = new Map();
const jailData = new Map(); // For jail/unban commands

// ------------------------------
// Multi-Language Prompts & Extras
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
    verifiedRoleId: "🔹 **# 3tini l'ID dial Verified Boy Role**",
    unverifiedRoleId: "🔹 **# 3tini l'ID dial Unverified Role**",
    verifiedGirlRoleId: "🔹 **# 3tini l'ID dial Verified Girl Role**",
    verificatorRoleId: "🔹 **# 3tini l'ID dial Verificator Role**",
    voiceVerificationChannelId: "🔹 **# Daba 3tini l'ID dial Join Verification (fen bnadem taytverifa)**",
    oneTapChannelId: "🔹 **# 3tini daba l'ID dial One-Tap**",
    verificationAlertChannelId: "🔹 **# 3tini daba l'ID dial Verification Alerts**",
    jailRoleId: "🔹 **# 3tini l'ID dial Jailed Role** (awla la ma3endeksh, kteb `none`)",
    voiceJailChannelId: "🔹 **# Ara m3ak l'ID dial Jaled voice channel** (awla `none`)",
    verificationLogChannelId: "🔹 **# 3tini l'ID dial Verification logs** (awla `none`)",
    needHelpChannelId: "🔹 **# 3tini l'ID dial Need Help channel**",
    helperRoleId: "🔹 **# 3tini l'ID dial Helper Role**",
    needHelpLogChannelId: "🔹 **# 3tini l'ID dial Need Help logs** (awla `none`)"
  },
  spanish: {
    verifiedRoleId: "🔹 **# Proporciona el ID del rol Verified Boy**",
    unverifiedRoleId: "🔹 **# Proporciona el ID del rol Unverified**",
    verifiedGirlRoleId: "🔹 **# Proporciona el ID del rol Verified Girl**",
    verificatorRoleId: "🔹 **# Proporciona el ID del rol Verificator**",
    voiceVerificationChannelId: "🔹 **# Proporciona el ID del canal permanente de verificación**",
    oneTapChannelId: "🔹 **# Proporciona el ID del canal One-Tap**",
    verificationAlertChannelId: "🔹 **# Proporciona el ID del canal de alertas de verificación**",
    jailRoleId: "🔹 **# Proporciona el ID del rol Jail** (o escribe `none`)",
    voiceJailChannelId: "🔹 **# Proporciona el ID del canal de voz de Jail** (o escribe `none`)",
    verificationLogChannelId: "🔹 **# Proporciona el ID del canal de logs de verificación** (o escribe `none`)",
    needHelpChannelId: "🔹 **# Proporciona el ID del canal Need Help**",
    helperRoleId: "🔹 **# Proporciona el ID del rol Helper**",
    needHelpLogChannelId: "🔹 **# Proporciona el ID del canal de logs de Need Help** (o escribe `none`)"
  },
  russian: {
    verifiedRoleId: "🔹 **# Укажите ID роли для подтверждённого парня**",
    unverifiedRoleId: "🔹 **# Укажите ID роли для неподтверждённого пользователя**",
    verifiedGirlRoleId: "🔹 **# Укажите ID роли для подтверждённой девочки**",
    verificatorRoleId: "🔹 **# Укажите ID роли для проверяющего**",
    voiceVerificationChannelId: "🔹 **# Укажите ID постоянного голосового канала проверки**",
    oneTapChannelId: "🔹 **# Укажите ID канала One-Tap**",
    verificationAlertChannelId: "🔹 **# Укажите ID канала уведомлений о проверке**",
    jailRoleId: "🔹 **# Укажите ID роли для тюрьмы** (или напишите `none`)",
    voiceJailChannelId: "🔹 **# Укажите ID голосового канала тюрьмы** (или напишите `none`)",
    verificationLogChannelId: "🔹 **# Укажите ID канала логов проверки** (или напишите `none`)",
    needHelpChannelId: "🔹 **# Укажите ID канала Need Help**",
    helperRoleId: "🔹 **# Укажите ID роли для помощника**",
    needHelpLogChannelId: "🔹 **# Укажите ID канала логов Need Help** (или напишите `none`)"
  },
  french: {
    verifiedRoleId: "🔹 **# Fournissez l'ID du rôle Verified Boy**",
    unverifiedRoleId: "🔹 **# Fournissez l'ID du rôle Unverified**",
    verifiedGirlRoleId: "🔹 **# Fournissez l'ID du rôle Verified Girl**",
    verificatorRoleId: "🔹 **# Fournissez l'ID du rôle Verificator**",
    voiceVerificationChannelId: "🔹 **# Fournissez l'ID du canal vocal de vérification permanent**",
    oneTapChannelId: "🔹 **# Fournissez l'ID du canal One-Tap**",
    verificationAlertChannelId: "🔹 **# Fournissez l'ID du canal d'alertes de vérification**",
    jailRoleId: "🔹 **# Fournissez l'ID du rôle Jail** (ou tapez `none`)",
    voiceJailChannelId: "🔹 **# Fournissez l'ID du canal vocal Jail** (ou tapez `none`)",
    verificationLogChannelId: "🔹 **# Fournissez l'ID du canal de logs de vérification** (ou tapez `none`)",
    needHelpChannelId: "🔹 **# Fournissez l'ID du canal Need Help**",
    helperRoleId: "🔹 **# Fournissez l'ID du rôle Helper**",
    needHelpLogChannelId: "🔹 **# Fournissez l'ID du canal de logs Need Help** (ou tapez `none`)"
  }
};

const languageExtras = {
  english: {
    setupStart: "Let's begin setup. Please copy/paste each ID as prompted.",
    setupComplete: "Setup complete! 🎉"
  },
  darija: {
    setupStart: "Ghanbdaw Daba Setup. Wghade ykon kolshi sahel; sift lia ghi l'ID's li bghiti, wghaydouz kolshi mzyan.",
    setupComplete: "Safi l'Bot rah m9ad 100%. Wila khasek shi haja, dwe m3a Franco 🔱 🎉"
  },
  spanish: {
    setupStart: "Comencemos la configuración. Por favor, copia y pega cada ID según se te solicite.",
    setupComplete: "¡Configuración completada! 🎉"
  },
  russian: {
    setupStart: "Давайте начнем настройку. Пожалуйста, скопируйте и вставьте каждый ID по запросу.",
    setupComplete: "Настройка завершена! 🎉"
  },
  french: {
    setupStart: "Commençons la configuration. Veuillez copier/coller chaque ID tel qu'indiqué.",
    setupComplete: "Configuration terminée ! 🎉"
  }
};

// ------------------------------
// Helper: Await Single Message (90s Timeout)
// ------------------------------
async function awaitResponse(channel, userId, prompt) {
  await channel.send(prompt + "\n*(90 seconds to respond.)*");
  const filter = m => m.author.id === userId;
  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 90000, errors: ['time'] });
    return collected.first().content.trim();
  } catch {
    await channel.send("Setup timed out. Type `ready` to restart.");
    throw new Error("Setup timed out");
  }
}

// ------------------------------
// runSetup: Interactive Setup Process
// ------------------------------
async function runSetup(ownerId, setupChannel, guildId, lang) {
  const config = { serverId: guildId };
  const prompts = languagePrompts[lang] || languagePrompts.english;
  const extras = languageExtras[lang] || languageExtras.english;
  await setupChannel.send(extras.setupStart);
  for (const [key, prompt] of Object.entries(prompts)) {
    const response = await awaitResponse(setupChannel, ownerId, prompt);
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
// Slash Commands Registration
// ------------------------------
client.commands = new Collection();
const slashCommands = [
  // Global admin commands:
  new SlashCommandBuilder().setName('setprefix').setDescription('Set a custom prefix')
    .addStringOption(o => o.setName('prefix').setDescription('New prefix').setRequired(true)),
  new SlashCommandBuilder().setName('setwelcome').setDescription('Set a custom welcome message')
    .addStringOption(o => o.setName('message').setDescription('Welcome message').setRequired(true)),
  new SlashCommandBuilder().setName('showwelcome').setDescription('Show the current welcome message'),
  new SlashCommandBuilder().setName('jail').setDescription('Jail a user')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('jinfo').setDescription('Get jail info for a user')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('unban').setDescription('Unjail a user')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('binfo').setDescription('Show total bans')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('topvrf').setDescription('Show top verificators')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('toponline').setDescription('Show top online users')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  
  // Session commands (owner-only):
  new SlashCommandBuilder().setName('claim').setDescription('Claim an abandoned session'),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user in your session')
    .addUserOption(o => o.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user in your session')
    .addUserOption(o => o.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your session (prevent new joins)'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your session (allow new joins)'),
  new SlashCommandBuilder().setName('limit').setDescription('Set a user limit for your session')
    .addIntegerOption(o => o.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder().setName('reject').setDescription('Reject a user from your session')
    .addUserOption(o => o.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder().setName('perm').setDescription('Permit a rejected user to join again')
    .addUserOption(o => o.setName('target').setDescription('User to permit').setRequired(true)),
  new SlashCommandBuilder().setName('hide').setDescription('Hide your session'),
  new SlashCommandBuilder().setName('unhide').setDescription('Unhide your session'),
  new SlashCommandBuilder().setName('transfer').setDescription('Transfer session ownership')
    .addUserOption(o => o.setName('target').setDescription('User to transfer to').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your session (set base name)')
    .addStringOption(o => o.setName('text').setDescription('New base name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your session (displayed under base name)')
    .addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('Show available commands'),

  // Verification commands (restricted):
  new SlashCommandBuilder().setName('boy').setDescription('Verify as Boy (verificators only)'),
  new SlashCommandBuilder().setName('girl').setDescription('Verify as Girl (verificators only)'),
  
  // Admin command:
  new SlashCommandBuilder().setName('aji')
    .setDescription('Move a tagged user to your current voice channel (admin only)')
    .addUserOption(o => o.setName('target').setDescription('User to move').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering global slash commands...');
    await rest.put(
      require('discord-api-types/v10').Routes.applicationCommands(process.env.CLIENT_ID),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('Global slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

// ------------------------------
// Interaction Handler for Buttons & Slash Commands
// ------------------------------
client.on('interactionCreate', async interaction => {
  // Handle language buttons first.
  if (interaction.isButton() && interaction.customId.startsWith("lang_")) {
    const chosenLang = interaction.customId.split("_")[1]; // e.g. "darija", "english", etc.
    // Fetch current config for the guild.
    let configData = await settingsCollection.findOne({ serverId: interaction.guild.id });
    if (!configData) {
      configData = { serverId: interaction.guild.id };
    }
    // Update the language in the database.
    configData.language = chosenLang;
    await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { language: chosenLang } }, { upsert: true });
    const embed = new EmbedBuilder()
      .setColor(0xFFEB3B)
      .setDescription(`✅ Language has been set to **${chosenLang}**!\nNow type "ready" to begin setup.`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  if (interaction.isButton()) {
    // "Join Help" Button
    if (interaction.customId.startsWith("join_help_")) {
      const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
      if (config && config.unverifiedRoleId && interaction.member.roles.cache.has(config.unverifiedRoleId)) {
        return interaction.reply({ content: "Unverified users cannot join help sessions.", ephemeral: true });
      }
      const parts = interaction.customId.split("_");
      const channelId = parts.slice(2).join("_");
      const session = onetapSessions.get(channelId);
      if (!session) return interaction.reply({ content: "No help session found.", ephemeral: true });
      if (!config ||
          (!interaction.member.roles.cache.has(config.helperRoleId) &&
           !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))) {
        return interaction.reply({ content: "You are not allowed to join this help session.", ephemeral: true });
      }
      try {
        const ch = interaction.guild.channels.cache.get(channelId);
        if (ch.members.size >= 2) {
          return interaction.reply({ content: "A helper has already joined this session.", ephemeral: true });
        }
        await interaction.member.voice.setChannel(channelId);
        const embed = new EmbedBuilder()
          .setColor(0xFFEB3B)
          .setDescription(`✅ ${interaction.member}, you've joined the help session!`);
        return interaction.reply({ embeds: [embed], ephemeral: false });
      } catch (err) {
        console.error("join_help error:", err);
        return interaction.reply({ content: "Failed to join help session.", ephemeral: false });
      }
    }
    
    // "Join Verification" Button
    if (interaction.customId.startsWith("join_verification_")) {
      const parts = interaction.customId.split("_");
      const channelId = parts.slice(2).join("_");
      const verifChannel = interaction.guild.channels.cache.get(channelId);
      if (!verifChannel) return interaction.reply({ content: "Verification session not found.", ephemeral: true });
      if (verifChannel.members.size >= 2) {
        return interaction.reply({ content: "A verificator has already joined this session.", ephemeral: true });
      }
      const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
      if (!config ||
          (!interaction.member.roles.cache.has(config.verificatorRoleId) &&
           !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))) {
        return interaction.reply({ content: "You are not allowed to verify members.", ephemeral: true });
      }
      try {
        if (interaction.member.voice.channel) {
          await interaction.member.voice.setChannel(channelId);
          const embed = new EmbedBuilder()
            .setColor(0xFFEB3B)
            .setDescription(`✅ ${interaction.member}, you've been moved to the verification session!`);
          const replyMsg = await interaction.reply({ embeds: [embed], ephemeral: false });
          setTimeout(() => replyMsg.delete().catch(() => {}), 10000);
        } else {
          const invite = await verifChannel.createInvite({ maxAge: 300, maxUses: 1 });
          const embed = new EmbedBuilder()
            .setColor(0xFFEB3B)
            .setDescription(`✅ ${interaction.member}, join with this link: ${invite.url}`);
          const linkMsg = await interaction.reply({ embeds: [embed], ephemeral: false });
          setTimeout(() => linkMsg.delete().catch(() => {}), 10000);
        }
      } catch (err) {
        console.error("join_verification error:", err);
        return interaction.reply({ content: "Failed to join verification session.", ephemeral: false });
      }
    }
    
    // Profile Buttons: "Avatar" and "Banner"
    if (interaction.customId.startsWith("avatar_") || interaction.customId.startsWith("banner_")) {
      const [action, userId] = interaction.customId.split('_');
      try {
        const targetUser = await client.users.fetch(userId, { force: true });
        if (action === 'avatar') {
          const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });
          const embed = new EmbedBuilder()
            .setColor(0xFFEB3B)
            .setTitle(`${targetUser.username}'s Avatar`)
            .setImage(avatarURL);
          return interaction.update({ embeds: [embed], components: [] });
        } else if (action === 'banner') {
          const bannerURL = targetUser.bannerURL({ dynamic: true, size: 1024 });
          if (!bannerURL) return interaction.reply({ content: "No banner set.", ephemeral: true });
          const embed = new EmbedBuilder()
            .setColor(0xFFEB3B)
            .setTitle(`${targetUser.username}'s Banner`)
            .setImage(bannerURL);
          return interaction.update({ embeds: [embed], components: [] });
        }
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Error fetching user data.", ephemeral: true });
      }
    }
    return; // End of button interactions.
  }
  
  if (!interaction.isChatInputCommand()) return;
  
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  if (!config) return interaction.reply({ content: "Bot is not configured for this server.", ephemeral: true });
  
  const { commandName } = interaction;
  
  // Global Admin Commands
  const globalCmds = ["setprefix", "setwelcome", "showwelcome", "jail", "jinfo", "unban", "binfo", "topvrf", "toponline"];
  if (globalCmds.includes(commandName)) {
    // [Implement global command logic if needed]
    return;
  }
  
  // Verification Commands: /boy and /girl
  if (commandName === "boy" || commandName === "girl") {
    if (!interaction.member.roles.cache.has(config.verificatorRoleId) &&
        !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "You are not allowed to verify members.", ephemeral: true });
    }
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
    }
    const vc = interaction.member.voice.channel;
    if (!verificationSessions.has(vc.id)) {
      return interaction.reply({ content: "This is not a verification session channel.", ephemeral: true });
    }
    const sessionData = verificationSessions.get(vc.id);
    const unverifiedMember = interaction.guild.members.cache.get(sessionData.userId);
    if (!unverifiedMember) {
      return interaction.reply({ content: "No unverified user found in this session.", ephemeral: true });
    }
    try {
      if (config.unverifiedRoleId) await unverifiedMember.roles.remove(config.unverifiedRoleId);
      if (commandName === "boy") {
        if (config.verifiedRoleId) await unverifiedMember.roles.add(config.verifiedRoleId);
      } else {
        if (config.verifiedGirlRoleId) await unverifiedMember.roles.add(config.verifiedGirlRoleId);
      }
      const embed = new EmbedBuilder()
        .setColor(0xFFEB3B)
        .setDescription(`✅ ${interaction.member}, you have verified ${unverifiedMember.displayName} as **${commandName === "boy" ? "Boy" : "Girl"}** successfully!`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: false });
      
      if (config.verificationLogChannelId) {
        const logsChannel = interaction.guild.channels.cache.get(config.verificationLogChannelId);
        if (logsChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(0xFFEB3B)
            .setTitle("Verification Log")
            .setDescription(`${interaction.user} has verified ${unverifiedMember} as **${commandName === "boy" ? "Boy" : "Girl"}**.`)
            .setTimestamp();
          await logsChannel.send({ embeds: [logEmbed] });
        }
      }
      // Mark the verification session as verified for later movement.
      verificationSessions.set(vc.id, { userId: sessionData.userId, verified: true });
    } catch (err) {
      console.error("Verification error:", err);
      return interaction.reply({ content: "Verification failed. Check my permissions or role hierarchy.", ephemeral: true });
    }
    return;
  }
  
  // Admin Command: /aji – move a tagged user to your voice channel.
  if (commandName === "aji") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "You are not allowed to use this command.", ephemeral: true });
    }
    const targetUser = interaction.options.getUser("target");
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
    }
    try {
      await targetMember.voice.setChannel(interaction.member.voice.channel.id);
      const embed = new EmbedBuilder()
        .setColor(0xFFEB3B)
        .setDescription(`✅ ${interaction.member}, you moved ${targetMember.displayName} to your channel!`);
      return interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (err) {
      console.error("aji error:", err);
      return interaction.reply({ content: "Failed to move the user.", ephemeral: false });
    }
  }
  
  // Session (One-Tap) Commands – must be executed by the session owner.
  const sessionCommands = ["claim", "mute", "unmute", "lock", "unlock", "limit", "reject", "perm", "hide", "unhide", "transfer", "name", "status"];
  if (sessionCommands.includes(commandName)) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel || !onetapSessions.has(voiceChannel.id)) {
      const embed = new EmbedBuilder()
        .setColor(0xFFEB3B)
        .setDescription(`⚠️ ${interaction.member}, you are not in a valid session.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    let session = onetapSessions.get(voiceChannel.id);
    // /claim: allow claim if the current owner is absent
    if (commandName === "claim") {
      if (!voiceChannel.members.has(session.owner)) {
        session.owner = interaction.user.id;
        onetapSessions.set(voiceChannel.id, session);
        const embed = new EmbedBuilder()
          .setColor(0xFFEB3B)
          .setDescription(`✅ ${interaction.member}, you have claimed this session!`);
        return interaction.reply({ embeds: [embed], ephemeral: false });
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xFFEB3B)
          .setDescription(`⚠️ ${interaction.member}, the session is still owned by someone else.`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
    // For other session commands, check that the issuer is the owner.
    if (session.owner !== interaction.user.id) {
      const embed = new EmbedBuilder()
        .setColor(0xFFEB3B)
        .setDescription(`⚠️ ${interaction.member}, you are not the owner of this session.`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    let responseText = "";
    switch (commandName) {
      case "mute": {
        const muteTarget = interaction.options.getUser("target");
        const targetMember = interaction.guild.members.cache.get(muteTarget.id);
        if (!targetMember.voice.channel || targetMember.voice.channel.id !== voiceChannel.id) {
          responseText = `⚠️ ${interaction.member}, the target is not in your session.`;
        } else {
          await targetMember.voice.setMute(true).catch(() => {});
          responseText = `✅ ${interaction.member}, you have muted ${muteTarget}!`;
        }
        break;
      }
      case "unmute": {
        const unmuteTarget = interaction.options.getUser("target");
        const targetMember = interaction.guild.members.cache.get(unmuteTarget.id);
        if (!targetMember.voice.channel || targetMember.voice.channel.id !== voiceChannel.id) {
          responseText = `⚠️ ${interaction.member}, the target is not in your session.`;
        } else {
          await targetMember.voice.setMute(false).catch(() => {});
          responseText = `✅ ${interaction.member}, you have unmuted ${unmuteTarget}!`;
        }
        break;
      }
      case "lock": {
        // Lock session: deny Connect for @everyone, but allow owner.
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        await voiceChannel.permissionOverwrites.edit(session.owner, { Connect: true });
        responseText = `✅ ${interaction.member}, your session has been locked!`;
        break;
      }
      case "unlock": {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        responseText = `✅ ${interaction.member}, your session has been unlocked!`;
        break;
      }
      case "limit": {
        const limitNumber = interaction.options.getInteger("number");
        await voiceChannel.setUserLimit(limitNumber).catch(() => {});
        responseText = `✅ ${interaction.member}, user limit has been set to ${limitNumber}!`;
        break;
      }
      case "reject": {
        const rejectTarget = interaction.options.getUser("target");
        await voiceChannel.permissionOverwrites.edit(rejectTarget.id, { Connect: false });
        const targetMember = interaction.guild.members.cache.get(rejectTarget.id);
        if (targetMember.voice.channel && targetMember.voice.channel.id === voiceChannel.id) {
          await targetMember.voice.disconnect().catch(() => {});
        }
        responseText = `✅ ${interaction.member}, you have rejected ${rejectTarget} from your session!`;
        break;
      }
      case "perm": {
        const permTarget = interaction.options.getUser("target");
        await voiceChannel.permissionOverwrites.edit(permTarget.id, { Connect: null });
        responseText = `✅ ${interaction.member}, ${permTarget} is now permitted to join your session again!`;
        break;
      }
      case "hide": {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        responseText = `✅ ${interaction.member}, your session is now hidden!`;
        break;
      }
      case "unhide": {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        responseText = `✅ ${interaction.member}, your session is now visible!`;
        break;
      }
      case "transfer": {
        const transferTarget = interaction.options.getUser("target");
        session.owner = transferTarget.id;
        onetapSessions.set(voiceChannel.id, session);
        responseText = `✅ ${interaction.member}, session ownership has been transferred to ${transferTarget}!`;
        break;
      }
      case "name": {
        const newName = interaction.options.getString("text");
        session.baseName = newName;
        // Compose final name as "baseName\nstatus" if status exists.
        let finalName = newName;
        if (session.status && session.status.trim() !== "") {
          finalName += `\n${session.status}`;
        }
        try {
          await voiceChannel.setName(finalName);
          responseText = `✅ ${interaction.member}, your session has been renamed to:\n**${newName}**`;
        } catch (err) {
          responseText = `⚠️ ${interaction.member}, failed to rename your session.`;
        }
        break;
      }
      case "status": {
        const newStatus = interaction.options.getString("text");
        session.status = newStatus;
        let base = session.baseName || voiceChannel.name;
        if (base.includes("\n")) {
          base = base.split("\n")[0];
        }
        let finalName = base;
        if (newStatus.trim() !== "") {
          finalName += `\n${newStatus}`;
        }
        try {
          await voiceChannel.setName(finalName);
          responseText = `✅ ${interaction.member}, your channel's status has been updated to:\n**${newStatus}**`;
        } catch (err) {
          responseText = `⚠️ ${interaction.member}, failed to update your session status.`;
        }
        break;
      }
      default: {
        responseText = "Command executed!";
      }
    }
    onetapSessions.set(voiceChannel.id, session);
    const embed = new EmbedBuilder()
      .setColor(0xFFEB3B)
      .setDescription(responseText)
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: false });
  }
});

// ------------------------------
// Profile Viewer via "R" Message Command
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const args = message.content.trim().split(" ");
  if (args[0].toLowerCase() === "r") {
    const target = message.mentions.users.first() || message.author;
    const avatarURL = target.displayAvatarURL({ dynamic: true, size: 256 });
    const embed = new EmbedBuilder()
      .setColor(0xFFEB3B)
      .setTitle(`${target.username}'s Profile`)
      .setThumbnail(avatarURL)
      .setDescription("Click a button below to view Avatar or Banner.")
      .setTimestamp();
    const avatarButton = new ButtonBuilder()
      .setCustomId(`avatar_${target.id}`)
      .setLabel("Avatar")
      .setStyle(ButtonStyle.Primary);
    const bannerButton = new ButtonBuilder()
      .setCustomId(`banner_${target.id}`)
      .setLabel("Banner")
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(avatarButton, bannerButton);
    return message.channel.send({ embeds: [embed], components: [row] });
  }
});

// ------------------------------
// Setup Handler – "ready" Command in bot-setup Channel
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.channel.name === 'bot-setup') {
    let owner;
    try {
      owner = await message.guild.fetchOwner();
    } catch (e) {
      console.error(e);
      return;
    }
    if (message.author.id !== owner.id) return;
    if (message.content.trim().toLowerCase() === 'ready') {
      if (setupStarted.get(message.guild.id)) return;
      setupStarted.set(message.guild.id, true);
      try {
        const config = await settingsCollection.findOne({ serverId: message.guild.id });
        const lang = (config && config.language) || "english";
        await runSetup(message.author.id, message.channel, message.guild.id, lang);
        setTimeout(() => { message.channel.delete().catch(() => {}); }, 5000);
      } catch (err) {
        console.error("Setup error:", err);
      }
    }
    return;
  }
});

// ------------------------------
// On Guild Join – Create "bot-setup" & "bot-config" Channels with Language Selection
// ------------------------------
client.on(Events.GuildCreate, async guild => {
  try {
    const owner = await guild.fetchOwner();
    const setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0,
      topic: 'Configure the bot here. This channel will be deleted after setup.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    setupChannel.send(`<@${owner.id}>, welcome! Please choose your preferred language using the buttons below, then type "ready" to begin setup.`);
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Use slash commands for configuration (e.g., /setprefix, /setwelcome, etc.)',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    const englishButton = new ButtonBuilder().setCustomId('lang_english').setLabel('English').setStyle(ButtonStyle.Primary);
    const darijaButton = new ButtonBuilder().setCustomId('lang_darija').setLabel('Darija').setStyle(ButtonStyle.Primary);
    const spanishButton = new ButtonBuilder().setCustomId('lang_spanish').setLabel('Spanish').setStyle(ButtonStyle.Primary);
    const russianButton = new ButtonBuilder().setCustomId('lang_russian').setLabel('Russian').setStyle(ButtonStyle.Primary);
    const frenchButton = new ButtonBuilder().setCustomId('lang_french').setLabel('French').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(englishButton, darijaButton, spanishButton, russianButton, frenchButton);
    const embed = new EmbedBuilder()
      .setColor(0xFFEB3B)
      .setTitle("Welcome!")
      .setDescription("Select your language using the buttons below, then type `ready` to begin setup.")
      .setTimestamp();
    setupChannel.send({ embeds: [embed], components: [row] });
  } catch (e) {
    console.error("Setup channel error:", e);
  }
});

// ------------------------------
// Auto-assign Unverified Role on Member Join
// ------------------------------
client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = await settingsCollection.findOne({ serverId: member.guild.id });
    if (!config) return;
    if (config.unverifiedRoleId) {
      const role = member.guild.roles.cache.get(config.unverifiedRoleId);
      if (role) await member.roles.add(role);
    }
  } catch (e) {
    console.error(e);
  }
});

// ------------------------------
// voiceStateUpdate Handler – Verification, One-Tap & Need-Help
// ------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    console.log(`[DEBUG] voiceStateUpdate: old=${oldState.channelId}, new=${newState.channelId}, member=${newState.member.id}`);
    const member = newState.member;
    const guild = newState.guild;
    const config = await settingsCollection.findOne({ serverId: guild.id });
    if (!config) return;
    
    // Verification Entry: user enters the permanent verification channel.
    if (config.voiceVerificationChannelId && newState.channelId === config.voiceVerificationChannelId) {
      if (config.unverifiedRoleId && !member.roles.cache.has(config.unverifiedRoleId)) return;
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2,
        parent: parentCategory,
        userLimit: 2,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
          { id: member.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.AttachFiles] }
        ]
      });
      verificationSessions.set(ephemeralChannel.id, { userId: member.id });
      await member.voice.setChannel(ephemeralChannel);
      if (config.verificationAlertChannelId && config.verificationAlertChannelId !== "none") {
        const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
        if (alertChannel) {
          const embed = new EmbedBuilder()
            .setColor(0xFFEB3B)
            .setTitle(`New Member ${member.displayName} 🙋‍♂️`)
            .setDescription("Ajew!")
            .setFooter({ text: "Franco's Armada 🔱 (#verification-alerts)" })
            .setTimestamp();
          const joinButton = new ButtonBuilder()
            .setCustomId(`join_verification_${ephemeralChannel.id}`)
            .setLabel("Join Verification")
            .setStyle(ButtonStyle.Success);
          const row = new ActionRowBuilder().addComponents(joinButton);
          const msg = await alertChannel.send({
            embeds: [embed],
            components: [row],
            allowedMentions: { roles: [config.verificatorRoleId] }
          });
          setTimeout(() => msg.delete().catch(() => {}), 11000);
        }
      }
      return;
    }
    
    // One-Tap Entry: user enters the permanent one-tap channel.
    if (config.oneTapChannelId && newState.channelId === config.oneTapChannelId) {
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) return;
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `${member.displayName}'s Room`,
        type: 2,
        parent: parentCategory,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
          { id: config.unverifiedRoleId, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
          { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles] }
        ]
      });
      onetapSessions.set(ephemeralChannel.id, {
        owner: member.id,
        type: "oneTap",
        rejectedUsers: [],
        baseName: ephemeralChannel.name,
        status: ""
      });
      await member.voice.setChannel(ephemeralChannel);
    }
    
    // Need-Help Entry: user enters the permanent need-help channel.
    if (config.needHelpChannelId && newState.channelId === config.needHelpChannelId) {
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) return;
      for (const [channelId, session] of onetapSessions.entries()) {
        if (session.owner === member.id && session.type === "needHelp") {
          const oldChan = guild.channels.cache.get(channelId);
          if (oldChan) await oldChan.delete().catch(() => {});
          onetapSessions.delete(channelId);
        }
      }
      const parentCategory = newState.channel.parentId;
      const overrides = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] }
      ];
      if (config.unverifiedRoleId) {
        overrides.push({ id: config.unverifiedRoleId, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] });
      }
      overrides.push({ id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles] });
      const ephemeralChannel = await guild.channels.create({
        name: `${member.displayName} needs help`,
        type: 2,
        parent: parentCategory,
        permissionOverwrites: overrides
      });
      onetapSessions.set(ephemeralChannel.id, { owner: member.id, type: "needHelp", rejectedUsers: [] });
      await member.voice.setChannel(ephemeralChannel);
      if (config.needHelpLogChannelId && config.needHelpLogChannelId !== "none") {
        const logChannel = guild.channels.cache.get(config.needHelpLogChannelId);
        if (logChannel) {
          if (config.unverifiedRoleId) {
            await logChannel.permissionOverwrites.edit(config.unverifiedRoleId, { ViewChannel: false, Connect: false });
          }
          const embed = new EmbedBuilder()
            .setColor(0xFFEB3B)
            .setDescription(`# ${member.displayName} needs help.`);
          const joinButton = new ButtonBuilder()
            .setCustomId(`join_help_${ephemeralChannel.id}`)
            .setLabel("Join Help")
            .setStyle(ButtonStyle.Danger);
          const row = new ActionRowBuilder().addComponents(joinButton);
          const msg = await logChannel.send({
            content: `<@&${config.helperRoleId}>`,
            embeds: [embed],
            components: [row],
            allowedMentions: { roles: [config.helperRoleId] }
          });
          setTimeout(() => msg.delete().catch(() => {}), 11000);
        }
      }
    }
    
    // NEW: When a verification channel is marked verified and only one member remains,
    // move them to an open one-tap channel (or create one if needed).
    for (const [channelId, session] of verificationSessions.entries()) {
      const verifChannel = guild.channels.cache.get(channelId);
      if (!verifChannel) continue;
      if (!session.verified) continue;
      if (verifChannel.members.size === 1) {
        const [remainingMember] = verifChannel.members.values();
        let foundTap = null;
        for (const [tapId, tapData] of onetapSessions.entries()) {
          if (tapData.type === "oneTap") {
            foundTap = tapId;
            break;
          }
        }
        if (foundTap) {
          await remainingMember.voice.setChannel(foundTap).catch(() => {});
        } else {
          let oneTapParent = guild.id;
          const baseOneTapChannel = guild.channels.cache.get(config.oneTapChannelId);
          if (baseOneTapChannel && baseOneTapChannel.parentId) {
            oneTapParent = baseOneTapChannel.parentId;
          }
          const newTap = await guild.channels.create({
            name: `${remainingMember.displayName}'s Room`,
            type: 2,
            parent: oneTapParent,
            permissionOverwrites: [
              { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
              { id: config.unverifiedRoleId, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
              { id: remainingMember.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles] }
            ]
          });
          onetapSessions.set(newTap.id, {
            owner: remainingMember.id,
            type: "oneTap",
            rejectedUsers: [],
            baseName: newTap.name,
            status: ""
          });
          await remainingMember.voice.setChannel(newTap);
        }
        await verifChannel.delete().catch(() => {});
        verificationSessions.delete(channelId);
      }
    }
  } catch (err) {
    console.error("voiceStateUpdate error:", err);
  }
});

// ------------------------------
// Periodic Cleanup of Ephemeral Channels
// ------------------------------
setInterval(async () => {
  for (const [channelId, session] of onetapSessions.entries()) {
    const channel = client.channels.cache.get(channelId);
    if (channel && channel.type === 2 && channel.members.size === 0) {
      try {
        await channel.delete();
      } catch (err) {
        console.error("Failed deleting ephemeral channel", channelId, err);
      }
      onetapSessions.delete(channelId);
    }
  }
  for (const [channelId, session] of verificationSessions.entries()) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      verificationSessions.delete(channelId);
      continue;
    }
    if (channel.type === 2 && channel.members.size === 0) {
      try {
        await channel.delete();
      } catch (err) {
        console.error("Failed deleting ephemeral verification channel", channelId, err);
      }
      verificationSessions.delete(channelId);
    }
  }
}, 2000);

// ------------------------------
// On Guild Join: Create "bot-setup" & "bot-config" Channels with Language Selection
// ------------------------------
client.on(Events.GuildCreate, async guild => {
  try {
    const owner = await guild.fetchOwner();
    const setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0,
      topic: 'Configure the bot here. This channel will be deleted after setup.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    setupChannel.send(`<@${owner.id}>, welcome! Please choose your preferred language using the buttons below, then type "ready" to begin setup.`);
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Use slash commands for configuration (e.g., /setprefix, /setwelcome, etc.)',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    const englishButton = new ButtonBuilder().setCustomId('lang_english').setLabel('English').setStyle(ButtonStyle.Primary);
    const darijaButton = new ButtonBuilder().setCustomId('lang_darija').setLabel('Darija').setStyle(ButtonStyle.Primary);
    const spanishButton = new ButtonBuilder().setCustomId('lang_spanish').setLabel('Spanish').setStyle(ButtonStyle.Primary);
    const russianButton = new ButtonBuilder().setCustomId('lang_russian').setLabel('Russian').setStyle(ButtonStyle.Primary);
    const frenchButton = new ButtonBuilder().setCustomId('lang_french').setLabel('French').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(englishButton, darijaButton, spanishButton, russianButton, frenchButton);
    const embed = new EmbedBuilder()
      .setColor(0xFFEB3B)
      .setTitle("Welcome!")
      .setDescription("Select your language using the buttons below, then type `ready` to begin setup.")
      .setTimestamp();
    setupChannel.send({ embeds: [embed], components: [row] });
  } catch (e) {
    console.error("Setup channel error:", e);
  }
});

// ------------------------------
// Auto-assign Unverified Role on Member Join
// ------------------------------
client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = await settingsCollection.findOne({ serverId: member.guild.id });
    if (!config) return;
    if (config.unverifiedRoleId) {
      const role = member.guild.roles.cache.get(config.unverifiedRoleId);
      if (role) await member.roles.add(role);
    }
  } catch (e) {
    console.error(e);
  }
});

// ------------------------------
// Client Login
// ------------------------------
client.login(process.env.DISCORD_TOKEN);