// index.js
// MBC Super Bot using Discord.js v14
// This bot supports:
// 1. Verification system: new members get an "Unverified" role and DM welcome message.
//    When a user joins the permanent verification voice channel, a private temp VC is created.
//    A notification with a "Join Verification" button is sent to a designated alert channel.
//    A verificator clicks the button and then uses +boy or +girl in the VC to verify the user.
// 2. Public 1-Tap system: When a user joins a "Create Voice" channel, a private VC is created.
//    This VC supports commands: /kick, /reject, /perm, /claim, /lock, /unlock, /limit, /name, /status.
// 3. Jail system: Prefix commands +jail and +unjail to manage jailed users (with /jinfo and /jailed).
// 4. Ban tools and stats: /unban, /binfo, /topvrf, /toponline.
// 5. Smart /help command: shows commands based on user roles.
// 
// IMPORTANT: Ensure your .env file contains these variables:
// DISCORD_TOKEN, GUILD_ID, CLIENT_ID, ADMIN_ROLE, ROLE_UNVERIFIED, ROLE_VERIFIED_BOY,
// ROLE_VERIFIED_GIRL, ROLE_VERIFICATOR, ROLE_LEADER_VERIFICATOR, ROLE_JAILED, 
// VOICE_VERIFICATION, VOICE_JAIL, CHANNEL_VERIFICATION_ALERT, VOICE_ONETAP

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

// Create a new client instance with necessary intents.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel],
});

// In-memory storage for session data.
const verificationSessions = new Map(); // key: temp VC id; value: { userId, assignedVerificator, rejected }
const onetapSessions = new Map();       // key: temp VC id; value: owner userId
const jailData = new Map();             // key: user id; value: jail reason

// -----------------------
// SLASH COMMANDS SETUP
// -----------------------
client.commands = new Collection();

const commands = [
  // 1-Tap VC commands
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user from your private VC')
    .addUserOption(option => option.setName('target').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder().setName('reject').setDescription('Mark a verification session as rejected'),
  new SlashCommandBuilder().setName('perm').setDescription('Allow a rejected user to join again'),
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your private VC'),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your private VC'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your private VC'),
  new SlashCommandBuilder().setName('limit').setDescription('Set a user limit for your VC')
    .addIntegerOption(option => option.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your VC')
    .addStringOption(option => option.setName('text').setDescription('New name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your VC')
    .addStringOption(option => option.setName('text').setDescription('Status text').setRequired(true)),

  // Ban tools
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID to unban').setRequired(true)),
  new SlashCommandBuilder().setName('binfo').setDescription('Show total bans'),

  // Jail commands
  new SlashCommandBuilder().setName('jinfo').setDescription('Show jail reason for a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID').setRequired(true)),
  new SlashCommandBuilder().setName('jailed').setDescription('Show how many users are jailed'),

  // Stats commands
  new SlashCommandBuilder().setName('topvrf').setDescription('Show top verificators'),
  new SlashCommandBuilder().setName('toponline').setDescription('Show most online users'),

  // Smart help command
  new SlashCommandBuilder().setName('help').setDescription('Show available commands for you'),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands.map(command => command.toJSON()) },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// -----------------------
// CLIENT READY EVENT
// -----------------------
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// -----------------------
// GUILD MEMBER ADD EVENT
// -----------------------
// Assign new members the Unverified role and send them a DM.
client.on(Events.GuildMemberAdd, async member => {
  try {
    const unverifiedRole = member.guild.roles.cache.get(process.env.ROLE_UNVERIFIED);
    if (unverifiedRole) await member.roles.add(unverifiedRole);
    await member.send("Merhba Bik Fi A7sen Server Fl Maghrib! Daba ayji 3ndk Verificator bash yverifik 😊");
  } catch (err) {
    console.error('Error on GuildMemberAdd:', err);
  }
});

// -----------------------
// VOICE STATE UPDATE EVENT
// -----------------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;

  // ---- Verification System ----
  // When a user joins the permanent Verification VC (using VOICE_VERIFICATION ID)
  if (newState.channelId === process.env.VOICE_VERIFICATION) {
    try {
      const member = newState.member;
      // Create a temporary voice channel for verification: "Verify - Username"
      const tempVC = await guild.channels.create({
        name: `Verify - ${member.user.username}`,
        type: 2, // Voice channel type
        parent: newState.channel.parentId,
        permissionOverwrites: [] // Adjust permissions if needed
      });
      console.log(`Created temp VC ${tempVC.name} for ${member.user.username}`);
      // Move the member to the new temp VC.
      await member.voice.setChannel(tempVC);
      // Store the session data.
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      
      // Send a notification in the alert channel with a "Join Verification" button.
      const alertChannel = guild.channels.cache.get(process.env.CHANNEL_VERIFICATION_ALERT);
      if (alertChannel) {
        console.log(`Sending verification alert in ${alertChannel.name}`);
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        const alertMsg = await alertChannel.send({
          content: `<@&${process.env.ROLE_VERIFICATOR}> Verification needed for <@${member.id}>.`,
          components: [row]
        });
        // Auto-delete alert after 10 seconds.
        setTimeout(() => {
          alertMsg.delete().catch(() => {});
        }, 10000);
      } else {
        console.error("Alert channel not found. Check CHANNEL_VERIFICATION_ALERT in .env");
      }
    } catch (err) {
      console.error("Error creating verification VC:", err);
    }
  }

  // ---- Public 1-Tap System ----
  // When a user joins the "Create Voice" channel (using VOICE_ONETAP ID)
  if (newState.channelId === process.env.VOICE_ONETAP) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `🎧 ${member.user.username}`,
        type: 2, // Voice channel
        parent: newState.channel.parentId,
        permissionOverwrites: [] // Customize as needed
      });
      console.log(`Created one-tap VC ${tempVC.name} for ${member.user.username}`);
      // Store owner info for the one-tap session.
      onetapSessions.set(tempVC.id, member.id);
      await member.voice.setChannel(tempVC);
    } catch (err) {
      console.error("Error creating 1-Tap VC:", err);
    }
  }

  // ---- Auto-delete Empty Temp VCs ----
  // If a temporary VC becomes empty, delete it and clear session data.
  if (oldState.channel && oldState.channel.members.size === 0) {
    const channelId = oldState.channel.id;
    if (verificationSessions.has(channelId) || onetapSessions.has(channelId)) {
      console.log(`Deleting empty temp VC: ${oldState.channel.name}`);
      oldState.channel.delete().catch(() => {});
      verificationSessions.delete(channelId);
      onetapSessions.delete(channelId);
    }
  }
});

// -----------------------
// INTERACTION HANDLER
// -----------------------
client.on(Events.InteractionCreate, async interaction => {
  // ---- Button Interactions ----
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("join_verification_")) {
      const vcId = interaction.customId.split("_").pop();
      const session = verificationSessions.get(vcId);
      if (!session) {
        return interaction.reply({ content: "This verification session has expired.", ephemeral: true });
      }
      // Only one verificator per session (unless user has leader override).
      if (session.assignedVerificator && session.assignedVerificator !== interaction.user.id) {
        const member = interaction.guild.members.cache.get(interaction.user.id);
        if (!member.roles.cache.has(process.env.ROLE_LEADER_VERIFICATOR)) {
          return interaction.reply({ content: "This session has already been claimed.", ephemeral: true });
        }
      }
      session.assignedVerificator = interaction.user.id;
      verificationSessions.set(vcId, session);
      const verifMember = interaction.guild.members.cache.get(interaction.user.id);
      if (verifMember.voice.channelId !== vcId) {
        await verifMember.voice.setChannel(vcId);
      }
      return interaction.reply({ content: "You've joined the verification room.", ephemeral: true });
    }
  }
  // ---- Slash Command Interactions ----
  else if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const memberVC = interaction.member.voice.channel;
    
    if (commandName === "kick") {
      if (!memberVC || !onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in your private voice channel.", ephemeral: true });
      }
      const target = interaction.options.getUser('target');
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (targetMember && targetMember.voice.channelId === memberVC.id) {
        await targetMember.voice.disconnect();
        return interaction.reply({ content: `${targetMember.user.username} has been kicked from your channel.` });
      } else {
        return interaction.reply({ content: "User not found in your channel.", ephemeral: true });
      }
    }
    else if (commandName === "reject") {
      if (!memberVC || !verificationSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a verification room.", ephemeral: true });
      }
      let session = verificationSessions.get(memberVC.id);
      session.rejected = true;
      verificationSessions.set(memberVC.id, session);
      return interaction.reply({ content: "User has been rejected." });
    }
    else if (commandName === "perm") {
      if (!memberVC || !verificationSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a verification room.", ephemeral: true });
      }
      let session = verificationSessions.get(memberVC.id);
      session.rejected = false;
      verificationSessions.set(memberVC.id, session);
      return interaction.reply({ content: "User is now permitted to join." });
    }
    else if (commandName === "claim") {
      if (!memberVC || !onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a private voice channel.", ephemeral: true });
      }
      onetapSessions.set(memberVC.id, interaction.user.id);
      return interaction.reply({ content: "You have claimed ownership of this voice channel." });
    }
    else if (commandName === "lock") {
      if (!memberVC || !onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a private voice channel.", ephemeral: true });
      }
      await memberVC.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      return interaction.reply({ content: "Voice channel locked." });
    }
    else if (commandName === "unlock") {
      if (!memberVC || !onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a private voice channel.", ephemeral: true });
      }
      await memberVC.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      return interaction.reply({ content: "Voice channel unlocked." });
    }
    else if (commandName === "limit") {
      if (!memberVC || !onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a private voice channel.", ephemeral: true });
      }
      const limit = interaction.options.getInteger('number');
      await memberVC.setUserLimit(limit);
      return interaction.reply({ content: `Voice channel user limit set to ${limit}.` });
    }
    else if (commandName === "name") {
      if (!memberVC || !onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a private voice channel.", ephemeral: true });
      }
      const newName = interaction.options.getString('text');
      await memberVC.setName(newName);
      return interaction.reply({ content: `Voice channel renamed to ${newName}.` });
    }
    else if (commandName === "status") {
      const status = interaction.options.getString('text');
      // For now, simply acknowledge the status change.
      return interaction.reply({ content: `Status updated to: ${status}` });
    }
    else if (commandName === "unban") {
      const userId = interaction.options.getString('userid');
      try {
        await interaction.guild.members.unban(userId);
        return interaction.reply({ content: `User ${userId} has been unbanned.` });
      } catch (err) {
        return interaction.reply({ content: "Failed to unban user.", ephemeral: true });
      }
    }
    else if (commandName === "binfo") {
      try {
        const bans = await interaction.guild.bans.fetch();
        return interaction.reply({ content: `Total bans: ${bans.size}` });
      } catch (err) {
        return interaction.reply({ content: "Failed to fetch bans.", ephemeral: true });
      }
    }
    else if (commandName === "jinfo") {
      const userId = interaction.options.getString('userid');
      const reason = jailData.get(userId) || "No jail reason found.";
      return interaction.reply({ content: `Jail info for ${userId}: ${reason}` });
    }
    else if (commandName === "jailed") {
      return interaction.reply({ content: `Total jailed users: ${jailData.size}` });
    }
    else if (commandName === "topvrf") {
      // Dummy implementation – replace with your own logic.
      return interaction.reply({ content: `Top verificators: [Data coming soon]` });
    }
    else if (commandName === "toponline") {
      // Dummy implementation – replace with your own logic.
      return interaction.reply({ content: `Most online users: [Data coming soon]` });
    }
    else if (commandName === "help") {
      let helpMsg = "**Available Commands:**\n";
      helpMsg += "/help - Show this help message\n";
      // Show 1-Tap commands to verificators.
      if (interaction.member.roles.cache.has(process.env.ROLE_VERIFICATOR) ||
          interaction.member.roles.cache.has(process.env.ROLE_LEADER_VERIFICATOR)) {
        helpMsg += "/kick, /reject, /perm, /claim, /lock, /unlock, /limit, /name, /status\n";
      }
      // Show admin commands.
      if (interaction.member.roles.cache.has(process.env.ADMIN_ROLE)) {
        helpMsg += "/unban, /binfo, /topvrf, /toponline\n";
      }
      // Jail commands (prefix-based) are noted here.
      helpMsg += "Message Commands: +jail <userID> <reason>, +unjail <userID>\n";
      return interaction.reply({ content: helpMsg, ephemeral: true });
    }
  }
});

// -----------------------
// MESSAGE COMMAND HANDLER (Prefix-based)
// -----------------------
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // ---- Verification Commands (inside verification VC) ----
  if (message.content.startsWith('+boy') || message.content.startsWith('+girl')) {
    // Look for a verification session where the sender is the assigned verificator.
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
      // Remove the Unverified role.
      await memberToVerify.roles.remove(process.env.ROLE_UNVERIFIED);
      // Add the appropriate verified role.
      if (message.content.startsWith('+boy')) {
        await memberToVerify.roles.add(process.env.ROLE_VERIFIED_BOY);
      } else {
        await memberToVerify.roles.add(process.env.ROLE_VERIFIED_GIRL);
      }
      // DM the verified user.
      await memberToVerify.send("✅ Wslti Mzyan! Tverifiti bniya w daba t9der tdkhol l server kaml.");
      // Attempt to move the verified user to an active voice channel with people.
      const activeVC = message.guild.channels.cache.find(ch => ch.type === 2 && ch.id !== sessionId && ch.members.size > 1);
      if (activeVC) {
        await memberToVerify.voice.setChannel(activeVC);
      }
      // Delete the temporary verification voice channel.
      const verifVC = message.guild.channels.cache.get(sessionId);
      if (verifVC) await verifVC.delete().catch(() => {});
      verificationSessions.delete(sessionId);
      return message.reply("User verified successfully.");
    } catch (err) {
      console.error("Verification error:", err);
      return message.reply("Verification failed.");
    }
  }

  // ---- Jail System Commands (Prefix-based) ----
  // +jail <userID> <reason> : Jail a user.
  if (message.content.startsWith('+jail')) {
    const args = message.content.split(' ');
    if (args.length < 3) return message.reply("Usage: +jail <userID> <reason>");
    const targetId = args[1];
    const reason = args.slice(2).join(' ');
    const targetMember = message.guild.members.cache.get(targetId);
    if (!targetMember) return message.reply("User not found.");
    try {
      await targetMember.roles.add(process.env.ROLE_JAILED);
      // Move the user to the jail voice channel.
      const jailVC = message.guild.channels.cache.get(process.env.VOICE_JAIL);
      if (jailVC) await targetMember.voice.setChannel(jailVC);
      // Save jail reason.
      jailData.set(targetId, reason);
      try { await targetMember.send(`You have been jailed for: ${reason}`); } catch (e) {}
      return message.reply(`User ${targetMember.user.username} has been jailed.`);
    } catch (err) {
      console.error("Jail error:", err);
      return message.reply("Failed to jail the user.");
    }
  }
  // +unjail <userID> : Unjail a user.
  if (message.content.startsWith('+unjail')) {
    const args = message.content.split(' ');
    if (args.length < 2) return message.reply("Usage: +unjail <userID>");
    const targetId = args[1];
    const targetMember = message.guild.members.cache.get(targetId);
    if (!targetMember) return message.reply("User not found.");
    try {
      await targetMember.roles.remove(process.env.ROLE_JAILED);
      jailData.delete(targetId);
      return message.reply(`User ${targetMember.user.username} has been unjailed.`);
    } catch (err) {
      console.error("Unjail error:", err);
      return message.reply("Failed to unjail the user.");
    }
  }
});

// -----------------------
// LOGIN THE BOT
// -----------------------
client.login(process.env.DISCORD_TOKEN);
