const {
    EmbedBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    run,
    get,
    databaseReady
} = require("../../database/database");


// ==========================================
// VALEURS PAR DÉFAUT
// ==========================================

const DEFAULTS = {
    anti_raid_enabled: 1,
    anti_raid_threshold: 10,
    anti_raid_window: 15,
    auto_lockdown: 0,
    min_account_age_days: 0,
    anti_spam_enabled: 1,
    anti_spam_threshold: 6,
    anti_spam_window: 8,
    anti_spam_sanction: "ban",
    anti_bot_enabled: 1,
    anti_nuke_enabled: 1,
    anti_nuke_threshold: 3,
    anti_nuke_threshold_channel: 3,
    anti_nuke_threshold_role: 3,
    anti_nuke_threshold_webhook: 2,
    anti_nuke_threshold_ban: 3,
    anti_nuke_window: 15,
    anti_nuke_sanction: "ban",
    quarantine_enabled: 0,
    quarantine_role_id: null,
    quarantine_account_age_days: 0
};


// ==========================================
// RÉCUPÉRER / CRÉER LA CONFIGURATION
// ==========================================

async function getGuildSettings(guildId) {
    await databaseReady;

    let settings = await get(
        `
        SELECT *
        FROM guild_settings
        WHERE guild_id = ?
        `,
        [guildId]
    );

    if (settings) {
        return settings;
    }

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
            anti_spam_threshold,
            anti_spam_window,
            anti_spam_sanction,
            anti_bot_enabled,
            anti_nuke_enabled,
            anti_nuke_threshold,
            anti_nuke_threshold_channel,
            anti_nuke_threshold_role,
            anti_nuke_threshold_webhook,
            anti_nuke_threshold_ban,
            anti_nuke_window,
            anti_nuke_sanction,
            quarantine_enabled,
            quarantine_role_id,
            quarantine_account_age_days,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            guildId,
            null,
            DEFAULTS.anti_raid_enabled,
            DEFAULTS.anti_raid_threshold,
            DEFAULTS.anti_raid_window,
            DEFAULTS.auto_lockdown,
            0,
            DEFAULTS.min_account_age_days,
            DEFAULTS.anti_spam_enabled,
            DEFAULTS.anti_spam_threshold,
            DEFAULTS.anti_spam_window,
            DEFAULTS.anti_spam_sanction,
            DEFAULTS.anti_bot_enabled,
            DEFAULTS.anti_nuke_enabled,
            DEFAULTS.anti_nuke_threshold,
            DEFAULTS.anti_nuke_threshold_channel,
            DEFAULTS.anti_nuke_threshold_role,
            DEFAULTS.anti_nuke_threshold_webhook,
            DEFAULTS.anti_nuke_threshold_ban,
            DEFAULTS.anti_nuke_window,
            DEFAULTS.anti_nuke_sanction,
            DEFAULTS.quarantine_enabled,
            DEFAULTS.quarantine_role_id,
            DEFAULTS.quarantine_account_age_days,
            now,
            now
        ]
    );

    return await get(
        `
        SELECT *
        FROM guild_settings
        WHERE guild_id = ?
        `,
        [guildId]
    );
}


// ==========================================
// SAUVEGARDER UNE CONFIGURATION
// ==========================================

async function updateSetting(
    guildId,
    column,
    value
) {
    const allowedColumns = [
        "anti_raid_enabled",
        "anti_raid_threshold",
        "anti_raid_window",
        "auto_lockdown",
        "min_account_age_days",
        "anti_spam_enabled",
        "anti_spam_threshold",
        "anti_spam_window",
        "anti_spam_sanction",
        "anti_bot_enabled",
        "anti_nuke_enabled",
        "anti_nuke_threshold",
        "anti_nuke_threshold_channel",
        "anti_nuke_threshold_role",
        "anti_nuke_threshold_webhook",
        "anti_nuke_threshold_ban",
        "anti_nuke_window",
        "anti_nuke_sanction",
        "quarantine_enabled",
        "quarantine_role_id",
        "quarantine_account_age_days",
        "security_log_channel_id"
    ];

    if (!allowedColumns.includes(column)) {
        throw new Error(
            `Paramètre interdit : ${column}`
        );
    }

    await run(
        `
        UPDATE guild_settings
        SET
            ${column} = ?,
            updated_at = ?
        WHERE guild_id = ?
        `,
        [
            value,
            Date.now(),
            guildId
        ]
    );

    return getGuildSettings(guildId);
}


// ==========================================
// OBTENIR LE STATUT
// ==========================================

function enabled(value) {
    return Number(value) === 1
        ? "🟢 Activé"
        : "🔴 Désactivé";
}


// ==========================================
// AFFICHER LA CONFIGURATION
// ==========================================

async function showConfig(message) {
    const settings =
        await getGuildSettings(
            message.guild.id
        );

    const logChannel =
        settings.security_log_channel_id
            ? `<#${settings.security_log_channel_id}>`
            : "❌ Non configuré";

    const lockdownStatus =
        Number(settings.lockdown_active) === 1
            ? "🔴 **LOCKDOWN ACTIF**"
            : "🟢 Serveur en fonctionnement normal";

    const embed =
        new EmbedBuilder()
            .setColor(
                Number(settings.lockdown_active) === 1
                    ? 0xFF0000
                    : 0x5865F2
            )
            .setTitle(
                "⚙️ Configuration MiyuBot"
            )
            .setDescription(
                `Configuration de sécurité pour **${message.guild.name}**`
            )
            .addFields(
                {
                    name: "📜 Salon des logs de sécurité",
                    value: logChannel,
                    inline: false
                },
                {
                    name: "🚨 Anti-Raid",
                    value: enabled(
                        settings.anti_raid_enabled
                    ),
                    inline: true
                },
                {
                    name: "👥 Seuil Anti-Raid",
                    value:
                        `**${settings.anti_raid_threshold} membres**`,
                    inline: true
                },
                {
                    name: "⏱️ Fenêtre Anti-Raid",
                    value:
                        `**${settings.anti_raid_window} secondes**`,
                    inline: true
                },
                {
                    name: "🔒 Lockdown automatique",
                    value: enabled(
                        settings.auto_lockdown
                    ),
                    inline: true
                },
                {
                    name: "🆕 Âge minimum du compte",
                    value:
                        Number(
                            settings.min_account_age_days
                        ) > 0
                            ? `**${settings.min_account_age_days} jours**`
                            : "❌ Désactivé",
                    inline: true
                },
                {
                    name: "💬 Anti-Spam",
                    value: enabled(
                        settings.anti_spam_enabled
                    ),
                    inline: true
                },
                {
                    name: "🧪 Seuil Anti-Spam",
                    value:
                        `**${Number(settings.anti_spam_threshold || 6)} messages**`,
                    inline: true
                },
                {
                    name: "⏱️ Fenêtre Anti-Spam",
                    value:
                        `**${Number(settings.anti_spam_window || 8)} secondes**`,
                    inline: true
                },
                {
                    name: "⚖️ Sanction max Anti-Spam",
                    value:
                        `**${String(settings.anti_spam_sanction || "ban").toUpperCase()}**`,
                    inline: true
                },
                {
                    name: "🤖 Anti-Bot",
                    value: enabled(
                        settings.anti_bot_enabled
                    ),
                    inline: true
                },
                {
                    name: "🧨 Anti-Nuke",
                    value: enabled(
                        settings.anti_nuke_enabled
                    ),
                    inline: true
                },
                {
                    name: "🎯 Seuil Anti-Nuke",
                    value:
                        `**${Number(settings.anti_nuke_threshold || 3)} actions**`,
                    inline: true
                },
                {
                    name: "📁 Seuil salons",
                    value:
                        `**${Number(settings.anti_nuke_threshold_channel || settings.anti_nuke_threshold || 3)}**`,
                    inline: true
                },
                {
                    name: "🎭 Seuil rôles",
                    value:
                        `**${Number(settings.anti_nuke_threshold_role || settings.anti_nuke_threshold || 3)}**`,
                    inline: true
                },
                {
                    name: "🪝 Seuil webhooks",
                    value:
                        `**${Number(settings.anti_nuke_threshold_webhook || settings.anti_nuke_threshold || 3)}**`,
                    inline: true
                },
                {
                    name: "🔨 Seuil bans",
                    value:
                        `**${Number(settings.anti_nuke_threshold_ban || settings.anti_nuke_threshold || 3)}**`,
                    inline: true
                },
                {
                    name: "⏱️ Fenêtre Anti-Nuke",
                    value:
                        `**${Number(settings.anti_nuke_window || 15)} secondes**`,
                    inline: true
                },
                {
                    name: "⚖️ Sanction Anti-Nuke",
                    value:
                        `**${String(settings.anti_nuke_sanction || "ban").toUpperCase()}**`,
                    inline: true
                },
                {
                    name: "🧪 Quarantaine auto",
                    value:
                        enabled(
                            settings.quarantine_enabled
                        ),
                    inline: true
                },
                {
                    name: "🪪 Rôle quarantaine",
                    value:
                        settings.quarantine_role_id
                            ? `<@&${settings.quarantine_role_id}>`
                            : "❌ Non configuré",
                    inline: true
                },
                {
                    name: "📅 Âge max quarantaine",
                    value:
                        Number(settings.quarantine_account_age_days || 0) > 0
                            ? `**${Number(settings.quarantine_account_age_days)} jours**`
                            : "❌ Désactivé",
                    inline: true
                },
                {
                    name: "🛡️ Protection actuelle",
                    value: lockdownStatus,
                    inline: false
                }
            )
            .addFields({
                name: "📖 Commandes de configuration",
                value:
                    "`!config show`\n" +
                    "`!config lockdown on/off`\n" +
                    "`!config raid on/off`\n" +
                    "`!config raid threshold <nombre>`\n" +
                    "`!config raid window <secondes>`\n" +
                    "`!config spam on/off`\n" +
                    "`!config spam threshold <nombre>`\n" +
                    "`!config spam window <secondes>`\n" +
                    "`!config spam sanction <ban|kick|timeout>`\n" +
                    "`!config bot on/off`\n" +
                    "`!config antinuke on/off`\n" +
                    "`!config antinuke threshold <nombre>`\n" +
                        "`!config antinuke threshold <channel|role|webhook|ban> <nombre>`\n" +
                    "`!config antinuke window <secondes>`\n" +
                    "`!config antinuke sanction <ban|kick|timeout>`\n" +
                        "`!config quarantine on/off`\n" +
                        "`!config quarantine role @role`\n" +
                        "`!config quarantine age <jours>`\n" +
                    "`!config age <jours>`\n" +
                    "`!config logs #salon`\n" +
                    "`!config logs off`"
            })
            .setFooter({
                text:
                    "MiyuBot • Security Configuration"
            })
            .setTimestamp();

    return message.reply({
        embeds: [embed]
    });
}


// ==========================================
// AIDE CONFIG
// ==========================================

async function showHelp(message) {
    const embed =
        new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(
                "⚙️ Configuration de MiyuBot"
            )
            .setDescription(
                "Voici les commandes disponibles pour configurer la sécurité du serveur."
            )
            .addFields(
                {
                    name: "📊 Afficher la configuration",
                    value:
                        "`!config show`"
                },
                {
                    name: "🔒 Lockdown automatique",
                    value:
                        "`!config lockdown on`\n" +
                        "`!config lockdown off`"
                },
                {
                    name: "🚨 Anti-Raid",
                    value:
                        "`!config raid on`\n" +
                        "`!config raid off`\n" +
                        "`!config raid threshold 10`\n" +
                        "`!config raid window 15`"
                },
                {
                    name: "💬 Anti-Spam",
                    value:
                        "`!config spam on`\n" +
                        "`!config spam off`\n" +
                        "`!config spam threshold 6`\n" +
                        "`!config spam window 8`\n" +
                        "`!config spam sanction ban`"
                },
                {
                    name: "🤖 Anti-Bot",
                    value:
                        "`!config bot on`\n" +
                        "`!config bot off`"
                },
                {
                    name: "🧨 Anti-Nuke",
                    value:
                        "`!config antinuke on`\n" +
                        "`!config antinuke off`\n" +
                        "`!config antinuke threshold 3`\n" +
                        "`!config antinuke threshold channel 3`\n" +
                        "`!config antinuke threshold role 3`\n" +
                        "`!config antinuke threshold webhook 2`\n" +
                        "`!config antinuke threshold ban 3`\n" +
                        "`!config antinuke window 15`\n" +
                        "`!config antinuke sanction ban`"
                },
                {
                    name: "🧪 Quarantaine",
                    value:
                        "`!config quarantine on`\n" +
                        "`!config quarantine off`\n" +
                        "`!config quarantine role @quarantaine`\n" +
                        "`!config quarantine age 7`"
                },
                {
                    name: "🆕 Âge minimum",
                    value:
                        "`!config age 7`\n" +
                        "`!config age 0` pour désactiver"
                },
                {
                    name: "📜 Logs de sécurité",
                    value:
                        "`!config logs #logs-securite`\n" +
                        "`!config logs off`"
                }
            )
            .setFooter({
                text:
                    "MiyuBot • Security Configuration"
            });

    return message.reply({
        embeds: [embed]
    });
}


// ==========================================
// VÉRIFIER LES PERMISSIONS
// ==========================================

function hasPermission(message) {
    return message.member.permissions.has(
        PermissionFlagsBits.ManageGuild
    );
}


// ==========================================
// COMMANDE
// ==========================================

module.exports = {
    name: "config",

    async execute(message, args) {

        const safeArgs =
            Array.isArray(args)
                ? args
                : [];

        let action =
            safeArgs.shift();

        action =
            typeof action === "string"
                ? action
                    .toLowerCase()
                    .replace(/[.,;:!?]+$/, "")
                : "";

        if (!message.guild) {
            return message.reply(
                "❌ Cette commande doit être utilisée sur un serveur."
            );
        }

        if (!hasPermission(message)) {
            return message.reply(
                "❌ Tu dois avoir la permission **Gérer le serveur** pour modifier la configuration de MiyuBot."
            );
        }

        await databaseReady;


        // ======================================
        // ANTI-NUKE
        // ======================================

        if (action === "antinuke") {

            const option =
                args.shift()?.toLowerCase();

            if (
                option === "on" ||
                option === "off"
            ) {

                const value =
                    option === "on" ? 1 : 0;

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_nuke_enabled",
                        value
                    );

                return message.reply(
                    `✅ Anti-Nuke ${Number(settings.anti_nuke_enabled) === 1 ? "activé" : "désactivé"}.`
                );
            }

            if (option === "threshold") {

                const maybeType =
                    String(args[0] || "")
                        .toLowerCase();

                const isTypedThreshold =
                    [
                        "channel",
                        "role",
                        "webhook",
                        "ban"
                    ].includes(maybeType);

                const thresholdType =
                    isTypedThreshold
                        ? args.shift().toLowerCase()
                        : null;

                const value =
                    Number(args.shift());

                if (
                    !Number.isInteger(value) ||
                    value < 2 ||
                    value > 20
                ) {
                    return message.reply(
                        "❌ Le seuil Anti-Nuke doit être entre 2 et 20."
                    );
                }

                if (!thresholdType) {
                    const settings =
                        await updateSetting(
                            message.guild.id,
                            "anti_nuke_threshold",
                            value
                        );

                    return message.reply(
                        `✅ Seuil Anti-Nuke global défini sur ${Number(settings.anti_nuke_threshold)} actions.`
                    );
                }

                const thresholdColumnByType = {
                    channel:
                        "anti_nuke_threshold_channel",
                    role:
                        "anti_nuke_threshold_role",
                    webhook:
                        "anti_nuke_threshold_webhook",
                    ban:
                        "anti_nuke_threshold_ban"
                };

                await updateSetting(
                    message.guild.id,
                    thresholdColumnByType[thresholdType],
                    value
                );

                return message.reply(
                    `✅ Seuil Anti-Nuke ${thresholdType} défini sur ${value} actions.`
                );
            }

            if (option === "window") {

                const value =
                    Number(args.shift());

                if (
                    !Number.isInteger(value) ||
                    value < 5 ||
                    value > 120
                ) {
                    return message.reply(
                        "❌ La fenêtre Anti-Nuke doit être entre 5 et 120 secondes."
                    );
                }

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_nuke_window",
                        value
                    );

                return message.reply(
                    `✅ Fenêtre Anti-Nuke définie sur ${Number(settings.anti_nuke_window)} secondes.`
                );
            }

            if (option === "sanction") {

                const sanction =
                    args.shift()?.toLowerCase();

                if (
                    sanction !== "ban" &&
                    sanction !== "kick" &&
                    sanction !== "timeout"
                ) {
                    return message.reply(
                        "❌ Sanction invalide. Utilise ban, kick ou timeout."
                    );
                }

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_nuke_sanction",
                        sanction
                    );

                return message.reply(
                    `✅ Sanction Anti-Nuke définie sur ${String(settings.anti_nuke_sanction).toUpperCase()}.`
                );
            }

            return message.reply(
                "❌ Utilisation :\n" +
                "`!config antinuke on/off`\n" +
                "`!config antinuke threshold <nombre>`\n" +
                "`!config antinuke threshold <channel|role|webhook|ban> <nombre>`\n" +
                "`!config antinuke window <secondes>`\n" +
                "`!config antinuke sanction <ban|kick|timeout>`"
            );
        }

        // ======================================
        // AUCUN ARGUMENT
        // ======================================

        if (!action) {
            return showHelp(message);
        }


        // ======================================
        // SHOW
        // ======================================

        if (action === "show") {
            return showConfig(message);
        }


        // ======================================
        // LOCKDOWN AUTOMATIQUE
        // ======================================

        if (action === "lockdown") {

            const value =
                args.shift()?.toLowerCase();

            if (
                value !== "on" &&
                value !== "off"
            ) {
                return message.reply(
                    "❌ Utilisation : `!config lockdown on/off`"
                );
            }

            const enabledValue =
                value === "on" ? 1 : 0;

            const settings =
                await updateSetting(
                    message.guild.id,
                    "auto_lockdown",
                    enabledValue
                );

            const embed =
                new EmbedBuilder()
                    .setColor(
                        enabledValue === 1
                            ? 0x00FF88
                            : 0xFF5555
                    )
                    .setTitle(
                        enabledValue === 1
                            ? "🔒 Lockdown automatique activé"
                            : "🔓 Lockdown automatique désactivé"
                    )
                    .setDescription(
                        enabledValue === 1
                            ? "MiyuBot verrouillera automatiquement le serveur lorsqu'un Anti-Raid sera détecté."
                            : "MiyuBot ne déclenchera plus automatiquement de lockdown lors d'un raid."
                    )
                    .addFields({
                        name: "📊 État",
                        value:
                            enabled(
                                settings.auto_lockdown
                            )
                    })
                    .setFooter({
                        text:
                            "MiyuBot • Security Configuration"
                    })
                    .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }


        // ======================================
        // ANTI-RAID
        // ======================================

        if (action === "raid") {

            const option =
                args.shift()?.toLowerCase();

            if (
                option === "on" ||
                option === "off"
            ) {

                const value =
                    option === "on" ? 1 : 0;

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_raid_enabled",
                        value
                    );

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            value === 1
                                ? 0x00FF88
                                : 0xFF5555
                        )
                        .setTitle(
                            value === 1
                                ? "🚨 Anti-Raid activé"
                                : "🛑 Anti-Raid désactivé"
                        )
                        .setDescription(
                            value === 1
                                ? "MiyuBot surveille maintenant les arrivées massives."
                                : "La détection automatique des raids est désactivée."
                        )
                        .addFields({
                            name: "📊 État",
                            value:
                                enabled(
                                    settings.anti_raid_enabled
                                )
                        })
                        .setFooter({
                            text:
                                "MiyuBot • Security Configuration"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }


            if (
                option === "threshold"
            ) {

                const value =
                    Number(args.shift());

                if (
                    !Number.isInteger(value) ||
                    value < 2 ||
                    value > 1000
                ) {
                    return message.reply(
                        "❌ Le seuil doit être un nombre entier entre **2 et 1000**."
                    );
                }

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_raid_threshold",
                        value
                    );

                const embed =
                    new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle(
                            "👥 Seuil Anti-Raid modifié"
                        )
                        .setDescription(
                            `MiyuBot considérera désormais **${value} arrivées** comme un raid potentiel.`
                        )
                        .addFields({
                            name: "🛡️ Nouveau seuil",
                            value:
                                `**${settings.anti_raid_threshold} membres**`
                        })
                        .setFooter({
                            text:
                                "MiyuBot • Security Configuration"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }


            if (
                option === "window"
            ) {

                const value =
                    Number(args.shift());

                if (
                    !Number.isInteger(value) ||
                    value < 3 ||
                    value > 300
                ) {
                    return message.reply(
                        "❌ La fenêtre doit être un nombre entier entre **3 et 300 secondes**."
                    );
                }

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_raid_window",
                        value
                    );

                const embed =
                    new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle(
                            "⏱️ Fenêtre Anti-Raid modifiée"
                        )
                        .setDescription(
                            `MiyuBot analysera désormais les arrivées sur une fenêtre de **${value} secondes**.`
                        )
                        .addFields({
                            name: "⏱️ Nouvelle fenêtre",
                            value:
                                `**${settings.anti_raid_window} secondes**`
                        })
                        .setFooter({
                            text:
                                "MiyuBot • Security Configuration"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }


            return message.reply(
                "❌ Utilisation :\n" +
                "`!config raid on/off`\n" +
                "`!config raid threshold <nombre>`\n" +
                "`!config raid window <secondes>`"
            );
        }


        // ======================================
        // ANTI-SPAM
        // ======================================

        if (action === "spam") {

            const value =
                args.shift()?.toLowerCase();

            if (
                value === "on" ||
                value === "off"
            ) {
                const enabledValue =
                    value === "on" ? 1 : 0;

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_spam_enabled",
                        enabledValue
                    );

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            enabledValue === 1
                                ? 0x00FF88
                                : 0xFF5555
                        )
                        .setTitle(
                            enabledValue === 1
                                ? "💬 Anti-Spam activé"
                                : "🛑 Anti-Spam désactivé"
                        )
                        .addFields({
                            name: "📊 État",
                            value:
                                enabled(
                                    settings.anti_spam_enabled
                                )
                        })
                        .setFooter({
                            text:
                                "MiyuBot • Security Configuration"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }

            if (value === "threshold") {

                const threshold =
                    Number(args.shift());

                if (
                    !Number.isInteger(threshold) ||
                    threshold < 3 ||
                    threshold > 20
                ) {
                    return message.reply(
                        "❌ Le seuil Anti-Spam doit être entre 3 et 20."
                    );
                }

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_spam_threshold",
                        threshold
                    );

                return message.reply(
                    `✅ Seuil Anti-Spam défini sur ${Number(settings.anti_spam_threshold)} messages.`
                );
            }

            if (value === "window") {

                const windowSeconds =
                    Number(args.shift());

                if (
                    !Number.isInteger(windowSeconds) ||
                    windowSeconds < 5 ||
                    windowSeconds > 60
                ) {
                    return message.reply(
                        "❌ La fenêtre Anti-Spam doit être entre 5 et 60 secondes."
                    );
                }

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_spam_window",
                        windowSeconds
                    );

                return message.reply(
                    `✅ Fenêtre Anti-Spam définie sur ${Number(settings.anti_spam_window)} secondes.`
                );
            }

            if (value === "sanction") {

                const sanction =
                    args.shift()?.toLowerCase();

                if (
                    sanction !== "ban" &&
                    sanction !== "kick" &&
                    sanction !== "timeout"
                ) {
                    return message.reply(
                        "❌ Sanction invalide. Utilise ban, kick ou timeout."
                    );
                }

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "anti_spam_sanction",
                        sanction
                    );

                return message.reply(
                    `✅ Sanction max Anti-Spam définie sur ${String(settings.anti_spam_sanction).toUpperCase()}.`
                );
            }

            return message.reply(
                "❌ Utilisation :\n" +
                "`!config spam on/off`\n" +
                "`!config spam threshold <nombre>`\n" +
                "`!config spam window <secondes>`\n" +
                "`!config spam sanction <ban|kick|timeout>`"
            );
        }


        // ======================================
        // ANTI-BOT
        // ======================================

        if (action === "bot") {

            const value =
                args.shift()?.toLowerCase();

            if (
                value !== "on" &&
                value !== "off"
            ) {
                return message.reply(
                    "❌ Utilisation : `!config bot on/off`"
                );
            }

            const enabledValue =
                value === "on" ? 1 : 0;

            const settings =
                await updateSetting(
                    message.guild.id,
                    "anti_bot_enabled",
                    enabledValue
                );

            const embed =
                new EmbedBuilder()
                    .setColor(
                        enabledValue === 1
                            ? 0x00FF88
                            : 0xFF5555
                    )
                    .setTitle(
                        enabledValue === 1
                            ? "🤖 Anti-Bot activé"
                            : "🛑 Anti-Bot désactivé"
                    )
                    .addFields({
                        name: "📊 État",
                        value:
                            enabled(
                                settings.anti_bot_enabled
                            )
                    })
                    .setFooter({
                        text:
                            "MiyuBot • Security Configuration"
                    })
                    .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }


        // ======================================
        // QUARANTAINE
        // ======================================

        if (action === "quarantine") {

            const option =
                args.shift()?.toLowerCase();

            if (option === "on" || option === "off") {
                const value = option === "on" ? 1 : 0;

                const settings =
                    await updateSetting(
                        message.guild.id,
                        "quarantine_enabled",
                        value
                    );

                return message.reply(
                    `✅ Quarantaine automatique ${Number(settings.quarantine_enabled) === 1 ? "activée" : "désactivée"}.`
                );
            }

            if (option === "role") {
                const role =
                    message.mentions.roles.first();

                if (!role) {
                    return message.reply(
                        "❌ Utilisation : `!config quarantine role @role`"
                    );
                }

                await updateSetting(
                    message.guild.id,
                    "quarantine_role_id",
                    role.id
                );

                return message.reply(
                    `✅ Rôle de quarantaine configuré sur ${role}.`
                );
            }

            if (option === "age") {
                const value = Number(args.shift());

                if (
                    !Number.isInteger(value) ||
                    value < 0 ||
                    value > 3650
                ) {
                    return message.reply(
                        "❌ L'âge de quarantaine doit être entre 0 et 3650 jours."
                    );
                }

                await updateSetting(
                    message.guild.id,
                    "quarantine_account_age_days",
                    value
                );

                return message.reply(
                    value === 0
                        ? "✅ Quarantaine par âge désactivée."
                        : `✅ Quarantaine activée pour les comptes de moins de ${value} jours.`
                );
            }

            return message.reply(
                "❌ Utilisation :\n" +
                "`!config quarantine on/off`\n" +
                "`!config quarantine role @role`\n" +
                "`!config quarantine age <jours>`"
            );
        }


        // ======================================
        // ÂGE MINIMUM DU COMPTE
        // ======================================

        if (action === "age") {

            const value =
                Number(args.shift());

            if (
                !Number.isInteger(value) ||
                value < 0 ||
                value > 3650
            ) {
                return message.reply(
                    "❌ L'âge doit être un nombre entier entre **0 et 3650 jours**."
                );
            }

            const settings =
                await updateSetting(
                    message.guild.id,
                    "min_account_age_days",
                    value
                );

            const embed =
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(
                        "🆕 Âge minimum du compte modifié"
                    )
                    .setDescription(
                        value === 0
                            ? "La restriction d'âge minimum est maintenant désactivée."
                            : `Les comptes âgés de moins de **${value} jours** pourront être considérés comme suspects.`
                    )
                    .addFields({
                        name: "🆕 Nouvelle valeur",
                        value:
                            value === 0
                                ? "❌ Désactivé"
                                : `**${settings.min_account_age_days} jours**`
                    })
                    .setFooter({
                        text:
                            "MiyuBot • Security Configuration"
                    })
                    .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }


        // ======================================
        // LOGS DE SÉCURITÉ
        // ======================================

        if (action === "logs") {

            const channelArg =
                args.shift();

            if (!channelArg) {
                return message.reply(
                    "❌ Utilisation : `!config logs #salon` ou `!config logs off`"
                );
            }


            if (
                channelArg.toLowerCase() === "off"
            ) {

                await updateSetting(
                    message.guild.id,
                    "security_log_channel_id",
                    null
                );

                const embed =
                    new EmbedBuilder()
                        .setColor(0xFF5555)
                        .setTitle(
                            "📜 Logs de sécurité désactivés"
                        )
                        .setDescription(
                            "MiyuBot n'enverra plus les événements de sécurité dans un salon dédié."
                        )
                        .setFooter({
                            text:
                                "MiyuBot • Security Configuration"
                        })
                        .setTimestamp();

                return message.reply({
                    embeds: [embed]
                });
            }


            const channel =
                message.mentions.channels.first();

            if (!channel) {
                return message.reply(
                    "❌ Mentionne un salon valide.\n\n" +
                    "Exemple : `!config logs #logs-securite`"
                );
            }


            if (!channel.isTextBased()) {
                return message.reply(
                    "❌ Ce salon ne peut pas recevoir de logs textuels."
                );
            }


            await updateSetting(
                message.guild.id,
                "security_log_channel_id",
                channel.id
            );

            const embed =
                new EmbedBuilder()
                    .setColor(0x00FF88)
                    .setTitle(
                        "📜 Salon de logs configuré"
                    )
                    .setDescription(
                        `Les événements de sécurité seront maintenant envoyés dans ${channel}.`
                    )
                    .addFields({
                        name: "📜 Salon",
                        value:
                            `${channel}`
                    })
                    .setFooter({
                        text:
                            "MiyuBot • Security Configuration"
                    })
                    .setTimestamp();

            return message.reply({
                embeds: [embed]
            });
        }


        // ======================================
        // COMMANDE INCONNUE
        // ======================================

        return message.reply(
            "❌ Option inconnue.\n\n" +
            "Utilise `!config` pour voir toutes les options."
        );
    }
};