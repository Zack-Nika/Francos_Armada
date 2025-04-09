 // index.js
// Franco's Armada Bot – Complete Code with Setup, Multi-Language Configuration,
// Verification (/boy and /girl), One-Tap, Need-Help, /aji and Notifications

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

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Force the username to "Franco's Armada 🔱" if needed
  if (client.user.username !== "Franco's Armada 🔱") {
    client.user.setUsername("Franco's Armada 🔱").catch(console.error);
  }
});

// ------------------------------
// Global Maps for Sessions & Setup
// ------------------------------
const setupStarted = new Map();          // Prevent duplicate setups per guild
const verificationSessions = new Map();  // Stores ephemeral verification sessions { channelId: { userId, verified? } }
const onetapSessions = new Map();        // Stores one-tap & need-help ephemeral channels { channelId: { owner, type, rejectedUsers } }
const jailData = new Map();              // For jail/unban commands

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
// runSetup: Interactive Setup Process (Asking for Role and Channel IDs)
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
  // Global commands:
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
  // Session commands:
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your session'),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user in your session')
    .addUserOption(o => o.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user in your session')
    .addUserOption(o => o.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your session'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your session'),
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
  new SlashCommandBuilder().setName('name').setDescription('Rename your session')
    .addStringOption(o => o.setName('text').setDescription('New name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your session')
    .addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('Show available commands'),
  // Verification Commands – Only verificators (or admins) can use these:
  new SlashCommandBuilder().setName('boy').setDescription('Verify as Boy (verificators only)'),
  new SlashCommandBuilder().setName('girl').setDescription('Verify as Girl (verificators only)'),
  // Admin Command /aji – Move a tagged user to your current voice channel:
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
  if (interaction.isButton()) {
    // "Join Help" Button – Only helpers (or admins) can use it, blocking unverified users
    if (interaction.customId.startsWith("join_help_")) {
      const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
      if (config && config.unverifiedRoleId && interaction.member.roles.cache.has(config.unverifiedRoleId)) {
        return interaction.reply({ content: "Unverified users cannot join help sessions.", ephemeral: true });
      }
      const parts = interaction.customId.split("_");
      const ephemeralChannelId = parts.slice(2).join("_");
      const session = onetapSessions.get(ephemeralChannelId);
      if (!session) return interaction.reply({ content: "No help session found.", ephemeral: true });
      if (
        !config ||
        (!interaction.member.roles.cache.has(config.helperRoleId) &&
         !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      ) {
        return interaction.reply({ content: "You are not allowed to join this help session.", ephemeral: true });
      }
      try {
        if (interaction.guild.channels.cache.get(ephemeralChannelId).members.size >= 2) {
          return interaction.reply({ content: "A helper has already joined this session.", ephemeral: true });
        }
        await interaction.member.voice.setChannel(ephemeralChannelId);
        return interaction.reply({ content: "You've joined the help session!", ephemeral: false });
      } catch (err) {
        console.error("join_help error:", err);
        return interaction.reply({ content: "Failed to join help session.", ephemeral: false });
      }
    }
    
    // "Join Verification" Button – Only verificators (or admins) can use it
    if (interaction.customId.startsWith("join_verification_")) {
      const parts = interaction.customId.split("_");
      const ephemeralChannelId = parts.slice(2).join("_");
      const ephemeralChannel = interaction.guild.channels.cache.get(ephemeralChannelId);
      if (!ephemeralChannel) return interaction.reply({ content: "Verification session not found.", ephemeral: true });
      if (ephemeralChannel.members.size >= 2) {
        return interaction.reply({ content: "A verificator has already joined this session.", ephemeral: true });
      }
      const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
      if (
        !config ||
        (!interaction.member.roles.cache.has(config.verificatorRoleId) &&
         !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      ) {
        return interaction.reply({ content: "You are not allowed to verify members.", ephemeral: true });
      }
      try {
        // Mode 1: if user is already in a voice channel, move them directly
        if (interaction.member.voice.channel) {
          await interaction.member.voice.setChannel(ephemeralChannelId);
          return interaction.reply({ content: "You've been moved to the verification session!", ephemeral: false });
        } else {
          // Mode 2: Otherwise, create an invite and send it
          const invite = await ephemeralChannel.createInvite({ maxAge: 300, maxUses: 1 });
          return interaction.reply({ content: `You are not in a voice channel. Please join using this invite link: ${invite.url}`, ephemeral: false });
        }
      } catch (err) {
        console.error("join_verification error:", err);
        return interaction.reply({ content: "Failed to join verification session.", ephemeral: false });
      }
    }
    
    // Avatar/Banner Buttons – unchanged
    if (interaction.customId.startsWith("avatar_") || interaction.customId.startsWith("banner_")) {
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
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Error fetching user data.", ephemeral: true });
      }
    }
    return; // End button handling.
  }
  
  // Slash Command Handling
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  if (!config) {
    return interaction.reply({ content: "Bot is not configured for this server.", ephemeral: true });
  }
  
  // Global Admin Commands – (setprefix, setwelcome, etc.)
  const globalCmds = ["setprefix", "setwelcome", "showwelcome", "jail", "jinfo", "unban", "binfo", "topvrf", "toponline"];
  if (globalCmds.includes(commandName)) {
    // [Insert your existing global command logic here]
    return;
  }
  
  // Verification Commands: /boy and /girl – only for verificators (or admins)
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
      if (config.unverifiedRoleId) {
        await unverifiedMember.roles.remove(config.unverifiedRoleId);
      }
      if (commandName === "boy") {
        if (config.verifiedRoleId) await unverifiedMember.roles.add(config.verifiedRoleId);
        await interaction.reply({ content: `${unverifiedMember} has been verified as Boy successfully ✨️`, ephemeral: false });
      } else if (commandName === "girl") {
        if (config.verifiedGirlRoleId) await unverifiedMember.roles.add(config.verifiedGirlRoleId);
        await interaction.reply({ content: `${unverifiedMember} has been verified as Girl successfully ✨️`, ephemeral: false });
      }
      // Mark the verification session as verified instead of deleting immediately
      verificationSessions.set(vc.id, { userId: sessionData.userId, verified: true });
    } catch (err) {
      console.error("Verification error:", err);
      return interaction.reply({ content: "Verification failed. Check my permissions or role hierarchy.", ephemeral: true });
    }
    return;
  }
  
  // Admin Command: /aji – move a tagged user to your current voice channel
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
      return interaction.reply({ content: `Moved ${targetMember.displayName} to your channel.`, ephemeral: false });
    } catch (err) {
      console.error("aji error:", err);
      return interaction.reply({ content: "Failed to move the user.", ephemeral: false });
    }
  }
  
  // Session Commands (One-Tap Commands) – respond via fancy embed (non-ephemeral)
  const sessionCommands = ["claim", "mute", "unmute", "lock", "unlock", "limit", "reject", "perm", "hide", "unhide", "transfer", "name", "status"];
  if (sessionCommands.includes(commandName)) {
    let responseText = "";
    switch(commandName) {
      case "claim":
        responseText = "You have claimed your One-Tap session!";
        break;
      case "mute":
        const muteTarget = interaction.options.getUser("target");
        responseText = `${muteTarget} has been muted in your session!`;
        break;
      case "unmute":
        const unmuteTarget = interaction.options.getUser("target");
        responseText = `${unmuteTarget} has been unmuted in your session!`;
        break;
      case "lock":
        responseText = "Your session has been locked!";
        break;
      case "unlock":
        responseText = "Your session has been unlocked!";
        break;
      case "limit":
        const limitNumber = interaction.options.getInteger("number");
        responseText = `User limit for your session has been set to ${limitNumber}!`;
        break;
      case "reject":
        const rejectTarget = interaction.options.getUser("target");
        responseText = `${rejectTarget} has been rejected from your session!`;
        break;
      case "perm":
        const permTarget = interaction.options.getUser("target");
        responseText = `${permTarget} is now permitted to join your session again!`;
        break;
      case "hide":
        responseText = "Your session is now hidden!";
        break;
      case "unhide":
        responseText = "Your session is now visible!";
        break;
      case "transfer":
        const transferTarget = interaction.options.getUser("target");
        responseText = `Session ownership has been transferred to ${transferTarget}!`;
        break;
      case "name":
        const newName = interaction.options.getString("text");
        responseText = `Your session has been renamed to: ${newName}`;
        break;
      case "status":
        const newStatus = interaction.options.getString("text");
        responseText = `Your session status has been updated: ${newStatus}`;
        break;
      default:
        responseText = "Command executed!";
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setDescription(responseText)
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: false });
  }
});

// ------------------------------
// MessageCreate Handler for Setup and Other Text Commands
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  // "Ready" Handler in "bot-setup" channel: owner types "ready" to begin interactive setup
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
        // Delete the setup channel after a short delay
        setTimeout(() => { message.channel.delete().catch(() => {}); }, 5000);
      } catch (err) {
        console.error("Setup error:", err);
      }
    }
    return;
  }
  // Optionally add additional text command handlers (e.g. for profile viewing) here.
});

// ------------------------------
// On Guild Join: Create "bot-setup" and "bot-config" Channels with Language Selection
// ------------------------------
client.on(Events.GuildCreate, async guild => {
  try {
    const owner = await guild.fetchOwner();
    const setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0, // Text channel
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
      topic: 'Use slash commands for configuration (e.g. /setprefix, /setwelcome, etc.)',
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
      .setColor(0x00AE86)
      .setTitle("Welcome!")
      .setDescription("Select your language using the buttons below, then type `ready` to begin setup.");
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
// voiceStateUpdate Handler for Verification, One-Tap & Need-Help Processes
// ------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    console.log(`[DEBUG] voiceStateUpdate: old=${oldState.channelId}, new=${newState.channelId}, member=${newState.member.id}`);
    const member = newState.member;
    const guild = newState.guild;
    const config = await settingsCollection.findOne({ serverId: guild.id });
    if (!config) return;
    
    // Verification Process:
    if (config.voiceVerificationChannelId && newState.channelId === config.voiceVerificationChannelId) {
      if (config.unverifiedRoleId && !member.roles.cache.has(config.unverifiedRoleId)) return;
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2, // Voice channel
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
            .setColor(0x00AE86)
            .setTitle(`New Member ${member.displayName} 🙋‍♂️`)
            .setDescription("Ajew!")
            .setFooter({ text: "Franco's Armada 🔱 (#verification-alerts)" });
          const joinButton = new ButtonBuilder()
            .setCustomId(`join_verification_${ephemeralChannel.id}`)
            .setLabel("Join Verification")
            .setStyle(ButtonStyle.Success);
          const row = new ActionRowBuilder().addComponents(joinButton);
          await alertChannel.send({
            embeds: [embed],
            components: [row],
            allowedMentions: { roles: [config.verificatorRoleId] }
          }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 11000));
        }
      }
      return;
    }
    
    // One-Tap Process:
    if (config.oneTapChannelId && newState.channelId === config.oneTapChannelId) {
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) return;
      // Delete any old one-tap session for this member
      for (const [channelId, session] of onetapSessions.entries()) {
        if (session.owner === member.id && session.type === "oneTap") {
          const oldChan = guild.channels.cache.get(channelId);
          if (oldChan) await oldChan.delete().catch(() => {});
          onetapSessions.delete(channelId);
        }
      }
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `${member.displayName}'s Room`,
        type: 2, // Voice channel
        parent: parentCategory,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.Connect] },
          { id: config.unverifiedRoleId, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
          { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles] }
        ]
      });
      onetapSessions.set(ephemeralChannel.id, { owner: member.id, type: "oneTap", rejectedUsers: [] });
      await member.voice.setChannel(ephemeralChannel);
    }
    
    // Need-Help Process:
    if (config.needHelpChannelId && newState.channelId === config.needHelpChannelId) {
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) return;
      // Delete any existing need-help session for this member
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
        type: 2, // Voice channel
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
          const helpText = `# ${member.displayName} needs help.`;
          const joinButton = new ButtonBuilder()
            .setCustomId(`join_help_${ephemeralChannel.id}`)
            .setLabel("Join Help")
            .setStyle(ButtonStyle.Danger);
          const row = new ActionRowBuilder().addComponents(joinButton);
          await logChannel.send({
            content: `<@&${config.helperRoleId}> ${helpText}`,
            components: [row],
            allowedMentions: { roles: [config.helperRoleId] }
          }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 11000));
        }
      }
    }
    
    // *** NEW VERIFICATION SESSION HANDLING ***
    // Check for any verification channels that have been marked as verified
    // and have only one member left (the verified user). Then move them to a new one-tap channel.
    for (const [channelId, session] of verificationSessions.entries()) {
      const verifChannel = guild.channels.cache.get(channelId);
      if (verifChannel && session.verified && verifChannel.members.size === 1) {
        const remainingMember = verifChannel.members.first();
        const parentCategory = verifChannel.parentId;
        const oneTapChannel = await guild.channels.create({
          name: `${remainingMember.displayName}'s Room`,
          type: 2,
          parent: parentCategory,
          permissionOverwrites: [
            { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.Connect] },
            { id: config.unverifiedRoleId, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
            { id: remainingMember.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles] }
          ]
        });
        onetapSessions.set(oneTapChannel.id, { owner: remainingMember.id, type: "oneTap", rejectedUsers: [] });
        await remainingMember.voice.setChannel(oneTapChannel);
        verifChannel.delete().catch(() => {});
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
    if (channel && channel.type === 2 && channel.members.size === 0) {
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
// Client Login
// ------------------------------
client.login(process.env.DISCORD_TOKEN);

