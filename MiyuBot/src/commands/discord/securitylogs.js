const {
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    run,
    get,
    databaseReady
} = require("../../database/database");

module.exports = {
    name: "securitylogs",

    async execute(message, args) {
        await databaseReady;

        if (!message.guild) {
            return message.reply(
                "❌ Cette commande doit être utilisée sur un serveur."
            );
        }

        if (
            !message.member.permissions.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            return message.reply(
                "❌ Tu dois avoir la permission **Gérer le serveur**."
            );
        }

        const subcommand =
            args[0]?.toLowerCase();

        // ==========================================
        // AIDE
        // ==========================================

        if (!subcommand) {
            const embed =
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("🔐 Security Logs")
                    .setDescription(
                        "Gestion du salon centralisé des logs de sécurité de MiyuBot."
                    )
                    .addFields(
                        {
                            name: "📁 Créer le salon",
                            value:
                                "`!securitylogs create`",
                            inline: false
                        },
                        {
                            name: "🧪 Tester les logs",
                            value:
                                "`!securitylogs test`",
                            inline: false
                        },
                        {
                            name: "🔌 Désactiver",
                            value:
                                "`!securitylogs off`",
                            inline: false
                        },
                        {
                            name: "ℹ️ Informations",
                            value:
                                "`!securitylogs info`",
                            inline: false
                        }
                    )
                    .setFooter({
                        text:
                            "MiyuBot • Security System"
                    })
                    .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }

        // ==========================================
        // RÉCUPÉRER LA CONFIGURATION
        // ==========================================

        let settings =
            await get(
                `
                SELECT *
                FROM guild_settings
                WHERE guild_id = ?
                `,
                [
                    message.guild.id
                ]
            );

        if (!settings) {
            const now = Date.now();

            await run(
                `
                INSERT INTO guild_settings (
                    guild_id,
                    security_log_channel_id,
                    anti_raid_enabled,
                    anti_raid_threshold,
                    anti_raid_window,
                    auto_lockdown,
                    lockdown_active,
                    min_account_age_days,
                    anti_spam_enabled,
                    anti_bot_enabled,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    message.guild.id,
                    null,
                    1,
                    10,
                    15,
                    0,
                    0,
                    0,
                    1,
                    1,
                    now,
                    now
                ]
            );

            settings =
                await get(
                    `
                    SELECT *
                    FROM guild_settings
                    WHERE guild_id = ?
                    `,
                    [
                        message.guild.id
                    ]
                );
        }

        // ==========================================
        // CREATE
        // ==========================================

        if (subcommand === "create") {
            if (
                !message.guild.members.me.permissions.has(
                    PermissionFlagsBits.ManageChannels
                )
            ) {
                return message.reply(
                    "❌ MiyuBot n'a pas la permission **Gérer les salons**."
                );
            }

            if (settings.security_log_channel_id) {
                const existingChannel =
                    message.guild.channels.cache.get(
                        settings.security_log_channel_id
                    );

                if (existingChannel) {
                    return message.reply(
                        `⚠️ Le salon de logs est déjà configuré : ${existingChannel}`
                    );
                }
            }

            const channelName =
                "🔐・miyubot-logs";

            let channel =
                message.guild.channels.cache.find(
                    (currentChannel) =>
                        currentChannel.name ===
                        channelName
                );

            if (!channel) {
                channel =
                    await message.guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildText,
                        topic:
                            "🔐 Journal centralisé de sécurité de MiyuBot.",
                        reason:
                            "Création du salon centralisé des logs MiyuBot",
                        permissionOverwrites: [
                            {
                                id: message.guild.roles.everyone.id,
                                deny: [
                                    PermissionFlagsBits.ViewChannel
                                ]
                            },
                            {
                                id: message.client.user.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.EmbedLinks,
                                    PermissionFlagsBits.ReadMessageHistory
                                ]
                            },
                            {
                                id: message.member.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.ReadMessageHistory
                                ]
                            }
                        ]
                    });
            }

            await run(
                `
                UPDATE guild_settings
                SET
                    security_log_channel_id = ?,
                    updated_at = ?
                WHERE guild_id = ?
                `,
                [
                    channel.id,
                    Date.now(),
                    message.guild.id
                ]
            );

            const embed =
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle(
                        "🔐 Salon de logs configuré"
                    )
                    .setDescription(
                        `Le salon centralisé de sécurité de MiyuBot est maintenant ${channel}.`
                    )
                    .addFields(
                        {
                            name: "📁 Salon",
                            value:
                                `${channel}\n\`${channel.name}\``,
                            inline: true
                        },
                        {
                            name: "🔒 Accès",
                            value:
                                "Salon privé",
                            inline: true
                        },
                        {
                            name: "🛡️ Protection",
                            value:
                                "Logs de sécurité activés",
                            inline: true
                        }
                    )
                    .setFooter({
                        text:
                            "MiyuBot • Security System"
                    })
                    .setTimestamp();

            await message.reply({
                embeds: [embed]
            });

            // ======================================
            // PREMIER LOG
            // ======================================

            const startupLog =
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(
                        "🛡️ MiyuBot Security Logs"
                    )
                    .setDescription(
                        "Le système centralisé de logs de sécurité vient d'être configuré."
                    )
                    .addFields(
                        {
                            name: "👮 Configuré par",
                            value:
                                `${message.member}`,
                            inline: true
                        },
                        {
                            name: "🏠 Serveur",
                            value:
                                message.guild.name,
                            inline: true
                        },
                        {
                            name: "🆔 Serveur ID",
                            value:
                                message.guild.id,
                            inline: true
                        },
                        {
                            name: "📋 Événements surveillés",
                            value:
                                [
                                    "👤 Membres",
                                    "🚨 Anti-Raid",
                                    "🔒 Lockdown",
                                    "🛡️ Sécurité",
                                    "⚙️ Configuration",
                                    "🤖 Bots",
                                    "🎭 Rôles",
                                    "📁 Salons"
                                ].join("\n"),
                            inline: false
                        }
                    )
                    .setFooter({
                        text:
                            "MiyuBot Security • Journal central"
                    })
                    .setTimestamp();

            try {
                await channel.send({
                    embeds: [startupLog]
                });
            } catch (error) {
                console.error(
                    "❌ Impossible d'envoyer le premier log :",
                    error
                );
            }

            return;
        }

        // ==========================================
        // TEST
        // ==========================================

        if (subcommand === "test") {
            if (
                !settings.security_log_channel_id
            ) {
                return message.reply(
                    "❌ Aucun salon de logs n'est configuré.\n\nUtilise `!securitylogs create`."
                );
            }

            const channel =
                message.guild.channels.cache.get(
                    settings.security_log_channel_id
                );

            if (!channel) {
                return message.reply(
                    "❌ Le salon configuré n'existe plus.\n\nUtilise `!securitylogs create`."
                );
            }

            const embed =
                new EmbedBuilder()
                    .setColor(0x00AEFF)
                    .setTitle(
                        "🧪 TEST DES SECURITY LOGS"
                    )
                    .setDescription(
                        "MiyuBot vient d'effectuer un test du système centralisé de logs."
                    )
                    .addFields(
                        {
                            name: "👮 Test effectué par",
                            value:
                                `${message.member}\n\`${message.author.username}\``,
                            inline: true
                        },
                        {
                            name: "🆔 Utilisateur",
                            value:
                                `\`${message.author.id}\``,
                            inline: true
                        },
                        {
                            name: "📁 Salon",
                            value:
                                `${channel}`,
                            inline: true
                        },
                        {
                            name: "✅ Résultat",
                            value:
                                "Le système de logs fonctionne correctement.",
                            inline: false
                        }
                    )
                    .setFooter({
                        text:
                            "MiyuBot • Security Test"
                    })
                    .setTimestamp();

            try {
                await channel.send({
                    embeds: [embed]
                });
            } catch (error) {
                console.error(
                    "❌ Erreur test Security Logs :",
                    error
                );

                return message.reply(
                    "❌ MiyuBot n'arrive pas à écrire dans le salon de logs."
                );
            }

            return message.reply(
                `✅ Test envoyé dans ${channel}.`
            );
        }

        // ==========================================
        // INFO
        // ==========================================

        if (subcommand === "info") {
            let channel = null;

            if (
                settings.security_log_channel_id
            ) {
                channel =
                    message.guild.channels.cache.get(
                        settings.security_log_channel_id
                    );
            }

            const embed =
                new EmbedBuilder()
                    .setColor(
                        channel
                            ? 0x57F287
                            : 0xED4245
                    )
                    .setTitle(
                        "🔐 Configuration Security Logs"
                    )
                    .addFields(
                        {
                            name: "📁 Salon",
                            value:
                                channel
                                    ? `${channel}\n\`${channel.id}\``
                                    : "❌ Aucun",
                            inline: false
                        },
                        {
                            name: "📡 État",
                            value:
                                channel
                                    ? "🟢 Actif"
                                    : "🔴 Désactivé",
                            inline: true
                        },
                        {
                            name: "🔒 Accès",
                            value:
                                channel
                                    ? "Privé"
                                    : "N/A",
                            inline: true
                        }
                    )
                    .setFooter({
                        text:
                            "MiyuBot • Security System"
                    })
                    .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }

        // ==========================================
        // OFF
        // ==========================================

        if (subcommand === "off") {
            if (
                !settings.security_log_channel_id
            ) {
                return message.reply(
                    "⚠️ Aucun salon de logs n'est actuellement configuré."
                );
            }

            const oldChannel =
                message.guild.channels.cache.get(
                    settings.security_log_channel_id
                );

            await run(
                `
                UPDATE guild_settings
                SET
                    security_log_channel_id = NULL,
                    updated_at = ?
                WHERE guild_id = ?
                `,
                [
                    Date.now(),
                    message.guild.id
                ]
            );

            const embed =
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle(
                        "🔕 Security Logs désactivés"
                    )
                    .setDescription(
                        "MiyuBot n'enverra plus automatiquement les logs de sécurité dans un salon."
                    )
                    .addFields({
                        name: "📁 Ancien salon",
                        value:
                            oldChannel
                                ? `${oldChannel}`
                                : "Salon introuvable"
                    })
                    .setFooter({
                        text:
                            "MiyuBot • Security System"
                    })
                    .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }

        // ==========================================
        // COMMANDE INCONNUE
        // ==========================================

        return message.reply(
            "❌ Sous-commande inconnue.\n\n" +
            "Utilise `!securitylogs` pour voir les commandes disponibles."
        );
    }
};