// index.js
// MBC Super Bot using Discord.js v14
// Features:
//  • Enhanced verification notifications (9-second notification duration)
//  • Auto-role removal on jail
//  • Modified one-tap VC naming & ownership/command restrictions
//  • Per-user reject/permit functionality in one-tap channels (with /reject kicking the target)
//  • Welcome and verified DM messages
//  • Verified users remain in the verification VC until the verificator leaves
//  • Categorized slash commands: admins see admin tools; regular users see tap/verification commands
//  • A message command "R" to view your own profile and "A @user" to view someone else's profile
//  • A profile viewer with two buttons for Avatar and Banner

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

// In-memory session data
const verificationSessions = new Map(); // { VC id: { userId, assignedVerificator, rejected } }
const onetapSessions = new Map();       // { VC id: { owner, rejectedUsers: [] } }
const jailData = new Map();             // { user id: jail reason }

// -----------------------
// SLASH COMMANDS SETUP
// -----------------------
client.commands = new Collection();
const slashCommands = [
  // TAP commands (visible to all)
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from your tap')
    .addUserOption(option => option.setName('target').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Reject a user from joining this tap')
    .addUserOption(option => option.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder()
    .setName('perm')
    .setDescription('Permit a rejected user to join this tap')
    .addUserOption(option => option.setName('target').setDescription('User to permit').setRequired(true)),
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock your tap'),
  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock your tap'),
  new SlashCommandBuilder()
    .setName('limit')
    .setDescription('Set a user limit for your tap')
    .addIntegerOption(option => option.setName('number').setDescription('User limit').setRequired(true)),
  new SlashCommandBuilder()
    .setName('name')
    .setDescription('Rename your tap')
    .addStringOption(option => option.setName('text').setDescription('New name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Set a status for your tap')
    .addStringOption(option => option.setName('text').setDescription('Status text').setRequired(true)),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user in your voice channel')
    .addUserOption(option => option.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user in your voice channel')
    .addUserOption(option => option.setName('target').setDescription('User to unmute').setRequired(true)),

  // ADMIN commands (visible only to administrators)
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('binfo')
    .setDescription('Show total bans')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('jinfo')
    .setDescription('Show jail reason for a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('jailed')
    .setDescription('Show how many users are jailed')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('topvrf')
    .setDescription('Show top verificators')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('toponline')
    .setDescription('Show most online users')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  // HELP command (visible to everyone) with a fancy embed
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands'),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Refreshing slash commands.');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: slashCommands.map(cmd => cmd.toJSON()) }
    );
    console.log('Slash commands reloaded.');
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
// GUILD MEMBER ADD (Welcome DM)
// -----------------------
client.on(Events.GuildMemberAdd, async member => {
  try {
    const unverifiedRole = member.guild.roles.cache.get(process.env.ROLE_UNVERIFIED);
    if (unverifiedRole) await member.roles.add(unverifiedRole);
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
  if (newState.channelId === process.env.VOICE_VERIFICATION &&
      newState.member.roles.cache.has(process.env.ROLE_VERIFICATOR)) {
    return;
  }

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
      
      // Send plain text notification with join button (lasting 9 seconds).
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
        setTimeout(() => { alertMsg.delete().catch(console.error); }, 9000);
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
        permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.Connect] }]
      });
      console.log(`Created one-tap VC: ${tempVC.name} for ${member.displayName}`);
      onetapSessions.set(tempVC.id, { owner: member.id, rejectedUsers: [] });
      await member.voice.setChannel(tempVC);
    } catch (err) {
      console.error("Error creating one-tap VC:", err);
    }
  }

  // ----- When a user joins a one-tap channel, check if they're rejected -----
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
        // Only move the verified user if they're not already in a one-tap channel.
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
    
    // Handle /reject and /perm for one-tap channels:
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
    // Mute / Unmute Commands:
    else if (commandName === "mute") {
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
    // Other One-Tap Commands:
    else if (commandName === "claim") {
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
      // Create a classy embed for help with color and fields
      const helpEmbed = new EmbedBuilder()
        .setColor(0xFF69B4) // a fancy pink color
        .setTitle("Available Commands")
        .setDescription("Below is a list of commands you can use. Use these to manage your tap, verify users, and view profiles!")
        .addFields(
          { name: "Profile Viewer", value: "`R` → Show your profile\n`A @user` → Show a user's profile", inline: false },
          { name: "Tap Commands", value: "`/kick`, `/reject`, `/perm`, `/claim`, `/lock`, `/unlock`, `/limit`, `/name`, `/status`, `/mute`, `/unmute`", inline: false },
        );
      if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        helpEmbed.addFields(
          { name: "Admin Commands", value: "`/unban`, `/binfo`, `/jinfo`, `/jailed`, `/topvrf`, `/toponline`\n`+jail`, `+unjail`", inline: false }
        );
      }
      return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
  }
});

// -----------------------
// MESSAGE COMMAND HANDLER (Profile Viewer)
// -----------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const content = message.content.trim();
  
  // "R" command: show your own profile
  if (content.toUpperCase() === 'R') {
    try {
      const fullUser = await message.author.fetch();
      const avatarURL = fullUser.displayAvatarURL({ dynamic: true, size: 1024 });
      const bannerURL = fullUser.bannerURL({ dynamic: true, size: 1024 });
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`${fullUser.username}'s Profile`)
        .setDescription("Click a button below to view Avatar or Banner.")
        .setThumbnail(avatarURL)
        .addFields(
          { name: "Avatar", value: `[View Avatar](${avatarURL})`, inline: true },
          { name: "Banner", value: bannerURL ? `[View Banner](${bannerURL})` : "No banner set", inline: true }
        )
        .setFooter({ text: `Requested by: ${message.author.username}` });
      
      const avatarButton = new ButtonBuilder()
        .setCustomId(`avatar_${message.author.id}`)
        .setLabel("Avatar")
        .setStyle(ButtonStyle.Primary);
      const bannerButton = new ButtonBuilder()
        .setCustomId(`banner_${message.author.id}`)
        .setLabel("Banner")
        .setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(avatarButton, bannerButton);
      
      await message.channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error("Error fetching your profile:", err);
      message.reply("There was an error fetching your profile.");
    }
  }
  // "A" command: show profile of mentioned user
  else if (content.toUpperCase().startsWith('A')) {
    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply("Please mention a user to view their profile.");
    try {
      const fullTarget = await targetUser.fetch();
      const avatarURL = fullTarget.displayAvatarURL({ dynamic: true, size: 1024 });
      const bannerURL = fullTarget.bannerURL({ dynamic: true, size: 1024 });
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`${fullTarget.username}'s Profile`)
        .setDescription("Click a button below to view Avatar or Banner.")
        .setThumbnail(avatarURL)
        .addFields(
          { name: "Avatar", value: `[View Avatar](${avatarURL})`, inline: true },
          { name: "Banner", value: bannerURL ? `[View Banner](${bannerURL})` : "No banner set", inline: true }
        )
        .setFooter({ text: `Requested by: ${message.author.username}` });
      
      const avatarButton = new ButtonBuilder()
        .setCustomId(`avatar_${fullTarget.id}`)
        .setLabel("Avatar")
        .setStyle(ButtonStyle.Primary);
      const bannerButton = new ButtonBuilder()
        .setCustomId(`banner_${fullTarget.id}`)
        .setLabel("Banner")
        .setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(avatarButton, bannerButton);
      
      await message.channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error("Error fetching target profile:", err);
      message.reply("There was an error fetching that user's profile.");
    }
  }
});

// -----------------------
// BUTTON INTERACTION HANDLER (Profile Buttons)
// -----------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  // Expecting customId in format "avatar_userId" or "banner_userId"
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
    await interaction.update({ embeds: [embed] });
  }
  else if (action === 'banner') {
    const bannerURL = targetUser.bannerURL({ dynamic: true, size: 1024 });
    if (!bannerURL) {
      return interaction.reply({ content: "This user does not have a banner set.", ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle(`${targetUser.username}'s Banner`)
      .setImage(bannerURL)
      .setFooter({ text: `Requested by: ${interaction.user.username}` });
    await interaction.update({ embeds: [embed] });
  }
});

// -----------------------
// LOGIN
// -----------------------
client.login(process.env.DISCORD_TOKEN);
