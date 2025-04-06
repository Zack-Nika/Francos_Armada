// index.js
// Franco's Armada Bot – Final Complete Code (Updated with verificationSessions & onetapSessions)
// FEATURES:
// • Connects to MongoDB to store per‑server settings (language, prefix, role/channel IDs, custom welcome message).
// • On guild join, creates a temporary "bot‑setup" channel and a permanent "bot‑config" channel visible only to the owner.
// • New members are assigned the unverified role and sent a welcome DM that tags them.
// • Interactive multi‑language setup (English, Darija, Spanish, Russian, French) is triggered by the owner typing “ready” in the bot‑setup channel.
// • Verification Process:
//     – When an unverified user joins the permanent verification channel (config.voiceVerificationChannelId),
//       the bot creates an ephemeral VC named "Verify – [displayName]" (userLimit: 2) and moves them there.
//     – It then sends a plain‑text notification (“# New Member Ajew 🙋‍♂️”) plus a "Join Verification" button in the alert channel.
//     – Verificators (who type “+boy” or “+girl” without mentioning the user) verify the user by removing the unverified role and adding the corresponding verified role.
//     – When the verificator leaves, the bot moves the verified user to the nearest open VC.
// • One‑Tap Process:
//     – When a verified user joins the designated one‑tap channel (config.oneTapChannelId), the bot creates an ephemeral VC named "[displayName]'s Room".
//     – This VC is created with a permission overwrite that denies VIEW_CHANNEL and CONNECT for the unverified role so that unverified users cannot see it.
//     – The room is open by default and auto‑deletes when empty.
// • Global slash commands (e.g. /setprefix, /setwelcome, /help, plus one‑tap commands such as /claim, /mute, /unmute, /lock, /unlock, /limit, /reject, /perm, /hide, /unhide, /transfer, /name, /status) and the "R" message command for profile viewing are provided.
// • The "bot‑setup" and "bot‑config" channels are created so that only the owner can see them.
// (Ensure your .env includes DISCORD_TOKEN, MONGODB_URI, CLIENT_ID, etc.)

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
// Create Discord Client (only once)
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
// Global Variables for Setup & Ephemeral VCs
// ------------------------------
const setupStarted = new Map();
const verificationSessions = new Map(); // For ephemeral verification VCs
const onetapSessions = new Map();       // For ephemeral one-tap VCs

// ------------------------------
// Multi-Language Data
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
    voiceJailChannelId: "🔹 **# Provide the Voice Jail Channel ID** (or type `none`)"
  },
  darija: {
    verifiedRoleId: "🔹 **# 3afak 3tini l'ID dyal Verified Boy Role**",
    unverifiedRoleId: "🔹 **# 3afak 3tini l'ID dyal Unverified Role**",
    verifiedGirlRoleId: "🔹 **# 3afak 3tini l'ID dyal Verified Girl Role**",
    verificatorRoleId: "🔹 **# 3tini l'ID dyal Verificator Role**",
    voiceVerificationChannelId: "🔹 **# 3tini l'ID dyal Voice Verification Channel** (permanent)",
    oneTapChannelId: "🔹 **# 3tini l'ID dyal One-Tap Channel**",
    verificationAlertChannelId: "🔹 **# 3tini l'ID dyal Verification Alert Channel**",
    jailRoleId: "🔹 **# 3tini l'ID dyal Jail Role** (aw `none`)",
    voiceJailChannelId: "🔹 **# 3tini l'ID dyal Voice Jail Channel** (aw `none`)"
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
    voiceJailChannelId: "🔹 **# Proporciona el ID del Canal de Voz de Cárcel** (o `none`)"
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
    voiceJailChannelId: "🔹 **# Укажите ID голосового канала Jail** (или `none`)"
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
    voiceJailChannelId: "🔹 **# Fournissez l'ID du canal vocal Jail** (ou `none`)"
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
// Global Slash Commands Registration
// ------------------------------
client.commands = new Collection();
const slashCommands = [
  new SlashCommandBuilder().setName('setprefix').setDescription('Set a custom prefix').addStringOption(o => o.setName('prefix').setDescription('New prefix').setRequired(true)),
  new SlashCommandBuilder().setName('setwelcome').setDescription('Set a custom welcome message').addStringOption(o => o.setName('message').setDescription('Welcome message').setRequired(true)),
  new SlashCommandBuilder().setName('showwelcome').setDescription('Show the current welcome message'),
  // One-Tap Management Commands:
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user in your tap').addUserOption(o => o.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user in your tap').addUserOption(o => o.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your tap (deny Connect)'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your tap'),
  new SlashCommandBuilder().setName('limit').setDescription('Set a user limit for your tap').addIntegerOption(o => o.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder().setName('reject').setDescription('Reject a user from your tap (kick and block)').addUserOption(o => o.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder().setName('perm').setDescription('Permit a rejected user to join again').addUserOption(o => o.setName('target').setDescription('User to permit').setRequired(true)),
  new SlashCommandBuilder().setName('hide').setDescription('Hide your tap'),
  new SlashCommandBuilder().setName('unhide').setDescription('Unhide your tap'),
  new SlashCommandBuilder().setName('transfer').setDescription('Transfer tap ownership').addUserOption(o => o.setName('target').setDescription('User to transfer to').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your tap').addStringOption(o => o.setName('text').setDescription('New name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your tap').addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('Show available commands')
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering global slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('Global slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

// ------------------------------
// Interaction Handler for Language and "Join Verification" Buttons
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    // Language selection: all 5 languages
    if (interaction.customId.startsWith("lang_")) {
      const langChosen = interaction.customId.split('_')[1];
      try {
        await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { language: langChosen } }, { upsert: true });
        await interaction.reply({ content: `Language set to ${langChosen}!`, ephemeral: true });
        await interaction.channel.send("Now type `ready` to begin the setup process.");
      } catch (err) {
        console.error("Error setting language:", err);
        await interaction.reply({ content: "Error setting language.", ephemeral: true });
      }
      return;
    }
    // "Join Verification" button
    if (interaction.customId.startsWith("join_verification_")) {
      const vcId = interaction.customId.split("_").pop();
      const tempVC = interaction.guild.channels.cache.get(vcId);
      if (!tempVC) return interaction.reply({ content: "Verification session expired.", ephemeral: true });
      const member = interaction.member;
      if (member.voice.channel) {
        try {
          await member.voice.setChannel(tempVC);
          return interaction.reply({ content: "You have joined the verification VC.", ephemeral: true });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: "Failed to move you.", ephemeral: true });
        }
      } else {
        try {
          const invite = await tempVC.createInvite({ maxAge: 300, maxUses: 1 });
          return interaction.reply({ content: `Join via this link: ${invite.url}`, ephemeral: true });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: "Failed to create an invite.", ephemeral: true });
        }
      }
    }
  }
});

// ------------------------------
// GuildMemberAdd: Assign Unverified Role & Send Welcome DM (with owner tag)
// ------------------------------
client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = await settingsCollection.findOne({ serverId: member.guild.id });
    if (!config) return; // Setup not complete
    const welcomeMsg = (config.customWelcome || "Merhba Bik Fi A7sen Server!") + ` <@${member.id}>`;
    if (config.unverifiedRoleId) {
      const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRoleId);
      if (unverifiedRole) {
        await member.roles.add(unverifiedRole);
        console.log(`Assigned unverified role to ${member.user.tag}`);
      } else {
        console.error("Unverified role not found in guild:", member.guild.name);
      }
    }
    await member.send(welcomeMsg).catch(() => {});
  } catch (err) {
    console.error("Error in GuildMemberAdd:", err);
  }
});

// ------------------------------
// "Ready" Handler for Interactive Setup (in "bot-setup" channel)
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.channel.name !== 'bot-setup') return;
  let owner;
  try {
    owner = await message.guild.fetchOwner();
  } catch (err) {
    console.error("Failed to fetch guild owner:", err);
    return;
  }
  if (message.author.id !== owner.id) {
    console.log(`Ignoring "ready" from ${message.author.tag} because owner is ${owner.user.tag}`);
    return;
  }
  if (message.content.trim().toLowerCase() === 'ready') {
    console.log(`"ready" triggered by ${message.author.tag} in ${message.guild.name}`);
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
});

// ------------------------------
// On Guild Join: Create "bot-setup" and "bot-config" Channels (Owner-only)
// ------------------------------
client.on(Events.GuildCreate, async guild => {
  try {
    const owner = await guild.fetchOwner();
    // Create "bot-setup" channel visible only to the owner.
    const setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0,
      topic: 'Configure the bot here. This channel will be deleted after setup.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    setupChannel.send(`<@${owner.id}>, welcome! Let's set up your bot configuration.`);
    // Create "bot-config" channel visible only to the owner.
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Bot configuration channel. Use slash commands like /setprefix, /setwelcome, etc.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    console.log("Created setup and config channels for", guild.name);
    // Language selection buttons
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
        "Select your language by clicking a button, then type `ready` to begin setup.\n" +
        "Once setup is complete, this channel will be deleted automatically."
      );
    setupChannel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error("Setup channel error:", err);
  }
});

// ------------------------------
// VoiceStateUpdate Handler for Verification and One-Tap
// ------------------------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const config = await settingsCollection.findOne({ serverId: guild.id });
  if (!config) return;
  
  // Verification Process: When an unverified user joins the permanent verification channel
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
        await alertChannel.send("# New Member Ajew 🙋‍♂️");
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        await alertChannel.send({ components: [row] });
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
        permissionOverwrites.push({ id: config.unverifiedRoleId, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] });
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
        const activeVC = guild.channels.cache
          .filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0)
          .first();
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
// +boy / +girl Verification Command Handler
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.content.startsWith('+boy') || message.content.startsWith('+girl')) {
    const config = await settingsCollection.findOne({ serverId: message.guild.id });
    if (!config) return message.reply("Bot is not configured for this server.");
    const memberToVerify = message.mentions.members.first();
    if (!memberToVerify) return message.reply("Please mention a user to verify (e.g. +boy @user).");
    try {
      if (config.unverifiedRoleId) await memberToVerify.roles.remove(config.unverifiedRoleId);
      if (message.content.startsWith('+boy')) {
        if (config.verifiedRoleId) await memberToVerify.roles.add(config.verifiedRoleId);
        message.channel.send(`${memberToVerify} verified as Boy!`);
      } else {
        if (config.verifiedGirlRoleId) await memberToVerify.roles.add(config.verifiedGirlRoleId);
        message.channel.send(`${memberToVerify} verified as Girl!`);
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
// Slash Command Interaction Handler for One-Tap Management
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  const member = interaction.member;
  const currentVC = member.voice.channel;
  if (!currentVC || !onetapSessions.has(currentVC.id)) {
    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle("Available Commands")
        .setDescription("Commands for configuration and one-tap management.")
        .addFields(
          { name: "General", value: "`/setprefix`, `/setwelcome`, `/showwelcome`", inline: false },
          { name: "One-Tap", value: "`/claim`, `/mute`, `/unmute`, `/lock`, `/unlock`, `/limit`, `/reject`, `/perm`, `/hide`, `/unhide`, `/transfer`, `/name`, `/status`", inline: false }
        );
      return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
    return interaction.reply({ content: "You are not in a one-tap room.", ephemeral: true });
  }
  let session = onetapSessions.get(currentVC.id);
  
  if (commandName === 'claim') {
    if (session.owner === member.id)
      return interaction.reply({ content: "You already own this tap.", ephemeral: true });
    if (currentVC.members.has(session.owner))
      return interaction.reply({ content: "Owner is still present; cannot claim ownership.", ephemeral: true });
    session.owner = member.id;
    onetapSessions.set(currentVC.id, session);
    return interaction.reply({ content: "You have claimed ownership of your tap.", ephemeral: true });
  }
  if (commandName === 'mute') {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id)
      return interaction.reply({ content: "That user is not in your tap.", ephemeral: true });
    try {
      await targetMember.voice.setMute(true);
      return interaction.reply({ content: `${targetMember.displayName} has been muted.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to mute.", ephemeral: true });
    }
  }
  if (commandName === 'unmute') {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id)
      return interaction.reply({ content: "That user is not in your tap.", ephemeral: true });
    try {
      await targetMember.voice.setMute(false);
      return interaction.reply({ content: `${targetMember.displayName} has been unmuted.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to unmute.", ephemeral: true });
    }
  }
  if (commandName === 'lock') {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      return interaction.reply({ content: "Your tap has been locked.", ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to lock tap.", ephemeral: true });
    }
  }
  if (commandName === 'unlock') {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      return interaction.reply({ content: "Your tap has been unlocked.", ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to unlock tap.", ephemeral: true });
    }
  }
  if (commandName === 'limit') {
    const number = interaction.options.getInteger('number');
    try {
      await currentVC.setUserLimit(number);
      return interaction.reply({ content: `User limit set to ${number}.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to set limit.", ephemeral: true });
    }
  }
  if (commandName === 'reject') {
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
      return interaction.reply({ content: `User ${target.username} has been rejected and kicked.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to reject user.", ephemeral: true });
    }
  }
  if (commandName === 'perm') {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user to permit.", ephemeral: true });
    session.rejectedUsers = session.rejectedUsers || [];
    const index = session.rejectedUsers.indexOf(target.id);
    if (index === -1) return interaction.reply({ content: "User is not rejected.", ephemeral: true });
    session.rejectedUsers.splice(index, 1);
    onetapSessions.set(currentVC.id, session);
    return interaction.reply({ content: `User ${target.username} is now permitted.`, ephemeral: true });
  }
  if (commandName === 'hide') {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      return interaction.reply({ content: "Your tap is now hidden.", ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to hide tap.", ephemeral: true });
    }
  }
  if (commandName === 'unhide') {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
      return interaction.reply({ content: "Your tap is now visible.", ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to unhide tap.", ephemeral: true });
    }
  }
  if (commandName === 'transfer') {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user to transfer ownership to.", ephemeral: true });
    try {
      session.owner = target.id;
      onetapSessions.set(currentVC.id, session);
      return interaction.reply({ content: `Ownership transferred to ${target.username}.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to transfer ownership.", ephemeral: true });
    }
  }
  if (commandName === 'name') {
    const newName = interaction.options.getString('text');
    try {
      await currentVC.setName(newName);
      return interaction.reply({ content: `Tap renamed to ${newName}.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to rename tap.", ephemeral: true });
    }
  }
  if (commandName === 'status') {
    const statusText = interaction.options.getString('text');
    try {
      session.status = statusText;
      onetapSessions.set(currentVC.id, session);
      return interaction.reply({ content: `Tap status set to: ${statusText}`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Failed to set status.", ephemeral: true });
    }
  }
  if (commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle("Available Commands")
      .setDescription("Commands for configuration and one-tap management.")
      .addFields(
        { name: "General", value: "`/setprefix`, `/setwelcome`, `/showwelcome`", inline: false },
        { name: "One-Tap", value: "`/claim`, `/mute`, `/unmute`, `/lock`, `/unlock`, `/limit`, `/reject`, `/perm`, `/hide`, `/unhide`, `/transfer`, `/name`, `/status`", inline: false }
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
// Client Login
// ------------------------------
client.login(process.env.DISCORD_TOKEN);
