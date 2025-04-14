require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, Collection,
  ChannelType, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder, Events, REST, Routes,
  SlashCommandBuilder, PermissionsBitField
} = require('discord.js');
const { MongoClient } = require('mongodb');

// ======================
// 1. COMPLETE LANGUAGE SYSTEM (ALL TRANSLATIONS)
// ======================
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
    needHelpLogChannelId: "🔹 **# Provide the Need Help Log Channel ID** (or type `none`)",
    jailLogChannelId: "🔹 **# Provide the Jail Log Channel ID** (or type `none`)"
  },
  darija: {
    verifiedRoleId: "🔹 **3tini l'ID dial Verified Boy Role**",
    unverifiedRoleId: "🔹 **3tini l'ID dial Unverified Role**",
    verifiedGirlRoleId: "🔹 **3tini l'ID dial Verified Girl Role**",
    verificatorRoleId: "🔹 **3tini l'ID dial Verificator Role**",
    voiceVerificationChannelId: "🔹 **Daba 3tini l'ID dial Join Verification (fen bnadem taytverifa ✅️)**",
    oneTapChannelId: "🔹 **3tini daba l'ID dial One-Tap**",
    verificationAlertChannelId: "🔹 **3tini daba l'ID dial Verification Alerts**",
    jailRoleId: "🔹 **3tini l'ID dial Jailed Role** (awla la ma3endeksh, kteb `none`)",
    voiceJailChannelId: "🔹 **Ara m3ak l'ID dial Jailed voice channel** (awla la ma3endeksh kteb `none`)",
    verificationLogChannelId: "🔹 **3tini l'ID dial Verification logs** (awla la ma3endeksh kteb `none`)",
    needHelpChannelId: "🔹 **3tini l'ID dial Need Help channel**",
    helperRoleId: "🔹 **3tini l'ID dial Helper Role**",
    needHelpLogChannelId: "🔹 **3tini l'ID dial Need Help logs** (awla `none`)",
    jailLogChannelId: "🔹 **3tini l'ID dial Jail Log Channel** (awla `none`)"
  },
  spanish: {
    verifiedRoleId: "🔹 **# Proporciona el ID del rol Verified Boy**",
    unverifiedRoleId: "🔹 **# Proporciona el ID del rol Unverified**",
    verifiedGirlRoleId: "🔹 **# Proporciona el ID del rol Verified Girl**",
    verificatorRoleId: "🔹 **# Proporciona el ID del rol Verificator**",
    voiceVerificationChannelId: "🔹 **# Proporciona el ID del canal permanente de verificación**",
    oneTapChannelId: "🔹 **# Proporciona el ID del canal One-Tap**",
    verificationAlertChannelId: "🔹 **# Proporciona el ID del canal de alertas de verificación**",
    jailRoleId: "🔹 **# Proporciona el ID del rol Jail** (o escribe `none`)",
    voiceJailChannelId: "🔹 **# Proporciona el ID del canal de voz de Jail** (o escribe `none`)",
    verificationLogChannelId: "🔹 **# Proporciona el ID del canal de logs de verificación** (o escribe `none`)",
    needHelpChannelId: "🔹 **# Proporciona el ID del canal Need Help**",
    helperRoleId: "🔹 **# Proporciona el ID del rol Helper**",
    needHelpLogChannelId: "🔹 **# Proporciona el ID del canal de logs Need Help** (o escribe `none`)",
    jailLogChannelId: "🔹 **# Proporciona el ID del canal de logs de Jail** (o escribe `none`)"
  },
  russian: {
    verifiedRoleId: "🔹 **# Укажите ID роли для подтверждённого парня**",
    unverifiedRoleId: "🔹 **# Укажите ID роли для неподтверждённого пользователя**",
    verifiedGirlRoleId: "🔹 **# Укажите ID роли для подтверждённой девочки**",
    verificatorRoleId: "🔹 **# Укажите ID роли для проверяющего**",
    voiceVerificationChannelId: "🔹 **# Укажите ID постоянного голосового канала проверки**",
    oneTapChannelId: "🔹 **# Укажите ID канала One-Tap**",
    verificationAlertChannelId: "🔹 **# Укажите ID канала уведомлений о проверке**",
    jailRoleId: "🔹 **# Укажите ID роли для тюрьмы** (или напишите `none`)",
    voiceJailChannelId: "🔹 **# Укажите ID голосового канала тюрьмы** (или напишите `none`)",
    verificationLogChannelId: "🔹 **# Укажите ID канала логов проверки** (или напишите `none`)",
    needHelpChannelId: "🔹 **# Укажите ID канала Need Help**",
    helperRoleId: "🔹 **# Укажите ID роли для помощника**",
    needHelpLogChannelId: "🔹 **# Укажите ID канала логов Need Help** (или напишите `none`)",
    jailLogChannelId: "🔹 **# Укажите ID канала логов Jail** (или напишите `none`)"
  },
  french: {
    verifiedRoleId: "🔹 **# Fournissez l'ID du rôle Verified Boy**",
    unverifiedRoleId: "🔹 **# Fournissez l'ID du rôle Unverified**",
    verifiedGirlRoleId: "🔹 **# Fournissez l'ID du rôle Verified Girl**",
    verificatorRoleId: "🔹 **# Fournissez l'ID du rôle Verificator**",
    voiceVerificationChannelId: "🔹 **# Fournissez l'ID du canal vocal de vérification permanent**",
    oneTapChannelId: "🔹 **# Fournissez l'ID du canal One-Tap**",
    verificationAlertChannelId: "🔹 **# Fournissez l'ID du canal d'alertes de vérification**",
    jailRoleId: "🔹 **# Fournissez l'ID du rôle Jail** (ou tapez `none`)",
    voiceJailChannelId: "🔹 **# Fournissez l'ID du canal vocal Jail** (ou tapez `none`)",
    verificationLogChannelId: "🔹 **# Fournissez l'ID du canal de logs de vérification** (ou tapez `none`)",
    needHelpChannelId: "🔹 **# Fournissez l'ID du canal Need Help**",
    helperRoleId: "🔹 **# Fournissez l'ID du rôle Helper**",
    needHelpLogChannelId: "🔹 **# Fournissez l'ID du canal de logs Need Help** (ou tapez `none`)",
    jailLogChannelId: "🔹 **# Fournissez l'ID du canal de logs de Jail** (ou tapez `none`)"
  }
};

const languageExtras = {
  english: {
    setupStart: "Let's begin setup. Please copy/paste each ID as prompted.",
    setupComplete: "Setup complete! 🎉",
    languageSet: "Language set to English",
    noVoiceChannel: "❌ You must be in a voice channel",
    tapOwned: "❌ This tap already has an owner",
    claimSuccess: "✅ You now own this tap!",
    notOwner: "❌ You don't own this tap",
    permSuccess: "✅ %s can now join your tap",
    rejectSuccess: "✅ %s was kicked and blocked",
    jailSuccess: "✅ %s has been jailed",
    welcomeDM: "Welcome to our server! Please verify in #verification"
  },
  darija: {
    setupStart: "Ghanbdaw Daba Setup. Wghade ykon kolshi sahel, sift lia ghi l'ID's li ghansewlek 3lihom osafi, 7de la ykono galten se no l'bot maghykhdemsh ❌️.",
    setupComplete: "Safi l'Bot rah m9ad 100%. Wila khasek shi haja, twasel ma3a Franco 🔱 / Username: @im_franco 🎉.",
    languageSet: "Language mseta 3la Darija",
    noVoiceChannel: "❌ Khassk tkoun fi voice channel",
    tapOwned: "❌ Had tap 3andha malina déja",
    claimSuccess: "✅ Daba wliti nta mol had tap!",
    notOwner: "❌ Ma3andkch l7a9 nta mashi mol tap",
    permSuccess: "✅ %s Db ymkn ydkhol ltap",
    rejectSuccess: "✅ %s Trejecta o maba9ish y9der ydkhol",
    jailSuccess: "✅ %s Haaah Tjayla ",
    welcomeDM: "# Marhba Bik Fi Server Dialna ! Tverifa f #verification"
  },
  spanish: {
    setupStart: "Comencemos la configuración. Por favor, copia y pega cada ID según se te solicite.",
    setupComplete: "¡Configuración completada! 🎉",
    languageSet: "Idioma establecido en Español",
    noVoiceChannel: "❌ Debes estar en un canal de voz",
    tapOwned: "❌ Este canal ya tiene dueño",
    claimSuccess: "✅ ¡Ahora eres dueño de este canal!",
    notOwner: "❌ No eres el dueño de este canal",
    permSuccess: "✅ %s puede unirse a tu canal",
    rejectSuccess: "✅ %s fue expulsado y bloqueado",
    jailSuccess: "✅ %s ha sido encarcelado",
    welcomeDM: "¡Bienvenido a nuestro servidor! Por favor verifícate en #verificación"
  },
  russian: {
    setupStart: "Давайте начнём настройку. Пожалуйста, скопируйте и вставьте каждый ID по запросу.",
    setupComplete: "Настройка завершена! 🎉",
    languageSet: "Язык изменён на Русский",
    noVoiceChannel: "❌ Вы должны быть в голосовом канале",
    tapOwned: "❌ У этого канала уже есть владелец",
    claimSuccess: "✅ Теперь вы владелец этого канала!",
    notOwner: "❌ Вы не владелец этого канала",
    permSuccess: "✅ %s может присоединиться к вашему каналу",
    rejectSuccess: "✅ %s был кикнут и заблокирован",
    jailSuccess: "✅ %s был заключён",
    welcomeDM: "Добро пожаловать на наш сервер! Пожалуйста, верифицируйтесь в #верификация"
  },
  french: {
    setupStart: "Commençons la configuration. Veuillez copier/coller chaque ID tel qu'indiqué.",
    setupComplete: "Configuration terminée ! 🎉",
    languageSet: "Langue définie sur Français",
    noVoiceChannel: "❌ Vous devez être dans un salon vocal",
    tapOwned: "❌ Ce salon a déjà un propriétaire",
    claimSuccess: "✅ Vous êtes maintenant propriétaire de ce salon!",
    notOwner: "❌ Vous n'êtes pas propriétaire de ce salon",
    permSuccess: "✅ %s peut maintenant rejoindre votre salon",
    rejectSuccess: "✅ %s a été expulsé et bloqué",
    jailSuccess: "✅ %s a été emprisonné",
    welcomeDM: "Bienvenue sur notre serveur! Veuillez vous vérifier dans #vérification"
  }
};

// ======================
// 2. DATABASE CONNECTION
// ======================
const mongoClient = new MongoClient(process.env.MONGODB_URI, {
  connectTimeoutMS: 10000,
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 10000
});

async function connectToMongo() {
  try {
    await mongoClient.connect();
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

// ======================
// 3. BOT CLIENT SETUP
// ======================
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

// ======================
// 4. COMMAND REGISTRATION
// ======================
const commands = [
  // Verification Commands
  new SlashCommandBuilder()
    .setName('boy')
    .setDescription('Verify user as boy')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),
  
  new SlashCommandBuilder()
    .setName('girl')
    .setDescription('Verify user as girl')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),

  // One-Tap Commands
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim ownership of current tap'),
  
  new SlashCommandBuilder()
    .setName('perm')
    .setDescription('Allow user to join your tap')
    .addUserOption(option => option.setName('user').setDescription('User to permit').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Kick and block user from your tap')
    .addUserOption(option => option.setName('user').setDescription('User to reject').setRequired(true)),

  // Moderation Commands
  new SlashCommandBuilder()
    .setName('jail')
    .setDescription('Jail a user')
    .addUserOption(option => option.setName('user').setDescription('User to jail').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for jailing').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

  // Admin Commands
  new SlashCommandBuilder()
    .setName('aji')
    .setDescription('Move user to your voice channel')
    .addUserOption(option => option.setName('user').setDescription('User to move').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log("✅ Commands registered");
  } catch (error) {
    console.error("❌ Command registration failed:", error);
  }
}

// ======================
// 5. EVENT HANDLERS
// ======================
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot ready as ${client.user.tag}`);
  await connectToMongo();
  await registerCommands();
});

client.on(Events.GuildCreate, async guild => {
  const owner = await guild.fetchOwner();
  const embed = new EmbedBuilder()
    .setTitle("🆕 New Guild Request")
    .setDescription(`Guild: ${guild.name}\nOwner: ${owner.user.tag}`);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_${guild.id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reject_${guild.id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
  );

  try {
    const godfather = await client.users.fetch("849430458131677195");
    await godfather.send({ embeds: [embed], components: [buttons] });
  } catch (err) {
    console.error("Approval error:", err);
    await guild.leave();
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName } = interaction;
    const config = await mongoClient.db().collection('serverSettings').findOne({ serverId: interaction.guild.id });
    const lang = config?.language || 'english';

    switch(commandName) {
      case 'boy':
        await handleBoyVerification(interaction, config);
        break;
      case 'girl':
        await handleGirlVerification(interaction, config);
        break;
      case 'claim':
        await handleClaimTap(interaction, lang);
        break;
      case 'perm':
        await handlePermUser(interaction, lang);
        break;
      case 'reject':
        await handleRejectUser(interaction, lang);
        break;
      case 'jail':
        await handleJailUser(interaction, config);
        break;
      case 'aji':
        await handleAjiCommand(interaction);
        break;
    }
  } catch (error) {
    console.error("Command error:", error);
    await interaction.reply({ content: "❌ An error occurred", ephemeral: true });
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.content.toLowerCase() === 'r') {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setTitle(`${target.username}'s Profile`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }));

    const avatarBtn = new ButtonBuilder()
      .setCustomId(`avatar_${target.id}`)
      .setLabel("Avatar")
      .setStyle(ButtonStyle.Primary);

    const bannerBtn = new ButtonBuilder()
      .setCustomId(`banner_${target.id}`)
      .setLabel("Banner")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(avatarBtn, bannerBtn);
    await message.reply({ embeds: [embed], components: [row] });
  }
});

// ======================
// 6. COMMAND HANDLERS
// ======================
async function handleClaimTap(interaction, lang) {
  if (!interaction.member.voice?.channel) {
    return interaction.reply({
      content: languageExtras[lang].noVoiceChannel,
      ephemeral: true
    });
  }

  const channel = interaction.member.voice.channel;
  const existing = await mongoClient.db().collection('taps').findOne({ channelId: channel.id });

  if (existing && channel.members.has(existing.ownerId)) {
    return interaction.reply({
      content: languageExtras[lang].tapOwned,
      ephemeral: true
    });
  }

  await mongoClient.db().collection('taps').updateOne(
    { channelId: channel.id },
    { $set: { ownerId: interaction.user.id, language: lang } },
    { upsert: true }
  );

  await interaction.reply({
    content: languageExtras[lang].claimSuccess,
    ephemeral: false
  });
}

async function handlePermUser(interaction, lang) {
  const user = interaction.options.getUser('user');
  const channel = interaction.member.voice?.channel;
  
  if (!channel) {
    return interaction.reply({
      content: languageExtras[lang].noVoiceChannel,
      ephemeral: true
    });
  }

  const tapData = await mongoClient.db().collection('taps').findOne({ channelId: channel.id });
  if (!tapData || tapData.ownerId !== interaction.user.id) {
    return interaction.reply({
      content: languageExtras[lang].notOwner,
      ephemeral: true
    });
  }

  await channel.permissionOverwrites.edit(user.id, { Connect: true });
  await interaction.reply({
    content: languageExtras[lang].permSuccess.replace('%s', user.username),
    ephemeral: false
  });
}

async function handleRejectUser(interaction, lang) {
  const user = interaction.options.getUser('user');
  const channel = interaction.member.voice?.channel;
  
  if (!channel) {
    return interaction.reply({
      content: languageExtras[lang].noVoiceChannel,
      ephemeral: true
    });
  }

  const tapData = await mongoClient.db().collection('taps').findOne({ channelId: channel.id });
  if (!tapData || tapData.ownerId !== interaction.user.id) {
    return interaction.reply({
      content: languageExtras[lang].notOwner,
      ephemeral: true
    });
  }

  // Kick if in voice channel
  const member = await interaction.guild.members.fetch(user.id);
  if (member.voice?.channelId === channel.id) {
    await member.voice.disconnect();
  }

  // Block future joins
  await channel.permissionOverwrites.edit(user.id, { Connect: false });
  
  await interaction.reply({
    content: languageExtras[lang].rejectSuccess.replace('%s', user.username),
    ephemeral: false
  });
}

async function handleJailUser(interaction, config) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const member = await interaction.guild.members.fetch(user.id);

  // Jail logic
  if (config.jailRoleId) {
    await member.roles.add(config.jailRoleId);
  }
  
  if (config.voiceJailChannelId && member.voice.channel) {
    await member.voice.setChannel(config.voiceJailChannelId);
  }

  // Save jail data
  await mongoClient.db().collection('jailedUsers').insertOne({
    userId: user.id,
    guildId: interaction.guild.id,
    reason: reason,
    jailedBy: interaction.user.id,
    jailedAt: new Date()
  });

  // Log to jail channel if configured
  if (config.jailLogChannelId) {
    const logChannel = await interaction.guild.channels.fetch(config.jailLogChannelId);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle("User Jailed")
        .setDescription(`**User:** ${user.tag}\n**Reason:** ${reason}`)
        .setColor(0xff0000)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] });
    }
  }

  await interaction.reply({
    content: languageExtras[config.language || 'english'].jailSuccess.replace('%s', user.username),
    ephemeral: false
  });
}

async function handleAjiCommand(interaction) {
  const user = interaction.options.getUser('user');
  const member = await interaction.guild.members.fetch(user.id);
  
  if (!interaction.member.voice?.channel) {
    return interaction.reply({
      content: "❌ You must be in a voice channel",
      ephemeral: true
    });
  }

  await member.voice.setChannel(interaction.member.voice.channel);
  await interaction.reply({
    content: `✅ ${user.username} moved to your channel`,
    ephemeral: false
  });
}

// ======================
// 7. START THE BOT
// ======================
client.login(process.env.DISCORD_TOKEN)
  .catch(err => {
    console.error("❌ Login failed:", err);
    process.exit(1);
  });

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});
