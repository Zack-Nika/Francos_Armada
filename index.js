// index.js
// Franco's Armada Bot – Final Code: 
//  - Removes separate text‑channel creation for one‑tap & need‑help
//  - Only one R command handler
//  - Voice channels grant "AttachFiles" permission so people can send pictures in the new Voice Chat UI.

// FEATURES:
// • Connects to MongoDB for per‑server settings (language, prefix, role/channel IDs, custom welcome message, need help keys).
// • On guild join, creates "bot‑setup" and "bot‑config" channels (visible only to the owner).
// • New members automatically receive the unverified role.
// • Interactive multi‑language setup triggered by the owner typing "ready" in "bot‑setup".
// • Verification: ephemeral VC, +boy/+girl, notifications with "Join Verification" button, auto‑delete when empty, etc.
// • One‑Tap & Need‑Help: ephemeral voice channels, no separate text channel created. 
//   Instead, each ephemeral VC has permission to attach files in that same voice channel's text chat UI (if Discord supports it).
// • The "R" command shows a user's profile picture/banners only once (no double responses).
// • All notifications reference "Franco's Armada 🔱" properly.

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
// Attempt to set bot username on Ready
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (client.user.username !== "Franco's Armada") {
    client.user.setUsername("Franco's Armada").catch(console.error);
  }
});

// ------------------------------
// Global Variables
// ------------------------------
const setupStarted = new Map();
const verificationSessions = new Map(); // ephemeral verification VCs
const onetapSessions = new Map();       // ephemeral one‑tap / need help VCs
const jailData = new Map();             // store jail reasons

// ------------------------------
// Multi-Language Data
// ------------------------------
const languagePrompts = {
  english: {
    verifiedRoleId: " **# 🔹 Provide the Verified Boy Role ID**",
    unverifiedRoleId: " **# 🔹 Provide the Unverified Role ID**",
    verifiedGirlRoleId: " **# 🔹 Provide the Verified Girl Role ID**",
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
  }
  // ...omitting other languages for brevity, or copy them if needed...
};

const languageExtras = {
  english: {
    setupStart: "Let's begin setup. Please copy/paste each ID as prompted.",
    setupComplete: "Setup complete! 🎉"
  }
  // ...omitting other languages for brevity...
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
    await channel.send("Setup timed out. Type `ready` to restart.");
    throw new Error("Setup timed out");
  }
}

// ------------------------------
// Interactive Setup
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
// Language Button Handler
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId.startsWith('lang_')) {
    const langChosen = interaction.customId.split('_')[1];
    try {
      await settingsCollection.updateOne(
        { serverId: interaction.guild.id },
        { $set: { language: langChosen } },
        { upsert: true }
      );
      await interaction.reply({ content: `Language set to ${langChosen}! Type \`ready\` to begin setup.`, ephemeral: true });
    } catch (err) {
      console.error("Error setting language:", err);
      await interaction.reply({ content: "Error setting language.", ephemeral: true });
    }
  }
});

// ------------------------------
// Global Slash Commands
// ------------------------------
client.commands = new Collection();
const slashCommands = [
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
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
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
    .setDescription('Show total bans')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('topvrf').setDescription('Show top verificators').setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('toponline').setDescription('Show top online users').setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  // One-tap slash commands
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user in your tap')
    .addUserOption(o => o.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user in your tap')
    .addUserOption(o => o.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your tap'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your tap'),
  new SlashCommandBuilder()
    .setName('limit')
    .setDescription('Set a user limit for your tap')
    .addIntegerOption(o => o.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Reject a user from your tap')
    .addUserOption(o => o.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder()
    .setName('perm')
    .setDescription('Permit a rejected user to join again')
    .addUserOption(o => o.setName('target').setDescription('User to permit').setRequired(true)),
  new SlashCommandBuilder().setName('hide').setDescription('Hide your tap'),
  new SlashCommandBuilder().setName('unhide').setDescription('Unhide your tap'),
  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer ownership of your tap')
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
    await rest.put(Routes2.applicationCommands(process.env.CLIENT_ID), { body: slashCommands.map(cmd => cmd.toJSON()) });
    console.log('Global slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

// ------------------------------
// Slash Command Interaction Handler
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  if (!config) {
    return interaction.reply({ content: "Bot not configured for this server.", ephemeral: true });
  }
  const globalCommands = ["setprefix","setwelcome","showwelcome","jail","jinfo","unban","binfo","topvrf","toponline"];
  
  if (globalCommands.includes(commandName)) {
    // Must be admin or owner
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator) && interaction.member.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: "You are not allowed to use this command.", ephemeral: true });
    }
    // Switch on global commands
    if (commandName === 'setprefix') {
      const prefix = interaction.options.getString('prefix');
      try {
        await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { prefix } }, { upsert: true });
        return interaction.reply({ content: `Prefix updated to ${prefix}.`, ephemeral: true });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to update prefix.", ephemeral: true });
      }
    }
    else if (commandName === 'setwelcome') {
      const msg = interaction.options.getString('message');
      try {
        await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { customWelcome: msg } }, { upsert: true });
        return interaction.reply({ content: "Welcome message updated!", ephemeral: true });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to update welcome.", ephemeral: true });
      }
    }
    else if (commandName === 'showwelcome') {
      return interaction.reply({ content: `Current welcome message: ${config.customWelcome || "Default"}`, ephemeral: true });
    }
    else if (commandName === 'jail') {
      const userid = interaction.options.getString('userid');
      const reason = interaction.options.getString('reason');
      let targetMember = await interaction.guild.members.fetch(userid).catch(()=>null);
      if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
      try {
        // remove all roles
        await targetMember.roles.set([]);
        // add jail role if exist
        if (config.jailRoleId && config.jailRoleId !== "none") {
          const jailRole = interaction.guild.roles.cache.get(config.jailRoleId);
          if (jailRole) {
            await targetMember.roles.add(jailRole);
          }
        }
        // move to voiceJail if exist
        if (config.voiceJailChannelId && config.voiceJailChannelId !== "none" && targetMember.voice.channel) {
          const jailVC = interaction.guild.channels.cache.get(config.voiceJailChannelId);
          if (jailVC) await targetMember.voice.setChannel(jailVC);
        }
        jailData.set(targetMember.id, reason);
        return interaction.reply({ content: `${targetMember.displayName} jailed for: ${reason}`, ephemeral: true });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to jail user.", ephemeral: true });
      }
    }
    else if (commandName === 'jinfo') {
      const userid = interaction.options.getString('userid');
      const info = jailData.get(userid) || "No jail reason found.";
      return interaction.reply({ content: `Jail info for ${userid}: ${info}`, ephemeral: true });
    }
    else if (commandName === 'unban') {
      const userid = interaction.options.getString('userid');
      let targetMember = await interaction.guild.members.fetch(userid).catch(()=>null);
      if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
      try {
        // remove jail role
        if (config.jailRoleId && config.jailRoleId !== "none") {
          const jailRole = interaction.guild.roles.cache.get(config.jailRoleId);
          if (jailRole && targetMember.roles.cache.has(jailRole.id)) {
            await targetMember.roles.remove(jailRole);
          }
        }
        jailData.delete(targetMember.id);
        return interaction.reply({ content: `${targetMember.displayName} unjailed.`, ephemeral: true });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to unjail user.", ephemeral: true });
      }
    }
    else if (commandName === 'binfo') {
      try {
        const bans = await interaction.guild.bans.fetch();
        return interaction.reply({ content: `Total banned users: ${bans.size}`, ephemeral: true });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to fetch ban info.", ephemeral: true });
      }
    }
    else if (commandName === 'topvrf') {
      return interaction.reply({ content: "Top verificators: [Coming soon]", ephemeral: true });
    }
    else if (commandName === 'toponline') {
      return interaction.reply({ content: "Top online: [Coming soon]", ephemeral: true });
    }
    return;
  }

  // Otherwise assume it's one-tap commands, require user in ephemeral VC
  const member = interaction.member;
  const currentVC = member.voice.channel;
  if (!currentVC || !onetapSessions.has(currentVC.id)) {
    return interaction.reply({ content: "You are not in a one-tap room.", ephemeral: true });
  }
  const session = onetapSessions.get(currentVC.id);

  // handle each slash command
  if (commandName === 'claim') {
    if (session.owner === member.id) {
      return interaction.reply({ content: "You already own this tap.", ephemeral: true });
    }
    if (currentVC.members.has(session.owner)) {
      return interaction.reply({ content: "Owner is still here; cannot claim ownership.", ephemeral: true });
    }
    session.owner = member.id;
    onetapSessions.set(currentVC.id, session);
    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("Ownership Claimed")
      .setDescription("You have claimed ownership of your tap.")
      .setFooter({ text: "Franco's Armada 🔱" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  else if (commandName === 'mute') {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id) {
      return interaction.reply({ content: "That user is not in your tap.", ephemeral: true });
    }
    try {
      await targetMember.voice.setMute(true);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("User Muted")
        .setDescription(`${targetMember.displayName} has been muted.`)
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to mute user.", ephemeral: true });
    }
  }
  else if (commandName === 'unmute') {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id) {
      return interaction.reply({ content: "That user is not in your tap.", ephemeral: true });
    }
    try {
      await targetMember.voice.setMute(false);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("User Unmuted")
        .setDescription(`${targetMember.displayName} has been unmuted.`)
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to unmute user.", ephemeral: true });
    }
  }
  else if (commandName === 'lock') {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Locked")
        .setDescription("Your tap has been locked.")
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to lock tap.", ephemeral: true });
    }
  }
  else if (commandName === 'unlock') {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Unlocked")
        .setDescription("Your tap has been unlocked.")
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to unlock tap.", ephemeral: true });
    }
  }
  else if (commandName === 'limit') {
    const limit = interaction.options.getInteger('number');
    try {
      await currentVC.setUserLimit(limit);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("User Limit Set")
        .setDescription(`User limit set to ${limit}.`)
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to set user limit.", ephemeral: true });
    }
  }
  else if (commandName === 'reject') {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user to reject.", ephemeral: true });
    try {
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (targetMember && targetMember.voice.channelId === currentVC.id) {
        await targetMember.voice.disconnect();
      }
      session.rejectedUsers = session.rejectedUsers || [];
      if (!session.rejectedUsers.includes(target.id)) session.rejectedUsers.push(target.id);
      onetapSessions.set(currentVC.id, session);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("User Rejected")
        .setDescription(`User ${target.username} has been rejected.`)
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to reject user.", ephemeral: true });
    }
  }
  else if (commandName === 'perm') {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user to permit.", ephemeral: true });
    session.rejectedUsers = session.rejectedUsers || [];
    const idx = session.rejectedUsers.indexOf(target.id);
    if (idx === -1) return interaction.reply({ content: "User is not rejected.", ephemeral: true });
    session.rejectedUsers.splice(idx,1);
    onetapSessions.set(currentVC.id, session);
    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("User Permitted")
      .setDescription(`${target.username} is now permitted.`)
      .setFooter({ text: "Franco's Armada 🔱" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  else if (commandName === 'hide') {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Hidden")
        .setDescription("Your tap is now hidden.")
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to hide tap.", ephemeral: true });
    }
  }
  else if (commandName === 'unhide') {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Unhidden")
        .setDescription("Your tap is now visible.")
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to unhide tap.", ephemeral: true });
    }
  }
  else if (commandName === 'transfer') {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user to transfer ownership to.", ephemeral: true });
    try {
      session.owner = target.id;
      onetapSessions.set(currentVC.id, session);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Ownership Transferred")
        .setDescription(`Ownership transferred to ${target.username}.`)
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to transfer ownership.", ephemeral: true });
    }
  }
  else if (commandName === 'name') {
    const newName = interaction.options.getString('text');
    try {
      await currentVC.setName(newName);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle("Tap Renamed")
        .setDescription(`Tap renamed to ${newName}.`)
        .setFooter({ text: "Franco's Armada 🔱" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to rename tap.", ephemeral: true });
    }
  }
  else if (commandName === 'status') {
    const statusText = interaction.options.getString('text');
    session.status = statusText;
    onetapSessions.set(currentVC.id, session);
    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("Tap Status Set")
      .setDescription(`Tap status set to: ${statusText}`)
      .setFooter({ text: "Franco's Armada 🔱" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  else if (commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("Available Commands")
      .setDescription("Commands for configuration and one-tap management.")
      .addFields(
        { name: "Global", value: "`/setprefix`, `/setwelcome`, `/showwelcome`, `/jail`, `/jinfo`, `/unban`, `/binfo`, `/topvrf`, `/toponline`" },
        { name: "One-Tap", value: "`/claim`, `/mute`, `/unmute`, `/lock`, `/unlock`, `/limit`, `/reject`, `/perm`, `/hide`, `/unhide`, `/transfer`, `/name`, `/status`" }
      );
    return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  }
});

// ------------------------------
// "Join Help" Button Handler
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("join_help_")) {
    const vcId = interaction.customId.split("_").pop();
    const helpVC = interaction.guild.channels.cache.get(vcId);
    if (!helpVC) return interaction.reply({ content: "Help session expired.", ephemeral: true });
    try {
      // Move the helper or create an invite
      if (interaction.member.voice.channel) {
        await interaction.member.voice.setChannel(helpVC);
        return interaction.reply({ content: "You have joined the help VC.", ephemeral: true });
      } else {
        const invite = await helpVC.createInvite({ maxAge: 300, maxUses: 1 });
        return interaction.reply({ content: `Join help via this link: ${invite.url}`, ephemeral: true });
      }
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to move you to help.", ephemeral: true });
    }
  }
});

// ------------------------------
// VoiceStateUpdate: Verification, One-Tap, NeedHelp
// ------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const config = await settingsCollection.findOne({ serverId: guild.id });
  if (!config) return;

  // VERIFICATION
  if (newState.channelId === config.voiceVerificationChannelId) {
    try {
      const member = newState.member;
      const unverifiedRole = guild.roles.cache.get(config.unverifiedRoleId);
      if (!unverifiedRole) return;
      if (!member.roles.cache.has(unverifiedRole.id)) return;
      // create ephemeral VC with userlimit 2 + attach files permission
      const tempVC = await guild.channels.create({
        name: `Verify – ${member.displayName}`,
        type: 2,
        parent: newState.channel.parentId,
        userLimit: 2,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.AttachFiles // let them attach files in voice chat
            ]
          }
        ]
      });
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });

      const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
      if (alertChannel) {
        const msg = await alertChannel.send("(# Member Jdid Ajew 🙋‍♂️ – Franco's Armada 🔱)");
        setTimeout(() => msg.delete().catch(()=>{}), 10000);
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        const msg2 = await alertChannel.send({ components: [row] });
        setTimeout(() => msg2.delete().catch(()=>{}), 10000);
      }
    } catch(e) {
      console.error("Error in verification creation:", e);
    }
  }
  
  // ONE-TAP
  if (newState.channelId === config.oneTapChannelId) {
    try {
      const member = newState.member;
      // must be verified
      const isVerified = member.roles.cache.has(config.verifiedRoleId) || member.roles.cache.has(config.verifiedGirlRoleId);
      if (!isVerified) return;

      // remove any existing ephemeral VC owned by this user
      const existingEntry = Array.from(onetapSessions.entries()).find(([chId, s]) => s.owner === member.id);
      if (existingEntry) {
        const [oldChId, oldSess] = existingEntry;
        const oldCh = guild.channels.cache.get(oldChId);
        if (oldCh) await oldCh.delete().catch(()=>{});
        onetapSessions.delete(oldChId);
      }

      // create ephemeral VC with attach files permission
      const displayName = member.displayName;
      const overwrites = [];
      if (config.unverifiedRoleId) {
        overwrites.push({ 
          id: config.unverifiedRoleId, 
          deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] 
        });
      }
      overwrites.push({
        id: member.id,
        allow: [
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.AttachFiles
        ]
      });

      const tempVC = await guild.channels.create({
        name: `${displayName}'s Room`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: overwrites
      });
      onetapSessions.set(tempVC.id, { owner: member.id, rejectedUsers: [], status: "" });
      await member.voice.setChannel(tempVC);
    } catch(e) {
      console.error("Error in one-tap creation:", e);
    }
  }

  // NEED HELP
  if (newState.channelId === config.needHelpChannelId) {
    try {
      const member = newState.member;
      // remove old ephemeral if any
      const existing = Array.from(onetapSessions.entries()).find(([chId,s])=> s.owner===member.id && s.status==="need help");
      if (existing) {
        const [oldChId, oldSess] = existing;
        const oldCh = guild.channels.cache.get(oldChId);
        if (oldCh) await oldCh.delete().catch(()=>{});
        onetapSessions.delete(oldChId);
      }
      const overwrites = [];
      if (config.unverifiedRoleId) {
        overwrites.push({
          id: config.unverifiedRoleId,
          deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
        });
      }
      overwrites.push({
        id: member.id,
        allow: [
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.AttachFiles
        ]
      });
      const helpVC = await guild.channels.create({
        name: `${member.displayName} needs help`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: overwrites
      });
      onetapSessions.set(helpVC.id, { owner: member.id, status: "need help" });
      await member.voice.setChannel(helpVC);

      // send ping in needHelpLog if exist
      if (config.helperRoleId && config.needHelpLogChannelId && config.needHelpLogChannelId!=="none") {
        const helperRole = guild.roles.cache.get(config.helperRoleId);
        const helpLogChannel = guild.channels.cache.get(config.needHelpLogChannelId);
        if (helperRole && helpLogChannel) {
          const joinHelpButton = new ButtonBuilder()
            .setCustomId(`join_help_${helpVC.id}`)
            .setLabel("Join Help")
            .setStyle(ButtonStyle.Primary);
          const row = new ActionRowBuilder().addComponents(joinHelpButton);
          const msg = await helpLogChannel.send(`Hey ${helperRole.toString()}, ${member.displayName} needs help!`, { components:[row] });
          setTimeout(()=> msg.delete().catch(()=>{}), 10000);
        }
      }
    } catch(e) {
      console.error("Error in need help creation:", e);
    }
  }

  // ephemeral channel deletion logic
  if (oldState.channel && onetapSessions.has(oldState.channel.id)) {
    const session = onetapSessions.get(oldState.channel.id);
    // if need help, if owner leaves => immediate delete
    if (session.status === "need help" && oldState.member.id===session.owner) {
      oldState.channel.delete().catch(()=>{});
      onetapSessions.delete(oldState.channel.id);
      return;
    }
    // reassign if the owner leaves
    if (oldState.member.id === session.owner) {
      const remain = oldState.channel.members;
      if (remain.size>0) {
        const newOwner = remain.first();
        session.owner = newOwner.id;
        onetapSessions.set(oldState.channel.id, session);
      }
    }
    // if empty => delete
    if (oldState.channel.members.size===0) {
      oldState.channel.delete().catch(()=>{});
      onetapSessions.delete(oldState.channel.id);
    }
  }

  // verification ephemeral
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    // if verifier leaves => move user
    if (oldState.member.id===session.assignedVerificator) {
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        let activeVC = guild.channels.cache
          .filter(ch=> ch.type===2 && ch.id!==oldState.channel.id && ch.members.size>0)
          .first();
        if (!activeVC) activeVC = guild.channels.cache.get(config.voiceVerificationChannelId);
        if (activeVC) await verifiedMember.voice.setChannel(activeVC);
      }
    }
    // if empty => delete
    if (oldState.channel.members.size===0) {
      oldState.channel.delete().catch(()=>{});
      verificationSessions.delete(oldState.channel.id);
    }
  }
});

// ------------------------------
// "Join Verification" Button
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("join_verification_")) return;
  
  const vcId = interaction.customId.split("_").pop();
  const tempVC = interaction.guild.channels.cache.get(vcId);
  if (!tempVC) return interaction.reply({ content: "Verification session expired.", ephemeral: true });
  if (tempVC.members.size >= 2) {
    return interaction.reply({ content: "Verification session is full.", ephemeral: true });
  }
  const member = interaction.member;
  if (member.voice.channel) {
    try {
      await member.voice.setChannel(tempVC);
      let session = verificationSessions.get(tempVC.id);
      if (session && session.assignedVerificator) {
        return interaction.reply({ content: "Another verificator is already in session.", ephemeral: true });
      }
      if (session && !session.assignedVerificator) {
        session.assignedVerificator = member.id;
        verificationSessions.set(tempVC.id, session);
      }
      return interaction.reply({ content: "You have joined the verification VC.", ephemeral: true });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to move you.", ephemeral: true });
    }
  } else {
    // create invite
    try {
      const invite = await tempVC.createInvite({ maxAge:300, maxUses:1 });
      return interaction.reply({ content: `Join with link: ${invite.url}`, ephemeral:true});
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to create invite link.", ephemeral:true });
    }
  }
});

// ------------------------------
// +boy / +girl
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.content.startsWith('+boy') || message.content.startsWith('+girl')) {
    const config = await settingsCollection.findOne({ serverId: message.guild.id });
    if (!config) return message.reply("Bot is not configured for this server.");
    const vc = message.member.voice.channel;
    if (!vc || !verificationSessions.has(vc.id)) {
      return message.reply("You must be in a verification session VC to verify someone.");
    }
    const session = verificationSessions.get(vc.id);
    const memberToVerify = message.guild.members.cache.get(session.userId);
    if (!memberToVerify) return message.reply("No unverified user found in this session.");
    try {
      if (config.unverifiedRoleId) await memberToVerify.roles.remove(config.unverifiedRoleId);
      let embed;
      if (message.content.startsWith('+boy')) {
        if (config.verifiedRoleId) await memberToVerify.roles.add(config.verifiedRoleId);
        embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle("Verification Successful!")
          .setDescription(`${memberToVerify} has been verified as a **Boy**. Welcome aboard!`)
          .setFooter({ text: "Franco's Armada 🔱" });
      } else {
        if (config.verifiedGirlRoleId) await memberToVerify.roles.add(config.verifiedGirlRoleId);
        embed = new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle("Verification Successful!")
          .setDescription(`${memberToVerify} has been verified as a **Girl**. Welcome aboard!`)
          .setFooter({ text: "Franco's Armada 🔱" });
      }
      message.channel.send({ embeds: [embed] });
    } catch(e) {
      console.error(e);
      message.reply("Verification failed. Check my permissions or role hierarchy.");
    }
  }
});

// ------------------------------
// "R" Command (Single Handler)
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  if ((content === 'r' || content.startsWith('r ')) && content !== 'ready') {
    let targetUser = message.mentions.users.first() || message.author;
    try {
      targetUser = await targetUser.fetch();
    } catch(e) {
      console.error(e);
      return message.reply("Error fetching user data.");
    }
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`${targetUser.username}'s Profile Picture`)
      .setDescription("Click a button below to view Avatar or Banner.")
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }));
    const avatarBtn = new ButtonBuilder().setCustomId(`avatar_${targetUser.id}`).setLabel("Avatar").setStyle(ButtonStyle.Primary);
    const bannerBtn = new ButtonBuilder().setCustomId(`banner_${targetUser.id}`).setLabel("Banner").setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder().addComponents(avatarBtn, bannerBtn);
    message.channel.send({ embeds: [embed], components: [row] });
  }
});

// ------------------------------
// Interaction Handler for R Buttons
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("lang_") ||
      interaction.customId.startsWith("join_verification_") ||
      interaction.customId.startsWith("join_help_")) {
    return;
  }
  // handle R's avatar/banner
  const [action, userId] = interaction.customId.split('_');
  if (!userId) return;
  try {
    const targetUser = await client.users.fetch(userId, { force: true });
    if (action === 'avatar') {
      const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size:1024 });
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`${targetUser.username}'s Avatar`)
        .setImage(avatarURL);
      return interaction.update({ embeds: [embed], components: [] });
    } else if (action === 'banner') {
      const bannerURL = targetUser.bannerURL({ dynamic:true, size:1024 });
      if (!bannerURL) {
        return interaction.reply({ content: "No banner set.", ephemeral:true });
      }
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`${targetUser.username}'s Banner`)
        .setImage(bannerURL);
      return interaction.update({ embeds: [embed], components: [] });
    }
  } catch(e) {
    console.error(e);
    return interaction.reply({ content: "Error fetching user data.", ephemeral:true });
  }
});

// ------------------------------
// "Ready" Handler for Setup
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.channel.name !== 'bot-setup') return;
  let owner;
  try {
    owner = await message.guild.fetchOwner();
  } catch(e) {
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
      setTimeout(() => {
        message.channel.delete().catch(()=>{});
      }, 5000);
    } catch(err) {
      console.error("Setup error:", err);
    }
  }
});

// ------------------------------
// On Guild Join
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
    setupChannel.send(`<@${owner.id}>, welcome to Franco's Armada! Let's set up your bot configuration.`);
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Use slash commands like /setprefix, /setwelcome, etc.',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
  } catch(e) {
    console.error("Setup channel error:", e);
  }
});

// ------------------------------
// GuildMemberAdd: auto-assign unverified role
// ------------------------------
client.on(Events.GuildMemberAdd, async member => {
  try {
    const config = await settingsCollection.findOne({ serverId: member.guild.id });
    if (!config) return;
    if (config.unverifiedRoleId) {
      const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRoleId);
      if (unverifiedRole) {
        await member.roles.add(unverifiedRole);
      }
    }
  } catch(e) {
    console.error(e);
  }
});

// ------------------------------
// Client Login
// ------------------------------
client.login(process.env.DISCORD_TOKEN);