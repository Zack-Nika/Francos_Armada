// index.js
// Franco's Armada Bot – Multi-Language, +boy/+girl no mention, open one-tap by default, user mention in DM
//
// FEATURES:
// 1) Multi-language interactive setup (English, Darija, Spanish, Russian, French).
// 2) Verification: unverified user joins permanent verification channel => ephemeral "Verify – [displayName]" VC created.
//    Verificator types "+boy" or "+girl" (no mention), bot finds the unverified user in that VC, verifies them.
//    When verificator leaves, verified user is moved to nearest open channel, ephemeral VC is deleted if empty.
// 3) One-Tap: when a verified user joins config.oneTapChannelId, ephemeral "[displayName]'s Room" is created. It's open
//    to all except unverified (which is denied view/connect). Auto-deletes when empty.
// 4) Welcome DM mentions user: "Welcome ... <@userid>" so user sees a mention in DM.
// 5) Global slash commands for one-tap management (/claim, /lock, /unlock, /mute, /unmute, /reject, /perm, /hide, /unhide, etc.)
// 6) "ready" command in "bot-setup" channel triggers multi-language interactive setup.

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

// Create Discord client
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

// Prevent Duplicate Setup
const setupStarted = new Map();

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
    jailRoleId: "🔹 **# Provide the Jail Role ID** (or `none`)",
    voiceJailChannelId: "🔹 **# Provide the Voice Jail Channel ID** (or `none`)"
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
    voiceVerificationChannelId: "🔹 **# Proporciona el ID del Canal de Verificación (permanente)**",
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
    verificatorRoleId: "🔹 **# Fournissez l'ID du rôle Verificateur**",
    voiceVerificationChannelId: "🔹 **# Fournissez l'ID du canal de vérification (permanent)**",
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
    setupStart: "Yallah, nbda setup. 3afak copier w coller IDs mnin nsewlek.",
    setupComplete: "Setup sali! 🎉"
  },
  spanish: {
    setupStart: "Empecemos la configuración. Copia/pega cada ID cuando se te pida.",
    setupComplete: "¡Configuración completa! 🎉"
  },
  russian: {
    setupStart: "Давайте начнем настройку. Скопируйте/вставьте каждый ID по запросу.",
    setupComplete: "Настройка завершена! 🎉"
  },
  french: {
    setupStart: "Commençons la configuration. Copiez/collez chaque ID lorsque demandé.",
    setupComplete: "Configuration terminée ! 🎉"
  }
};

// Helper: await single message
async function awaitResponse(channel, userId, prompt, lang) {
  await channel.send(prompt + "\n*(90 seconds to respond.)*");
  const filter = m => m.author.id === userId;
  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 90000, errors: ['time'] });
    return collected.first().content.trim();
  } catch {
    await channel.send(
      lang === "darija" ? "Setup t9llat. Kteb `ready` bach tbda men jdid." :
      lang === "spanish" ? "Tiempo de configuración agotado. Escribe `ready` para reiniciar." :
      lang === "russian" ? "Время настройки истекло. Введите `ready` чтобы начать заново." :
      lang === "french" ? "Le temps de configuration est écoulé. Tapez `ready` pour recommencer." :
      "Setup timed out. Type `ready` to restart setup."
    );
    throw new Error("Setup timed out");
  }
}

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

// Global slash commands, including one-tap
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
client.commands = new Collection();
const slashCommands = [
  new SlashCommandBuilder().setName('setprefix').setDescription('Set a custom prefix').addStringOption(o => o.setName('prefix').setDescription('New prefix').setRequired(true)),
  new SlashCommandBuilder().setName('setwelcome').setDescription('Set a custom welcome message').addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)),
  new SlashCommandBuilder().setName('showwelcome').setDescription('Show the current welcome message'),
  // One-Tap
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user in your tap').addUserOption(o => o.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user in your tap').addUserOption(o => o.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your tap'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your tap'),
  new SlashCommandBuilder().setName('limit').setDescription('Set a user limit for your tap').addIntegerOption(o => o.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder().setName('reject').setDescription('Reject a user from your tap').addUserOption(o => o.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder().setName('perm').setDescription('Permit a previously rejected user').addUserOption(o => o.setName('target').setDescription('User to permit').setRequired(true)),
  new SlashCommandBuilder().setName('hide').setDescription('Hide your tap'),
  new SlashCommandBuilder().setName('unhide').setDescription('Unhide your tap'),
  new SlashCommandBuilder().setName('transfer').setDescription('Transfer tap ownership').addUserOption(o => o.setName('target').setDescription('User to transfer to').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your tap').addStringOption(o => o.setName('text').setDescription('New name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your tap').addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('Show available commands')
];

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

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

const setupStarted = new Map();
const verificationSessions = new Map(); // ephemeral verification VCs
const onetapSessions = new Map();       // ephemeral one-tap VCs

client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = await settingsCollection.findOne({ serverId: member.guild.id });
    if (!config) return;
    // mention user in DM
    const welcomeMsg = (config.customWelcome || "Merhba Bik Fi A7sen Server!") + ` <@${member.id}>`;
    if (config.unverifiedRoleId) {
      const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRoleId);
      if (unverifiedRole) {
        await member.roles.add(unverifiedRole);
      }
    }
    await member.send(welcomeMsg).catch(() => {});
  } catch (err) {
    console.error("Error in GuildMemberAdd:", err);
  }
});

client.on('messageCreate', async message => {
  // "ready" in "bot-setup" => interactive setup
  if (!message.author.bot && message.channel.name === 'bot-setup' && message.author.id === message.guild.ownerId) {
    if (message.content.trim().toLowerCase() === 'ready') {
      if (setupStarted.get(message.guild.id)) return;
      setupStarted.set(message.guild.id, true);
      // read chosen language from DB
      const config = await settingsCollection.findOne({ serverId: message.guild.id });
      const lang = (config && config.language) || "english";
      try {
        await runSetup(message.author.id, message.channel, message.guild.id, lang);
        setTimeout(() => { message.channel.delete().catch(() => {}); }, 5000);
      } catch (err) {
        console.error("Setup error:", err);
      }
    }
  }

  // +boy / +girl verification, no mention needed
  if (!message.author.bot && (message.content.startsWith('+boy') || message.content.startsWith('+girl'))) {
    const config = await settingsCollection.findOne({ serverId: message.guild.id });
    if (!config) return;

    // Check if the message author is in a ephemeral verification VC
    const authorVC = message.member.voice.channel;
    if (!authorVC || !verificationSessions.has(authorVC.id)) {
      return message.reply("You are not in a verification session.");
    }
    const session = verificationSessions.get(authorVC.id);
    const unverifiedMember = message.guild.members.cache.get(session.userId);
    if (!unverifiedMember) {
      return message.reply("No unverified user found in this session.");
    }
    try {
      // remove unverified
      if (config.unverifiedRoleId) {
        await unverifiedMember.roles.remove(config.unverifiedRoleId).catch(() => {});
      }
      // add verified boy or girl
      if (message.content.startsWith('+boy')) {
        if (config.verifiedRoleId) await unverifiedMember.roles.add(config.verifiedRoleId);
        message.channel.send(`${unverifiedMember} verified as Boy!`);
      } else {
        if (config.verifiedGirlRoleId) await unverifiedMember.roles.add(config.verifiedGirlRoleId);
        message.channel.send(`${unverifiedMember} verified as Girl!`);
      }
      // store who is the assigned verificator
      session.assignedVerificator = message.author.id;
      verificationSessions.set(authorVC.id, session);
    } catch (err) {
      console.error("Verification error:", err);
      message.reply("Verification failed. Check my permissions or role hierarchy.");
    }
  }

  // "R" command for profile viewer
  if (!message.author.bot) {
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
  }
});

// On guild join => create bot-setup + bot-config
client.on(Events.GuildCreate, async guild => {
  try {
    const setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0,
      topic: 'Configure the bot here. This channel will be deleted after setup.',
      permissionOverwrites: [
        { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    setupChannel.send(`<@${guild.ownerId}>, welcome! Let's set up your bot configuration.`);

    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Bot configuration channel. Use slash commands like /setprefix, /setwelcome, etc.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: guild.ownerId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    console.log("Created setup/config channels for", guild.name);

    // language selection buttons
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
    console.error("Setup channel creation error:", err);
  }
});

// ephemeral verification & one-tap logic
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const config = await settingsCollection.findOne({ serverId: guild.id });
  if (!config) return;

  // If unverified user joins verification channel => ephemeral VC
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
      console.error("Verification ephemeral VC error:", err);
    }
  }

  // If user joins one-tap channel => ephemeral personal room, open by default, hide from unverified
  if (newState.channelId === config.oneTapChannelId) {
    try {
      const member = newState.member;
      const displayName = member.displayName || member.user.username;
      const permissionOverwrites = [];
      // Deny unverified from seeing or connecting
      if (config.unverifiedRoleId) {
        permissionOverwrites.push({ id: config.unverifiedRoleId, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] });
      }
      // The channel is open to everyone else, so we do not deny guild.id from Connect
      // but we allow the tap creator to connect
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
      console.error("One-tap ephemeral VC error:", err);
    }
  }

  // One-Tap auto-delete if empty
  if (oldState.channel && onetapSessions.has(oldState.channel.id)) {
    let session = onetapSessions.get(oldState.channel.id);
    // if owner leaves => reassign
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

  // Verification ephemeral VC => if verificator leaves => move verified user
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    if (oldState.member.id === session.assignedVerificator) {
      // Move verified user
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        // find nearest open voice channel
        const activeVC = guild.channels.cache
          .filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0)
          .first();
        if (activeVC) {
          await verifiedMember.voice.setChannel(activeVC);
        }
      }
    }
    // auto-delete ephemeral VC if empty
    if (oldState.channel.members.size === 0) {
      oldState.channel.delete().catch(() => {});
      verificationSessions.delete(oldState.channel.id);
    }
  }
});

// Slash commands for one-tap
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const member = interaction.member;
  const currentVC = member.voice.channel;
  if (!currentVC || !onetapSessions.has(currentVC.id)) {
    if (commandName === 'help') {
      // Let /help always respond
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
    if (session.owner === member.id) return interaction.reply({ content: "You already own this tap.", ephemeral: true });
    if (currentVC.members.has(session.owner)) {
      return interaction.reply({ content: "Owner is still present; cannot claim.", ephemeral: true });
    }
    session.owner = member.id;
    onetapSessions.set(currentVC.id, session);
    return interaction.reply({ content: "You have claimed ownership of your tap.", ephemeral: true });
  }
  if (commandName === 'mute') {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id) {
      return interaction.reply({ content: "That user is not in your tap.", ephemeral: true });
    }
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
    if (!targetMember || targetMember.voice.channelId !== currentVC.id) {
      return interaction.reply({ content: "That user is not in your tap.", ephemeral: true });
    }
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

// Interaction Handler for profile viewer buttons (avatar/banner)
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  // We already handle "join_verification_" and "lang_" above, so handle avatar/banner
  if (interaction.customId.startsWith("avatar_") || interaction.customId.startsWith("banner_")) {
    const [action, userId] = interaction.customId.split('_');
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
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);
