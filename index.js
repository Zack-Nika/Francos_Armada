// index.js
// MBC Super Bot using Discord.js v14 with enhanced verification notifications

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

// In-memory data
const verificationSessions = new Map(); // key: temp VC id; value: { userId, assignedVerificator, rejected }
const onetapSessions = new Map();       // key: temp VC id; value: owner userId
const jailData = new Map();             // key: user id; value: jail reason

// -----------------------
// SLASH COMMANDS SETUP
// -----------------------
client.commands = new Collection();
const commands = [
  // One-tap VC commands
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
      { body: commands.map(cmd => cmd.toJSON()) },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// -----------------------
// CLIENT READY
// -----------------------
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('VOICE_VERIFICATION:', process.env.VOICE_VERIFICATION);
  console.log('VOICE_ONETAP:', process.env.VOICE_ONETAP);
  console.log('CHANNEL_VERIFICATION_ALERT:', process.env.CHANNEL_VERIFICATION_ALERT);
});

// -----------------------
// GUILD MEMBER ADD
// -----------------------
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
// VOICE STATE UPDATE
// -----------------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;

  // ---- Verification System ----
  if (newState.channelId === process.env.VOICE_VERIFICATION) {
    try {
      const member = newState.member;
      // Create the temporary verification voice channel
      const tempVC = await guild.channels.create({
        name: `Verify - ${member.user.username}`,
        type: 2, // Voice channel
        parent: newState.channel.parentId,
        permissionOverwrites: []
      });
      console.log(`Created verification VC: ${tempVC.name} for ${member.user.username}`);
      await member.voice.setChannel(tempVC);
      // Save the session with no verificator assigned yet
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      
      // Send an alert notification to the alert channel with a super bold embed and join button
      const alertChannel = guild.channels.cache.get(process.env.CHANNEL_VERIFICATION_ALERT);
      if (alertChannel) {
        console.log(`Sending verification alert in ${alertChannel.name}`);
        
        // Build a prominent button for one-click join
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("🚀 Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        
        // Create a BIG, bold embed using markdown (Discord doesn't allow actual font size changes)
        const embed = new EmbedBuilder()
          .setTitle("**MEMBER JDID AJEW 🙋‍♂️**")
          .setDescription("Click the button below to join the verification VC instantly!")
          .setColor(0x00AE86);
        
        // Send the alert message and auto-delete it after 6 seconds to avoid spam
        const alertMsg = await alertChannel.send({ embeds: [embed], components: [row] });
        setTimeout(() => {
          alertMsg.delete().catch(console.error);
        }, 6000);
      } else {
        console.error("Alert channel not found. Check CHANNEL_VERIFICATION_ALERT in .env");
      }
    } catch (err) {
      console.error("Error creating verification VC:", err);
    }
  }

  // ---- Public 1-Tap System ----
  if (newState.channelId === process.env.VOICE_ONETAP) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `🎧 ${member.user.username}`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.Connect],
          },
          {
            id: member.id,
            allow: [PermissionsBitField.Flags.Connect],
          }
        ]
      });
      console.log(`Created one-tap VC: ${tempVC.name} for ${member.user.username}`);
      onetapSessions.set(tempVC.id, member.id);
      await member.voice.setChannel(tempVC);
    } catch (err) {
      console.error("Error creating 1-Tap VC:", err);
    }
  }

  // ---- One-Tap Channel Owner Reassignment ----
  if (oldState.channel && onetapSessions.has(oldState.channel.id)) {
    const ownerId = onetapSessions.get(oldState.channel.id);
    if (oldState.member.id === ownerId) {
      const remaining = oldState.channel.members;
      if (remaining.size > 0) {
        const newOwner = remaining.first();
        onetapSessions.set(oldState.channel.id, newOwner.id);
        console.log(`Reassigned one-tap VC ${oldState.channel.name} to ${newOwner.user.username}`);
        await oldState.channel.permissionOverwrites.edit(newOwner.id, { Connect: true });
      }
    }
  }

  // ---- If in a verification VC and the verificator leaves, move the verified user ----
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
          console.log(`Moved verified member ${verifiedMember.user.username} to ${activeVC.name} because verificator left.`);
        }
      }
    }
  }

  // ---- Auto-delete empty temp VCs ----
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
  // Button Interaction for Verification Join
  if (interaction.isButton() && interaction.customId.startsWith("join_verification_")) {
    const vcId = interaction.customId.split("_").pop();
    const session = verificationSessions.get(vcId);
    if (!session) {
      return interaction.reply({ content: "This verification session has expired.", ephemeral: true });
    }
    const member = interaction.guild.members.cache.get(interaction.user.id);
    
    // If the verificator is NOT in a voice channel, create an invite link to the verification VC
    if (!member.voice.channel) {
      try {
        const channel = interaction.guild.channels.cache.get(vcId);
        const invite = await channel.createInvite({ maxAge: 300, maxUses: 1 });
        return interaction.reply({
          content: `You're not in a voice channel. Use this invite link to join the verification VC: ${invite.url}`,
          ephemeral: true
        });
      } catch (e) {
        return interaction.reply({ content: "Oops, something went wrong. Please join a voice channel and try again.", ephemeral: true });
      }
    }
    
    // If the verificator is in a voice channel but not already in the verification VC, move them
    if (member.voice.channelId !== vcId) {
      await member.voice.setChannel(vcId);
    }
    
    // If no verificator has been assigned yet, assign the current user
    if (!session.assignedVerificator) {
      session.assignedVerificator = interaction.user.id;
      verificationSessions.set(vcId, session);
    }
    
    return interaction.reply({ content: "You've joined the verification room. You can now verify the user with +boy or +girl.", ephemeral: true });
  }
  // Slash Command Interactions
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
      await memberVC.permissionOverwrites.edit(interaction.user.id, { Connect: true });
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
      return interaction.reply({ content: `Top verificators: [Data coming soon]` });
    }
    else if (commandName === "toponline") {
      return interaction.reply({ content: `Most online users: [Data coming soon]` });
    }
    else if (commandName === "help") {
      let helpMsg = "**Available Commands:**\n";
      helpMsg += "/help - Show this help message\n";
      if (interaction.member.roles.cache.has(process.env.ROLE_VERIFICATOR) ||
          interaction.member.roles.cache.has(process.env.ROLE_LEADER_VERIFICATOR)) {
        helpMsg += "**Verification & One-Tap Commands:**\n";
        helpMsg += "`/kick`, `/reject`, `/perm`, `/claim`, `/lock`, `/unlock`, `/limit`, `/name`, `/status`\n";
      }
      if (interaction.member.roles.cache.has(process.env.ADMIN_ROLE)) {
        helpMsg += "**Admin Commands:**\n";
        helpMsg += "`/unban`, `/binfo`, `/topvrf`, `/toponline`\n";
      }
      helpMsg += "**Jail Commands (Message Commands):**\n";
      helpMsg += "`+jail <userID> <reason>`, `+unjail <userID>`\n";
      return interaction.reply({ content: helpMsg, ephemeral: true });
    }
  }
});

// -----------------------
// MESSAGE COMMAND HANDLER
// -----------------------
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // ---- Verification Commands (+boy / +girl) ----
  if (message.content.startsWith('+boy') || message.content.startsWith('+girl')) {
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
      // Remove unverified role & add verified role
      await memberToVerify.roles.remove(process.env.ROLE_UNVERIFIED);
      let verifiedRoleName;
      if (message.content.startsWith('+boy')) {
        await memberToVerify.roles.add(process.env.ROLE_VERIFIED_BOY);
        verifiedRoleName = "Verified Boy";
      } else {
        await memberToVerify.roles.add(process.env.ROLE_VERIFIED_GIRL);
        verifiedRoleName = "Verified Girl";
      }
      // DM user
      await memberToVerify.send("Welcome to our server! You were verified successfully. Enjoy your time and get to know new people.");
      // Log verification in the channel
      message.channel.send(`<@${memberToVerify.id}> was verified as ${verifiedRoleName} Successfully!`);
      // Move user to an active VC if possible
      const activeVC = message.guild.channels.cache
        .filter(ch => ch.type === 2 && ch.id !== sessionId && ch.members.size > 0)
        .first();
      if (activeVC) {
        await memberToVerify.voice.setChannel(activeVC);
      }
      // Delay channel deletion so there's no abrupt kick
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

  // ---- Jail System (+jail / +unjail) ----
  if (message.content.startsWith('+jail')) {
    const args = message.content.split(' ');
    if (args.length < 3) return message.reply("Usage: +jail <userID> <reason>");
    const targetId = args[1];
    const reason = args.slice(2).join(' ');
    const targetMember = message.guild.members.cache.get(targetId);
    if (!targetMember) return message.reply("User not found.");
    try {
      await targetMember.roles.add(process.env.ROLE_JAILED);
      const jailVC = message.guild.channels.cache.get(process.env.VOICE_JAIL);
      if (jailVC) await targetMember.voice.setChannel(jailVC);
      jailData.set(targetId, reason);
      try { await targetMember.send(`You have been jailed for: ${reason}`); } catch (e) {}
      return message.reply(`User ${targetMember.user.username} has been jailed.`);
    } catch (err) {
      console.error("Jail error:", err);
      return message.reply("Failed to jail the user.");
    }
  }
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
// LOGIN
// -----------------------
client.login(process.env.DISCORD_TOKEN);
