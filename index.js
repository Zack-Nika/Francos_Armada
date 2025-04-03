// index.js
// MBC Super Bot using Discord.js v14 with enhanced verification notifications,
// auto-role removal on jail, modified One-Tap VC naming & ownership/command restrictions,
// per-user reject/permit functionality in one-tap channels,
// and new DM messages and plain text notifications with extended timeouts.

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
const verificationSessions = new Map(); // key: VC id; value: { userId, assignedVerificator, rejected }
const onetapSessions = new Map();       // key: VC id; value: { owner, rejectedUsers: [] }
const jailData = new Map();             // key: user id; value: jail reason

// -----------------------
// SLASH COMMANDS SETUP
// -----------------------
client.commands = new Collection();
const commands = [
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user from your private VC')
    .addUserOption(option => option.setName('target').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder().setName('reject').setDescription('Reject a user from joining this tap VC')
    .addUserOption(option => option.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder().setName('perm').setDescription('Allow a rejected user to join this tap VC')
    .addUserOption(option => option.setName('target').setDescription('User to permit').setRequired(true)),
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your private VC'),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your private VC'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your private VC'),
  new SlashCommandBuilder().setName('limit').setDescription('Set a user limit for your VC')
    .addIntegerOption(option => option.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your VC')
    .addStringOption(option => option.setName('text').setDescription('New name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your VC')
    .addStringOption(option => option.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID to unban').setRequired(true)),
  new SlashCommandBuilder().setName('binfo').setDescription('Show total bans'),
  new SlashCommandBuilder().setName('jinfo').setDescription('Show jail reason for a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID').setRequired(true)),
  new SlashCommandBuilder().setName('jailed').setDescription('Show how many users are jailed'),
  new SlashCommandBuilder().setName('topvrf').setDescription('Show top verificators'),
  new SlashCommandBuilder().setName('toponline').setDescription('Show most online users'),
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
    // DM new member with welcome message and mention.
    await member.send(`# Mar7ba Bik Fi  ☆ MBC ☆  Ahsen Sever Fl Maghrib 🇲🇦 Daba Ayje 3ndk Chi Verificator ✅️ Tania Wehda ❤️ ${member.toString()}`);
  } catch (err) {
    console.error('Error on GuildMemberAdd:', err);
  }
});

// -----------------------
// VOICE STATE UPDATE
// -----------------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;

  // ----- Verification System -----
  if (newState.channelId === process.env.VOICE_VERIFICATION) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: []
      });
      console.log(`Created verification VC: ${tempVC.name} for ${member.displayName}`);
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      
      // Send a plain text notification (big bold text) with join button
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
        // Increase notification lifetime to 10 seconds
        setTimeout(() => { alertMsg.delete().catch(console.error); }, 10000);
      } else {
        console.error("Alert channel not found. Check CHANNEL_VERIFICATION_ALERT in .env");
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
      console.error("Error creating 1-Tap VC:", err);
    }
  }

  // ----- Check if a user joins a one-tap channel and is rejected -----
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

  // ----- Verification VC: If verificator leaves, move verified user -----
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    if (oldState.member.id === session.assignedVerificator) {
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        const activeVC = guild.channels.cache.filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0).first();
        if (activeVC) {
          await verifiedMember.voice.setChannel(activeVC);
          console.log(`Moved verified member ${verifiedMember.displayName} to ${activeVC.name} because verificator left.`);
        }
      }
    }
  }

  // ----- Auto-delete empty temp VCs -----
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
  // ----- Button Interaction for Verification Join -----
  if (interaction.isButton() && interaction.customId.startsWith("join_verification_")) {
    const vcId = interaction.customId.split("_").pop();
    const session = verificationSessions.get(vcId);
    if (!session) {
      return interaction.reply({ content: "This verification session has expired.", ephemeral: true });
    }
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member.voice.channel) {
      try {
        const channel = interaction.guild.channels.cache.get(vcId);
        const invite = await channel.createInvite({ maxAge: 300, maxUses: 1 });
        return interaction.reply({ content: `You're not in a voice channel. Use this invite link to join the verification VC: ${invite.url}`, ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: "Oops, something went wrong. Please join a voice channel and try again.", ephemeral: true });
      }
    }
    if (member.voice.channelId !== vcId) {
      await member.voice.setChannel(vcId);
    }
    if (!session.assignedVerificator) {
      session.assignedVerificator = interaction.user.id;
      verificationSessions.set(vcId, session);
    }
    return interaction.reply({ content: "You've joined the verification room. You can now verify the user with +boy or +girl.", ephemeral: true });
  }
  // ----- Slash Command Interactions -----
  else if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const memberVC = interaction.member.voice.channel;
    if (!memberVC) return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
    
    // Handle /reject and /perm only in one-tap channels (per-user)
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
      return interaction.reply({ content: `${targetUser.tag} has been rejected from this tap channel.`, ephemeral: true });
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
        return interaction.reply({ content: `${targetUser.tag} is now permitted to join this tap channel.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `${targetUser.tag} is not currently rejected in this channel.`, ephemeral: true });
      }
    }
    
    // Other one-tap commands (owner-restricted)
    const oneTapCommands = ["kick", "lock", "unlock", "limit", "name", "status", "claim"];
    if (onetapSessions.has(memberVC.id) && oneTapCommands.includes(commandName)) {
      let tapSession = onetapSessions.get(memberVC.id);
      if (tapSession.owner && memberVC.members.has(tapSession.owner) && interaction.user.id !== tapSession.owner) {
        if (commandName === "claim") {
          return interaction.reply({ content: "The owner is still in the channel. You cannot claim ownership.", ephemeral: true });
        } else {
          return interaction.reply({ content: "The owner is still in the channel. You are not allowed to use this command.", ephemeral: true });
        }
      }
    }
    
    if (commandName === "kick") {
      if (!onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a private tap channel.", ephemeral: true });
      }
      const target = interaction.options.getUser('target');
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (targetMember && targetMember.voice.channelId === memberVC.id) {
        await targetMember.voice.disconnect();
        return interaction.reply({ content: `${targetMember.displayName} has been kicked from your channel.` });
      } else {
        return interaction.reply({ content: "User not found in your channel.", ephemeral: true });
      }
    }
    else if (commandName === "claim") {
      if (!onetapSessions.has(memberVC.id)) {
        return interaction.reply({ content: "You are not in a private tap channel.", ephemeral: true });
      }
      let tapSession = onetapSessions.get(memberVC.id);
      if (tapSession.owner && memberVC.members.has(tapSession.owner)) {
        if (interaction.user.id !== tapSession.owner) {
          return interaction.reply({ content: "The owner is still in the channel. You cannot claim ownership.", ephemeral: true });
        } else {
          return interaction.reply({ content: "You are already the owner of this channel.", ephemeral: true });
        }
      }
      tapSession.owner = interaction.user.id;
      onetapSessions.set(memberVC.id, tapSession);
      await memberVC.permissionOverwrites.edit(interaction.user.id, { Connect: true });
      return interaction.reply({ content: "You have claimed ownership of this voice channel." });
    }
    else if (commandName === "lock") {
      await memberVC.permissionOverwrites.edit(memberVC.guild.id, { Connect: false });
      return interaction.reply({ content: "Voice channel locked." });
    }
    else if (commandName === "unlock") {
      await memberVC.permissionOverwrites.edit(memberVC.guild.id, { Connect: true });
      return interaction.reply({ content: "Voice channel unlocked." });
    }
    else if (commandName === "limit") {
      const limit = interaction.options.getInteger('number');
      await memberVC.setUserLimit(limit);
      return interaction.reply({ content: `Voice channel user limit set to ${limit}.` });
    }
    else if (commandName === "name") {
      const newName = interaction.options.getString('text');
      await memberVC.setName(newName);
      return interaction.reply({ content: `Voice channel renamed to ${newName}.` });
    }
    else if (commandName === "status") {
      let tapSession = onetapSessions.get(memberVC.id);
      if (tapSession) {
        if (tapSession.owner && memberVC.members.has(tapSession.owner) && interaction.user.id !== tapSession.owner) {
          return interaction.reply({ content: "The owner is still in the channel. You cannot update the status.", ephemeral: true });
        }
      }
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
      // DM verified message
      await memberToVerify.send("# No Toxic Guys Here ❌️☢️ 7na Hna Bash Nchilliw Wnstmt3o Bw9tna ...Mar7ba Bik Mara Akhra ⚘️♥️");
      message.channel.send(`<@${memberToVerify.id}> was verified as ${verifiedRoleName} successfully!`);
      const activeVC = message.guild.channels.cache.filter(ch => ch.type === 2 && ch.id !== sessionId && ch.members.size > 0).first();
      if (activeVC) {
        await memberToVerify.voice.setChannel(activeVC);
      }
      // Extend auto deletion timeout to 60 seconds so new verificators have time to join.
      setTimeout(async () => {
        const verifVC = message.guild.channels.cache.get(sessionId);
        if (verifVC) {
          if (verifVC.members.size === 0 || (verifVC.members.size === 1 && verifVC.members.has(message.author.id))) {
            await verifVC.delete().catch(() => {});
            verificationSessions.delete(sessionId);
          }
        }
      }, 60000);
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
