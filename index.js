// index.js
// Franco's Armada Bot – Complete Code with Setup, Multi-Language Configuration,
// Verification (/boy, /girl), One-Tap, Need-Help, /aji and Notifications

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

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (client.user.username !== "Franco's Armada") {
    client.user.setUsername("Franco's Armada").catch(console.error);
  }
});

// ------------------------------
// Global Maps for Sessions & Setup
// ------------------------------
const setupStarted = new Map();            // prevent double setups per guild
const verificationSessions = new Map();      // stores verification ephemeral channel sessions {userId: ...}
const onetapSessions = new Map();            // stores one-tap & need-help ephemeral channel sessions {owner, type, rejectedUsers}
const jailData = new Map();                  // for jail/unban commands

// ------------------------------
// Language Prompts and Extras for Setup
// (Below are the English entries; add your other language objects as needed)
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
  // Add darija, spanish, russian, french objects here...
};

const languageExtras = {
  english: {
    setupStart: "Let's begin setup. Please copy/paste each ID as prompted.",
    setupComplete: "Setup complete! 🎉"
  },
  // Add darija, spanish, russian, french objects here...
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
// runSetup Function: Interactive Setup Process
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
// Slash Commands Registration
// ------------------------------
client.commands = new Collection();
const slashCommands = [
  // Global commands:
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
  // Session Commands:
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
  new SlashCommandBuilder().setName('help').setDescription('Show available commands'),
  // New Verification Commands – only verificators can use these:
  new SlashCommandBuilder().setName('boy').setDescription('Verify as Boy (verificators only)'),
  new SlashCommandBuilder().setName('girl').setDescription('Verify as Girl (verificators only)'),
  // New Admin Command: /aji – Move a tagged user to your current voice channel
  new SlashCommandBuilder().setName('aji')
    .setDescription('Move a tagged user to your current voice channel (admin only)')
    .addUserOption(o => o.setName('target').setDescription('User to move').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
];

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
// InteractionCreate Handler for Buttons & Slash Commands
// ------------------------------
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    // Handle "Join Help" button – only helpers (or admins) can use it
    if (interaction.customId.startsWith("join_help_")) {
      const parts = interaction.customId.split("_");
      const ephemeralChannelId = parts.slice(2).join("_");
      const session = onetapSessions.get(ephemeralChannelId);
      if (!session) return interaction.reply({ content: "No help session found.", ephemeral: true });
      const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
      if (
        !config ||
        (!interaction.member.roles.cache.has(config.helperRoleId) &&
         !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator))
      ) {
        return interaction.reply({ content: "You are not allowed to join this help session.", ephemeral: true });
      }
      try {
        if (interaction.guild.channels.cache.get(ephemeralChannelId).members.size >= 2) {
          return interaction.reply({ content: "A helper has already joined this session.", ephemeral: true });
        }
        await interaction.member.voice.setChannel(ephemeralChannelId);
        return interaction.reply({ content: "You've joined the help session!", ephemeral: true });
      } catch (err) {
        console.error("join_help error:", err);
        return interaction.reply({ content: "Failed to join help session.", ephemeral: true });
      }
    }
    
    // Handle "Join Verification" button – only verificators (or admins) can use it
    if (interaction.customId.startsWith("join_verification_")) {
      const parts = interaction.customId.split("_");
      const ephemeralChannelId = parts.slice(2).join("_");
      const ephemeralChannel = interaction.guild.channels.cache.get(ephemeralChannelId);
      if (!ephemeralChannel) return interaction.reply({ content: "Verification session not found.", ephemeral: true });
      if (ephemeralChannel.members.size >= 2) {
        return interaction.reply({ content: "A verificator has already joined this session.", ephemeral: true });
      }
      const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
      if (
        !config ||
        (!interaction.member.roles.cache.has(config.verificatorRoleId) &&
         !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator))
      ) {
        return interaction.reply({ content: "You are not allowed to verify members.", ephemeral: true });
      }
      try {
        await interaction.member.voice.setChannel(ephemeralChannelId);
        return interaction.reply({ content: "You've joined the verification session!", ephemeral: true });
      } catch (err) {
        console.error("join_verification error:", err);
        return interaction.reply({ content: "Failed to join verification session.", ephemeral: true });
      }
    }
    
    // Handle Avatar/Banner buttons (unchanged)
    if (interaction.customId.startsWith("avatar_") || interaction.customId.startsWith("banner_")) {
      const [action, userId] = interaction.customId.split('_');
      if (!userId) return;
      try {
        const targetUser = await client.users.fetch(userId, { force: true });
        if (action === 'avatar') {
          const avatarURL = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });
          const embed = new EmbedBuilder().setColor(0x00AE86).setTitle(`${targetUser.username}'s Avatar`).setImage(avatarURL);
          return interaction.update({ embeds: [embed], components: [] });
        } else if (action === 'banner') {
          const bannerURL = targetUser.bannerURL({ dynamic: true, size: 1024 });
          if (!bannerURL) return interaction.reply({ content: "No banner set.", ephemeral: true });
          const embed = new EmbedBuilder().setColor(0x00AE86).setTitle(`${targetUser.username}'s Banner`).setImage(bannerURL);
          return interaction.update({ embeds: [embed], components: [] });
        }
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Error fetching user data.", ephemeral: true });
      }
    }
    return; // end button handling
  }
  
  // Slash Command Handling
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const config = await settingsCollection.findOne({ serverId: interaction.guild.id });
  if (!config) {
    return interaction.reply({ content: "Bot is not configured for this server.", ephemeral: true });
  }
  
  // Global Admin commands (setprefix, setwelcome, etc.) – assume unchanged (you can insert your logic here)
  const globalCmds = ["setprefix", "setwelcome", "showwelcome", "jail", "jinfo", "unban", "binfo", "topvrf", "toponline"];
  if (globalCmds.includes(commandName)) {
    // ... (existing logic for these commands) ...
    return;
  }
  
  // New Verification Commands: /boy and /girl (verificators only)
  if (commandName === "boy" || commandName === "girl") {
    if (!interaction.member.roles.cache.has(config.verificatorRoleId) &&
        !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "You are not allowed to verify members.", ephemeral: true });
    }
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
    }
    const vc = interaction.member.voice.channel;
    if (!verificationSessions.has(vc.id)) {
      return interaction.reply({ content: "This is not a verification session channel.", ephemeral: true });
    }
    const sessionData = verificationSessions.get(vc.id);
    const unverifiedMember = interaction.guild.members.cache.get(sessionData.userId);
    if (!unverifiedMember) {
      return interaction.reply({ content: "No unverified user found in this session.", ephemeral: true });
    }
    try {
      // Remove unverified role from the unverified member
      if (config.unverifiedRoleId) {
        await unverifiedMember.roles.remove(config.unverifiedRoleId);
      }
      // Add appropriate verified role based on command used
      if (commandName === "boy") {
        if (config.verifiedRoleId) {
          await unverifiedMember.roles.add(config.verifiedRoleId);
        }
        await interaction.reply({ content: `${unverifiedMember} has been verified as Boy successfully ✨️`, ephemeral: false });
      } else if (commandName === "girl") {
        if (config.verifiedGirlRoleId) {
          await unverifiedMember.roles.add(config.verifiedGirlRoleId);
        }
        await interaction.reply({ content: `${unverifiedMember} has been verified as Girl successfully ✨️`, ephemeral: false });
      }
      // Optionally, delete the verification session channel now that verification is complete.
      vc.delete().catch(() => {});
      verificationSessions.delete(vc.id);
    } catch (err) {
      console.error("Verification error:", err);
      return interaction.reply({ content: "Verification failed. Check my permissions or role hierarchy.", ephemeral: true });
    }
    return;
  }
  
  // New Admin Command: /aji – Move a tagged user to your current voice channel
  if (commandName === "aji") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "You are not allowed to use this command.", ephemeral: true });
    }
    const targetUser = interaction.options.getUser("target");
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    if (!interaction.member.voice.channel) {
      return interaction.reply({ content: "You must be in a voice channel to use this command.", ephemeral: true });
    }
    try {
      await targetMember.voice.setChannel(interaction.member.voice.channel.id);
      return interaction.reply({ content: `Moved ${targetMember.displayName} to your channel.`, ephemeral: true });
    } catch (err) {
      console.error("aji error:", err);
      return interaction.reply({ content: "Failed to move the user.", ephemeral: true });
    }
  }
  
  // Session Commands (claim, mute, etc.) – assume unchanged (insert your existing logic here)
});

// ------------------------------
// MessageCreate Handler for Setup and Other Commands
// (Text-based commands like "ready", "R" command, and (old) +boy/+girl are here if needed)
// ------------------------------
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  // "Ready" Handler in "bot-setup" channel for interactive setup
  if (message.channel.name === 'bot-setup') {
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
        // Delete the setup channel after a short delay
        setTimeout(() => { message.channel.delete().catch(() => {}); }, 5000);
      } catch (err) {
        console.error("Setup error:", err);
      }
    }
    return;
  }
  
  // "R" Command for Profile Viewer (unchanged logic)
  if ((message.content.trim().toLowerCase() === 'r' || message.content.trim().toLowerCase().startsWith('r ')) &&
      message.content.trim().toLowerCase() !== 'ready') {
    // (Insert your "R" command logic here)
  }
  
  // Remove old text commands for verification (such as +boy/+girl) if desired.
});

// ------------------------------
// On Guild Join: Create "bot-setup" and "bot-config" Channels, Tag Owner, and Send Language Buttons
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
    setupChannel.send(`<@${owner.id}>, welcome! Please choose your preferred language using the buttons below, then type "ready" to begin setup.`);
    await guild.channels.create({
      name: 'bot-config',
      type: 0,
      topic: 'Use slash commands for configuration (e.g. /setprefix, /setwelcome, etc.)',
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: owner.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    // Send language selection buttons
    const englishButton = new ButtonBuilder().setCustomId('lang_english').setLabel('English').setStyle(ButtonStyle.Primary);
    const darijaButton = new ButtonBuilder().setCustomId('lang_darija').setLabel('Darija').setStyle(ButtonStyle.Primary);
    const spanishButton = new ButtonBuilder().setCustomId('lang_spanish').setLabel('Spanish').setStyle(ButtonStyle.Primary);
    const russianButton = new ButtonBuilder().setCustomId('lang_russian').setLabel('Russian').setStyle(ButtonStyle.Primary);
    const frenchButton = new ButtonBuilder().setCustomId('lang_french').setLabel('French').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(englishButton, darijaButton, spanishButton, russianButton, frenchButton);
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle("Welcome!")
      .setDescription("Select your language using the buttons below, then type `ready` to begin setup.");
    setupChannel.send({ embeds: [embed], components: [row] });
  } catch (e) {
    console.error("Setup channel error:", e);
  }
});

// ------------------------------
// Auto-assign Unverified Role on Member Join
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
// voiceStateUpdate Handler for Verification, One-Tap & Need-Help
// ------------------------------
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    console.log(`[DEBUG] voiceStateUpdate: old=${oldState.channelId}, new=${newState.channelId}, member=${newState.member.id}`);
    const member = newState.member;
    const guild = newState.guild;
    const config = await settingsCollection.findOne({ serverId: guild.id });
    if (!config) return;
    
    // 1. Verification Process
    if (config.voiceVerificationChannelId && newState.channelId === config.voiceVerificationChannelId) {
      // Only create ephemeral verification channel if member is unverified
      if (config.unverifiedRoleId && !member.roles.cache.has(config.unverifiedRoleId)) return;
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2,
        parent: parentCategory,
        userLimit: 2,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
          { id: member.id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.AttachFiles] }
        ]
      });
      verificationSessions.set(ephemeralChannel.id, { userId: member.id });
      await member.voice.setChannel(ephemeralChannel);
      if (config.verificationAlertChannelId && config.verificationAlertChannelId !== "none") {
        const alertChannel = guild.channels.cache.get(config.verificationAlertChannelId);
        if (alertChannel) {
          const alertText = `# New Member ${member.displayName} needs verification.`;
          const joinButton = new ButtonBuilder().setCustomId(`join_verification_${ephemeralChannel.id}`).setLabel("Join Verification").setStyle(ButtonStyle.Primary);
          const row = new ActionRowBuilder().addComponents(joinButton);
          await alertChannel.send({
            content: `<@&${config.verificatorRoleId}> ${alertText}`,
            components: [row],
            allowedMentions: { roles: [config.verificatorRoleId] }
          }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 11000));
        }
      }
      return;
    }
    
    // 2. One-Tap Process
    if (config.oneTapChannelId && newState.channelId === config.oneTapChannelId) {
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) return;
      for (const [channelId, session] of onetapSessions.entries()) {
        if (session.owner === member.id && session.type === "oneTap") {
          const oldChan = guild.channels.cache.get(channelId);
          if (oldChan) await oldChan.delete().catch(() => {});
          onetapSessions.delete(channelId);
        }
      }
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `${member.displayName}'s Room`,
        type: 2,
        parent: parentCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
          { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles] }
        ]
      });
      onetapSessions.set(ephemeralChannel.id, { owner: member.id, type: "oneTap", rejectedUsers: [] });
      await member.voice.setChannel(ephemeralChannel);
    }
    
    // 3. Need-Help Process
    if (config.needHelpChannelId && newState.channelId === config.needHelpChannelId) {
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) return;
      for (const [channelId, session] of onetapSessions.entries()) {
        if (session.owner === member.id && session.type === "needHelp") {
          const oldChan = guild.channels.cache.get(channelId);
          if (oldChan) await oldChan.delete().catch(() => {});
          onetapSessions.delete(channelId);
        }
      }
      const parentCategory = newState.channel.parentId;
      const ephemeralChannel = await guild.channels.create({
        name: `${member.displayName} needs help`,
        type: 2,
        parent: parentCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
          { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.AttachFiles] }
        ]
      });
      onetapSessions.set(ephemeralChannel.id, { owner: member.id, type: "needHelp", rejectedUsers: [] });
      await member.voice.setChannel(ephemeralChannel);
      if (config.needHelpLogChannelId && config.needHelpLogChannelId !== "none") {
        const logChannel = guild.channels.cache.get(config.needHelpLogChannelId);
        if (logChannel) {
          const helpText = `# ${member.displayName} needs help.`;
          const joinButton = new ButtonBuilder().setCustomId(`join_help_${ephemeralChannel.id}`).setLabel("Join Help").setStyle(ButtonStyle.Danger);
          const row = new ActionRowBuilder().addComponents(joinButton);
          await logChannel.send({
            content: `<@&${config.helperRoleId}> ${helpText}`,
            components: [row],
            allowedMentions: { roles: [config.helperRoleId] }
          }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 11000));
        }
      }
    }
  } catch (err) {
    console.error("voiceStateUpdate error:", err);
  }
});

// ------------------------------
// Periodic Cleanup of Ephemeral Channels
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