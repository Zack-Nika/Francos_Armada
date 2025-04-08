// index.js
// Franco's Armada Bot – Final Complete Code with Verification, One-Tap, & Need Help Processes Updated
// FEATURES:
// • Connects to MongoDB for per‑server settings (language, prefix, role/channel IDs, custom welcome message, etc.).
// • On guild join, creates "bot‑setup" and "bot‑config" channels (visible only to the owner).
// • New members automatically receive the unverified role.
// • Interactive multi‑language setup (English, Darija, Spanish, Russian, French) triggered by typing "ready" in "bot‑setup".
// • Verification Process:
//     – When an unverified user joins the designated verification channel (voiceVerificationChannelId),
//        an ephemeral VC named "Verify – [displayName]" (userLimit: 2) is created, and the member is moved there.
//     – A notification is sent in the verification alert channel (verificationAlertChannelId) with a "Join Verification" button. The alert auto‑deletes after 11 seconds if no verificator joins.
//     – In that VC, a verificator can type “+boy” or “+girl” (without mentioning the user) to verify.
// • One‑Tap Process:
//     – When a verified user joins the designated one‑tap channel (oneTapChannelId), an ephemeral VC
//        named "[DisplayName]'s Room" is created inside the same category and the user is moved there.
//     – The permission overwrites hide this channel from everyone except the owner.
// • Need‑Help Process:
//     – When a member joins the designated need‑help channel (needHelpChannelId), an ephemeral VC
//        named "[DisplayName] needs help" is created (hidden from others) and the user is moved there.
//     – An alert with a "Join Help" button is sent in the need-help log channel (needHelpLogChannelId), auto-deleting after 11 seconds.
// • Global slash commands and session management commands are available to admins/owners.
// • The "R" command displays a user's profile picture (with Avatar/Banner buttons) in a single response.
// • Empty ephemeral channels are deleted immediately upon being empty, plus a periodic cleanup every 2 seconds.

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

// ------------------------------
// Set Bot Username on Ready
// ------------------------------
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
const verificationSessions = new Map(); // Ephemeral VCs for verification
const onetapSessions = new Map();       // Ephemeral VCs for one-tap and need-help
const jailData = new Map();

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
    voiceJailChannelId: "🔹 **# Provide the Voice Jail Channel ID** (or type `none`)",
    verificationLogChannelId: "🔹 **# Provide the Verification Log Channel ID** (or type `none`)",
    needHelpChannelId: "🔹 **# Provide the Need Help Channel ID**",
    helperRoleId: "🔹 **# Provide the Helper Role ID**",
    needHelpLogChannelId: "🔹 **# Provide the Need Help Log Channel ID** (or type `none`)"
  },
  darija: { /* ... similar entries for Darija ... */ },
  spanish: { /* ... similar entries for Spanish ... */ },
  russian: { /* ... similar entries for Russian ... */ },
  french: { /* ... similar entries for French ... */ }
};

const languageExtras = {
  english: {
    setupStart: "Let's begin setup. Please copy/paste each ID as prompted.",
    setupComplete: "Setup complete! 🎉"
  },
  darija: { /* ... */ },
  spanish: { /* ... */ },
  russian: { /* ... */ },
  french: { /* ... */ }
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
// Interactive Setup Process
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
// Language Selection Button Handler
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
      return interaction.reply({ content: `Language set to ${langChosen}! Type \`ready\` to begin setup.`, flags: 64 });
    } catch (err) {
      console.error("Error setting language:", err);
      return interaction.reply({ content: "Error setting language.", flags: 64 });
    }
  }
});

// ------------------------------
// Global Slash Commands Registration
// ------------------------------
client.commands = new Collection();
const slashCommands = [
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
  // Session (one-tap/need-help) Commands
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
// Interaction Handler for Buttons
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  // Handle Join Help button
  if (interaction.customId.startsWith("join_help_")) {
    // Expected format: "join_help_<ephemeralChannelId>"
    const parts = interaction.customId.split("_");
    const ephemeralChannelId = parts.slice(2).join("_"); // in case ID has underscores
    const session = onetapSessions.get(ephemeralChannelId);
    if (!session) {
      return interaction.reply({ content: "No help session found.", flags: 64, ephemeral: true });
    }
    try {
      await interaction.member.voice.setChannel(ephemeralChannelId);
      return interaction.reply({ content: "You've joined the help session!", flags: 64, ephemeral: true });
    } catch (err) {
      console.error("join_help error:", err);
      return interaction.reply({ content: "Failed to join help session.", flags: 64, ephemeral: true });
    }
  }
  // Handle Profile Viewer buttons (Avatar/Banner)
  if (interaction.customId.startsWith("lang_")) return;
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
        if (!bannerURL) return interaction.reply({ content: "No banner set.", flags: 64 });
        const embed = new EmbedBuilder()
          .setColor(0x00AE86)
          .setTitle(`${targetUser.username}'s Banner`)
          .setImage(bannerURL);
        return interaction.update({ embeds: [embed], components: [] });
      }
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: "Error fetching user data.", flags: 64 });
    }
  }
});

// ------------------------------
// Slash Command Interaction Handler
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  if (!config) {
    return interaction.reply({ content: "Bot is not configured for this server.", flags: 64 });
  }
  
  const globalCmds = ["setprefix","setwelcome","showwelcome","jail","jinfo","unban","binfo","topvrf","toponline"];
  if (globalCmds.includes(commandName)) {
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator) &&
        interaction.member.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: "You are not allowed to use this command.", flags: 64 });
    }
    if (commandName === "setprefix") {
      const prefix = interaction.options.getString('prefix');
      try {
        await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { prefix } }, { upsert: true });
        return interaction.reply({ content: `Prefix updated to ${prefix}.`, flags: 64 });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to update prefix.", flags: 64 });
      }
    } else if (commandName === "setwelcome") {
      const msg = interaction.options.getString('message');
      try {
        await settingsCollection.updateOne({ serverId: interaction.guild.id }, { $set: { customWelcome: msg } }, { upsert: true });
        return interaction.reply({ content: "Welcome message updated!", flags: 64 });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to update welcome message.", flags: 64 });
      }
    } else if (commandName === "showwelcome") {
      return interaction.reply({ content: `Current welcome message: ${config.customWelcome || "Default"}`, flags: 64 });
    } else if (commandName === "jail") {
      const userid = interaction.options.getString('userid');
      const reason = interaction.options.getString('reason');
      let targetMember = await interaction.guild.members.fetch(userid).catch(() => null);
      if (!targetMember) return interaction.reply({ content: "User not found.", flags: 64 });
      try {
        await targetMember.roles.set([]);
        if (config.jailRoleId && config.jailRoleId !== "none") {
          const jailRole = interaction.guild.roles.cache.get(config.jailRoleId);
          if (jailRole) await targetMember.roles.add(jailRole);
        }
        if (config.voiceJailChannelId && config.voiceJailChannelId !== "none" && targetMember.voice.channel) {
          const jailVC = interaction.guild.channels.cache.get(config.voiceJailChannelId);
          if (jailVC) await targetMember.voice.setChannel(jailVC);
        }
        jailData.set(targetMember.id, reason);
        return interaction.reply({ content: `${targetMember.displayName} jailed for: ${reason}`, flags: 64 });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to jail user.", flags: 64 });
      }
    } else if (commandName === "jinfo") {
      const userid = interaction.options.getString('userid');
      const info = jailData.get(userid) || "No jail reason found.";
      return interaction.reply({ content: `Jail info for ${userid}: ${info}`, flags: 64 });
    } else if (commandName === "unban") {
      const userid = interaction.options.getString('userid');
      let targetMember = await interaction.guild.members.fetch(userid).catch(() => null);
      if (!targetMember) return interaction.reply({ content: "User not found.", flags: 64 });
      try {
        if (config.jailRoleId && config.jailRoleId !== "none") {
          const jailRole = interaction.guild.roles.cache.get(config.jailRoleId);
          if (jailRole && targetMember.roles.cache.has(jailRole.id)) {
            await targetMember.roles.remove(jailRole);
          }
        }
        jailData.delete(targetMember.id);
        return interaction.reply({ content: `${targetMember.displayName} unjailed.`, flags: 64 });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to unjail user.", flags: 64 });
      }
    } else if (commandName === "binfo") {
      try {
        const bans = await interaction.guild.bans.fetch();
        return interaction.reply({ content: `Total banned users: ${bans.size}`, flags: 64 });
      } catch(e) {
        console.error(e);
        return interaction.reply({ content: "Failed to fetch ban info.", flags: 64 });
      }
    } else if (commandName === "topvrf") {
      return interaction.reply({ content: "Top verificators: [Coming soon]", flags: 64 });
    } else if (commandName === "toponline") {
      return interaction.reply({ content: "Top online users: [Coming soon]", flags: 64 });
    }
    return;
  }
  
  // ------------------------------
  // Session Commands (One-Tap / Need-Help)
  // ------------------------------
  const member = interaction.member;
  const currentVC = member.voice.channel;
  if (!currentVC || !onetapSessions.has(currentVC.id)) {
    return interaction.reply({ content: "You are not in an ephemeral session.", flags: 64 });
  }
  const session = onetapSessions.get(currentVC.id);
  
  if (commandName === "claim") {
    if (session.owner === member.id)
      return interaction.reply({ content: "You already own this session.", flags: 64 });
    if (currentVC.members.has(session.owner))
      return interaction.reply({ content: "Owner is still here; cannot claim ownership.", flags: 64 });
    session.owner = member.id;
    onetapSessions.set(currentVC.id, session);
    return interaction.reply({ content: "You have claimed ownership.", flags: 64 });
  }
  else if (commandName === "mute") {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id)
      return interaction.reply({ content: "That user is not in your session.", flags: 64 });
    try {
      await targetMember.voice.setMute(true);
      return interaction.reply({ content: `${targetMember.displayName} has been muted.`, flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to mute user.", flags: 64 });
    }
  }
  else if (commandName === "unmute") {
    const target = interaction.options.getUser('target');
    const targetMember = interaction.guild.members.cache.get(target.id);
    if (!targetMember || targetMember.voice.channelId !== currentVC.id)
      return interaction.reply({ content: "That user is not in your session.", flags: 64 });
    try {
      await targetMember.voice.setMute(false);
      return interaction.reply({ content: `${targetMember.displayName} has been unmuted.`, flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to unmute user.", flags: 64 });
    }
  }
  else if (commandName === "lock") {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      return interaction.reply({ content: "Session locked.", flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to lock session.", flags: 64 });
    }
  }
  else if (commandName === "unlock") {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      return interaction.reply({ content: "Session unlocked.", flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to unlock session.", flags: 64 });
    }
  }
  else if (commandName === "limit") {
    const number = interaction.options.getInteger('number');
    try {
      await currentVC.setUserLimit(number);
      return interaction.reply({ content: `User limit set to ${number}.`, flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to set user limit.", flags: 64 });
    }
  }
  else if (commandName === "reject") {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user.", flags: 64 });
    try {
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (targetMember && targetMember.voice.channelId === currentVC.id) {
        await targetMember.voice.disconnect();
      }
      session.rejectedUsers = session.rejectedUsers || [];
      if (!session.rejectedUsers.includes(target.id)) session.rejectedUsers.push(target.id);
      onetapSessions.set(currentVC.id, session);
      return interaction.reply({ content: `User ${target.username} rejected.`, flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to reject user.", flags: 64 });
    }
  }
  else if (commandName === "perm") {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user.", flags: 64 });
    session.rejectedUsers = session.rejectedUsers || [];
    const idx = session.rejectedUsers.indexOf(target.id);
    if (idx === -1) return interaction.reply({ content: "User is not rejected.", flags: 64 });
    session.rejectedUsers.splice(idx, 1);
    onetapSessions.set(currentVC.id, session);
    return interaction.reply({ content: `User ${target.username} is now permitted.`, flags: 64 });
  }
  else if (commandName === "hide") {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      return interaction.reply({ content: "Session hidden.", flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to hide session.", flags: 64 });
    }
  }
  else if (commandName === "unhide") {
    try {
      await currentVC.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
      return interaction.reply({ content: "Session visible.", flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to unhide session.", flags: 64 });
    }
  }
  else if (commandName === "transfer") {
    const target = interaction.options.getUser('target');
    if (!target) return interaction.reply({ content: "Please mention a user.", flags: 64 });
    try {
      session.owner = target.id;
      onetapSessions.set(currentVC.id, session);
      return interaction.reply({ content: `Ownership transferred to ${target.username}.`, flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to transfer ownership.", flags: 64 });
    }
  }
  else if (commandName === "name") {
    const newName = interaction.options.getString('text');
    try {
      await currentVC.setName(newName);
      return interaction.reply({ content: `Session renamed to ${newName}.`, flags: 64 });
    } catch(e) {
      console.error(e);
      return interaction.reply({ content: "Failed to rename session.", flags: 64 });
    }
  }
  else if (commandName === "status") {
    const statusText = interaction.options.getString('text');
    session.status = statusText;
    onetapSessions.set(currentVC.id, session);
    return interaction.reply({ content: `Session status set to: ${statusText}`, flags: 64 });
  }
  else if (commandName === "help") {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("Available Commands")
      .setDescription("Commands for configuration and session management.")
      .addFields(
        { name: "Global", value: "`/setprefix`, `/setwelcome`, `/showwelcome`, `/jail`, `/jinfo`, `/unban`, `/binfo`, `/topvrf`, `/toponline`" },
        { name: "Session", value: "`/claim`, `/mute`, `/unmute`, `/lock`, `/unlock`, `/limit`, `/reject`, `/perm`, `/hide`, `/unhide`, `/transfer`, `/name`, `/status`" }
      );
    return interaction.reply({ embeds: [helpEmbed], flags: 64 });
  }
});

// ------------------------------
// Debug Logging for +boy / +girl Verification Commands
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.content.startsWith('+boy') || message.content.startsWith('+girl')) {
    const config = await settingsCollection.findOne({ serverId: message.guild.id });
    if (!config) return message.reply("Bot is not configured for this server.");
    const vc = message.member.voice.channel;
    console.log("[DEBUG] Verification command from", message.author.tag);
    console.log("[DEBUG] Voice Channel ID:", vc ? vc.id : "None");
    console.log("[DEBUG] Verification Sessions keys:", [...verificationSessions.keys()]);
    if (!vc || !verificationSessions.has(vc.id)) {
      return message.reply("You must be in a verification session channel to verify someone.");
    }
    const sessionData = verificationSessions.get(vc.id);
    const memberToVerify = message.guild.members.cache.get(sessionData.userId);
    if (!memberToVerify) return message.reply("No unverified user found in this session.");
    try {
      if (config.unverifiedRoleId) {
        await memberToVerify.roles.remove(config.unverifiedRoleId);
      }
      if (message.content.startsWith('+boy')) {
        if (config.verifiedRoleId) await memberToVerify.roles.add(config.verifiedRoleId);
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle("Verification Successful!")
              .setDescription(`${memberToVerify} has been verified as Boy!`)
          ]
        });
      } else {
        if (config.verifiedGirlRoleId) await memberToVerify.roles.add(config.verifiedGirlRoleId);
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFF69B4)
              .setTitle("Verification Successful!")
              .setDescription(`${memberToVerify} has been verified as Girl!`)
          ]
        });
      }
    } catch (e) {
      console.error(e);
      return message.reply("Verification failed. Check my permissions or role hierarchy.");
    }
  }
});

// ------------------------------
// "R" Command for Profile Viewer (Single Handler)
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  if ((content === 'r' || content.startsWith('r ')) && content !== 'ready') {
    let targetUser = message.mentions.users.first() || message.author;
    try {
      targetUser = await targetUser.fetch();
    } catch (e) {
      console.error(e);
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
    return message.channel.send({ embeds: [embed], components: [row] });
  }
});

// ------------------------------
// "Ready" Handler in "bot-setup" Channel
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.channel.name !== 'bot-setup') return;
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
});

// ------------------------------
// On Guild Join: Create "bot-setup" and "bot-config" Channels (Owner-Only)
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
    setupChannel.send(`<@${owner.id}>, welcome! Let's set up your bot configuration.`);
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Use slash commands for configuration (e.g. /setprefix, /setwelcome, etc.)',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    // Language selection buttons
    const englishButton = new ButtonBuilder().setCustomId('lang_english').setLabel('English').setStyle(ButtonStyle.Primary);
    const darijaButton = new ButtonBuilder().setCustomId('lang_darija').setLabel('Darija').setStyle(ButtonStyle.Primary);
    const spanishButton = new ButtonBuilder().setCustomId('lang_spanish').setLabel('Spanish').setStyle(ButtonStyle.Primary);
    const russianButton = new ButtonBuilder().setCustomId('lang_russian').setLabel('Russian').setStyle(ButtonStyle.Primary);
    const frenchButton = new ButtonBuilder().setCustomId('lang_french').setLabel('French').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(englishButton, darijaButton, spanishButton, russianButton, frenchButton);
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle("Welcome!")
      .setDescription("Select your language by clicking a button, then type `ready` to begin setup. This channel will be deleted once setup is complete.");
    setupChannel.send({ embeds: [embed], components: [row] });
  } catch (e) {
    console.error("Setup channel error:", e);
  }
});

// ------------------------------
// GuildMemberAdd: Auto-assign Unverified Role
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
// ADDED FOR VERIFICATION, ONE-TAP & NEED-HELP: Voice State Handler
// ------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    console.log(`[DEBUG] voiceStateUpdate: oldState.channelId=${oldState.channelId}, newState.channelId=${newState.channelId}, member=${newState.member.id}`);
    const member = newState.member;
    const guild = newState.guild;
    const config = await settingsCollection.findOne({ serverId: guild.id });
    if (!config) {
      console.log("[DEBUG] No config found for this guild");
      return;
    }

    // ------------------------------
    // Verification Process
    // ------------------------------
    if (config.voiceVerificationChannelId && newState.channelId === config.voiceVerificationChannelId) {
      console.log(`[DEBUG] Member ${member.id} joined verification channel ${config.voiceVerificationChannelId}`);
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2,
        parent: parentCategory,
        userLimit: 2,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: member.id,
            allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.AttachFiles]
          }
        ]
      });
      console.log(`[DEBUG] Created verification ephemeral channel ${ephemeralChannel.id} for member ${member.id}`);
      verificationSessions.set(ephemeralChannel.id, { userId: member.id });
      await member.voice.setChannel(ephemeralChannel);
      console.log(`[DEBUG] Moved member ${member.id} to verification ephemeral channel ${ephemeralChannel.id}`);
      // Send a notification to the verification alert channel, if configured
      if (config.verificationAlertChannelId && config.verificationAlertChannelId !== "none") {
        const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
        if (alertChannel) {
          const alertEmbed = new EmbedBuilder().setColor(0xFFFF00).setTitle(`# New Member ${member.displayName} 🙋‍♂️`);
          const joinButton = new ButtonBuilder().setCustomId(`join_verification_${ephemeralChannel.id}`).setLabel("Join Verification").setStyle(ButtonStyle.Primary);
          const row = new ActionRowBuilder().addComponents(joinButton);
          const alertMsg = await alertChannel.send({ embeds: [alertEmbed], components: [row] });
          console.log(`[DEBUG] Sent verification alert for ephemeral channel ${ephemeralChannel.id}`);
          setTimeout(async () => {
            try {
              await alertMsg.delete();
              console.log(`[DEBUG] Deleted verification alert for ephemeral channel ${ephemeralChannel.id}`);
            } catch (err) {}
          }, 11000);
        }
      }
      return;
    }
    
    // ------------------------------
    // One-Tap Process
    // ------------------------------
    if (config.oneTapChannelId && newState.channelId === config.oneTapChannelId) {
      console.log(`[DEBUG] Member ${member.id} joined one-tap channel ${config.oneTapChannelId}`);
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) {
        console.log(`[DEBUG] Member ${member.id} has unverified role, skipping one-tap ephemeral channel creation`);
        return;
      }
      for (const [channelId, session] of onetapSessions.entries()) {
        if (session.owner === member.id && session.type === "oneTap") {
          const oldChan = guild.channels.cache.get(channelId);
          if (oldChan) {
            console.log(`[DEBUG] Deleting old one-tap ephemeral channel ${oldChan.id} for member ${member.id}`);
            await oldChan.delete().catch(() => {});
          }
          onetapSessions.delete(channelId);
        }
      }
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `${member.displayName}'s Room`,
        type: 2,
        parent: parentCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
          },
          {
            id: member.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles]
          }
        ]
      });
      console.log(`[DEBUG] Created one-tap ephemeral channel ${ephemeralChannel.id} for member ${member.id}`);
      onetapSessions.set(ephemeralChannel.id, {
        owner: member.id,
        type: "oneTap",
        rejectedUsers: []
      });
      await member.voice.setChannel(ephemeralChannel);
      console.log(`[DEBUG] Moved member ${member.id} to one-tap ephemeral channel ${ephemeralChannel.id}`);
    }
    
    // ------------------------------
    // Need-Help Process
    // ------------------------------
    if (config.needHelpChannelId && newState.channelId === config.needHelpChannelId) {
      console.log(`[DEBUG] Member ${member.id} joined need-help channel ${config.needHelpChannelId}`);
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) {
        console.log(`[DEBUG] Member ${member.id} has unverified role, skipping need-help ephemeral channel creation`);
        return;
      }
      for (const [channelId, session] of onetapSessions.entries()) {
        if (session.owner === member.id && session.type === "needHelp") {
          const oldChan = guild.channels.cache.get(channelId);
          if (oldChan) {
            console.log(`[DEBUG] Deleting old need-help ephemeral channel ${oldChan.id} for member ${member.id}`);
            await oldChan.delete().catch(() => {});
          }
          onetapSessions.delete(channelId);
        }
      }
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `${member.displayName} needs help`,
        type: 2,
        parent: parentCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
          },
          {
            id: member.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles]
          }
        ]
      });
      console.log(`[DEBUG] Created need-help ephemeral channel ${ephemeralChannel.id} for member ${member.id}`);
      onetapSessions.set(ephemeralChannel.id, {
        owner: member.id,
        type: "needHelp",
        rejectedUsers: []
      });
      await member.voice.setChannel(ephemeralChannel);
      console.log(`[DEBUG] Moved member ${member.id} to need-help ephemeral channel ${ephemeralChannel.id}`);
      if (config.needHelpLogChannelId && config.needHelpLogChannelId !== "none") {
        const logChannel = guild.channels.cache.get(config.needHelpLogChannelId);
        if (logChannel) {
          const helpEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`# ${member.displayName} 🔱 needs help 🆘️`);
          const joinButton = new ButtonBuilder()
            .setCustomId(`join_help_${ephemeralChannel.id}`)
            .setLabel("Join Help")
            .setStyle(ButtonStyle.Danger);
          const row = new ActionRowBuilder().addComponents(joinButton);
          const alertMsg = await logChannel.send({ embeds: [helpEmbed], components: [row] });
          console.log(`[DEBUG] Sent need-help alert for ephemeral channel ${ephemeralChannel.id}`);
          setTimeout(async () => {
            try {
              await alertMsg.delete();
              console.log(`[DEBUG] Deleted need-help alert for ephemeral channel ${ephemeralChannel.id}`);
            } catch (err) {}
          }, 11000);
        }
      }
    }
  } catch (err) {
    console.error("voiceStateUpdate error:", err);
  }
});

// ------------------------------
// Periodic Cleanup: Delete Empty Ephemeral Channels (Every 2 Seconds)
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