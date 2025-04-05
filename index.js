// index.js
// Franco's Armada Bot – A fully featured rental bot with interactive, multilingual per‑server setup.
// Features:
// • MongoDB integration for storing per‑server settings (language, prefix, role/channel IDs).
// • When added to a server, the bot creates a temporary "bot-setup" channel and sends a welcome embed.
// • The welcome embed includes a brief introduction (with credit "Made by Franco (YOUR_USER_ID_HERE)") and language selection buttons (English, Darija, Spanish, Russian, French).
// • Once a language is chosen, the bot prompts the owner to type "ready" to begin.
// • Then, the bot guides the owner step-by-step (using message collectors with a 90-second timeout per prompt) to provide all required IDs.
//   All prompts (and subsequent messages) are delivered entirely in the chosen language.
// • After setup is complete, a final confirmation message (translated) is sent and the setup channel is deleted.
// • Slash commands include /setprefix and /help.
// • A basic "R" command shows the user’s profile picture with buttons for Avatar/Banner viewing.
// (Additional commands like verification, jail, one‑tap can be added later as needed.)

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

// For image generation in the "R" command.
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// MongoDB connection.
const { MongoClient } = require('mongodb');
const mongoUri = process.env.MONGODB_URI; // Your connection string.
const mongoClient = new MongoClient(mongoUri);

let settingsCollection;
async function connectToMongo() {
  try {
    await mongoClient.connect();
    console.log("Connected to MongoDB");
    const db = mongoClient.db("botRentalDB"); // Choose your DB name.
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
// ==============================
const languagePrompts = {
  english: {
    verifiedRoleId: "🔹 **Please provide the Verified Role ID** (the role assigned to verified members).",
    unverifiedRoleId: "🔹 **Now, provide the Unverified Role ID** (the role for new/unverified members).",
    verifiedGirlRoleId: "🔹 **Next, please provide the Verified Girl Role ID**.",
    verificatorRoleId: "🔹 **Please provide the Verificator Role ID** (the role for those who verify new users).",
    voiceVerificationChannelId: "🔹 **Send the Voice Verification Channel ID** (where new users join for verification).",
    oneTapChannelId: "🔹 **Now, send the One-Tap Channel ID** (for creating one-tap voice channels).",
    verificationAlertChannelId: "🔹 **Send the Verification Alert Channel ID** (where verification alerts are posted).",
    jailRoleId: "🔹 **Provide the Jail Role ID** (for jailed users). If not applicable, type `none`.",
    voiceJailChannelId: "🔹 **Finally, send the Voice Jail Channel ID** (for jailed users). If not applicable, type `none`."
  },
  darija: {
    verifiedRoleId: "🔹 **3tini l'ID dyal Verified Role** (role li kat3ti l'users verified).",
    unverifiedRoleId: "🔹 **3tini l'ID dyal Unverified Role** (role dyal new/unverified users).",
    verifiedGirlRoleId: "🔹 **3tini l'ID dyal Verified Girl Role**.",
    verificatorRoleId: "🔹 **3tini l'ID dyal Verificator Role**.",
    voiceVerificationChannelId: "🔹 **3tini l'ID dyal Voice Verification Channel** (fin kaydkhlu l'users jdod).",
    oneTapChannelId: "🔹 **3tini l'ID dyal One-Tap Channel** (bash ytkawn private voice rooms).",
    verificationAlertChannelId: "🔹 **3tini l'ID dyal Verification Alert Channel**.",
    jailRoleId: "🔹 **3tini l'ID dyal Jail Role** (ila ma kaynach, ktb `none`).",
    voiceJailChannelId: "🔹 **3tini l'ID dyal Voice Jail Channel** (ila ma kaynach, ktb `none`)."
  },
  spanish: {
    verifiedRoleId: "🔹 **Por favor, proporciona el ID del Rol Verificado** (el rol asignado a los miembros verificados).",
    unverifiedRoleId: "🔹 **Ahora, proporciona el ID del Rol No Verificado** (el rol para nuevos miembros).",
    verifiedGirlRoleId: "🔹 **A continuación, proporciona el ID del Rol de Verificadas**.",
    verificatorRoleId: "🔹 **Por favor, proporciona el ID del Rol de Verificadores** (rol para quienes verifican nuevos usuarios).",
    voiceVerificationChannelId: "🔹 **Envía el ID del Canal de Verificación de Voz** (donde los nuevos usuarios se unen para la verificación).",
    oneTapChannelId: "🔹 **Ahora, envía el ID del Canal One-Tap** (para la creación de canales de voz privados).",
    verificationAlertChannelId: "🔹 **Envía el ID del Canal de Alertas de Verificación** (donde se publican las alertas de verificación).",
    jailRoleId: "🔹 **Proporciona el ID del Rol de Cárcel** (para usuarios en cárcel). Si no aplica, escribe `none`.",
    voiceJailChannelId: "🔹 **Finalmente, envía el ID del Canal de Voz para Cárcel**. Si no aplica, escribe `none`."
  },
  russian: {
    verifiedRoleId: "🔹 **Пожалуйста, предоставьте ID роли для Verified Role** (роль, назначаемая проверенным участникам).",
    unverifiedRoleId: "🔹 **Теперь предоставьте ID роли для Unverified Role** (роль для новых участников).",
    verifiedGirlRoleId: "🔹 **Далее, предоставьте ID роли для Verified Girl Role**.",
    verificatorRoleId: "🔹 **Пожалуйста, предоставьте ID роли для Verificator Role** (роль для тех, кто проверяет новых пользователей).",
    voiceVerificationChannelId: "🔹 **Отправьте ID голосового канала для Voice Verification Channel** (где новые пользователи присоединяются для проверки).",
    oneTapChannelId: "🔹 **Теперь отправьте ID канала One-Tap Channel** (для создания приватных голосовых каналов).",
    verificationAlertChannelId: "🔹 **Отправьте ID текстового канала для Verification Alert Channel**.",
    jailRoleId: "🔹 **Предоставьте ID роли для Jail Role** (если не применимо, введите `none`).",
    voiceJailChannelId: "🔹 **Наконец, отправьте ID голосового канала для Voice Jail Channel** (если не применимо, введите `none`)."
  },
  french: {
    verifiedRoleId: "🔹 **Veuillez fournir l'ID du rôle Verified Role** (le rôle attribué aux membres vérifiés).",
    unverifiedRoleId: "🔹 **Maintenant, fournissez l'ID du rôle Unverified Role** (le rôle pour les nouveaux membres).",
    verifiedGirlRoleId: "🔹 **Ensuite, veuillez fournir l'ID du rôle Verified Girl Role**.",
    verificatorRoleId: "🔹 **Veuillez fournir l'ID du rôle Verificator Role** (le rôle pour ceux qui vérifient les nouveaux utilisateurs).",
    voiceVerificationChannelId: "🔹 **Envoyez l'ID du canal vocal pour Voice Verification Channel** (là où les nouveaux utilisateurs se joignent pour être vérifiés).",
    oneTapChannelId: "🔹 **Maintenant, envoyez l'ID du canal One-Tap Channel** (pour la création de canaux vocaux privés).",
    verificationAlertChannelId: "🔹 **Envoyez l'ID du canal textuel pour Verification Alert Channel**.",
    jailRoleId: "🔹 **Fournissez l'ID du rôle pour Jail Role** (si non applicable, tapez `none`).",
    voiceJailChannelId: "🔹 **Enfin, envoyez l'ID du canal vocal pour Voice Jail Channel** (si non applicable, tapez `none`)."
  }
};

// ==============================
// Language Extras: Additional messages during setup
// ==============================
const languageExtras = {
  english: {
    readyPrompt: "Great! Now type `ready` in this channel to begin the setup process. (You have 90 seconds per prompt.)",
    setupStart: "Alright, let's begin the setup process. I will ask you for a series of IDs. Please copy and paste each one as prompted.",
    setupComplete: "Thank you for your patience! Your bot is now fully set up. 🎉"
  },
  darija: {
    readyPrompt: "Mzyan! Daba kteb `ready` f had channel bach nbda setup. (3andak 90 tsania f kol prompt.)",
    setupStart: "Yallah, bda nsetup. Ghadi nsawlouk 3la b3d IDs. 3afak copy w paste kol wa7ed mlli yb9a talab.",
    setupComplete: "Choukrane 3la sbr dyalk! L'bot dyalk daba msetab kaml. 🎉"
  },
  spanish: {
    readyPrompt: "¡Genial! Ahora escribe `ready` en este canal para comenzar el proceso de configuración. (Tienes 90 segundos por mensaje.)",
    setupStart: "Muy bien, vamos a comenzar el proceso de configuración. Te pediré una serie de IDs. Por favor, copia y pega cada uno cuando se te pida.",
    setupComplete: "¡Gracias por tu paciencia! Tu bot ya está completamente configurado. 🎉"
  },
  russian: {
    readyPrompt: "Отлично! Теперь введите `ready` в этом канале, чтобы начать настройку. (У вас 90 секунд на каждый ответ.)",
    setupStart: "Хорошо, давайте начнем настройку. Я задам вам серию вопросов с ID. Пожалуйста, скопируйте и вставьте каждый ID, когда будет предложено.",
    setupComplete: "Спасибо за ваше терпение! Ваш бот теперь полностью настроен. 🎉"
  },
  french: {
    readyPrompt: "Super ! Tapez maintenant `ready` dans ce canal pour commencer la configuration. (Vous avez 90 secondes par question.)",
    setupStart: "D'accord, commençons la configuration. Je vais vous demander une série d'ID. Veuillez copier-coller chacun d'eux lorsque cela est demandé.",
    setupComplete: "Merci pour votre patience ! Votre bot est maintenant entièrement configuré. 🎉"
  }
};

// ==============================
// Helper Function: Await a Single Message with 90s Timeout (with language extras appended)
// ==============================
async function awaitResponse(channel, userId, prompt, lang) {
  const extra = languageExtras[lang]?.responseTimeout || ""; // if you want to add extra text, here.
  await channel.send(prompt + extra);
  await channel.send("*(You have 90 seconds to respond, or the setup will time out.)*"); // This could be localized too.
  const filter = m => m.author.id === userId;
  try {
    const collected = await channel.awaitMessages({ filter, max: 1, time: 90000, errors: ['time'] });
    return collected.first().content.trim();
  } catch (err) {
    await channel.send(
      (lang === "english" && "Setup timed out. Please type `ready` to start the setup again.") ||
      (lang === "darija" && "Setup t9llat. Kteb `ready` bach tbdaw men jdod.") ||
      (lang === "spanish" && "La configuración expiró. Por favor, escribe `ready` para reiniciar el proceso de configuración.") ||
      (lang === "russian" && "Настройка завершилась по тайм-ауту. Пожалуйста, введите `ready`, чтобы начать заново.") ||
      (lang === "french" && "Le délai de configuration a expiré. Veuillez taper `ready` pour recommencer.")
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
  // Inform the owner that setup is starting.
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
      (lang === "darija" && "Kan chi mouchkil f saving configuration. 3awd l7awl aw tsift l'mossa3ada.") ||
      (lang === "spanish" && "Hubo un error al guardar la configuración. Por favor, inténtalo de nuevo o contacta al soporte.") ||
      (lang === "russian" && "Произошла ошибка при сохранении настроек. Пожалуйста, попробуйте снова или свяжитесь со службой поддержки.") ||
      (lang === "french" && "Une erreur est survenue lors de l'enregistrement de votre configuration. Veuillez réessayer ou contacter le support.")
    );
  }
}

// ==============================
// Slash Commands Setup (/setprefix and /help)
// ==============================
client.commands = new Collection();
const slashCommands = [
  // /setprefix command.
  new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set a custom prefix for this server')
    .addStringOption(option => option.setName('prefix').setDescription('New prefix').setRequired(true)),
  // /help command.
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
// Guild Create Event: Create a Temporary "bot-setup" Channel and Send Welcome Message
// ==============================
client.on(Events.GuildCreate, async guild => {
  let setupChannel;
  try {
    setupChannel = await guild.channels.create({
      name: 'bot-setup',
      type: 0, // Text channel.
      topic: 'Use this channel to configure the bot. It will be deleted after setup is complete.',
      permissionOverwrites: [{ id: guild.id, allow: ["VIEW_CHANNEL", "SEND_MESSAGES"] }]
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
      "Hello, I'm **Franco's Armada** – your dedicated bot for managing your server!\n\n" +
      "Before we set sail, please choose your language by clicking one of the buttons below.\n" +
      "After that, I'll guide you through a step-by-step configuration to set up all required IDs:\n\n" +
      "• Verified Role ID\n" +
      "• Unverified Role ID\n" +
      "• Verified Girl Role ID\n" +
      "• Verificator Role ID\n" +
      "• Voice Verification Channel ID\n" +
      "• One-Tap Channel ID\n" +
      "• Verification Alert Channel ID\n" +
      "• Jail Role ID\n" +
      "• Voice Jail Channel ID\n\n" +
      "Once setup is complete, this channel will be automatically deleted.\n\n" +
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
    const language = interaction.customId.split('_')[1]; // e.g., "english", "darija", etc.
    let confirmationMessage = "";
    switch (language) {
      case "english":
        confirmationMessage = "Language set to English! 👌";
        break;
      case "darija":
        confirmationMessage = "Language set to Darija! 👌";
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
    // Use the appropriate ready prompt from languageExtras.
    const readyPrompt = languageExtras[language]?.readyPrompt || "Now type `ready` to begin the setup process.";
    await interaction.channel.send(readyPrompt);
  }
  // Slash command handler for /setprefix and /help.
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
          { name: "Customization", value: "`/setprefix` → Set your custom command prefix", inline: false }
        );
      return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }
  }
});

// ==============================
// Message Handler for Interactive Setup in the "bot-setup" Channel
// ==============================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.name !== 'bot-setup') return;
  // Only allow the server owner to interact.
  if (message.author.id !== message.guild.ownerId) return;
  
  if (message.content.toLowerCase() === 'ready') {
    message.channel.send(languageExtras[(await settingsCollection.findOne({ serverId: message.guild.id })).language]?.setupStart || "Let's begin setup.");
    try {
      const serverConfig = await settingsCollection.findOne({ serverId: message.guild.id });
      const lang = (serverConfig && serverConfig.language) || "english";
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
// ==============================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
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
// Additional Commands (e.g., Verification, Jail, One-Tap, etc.) can be added below as needed.
// ==============================

client.login(process.env.DISCORD_TOKEN);
