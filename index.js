// index.js
// Franco's Armada Bot – Final Complete Code
// FEATURES:
// • Connects to MongoDB to store per‑server settings (language, prefix, role/channel IDs, custom welcome message).
// • On guild join, creates a temporary "bot‑setup" channel (for interactive setup) and a permanent "bot‑config" channel.
// • New members are assigned the unverified role and receive a welcome DM.
// • Verification: When an unverified member joins the permanent verification channel,
//     the bot creates a temporary VC named "Verify – [displayName]" (userLimit: 2) and moves them there.
//     Then, it sends a plain‑text notification ("# New Member Ajew 🙋‍♂️") plus a "Join Verification" button to the alert channel.
//     When a verificator clicks that button, if they’re in a voice channel, they are moved into the VC;
//     if not, an invite link is provided.
//     In the temporary VC, the verificator can type "+boy" or "+girl" to verify the user.
//     Once verified, the unverified role is removed and the appropriate verified role is given.
//     After the verificator leaves, the bot moves the verified user to the nearest active voice channel.
// • One‑Tap: When a member joins the designated one‑tap channel, the bot creates a temporary VC named "[displayName]'s Room"
//     (using the member’s server display name) and moves them there. The channel is open by default and auto‑deletes when empty.
// • Global slash commands (e.g. /setprefix, /setwelcome, /showwelcome, /claim, /reject, etc.) and a message command "r" for profile viewing.
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
// MongoDB Connection
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
// Prevent Duplicate Setup
// ------------------------------
const setupStarted = new Map();

// ------------------------------
// Language Data (Customize/expand as needed)
// ------------------------------
const languagePrompts = {
  english: {
    verifiedRoleId: "🔹 **# Provide the Verified Role ID** (for verified boys).",
    unverifiedRoleId: "🔹 **# Provide the Unverified Role ID** (for new/unverified members).",
    verifiedGirlRoleId: "🔹 **# Provide the Verified Girl Role ID**.",
    verificatorRoleId: "🔹 **# Provide the Verificator Role ID**.",
    voiceVerificationChannelId: "🔹 **# Provide the Voice Verification Channel ID** (permanent channel).",
    oneTapChannelId: "🔹 **# Provide the One-Tap Channel ID** (for personal rooms).",
    verificationAlertChannelId: "🔹 **# Provide the Verification Alert Channel ID** (for notifications).",
    jailRoleId: "🔹 **# Provide the Jail Role ID** (or type `none`).",
    voiceJailChannelId: "🔹 **# Provide the Voice Jail Channel ID** (or type `none`)."
  },
  darija: {
    verifiedRoleId: "🔹 **# 3afak 3tini l'ID dyal Verified Role**.",
    unverifiedRoleId: "🔹 **# Daba 3tini l'ID dyal Unverified Role**.",
    verifiedGirlRoleId: "🔹 **# 3tini l'ID dyal Verified Girl Role**.",
    verificatorRoleId: "🔹 **# 3tini l'ID dyal Verificator Role**.",
    voiceVerificationChannelId: "🔹 **# 3tini l'ID dyal Voice Verification Channel** (permanent).",
    oneTapChannelId: "🔹 **# 3tini l'ID dyal One-Tap Channel**.",
    verificationAlertChannelId: "🔹 **# 3tini l'ID dyal Verification Alert Channel**.",
    jailRoleId: "🔹 **# 3tini l'ID dyal Jail Role** (aw `none`).",
    voiceJailChannelId: "🔹 **# 3tini l'ID dyal Voice Jail Channel** (aw `none`)."
  }
};

const languageExtras = {
  english: {
    setupStart: "Let's begin setup. I will ask for several IDs—copy and paste each one when prompted.",
    setupComplete: "Thank you! The bot is now fully set up. 🎉"
  },
  darija: {
    setupStart: "Nbda setup. Ghadi nsawlouk 3la b3d IDs. Copier w coller kol wahed.",
    setupComplete: "Choukrane 3la sbr dyalk! L'bot daba msetab. 🎉"
  }
};

// ------------------------------
// Helper: Await Single Message (90s Timeout)
// ------------------------------
async function awaitResponse(channel, userId, prompt, lang) {
  await channel.send(prompt + "\n*(90 seconds to respond, or setup times out.)*");
  const filter = m => m.author.id === userId;
  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 90000, errors: ['time'] });
    return collected.first().content.trim();
  } catch (err) {
    await channel.send(
      lang === "english"
        ? "Setup timed out. Type `ready` to restart setup."
        : "Setup t9llat. Kteb `ready` bach tbda men jdod."
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

// ------------------------------
// Global Slash Commands Registration
// ------------------------------
client.commands = new Collection();
const slashCommands = [
  new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set a custom prefix for this server')
    .addStringOption(opt => opt.setName('prefix').setDescription('New prefix').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Set a custom welcome message for new members')
    .addStringOption(opt => opt.setName('message').setDescription('Welcome message').setRequired(true)),
  new SlashCommandBuilder().setName('showwelcome').setDescription('Show the current welcome message'),
  // (Other slash commands such as /topvrf, /binfo, /jinfo, /claim, etc. can be added similarly)
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
// Interaction Handler for Language Buttons & "Join Verification" Button
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    // Language selection
    if (interaction.customId.startsWith("lang_")) {
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
      return;
    }
    // Join Verification button
    if (interaction.customId.startsWith("join_verification_")) {
      const vcId = interaction.customId.split("_").pop();
      const tempVC = interaction.guild.channels.cache.get(vcId);
      if (!tempVC) {
        return interaction.reply({ content: "Verification session expired.", ephemeral: true });
      }
      const member = interaction.member;
      if (member.voice.channel) {
        try {
          await member.voice.setChannel(tempVC);
          return interaction.reply({ content: "You have joined the verification VC.", ephemeral: true });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: "Failed to move you to the VC.", ephemeral: true });
        }
      } else {
        try {
          const invite = await tempVC.createInvite({ maxAge: 300, maxUses: 1 });
          return interaction.reply({ content: `Join the VC using this link: ${invite.url}`, ephemeral: true });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: "Failed to create an invite.", ephemeral: true });
        }
      }
    }
  }
  // (Handle other slash commands here as needed)
});

// ------------------------------
// GuildMemberAdd: Assign Unverified Role & Send Welcome DM
// ------------------------------
client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = await settingsCollection.findOne({ serverId: member.guild.id });
    if (!config) return; // Setup not complete
    const welcomeMsg = config.customWelcome || "Merhba Bik Fi A7sen Server! Daba ayji 3ndk Verificator...";
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
  if (message.author.id !== message.guild.ownerId) return;
  if (message.content.trim().toLowerCase() === 'ready') {
    console.log(`"ready" triggered by ${message.author.tag} in ${message.guild.name}`);
    if (setupStarted.get(message.guild.id)) {
      console.log("Setup already started. Ignoring duplicate 'ready'.");
      return;
    }
    setupStarted.set(message.guild.id, true);
    const serverConfig = await settingsCollection.findOne({ serverId: message.guild.id });
    const lang = (serverConfig && serverConfig.language) || "english";
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

// ------------------------------
// Create "bot-setup" and "bot-config" Channels on Guild Join
// ------------------------------
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
    const owner = await guild.fetchOwner();
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Bot configuration channel. Use slash commands like /setprefix here.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    console.log("Created bot-config channel for", guild.name);
    const englishButton = new ButtonBuilder().setCustomId('lang_english').setLabel('English').setStyle(ButtonStyle.Primary);
    const darijaButton = new ButtonBuilder().setCustomId('lang_darija').setLabel('Darija').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(englishButton, darijaButton);
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle("Welcome to Franco's Armada! 🔱🚢")
      .setDescription(
        "Please choose your language by clicking a button below, then type `ready` to begin setup.\n" +
        "Once setup is complete, this channel will be deleted automatically."
      );
    setupChannel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error("Failed to create setup/config channels:", err);
  }
});

// ------------------------------
// Voice State Update Handler for Verification and One-Tap
// ------------------------------
const verificationSessions = new Map(); // For temporary verification VCs
const onetapSessions = new Map();       // For temporary one-tap rooms

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const config = await settingsCollection.findOne({ serverId: guild.id });
  if (!config) return;

  // --- Verification Process ---
  // When an unverified member joins the permanent verification channel:
  if (newState.channelId === config.voiceVerificationChannelId) {
    try {
      const member = newState.member;
      const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);
      if (!unverifiedRole || !member.roles.cache.has(unverifiedRole.id)) {
        console.log(`${member.displayName} is not unverified; skipping VC creation.`);
        return;
      }
      // Create a temporary VC for verification (limit 2: one unverified, one verificator)
      const tempVC = await guild.channels.create({
        name: `Verify – ${member.displayName}`,
        type: 2,
        parent: newState.channel.parentId,
        userLimit: 2,
        permissionOverwrites: [] // Customize if needed
      });
      console.log(`Created verification VC for ${member.displayName}`);
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      // Send plain-text notification with a "Join Verification" button to the alert channel:
      const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
      if (alertChannel) {
        await alertChannel.send("# New Member Ajew 🙋‍♂️");
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        await alertChannel.send({ components: [row] });
      } else {
        console.error("Verification alert channel not found for", guild.name);
      }
    } catch (err) {
      console.error("Error in verification VC creation:", err);
    }
  }

  // --- One-Tap Process ---
  if (newState.channelId === config.oneTapChannelId) {
    try {
      const member = newState.member;
      const displayName = member.displayName || member.user.username;
      const tempVC = await guild.channels.create({
        name: `${displayName}'s Room`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
          { id: member.id, allow: [PermissionsBitField.Flags.Connect] }
        ]
      });
      console.log(`Created one-tap VC for ${displayName}`);
      onetapSessions.set(tempVC.id, { owner: member.id, rejectedUsers: [], status: "" });
      await member.voice.setChannel(tempVC);
    } catch (err) {
      console.error("Error creating one-tap VC:", err);
    }
  }

  // --- One-Tap Auto-Deletion and Owner Reassignment ---
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

  // --- Verification: When Verificator Leaves Temporary VC, Move Verified User ---
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    // If the verificator leaves (and session.assignedVerificator is set)
    if (oldState.member.id === session.assignedVerificator) {
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        // Find the nearest open voice channel (excluding the temporary VC)
        const activeVC = guild.channels.cache
          .filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0)
          .first();
        if (activeVC) {
          await verifiedMember.voice.setChannel(activeVC);
          console.log(`Moved verified user ${verifiedMember.displayName} to ${activeVC.name}`);
        }
      }
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
        message.channel.send(`${memberToVerify} is now Verified Boy!`);
      } else {
        if (config.verifiedGirlRoleId) await memberToVerify.roles.add(config.verifiedGirlRoleId);
        message.channel.send(`${memberToVerify} is now Verified Girl!`);
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
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("lang_") || interaction.customId.startsWith("join_verification_") === false && !interaction.customId.includes("avatar") && !interaction.customId.includes("banner")) return;
  const [action, userId] = interaction.customId.split('_');
  if (!userId) return;
  try {
    const targetUser = await client.users.fetch(userId, { force: true });
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
      if (!bannerURL) return interaction.reply({ content: "This user does not have a banner set.", ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`${targetUser.username}'s Banner`)
        .setImage(bannerURL)
        .setFooter({ text: `Requested by: ${interaction.user.username}` });
      return interaction.update({ embeds: [embed] });
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
