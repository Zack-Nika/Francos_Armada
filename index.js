// index.js
// MBC Super Bot with multiple features (verification, one-tap, jail, etc.)
// PLUS: It connects to MongoDB to store server configuration (e.g., custom prefix)
// Profile Viewer: Only the "R" command is used to show a simple embed with the user's profile picture and two buttons (Avatar & Banner)

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

// Use the prebuilt @napi-rs/canvas for image generation (if needed later)
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// For MongoDB connection
const { MongoClient } = require('mongodb');
const mongoUri = process.env.MONGODB_URI;
const mongoClient = new MongoClient(mongoUri);

// Connect to MongoDB and store the collection reference for server settings
let settingsCollection;
async function connectToMongo() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
    const db = mongoClient.db("botRentalDB"); // choose a database name
    settingsCollection = db.collection("serverSettings");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
connectToMongo();

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

// In-memory session data for voice features
const verificationSessions = new Map(); // { vcId: { userId, assignedVerificator, rejected } }
const onetapSessions = new Map();       // { vcId: { owner, rejectedUsers: [] } }
const jailData = new Map();             // { userId: jailReason }

// -----------------------
// SLASH COMMANDS SETUP
// -----------------------
client.commands = new Collection();
const slashCommands = [
  // Example TAP commands (everyone)
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
  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder().setName('lock').setDescription('Lock your tap'),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock your tap'),
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

  // ADMIN commands (for administrators)
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

  // HELP command (for all users)
  new SlashCommandBuilder().setName('help').setDescription('Show available commands'),
];

(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
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
    // Optionally, assign an "unverified" role (use your actual role IDs here)
    const unverifiedRole = member.guild.roles.cache.get(process.env.ROLE_UNVERIFIED);
    if (unverifiedRole) await member.roles.add(unverifiedRole);
    await member.send("# Mar7ba Bik Fi  ☆ MBC ☆  Ahsen Sever Fl Maghrib 🇲🇦 Daba Ayje 3ndk Chi Verificator ✅️ Tania Wehda ❤️ " + member.toString());
  } catch (err) {
    console.error('Error on GuildMemberAdd:', err);
  }
});

// -----------------------
// VOICE STATE UPDATE (Verification, One-Tap, etc.)
// -----------------------
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;

  // Skip if a member with the verificator role joins the verification channel.
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
      
      // Send notification with a join button (visible for 9 seconds)
      const alertChannel = guild.channels.cache.get(process.env.CHANNEL_VERIFICATION_ALERT);
      if (alertChannel) {
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

  // ----- One-Tap System -----
  if (newState.channelId === process.env.VOICE_ONETAP) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `${member.displayName}'s Room`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: [{ id: guild.id, allow: [PermissionsBitField.Flags.Connect] }]
      });
      onetapSessions.set(tempVC.id, { owner: member.id, rejectedUsers: [] });
      await member.voice.setChannel(tempVC);
    } catch (err) {
      console.error("Error creating one-tap VC:", err);
    }
  }

  // ----- Check if a user is rejected in a one-tap channel -----
  if (newState.channel && onetapSessions.has(newState.channel.id)) {
    const tapSession = onetapSessions.get(newState.channel.id);
    if (tapSession.rejectedUsers && tapSession.rejectedUsers.includes(newState.member.id)) {
      newState.member.voice.disconnect("You are rejected from this tap channel.");
      return;
    }
  }

  // ----- One-Tap Owner Reassignment -----
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

  // ----- Verification VC: When the verificator leaves, move the verified user (if present) -----
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    if (oldState.member.id === session.assignedVerificator) {
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        if (!verifiedMember.voice.channel || !onetapSessions.has(verifiedMember.voice.channel.id)) {
          const activeVC = guild.channels.cache
            .filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0)
            .first();
          if (activeVC) {
            await verifiedMember.voice.setChannel(activeVC);
          }
        }
      }
    }
  }

  // ----- Auto-delete empty temporary VCs -----
  if (oldState.channel && oldState.channel.members.size === 0) {
    const channelId = oldState.channel.id;
    if (verificationSessions.has(channelId) || onetapSessions.has(channelId)) {
      oldState.channel.delete().catch(() => {});
      verificationSessions.delete(channelId);
      onetapSessions.delete(channelId);
    }
  }
});

// -----------------------
// INTERACTION HANDLER
// -----------------------
client.on('interactionCreate', async (interaction) => {
  // Button for Verification Join
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
        return interaction.reply({ content: "Error: Please join a voice channel and try again.", ephemeral: true });
      }
    }
    if (member.voice.channelId !== vcId) {
      await member.voice.setChannel(vcId);
    }
    session.assignedVerificator = interaction.user.id;
    verificationSessions.set(vcId, session);
    return interaction.reply({ content: "You've joined the verification room. You can now verify the user with +boy or +girl.", ephemeral: true });
  }
  // Slash Command interactions (e.g., /help, /kick, etc.)
  else if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const memberVC = interaction.member.voice.channel;
    if (!memberVC) return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
    
    // (The slash command handling for tap commands, admin commands, etc. goes here)
    // For brevity, we'll assume these remain as in your previous code.
    // ...
    // Example: Handling the /help command:
    if (commandName === "help") {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle("Available Commands")
        .setDescription("Use these commands to manage your tap, verify users, view profiles, and more!")
        .addFields(
          { name: "Profile Viewer", value: "`r` → Show profile picture view (Avatar/Banner buttons)", inline: false },
          { name: "Tap Commands", value: "`/kick`, `/reject`, `/perm`, `/claim`, `/lock`, `/unlock`, `/limit`, `/name`, `/status`, `/mute`, `/unmute`", inline: false }
        );
      if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        helpEmbed.addFields(
          { name: "Admin Commands", value: "`/unban`, `/binfo`, `/jinfo`, `/jailed`, `/topvrf`, `/toponline`\n`+jail`, `+unjail`", inline: false }
        );
      }
      return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
    // (Other slash command cases would follow similarly)
  }
});

// -----------------------
// MESSAGE COMMAND HANDLER (Profile Viewer)
// -----------------------
// We now only support the "R" command for profile picture viewing.
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  // ----- R COMMAND: Show profile picture view with Avatar/Banner buttons -----
  if (content.toLowerCase().startsWith('r')) {
    let targetUser = message.mentions.users.first() || message.author;
    try {
      targetUser = await targetUser.fetch();
    } catch (err) {
      console.error("Error fetching user data:", err);
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
    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

// -----------------------
// BUTTON INTERACTION HANDLER (Profile Viewer Buttons)
// -----------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
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
    await interaction.update({ embeds: [embed] });
  }
});

// -----------------------
// Additional Message Commands (Verification & Jail)
// -----------------------
client.on('messageCreate', async (message) => {
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
      await memberToVerify.send("# No Toxic Guys Here ❌️☢️ 7na Hna Bash Nchilliw Wnstmt3o Bw9tna ...Mar7ba Bik Mara Akhra ⚘️♥️");
      message.channel.send(`<@${memberToVerify.id}> was verified as ${verifiedRoleName} successfully!`);
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
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You don't have permission to use this command.");
    }
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
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You don't have permission to use this command.");
    }
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
