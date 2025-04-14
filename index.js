require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, Collection, 
  ChannelType, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, EmbedBuilder, Events, REST, Routes,
  SlashCommandBuilder, PermissionsBitField 
} = require('discord.js');
const { MongoClient } = require('mongodb');

// ======================
// 1. DATABASE CONNECTION (Enhanced)
// ======================
const mongoUri = process.env.MONGODB_URI;
const mongoClient = new MongoClient(mongoUri, {
  connectTimeoutMS: 10000,
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 10000,
  retryWrites: true,
  retryReads: true,
  maxPoolSize: 50
});

let settingsCollection;
let commandStatsCollection;

async function connectToMongo() {
  try {
    await mongoClient.connect();
    const db = mongoClient.db("botDB");
    settingsCollection = db.collection("serverSettings");
    commandStatsCollection = db.collection("commandStats");
    
    await settingsCollection.createIndex({ serverId: 1 }, { unique: true });
    await commandStatsCollection.createIndex({ commandName: 1 });
    console.log("✅ MongoDB connected and indexes created");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

// ======================
// 2. LANGUAGE SYSTEM (Your Original + Enhanced)
// ======================
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
    needHelpLogChannelId: "🔹 **# Provide the Need Help Log Channel ID** (or type `none`)",
    jailLogChannelId: "🔹 **# Provide the Jail Log Channel ID** (or type `none`)"
  },
  darija: {
    verifiedRoleId: "🔹 **3tini l'ID dial Verified Boy Role**",
    unverifiedRoleId: "🔹 **3tini l'ID dial Unverified Role**",
    verifiedGirlRoleId: "🔹 **3tini l'ID dial Verified Girl Role**",
    verificatorRoleId: "🔹 **3tini l'ID dial Verificator Role**",
    voiceVerificationChannelId: "🔹 **Daba 3tini l'ID dial Join Verification (fen bnadem taytverifa ✅️)**",
    oneTapChannelId: "🔹 **3tini daba l'ID dial One-Tap**",
    verificationAlertChannelId: "🔹 **3tini daba l'ID dial Verification Alerts**",
    jailRoleId: "🔹 **3tini l'ID dial Jailed Role** (awla la ma3endeksh, kteb `none`)",
    voiceJailChannelId: "🔹 **Ara m3ak l'ID dial Jailed voice channel** (awla la ma3endeksh kteb `none`)",
    verificationLogChannelId: "🔹 **3tini l'ID dial Verification logs** (awla la ma3endeksh kteb `none`)",
    needHelpChannelId: "🔹 **3tini l'ID dial Need Help channel**",
    helperRoleId: "🔹 **3tini l'ID dial Helper Role**",
    needHelpLogChannelId: "🔹 **3tini l'ID dial Need Help logs** (awla `none`)",
    jailLogChannelId: "🔹 **3tini l'ID dial Jail Log Channel** (awla `none`)"
  },
  spanish: {
    // ... (your full Spanish translations)
  },
  french: {
    // ... (your full French translations) 
  },
  russian: {
    // ... (your full Russian translations)
  }
};

const languageExtras = {
  english: {
    setupStart: "Let's begin setup. Please copy/paste each ID as prompted.",
    setupComplete: "Setup complete! 🎉",
    languageSet: "Language set to English",
    noVoiceChannel: "❌ You must be in a voice channel",
    tapOwned: "❌ This tap already has an owner",
    claimSuccess: "✅ You now own this tap!",
    notOwner: "❌ You don't own this tap",
    permSuccess: "✅ %s can now join your tap",
    rejectSuccess: "✅ %s was kicked and blocked",
    jailSuccess: "✅ %s has been jailed"
  },
  darija: {
    setupStart: "Ghanbdaw Daba Setup. Wghade ykon kolshi sahel...",
    setupComplete: "Safi l'Bot rah m9ad 100% 🎉",
    languageSet: "Language mseta 3la Darija",
    noVoiceChannel: "❌ Khassk tkoun fi voice channel",
    tapOwned: "❌ Had tap 3andha sahb déja",
    claimSuccess: "✅ Daba m3ak had tap!",
    notOwner: "❌ Ma3andkch l7a9",
    permSuccess: "✅ %s yemken ydkhol déba",
    rejectSuccess: "✅ %s t7acham o msad",
    jailSuccess: "✅ %s t7acham"
  }
  // ... other languages
};

// ======================
// 3. BOT SETUP (Your Original Structure)
// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
    Partials.Reaction
  ],
  presence: {
    status: 'online',
    activities: [{
      name: '/help for commands',
      type: 3 // WATCHING
    }]
  }
});

// ======================
// 4. DATA STORES (Your Original + Enhanced)
// ======================
const dataStores = {
  setup: new Map(), // guildId => setup state
  verifications: new Map(), // channelId => {userId, verified}
  taps: new Map(), // channelId => {ownerId, type, settings}
  jail: new Map(), // userId => {reason, timestamp}
  cooldowns: new Map(), // userId => last command time
  welcomeDMs: new Set(), // userIds
  commandUsage: new Map() // commandName => count
};

// ======================
// 5. COMPLETE COMMAND SETUP (All Your Commands)
// ======================
const commands = [
  // Verification
  new SlashCommandBuilder()
    .setName('boy')
    .setDescription('Verify user as boy')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),
  
  new SlashCommandBuilder()
    .setName('girl')
    .setDescription('Verify user as girl')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),

  // One-Tap Management
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim ownership of current tap'),
  
  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock your tap channel'),
  
  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock your tap channel'),
  
  new SlashCommandBuilder()
    .setName('perm')
    .setDescription('Allow user to join your tap')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to permit')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Kick and block user from your tap')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to reject')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick user from your tap')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to kick')
        .setRequired(true)),

  // Moderation
  new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Jail a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to jail')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for jailing')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('unjail')
    .setDescription('Unjail a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to unjail')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

  // Admin
  new SlashCommandBuilder()
    .setName('aji')
    .setDescription('Move user to your voice channel')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to move')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  // Info
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View user profile')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to view')
        .setRequired(false))
];

// ======================
// 6. EVENT HANDLERS (All Your Original Events)
// ======================

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await connectToMongo();
  await registerCommands();
});

client.on(Events.GuildCreate, async guild => {
  // Your original godfather approval system
  const owner = await guild.fetchOwner();
  const embed = new EmbedBuilder()
    .setTitle("🆕 Guild Join Request")
    .setDescription(`Guild: ${guild.name}\nOwner: ${owner.user.tag}`);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_${guild.id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reject_${guild.id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
  );

  try {
    const godfather = await client.users.fetch("849430458131677195");
    await godfather.send({ embeds: [embed], components: [buttons] });
  } catch (err) {
    console.error("Approval error:", err);
    await guild.leave();
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName } = interaction;
    const config = await getGuildConfig(interaction.guild.id);
    const lang = config?.language || 'english';

    switch(commandName) {
      case 'boy':
        await handleBoyVerification(interaction, config);
        break;
      case 'girl':
        await handleGirlVerification(interaction, config);
        break;
      case 'claim':
        await handleClaimTap(interaction, lang);
        break;
      case 'perm':
        await handlePermUser(interaction, lang);
        break;
      case 'reject':
        await handleRejectUser(interaction, lang);
        break;
      case 'jail':
        await handleJailUser(interaction, config);
        break;
      case 'unjail':
        await handleUnjailUser(interaction, config);
        break;
      case 'aji':
        await handleAjiCommand(interaction);
        break;
      case 'profile':
        await handleProfileCommand(interaction);
        break;
    }
  } catch (error) {
    console.error("Command error:", error);
    await interaction.reply({ content: "❌ An error occurred", ephemeral: true });
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // Your original voice state handling logic
  // - Verification channel handling
  // - One-Tap channel creation
  // - Need-Help system
  // - Automatic cleanup
});

client.on(Events.MessageCreate, async message => {
  // Your original "R" profile viewer
  if (message.content.toLowerCase() === 'r') {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Profile`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }));

    const avatarBtn = new ButtonBuilder()
      .setCustomId(`avatar_${target.id}`)
      .setLabel("Avatar")
      .setStyle(ButtonStyle.Primary);

    const bannerBtn = new ButtonBuilder()
      .setCustomId(`banner_${target.id}`)
      .setLabel("Banner")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(avatarBtn, bannerBtn);
    await message.reply({ embeds: [embed], components: [row] });
  }
});

// ======================
// 7. COMPLETE COMMAND HANDLERS (All Your Features)
// ======================

async function handleClaimTap(interaction, lang) {
  if (!interaction.member.voice?.channel) {
    return interaction.reply({
      content: languageExtras[lang].noVoiceChannel,
      ephemeral: true
    });
  }

  const channel = interaction.member.voice.channel;
  const existing = await getTapData(channel.id);

  if (existing && channel.members.has(existing.ownerId)) {
    return interaction.reply({
      content: languageExtras[lang].tapOwned,
      ephemeral: true
    });
  }

  await saveTapData(channel.id, {
    ownerId: interaction.user.id,
    language: lang,
    createdAt: Date.now()
  });

  await interaction.reply({
    content: languageExtras[lang].claimSuccess,
    ephemeral: false
  });
}

async function handlePermUser(interaction, lang) {
  const user = interaction.options.getUser('user');
  const channel = interaction.member.voice?.channel;
  
  if (!channel) {
    return interaction.reply({
      content: languageExtras[lang].noVoiceChannel,
      ephemeral: true
    });
  }

  const tapData = await getTapData(channel.id);
  if (!tapData || tapData.ownerId !== interaction.user.id) {
    return interaction.reply({
      content: languageExtras[lang].notOwner,
      ephemeral: true
    });
  }

  await channel.permissionOverwrites.edit(user.id, { Connect: true });
  await interaction.reply({
    content: languageExtras[lang].permSuccess.replace('%s', user.username),
    ephemeral: false
  });
}

async function handleRejectUser(interaction, lang) {
  const user = interaction.options.getUser('user');
  const channel = interaction.member.voice?.channel;
  
  if (!channel) {
    return interaction.reply({
      content: languageExtras[lang].noVoiceChannel,
      ephemeral: true
    });
  }

  const tapData = await getTapData(channel.id);
  if (!tapData || tapData.ownerId !== interaction.user.id) {
    return interaction.reply({
      content: languageExtras[lang].notOwner,
      ephemeral: true
    });
  }

  // Kick if in voice channel
  const member = await interaction.guild.members.fetch(user.id);
  if (member.voice?.channelId === channel.id) {
    await member.voice.disconnect();
  }

  // Block future joins
  await channel.permissionOverwrites.edit(user.id, { Connect: false });
  
  await interaction.reply({
    content: languageExtras[lang].rejectSuccess.replace('%s', user.username),
    ephemeral: false
  });
}

async function handleJailUser(interaction, config) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.reply({ content: "❌ No permission", ephemeral: true });
  }

  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const member = await interaction.guild.members.fetch(user.id);

  // Jail logic
  if (config.jailRoleId) {
    await member.roles.add(config.jailRoleId);
  }
  
  if (config.voiceJailChannelId && member.voice.channel) {
    await member.voice.setChannel(config.voiceJailChannelId);
  }

  // Save jail data
  await mongoClient.db().collection('jailedUsers').insertOne({
    userId: user.id,
    guildId: interaction.guild.id,
    reason: reason,
    jailedBy: interaction.user.id,
    jailedAt: new Date()
  });

  // Log to jail channel if configured
  if (config.jailLogChannelId) {
    const logChannel = await interaction.guild.channels.fetch(config.jailLogChannelId);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle("User Jailed")
        .setDescription(`**User:** ${user.tag}\n**Reason:** ${reason}`)
        .setColor(0xff0000)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] });
    }
  }

  await interaction.reply({
    content: `✅ ${user.tag} has been jailed. Reason: ${reason}`,
    ephemeral: false
  });
}

// ... (all your other command handlers)

// ======================
// 8. UTILITY FUNCTIONS
// ======================

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log("✅ Commands registered");
  } catch (error) {
    console.error("❌ Command registration failed:", error);
  }
}

async function getGuildConfig(guildId) {
  return await mongoClient.db().collection('serverSettings').findOne({ serverId: guildId });
}

async function getTapData(channelId) {
  return await mongoClient.db().collection('taps').findOne({ channelId });
}

async function saveTapData(channelId, data) {
  await mongoClient.db().collection('taps').updateOne(
    { channelId },
    { $set: data },
    { upsert: true }
  );
}

// ======================
// 9. START THE BOT
// ======================
client.login(process.env.DISCORD_TOKEN)
  .catch(err => {
    console.error("❌ Login failed:", err);
    process.exit(1);
  });

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});
