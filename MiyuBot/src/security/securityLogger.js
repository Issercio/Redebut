const {
    EmbedBuilder
} = require("discord.js");

const {
    get,
    databaseReady
} = require("../database/database");

const SECURITY_LOG_CACHE_TTL_MS = 60 * 1000;
const securityLogChannelCache = new Map();
const guildLogPipelines = new Map();


/*
 * ============================================================
 * MIYUBOT - SECURITY LOGGER
 * ============================================================
 *
 * Gestionnaire centralisé des logs de sécurité.
 *
 * Tous les événements importants de MiyuBot pourront passer
 * par ce fichier afin de conserver un format uniforme.
 *
 * ============================================================
 */


/*
 * ============================================================
 * COULEURS
 * ============================================================
 */

const COLORS = {
    info: 0x5865F2,
    success: 0x57F287,
    warning: 0xFEE75C,
    danger: 0xED4245,
    critical: 0x992D22,
    security: 0x9B59B6,
    neutral: 0x95A5A6
};


/*
 * ============================================================
 * OBTENIR LE SALON DE LOGS
 * ============================================================
 */

async function getSecurityLogChannel(guild) {
    if (!guild) {
        return null;
    }

    try {
        await databaseReady;

        const cachedData =
            securityLogChannelCache.get(guild.id);

        if (
            cachedData &&
            Date.now() - cachedData.cachedAt <= SECURITY_LOG_CACHE_TTL_MS
        ) {
            const cachedChannel =
                guild.channels.cache.get(
                    cachedData.channelId
                );

            if (cachedChannel && cachedChannel.isTextBased()) {
                return cachedChannel;
            }
        }

        const settings = await get(
            `
            SELECT security_log_channel_id
            FROM guild_settings
            WHERE guild_id = ?
            `,
            [guild.id]
        );

        if (!settings) {
            return null;
        }

        const channelId =
            settings.security_log_channel_id;

        if (!channelId) {
            return null;
        }

        let channel =
            guild.channels.cache.get(channelId);

        if (!channel) {
            try {
                channel =
                    await guild.channels.fetch(channelId);
            } catch (error) {
                console.error(
                    "⚠️ Impossible de récupérer le salon de logs :",
                    error
                );

                return null;
            }
        }

        if (!channel) {
            return null;
        }

        if (!channel.isTextBased()) {
            return null;
        }

        securityLogChannelCache.set(
            guild.id,
            {
                channelId,
                cachedAt: Date.now()
            }
        );

        return channel;
    } catch (error) {
        console.error(
            "❌ Erreur récupération salon sécurité :",
            error
        );

        return null;
    }
}


function enqueueGuildLog(guildId, task) {
    const previousTask =
        guildLogPipelines.get(guildId) || Promise.resolve();

    const nextTask =
        previousTask
            .catch(() => null)
            .then(task)
            .finally(() => {
                if (guildLogPipelines.get(guildId) === nextTask) {
                    guildLogPipelines.delete(guildId);
                }
            });

    guildLogPipelines.set(guildId, nextTask);

    return nextTask;
}


/*
 * ============================================================
 * NETTOYER UNE VALEUR
 * ============================================================
 */

function cleanValue(value, fallback = "Inconnu") {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    const text = String(value);

    if (text.length > 1024) {
        return text.slice(0, 1021) + "...";
    }

    return text;
}


/*
 * ============================================================
 * FORMATER UN UTILISATEUR
 * ============================================================
 */

function formatUser(user) {
    if (!user) {
        return "Inconnu";
    }

    if (user.id) {
        const username =
            user.username ||
            user.user?.username ||
            "Utilisateur";

        return `<@${user.id}> (\`${username}\`)`;
    }

    if (user.user && user.user.id) {
        const username =
            user.user.username ||
            "Utilisateur";

        return `<@${user.user.id}> (\`${username}\`)`;
    }

    return cleanValue(user.username);
}


/*
 * ============================================================
 * FORMATER UNE CIBLE
 * ============================================================
 */

function formatTarget(target) {
    if (!target) {
        return "Aucune";
    }

    if (target.id) {
        const username =
            target.username ||
            target.user?.username ||
            target.name ||
            "Objet";

        return `<@${target.id}> (\`${username}\`)`;
    }

    return cleanValue(
        target.name ||
        target.username ||
        target.id
    );
}


/*
 * ============================================================
 * DÉTERMINER LA COULEUR
 * ============================================================
 */

function getColor(level = "info") {
    return COLORS[level] || COLORS.info;
}


/*
 * ============================================================
 * ENVOYER UN LOG
 * ============================================================
 */

async function sendSecurityLog(
    guild,
    options = {}
) {
    if (!guild) {
        return {
            success: false,
            reason: "guild_missing"
        };
    }

    try {
        const channel =
            await getSecurityLogChannel(guild);

        if (!channel) {
            return {
                success: false,
                reason: "channel_not_configured"
            };
        }

        const {
            title = "🛡️ Événement de sécurité",
            description = null,
            level = "info",
            color = null,
            actor = null,
            target = null,
            fields = [],
            footer = null,
            timestamp = true
        } = options;

        const embed =
            new EmbedBuilder()
                .setColor(
                    color !== null
                        ? color
                        : getColor(level)
                )
                .setTitle(
                    cleanValue(
                        title,
                        "🛡️ Événement de sécurité"
                    )
                );

        if (description) {
            embed.setDescription(
                cleanValue(description)
            );
        }

        /*
         * ----------------------------------------------------
         * ACTEUR
         * ----------------------------------------------------
         */

        if (actor) {
            embed.addFields({
                name: "👮 Moderator",
                value: formatUser(actor),
                inline: true
            });
        }

        /*
         * ----------------------------------------------------
         * CIBLE
         * ----------------------------------------------------
         */

        if (target) {
            embed.addFields({
                name: "🎯 Target",
                value: formatTarget(target),
                inline: true
            });
        }

        /*
         * ----------------------------------------------------
         * CHAMPS SUPPLÉMENTAIRES
         * ----------------------------------------------------
         */

        if (Array.isArray(fields)) {
            const validFields =
                fields
                    .filter(
                        (field) =>
                            field &&
                            field.name &&
                            field.value !== undefined
                    )
                    .map(
                        (field) => ({
                            name: cleanValue(
                                field.name,
                                "Information"
                            ),
                            value: cleanValue(
                                field.value
                            ),
                            inline:
                                field.inline !== false
                        })
                    );

            if (validFields.length > 0) {
                embed.addFields(
                    validFields.slice(0, 25)
                );
            }
        }

        /*
         * ----------------------------------------------------
         * FOOTER
         * ----------------------------------------------------
         */

        embed.setFooter({
            text:
                footer ||
                `MiyuBot Logs • ${guild.name}`
        });

        /*
         * ----------------------------------------------------
         * DATE
         * ----------------------------------------------------
         */

        if (timestamp) {
            embed.setTimestamp();
        }

        await enqueueGuildLog(
            guild.id,
            async () => {
                await channel.send({
                    embeds: [embed]
                });
            }
        );

        return {
            success: true,
            channel
        };
    } catch (error) {
        console.error(
            "❌ Erreur envoi log sécurité :",
            error
        );

        return {
            success: false,
            reason: "send_error",
            error
        };
    }
}


/*
 * ============================================================
 * LOG MEMBRE
 * ============================================================
 */

async function logMemberEvent(
    guild,
    type,
    member,
    options = {}
) {
    const types = {
        join: {
            title: member?.user?.bot
                ? "🤖 Bot Joined"
                : "📥 Member Joined",
            level: member?.user?.bot
                ? "warning"
                : "success"
        },

        leave: {
            title: "🚪 Member Left",
            level: "info"
        },

        kick: {
            title: "👢 Member Kicked",
            level: "danger"
        },

        ban: {
            title: "🔨 Member Banned",
            level: "danger"
        },

        unban: {
            title: "🔓 Member Unbanned",
            level: "warning"
        },

        timeout: {
            title: "⏱️ Member Timed Out",
            level: "warning"
        },

        timeout_remove: {
            title: "⏱️ Timeout Removed",
            level: "success"
        },

        nickname: {
            title: "📝 Member Nickname Updated",
            level: "info"
        },

        role_add: {
            title: "🏷️ Role Added",
            level: "info"
        },

        role_remove: {
            title: "🏷️ Role Removed",
            level: "warning"
        }
    };

    const config =
        types[type] || {
            title: "👤 Événement membre",
            level: "info"
        };

    return sendSecurityLog(
        guild,
        {
            ...options,
            title:
                options.title ||
                config.title,
            level:
                options.level ||
                config.level,
            target:
                options.target ||
                member
        }
    );
}


/*
 * ============================================================
 * LOG SALON
 * ============================================================
 */

async function logChannelEvent(
    guild,
    type,
    channel,
    options = {}
) {
    const types = {
        create: {
            title: "📁 Channel Created",
            level: "info"
        },

        delete: {
            title: "🗑️ Channel Deleted",
            level: "danger"
        },

        update: {
            title: "📝 Channel Updated",
            level: "warning"
        }
    };

    const config =
        types[type] || {
            title: "📁 Événement salon",
            level: "info"
        };

    return sendSecurityLog(
        guild,
        {
            ...options,
            title:
                options.title ||
                config.title,
            level:
                options.level ||
                config.level,
            fields: [
                {
                    name: "📁 Channel",
                    value:
                        channel?.id
                            ? `<#${channel.id}>`
                            : cleanValue(
                                channel?.name
                            ),
                    inline: true
                },
                ...(options.fields || [])
            ]
        }
    );
}


/*
 * ============================================================
 * LOG RÔLE
 * ============================================================
 */

async function logRoleEvent(
    guild,
    type,
    role,
    options = {}
) {
    const types = {
        create: {
            title: "🎭 Role Created",
            level: "info"
        },

        delete: {
            title: "🗑️ Role Deleted",
            level: "danger"
        },

        update: {
            title: "🎭 Role Updated",
            level: "warning"
        },

        add: {
            title: "🏷️ Role Assigned",
            level: "info"
        },

        remove: {
            title: "🏷️ Role Removed",
            level: "warning"
        }
    };

    const config =
        types[type] || {
            title: "🎭 Événement rôle",
            level: "info"
        };

    return sendSecurityLog(
        guild,
        {
            ...options,
            title:
                options.title ||
                config.title,
            level:
                options.level ||
                config.level,
            fields: [
                {
                    name: "🎭 Role",
                    value:
                        role?.id
                            ? `<@&${role.id}>`
                            : cleanValue(
                                role?.name
                            ),
                    inline: true
                },
                ...(options.fields || [])
            ]
        }
    );
}


/*
 * ============================================================
 * LOG RAID
 * ============================================================
 */

async function logRaid(
    guild,
    options = {}
) {
    return sendSecurityLog(
        guild,
        {
            ...options,
            title:
                options.title ||
                "🚨 Raid Detected",
            level:
                options.level ||
                "critical"
        }
    );
}


/*
 * ============================================================
 * LOG LOCKDOWN
 * ============================================================
 */

async function logLockdown(
    guild,
    activated,
    options = {}
) {
    return sendSecurityLog(
        guild,
        {
            ...options,
            title:
                options.title ||
                (
                    activated
                        ? "🔒 Lockdown Enabled"
                        : "🔓 Lockdown Disabled"
                ),
            level:
                options.level ||
                (
                    activated
                        ? "critical"
                        : "success"
                )
        }
    );
}


/*
 * ============================================================
 * LOG CONFIGURATION
 * ============================================================
 */

async function logConfiguration(
    guild,
    options = {}
) {
    return sendSecurityLog(
        guild,
        {
            ...options,
            title:
                options.title ||
                "⚙️ Configuration Updated",
            level:
                options.level ||
                "info"
        }
    );
}


/*
 * ============================================================
 * LOG SÉCURITÉ GÉNÉRIQUE
 * ============================================================
 */

async function logSecurity(
    guild,
    title,
    description,
    options = {}
) {
    return sendSecurityLog(
        guild,
        {
            ...options,
            title,
            description
        }
    );
}


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
    COLORS,

    getSecurityLogChannel,

    sendSecurityLog,

    logSecurity,

    logMemberEvent,

    logChannelEvent,

    logRoleEvent,

    logRaid,

    logLockdown,

    logConfiguration
};