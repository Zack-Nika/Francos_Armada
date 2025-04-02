require('dotenv').config();
const fs = require('fs');
const { Client, IntentsBitField, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_UNVERIFIED = process.env.ROLE_UNVERIFIED;
const ROLE_VERIFIED_BOY = process.env.ROLE_VERIFIED_BOY;
const ROLE_VERIFIED_GIRL = process.env.ROLE_VERIFIED_GIRL;
const ROLE_VERIFICATOR = process.env.ROLE_VERIFICATOR;
const ROLE_LEADER_VERIFICATOR = process.env.ROLE_LEADER_VERIFICATOR;
const CHANNEL_VERIFICATION_ALERT = process.env.CHANNEL_VERIFICATION_ALERT;
const VOICE_VERIFICATION = process.env.VOICE_VERIFICATION;

// Initialize client with necessary intents
const client = new Client({ 
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,    // for guildMemberAdd events&#8203;:contentReference[oaicite:14]{index=14}
    IntentsBitField.Flags.GuildMessages,   // for messageCreate events
    IntentsBitField.Flags.MessageContent,  // to read message content&#8203;:contentReference[oaicite:15]{index=15}
    IntentsBitField.Flags.GuildVoiceStates // for voiceStateUpdate events
  ] 
});

// Load persistent data if available
const dataFile = 'verification_data.json';
let verificationData = { logs: [], counts: {} };
if (fs.existsSync(dataFile)) {
  try {
    verificationData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (err) {
    console.error('Could not load verification data file:', err);
  }
}

// Event: Bot is ready
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  // Register slash command /topverificator
  try {
    const commandData = { name: 'topverificator', description: 'Show the leaderboard of verificators by number of verifications' };
    if (GUILD_ID) {
      await client.guilds.cache.get(GUILD_ID)?.commands.create(commandData);
    } else {
      await client.application?.commands.create(commandData);
    }
  } catch (err) {
    console.error("Failed to register slash command:", err);
  }
});

// Event: New member joins (welcome and assign Unverified)
client.on('guildMemberAdd', async (member) => {
  // Assign Unverified role
  try {
    await member.roles.add(ROLE_UNVERIFIED);
  } catch (err) {
    console.error(`Failed to add Unverified role to ${member.user.tag}:`, err);
  }

  // Welcome DM
  member.send(
    "# السلام و مرحبا بيك في أحسن سيرفر في المغرب 🇲🇦 ♥️ دابا أيجي عندك واحد من الدراري باش تفيريفا 😊"
  ).catch(err => {
    console.log(`Could not DM ${member.user.tag}:`, err);
  });

  // Alert verificators channel
  const alertChannel = member.guild.channels.cache.get(CHANNEL_VERIFICATION_ALERT);
  if (alertChannel) {
    try {
      // Create invite link for verification voice channel
      const voiceChannel = member.guild.channels.cache.get(VOICE_VERIFICATION);
      let inviteURL;
      if (voiceChannel) {
        const invite = await voiceChannel.createInvite({ maxAge: 30, maxUses: 1 });
        inviteURL = invite.url;
      } else {
        inviteURL = `https://discord.com/channels/${member.guild.id}/${VOICE_VERIFICATION}`;
      }

      // Create link button
      const joinButton = new ButtonBuilder()
        .setLabel('Join Voice')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteURL);
      const row = new ActionRowBuilder().addComponents(joinButton);

      // Send alert message
      const alertMsg = await alertChannel.send({
  content: `**# Member Jdid Ajew 🙋‍♂️** <@${member.id}>`,
  components: [row]
      });
      // Delete after 10 seconds
      setTimeout(() => {
        alertMsg.delete().catch(() => {});
      }, 10000);
    } catch (err) {
      console.error('Error sending verification alert:', err);
    }
  }
});

// Event: Voice channel join/leave (enforce one verificator at a time)
client.on('voiceStateUpdate', (oldState, newState) => {
  const newChannelId = newState.channelId;
  const oldChannelId = oldState.channelId;
  const member = newState.member;
  if (!member) return;

  // If member joined a new channel (and it's the verification channel)
  if (newChannelId && newChannelId !== oldChannelId && newChannelId === VOICE_VERIFICATION) {
    const isLeader = member.roles.cache.has(ROLE_LEADER_VERIFICATOR);
    const isVerificator = member.roles.cache.has(ROLE_VERIFICATOR);
    if (isVerificator && !isLeader) {
      const voiceChannel = newState.channel;
      if (voiceChannel) {
        const modsAlready = voiceChannel.members.filter(m => 
          m.id !== member.id && 
          (m.roles.cache.has(ROLE_VERIFICATOR) || m.roles.cache.has(ROLE_LEADER_VERIFICATOR))
        );
        if (modsAlready.size > 0) {
          // Another verificator is already in channel; kick this member out
          member.voice.setChannel(null).catch(err => 
            console.log(`Disconnected extra verificator ${member.user.tag}:`, err)
          );
        }
      }
    }
    // If member is a leader verificator, we allow them even if one normal is present.
    // (No extra code needed; we simply don't disconnect leaders in that scenario.)
  }
});

// Event: Verification commands (+VB, +VG)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim();
  const lower = content.toLowerCase();
  const isVB = lower.startsWith('+vb');
  const isVG = lower.startsWith('+vg');
  if (!isVB && !isVG) return;

  const targetMember = message.mentions.members?.first();
  if (!targetMember) {
    return message.reply("# Khasek Tagi Chi User La Bghiti Tverifih: `+VB @username` أو `+VG @username`.").then(msg => {
      setTimeout(() => msg.delete().catch(()=>{}), 5000);
    });
  }
  const authorMember = message.member;
  const isAuthorVerificator = authorMember.roles.cache.has(ROLE_VERIFICATOR) || authorMember.roles.cache.has(ROLE_LEADER_VERIFICATOR);
  if (!isAuthorVerificator) {
    return message.reply("# Ma3endksh L7a9 Tverifi Users.").then(msg => {
      setTimeout(() => msg.delete().catch(()=>{}), 5000);
    });
  }
  if (!targetMember.roles.cache.has(ROLE_UNVERIFIED)) {
    return message.reply("That user is not unverified.").then(msg => {
      setTimeout(() => msg.delete().catch(()=>{}), 5000);
    });
  }

  const newRoleId = isVB ? ROLE_VERIFIED_BOY : ROLE_VERIFIED_GIRL;
  const genderText = isVB ? 'boy' : 'girl';
  try {
    await targetMember.roles.remove(ROLE_UNVERIFIED);
    await targetMember.roles.add(newRoleId);
  } catch (err) {
    console.error(`Error assigning roles to ${targetMember.user.tag}:`, err);
    return message.reply("# M9dertsh N3ti Verified Role Lhad User  ❌️.").catch(()=>{});
  }

  // Move user to a populated voice channel if they are in the verification channel
  if (targetMember.voice && targetMember.voice.channelId === VOICE_VERIFICATION) {
    const voiceChannels = message.guild.channels.cache.filter(ch => 
      ch.id !== VOICE_VERIFICATION && 
      ch.type === 2 &&  // GuildVoice
      ch.permissionsFor(targetMember).has(PermissionsBitField.Flags.Connect)
    );
    let bestChannel = null;
    let maxCount = 0;
    voiceChannels.forEach(ch => {
      const count = ch.members.filter(m => !m.user.bot).size;
      if (count > maxCount) {
        maxCount = count;
        bestChannel = ch;
      }
    });
    if (bestChannel) {
      targetMember.voice.setChannel(bestChannel.id).catch(err => {
        console.error(`Failed to move ${targetMember.user.tag}:`, err);
      });
    }
    // If no active channel found, do nothing (user stays or can join another on their own).
  }

  // Log verification
  const verifierId = authorMember.id;
  const verifiedId = targetMember.id;
  verificationData.logs.push({ verifier: verifierId, verified: verifiedId, time: new Date().toISOString(), role: newRoleId });
  verificationData.counts[verifierId] = (verificationData.counts[verifierId] || 0) + 1;
  fs.writeFileSync(dataFile, JSON.stringify(verificationData, null, 2));

  // Confirmation message
  message.reply(`${targetMember.user.username} # Was Verified As: **${genderText}**! ✅`).catch(()=>{});
});

// Event: Slash command interaction (/topverificator)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  if (interaction.commandName === 'topverificator') {
    const counts = verificationData.counts;
    if (!counts || Object.keys(counts).length === 0) {
      return interaction.reply({ content: "No verifications have been logged yet.", ephemeral: true });
    }
    // Sort by highest count
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    let replyText = "**🏆 Top Verificators:**\n";
    let rank = 1;
    for (const [userId, count] of sorted) {
      let name = `User ${userId}`;
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) name = member.user.tag;
      replyText += `${rank}. **${name}** — ${count} verification${count !== 1 ? 's' : ''}\n`;
      rank++;
    }
    await interaction.reply({ content: replyText, ephemeral: false });
  }
});

// Login the bot
client.login(TOKEN);
