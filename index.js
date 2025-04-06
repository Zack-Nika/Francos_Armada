// index.js
// Franco's Armada Bot – A fully featured rental bot with interactive, multilingual per‑server setup.
// FEATURES:
// • Connects to MongoDB to store per‑server settings (language, custom prefix, role/channel IDs, custom welcome message).
// • When joining a server, creates a temporary "bot-setup" channel with language selection buttons for interactive setup.
// • Assigns new members the unverified role and DMs them a welcome message (using a custom welcome if set).
// • Creates a permanent "bot-config" channel (visible only to the server owner) for later configuration.
// • Implements voice state handling for verification (creates a temporary VC only when an unverified user joins the verification channel)
//   with a pop‑up notification titled "## New Member as You 🙋" (big bold text).
// • Provides global slash commands for customization (/setprefix, /setwelcome, /showwelcome), dashboard commands (/topvrf, /binfo, /jinfo, /toponline, /topmembers),
//   one‑tap management (/claim, /reject, /kick, /mute, /unmute, /transfer, /name, /status), and a message command "r" for profile viewing.
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
// Create Discord Client with necessary intents
// ------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,      // For role assignments
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,    // For message commands
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ------------------------------
// Prevent Multiple Setups
// ------------------------------
const setupStarted = new Map();

// ------------------------------
// Language Data (Customize these objects as needed)
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
  // Add Spanish, Russian, French similarly…
  spanish: { /* ... */ },
  russian: { /* ... */ },
  french: { /* ... */ }
};

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
  // Add Spanish, Russian, French similarly…
  spanish: { /* ... */ },
  russian: { /* ... */ },
  french: { /* ... */ }
};

// -----------------------------------
// Helper: Await a Single Message (90s Timeout)
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
      "Setup timed out. Type `ready` to restart setup."
    );
    throw new Error("Setup timed out");
  }
}

// -----------------------------------
// Interactive Setup Process
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
// Global Slash Commands Registration
// -----------------------------------
client.commands = new Collection();
const slashCommands = [
  new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set a custom prefix for this server')
    .addStringOption(opt => opt.setName('prefix').setDescription('New prefix').setRequired(true)),
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
    console.log('Refreshing global slash commands...');
    // Register globally (this may take up to an hour to update)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('Global slash commands reloaded.');
  } catch (error) {
    console.error(error);
  }
})();

// -----------------------------------
// Interaction Handler for Language Buttons
// -----------------------------------
client.on('interactionCreate', async interaction => {
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
    return;
  }
});

// -----------------------------------
// Interaction Handler for Global Slash Commands
// -----------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const isOwner = (interaction.member.id === interaction.guild.ownerId);
  const hasVerified = config && (
    interaction.member.roles.cache.has(config.verifiedRoleId) ||
    interaction.member.roles.cache.has(config.verifiedGirlRoleId)
  );
  const hasVerificator = config && interaction.member.roles.cache.has(config.verificatorRoleId);

  if (commandName === 'setprefix') {
    const newPrefix = interaction.options.getString('prefix');
    try {
      await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { prefix: newPrefix } }, { upsert: true });
      return interaction.reply({ content: `Prefix updated to \`${newPrefix}\`!`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "Error updating prefix.", ephemeral: true });
    }
  }
  else if (commandName === 'setwelcome') {
    if (!isAdmin && !isOwner) {
      return interaction.reply({ content: "Only admins or the server owner can set the welcome message.", ephemeral: true });
    }
    const newMsg = interaction.options.getString('message');
    try {
      await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { customWelcome: newMsg } }, { upsert: true });
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
    if (commandName === 'toponline') {
      return interaction.reply({ content: "Top online users: [Coming soon...]", ephemeral: true });
    } else {
      return interaction.reply({ content: "Top members: [Coming soon...]", ephemeral: true });
    }
  }
  // One-tap commands (claim, reject, kick, mute, unmute, transfer, name, status) – unchanged:
  else if (commandName === 'claim') {
    const member = interaction.member;
    const vc = member.voice.channel;
    if (!vc || !onetapSessions.has(vc.id)) {
      return interaction.reply({ content: "You are not in a one-tap voice channel.", ephemeral: true });
    }
    const session = onetapSessions.get(vc.id);
    if (session.owner === member.id) {
      return interaction.reply({ content: "You are already the owner.", ephemeral: true });
    }
    session.owner = member.id;
    onetapSessions.set(vc.id, session);
    return interaction.reply({ content: "You have claimed ownership of your tap.", ephemeral: true });
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
    return interaction.reply({ content: `User ${target.username} has been rejected.`, ephemeral: true });
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
        await targetMember.voice.disconnect("Kicked from tap");
        return interaction.reply({ content: `User ${target.username} has been kicked.`, ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Failed to kick user.", ephemeral: true });
      }
    } else {
      return interaction.reply({ content: "User not found in your tap.", ephemeral: true });
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
      return interaction.reply({ content: "Failed to mute user.", ephemeral: true });
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
      return interaction.reply({ content: "Failed to unmute user.", ephemeral: true });
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
      return interaction.reply({ content: "Only the owner can rename the tap.", ephemeral: true });
    }
    try {
      await vc.setName(newName);
      return interaction.reply({ content: `Tap renamed to ${newName}.`, ephemeral: true });
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: "Failed to rename tap.", ephemeral: true });
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
      return interaction.reply({ content: "Only the owner can set the status.", ephemeral: true });
    }
    try {
      let session = onetapSessions.get(vc.id);
      session.status = statusText;
      onetapSessions.set(vc.id, session);
      return interaction.reply({ content: `Tap status set to: ${statusText}`, ephemeral: true });
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
        { name: "Profile Viewer", value: "`r` → View your profile (Avatar/Banner)", inline: false },
        { name: "Customization", value: "`/setprefix`, `/setwelcome`, `/showwelcome`", inline: false },
        { name: "One-Tap", value: "`/claim`, `/reject`, `/kick`, `/mute`, `/unmute`, `/transfer`, `/name`, `/status`", inline: false },
        { name: "Dashboard", value: "`/topvrf`, `/binfo`, `/jinfo`, `/toponline`, `/topmembers`", inline: false }
      );
    return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  }
});

// -----------------------------------
// Voice State Update Handler for Verification & One-Tap
// -----------------------------------
const verificationSessions = new Map(); // { vcId: { userId, assignedVerificator, rejected } }
const onetapSessions = new Map();       // { vcId: { owner, rejectedUsers: [], status } }

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const config = await settingsCollection.findOne({ serverId: guild.id });
  if (!config) return;

  // If an unverified user joins the verification channel:
  if (newState.channelId === config.voiceVerificationChannelId) {
    try {
      const member = newState.member;
      const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);
      if (!unverifiedRole || !member.roles.cache.has(unverifiedRole.id)) {
        console.log(`${member.displayName} is not unverified. Skipping verification VC creation.`);
        return;
      }
      const tempVC = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2,
        parent: newState.channel.parentId,
        userLimit: 2,  // Limit to 1 unverified + 1 verificator
        permissionOverwrites: []
      });
      console.log(`Created verification VC for ${member.displayName}`);
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
      if (alertChannel) {
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        // Pop-up title updated:
        const alertEmbed = new EmbedBuilder()
          .setTitle("## New Member as You 🙋")
          .setColor(0x00AE86);
        await alertChannel.send({ embeds: [alertEmbed], components: [row] });
      } else {
        console.error("Verification alert channel not found for", guild.name);
      }
    } catch (err) {
      console.error("Error creating verification VC:", err);
    }
  }

  // One-Tap channel handler (unchanged)
  if (newState.channelId === config.oneTapChannelId) {
    try {
      const member = newState.member;
      console.log(`${member.displayName} joined the fixed one-tap channel.`);
      // Optionally, move them if desired.
    } catch (err) {
      console.error("Error in one-tap join:", err);
    }
  }

  // (Additional logic: owner reassignment, auto-deletion of empty channels, moving verified user)
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
  if (oldState.channel && oldState.channel.members.size === 0) {
    const channelId = oldState.channel.id;
    if (verificationSessions.has(channelId) || onetapSessions.has(channelId)) {
      oldState.channel.delete().catch(() => {});
      verificationSessions.delete(channelId);
      onetapSessions.delete(channelId);
    }
  }
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

// -----------------------------------
// Verification Command Handler (+boy / +girl)
// -----------------------------------
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
    if (!sessionId) return message.reply("No active verification session found for you.");
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
        darija: "Ma kaynach toxic shabab ❌️☢️. Hna bash nrelaxiw w njibou mzyan waqtna. Marhba bik men jdid! 🌸❤️",
        // Add other languages as needed…
      };
      const lang = config.language || "english";
      const welcomeDM = verificationWelcome[lang] || verificationWelcome.english;
      await memberToVerify.send(welcomeDM);
      message.channel.send(`<@${memberToVerify.id}> was verified as ${verifiedRoleName} successfully!`);
      setTimeout(async () => {
        const verifVC = message.guild.channels.cache.get(sessionId);
        if (verifVC && (verifVC.members.size === 0 || (verifVC.members.size === 1 && verifVC.members.has(message.author.id)))) {
          await verifVC.delete().catch(() => {});
          verificationSessions.delete(sessionId);
        }
      }, 30000);
      return message.reply("Verification complete.");
    } catch (err) {
      console.error("Verification error:", err);
      return message.reply("Verification failed.");
    }
  }
});

// -----------------------------------
// "R" Command for Profile Viewer (Fixed)
// -----------------------------------
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

// -----------------------------------
// Interaction Handler for Profile Viewer Buttons
// -----------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("lang_")) return; // Skip language buttons
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

// -----------------------------------
// "Ready" Command Handler for Interactive Setup (in "bot-setup" channel)
// -----------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  console.log(`Message from ${message.author.tag} in #${message.channel.name}: ${message.content}`);
  if (message.channel.name !== 'bot-setup') return;
  if (message.author.id !== message.guild.ownerId) return; // Only guild owner may trigger setup
  if (message.content.toLowerCase() === 'ready') {
    console.log(`"ready" triggered by ${message.author.tag} in guild ${message.guild.name}`);
    if (setupStarted.get(message.guild.id)) {
      console.log("Setup already started for this guild. Ignoring duplicate ready.");
      return;
    }
    setupStarted.set(message.guild.id, true);
    const serverConfig = await settingsCollection.findOne({ serverId: message.guild.id });
    const lang = (serverConfig && serverConfig.language) || "english";
    await message.channel.send(languageExtras[lang]?.setupStart || languageExtras.english.setupStart);
    try {
      await runSetup(message.author.id, message.channel, message.guild.id, lang);
      // After setup, delete the setup channel after 5 seconds.
      setTimeout(() => {
        message.channel.delete().catch(console.error);
      }, 5000);
    } catch (err) {
      console.error("Setup process error:", err);
    }
  }
});

// -----------------------------------
// Create Permanent "bot-config" Channel on Guild Join
// -----------------------------------
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
      "Made by Franco • Type `/help` for a list of commands. Let's set sail together! ⚓"
    );
  setupChannel.send({ embeds: [embed], components: [row] });
});

// -----------------------------------
// Client Login
// -----------------------------------
client.login(process.env.DISCORD_TOKEN);
