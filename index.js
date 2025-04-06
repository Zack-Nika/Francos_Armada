// index.js
// Franco's Armada Bot – A fully featured rental bot with interactive, multilingual per‑server setup.
// FEATURES:
// • Connects to MongoDB to store per‑server settings (language, custom prefix, role/channel IDs, custom welcome message).
// • When joini// index.js
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
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// -----------------------------------
// MongoDB Setup
// -----------------------------------
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

// -----------------------------------
// Discord Client
// -----------------------------------
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

// Prevent multiple setups
const setupStarted = new Map();

// -----------------------------------
// Language Data
// (same as before; omitted for brevity, but keep your languagePrompts, languageExtras, etc.)
// -----------------------------------
const languagePrompts = { /* ...unchanged... */ };
const languageExtras = { /* ...unchanged... */ };

// -----------------------------------
// Helper: Await Single Message
// -----------------------------------
async function awaitResponse(channel, userId, prompt, lang) {
  await channel.send(prompt + "\n*(90 seconds to respond, or setup times out.)*");
  const filter = m => m.author.id === userId;
  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 90000, errors: ['time'] });
    console.log(`Collected message: ${collected.first().content}`);
    return collected.first().content.trim();
  } catch (err) {
    await channel.send(
      (lang === "english" && "Setup timed out 🤷‍♂️. Type `ready` to restart setup.") ||
      (lang === "darija" && "Setup t9llat 🤷‍♂️. Kteb `ready` bach tbda men jdod.") ||
      // ...and so on for other languages...
      "Setup timed out. Type `ready` to restart setup."
    );
    throw new Error("Setup timed out");
  }
}

// -----------------------------------
// runSetup Function
// -----------------------------------
async function runSetup(ownerId, setupChannel, guildId, lang) {
  const config = { serverId: guildId };
  const prompts = languagePrompts[lang] || languagePrompts.english;
  const promptEntries = Object.entries(prompts);

  await setupChannel.send(languageExtras[lang]?.setupStart || languageExtras.english.setupStart);
  for (const [key, prompt] of promptEntries) {
    const response = await awaitResponse(setupChannel, ownerId, prompt, lang);
    config[key] = (response.toLowerCase() === "none") ? null : response;
  }
  try {
    await settingsCollection.updateOne({ serverId: guildId }, { $set: config }, { upsert: true });
    await setupChannel.send(languageExtras[lang]?.setupComplete || languageExtras.english.setupComplete);
  } catch (err) {
    console.error("Error saving configuration:", err);
    await setupChannel.send("Error saving configuration. Try again or contact support.");
  }
}

// -----------------------------------
// Slash Commands Setup
// -----------------------------------
client.commands = new Collection();
const slashCommands = [
  new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set a custom prefix for this server')
    .addStringOption(opt => opt.setName('prefix').setDescription('New prefix').setRequired(true)),
  
  // Remove defaultMemberPermissions so you can see them in the slash menu:
  new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Set a custom welcome message for new members')
    .addStringOption(opt => opt.setName('message').setDescription('The welcome message').setRequired(true)),
  new SlashCommandBuilder()
    .setName('showwelcome')
    .setDescription('Show the current custom welcome message'),

  new SlashCommandBuilder().setName('topvrf').setDescription('Show top verificators'),
  new SlashCommandBuilder().setName('binfo').setDescription('Show total bans'),
  new SlashCommandBuilder()
    .setName('jinfo')
    .setDescription('Show jail info for a user')
    .addStringOption(opt => opt.setName('userid').setDescription('User ID').setRequired(true)),
  new SlashCommandBuilder().setName('toponline').setDescription('Show most online users'),
  new SlashCommandBuilder().setName('topmembers').setDescription('Show top members by activity'),
  
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder().setName('reject').setDescription('Reject a user from joining your tap')
    .addUserOption(opt => opt.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user from your tap')
    .addUserOption(opt => opt.setName('target').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user in your voice channel')
    .addUserOption(opt => opt.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user in your voice channel')
    .addUserOption(opt => opt.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('transfer').setDescription('Transfer ownership of your tap')
    .addUserOption(opt => opt.setName('target').setDescription('User to transfer ownership to').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your tap')
    .addStringOption(opt => opt.setName('text').setDescription('New channel name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your tap')
    .addStringOption(opt => opt.setName('text').setDescription('Status text').setRequired(true)),

  new SlashCommandBuilder().setName('help').setDescription('Show available commands')
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Refreshing slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('Slash commands reloaded.');
  } catch (error) {
    console.error(error);
  }
})();

// -----------------------------------
// Create the Discord Client
// -----------------------------------
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// -----------------------------------
// Handle Language Buttons
// -----------------------------------
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith("lang_")) {
    const langChosen = interaction.customId.split('_')[1];
    try {
      await settingsCollection.updateOne(
        { serverId: interaction.guild.id },
        { $set: { language: langChosen } },
        { upsert: true }
      );
      await interaction.reply({ content: `Language set to ${langChosen}!`, ephemeral: true });
      await interaction.channel.send("Now type `ready` to begin the setup process.");
    } catch (err) {
      console.error("Error setting language:", err);
      await interaction.reply({ content: "Error setting language.", ephemeral: true });
    }
  }
});

// -----------------------------------
// "Ready" Handler for Setup
// -----------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  // For debugging, log the channel name:
  console.log(`Message from ${message.author.tag} in #${message.channel.name}: ${message.content}`);

  // If you want to restrict it to the "bot-setup" channel:
  if (message.channel.name !== 'bot-setup') return;
  
  // Only the server owner can trigger
  if (message.author.id !== message.guild.ownerId) return;

  if (message.content.toLowerCase() === 'ready') {
    console.log(`"ready" triggered by ${message.author.tag} in guild ${message.guild.name}`);
    if (setupStarted.get(message.guild.id)) {
      console.log("Setup already started. Ignoring.");
      return;
    }
    setupStarted.set(message.guild.id, true);

    // Grab language from DB
    const serverConfig = await settingsCollection.findOne({ serverId: message.guild.id });
    const lang = (serverConfig && serverConfig.language) || "english";

    await message.channel.send(languageExtras[lang]?.setupStart || languageExtras.english.setupStart);
    try {
      await runSetup(message.author.id, message.channel, message.guild.id, lang);
      setTimeout(() => {
        message.channel.delete().catch(console.error);
      }, 5000);
    } catch (err) {
      console.error("Setup process error:", err);
    }
  }
});

// -----------------------------------
// Slash Commands: One-tap, setwelcome, etc.
// (Same as before, just ensuring no defaultMemberPermissions so you can see them.)
// -----------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const isOwner = (interaction.member.id === interaction.guild.ownerId);
  const hasVerified = config && (
    interaction.member.roles.cache.has(config.verifiedRoleId) ||
    interaction.member.roles.cache.has(config.verifiedGirlRoleId)
  );
  const hasVerificator = config && interaction.member.roles.cache.has(config.verificatorRoleId);

  const { commandName } = interaction;
  if (commandName === 'setprefix') {
    const newPrefix = interaction.options.getString('prefix');
    try {
      await settingsCollection.updateOne(
        { serverId: interaction.guild.id },
        { $set: { prefix: newPrefix } },
        { upsert: true }
      );
      return interaction.reply({ content: `Prefix updated to \`${newPrefix}\`!`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Error updating prefix.", ephemeral: true });
    }
  }
  else if (commandName === 'setwelcome') {
    // Let them see the command but only let it run if admin or owner:
    if (!isAdmin && !isOwner) {
      return interaction.reply({ content: "Only admins or the server owner can set the welcome message.", ephemeral: true });
    }
    const newMsg = interaction.options.getString('message');
    try {
      await settingsCollection.updateOne(
        { serverId: interaction.guild.id },
        { $set: { customWelcome: newMsg } },
        { upsert: true }
      );
      return interaction.reply({ content: "Custom welcome message updated!", ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to update welcome message.", ephemeral: true });
    }
  }
  else if (commandName === 'showwelcome') {
    try {
      const cfg = await settingsCollection.findOne({ serverId: interaction.guild.id });
      const wMsg = cfg?.customWelcome || "No custom welcome message set.";
      return interaction.reply({ content: `Current welcome message: ${wMsg}`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to fetch welcome message.", ephemeral: true });
    }
  }
  else if (commandName === 'topvrf') {
    // Only admin, owner, or verificator
    if (!isAdmin && !isOwner && !hasVerificator) {
      return interaction.reply({ content: "No permission to use /topvrf", ephemeral: true });
    }
    return interaction.reply({ content: "Top verificators: [Coming soon...]", ephemeral: true });
  }
  else if (commandName === 'binfo') {
    if (!isAdmin) return interaction.reply({ content: "Only admins can use /binfo", ephemeral: true });
    try {
      const bans = await interaction.guild.bans.fetch();
      return interaction.reply({ content: `Total bans: ${bans.size}`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to fetch ban info.", ephemeral: true });
    }
  }
  else if (commandName === 'jinfo') {
    if (!isAdmin) return interaction.reply({ content: "Only admins can use /jinfo", ephemeral: true });
    const userId = interaction.options.getString('userid');
    return interaction.reply({ content: `Jail info for user ${userId}: [Coming soon...]`, ephemeral: true });
  }
  else if (commandName === 'toponline' || commandName === 'topmembers') {
    if (!isAdmin && !isOwner && !hasVerified) {
      return interaction.reply({ content: "No permission to see top stats.", ephemeral: true });
    }
    return interaction.reply({ content: `${commandName} is [Coming soon...]`, ephemeral: true });
  }
  // One-tap commands, etc. remain basically the same.
  // ...
  else if (commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle("Available Commands")
      .setDescription("Use these commands to configure and manage your bot.")
      .addFields(
        { name: "Profile Viewer", value: "`r` → View your profile (Avatar/Banner)", inline: false },
        { name: "Customization", value: "`/setprefix`, `/setwelcome`, `/showwelcome`", inline: false },
        { name: "One-Tap", value: "`/claim`, `/reject`, `/kick`, `/mute`, `/unmute`, `/transfer`, `/name`, `/status`", inline: false },
        { name: "Dashboard", value: "`/topvrf`, `/binfo`, `/jinfo`, `/toponline`, `/topmembers`", inline: false }
      );
    return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  }
});

// -----------------------------------
// Voice State Update: Verification Changes
//  - No notification if the joiner is a verificator alone
//  - Only 1 unverified user + 1 verificator
// -----------------------------------
const verificationSessions = new Map();
const onetapSessions = new Map();

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const config = await settingsCollection.findOne({ serverId: guild.id });
  if (!config) return;

  // If user joined the verification channel:
  if (newState.channelId === config.voiceVerificationChannelId) {
    try {
      // Check if user is unverified
      const member = newState.member;
      const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);
      if (!unverifiedRole || !member.roles.cache.has(unverifiedRole.id)) {
        // Means the user is not unverified => skip (no notification)
        console.log(`${member.displayName} joined verification but is NOT unverified => skip notification`);
        return;
      }
      // If user is unverified, create a new VC
      const tempVC = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2,
        parent: newState.channel.parentId,
        userLimit: 2,  // Only 2 slots: 1 unverified + 1 verificator
        permissionOverwrites: []
      });
      console.log(`Created verification VC for unverified user: ${member.displayName}`);
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });

      // Send pop-up
      const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
      if (alertChannel) {
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        // Title changed to big bold text "New Member Ajew 🙋"
        const alertEmbed = new EmbedBuilder()
          .setTitle("## New Member Ajew 🙋")  // Big bold text
          .setColor(0x00AE86);
        await alertChannel.send({ embeds: [alertEmbed], components: [row] });
      }
    } catch (err) {
      console.error("Error creating verification VC:", err);
    }
  }

  // If user joined the one-tap channel => etc. (unchanged)...

  // ...the rest of your logic for reassign, auto-delete, etc.
});

// -----------------------------------
// Client Login
// -----------------------------------
client.login(process.env.DISCORD_TOKEN);
ng a server, creates a temporary "bot-setup" channel with language selection buttons for interactive setup.
// • Assigns new members the unverified role and DMs them a welcome message (using a custom welcome if set).
// • Creates a permanent "bot-config" channel for later configuration (e.g. updating prefix or welcome message).
// • Implements voice state handling for verification (temporary VC creation with a pop-up alert) and a fixed one‑tap channel.
// • Provides slash commands for customization (/setprefix, /setwelcome, /showwelcome), one‑tap management, dashboard commands, and an "R" command for profile viewing.
// (Ensure your .env includes DISCORD_TOKEN, MONGODB_URI, CLIENT_ID, GUILD_ID, etc.)

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
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// ------------------------------
// MongoDB Connection
// ------------------------------
const { MongoClient } = require('mongodb');
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
// Create Discord Client with necessary intents
// ------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,      // For role assignment
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,    // For message commands
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ------------------------------
// Prevent Setup Duplication
// ------------------------------
const setupStarted = new Map(); // Prevents multiple "ready" triggers per guild

// ------------------------------
// GuildMemberAdd: Assign Unverified Role & DM Welcome Message
// ------------------------------
client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = await settingsCollection.findOne({ serverId: member.guild.id });
    const welcomeMsg = (config && config.customWelcome) ? config.customWelcome :
      "Merhba Bik Fi A7sen Server Fl Maghrib! Daba ayji 3ndk Verificator bash yverifik 😊";
    if (config && config.unverifiedRoleId) {
      const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRoleId);
      if (unverifiedRole) {
        await member.roles.add(unverifiedRole);
        console.log(`Assigned unverified role to ${member.user.tag}`);
      }
    }
    await member.send(welcomeMsg);
  } catch (err) {
    console.error("Error in GuildMemberAdd:", err);
  }
});

// ------------------------------
// Language Translations for Setup Prompts
// ------------------------------
const languagePrompts = {
  english: {
    verifiedRoleId: "🔹 **# Please provide the Verified Role ID** (role for verified boys).",
    unverifiedRoleId: "🔹 **# Now, provide the Unverified Role ID** (role for new/unverified members).",
    verifiedGirlRoleId: "🔹 **# Next, please provide the Verified Girl Role ID**.",
    verificatorRoleId: "🔹 **# Please provide the Verificator Role ID** (role for those who verify new users).",
    voiceVerificationChannelId: "🔹 **# Send the Voice Verification Channel ID** (where new users join for verification).",
    oneTapChannelId: "🔹 **# Now, send the One-Tap Channel ID** (for creating one-tap voice channels).",
    verificationAlertChannelId: "🔹 **# Send the Verification Alert Channel ID** (where verification alerts are posted).",
    jailRoleId: "🔹 **# Provide the Jail Role ID** (for jailed users). Type `none` if not applicable.",
    voiceJailChannelId: "🔹 **# Finally, send the Voice Jail Channel ID** (for jailed users). Type `none` if not applicable."
  },
  darija: {
    verifiedRoleId: "🔹 **# 3afak 3tini l'ID dyal Verified Role** (Role li kayt3ti l'users verified).",
    unverifiedRoleId: "🔹 **# Daba 3tini l'ID dyal Unverified Role** (role dyal new/unverified users).",
    verifiedGirlRoleId: "🔹 **# 3tini l'ID dyal Verified Girl Role**.",
    verificatorRoleId: "🔹 **# Wdaba 3tini l'ID dyal Verificator Role**.",
    voiceVerificationChannelId: "🔹 **# 3tini l'ID dyal Voice Verification Channel** (fin kaydkhlu l'users jdod).",
    oneTapChannelId: "🔹 **# 3tini l'ID dyal One-Tap Channel** (bash tkon private voice rooms).",
    verificationAlertChannelId: "🔹 **# 3tini l'ID dyal Verification Alert Channel**.",
    jailRoleId: "🔹 **# 3tini l'ID dyal Jail Role** (ila ma kaynach, ktb `none`).",
    voiceJailChannelId: "🔹 **# 3tini l'ID dyal Voice Jail Channel** (ila ma kaynach, ktb `none`)."
  },
  spanish: {
    verifiedRoleId: "🔹 **# Por favor, proporciona el ID del Rol Verificado** (rol para miembros verificados - chicos).",
    unverifiedRoleId: "🔹 **# Ahora, proporciona el ID del Rol No Verificado** (rol para nuevos miembros).",
    verifiedGirlRoleId: "🔹 **# A continuación, proporciona el ID del Rol de Verificadas**.",
    verificatorRoleId: "🔹 **# Por favor, proporciona el ID del Rol de Verificadores** (rol para quienes verifican nuevos usuarios).",
    voiceVerificationChannelId: "🔹 **# Envía el ID del Canal de Verificación de Voz** (donde los nuevos usuarios se unen para la verificación).",
    oneTapChannelId: "🔹 **# Ahora, envía el ID del Canal One-Tap** (para la creación de canales de voz privados).",
    verificationAlertChannelId: "🔹 **# Envía el ID del Canal de Alertas de Verificación**.",
    jailRoleId: "🔹 **# Proporciona el ID del Rol de Cárcel** (para usuarios en cárcel). Si no aplica, escribe `none`.",
    voiceJailChannelId: "🔹 **# Finalmente, envía el ID del Canal de Voz para Cárcel**. Si no aplica, escribe `none`."
  },
  russian: {
    verifiedRoleId: "🔹 **# Пожалуйста, предоставьте ID роли для Verified Role** (роль для проверенных участников - мальчики).",
    unverifiedRoleId: "🔹 **# Теперь предоставьте ID роли для Unverified Role** (роль для новых участников).",
    verifiedGirlRoleId: "🔹 **# Далее, предоставьте ID роли для Verified Girl Role**.",
    verificatorRoleId: "🔹 **# Пожалуйста, предоставьте ID роли для Verificator Role** (роль для тех, кто проверяет новых пользователей).",
    voiceVerificationChannelId: "🔹 **# Отправьте ID голосового канала для Voice Verification Channel** (где новые пользователи присоединяются для проверки).",
    oneTapChannelId: "🔹 **# Теперь отправьте ID канала One-Tap Channel** (для создания приватных голосовых каналов).",
    verificationAlertChannelId: "🔹 **# Отправьте ID текстового канала для Verification Alert Channel**.",
    jailRoleId: "🔹 **# Предоставьте ID роли для Jail Role** (если не применимо, введите `none`).",
    voiceJailChannelId: "🔹 **# Наконец, отправьте ID голосового канала для Voice Jail Channel** (если не применимо, введите `none`)."
  },
  french: {
    verifiedRoleId: "🔹 **# Veuillez fournir l'ID du rôle Verified Role** (le rôle pour les membres vérifiés - garçons).",
    unverifiedRoleId: "🔹 **# Maintenant, fournissez l'ID du rôle Unverified Role** (le rôle pour les nouveaux membres).",
    verifiedGirlRoleId: "🔹 **# Ensuite, veuillez fournir l'ID du rôle Verified Girl Role**.",
    verificatorRoleId: "🔹 **# Veuillez fournir l'ID du rôle Verificator Role** (le rôle pour ceux qui vérifient les nouveaux utilisateurs).",
    voiceVerificationChannelId: "🔹 **# Envoyez l'ID du canal vocal pour Voice Verification Channel** (où les nouveaux utilisateurs se joignent pour être vérifiés).",
    oneTapChannelId: "🔹 **# Maintenant, envoyez l'ID du canal One-Tap Channel** (pour la création de canaux vocaux privés).",
    verificationAlertChannelId: "🔹 **# Envoyez l'ID du canal textuel pour Verification Alert Channel**.",
    jailRoleId: "🔹 **# Fournissez l'ID du rôle pour Jail Role** (si non applicable, tapez `none`).",
    voiceJailChannelId: "🔹 **# Enfin, envoyez l'ID du canal vocal pour Voice Jail Channel** (si non applicable, tapez `none`)."
  }
};

// ------------------------------
// Language Extras: Additional Setup Messages
// ------------------------------
const languageExtras = {
  english: {
    readyPrompt: "Great! Now type `ready` in this channel to begin setup. (90 seconds per prompt)",
    setupStart: "Let's begin setup. I will ask for several IDs—please copy and paste each one when prompted.",
    setupComplete: "Thank you for your patience! The bot is now fully set up. 🎉",
    intro: "Hello! I am Franco's Armada 🔱 – your versatile server management bot. I help with verification, one-tap voice channels, moderation, and more. Made by Franco 🔱. Let's set sail together! ⚓"
  },
  darija: {
    readyPrompt: "Mzyan! Daba kteb `ready` f had channel bach nbda setup. (3andak 90 seconds f kol prompt)",
    setupStart: "Yallah, nbda setup. Ghadi nsawlouk 3la b3d IDs. 3afak copier w coller kol wa7ed mnin ytb3at lik talabat.",
    setupComplete: "Choukrane 3la sbr dyalk! L'bot dyalk daba msetab kaml. 🎉",
    intro: "Salam! Ana Franco's Armada 🔱 – l'bot dyalk li kayt3awn m3ak f server b style. Kay3awn f verification, one-tap, modération w ktar. Made by Franco 🔱. Yallah, nbdaw l'mission! ⚓"
  },
  spanish: {
    readyPrompt: "¡Genial! Ahora escribe `ready` en este canal para comenzar la configuración. (90 segundos por mensaje)",
    setupStart: "Muy bien, vamos a comenzar la configuración. Te pediré varios IDs; por favor, copia y pega cada uno cuando se te pida.",
    setupComplete: "¡Gracias por tu paciencia! Tu bot está completamente configurado. 🎉",
    intro: "¡Hola! Soy Franco's Armada 🔱 – tu bot versátil para gestionar el servidor. Ayudo con verificación, canales de voz one-tap, moderación y más. Made by Franco 🔱. ¡Empecemos! ⚓"
  },
  russian: {
    readyPrompt: "Отлично! Теперь введите `ready` в этом канале, чтобы начать настройку. (90 секунд на каждый ответ)",
    setupStart: "Давайте начнем настройку. Я задам несколько вопросов с ID; пожалуйста, скопируйте и вставьте каждый, когда будет предложено.",
    setupComplete: "Спасибо за ваше терпение! Ваш бот полностью настроен. 🎉",
    intro: "Привет! Я Franco's Armada 🔱 – универсальный бот для управления сервером. Я помогаю с верификацией, голосовыми каналами one-tap, модерацией и т.д. Made by Franco 🔱. Давайте начнем! ⚓"
  },
  french: {
    readyPrompt: "Super ! Tapez `ready` dans ce canal pour commencer la configuration. (90 secondes par réponse)",
    setupStart: "Commençons la configuration. Je vais vous demander plusieurs IDs ; copiez-collez chacun d'eux quand demandé.",
    setupComplete: "Merci pour votre patience ! Votre bot est entièrement configuré. 🎉",
    intro: "Bonjour ! Je suis Franco's Armada 🔱 – votre bot polyvalent pour gérer votre serveur. J'aide avec la vérification, les canaux vocaux one-tap, la modération, etc. Made by Franco 🔱. Allons-y ! ⚓"
  }
};

// ------------------------------
// Helper Function: Await a Single Message (90s Timeout)
// ------------------------------
async function awaitResponse(channel, userId, prompt, lang) {
  await channel.send(prompt + "\n*(90 seconds to respond, or setup times out.)*");
  const filter = m => m.author.id === userId;
  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 90000, errors: ['time'] });
    console.log(`Collected message: ${collected.first().content}`);
    return collected.first().content.trim();
  } catch (err) {
    await channel.send(
      (lang === "english" && "Setup timed out 🤷‍♂️. Type `ready` to restart setup.") ||
      (lang === "darija" && "Setup t9llat 🤷‍♂️. Kteb `ready` bach tbda men jdod.") ||
      (lang === "spanish" && "El tiempo expiró 🤷‍♂️. Escribe `ready` para reiniciar.") ||
      (lang === "russian" && "Время истекло 🤷‍♂️. Введите `ready` для перезапуска.") ||
      (lang === "french" && "Le délai est écoulé 🤷‍♂️. Tapez `ready` pour recommencer.")
    );
    throw new Error("Setup timed out");
  }
}

// ------------------------------
// Interactive Setup Process Function
// ------------------------------
async function runSetup(ownerId, setupChannel, guildId, lang) {
  const config = { serverId: guildId };
  const prompts = languagePrompts[lang];
  const promptEntries = Object.entries(prompts);
  await setupChannel.send(languageExtras[lang]?.setupStart);
  for (const [key, prompt] of promptEntries) {
    const response = await awaitResponse(setupChannel, ownerId, prompt, lang);
    config[key] = (response.toLowerCase() === "none") ? null : response;
  }
  try {
    await settingsCollection.updateOne({ serverId: guildId }, { $set: config }, { upsert: true });
    await setupChannel.send(languageExtras[lang]?.setupComplete);
  } catch (err) {
    console.error("Error saving configuration:", err);
    await setupChannel.send(
      (lang === "english" && "Error saving configuration. Try again or contact support.") ||
      (lang === "darija" && "Chi mouchkil f saving configuration. 3awd 7awl awla t3ayet l'support.") ||
      (lang === "spanish" && "Error al guardar la configuración. Intenta de nuevo o contacta al soporte.") ||
      (lang === "russian" && "Ошибка при сохранении настроек. Попробуйте снова или свяжитесь с поддержкой.") ||
      (lang === "french" && "Erreur lors de l'enregistrement. Réessayez ou contactez le support.")
    );
  }
}

// ------------------------------
// Slash Commands Setup (including /setprefix, /setwelcome, /showwelcome, dashboard, one-tap, etc.)
// ------------------------------
client.commands = new Collection();
const slashCommands = [
  new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set a custom prefix for this server')
    .addStringOption(option => option.setName('prefix').setDescription('New prefix').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Set a custom welcome message for new members')
    .addStringOption(option => option.setName('message').setDescription('The welcome message').setRequired(true)),

  new SlashCommandBuilder()
    .setName('showwelcome')
    .setDescription('Show the current custom welcome message'),

  // Dashboard Commands:
  new SlashCommandBuilder()
    .setName('topvrf')
    .setDescription('Show top verificators')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator), // Additional check in code.
  new SlashCommandBuilder()
    .setName('binfo')
    .setDescription('Show total bans')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('jinfo')
    .setDescription('Show jail info for a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('toponline')
    .setDescription('Show most online users'),
  new SlashCommandBuilder()
    .setName('topmembers')
    .setDescription('Show top members by activity'),

  // One-tap commands and help:
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder().setName('reject').setDescription('Reject a user from joining your tap')
    .addUserOption(option => option.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user from your tap')
    .addUserOption(option => option.setName('target').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user in your voice channel')
    .addUserOption(option => option.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user in your voice channel')
    .addUserOption(option => option.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('transfer').setDescription('Transfer ownership of your tap')
    .addUserOption(option => option.setName('target').setDescription('User to transfer ownership to').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your tap')
    .addStringOption(option => option.setName('text').setDescription('New channel name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your tap')
    .addStringOption(option => option.setName('text').setDescription('Status text').setRequired(true)),

  new SlashCommandBuilder().setName('help').setDescription('Show available commands')
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Refreshing slash commands.');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('Slash commands reloaded.');
  } catch (error) {
    console.error(error);
  }
})();

// ------------------------------
// Interaction Handler for Language Buttons
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId.startsWith("lang_")) {
    const language = interaction.customId.split('_')[1];
    try {
      await settingsCollection.updateOne(
         { serverId: interaction.guild.id },
         { $set: { language: language } },
         { upsert: true }
      );
      await interaction.reply({ content: `Language set to ${language}!`, ephemeral: true });
      await interaction.channel.send("Now type `ready` to begin the setup process.");
    } catch (error) {
      console.error("Error handling language selection:", error);
      return interaction.reply({ content: "Error setting language.", ephemeral: true });
    }
    return;
  }
});

// ------------------------------
// Interaction Handler for Slash Commands with Permission Checks
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  // Utility checks:
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const isOwner = interaction.member.id === interaction.guild.ownerId;
  const hasVerified = config && (interaction.member.roles.cache.has(config.verifiedRoleId) || interaction.member.roles.cache.has(config.verifiedGirlRoleId));
  const hasVerificator = config && interaction.member.roles.cache.has(config.verificatorRoleId);

  if (commandName === 'setprefix') {
    const newPrefix = interaction.options.getString('prefix');
    try {
      await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { prefix: newPrefix } }, { upsert: true });
      return interaction.reply({ content: `Prefix updated to \`${newPrefix}\`!`, ephemeral: true });
    } catch (err) {
      console.error("Error setting prefix:", err);
      return interaction.reply({ content: "Error updating prefix.", ephemeral: true });
    }
  } else if (commandName === 'setwelcome') {
    if (!isAdmin && !isOwner) {
      return interaction.reply({ content: "Only administrators or the owner can set the welcome message.", ephemeral: true });
    }
    const newMessage = interaction.options.getString('message');
    try {
      await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { customWelcome: newMessage } }, { upsert: true });
      return interaction.reply({ content: "Custom welcome message updated!", ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to update welcome message.", ephemeral: true });
    }
  } else if (commandName === 'showwelcome') {
    try {
      const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
      const welcomeMessage = config && config.customWelcome ? config.customWelcome : "No custom welcome message set.";
      return interaction.reply({ content: `Current welcome message: ${welcomeMessage}`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to fetch welcome message.", ephemeral: true });
    }
  } else if (commandName === 'topvrf') {
    if (!isAdmin && !isOwner && !hasVerificator) {
      return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
    }
    return interaction.reply({ content: "Top verificators: [Feature coming soon...]", ephemeral: true });
  } else if (commandName === 'binfo' || commandName === 'jinfo') {
    if (!isAdmin) {
      return interaction.reply({ content: "Only administrators can use this command.", ephemeral: true });
    }
    if (commandName === 'binfo') {
      try {
        const bans = await interaction.guild.bans.fetch();
        return interaction.reply({ content: `Total bans: ${bans.size}`, ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Failed to fetch ban info.", ephemeral: true });
      }
    } else {
      const userId = interaction.options.getString('userid');
      return interaction.reply({ content: `Jail info for user ${userId}: [Feature coming soon...]`, ephemeral: true });
    }
  } else if (commandName === 'toponline' || commandName === 'topmembers') {
    if (!isAdmin && !isOwner && !hasVerified) {
      return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
    }
    if (commandName === 'toponline') {
      return interaction.reply({ content: "Top online users: [Feature coming soon...]", ephemeral: true });
    } else {
      return interaction.reply({ content: "Top members: [Feature coming soon...]", ephemeral: true });
    }
  }
  // One-tap commands:
  else if (commandName === 'claim') {
    const member = interaction.member;
    const vc = member.voice.channel;
    if (!vc || !onetapSessions.has(vc.id)) {
      return interaction.reply({ content: "You are not in a one-tap voice channel.", ephemeral: true });
    }
    const session = onetapSessions.get(vc.id);
    if (session.owner === member.id) {
      return interaction.reply({ content: "You are already the owner of this channel.", ephemeral: true });
    }
    session.owner = member.id;
    onetapSessions.set(vc.id, session);
    return interaction.reply({ content: "You have claimed ownership of this channel.", ephemeral: true });
  }
  else if (commandName === 'reject') {
    const target = interaction.options.getUser('target');
    const member = interaction.member;
    const vc = member.voice.channel;
    if (!vc || !onetapSessions.has(vc.id)) {
      return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
    }
    const session = onetapSessions.get(vc.id);
    if (session.owner !== member.id) {
      return interaction.reply({ content: "Only the channel owner can reject users.", ephemeral: true });
    }
    session.rejectedUsers = session.rejectedUsers || [];
    session.rejectedUsers.push(target.id);
    onetapSessions.set(vc.id, session);
    return interaction.reply({ content: `User ${target.username} has been rejected from this channel.`, ephemeral: true });
  }
  else if (commandName === 'kick') {
    const target = interaction.options.getUser('target');
    const member = interaction.member;
    const vc = member.voice.channel;
    if (!vc || !onetapSessions.has(vc.id)) {
      return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
    }
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (targetMember && targetMember.voice.channelId === vc.id) {
      try {
        await targetMember.voice.disconnect("Kicked from one-tap channel.");
        return interaction.reply({ content: `User ${target.username} has been kicked from the channel.`, ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Failed to kick the user.", ephemeral: true });
      }
    } else {
      return interaction.reply({ content: "User not found in your channel.", ephemeral: true });
    }
  }
  else if (commandName === 'mute') {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
    try {
      await targetMember.voice.setMute(true);
      return interaction.reply({ content: `User ${target.username} has been muted.`, ephemeral: true });
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: "Failed to mute the user.", ephemeral: true });
    }
  }
  else if (commandName === 'unmute') {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
    try {
      await targetMember.voice.setMute(false);
      return interaction.reply({ content: `User ${target.username} has been unmuted.`, ephemeral: true });
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: "Failed to unmute the user.", ephemeral: true });
    }
  }
  else if (commandName === 'transfer') {
    const target = interaction.options.getUser('target');
    const member = interaction.member;
    const vc = member.voice.channel;
    if (!vc || !onetapSessions.has(vc.id)) {
      return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
    }
    const session = onetapSessions.get(vc.id);
    if (session.owner !== member.id) {
      return interaction.reply({ content: "Only the current owner can transfer ownership.", ephemeral: true });
    }
    session.owner = target.id;
    onetapSessions.set(vc.id, session);
    return interaction.reply({ content: `Ownership transferred to ${target.username}.`, ephemeral: true });
  }
  else if (commandName === 'name') {
    const newName = interaction.options.getString('text');
    const member = interaction.member;
    const vc = member.voice.channel;
    if (!vc || !onetapSessions.has(vc.id)) {
      return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
    }
    if (onetapSessions.get(vc.id).owner !== member.id) {
      return interaction.reply({ content: "Only the channel owner can rename the channel.", ephemeral: true });
    }
    try {
      await vc.setName(newName);
      return interaction.reply({ content: `Channel renamed to ${newName}.`, ephemeral: true });
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: "Failed to rename the channel.", ephemeral: true });
    }
  }
  else if (commandName === 'status') {
    const statusText = interaction.options.getString('text');
    const member = interaction.member;
    const vc = member.voice.channel;
    if (!vc || !onetapSessions.has(vc.id)) {
      return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
    }
    if (onetapSessions.get(vc.id).owner !== member.id) {
      return interaction.reply({ content: "Only the channel owner can set the status.", ephemeral: true });
    }
    try {
      let session = onetapSessions.get(vc.id);
      session.status = statusText;
      onetapSessions.set(vc.id, session);
      return interaction.reply({ content: `Channel status set to: ${statusText}`, ephemeral: true });
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: "Failed to set status.", ephemeral: true });
    }
  }
  else if (commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle("Available Commands")
      .setDescription("Use these commands to configure and manage your bot.")
      .addFields(
        { name: "Profile Viewer", value: "`r` → View your profile picture (with Avatar/Banner buttons)", inline: false },
        { name: "Customization", value: "`/setprefix`, `/setwelcome`, `/showwelcome`", inline: false },
        { name: "One-Tap Commands", value: "`/claim`, `/reject`, `/kick`, `/mute`, `/unmute`, `/transfer`, `/name`, `/status`", inline: false },
        { name: "Dashboard Commands", value: "`/topvrf` (admins/owner/verificators), `/binfo` & `/jinfo` (admins), `/toponline` & `/topmembers` (verified/owner/admin)", inline: false }
      );
    return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  }
});

// ------------------------------
// Ready Command Handler for Interactive Setup (in "bot-setup" channel)
// ------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  // For debugging, log channel name and author ID.
  console.log(`Message received in channel: ${message.channel.name} from ${message.author.tag}`);
  // Ensure we're in the setup channel. (You can remove or adjust this check if needed.)
  if (message.channel.name !== 'bot-setup') return;
  // Only allow the guild owner to trigger setup.
  if (message.author.id !== message.guild.ownerId) return;
  
  if (message.content.toLowerCase() === 'ready') {
    console.log(`Ready command received from owner ${message.author.tag} in guild ${message.guild.name}`);
    if (setupStarted.get(message.guild.id)) {
      console.log("Setup already started for this guild.");
      return;
    }
    setupStarted.set(message.guild.id, true);
    
    // Fetch language from DB; fallback to English if not set.
    const serverConfig = await settingsCollection.findOne({ serverId: message.guild.id });
    const lang = (serverConfig && serverConfig.language) || "english";
    await message.channel.send(languageExtras[lang]?.setupStart);
    try {
      await runSetup(message.author.id, message.channel, message.guild.id, lang);
      await message.channel.send(languageExtras[lang]?.setupComplete);
      // Delete the setup channel after a delay.
      setTimeout(() => {
        message.channel.delete().catch(console.error);
      }, 5000);
    } catch (err) {
      console.error("Setup process error:", err);
    }
  }
});

// ------------------------------
// Create Permanent "bot-config" Channel on Guild Join
// ------------------------------
client.on(Events.GuildCreate, async guild => {
  // Create temporary setup channel.
  let setupChannel;
  try {
    setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0,
      topic: 'Use this channel to configure the bot. It will be deleted after setup is complete.',
      permissionOverwrites: [
        { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    setupChannel.send(`<@${guild.ownerId}>, welcome! Let's set up your bot configuration.`);
  } catch (error) {
    console.error("Failed to create setup channel:", error);
    return;
  }
  // Create permanent "bot-config" channel.
  try {
    const owner = await guild.fetchOwner();
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Bot configuration channel. Use slash commands like /setprefix and /setwelcome here.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    console.log("Created bot-config channel for", guild.name);
  } catch (error) {
    console.error("Failed to create bot-config channel:", error);
  }
  // Send welcome embed in the setup channel.
  const englishButton = new ButtonBuilder().setCustomId('lang_english').setLabel('English').setStyle(ButtonStyle.Primary);
  const darijaButton = new ButtonBuilder().setCustomId('lang_darija').setLabel('Darija').setStyle(ButtonStyle.Primary);
  const spanishButton = new ButtonBuilder().setCustomId('lang_spanish').setLabel('Spanish').setStyle(ButtonStyle.Primary);
  const russianButton = new ButtonBuilder().setCustomId('lang_russian').setLabel('Russian').setStyle(ButtonStyle.Primary);
  const frenchButton = new ButtonBuilder().setCustomId('lang_french').setLabel('French').setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(englishButton, darijaButton, spanishButton, russianButton, frenchButton);
  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle("Welcome to Franco's Armada! 🔱🚢")
    .setDescription(
      languageExtras.english.intro + "\n\n" +
      "Before we set sail, please choose your language by clicking one of the buttons below.\n" +
      "Then, I'll guide you through a step-by-step configuration to set up the following IDs:\n" +
      "• Verified Role ID\n" +
      "• Unverified Role ID\n" +
      "• Verified Girl Role ID\n" +
      "• Verificator Role ID\n" +
      "• Voice Verification Channel ID\n" +
      "• One-Tap Channel ID\n" +
      "• Verification Alert Channel ID\n" +
      "• Jail Role ID\n" +
      "• Voice Jail Channel ID\n\n" +
      "Once setup is complete, this channel will be automatically deleted.\n" +
      "Made by Franco 🔱 • Type `/help` for a list of commands. Let's set sail together! ⚓"
    );
  setupChannel.send({ embeds: [embed], components: [row] });
});

// ------------------------------
// Voice State Update Handler (Using DB config)
// ------------------------------
const verificationSessions = new Map(); // { vcId: { userId, assignedVerificator, rejected } }
const onetapSessions = new Map();       // { vcId: { owner, rejectedUsers: [], status } }

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const config = await settingsCollection.findOne({ serverId: guild.id });
  
  // Verification System:
  if (config && newState.channelId === config.voiceVerificationChannelId) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: [] // Customize if needed.
      });
      console.log(`Created verification VC: ${tempVC.name} for ${member.displayName}`);
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
      if (alertChannel) {
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("🚀 Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        const alertEmbed = new EmbedBuilder()
          .setTitle("New Member Awaiting Verification!")
          .setDescription("A new member has joined the verification channel. Click 'Join Verification' to verify them!")
          .setColor(0x00AE86);
        const alertMsg = await alertChannel.send({ embeds: [alertEmbed], components: [row] });
        setTimeout(() => { alertMsg.delete().catch(console.error); }, 9000);
      } else {
        console.error("Verification alert channel not found in config for", guild.name);
      }
    } catch (err) {
      console.error("Error creating verification VC:", err);
    }
  }
  
  // One-Tap System:
  if (config && newState.channelId === config.oneTapChannelId) {
    try {
      const member = newState.member;
      console.log(`${member.displayName} joined the fixed one-tap channel.`);
      // Optionally, move them to a fixed channel if desired.
    } catch (err) {
      console.error("Error handling one-tap join:", err);
    }
  }
  
  // One-Tap Owner Reassignment:
  if (oldState.channel && onetapSessions.has(oldState.channel.id)) {
    let tapSession = onetapSessions.get(oldState.channel.id);
    if (oldState.member.id === tapSession.owner) {
      const remaining = oldState.channel.members;
      if (remaining.size > 0) {
        const newOwner = remaining.first();
        tapSession.owner = newOwner.id;
        onetapSessions.set(oldState.channel.id, tapSession);
        await oldState.channel.permissionOverwrites.edit(newOwner.id, { Connect: true });
      }
    }
  }
  
  // Auto-delete empty temporary voice channels (for verification VCs):
  if (oldState.channel && oldState.channel.members.size === 0) {
    const channelId = oldState.channel.id;
    if (verificationSessions.has(channelId) || onetapSessions.has(channelId)) {
      oldState.channel.delete().catch(() => {});
      verificationSessions.delete(channelId);
      onetapSessions.delete(channelId);
    }
  }
  
  // Verification VC: If the verificator leaves, move the verified user.
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    if (oldState.member.id === session.assignedVerificator) {
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        const activeVC = guild.channels.cache.filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0).first();
        if (activeVC) {
          await verifiedMember.voice.setChannel(activeVC);
        }
      }
    }
  }
});

// ------------------------------
// Verification Command Handler (+boy / +girl)
// ------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  if (message.content.startsWith('+boy') || message.content.startsWith('+girl')) {
    const config = await settingsCollection.findOne({ serverId: message.guild.id });
    if (!config) return message.reply("Bot is not configured for this server.");
    
    let sessionId;
    for (const [vcId, session] of verificationSessions.entries()) {
      if (session.assignedVerificator === message.author.id) {
        sessionId = vcId;
        break;
      }
    }
    if (!sessionId) {
      return message.reply("No active verification session found for you.");
    }
    const session = verificationSessions.get(sessionId);
    const memberToVerify = message.guild.members.cache.get(session.userId);
    if (!memberToVerify) return message.reply("User not found.");
    try {
      await memberToVerify.roles.remove(config.unverifiedRoleId);
      let verifiedRoleName;
      if (message.content.startsWith('+boy')) {
        await memberToVerify.roles.add(config.verifiedRoleId);
        verifiedRoleName = "Verified Boy";
      } else {
        await memberToVerify.roles.add(config.verifiedGirlRoleId);
        verifiedRoleName = "Verified Girl";
      }
      const verificationWelcome = {
        english: "No Toxic Guys Here ❌️☢️. We're here to chill and enjoy our time. Welcome again! 🌸❤️",
        darija: "Ma kaynach toxic shabab ❌️☢️. Hna bash nchilliw wnstemt3o mzyan waqtna. Marhba bik mn jdid! 🌸❤️",
        spanish: "No toxic, chicos ❌️☢️. Estamos aquí para relajarnos y disfrutar. ¡Bienvenidos de nuevo! 🌸❤️",
        russian: "Никакого токсика, ребята ❌️☢️. Мы здесь, чтобы расслабиться и насладиться временем. Снова добро пожаловать! 🌸❤️",
        french: "Pas de toxicité, les gars ❌️☢️. Nous sommes ici pour nous détendre et profiter du temps. Bienvenue à nouveau! 🌸❤️"
      };
      const lang = config.language || "english";
      const welcomeDM = verificationWelcome[lang] || verificationWelcome.english;
      await memberToVerify.send(welcomeDM);
      message.channel.send(`<@${memberToVerify.id}> was verified as ${verifiedRoleName} successfully!`);
      setTimeout(async () => {
        const verifVC = message.guild.channels.cache.get(sessionId);
        if (verifVC) {
          if (verifVC.members.size === 0 || (verifVC.members.size === 1 && verifVC.members.has(message.author.id))) {
            await verifVC.delete().catch(() => {});
            verificationSessions.delete(sessionId);
          }
        }
      }, 30000);
      return message.reply("Verification complete.");
    } catch (err) {
      console.error("Verification error:", err);
      return message.reply("Verification failed.");
    }
  }
});

// ------------------------------
// "R" Command for Profile Viewer (Fixed)
// ------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  if ((content === 'r' || content.startsWith('r ')) && content !== 'ready') {
    let targetUser = message.mentions.users.first() || message.author;
    if (typeof targetUser === "string") targetUser = message.author;
    try {
      targetUser = await targetUser.fetch();
    } catch (err) {
      console.error("Error fetching user data:", err);
      return message.reply("Error fetching user data. Please mention a valid user or type just 'r'.");
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
// Interaction Handler for Profile Viewer Buttons
// ------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("lang_")) return; // Skip language buttons here.
  const [action, userId] = interaction.customId.split('_');
  if (!userId) return;
  let targetUser;
  try {
    targetUser = await client.users.fetch(userId, { force: true });
  } catch (err) {
    console.error("Error fetching user for profile:", err);
    return interaction.reply({ content: "Error fetching user data.", ephemeral: true });
  }
  if (action === 'avatar') {
    const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`${targetUser.username}'s Avatar`)
      .setImage(avatarURL)
      .setFooter({ text: `Requested by: ${interaction.user.username}` });
    return interaction.update({ embeds: [embed] });
  } else if (action === 'banner') {
    const bannerURL = targetUser.bannerURL({ dynamic: true, size: 1024 });
    if (!bannerURL) {
      return interaction.reply({ content: "This user does not have a banner set.", ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`${targetUser.username}'s Banner`)
      .setImage(bannerURL)
      .setFooter({ text: `Requested by: ${interaction.user.username}` });
    return interaction.update({ embeds: [embed] });
  }
});

// ------------------------------
// Ready Command Handler for Interactive Setup (in "bot-setup" channel)
// ------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  console.log(`Message received in channel: ${message.channel.name} from ${message.author.tag}`);
  // For now, do not restrict to channel name (remove this check if needed for debugging):
  // if (message.channel.name !== 'bot-setup') return;
  if (message.author.id !== message.guild.ownerId) return; // Only owner can trigger setup.
  
  if (message.content.toLowerCase() === 'ready') {
    console.log(`Ready command received from owner ${message.author.tag} in guild ${message.guild.name}`);
    if (setupStarted.get(message.guild.id)) {
      console.log("Setup already started for this guild.");
      return;
    }
    setupStarted.set(message.guild.id, true);
    
    const serverConfig = await settingsCollection.findOne({ serverId: message.guild.id });
    const lang = (serverConfig && serverConfig.language) || "english";
    await message.channel.send(languageExtras[lang]?.setupStart);
    try {
      await runSetup(message.author.id, message.channel, message.guild.id, lang);
      await message.channel.send(languageExtras[lang]?.setupComplete);
      setTimeout(() => {
        message.channel.delete().catch(console.error);
      }, 5000);
    } catch (err) {
      console.error("Setup process error:", err);
    }
  }
});

// ------------------------------
// Create Permanent "bot-config" Channel on Guild Join
// ------------------------------
client.on(Events.GuildCreate, async guild => {
  let setupChannel;
  try {
    setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0,
      topic: 'Use this channel to configure the bot. It will be deleted after setup is complete.',
      permissionOverwrites: [
        { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    setupChannel.send(`<@${guild.ownerId}>, welcome! Let's set up your bot configuration.`);
  } catch (error) {
    console.error("Failed to create setup channel:", error);
    return;
  }
  try {
    const owner = await guild.fetchOwner();
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Bot configuration channel. Use slash commands like /setprefix and /setwelcome here.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    console.log("Created bot-config channel for", guild.name);
  } catch (error) {
    console.error("Failed to create bot-config channel:", error);
  }
  const englishButton = new ButtonBuilder().setCustomId('lang_english').setLabel('English').setStyle(ButtonStyle.Primary);
  const darijaButton = new ButtonBuilder().setCustomId('lang_darija').setLabel('Darija').setStyle(ButtonStyle.Primary);
  const spanishButton = new ButtonBuilder().setCustomId('lang_spanish').setLabel('Spanish').setStyle(ButtonStyle.Primary);
  const russianButton = new ButtonBuilder().setCustomId('lang_russian').setLabel('Russian').setStyle(ButtonStyle.Primary);
  const frenchButton = new ButtonBuilder().setCustomId('lang_french').setLabel('French').setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(englishButton, darijaButton, spanishButton, russianButton, frenchButton);
  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle("Welcome to Franco's Armada! 🔱🚢")
    .setDescription(
      languageExtras.english.intro + "\n\n" +
      "Before we set sail, please choose your language by clicking one of the buttons below.\n" +
      "Then, I'll guide you through a step-by-step configuration to set up the following IDs:\n" +
      "• Verified Role ID\n" +
      "• Unverified Role ID\n" +
      "• Verified Girl Role ID\n" +
      "• Verificator Role ID\n" +
      "• Voice Verification Channel ID\n" +
      "• One-Tap Channel ID\n" +
      "• Verification Alert Channel ID\n" +
      "• Jail Role ID\n" +
      "• Voice Jail Channel ID\n\n" +
      "Once setup is complete, this channel will be automatically deleted.\n" +
      "Made by Franco (YOUR_USER_ID_HERE) • Type `/help` for a list of commands. Let's set sail together! ⚓"
    );
  setupChannel.send({ embeds: [embed], components: [row] });
});

// ------------------------------
// "R" Command and Interaction Handler for Profile Viewer Buttons
// ------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  if ((content === 'r' || content.startsWith('r ')) && content !== 'ready') {
    let targetUser = message.mentions.users.first() || message.author;
    if (typeof targetUser === "string") targetUser = message.author;
    try {
      targetUser = await targetUser.fetch();
    } catch (err) {
      console.error("Error fetching user data:", err);
      return message.reply("Error fetching user data. Please mention a valid user or type just 'r'.");
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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("lang_")) return;
  const [action, userId] = interaction.customId.split('_');
  if (!userId) return;
  let targetUser;
  try {
    targetUser = await client.users.fetch(userId, { force: true });
  } catch (err) {
    console.error("Error fetching user for profile:", err);
    return interaction.reply({ content: "Error fetching user data.", ephemeral: true });
  }
  if (action === 'avatar') {
    const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`${targetUser.username}'s Avatar`)
      .setImage(avatarURL)
      .setFooter({ text: `Requested by: ${interaction.user.username}` });
    return interaction.update({ embeds: [embed] });
  } else if (action === 'banner') {
    const bannerURL = targetUser.bannerURL({ dynamic: true, size: 1024 });
    if (!bannerURL) {
      return interaction.reply({ content: "This user does not have a banner set.", ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`${targetUser.username}'s Banner`)
      .setImage(bannerURL)
      .setFooter({ text: `Requested by: ${interaction.user.username}` });
    return interaction.update({ embeds: [embed] });
  }
});

// ------------------------------
// Client Login
// ------------------------------
client.login(process.env.DISCORD_TOKEN);
