// index.js
// MBC Super Bot using Discord.js v14 with enhanced verification notifications,
// auto-role removal on jail, modified one-tap VC naming & ownership/command restrictions,
// per-user reject/permit functionality in one-tap channels,
// new DM messages for joining and verification,
// verified users remain until the verificator leaves,
// and new /mute and /unmute commands.

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder, // available if needed for other embeds
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

// In-memory session data:
const verificationSessions = new Map(); // key: VC id; value: { userId, assignedVerificator, rejected }
const onetapSessions = new Map();       // key: VC id; value: { owner, rejectedUsers: [] }
const jailData = new Map();             // key: user id; value: jail reason

// -----------------------
// SLASH COMMANDS SETUP
// -----------------------
client.commands = new Collection();
const commands = [
  // One-tap VC commands – /reject and /perm require a target.
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user from your tap')
    .addUserOption(option => option.setName('target').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder().setName('reject').setDescription('Reject a user from joining this tap')
    .addUserOption(option => option.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder().setName('perm').setDescription('Permit a rejected user to join this tap')
    .addUserOption(option => option.setName('target').setDescription('User to permit').setRequired(true)),
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your tap'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your tap'),
  new SlashCommandBuilder().setName('limit').setDescription('Set a user limit for your tap')
    .addIntegerOption(option => option.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your tap')
    .addStringOption(option => option.setName('text').setDescription('New name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your tap')
    .addStringOption(option => option.setName('text').setDescription('Status text').setRequired(true)),
  // New mute commands:
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user in your voice channel')
    .addUserOption(option => option.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user in your voice channel')
    .addUserOption(option => option.setName('target').setDescription('User to unmute').setRequired(true)),
  // Ban tools:
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID').setRequired(true)),
  new SlashCommandBuilder().setName('binfo').setDescription('Show total bans'),
  // Jail commands:
  new SlashCommandBuilder().setName('jinfo').setDescription('Show jail reason for a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID').setRequired(true)),
  new SlashCommandBuilder().setName('jailed').setDescription('Show how many users are jailed'),
  // Stats commands:
  new SlashCommandBuilder().setName('topvrf').setDescription('Show top verificators'),
  new SlashCommandBuilder().setName('toponline').setDescription('Show most online users'),
  // Help command:
  new SlashCommandBuilder().setName('help').setDescription('Show available commands'),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Refreshing application (/) commands.');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands.map(cmd => cmd.toJSON()) },
    );
    console.log('Commands reloaded.');
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
    // DM new member welcome message with their mention.
    await member.send("# Mar7ba Bik Fi  ☆ MBC ☆  Ahsen Sever Fl Maghrib 🇲🇦 Daba Ayje 3ndk Chi Verificator ✅️ Tania Wehda ❤️ " + member.toString());
  } catch (err) {
    console.error('Error on GuildMemberAdd:', err);
  }
});

// -----------------------
// VOICE STATE UPDATE
// -----------------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;

  // If a member with the verificator role joins VOICE_VERIFICATION, do nothing.
  if (newState.channelId === process.env.VOICE_VERIFICATION && newState.member.roles.cache.has(process.env.ROLE_VERIFICATOR)) {
    return;
  }

  // ----- Verification System -----
  if (newState.channelId === process.env.VOICE_VERIFICATION) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2, // Voice channel
        parent: newState.channel.parentId,
        permissionOverwrites: []
      });
      console.log(`Created verification VC: ${tempVC.name} for ${member.displayName}`);
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      
      // Send plain text notification (big bold text) with join button.
      const alertChannel = guild.channels.cache.get(process.env.CHANNEL_VERIFICATION_ALERT);
      if (alertChannel) {
        console.log(`Sending verification notification in ${alertChannel.name}`);
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("🚀 Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        const textNotification = "**# MEMBER JDID AJEW 🙋‍♂️**";
        const alertMsg = await alertChannel.send({ content: textNotification, components: [row] });
        setTimeout(() => { alertMsg.delete().catch(console.error); }, 6000);
      } else {
        console.error("Alert channel not found.");
      }
    } catch (err) {
      console.error("Error creating verification VC:", err);
    }
  }

  // ----- Public 1-Tap System -----
  if (newState.channelId === process.env.VOICE_ONETAP) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `${member.displayName}'s Room`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionsBitField.Flags.Connect] }
        ]
      });
      console.log(`Created one-tap VC: ${tempVC.name} for ${member.displayName}`);
      onetapSessions.set(tempVC.id, { owner: member.id, rejectedUsers: [] });
      await member.voice.setChannel(tempVC);
    } catch (err) {
      console.error("Error creating one-tap VC:", err);
    }
  }

  // ----- When a user joins a one-tap channel, check if they are rejected -----
  if (newState.channel && onetapSessions.has(newState.channel.id)) {
    const tapSession = onetapSessions.get(newState.channel.id);
    if (tapSession.rejectedUsers && tapSession.rejectedUsers.includes(newState.member.id)) {
      newState.member.voice.disconnect("You are rejected from this tap channel.");
      return;
    }
  }

  // ----- One-Tap Channel Owner Reassignment -----
  if (oldState.channel && onetapSessions.has(oldState.channel.id)) {
    let tapSession = onetapSessions.get(oldState.channel.id);
    if (oldState.member.id === tapSession.owner) {
      const remaining = oldState.channel.members;
      if (remaining.size > 0) {
        const newOwner = remaining.first();
        tapSession.owner = newOwner.id;
        onetapSessions.set(oldState.channel.id, tapSession);
        console.log(`Reassigned one-tap VC ${oldState.channel.name} to ${newOwner.displayName}`);
        await oldState.channel.permissionOverwrites.edit(newOwner.id, { Connect: true });
      }
    }
  }

  // ----- Verification VC: When verificator leaves, then move the verified user (if still present) -----
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    if (oldState.member.id === session.assignedVerificator) {
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        // Only move if the verified user is not already in a one-tap channel.
        if (!verifiedMember.voice.channel || !onetapSessions.has(verifiedMember.voice.channel.id)) {
          const activeVC = guild.channels.cache
            .filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0)
            .first();
          if (activeVC) {
            await verifiedMember.voice.setChannel(activeVC);
            console.log(`Moved verified member ${verifiedMember.displayName} to ${activeVC.name} because verificator left.`);
          }
        }
      }
    }
  }

  // ----- Auto-delete empty temporary VCs -----
  if (oldState.channel && oldState.channel.members.size === 0) {
    const channelId = oldState.channel.id;
    if (verificationSessions.has(channelId) || onetapSessions.has(channelId)) {
      console.log(`Deleting empty VC: ${oldState.channel.name}`);
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
  // ----- Button Interaction for Verification Join -----
  if (interaction.isButton() && interaction.customId.startsWith("join_verification_")) {
    const vcId = interaction.customId.split("_").pop();
    const session = verificationSessions.get(vcId);
    if (!session) {
      return interaction.reply({ content: "This verification session has expired.", ephemeral: true });
    }
    // Prevent multiple verificators from claiming simultaneously.
    if (session.assignedVerificator) {
      return interaction.reply({ content: "This session is already claimed.", ephemeral: true });
    }
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member.voice.channel) {
      try {
        const channel = interaction.guild.channels.cache.get(vcId);
        const invite = await channel.createInvite({ maxAge: 300, maxUses: 1 });
        return interaction.reply({ content: `You're not in a voice channel. Use this invite link: ${invite.url}`, ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: "Oops, something went wrong. Please join a voice channel and try again.", ephemeral: true });
      }
    }
    if (member.voice.channelId !== vcId) {
      await member.voice.setChannel(vcId);
    }
    session.assignedVerificator = interaction.user.id;
    verificationSessions.set(vcId, session);
    return interaction.reply({ content: "You've joined the verification room. You can now verify the user with +boy or +girl.", ephemeral: true });
  }
  // ----- Slash Command Interactions -----
  else if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const memberVC = interaction.member.voice.channel;
    if (!memberVC) return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
    
    // Handle /reject and /perm in one-tap channels (per-user)
    if (commandName === "reject") {
      if (!onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "This command only works in one-tap channels.", ephemeral: true });
      }
      let tapSession = onetapSessions.get(memberVC.id);
      if (tapSession.owner !== interaction.user.id) {
        return interaction.reply({ content: "Only the owner can reject a user from this tap.", ephemeral: true });
      }
      const targetUser = interaction.options.getUser('target');
      if (!tapSession.rejectedUsers) tapSession.rejectedUsers = [];
      if (!tapSession.rejectedUsers.includes(targetUser.id)) {
        tapSession.rejectedUsers.push(targetUser.id);
      }
      onetapSessions.set(memberVC.id, tapSession);
      await memberVC.permissionOverwrites.edit(targetUser.id, { Connect: false });
      // Also disconnect the target user if they're in the tap.
      const targetMember = interaction.guild.members.cache.get(targetUser.id);
      if (targetMember && targetMember.voice.channelId === memberVC.id) {
        await targetMember.voice.disconnect("You have been rejected by the tap owner.");
      }
      return interaction.reply({ content: `${targetUser.tag} has been rejected and kicked from this tap.`, ephemeral: true });
    }
    else if (commandName === "perm") {
      if (!onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "This command only works in one-tap channels.", ephemeral: true });
      }
      let tapSession = onetapSessions.get(memberVC.id);
      if (tapSession.owner !== interaction.user.id) {
        return interaction.reply({ content: "Only the owner can permit a rejected user in this tap.", ephemeral: true });
      }
      const targetUser = interaction.options.getUser('target');
      if (tapSession.rejectedUsers && tapSession.rejectedUsers.includes(targetUser.id)) {
        tapSession.rejectedUsers = tapSession.rejectedUsers.filter(id => id !== targetUser.id);
        onetapSessions.set(memberVC.id, tapSession);
        await memberVC.permissionOverwrites.edit(targetUser.id, { Connect: true });
        return interaction.reply({ content: `${targetUser.tag} is now permitted to join this tap.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `${targetUser.tag} is not currently rejected in this tap.`, ephemeral: true });
      }
    }
    // ----- Mute and Unmute Commands -----
    else if (commandName === "mute") {
      if (!memberVC) return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
      const target = interaction.options.getUser('target');
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (!targetMember || targetMember.voice.channelId !== memberVC.id) {
        return interaction.reply({ content: "User not found in your voice channel.", ephemeral: true });
      }
      try {
        await targetMember.voice.setMute(true);
        return interaction.reply({ content: `${targetMember.displayName} has been muted.` });
      } catch (error) {
        console.error(error);
        return interaction.reply({ content: "Failed to mute the user.", ephemeral: true });
      }
    }
    else if (commandName === "unmute") {
      if (!memberVC) return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
      const target = interaction.options.getUser('target');
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (!targetMember || targetMember.voice.channelId !== memberVC.id) {
        return interaction.reply({ content: "User not found in your voice channel.", ephemeral: true });
      }
      try {
        await targetMember.voice.setMute(false);
        return interaction.reply({ content: `${targetMember.displayName} has been unmuted.` });
      } catch (error) {
        console.error(error);
        return interaction.reply({ content: "Failed to unmute the user.", ephemeral: true });
      }
    }
    // ----- Other One-Tap Commands -----
    if (commandName === "claim") {
      if (!onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a private tap channel.", ephemeral: true });
      }
      let tapSession = onetapSessions.get(memberVC.id);
      if (tapSession.owner && memberVC.members.has(tapSession.owner)) {
        if (interaction.user.id !== tapSession.owner) {
          return interaction.reply({ content: "The owner is still in the channel. You cannot claim ownership.", ephemeral: true });
        } else {
          return interaction.reply({ content: "You are already the owner of this tap.", ephemeral: true });
        }
      }
      tapSession.owner = interaction.user.id;
      onetapSessions.set(memberVC.id, tapSession);
      await memberVC.permissionOverwrites.edit(interaction.user.id, { Connect: true });
      return interaction.reply({ content: "You have claimed ownership of this tap.", ephemeral: true });
    }
    else if (commandName === "kick") {
      const target = interaction.options.getUser('target');
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (targetMember && targetMember.voice.channelId === memberVC.id) {
        await targetMember.voice.disconnect();
        return interaction.reply({ content: `${targetMember.displayName} has been kicked from this tap.` });
      } else {
        return interaction.reply({ content: "User not found in your tap.", ephemeral: true });
      }
    }
    else if (commandName === "lock") {
      await memberVC.permissionOverwrites.edit(memberVC.guild.id, { Connect: false });
      return interaction.reply({ content: "Tap locked." });
    }
    else if (commandName === "unlock") {
      await memberVC.permissionOverwrites.edit(memberVC.guild.id, { Connect: true });
      return interaction.reply({ content: "Tap unlocked." });
    }
    else if (commandName === "limit") {
      const limit = interaction.options.getInteger('number');
      await memberVC.setUserLimit(limit);
      return interaction.reply({ content: `User limit set to ${limit}.` });
    }
    else if (commandName === "name") {
      const newName = interaction.options.getString('text');
      await memberVC.setName(newName);
      return interaction.reply({ content: `Tap renamed to ${newName}.` });
    }
    else if (commandName === "status") {
      let baseName = memberVC.name.split(" - ")[0];
      const status = interaction.options.getString('text');
      await memberVC.setName(`${baseName} - ${status}`);
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
      helpMsg += "**Verification & Tap Commands:**\n";
      helpMsg += "`/kick`, `/reject`, `/perm`, `/claim`, `/lock`, `/unlock`, `/limit`, `/name`, `/status`, `/mute`, `/unmute`\n";
      helpMsg += "**Admin Commands:**\n";
      helpMsg += "`/unban`, `/binfo`, `/topvrf`, `/toponline`\n";
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
  // ----- Verification Commands (+boy / +girl) -----
  if (message.content.startsWith('+boy') || message.content.startsWith('+girl')) {
    let sessionId;
    for (const [vcId, session] of verificationSessions.entries()) {
      if (message.member.voice.channelId === vcId) {
        if (!session.assignedVerificator) {
          session.assignedVerificator = message.author.id;
          verificationSessions.set(vcId, session);
        }
        if (session.assignedVerificator === message.author.id) {
          sessionId = vcId;
          break;
        }
      }
    }
    if (!sessionId) {
      return message.reply("No active verification session found for you.");
    }
    const session = verificationSessions.get(sessionId);
    const memberToVerify = message.guild.members.cache.get(session.userId);
    if (!memberToVerify) return message.reply("User not found.");
    try {
      await memberToVerify.roles.remove(process.env.ROLE_UNVERIFIED);
      let verifiedRoleName;
      if (message.content.startsWith('+boy')) {
        await memberToVerify.roles.add(process.env.ROLE_VERIFIED_BOY);
        verifiedRoleName = "Verified Boy";
      } else {
        await memberToVerify.roles.add(process.env.ROLE_VERIFIED_GIRL);
        verifiedRoleName = "Verified Girl";
      }
      // Send DM to verified user.
      await memberToVerify.send("# No Toxic Guys Here ❌️☢️ 7na Hna Bash Nchilliw Wnstmt3o Bw9tna ...Mar7ba Bik Mara Akhra ⚘️♥️");
      message.channel.send(`<@${memberToVerify.id}> was verified as ${verifiedRoleName} successfully!`);
      // Do not auto-move the verified user; they remain until the verificator leaves.
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
  
  // ----- Jail System (+jail / +unjail) -----
  if (message.content.startsWith('+jail')) {
    const args = message.content.split(' ');
    if (args.length < 3) return message.reply("Usage: +jail <userID> <reason>");
    const targetId = args[1];
    const reason = args.slice(2).join(' ');
    const targetMember = message.guild.members.cache.get(targetId);
    if (!targetMember) return message.reply("User not found.");
    try {
      const rolesToRemove = targetMember.roles.cache
        .filter(role => role.id !== targetMember.guild.id)
        .map(role => role.id);
      await targetMember.roles.remove(rolesToRemove, "Jailed: Removing all roles");
      await targetMember.roles.add(process.env.ROLE_JAILED);
      const jailVC = message.guild.channels.cache.get(process.env.VOICE_JAIL);
      if (jailVC) await targetMember.voice.setChannel(jailVC);
      jailData.set(targetId, reason);
      try { await targetMember.send("# No Toxic Guys Here ❌️☢️ 7na Hna Bash Nchilliw Wnstmt3o Bw9tna ...Mar7ba Bik Mara Akhra ⚘️♥️"); } catch (e) {}
      return message.reply(`User ${targetMember.displayName} has been jailed.`);
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
      return message.reply(`User ${targetMember.displayName} has been unjailed.`);
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
