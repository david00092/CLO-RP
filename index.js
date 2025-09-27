const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  AuditLogEvent,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const express = require("express");
require("dotenv").config();

// Tratamento básico de erros globais
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});

// Configurações principais
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const prefix = process.env.PREFIX || "!";
const authorizedBotIDs = ["411916947773587456", "987654321098765432"]; // IDs bots autorizados
const allowedRoles = ["1398885528358748250", "1398885530388795575"]; // IDs dos cargos autorizados a usar comandos
const logChannelId = "1398886461025030235"; // ID do canal de logs
const autoRoleId = "1398885680771497984"; // ID do cargo automático ao entrar
const ticketSupportRoleId = "1398885572738682900"; // cargo que pode fechar ticket

// Tickets
const ticketOpenChannelId = "1398886141783965737"; // canal do menu para abrir tickets
const ticketCategoryIds = {
  vendas: "1398885695296110692",
  suporte: "1398885876666466387",
  denuncia: "1398885880227299378",
};

// Servidor HTTP para uptime (ex: UptimeRobot)
const app = express();
const port = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot está online!"));
app.listen(port, () => console.log(`Servidor HTTP rodando na porta ${port}`));

// Map para controle de ações de exclusão (para punição)
const deleteActions = new Map();
function resetDeleteCounter(userId) {
  setTimeout(() => deleteActions.delete(userId), 60 * 1000);
}

// Função para pegar ícone do servidor (URL)
async function getGuildIcon(guild) {
  if (!guild) return null;
  if (guild.iconURL()) return guild.iconURL({ dynamic: true, size: 64 });
  return null;
}

// Função para enviar logs
async function sendLog(guild, embed) {
  try {
    if (!guild) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Erro ao enviar log:", err);
  }
}

// Punir usuário que excluir cargos/canais demais
async function punishUser(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    if (!member) return;
    await member.roles.set([]); // Remove todos os cargos
    await member.ban({
      reason: "Excluiu muitos cargos/canais em pouco tempo.",
    });

    const embed = new EmbedBuilder()
      .setTitle("Usuário banido")
      .setDescription(
        `Usuário ${member.user.tag} banido por exclusões excessivas.`,
      )
      .setColor("Red")
      .setTimestamp()
      .setThumbnail(await getGuildIcon(guild));
    sendLog(guild, embed);
  } catch (err) {
    console.error("Erro ao punir usuário:", err);
  }
}

// Eventos de exclusão de cargos/canais com controle e logs
client.on("roleDelete", async (role) => {
  try {
    const auditLogs = await role.guild.fetchAuditLogs({
      type: AuditLogEvent.RoleDelete,
      limit: 1,
    });
    const entry = auditLogs.entries.first();
    if (!entry) return;
    const executorId = entry.executor.id;
    if (entry.executor.bot || executorId === client.user.id) return;

    if (!deleteActions.has(executorId)) {
      deleteActions.set(executorId, 1);
      resetDeleteCounter(executorId);
    } else {
      const count = deleteActions.get(executorId) + 1;
      deleteActions.set(executorId, count);
      if (count > 4) {
        await punishUser(role.guild, executorId);
        deleteActions.delete(executorId);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("Cargo deletado")
      .setDescription(`Cargo deletado: **${role.name}**\nPor: <@${executorId}>`)
      .setColor("Orange")
      .setTimestamp()
      .setThumbnail(await getGuildIcon(role.guild));
    sendLog(role.guild, embed);
  } catch (err) {
    console.error(err);
  }
});

client.on("channelDelete", async (channel) => {
  try {
    const auditLogs = await channel.guild.fetchAuditLogs({
      type: AuditLogEvent.ChannelDelete,
      limit: 1,
    });
    const entry = auditLogs.entries.first();
    if (!entry) return;
    const executorId = entry.executor.id;
    if (entry.executor.bot || executorId === client.user.id) return;

    if (!deleteActions.has(executorId)) {
      deleteActions.set(executorId, 1);
      resetDeleteCounter(executorId);
    } else {
      const count = deleteActions.get(executorId) + 1;
      deleteActions.set(executorId, count);
      if (count > 4) {
        await punishUser(channel.guild, executorId);
        deleteActions.delete(executorId);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("Canal deletado")
      .setDescription(
        `Canal deletado: **${channel.name}**\nPor: <@${executorId}>`,
      )
      .setColor("Orange")
      .setTimestamp()
      .setThumbnail(await getGuildIcon(channel.guild));
    sendLog(channel.guild, embed);
  } catch (err) {
    console.error(err);
  }
});

// Evento novo membro entra (com filtro de bots autorizados e auto cargo)
client.on("guildMemberAdd", async (member) => {
  if (member.user.bot && !authorizedBotIDs.includes(member.id)) {
    try {
      await member.kick("Bot não autorizado detectado e removido.");
      const embed = new EmbedBuilder()
        .setTitle("Bot não autorizado removido")
        .setDescription(`Bot: ${member.user.tag} (${member.id})`)
        .setColor("Red")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(member.guild));
      sendLog(member.guild, embed);
    } catch (err) {
      console.error(err);
    }
    return;
  }

  // Dá cargo automático
  try {
    await member.roles.add(autoRoleId);
    const embed = new EmbedBuilder()
      .setTitle("Novo membro entrou")
      .setDescription(`${member.user} recebeu cargo automático.`)
      .setColor("Green")
      .setTimestamp()
      .setThumbnail(await getGuildIcon(member.guild));
    sendLog(member.guild, embed);
  } catch (err) {
    console.error(err);
  }
});

// Log membro saiu
client.on("guildMemberRemove", async (member) => {
  const embed = new EmbedBuilder()
    .setTitle("Membro saiu")
    .setDescription(`${member.user.tag} saiu do servidor.`)
    .setColor("Orange")
    .setTimestamp()
    .setThumbnail(await getGuildIcon(member.guild));
  sendLog(member.guild, embed);
});

// No ready, atualiza menu do ticket no canal fixo
client.on("ready", async () => {
  console.log(`Bot online como ${client.user.tag}`);

  const channel = client.channels.cache.get(ticketOpenChannelId);
  if (!channel) {
    console.warn("Canal para abrir tickets não encontrado!");
    return;
  }

const embed = new EmbedBuilder()
  .setTitle("🎫 Sistema de Tickets")
  .setDescription(
    "Olá! 👋\n\nSelecione abaixo o tipo de ticket que deseja abrir. " +
    "Nossa equipe está pronta para te ajudar!"
  )
  .setColor("00f5ff")
  .setTimestamp()
  .setThumbnail(await getGuildIcon(channel.guild))
  .setFooter({ text: "Equipe Imperial Group" });

const select = new StringSelectMenuBuilder()
  .setCustomId("select_ticket")
  .setPlaceholder("Selecione o tipo de ticket que deseja abrir")
  .addOptions([
    {
      label: "💰 Vendas",
      description: "Abra um ticket para tratar sobre vendas",
      value: "vendas",
    },
    {
      label: "❓ Suporte",
      description: "Abra um ticket para pedir suporte",
      value: "suporte",
    },
    {
      label: "⛔ Denúncia",
      description: "Abra um ticket para fazer uma denúncia",
      value: "denuncia",
    },
  ]);


  const row = new ActionRowBuilder().addComponents(select);

  // Edita mensagem se já existir o select menu, ou cria
  const messages = await channel.messages.fetch({ limit: 10 });
  const botMessage = messages.find(
    (msg) =>
      msg.author.id === client.user.id &&
      msg.components.some((c) =>
        c.components.some((i) => i.customId === "select_ticket"),
      ),
  );

  if (botMessage) {
    await botMessage.edit({
      content: "",
      embeds: [embed],
      components: [row],
    });
  } else {
    await channel.send({
      content: "Selecione uma opção para abrir um ticket:",
      embeds: [embed],
      components: [row],
    });
  }
});

// Função para enviar embed temporário (apaga em 15s)
async function sendTempEmbed(channel, embed) {
  const sent = await channel.send({ embeds: [embed] });
  setTimeout(() => sent.delete().catch(() => {}), 15000);
  return sent;
}

// Interactions: abrir e fechar tickets
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isSelectMenu() && !interaction.isButton()) return;

  const guild = interaction.guild;
  const member = interaction.member;

  // Fechar ticket
  if (interaction.isButton() && interaction.customId === "fechar_ticket") {
    if (!member.roles.cache.has(ticketSupportRoleId)) {
      return interaction.reply({
        content: "Você não tem permissão para fechar tickets.",
        ephemeral: true,
      });
    }
    await interaction.reply({
      content: "Fechando ticket em 5 segundos...",
      ephemeral: true,
    });
    setTimeout(async () => {
      if (interaction.channel.deletable) await interaction.channel.delete();
    }, 5000);
    return;
  }

  // Abrir ticket via select menu
  if (interaction.isSelectMenu() && interaction.customId === "select_ticket") {
    const tipo = interaction.values[0];
    const categoryId = ticketCategoryIds[tipo];

    // Verifica se já tem ticket aberto do tipo
    const existingTicket = guild.channels.cache.find(
      (c) =>
        c.name === `ticket-${interaction.user.id}-${tipo}` &&
        c.parentId === categoryId,
    );
    if (existingTicket) {
      return interaction.reply({
        content: `Você já possui um ticket de ${tipo}: ${existingTicket}`,
        ephemeral: true,
      });
    }

    try {
      const canalTicket = await guild.channels.create({
        name: `ticket-${interaction.user.id}-${tipo}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
          {
            id: ticketSupportRoleId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
        ],
      });

      const embed = new EmbedBuilder()
        .setTitle(`Ticket de ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`)
        .setDescription(
          `Olá ${interaction.user}, aguarde um atendente. Use o botão abaixo para fechar o ticket.`,
        )
        .setColor("#5865F2")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(guild));

      const fecharButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("fechar_ticket")
          .setLabel("Fechar Ticket")
          .setStyle(ButtonStyle.Danger),
      );

      await canalTicket.send({
        content: `${interaction.user}`,
        embeds: [embed],
        components: [fecharButton],
      });

      await interaction.reply({
        content: `Ticket criado: ${canalTicket}`,
        ephemeral: true,
      });
    } catch (err) {
      console.error(err);
      await interaction.reply({
        content: "Erro ao criar o ticket.",
        ephemeral: true,
      });
    }
  }
});

// Comandos via messageCreate (prefixo)
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  // Deleta mensagem do usuário imediatamente para limpar chat
  message.delete().catch(() => {});

  const memberRoles = message.member.roles.cache;
  const hasPermissionRole = allowedRoles.some((roleId) =>
    memberRoles.has(roleId),
  );
  if (!hasPermissionRole) return;

  const [command, ...args] = message.content
    .slice(prefix.length)
    .trim()
    .split(/ +/);

  async function replyEmbed(embed) {
    const sent = await message.channel.send({ embeds: [embed] });
    setTimeout(() => sent.delete().catch(() => {}), 15000);
  }

  // !addcargo @cargo @pessoa
  if (command === "addcargo") {
    const member = message.mentions.members.last();
    const roleMention = message.mentions.roles.first();
    if (!member || !roleMention) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Use: `!addcargo @cargo @pessoa`")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    const role = message.guild.roles.cache.get(roleMention.id);
    if (!role) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Cargo não encontrado.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    const authorHighest = message.member.roles.highest;
    const botHighest = message.guild.members.me.roles.highest;

    if (authorHighest.position <= role.position) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription(
            "Você não pode atribuir um cargo igual ou maior que o seu.",
          )
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    if (botHighest.position <= role.position) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Cargo maior ou igual ao do bot.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    try {
      await member.roles.add(role);
      const embed = new EmbedBuilder()
        .setTitle("Cargo Adicionado")
        .addFields(
          { name: "Cargo:", value: `${role}`, inline: true },
          { name: "Usuário:", value: `${member.user.username}`, inline: true },
          { name: "Por:", value: `${message.member}`, inline: true },
        )
        .setColor("Green")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      replyEmbed(embed);

      // Log do add cargo
      const logEmbed = new EmbedBuilder()
        .setTitle("Cargo Adicionado")
        .setDescription(
          `Cargo ${role} adicionado para ${member.user.tag} por ${message.author.tag}`,
        )
        .setColor("Green")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      sendLog(message.guild, logEmbed);
    } catch {
      replyEmbed(
        new EmbedBuilder()
          .setDescription("Erro ao adicionar o cargo.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }
  }

  // !remcargo @cargo @pessoa
  else if (command === "remcargo") {
    const member = message.mentions.members.last();
    const roleMention = message.mentions.roles.first();
    if (!member || !roleMention) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Use: `!remcargo @cargo @pessoa`")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    const role = message.guild.roles.cache.get(roleMention.id);
    if (!role) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Cargo não encontrado.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    try {
      await member.roles.remove(role);
      const embed = new EmbedBuilder()
        .setTitle("Cargo Removido")
        .addFields(
          { name: "Cargo:", value: `${role}`, inline: true },
          { name: "Usuário:", value: `${member.user.username}`, inline: true },
          { name: "Por:", value: `${message.member}`, inline: true },
        )
        .setColor("Orange")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      replyEmbed(embed);

      // Log do remove cargo
      const logEmbed = new EmbedBuilder()
        .setTitle("Cargo Removido")
        .setDescription(
          `Cargo ${role} removido de ${member.user.tag} por ${message.author.tag}`,
        )
        .setColor("Orange")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      sendLog(message.guild, logEmbed);
    } catch {
      replyEmbed(
        new EmbedBuilder()
          .setDescription("Erro ao remover o cargo.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }
  }

  // !addadmin @usuário - adiciona cargo admin (assumindo que já existe um cargo admin configurado)
  else if (command === "addadmin") {
    const member = message.mentions.members.first();
    if (!member) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Use: `!addadmin @usuário`")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }
    // Aqui coloque o ID do cargo admin real do seu servidor
    const adminRoleId = "1398885503570542784"; // Exemplo
    const adminRole = message.guild.roles.cache.get(adminRoleId);
    if (!adminRole) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Cargo admin não encontrado.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }
    // ID do cargo permitido a usar o comando
    const permittedRoleId = "1398885470103933018";

    // Verifica se o membro que executou tem esse cargo
    if (!message.member.roles.cache.has(permittedRoleId)) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Você não tem permissão para usar este comando.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    try {
      await member.roles.add(adminRole);
      const embed = new EmbedBuilder()
        .setTitle("Cargo Admin Adicionado")
        .setDescription(`O usuário ${member.user.tag} recebeu o cargo admin.`)
        .setColor("Green")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      replyEmbed(embed);
    } catch {
      replyEmbed(
        new EmbedBuilder()
          .setDescription("Erro ao adicionar o cargo admin.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }
  }

  // !expulsar @usuário motivo
  else if (command === "expulsar") {
    const member = message.mentions.members.first();
    const reason = args.slice(1).join(" ") || "Motivo não informado";
    if (!member) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Use: `!expulsar @usuário motivo`")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    try {
      await member.kick(reason);
      const embed = new EmbedBuilder()
        .setTitle("Usuário Expulso")
        .setDescription(
          `Usuário ${member.user.tag} foi expulso.\nMotivo: ${reason}`,
        )
        .setColor("Orange")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      replyEmbed(embed);

      // Log expulsão
      const logEmbed = new EmbedBuilder()
        .setTitle("Usuário Expulso")
        .setDescription(
          `Usuário ${member.user.tag} expulso por ${message.author.tag}\nMotivo: ${reason}`,
        )
        .setColor("Orange")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      sendLog(message.guild, logEmbed);
    } catch {
      replyEmbed(
        new EmbedBuilder()
          .setDescription("Erro ao expulsar o usuário.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }
  }

  // !banir @usuário motivo
  else if (command === "banir") {
    const member = message.mentions.members.first();
    const reason = args.slice(1).join(" ") || "Motivo não informado";
    if (!member) {
      return replyEmbed(
        new EmbedBuilder()
          .setDescription("Use: `!banir @usuário motivo`")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }

    try {
      await member.ban({ reason });
      const embed = new EmbedBuilder()
        .setTitle("Usuário Banido")
        .setDescription(
          `Usuário ${member.user.tag} foi banido.\nMotivo: ${reason}`,
        )
        .setColor("Red")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      replyEmbed(embed);

      // Log banimento
      const logEmbed = new EmbedBuilder()
        .setTitle("Usuário Banido")
        .setDescription(
          `Usuário ${member.user.tag} banido por ${message.author.tag}\nMotivo: ${reason}`,
        )
        .setColor("Red")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));
      sendLog(message.guild, logEmbed);
    } catch {
      replyEmbed(
        new EmbedBuilder()
          .setDescription("Erro ao banir o usuário.")
          .setColor("Red")
          .setThumbnail(await getGuildIcon(message.guild)),
      );
    }
  } else if (command === "cargos") {
    const roles = message.guild.roles.cache
      .filter((role) => role.name !== "@everyone")
      .sort((a, b) => b.position - a.position);

    if (roles.size === 0) {
      return message.reply("Nenhum cargo encontrado no servidor.");
    }

    const chunks = [];
    let currentChunk = "";

    for (const role of roles.values()) {
      const line = `${role} — \`${role.id}\`\n`;
      if ((currentChunk + line).length > 4096) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      currentChunk += line;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    for (const chunk of chunks) {
      const embed = new EmbedBuilder()
        .setTitle("Lista de Cargos do Servidor")
        .setDescription(chunk)
        .setColor("00f5ff")
        .setTimestamp()
        .setThumbnail(await getGuildIcon(message.guild));

      await message.channel.send({ embeds: [embed] });
    }
  }

  // !ajuda - lista comandos
  else if (command === "ajuda") {
    const embed = new EmbedBuilder()
      .setTitle("Lista de Comandos")
      .setDescription("Aqui estão os comandos que você pode usar:")
      .addFields(
        {
          name: "!addcargo @cargo @pessoa",
          value: "Adiciona um cargo a uma pessoa.",
        },
        {
          name: "!remcargo @cargo @pessoa",
          value: "Remove um cargo de uma pessoa.",
        },
        {
          name: "!addadmin @usuário",
          value: "Adiciona o cargo admin ao usuário.",
        },
        {
          name: "!expulsar @usuário motivo",
          value: "Expulsa um usuário do servidor.",
        },
        {
          name: "!banir @usuário motivo",
          value: "Bane um usuário do servidor.",
        },
        {
          name: "!cargos",
          value: "Mostra todos os cargos e membros que os possuem.",
        },
        { name: "!ajuda", value: "Mostra essa mensagem de ajuda." },
      )
      .setColor("00f5ff")
      .setTimestamp()
      .setThumbnail(await getGuildIcon(message.guild));
    await message.channel.send({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);
