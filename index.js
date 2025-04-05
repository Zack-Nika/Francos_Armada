// index.js
// Franco's Armada Bot – A fully featured rental bot with interactive, multilingual per‑server setup.
// This bot:
// • Connects to MongoDB to store per‑server settings (language, prefix, role/channel IDs).
// • On joining a server, creates a temporary "bot-setup" channel and sends a welcome embed with language buttons.
// • Guides the server owner through an interactive setup (all prompts are fully translated into the chosen language)
//   to collect required IDs for roles and channels.
// • Saves configuration to MongoDB and deletes the setup channel when finished.
// • Implements voice state handling for a verification system and a one‑tap system.
// • Provides slash commands for customization and one‑tap management (/claim, /reject, /kick, /mute, /unmute, /transfer, /name, /status)
//   as well as admin commands (/toponline, /topvrf, /binfo, /jinfo).
// • Provides a "R" message command to view a user's profile picture (with Avatar/Banner buttons).
//
// (Ensure your environment variables include DISCORD_TOKEN, MONGODB_URI, and any required IDs.)

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
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// MongoDB connection.
const { MongoClient } = require('mongodb');
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

// Create the Discord client.
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

// ==============================
// Language Translations for Setup Prompts (for required IDs)
// (For Darija, role/channel names remain in English.)
const languagePrompts = {
  english: {
    verifiedRoleId: "🔹 **# Please provide the Verified Role ID** (the role assigned to verified members).",
    unverifiedRoleId: "🔹 **# Now, provide the Unverified Role ID** (the role for new/unverified members).",
    verifiedGirlRoleId: "🔹 **# Next, please provide the Verified Girl Role ID**.",
    verificatorRoleId: "🔹 **# Please provide the Verificator Role ID** (the role for those who verify new users).",
    voiceVerificationChannelId: "🔹 **# Send the Voice Verification Channel ID** (where new users join for verification).",
    oneTapChannelId: "🔹 **# Now, send the One-Tap Channel ID** (for creating one-tap voice channels).",
    verificationAlertChannelId: "🔹 **# Send the Verification Alert Channel ID** (where verification alerts are posted).",
    jailRoleId: "🔹 **# Provide the Jail Role ID** (for jailed users). If not applicable, type `none`.",
    voiceJailChannelId: "🔹 **# Finally, send the Voice Jail Channel ID** (for jailed users). If not applicable, type `none`."
  },
  darija: {
    verifiedRoleId: "🔹 **# 3afak 3tini l'ID dyal Verified Role** (Role li kayt3ti l'users verified).",
    unverifiedRoleId: "🔹 **# Daba 3tini l'ID dyal Unverified Role** (role dyal new/unverified users).",
    verifiedGirlRoleId: "🔹 **# 3tini l'ID dyal Verified Girl Role**.",
    verificatorRoleId: "🔹 **# Wdaba 3tini l'ID dyal Verificator Role**.",
    voiceVerificationChannelId: "🔹 **# 3tini l'ID dyal Voice Verification Channel** (fin kaydkhlu l'users jdod).",
    oneTapChannelId: "🔹 **# 3tini l'ID dyal One-Tap Channel** (bash tkon private voice rooms).",
    verificationAlertChannelId: "🔹 **# 3tini l'ID dyal Verification Alert Channel**.",
    jailRoleId: "🔹 **# 3tini l'ID dyal Jail Role** (ila ma kaynach, ktb `none`).",
    voiceJailChannelId: "🔹 **# 3tini l'ID dyal Voice Jail Channel** (ila ma kaynach, ktb `none`)."
  },
  spanish: {
    verifiedRoleId: "🔹 **# Por favor, proporciona el ID del Rol Verificado** (el rol asignado a los miembros verificados).",
    unverifiedRoleId: "🔹 **# Ahora, proporciona el ID del Rol No Verificado** (el rol para nuevos miembros).",
    verifiedGirlRoleId: "🔹 **# A continuación, proporciona el ID del Rol de Verificadas**.",
    verificatorRoleId: "🔹 **# Por favor, proporciona el ID del Rol de Verificadores** (rol para quienes verifican nuevos usuarios).",
    voiceVerificationChannelId: "🔹 **# Envía el ID del Canal de Verificación de Voz** (donde los nuevos usuarios se unen para la verificación).",
    oneTapChannelId: "🔹 **# Ahora, envía el ID del Canal One-Tap** (para la creación de canales de voz privados).",
    verificationAlertChannelId: "🔹 **# Envía el ID del Canal de Alertas de Verificación** (donde se publican las alertas de verificación).",
    jailRoleId: "🔹 **# Proporciona el ID del Rol de Cárcel** (para usuarios en cárcel). Si no aplica, escribe `none`.",
    voiceJailChannelId: "🔹 **# Finalmente, envía el ID del Canal de Voz para Cárcel**. Si no aplica, escribe `none`."
  },
  russian: {
    verifiedRoleId: "🔹 **# Пожалуйста, предоставьте ID роли для Verified Role** (роль, назначаемая проверенным участникам).",
    unverifiedRoleId: "🔹 **# Теперь предоставьте ID роли для Unverified Role** (роль для новых участников).",
    verifiedGirlRoleId: "🔹 **# Далее, предоставьте ID роли для Verified Girl Role**.",
    verificatorRoleId: "🔹 **# Пожалуйста, предоставьте ID роли для Verificator Role** (роль для тех, кто проверяет новых пользователей).",
    voiceVerificationChannelId: "🔹 **# Отправьте ID голосового канала для Voice Verification Channel** (где новые пользователи присоединяются для проверки).",
    oneTapChannelId: "🔹 **# Теперь отправьте ID канала One-Tap Channel** (для создания приватных голосовых каналов).",
    verificationAlertChannelId: "🔹 **# Отправьте ID текстового канала для Verification Alert Channel**.",
    jailRoleId: "🔹 **# Предоставьте ID роли для Jail Role** (если не применимо, введите `none`).",
    voiceJailChannelId: "🔹 **# Наконец, отправьте ID голосового канала для Voice Jail Channel** (если не применимо, введите `none`)."
  },
  french: {
    verifiedRoleId: "🔹 **# Veuillez fournir l'ID du rôle Verified Role** (le rôle attribué aux membres vérifiés).",
    unverifiedRoleId: "🔹 **# Maintenant, fournissez l'ID du rôle Unverified Role** (le rôle pour les nouveaux membres).",
    verifiedGirlRoleId: "🔹 **# Ensuite, veuillez fournir l'ID du rôle Verified Girl Role**.",
    verificatorRoleId: "🔹 **# Veuillez fournir l'ID du rôle Verificator Role** (le rôle pour ceux qui vérifient les nouveaux utilisateurs).",
    voiceVerificationChannelId: "🔹 **# Envoyez l'ID du canal vocal pour Voice Verification Channel** (là où les nouveaux utilisateurs se joignent pour être vérifiés).",
    oneTapChannelId: "🔹 **# Maintenant, envoyez l'ID du canal One-Tap Channel** (pour la création de canaux vocaux privés).",
    verificationAlertChannelId: "🔹 **# Envoyez l'ID du canal textuel pour Verification Alert Channel**.",
    jailRoleId: "🔹 **# Fournissez l'ID du rôle pour Jail Role** (si non applicable, tapez `none`).",
    voiceJailChannelId: "🔹 **# Enfin, envoyez l'ID du canal vocal pour Voice Jail Channel** (si non applicable, tapez `none`)."
  }
};

// ==============================
// Language Extras: Additional Setup Messages
// ==============================
const languageExtras = {
  english: {
    readyPrompt: "Great! Now type `ready` in this channel to begin the setup process. (You have 90 seconds per prompt.)",
    setupStart: "Alright, let's begin the setup process. I will ask you for a series of IDs. Please copy and paste each one as prompted.",
    setupComplete: "Thank you for your patience! Your bot is now fully set up. 🎉",
    intro: "Hello! I am Franco's Armada 🔱 – your versatile server management bot. I can help with verification, one-tap voice channels, moderation, and more. Made by Franco 🔱. Let's set sail together! ⚓"
  },
  darija: {
    readyPrompt: "Mzyan! Daba kteb `ready` f had channel bach nbda setup. (3andak 90 seconds f kol prompt.)",
    setupStart: "Yallah, daba nbda setup. Ghadi nsawlouk 3la b3d IDs. 3afak copier w coller kol wahed mnin ytb3at lik talabat.",
    setupComplete: "Choukrane 3la sbr dyalk! L'bot dyalk daba msetab kaml. 🎉",
    intro: "Salam! Ana Franco's Armada 🔱 – l'bot dyalk li kayt3awn m3ak f server b style. Kay3awn f verification, one-tap, modération w ktar. Made by Franco 🔱. Yallah, nbdaw l'mission! ⚓"
  },
  spanish: {
    readyPrompt: "¡Genial! Ahora escribe `ready` en este canal para comenzar el proceso de configuración. (Tienes 90 segundos por mensaje.)",
    setupStart: "Muy bien, vamos a comenzar el proceso de configuración. Te pediré una serie de IDs. Por favor, copia y pega cada uno cuando se te pida.",
    setupComplete: "¡Gracias por tu paciencia! Tu bot ya está completamente configurado. 🎉",
    intro: "¡Hola! Soy Franco's Armada 🔱 – tu bot versátil para gestionar el servidor. Puedo ayudar con verificación, canales de voz one-tap, moderación y más. Made by Franco 🔱. ¡Empecemos! ⚓"
  },
  russian: {
    readyPrompt: "Отлично! Теперь введите `ready` в этом канале, чтобы начать настройку. (У вас 90 секунд на каждый ответ.)",
    setupStart: "Хорошо, давайте начнем настройку. Я задам вам серию вопросов с ID. Пожалуйста, скопируйте и вставьте каждый ID, когда будет предложено.",
    setupComplete: "Спасибо за ваше терпение! Ваш бот теперь полностью настроен. 🎉",
    intro: "Привет! Я Franco's Armada 🔱 – ваш универсальный бот для управления сервером. Я помогаю с верификацией, каналами one-tap, модерацией и многим другим. Made by Franco 🔱. Давайте начнем! ⚓"
  },
  french: {
    readyPrompt: "Super ! Tapez maintenant `ready` dans ce canal pour commencer la configuration. (Vous avez 90 secondes par question.)",
    setupStart: "D'accord, commençons la configuration. Je vais vous demander une série d'ID. Veuillez copier-coller chacun d'eux lorsque cela est demandé.",
    setupComplete: "Merci pour votre patience ! Votre bot est maintenant entièrement configuré. 🎉",
    intro: "Bonjour ! Je suis Franco's Armada 🔱 – votre bot polyvalent pour gérer votre serveur. Je peux aider avec la vérification, les canaux vocaux one-tap, la modération et bien plus. Made by Franco 🔱. Allons-y ! ⚓"
  }
};

// ==============================
// Helper Function: Await a Single Message with 90s Timeout
// ==============================
async function awaitResponse(channel, userId, prompt, lang) {
  await channel.send(prompt + "\n*(You have 90 seconds to respond, or the setup will time out.)*");
  const filter = m => m.author.id === userId;
  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 90000, errors: ['time'] });
    return collected.first().content.trim();
  } catch (err) {
    await channel.send(
      (lang === "english" && "Setup timed out 🤷‍♂️. Please type `ready` to start the setup again.") ||
      (lang === "darija" && "Setup t9llat 🤷‍♂️. Kteb `ready` bach tbda men jdod.") ||
      (lang === "spanish" && "El tiempo de configuración ha expirado 🤷‍♂️. Por favor, escribe `ready` para reiniciar el proceso.") ||
      (lang === "russian" && "Время на настройку истекло 🤷‍♂️. Пожалуйста, введите `ready`, чтобы начать заново.") ||
      (lang === "french" && "Le délai de configuration a expiré 🤷‍♂️. Veuillez taper `ready` pour recommencer.")
    );
    throw new Error("Setup timed out");
  }
}

// ==============================
// Interactive Setup Process Function
// ==============================
async function runSetup(ownerId, setupChannel, guildId, lang) {
  const config = { serverId: guildId };
  const prompts = languagePrompts[lang];
  const promptEntries = Object.entries(prompts);
  await setupChannel.send(languageExtras[lang]?.setupStart);
  for (const [key, prompt] of promptEntries) {
    const response = await awaitResponse(setupChannel, ownerId, prompt, lang);
    config[key] = (response.toLowerCase() === "none") ? null : response;
  }
  try {
    await settingsCollection.updateOne(
      { serverId: guildId },
      { $set: config },
      { upsert: true }
    );
    await setupChannel.send(languageExtras[lang]?.setupComplete);
  } catch (err) {
    console.error("Error saving configuration:", err);
    await setupChannel.send(
      (lang === "english" && "There was an error saving your configuration. Please try again or contact support.") ||
      (lang === "darija" && "Chi mouchkil f saving configuration. 3awd 7awl awla t3ayet l'support.") ||
      (lang === "spanish" && "Hubo un error al guardar la configuración. Por favor, inténtalo de nuevo o contacta al soporte.") ||
      (lang === "russian" && "Произошла ошибка при сохранении настроек. Пожалуйста, попробуйте снова или свяжитесь со службой поддержки.") ||
      (lang === "french" && "Une erreur est survenue lors de l'enregistrement de votre configuration. Veuillez réessayer ou contacter le support.")
    );
  }
}

// ==============================
// Slash Commands Setup
// (Including: /setprefix, /help, and One-Tap commands: /claim, /reject, /kick, /mute, /unmute, /transfer, /name, /status,
//  as well as admin commands: /toponline, /topvrf, /binfo, /jinfo)
// ==============================
client.commands = new Collection();
const slashCommands = [
  new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set a custom prefix for this server')
    .addStringOption(option => option.setName('prefix').setDescription('New prefix').setRequired(true)),

  new SlashCommandBuilder().setName('claim').setDescription('Claim ownership of your tap'),
  new SlashCommandBuilder().setName('reject').setDescription('Reject a user from joining your tap')
    .addUserOption(option => option.setName('target').setDescription('User to reject').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user from your tap')
    .addUserOption(option => option.setName('target').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user in your voice channel')
    .addUserOption(option => option.setName('target').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user in your voice channel')
    .addUserOption(option => option.setName('target').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('transfer').setDescription('Transfer ownership of your tap')
    .addUserOption(option => option.setName('target').setDescription('User to transfer ownership to').setRequired(true)),
  new SlashCommandBuilder().setName('name').setDescription('Rename your tap')
    .addStringOption(option => option.setName('text').setDescription('New channel name').setRequired(true)),
  new SlashCommandBuilder().setName('status').setDescription('Set a status for your tap')
    .addStringOption(option => option.setName('text').setDescription('Status text').setRequired(true)),

  new SlashCommandBuilder().setName('toponline').setDescription('Show most online users')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('topvrf').setDescription('Show top verificators')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('binfo').setDescription('Show total bans')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('jinfo')
    .setDescription('Show jail info for a user')
    .addStringOption(option => option.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder().setName('help').setDescription('Show available commands')
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

// ==============================
// Client Ready Event
// ==============================
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ==============================
// Voice State Update Handler (Verification and One-Tap Systems)
// ==============================
const verificationSessions = new Map(); // { vcId: { userId, assignedVerificator, rejected } }
const onetapSessions = new Map();       // { vcId: { owner, rejectedUsers: [], status } }

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  
  // Verification System: When a user joins the designated Voice Verification channel.
  if (newState.channelId === process.env.VOICE_VERIFICATION) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `Verify - ${member.displayName}`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: [] // Configure as needed.
      });
      console.log(`Created verification VC: ${tempVC.name} for ${member.displayName}`);
      await member.voice.setChannel(tempVC);
      verificationSessions.set(tempVC.id, { userId: member.id, assignedVerificator: null, rejected: false });
      // Send a pop-up message in the alert channel.
      const alertChannel = guild.channels.cache.get(process.env.CHANNEL_VERIFICATION_ALERT);
      if (alertChannel) {
        const joinButton = new ButtonBuilder()
          .setCustomId(`join_verification_${tempVC.id}`)
          .setLabel("🚀 Join Verification")
          .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(joinButton);
        const alertEmbed = new EmbedBuilder().setTitle("# Member JDID AJEW 🙋‍♂️").setColor(0x00AE86);
        const alertMsg = await alertChannel.send({ embeds: [alertEmbed], components: [row] });
        setTimeout(() => { alertMsg.delete().catch(console.error); }, 9000);
      } else {
        console.error("Alert channel not found.");
      }
    } catch (err) {
      console.error("Error creating verification VC:", err);
    }
  }
  
  // One-Tap System: When a user joins the designated Voice One-Tap channel.
  if (newState.channelId === process.env.VOICE_ONETAP) {
    try {
      const member = newState.member;
      const tempVC = await guild.channels.create({
        name: `${member.displayName}'s Room`,
        type: 2,
        parent: newState.channel.parentId,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
          { id: member.id, allow: [PermissionsBitField.Flags.Connect] }
        ]
      });
      console.log(`Created one-tap VC: ${tempVC.name} for ${member.displayName}`);
      onetapSessions.set(tempVC.id, { owner: member.id, rejectedUsers: [] });
      await member.voice.setChannel(tempVC);
    } catch (err) {
      console.error("Error creating one-tap VC:", err);
    }
  }
  
  // One-Tap Owner Reassignment: If the owner leaves the one-tap channel.
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
  
  // Auto-delete empty temporary voice channels.
  if (oldState.channel && oldState.channel.members.size === 0) {
    const channelId = oldState.channel.id;
    if (verificationSessions.has(channelId) || onetapSessions.has(channelId)) {
      oldState.channel.delete().catch(() => {});
      verificationSessions.delete(channelId);
      onetapSessions.delete(channelId);
    }
  }
  
  // Verification VC: If the verificator leaves, move the verified user.
  if (oldState.channel && verificationSessions.has(oldState.channel.id)) {
    const session = verificationSessions.get(oldState.channel.id);
    if (oldState.member.id === session.assignedVerificator) {
      if (oldState.channel.members.has(session.userId)) {
        const verifiedMember = oldState.channel.members.get(session.userId);
        const activeVC = guild.channels.cache.filter(ch => ch.type === 2 && ch.id !== oldState.channel.id && ch.members.size > 0).first();
        if (activeVC) {
          await verifiedMember.voice.setChannel(activeVC);
        }
      }
    }
  }
});

// ==============================
// Guild Create Event: Create Temporary "bot-setup" Channel & Send Welcome Message
// ==============================
client.on(Events.GuildCreate, async guild => {
  let setupChannel;
  try {
    setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0,
      topic: 'Use this channel to configure the bot. It will be deleted after setup is complete.',
      permissionOverwrites: [
        { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    setupChannel.send(`<@${guild.ownerId}>, welcome! Let's set up your bot configuration.`);
  } catch (error) {
    console.error("Failed to create setup channel:", error);
    return;
  }

  // Create language selection buttons.
  const englishButton = new ButtonBuilder().setCustomId('lang_english').setLabel('English').setStyle(ButtonStyle.Primary);
  const darijaButton = new ButtonBuilder().setCustomId('lang_darija').setLabel('Darija').setStyle(ButtonStyle.Primary);
  const spanishButton = new ButtonBuilder().setCustomId('lang_spanish').setLabel('Spanish').setStyle(ButtonStyle.Primary);
  const russianButton = new ButtonBuilder().setCustomId('lang_russian').setLabel('Russian').setStyle(ButtonStyle.Primary);
  const frenchButton = new ButtonBuilder().setCustomId('lang_french').setLabel('French').setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(englishButton, darijaButton, spanishButton, russianButton, frenchButton);

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle("Welcome to Franco's Armada! 🔱🚢")
    .setDescription(
      languageExtras.english.intro + "\n\n" +
      "Before we set sail, please choose your language by clicking one of the buttons below.\n" +
      "Then, I'll guide you through a step-by-step configuration to set up the following IDs:\n" +
      "• Verified Role ID\n" +
      "• Unverified Role ID\n" +
      "• Verified Girl Role ID\n" +
      "• Verificator Role ID\n" +
      "• Voice Verification Channel ID\n" +
      "• One-Tap Channel ID\n" +
      "• Verification Alert Channel ID\n" +
      "• Jail Role ID\n" +
      "• Voice Jail Channel ID\n\n" +
      "Once setup is complete, this channel will be automatically deleted.\n" +
      "Made by Franco (YOUR_USER_ID_HERE) • Type `/help` for a list of commands. Let's set sail together! ⚓"
    );
  setupChannel.send({ embeds: [embed], components: [row] });
});

// ==============================
// Interaction Handler for Language Buttons and Slash Commands
// ==============================
client.on('interactionCreate', async interaction => {
  // Handle language selection buttons.
  if (interaction.isButton() && interaction.customId.startsWith("lang_")) {
    const language = interaction.customId.split('_')[1];
    let confirmationMessage = "";
    switch (language) {
      case "english":
        confirmationMessage = "Language set to English! 👌";
        break;
      case "darija":
        confirmationMessage = "Lougha Dialk Daba B Darija! 👌";
        break;
      case "spanish":
        confirmationMessage = "¡Idioma establecido a Español! 👌";
        break;
      case "russian":
        confirmationMessage = "Язык установлен на русский! 👌";
        break;
      case "french":
        confirmationMessage = "Langue définie en Français! 👌";
        break;
      default:
        confirmationMessage = "Language set!";
    }
    try {
      if (interaction.guild) {
        await settingsCollection.updateOne(
          { serverId: interaction.guild.id },
          { $set: { language: language } },
          { upsert: true }
        );
      }
    } catch (err) {
      console.error("Error saving language:", err);
    }
    await interaction.reply({ content: confirmationMessage, ephemeral: true });
    const readyPrompt = languageExtras[language]?.readyPrompt || "Now type `ready` to begin the setup process.";
    await interaction.channel.send(readyPrompt);
  }
  // Slash command handler.
  else if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    if (commandName === 'setprefix') {
      const newPrefix = interaction.options.getString('prefix');
      const serverId = interaction.guild.id;
      try {
        await settingsCollection.updateOne(
          { serverId: serverId },
          { $set: { prefix: newPrefix } },
          { upsert: true }
        );
        return interaction.reply({ content: `Prefix updated to \`${newPrefix}\`!`, ephemeral: true });
      } catch (err) {
        console.error("Error setting prefix:", err);
        return interaction.reply({ content: "Error updating prefix.", ephemeral: true });
      }
    }
    else if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle("Available Commands")
        .setDescription("Use these commands to customize and manage your bot.")
        .addFields(
          { name: "Profile Viewer", value: "`r` → View your profile picture (with Avatar/Banner buttons)", inline: false },
          { name: "Customization", value: "`/setprefix` → Set your custom command prefix", inline: false },
          { name: "One-Tap Commands", value: "`/claim`, `/reject`, `/kick`, `/mute`, `/unmute`, `/transfer`, `/name`, `/status`", inline: false },
          { name: "Admin Commands", value: "`/toponline`, `/topvrf`, `/binfo`, `/jinfo`", inline: false }
        );
      return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
    // One-Tap Commands:
    else if (commandName === 'claim') {
      const member = interaction.member;
      const vc = member.voice.channel;
      if (!vc || !onetapSessions.has(vc.id)) {
        return interaction.reply({ content: "You are not in a one-tap voice channel.", ephemeral: true });
      }
      const session = onetapSessions.get(vc.id);
      if (session.owner === member.id) {
        return interaction.reply({ content: "You are already the owner of this channel.", ephemeral: true });
      }
      session.owner = member.id;
      onetapSessions.set(vc.id, session);
      return interaction.reply({ content: "You have claimed ownership of this channel.", ephemeral: true });
    }
    else if (commandName === 'reject') {
      const target = interaction.options.getUser('target');
      const member = interaction.member;
      const vc = member.voice.channel;
      if (!vc || !onetapSessions.has(vc.id)) {
        return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
      }
      const session = onetapSessions.get(vc.id);
      if (session.owner !== member.id) {
        return interaction.reply({ content: "Only the channel owner can reject users.", ephemeral: true });
      }
      session.rejectedUsers = session.rejectedUsers || [];
      session.rejectedUsers.push(target.id);
      onetapSessions.set(vc.id, session);
      return interaction.reply({ content: `User ${target.username} has been rejected from this channel.`, ephemeral: true });
    }
    else if (commandName === 'kick') {
      const target = interaction.options.getUser('target');
      const member = interaction.member;
      const vc = member.voice.channel;
      if (!vc || !onetapSessions.has(vc.id)) {
        return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
      }
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (targetMember && targetMember.voice.channelId === vc.id) {
        try {
          await targetMember.voice.disconnect("Kicked from one-tap channel.");
          return interaction.reply({ content: `User ${target.username} has been kicked from the channel.`, ephemeral: true });
        } catch (e) {
          console.error(e);
          return interaction.reply({ content: "Failed to kick the user.", ephemeral: true });
        }
      } else {
        return interaction.reply({ content: "User not found in your channel.", ephemeral: true });
      }
    }
    else if (commandName === 'mute') {
      const target = interaction.options.getUser('target');
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
      try {
        await targetMember.voice.setMute(true);
        return interaction.reply({ content: `User ${target.username} has been muted.`, ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Failed to mute the user.", ephemeral: true });
      }
    }
    else if (commandName === 'unmute') {
      const target = interaction.options.getUser('target');
      const targetMember = interaction.guild.members.cache.get(target.id);
      if (!targetMember) return interaction.reply({ content: "User not found.", ephemeral: true });
      try {
        await targetMember.voice.setMute(false);
        return interaction.reply({ content: `User ${target.username} has been unmuted.`, ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Failed to unmute the user.", ephemeral: true });
      }
    }
    else if (commandName === 'transfer') {
      const target = interaction.options.getUser('target');
      const member = interaction.member;
      const vc = member.voice.channel;
      if (!vc || !onetapSessions.has(vc.id)) {
        return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
      }
      const session = onetapSessions.get(vc.id);
      if (session.owner !== member.id) {
        return interaction.reply({ content: "Only the current owner can transfer ownership.", ephemeral: true });
      }
      session.owner = target.id;
      onetapSessions.set(vc.id, session);
      return interaction.reply({ content: `Ownership has been transferred to ${target.username}.`, ephemeral: true });
    }
    else if (commandName === 'name') {
      const newName = interaction.options.getString('text');
      const member = interaction.member;
      const vc = member.voice.channel;
      if (!vc || !onetapSessions.has(vc.id)) {
        return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
      }
      if (onetapSessions.get(vc.id).owner !== member.id) {
        return interaction.reply({ content: "Only the channel owner can rename the channel.", ephemeral: true });
      }
      try {
        await vc.setName(newName);
        return interaction.reply({ content: `Channel renamed to ${newName}.`, ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Failed to rename the channel.", ephemeral: true });
      }
    }
    else if (commandName === 'status') {
      const statusText = interaction.options.getString('text');
      const member = interaction.member;
      const vc = member.voice.channel;
      if (!vc || !onetapSessions.has(vc.id)) {
        return interaction.reply({ content: "You are not in a one-tap channel.", ephemeral: true });
      }
      if (onetapSessions.get(vc.id).owner !== member.id) {
        return interaction.reply({ content: "Only the channel owner can set the status.", ephemeral: true });
      }
      try {
        let session = onetapSessions.get(vc.id);
        session.status = statusText;
        onetapSessions.set(vc.id, session);
        return interaction.reply({ content: `Channel status set to: ${statusText}`, ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Failed to set status.", ephemeral: true });
      }
    }
    // Admin commands:
    else if (commandName === 'toponline') {
      return interaction.reply({ content: "Top online users: [Feature coming soon...]", ephemeral: true });
    }
    else if (commandName === 'topvrf') {
      return interaction.reply({ content: "Top verificators: [Feature coming soon...]", ephemeral: true });
    }
    else if (commandName === 'binfo') {
      try {
        const bans = await interaction.guild.bans.fetch();
        return interaction.reply({ content: `Total bans: ${bans.size}`, ephemeral: true });
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "Failed to fetch ban info.", ephemeral: true });
      }
    }
    else if (commandName === 'jinfo') {
      const userId = interaction.options.getString('userid');
      return interaction.reply({ content: `Jail info for user ${userId}: [Feature coming soon...]`, ephemeral: true });
    }
  }
});

// ==============================
// Message Handler for Interactive Setup in "bot-setup" Channel
// ==============================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.name !== 'bot-setup') return;
  if (message.author.id !== message.guild.ownerId) return;
  
  if (message.content.toLowerCase() === 'ready') {
    const serverConfig = await settingsCollection.findOne({ serverId: message.guild.id });
    const lang = (serverConfig && serverConfig.language) || "english";
    await message.channel.send(languageExtras[lang]?.setupStart);
    try {
      await runSetup(message.author.id, message.channel, message.guild.id, lang);
      await message.channel.send(languageExtras[lang]?.setupComplete);
      setTimeout(() => {
        message.channel.delete().catch(console.error);
      }, 5000);
    } catch (err) {
      console.error("Setup process error:", err);
    }
  }
});

// ==============================
// Message Handler for Profile Viewer – "R" Command Only
// (Modified so that it triggers only if the message is exactly "r" or "r " followed by a mention)
// ==============================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  
  // Check if the message is exactly "r" or starts with "r " (and is not "ready")
  if ((content === 'r' || content.startsWith('r ')) && content !== 'ready') {
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
    message.channel.send({ embeds: [embed], components: [row] });
  }
});

// ==============================
// Interaction Handler for Profile Viewer Buttons
// ==============================
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
    return interaction.update({ embeds: [embed] });
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
    return interaction.update({ embeds: [embed] });
  }
});

// ==============================
// Additional Commands (Verification, Jail, etc.) can be added below as needed.
// ==============================

client.login(process.env.DISCORD_TOKEN);
