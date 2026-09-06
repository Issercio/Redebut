const {
    Client,
    GatewayIntentBits,
    Collection,
    AuditLogEvent,
    PermissionsBitField,
    Partials
} = require("discord.js");

const fs = require("fs");
const path = require("path");

require("dotenv").config({
    override: true
});

const {
    run,
    get,
    databaseReady
} = require("./database/database");

const {
    activateLockdown
} = require("./security/lockdown");

const {
    sendSecurityLog,
    logMemberEvent,
    logChannelEvent,
    logRoleEvent,
    logRaid,
    logLockdown,
    logConfiguration
} = require("./security/securityLogger");


/*
 * ============================================================
 * MIYUBOT - DISCORD
 * ============================================================
 */


/*
 * ============================================================
 * CLIENT DISCORD
 * ============================================================
 */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.User,
        Partials.GuildMember
    ]
});


/*
 * ============================================================
 * SYSTÈME DE COMMANDES
 * ============================================================
 */

client.commands = new Collection();

const commandsPath = path.join(
    __dirname,
    "commands",
    "discord"
);

const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
    try {
        const filePath = path.join(
            commandsPath,
            file
        );

        const command = require(filePath);

        if (!command.name || !command.execute) {
            console.log(
                `⚠️ Commande invalide ignorée : ${file}`
            );

            continue;
        }

        client.commands.set(
            command.name,
            command
        );

        console.log(
            `📦 Commande chargée : ${command.name}`
        );
    } catch (error) {
        console.error(
            `❌ Impossible de charger ${file} :`,
            error
        );
    }
}


/*
 * ============================================================
 * ANTI-RAID
 * ============================================================
 */

const recentJoins = new Map();
const activeRaids = new Map();
const recentMemberUpdates = new Map();
const MEMBER_UPDATE_DEBOUNCE_MS = 1500;
const recentBanActions = new Map();
const BAN_ACTION_DEDUP_MS = 15000;
const antiNukeActionWindows = new Map();
const antiSpamMessageWindows = new Map();
const antiSpamStrikeLevels = new Map();
const ANTI_SPAM_STRIKE_RESET_MS = 60 * 60 * 1000;
const inviteUsageCache = new Map();
const recentInviteCreateLogs = new Map();
const inviteCreateLogsInFlight = new Set();
const CACHE_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

/*
 * ============================================================
 * PARAMÈTRES PAR DÉFAUT
 * ============================================================
 */

const DEFAULT_GUILD_SETTINGS = {
    anti_raid_enabled: 1,
    anti_raid_threshold: 10,
    anti_raid_window: 15,
    auto_lockdown: 0,
    lockdown_active: 0,
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


/*
 * ============================================================
 * CONFIGURATION SERVEUR
 * ============================================================
 */

async function ensureGuildSettings(guildId) {
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
            DEFAULT_GUILD_SETTINGS.anti_raid_enabled,
            DEFAULT_GUILD_SETTINGS.anti_raid_threshold,
            DEFAULT_GUILD_SETTINGS.anti_raid_window,
            DEFAULT_GUILD_SETTINGS.auto_lockdown,
            DEFAULT_GUILD_SETTINGS.lockdown_active,
            DEFAULT_GUILD_SETTINGS.min_account_age_days,
            DEFAULT_GUILD_SETTINGS.anti_spam_enabled,
            DEFAULT_GUILD_SETTINGS.anti_spam_threshold,
            DEFAULT_GUILD_SETTINGS.anti_spam_window,
            DEFAULT_GUILD_SETTINGS.anti_spam_sanction,
            DEFAULT_GUILD_SETTINGS.anti_bot_enabled,
            DEFAULT_GUILD_SETTINGS.anti_nuke_enabled,
            DEFAULT_GUILD_SETTINGS.anti_nuke_threshold,
            DEFAULT_GUILD_SETTINGS.anti_nuke_threshold_channel,
            DEFAULT_GUILD_SETTINGS.anti_nuke_threshold_role,
            DEFAULT_GUILD_SETTINGS.anti_nuke_threshold_webhook,
            DEFAULT_GUILD_SETTINGS.anti_nuke_threshold_ban,
            DEFAULT_GUILD_SETTINGS.anti_nuke_window,
            DEFAULT_GUILD_SETTINGS.anti_nuke_sanction,
            DEFAULT_GUILD_SETTINGS.quarantine_enabled,
            DEFAULT_GUILD_SETTINGS.quarantine_role_id,
            DEFAULT_GUILD_SETTINGS.quarantine_account_age_days,
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


/*
 * ============================================================
 * INCIDENT DE SÉCURITÉ
 * ============================================================
 */

async function createSecurityIncident(
    guildId,
    incidentType,
    severity,
    description,
    metadata = {}
) {
    const result = await run(
        `
        INSERT INTO security_incidents (
            guild_id,
            incident_type,
            severity,
            description,
            metadata,
            status,
            detected_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
            guildId,
            incidentType,
            severity,
            description,
            JSON.stringify(metadata),
            "active",
            Date.now()
        ]
    );

    console.log(
        `🚨 Incident de sécurité créé : #${result.lastID} | ` +
        `${incidentType} | ${severity}`
    );

    return result.lastID;
}


async function createModerationCase(
    guildId,
    userId,
    actorId,
    caseType,
    action,
    reason,
    metadata = {}
) {
    if (!guildId || !userId || !caseType || !action) {
        return null;
    }

    const result = await run(
        `
        INSERT INTO moderation_cases (
            guild_id,
            user_id,
            actor_id,
            case_type,
            action,
            reason,
            metadata,
            status,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            guildId,
            userId,
            actorId || null,
            caseType,
            action,
            reason || null,
            JSON.stringify(metadata),
            "open",
            Date.now()
        ]
    );

    return result.lastID;
}


/*
 * ============================================================
 * HISTORIQUE MEMBRE
 * ============================================================
 */

async function addMemberEvent(
    guildId,
    userId,
    eventType,
    oldValue = null,
    newValue = null
) {
    await run(
        `
        INSERT INTO member_history (
            guild_id,
            user_id,
            event_type,
            old_value,
            new_value,
            event_date
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            guildId,
            userId,
            eventType,
            oldValue,
            newValue,
            Date.now()
        ]
    );
}


/*
 * ============================================================
 * HISTORIQUE DES NOMS
 * ============================================================
 */

async function addNameHistory(
    guildId,
    userId,
    nameType,
    oldValue,
    newValue
) {
    await run(
        `
        INSERT INTO name_history (
            guild_id,
            user_id,
            name_type,
            old_value,
            new_value,
            changed_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
            guildId,
            userId,
            nameType,
            oldValue,
            newValue,
            Date.now()
        ]
    );
}


/*
 * ============================================================
 * PROFIL UTILISATEUR
 * ============================================================
 */

async function updateUserProfile(user) {
    const now = Date.now();

    const existingUser = await get(
        `
        SELECT *
        FROM user_profiles
        WHERE user_id = ?
        `,
        [user.id]
    );

    if (!existingUser) {
        await run(
            `
            INSERT INTO user_profiles (
                user_id,
                username,
                global_name,
                avatar_url,
                is_bot,
                account_created_at,
                first_seen_at,
                last_seen_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                user.id,
                user.username,
                user.globalName || null,
                user.displayAvatarURL({
                    size: 512
                }),
                user.bot ? 1 : 0,
                user.createdTimestamp,
                now,
                now
            ]
        );

        console.log(
            `👤 Nouveau profil enregistré : ${user.username}`
        );

        return;
    }

    if (
        existingUser.username !==
        user.username
    ) {
        await addNameHistory(
            null,
            user.id,
            "username",
            existingUser.username,
            user.username
        );

        await addMemberEvent(
            "GLOBAL",
            user.id,
            "username_change",
            existingUser.username,
            user.username
        );
    }

    const oldGlobalName =
        existingUser.global_name || null;

    const newGlobalName =
        user.globalName || null;

    if (
        oldGlobalName !==
        newGlobalName
    ) {
        await addNameHistory(
            null,
            user.id,
            "global_name",
            oldGlobalName || "Aucun",
            newGlobalName || "Aucun"
        );

        await addMemberEvent(
            "GLOBAL",
            user.id,
            "global_name_change",
            oldGlobalName || "Aucun",
            newGlobalName || "Aucun"
        );
    }

    const currentAvatar =
        user.displayAvatarURL({
            size: 512
        });

    if (
        existingUser.avatar_url !==
        currentAvatar
    ) {
        await addMemberEvent(
            "GLOBAL",
            user.id,
            "avatar_change",
            existingUser.avatar_url,
            currentAvatar
        );
    }

    await run(
        `
        UPDATE user_profiles
        SET
            username = ?,
            global_name = ?,
            avatar_url = ?,
            is_bot = ?,
            last_seen_at = ?
        WHERE user_id = ?
        `,
        [
            user.username,
            user.globalName || null,
            currentAvatar,
            user.bot ? 1 : 0,
            now,
            user.id
        ]
    );
}


/*
 * ============================================================
 * MEMBRE DU SERVEUR
 * ============================================================
 */

async function updateGuildMember(member) {
    const now = Date.now();

    const existingMember = await get(
        `
        SELECT *
        FROM guild_members
        WHERE guild_id = ?
        AND user_id = ?
        `,
        [
            member.guild.id,
            member.id
        ]
    );

    if (!existingMember) {
        await run(
            `
            INSERT INTO guild_members (
                guild_id,
                user_id,
                current_nickname,
                joined_at,
                first_seen_at,
                last_seen_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                member.guild.id,
                member.id,
                member.nickname || null,
                member.joinedTimestamp || now,
                now,
                now
            ]
        );

        return;
    }

    const oldNickname =
        existingMember.current_nickname || null;

    const newNickname =
        member.nickname || null;

    if (
        oldNickname !==
        newNickname
    ) {
        await addNameHistory(
            member.guild.id,
            member.id,
            "nickname",
            oldNickname || "Aucun",
            newNickname || "Aucun"
        );

        await addMemberEvent(
            member.guild.id,
            member.id,
            "nickname_change",
            oldNickname || "Aucun",
            newNickname || "Aucun"
        );
    }

    await run(
        `
        UPDATE guild_members
        SET
            current_nickname = ?,
            last_seen_at = ?
        WHERE guild_id = ?
        AND user_id = ?
        `,
        [
            newNickname,
            now,
            member.guild.id,
            member.id
        ]
    );
}


/*
 * ============================================================
 * AUDIT LOGS
 * ============================================================
 */

async function findAuditEntry(
    guild,
    action,
    targetId,
    maxAge = 10000
) {
    try {
        if (!guild.members.me) {
            return null;
        }

        const permissions =
            guild.members.me.permissions;

        if (
            !permissions.has(
                PermissionsBitField.Flags.ViewAuditLog
            )
        ) {
            return null;
        }

        const logs =
            await guild.fetchAuditLogs({
                type: action,
                limit: 10
            });

        const now = Date.now();

        const entry =
            logs.entries.find((item) => {
                if (
                    targetId &&
                    item.target?.id !== targetId
                ) {
                    return false;
                }

                if (
                    now - item.createdTimestamp >
                    maxAge
                ) {
                    return false;
                }

                return true;
            });

        return entry || null;
    } catch (error) {
        console.error(
            "⚠️ Impossible de lire les Audit Logs :",
            error
        );

        return null;
    }
}


function markBanAction(guildId, userId) {
    if (!guildId || !userId) {
        return;
    }

    recentBanActions.set(
        `${guildId}:${userId}`,
        Date.now()
    );
}


function wasRecentlyLoggedBan(guildId, userId) {
    if (!guildId || !userId) {
        return false;
    }

    const key =
        `${guildId}:${userId}`;

    const timestamp =
        recentBanActions.get(key);

    if (!timestamp) {
        return false;
    }

    if (
        Date.now() - timestamp >
        BAN_ACTION_DEDUP_MS
    ) {
        recentBanActions.delete(key);

        return false;
    }

    return true;
}


function cleanLogText(
    value,
    fallback = "Aucun",
    maxLength = 900
) {
    if (
        value === null ||
        value === undefined
    ) {
        return fallback;
    }

    const text =
        String(value).trim();

    if (!text) {
        return fallback;
    }

    if (text.length > maxLength) {
        return (
            text.slice(
                0,
                maxLength - 3
            ) + "..."
        );
    }

    return text;
}


function formatMessageContent(content) {
    if (!content) {
        return "Aucun contenu texte";
    }

    return cleanLogText(
        content,
        "Aucun contenu texte",
        700
    );
}


/*
 * ============================================================
 * INVITATIONS (CACHE & DÉTECTION)
 * ============================================================
 */

function buildInviteSnapshot(inviteCollection) {
    const snapshot = new Map();

    for (const invite of inviteCollection.values()) {
        snapshot.set(
            invite.code,
            {
                code: invite.code,
                uses: Number(invite.uses || 0),
                inviterId: invite.inviter?.id || null,
                inviterTag: invite.inviter?.tag || null,
                channelId: invite.channel?.id || null
            }
        );
    }

    return snapshot;
}


async function refreshGuildInviteCache(guild) {
    if (!guild?.members?.me) {
        return null;
    }

    if (
        !guild.members.me.permissions.has(
            PermissionsBitField.Flags.ManageGuild
        )
    ) {
        return null;
    }

    try {
        const invites =
            await guild.invites.fetch();

        const snapshot =
            buildInviteSnapshot(
                invites
            );

        inviteUsageCache.set(
            guild.id,
            snapshot
        );

        return snapshot;
    } catch (error) {
        return null;
    }
}


async function detectUsedInvite(guild) {
    const previousSnapshot =
        inviteUsageCache.get(
            guild.id
        ) || new Map();

    const newSnapshot =
        await refreshGuildInviteCache(
            guild
        );

    if (!newSnapshot) {
        return null;
    }

    let detected = null;

    for (const [code, currentInvite] of newSnapshot.entries()) {
        const previousInvite =
            previousSnapshot.get(code);

        const oldUses =
            Number(previousInvite?.uses || 0);

        const newUses =
            Number(currentInvite.uses || 0);

        if (newUses > oldUses) {
            detected = {
                ...currentInvite,
                usesDelta:
                    newUses - oldUses
            };

            break;
        }
    }

    return detected;
}


function markRecentInviteCreate(guildId, code) {
    const key =
        getInviteCreateDedupKey(
            guildId,
            code
        );

    if (!key) {
        return;
    }

    recentInviteCreateLogs.set(key, Date.now());
}


function wasRecentlyLoggedInviteCreate(guildId, code) {
    const key =
        getInviteCreateDedupKey(
            guildId,
            code
        );

    if (!key) {
        return false;
    }

    const timestamp = recentInviteCreateLogs.get(key);

    if (!timestamp) {
        return false;
    }

    if (Date.now() - timestamp > 15000) {
        recentInviteCreateLogs.delete(key);
        return false;
    }

    return true;
}


function getInviteCreateDedupKey(guildId, code) {
    if (!guildId || !code) {
        return null;
    }

    const normalizedCode =
        String(code)
            .trim()
            .toLowerCase();

    if (!normalizedCode) {
        return null;
    }

    return `${guildId}:${normalizedCode}`;
}


function sweepTimestampMap(
    map,
    getter
) {
    const now = Date.now();

    for (const [key, value] of map.entries()) {
        const timestamp =
            getter(value);

        if (!timestamp || now - timestamp > CACHE_TTL_MS) {
            map.delete(key);
        }
    }
}


function sweepRuntimeCaches() {
    sweepTimestampMap(
        recentBanActions,
        (value) => Number(value)
    );

    sweepTimestampMap(
        recentInviteCreateLogs,
        (value) => Number(value)
    );

    sweepTimestampMap(
        antiSpamStrikeLevels,
        (value) => Number(value?.lastAt)
    );

    sweepTimestampMap(
        recentMemberUpdates,
        (value) => Number(value?.timestamp)
    );

    sweepTimestampMap(
        activeRaids,
        (value) => Number(value?.detectedAt)
    );

    const now = Date.now();

    for (const [key, value] of antiSpamMessageWindows.entries()) {
        const filtered =
            Array.isArray(value)
                ? value.filter(
                    (eventData) =>
                        now - Number(eventData?.timestamp || 0) <= CACHE_TTL_MS
                )
                : [];

        if (filtered.length === 0) {
            antiSpamMessageWindows.delete(key);
            continue;
        }

        antiSpamMessageWindows.set(
            key,
            filtered.slice(-100)
        );
    }

    for (const [key, value] of antiNukeActionWindows.entries()) {
        const filtered =
            Array.isArray(value)
                ? value.filter(
                    (eventData) =>
                        now - Number(eventData?.timestamp || 0) <= CACHE_TTL_MS
                )
                : [];

        if (filtered.length === 0) {
            antiNukeActionWindows.delete(key);
            continue;
        }

        antiNukeActionWindows.set(
            key,
            filtered.slice(-100)
        );
    }

    for (const [guildId, joins] of recentJoins.entries()) {
        const filtered =
            Array.isArray(joins)
                ? joins.filter(
                    (timestamp) =>
                        now - Number(timestamp || 0) <= CACHE_TTL_MS
                )
                : [];

        if (filtered.length === 0) {
            recentJoins.delete(guildId);
            continue;
        }

        recentJoins.set(
            guildId,
            filtered.slice(-200)
        );
    }
}


async function sendInviteCreateLog(
    guild,
    inviteData = {}
) {
    if (!guild || !inviteData.code) {
        return;
    }

    const dedupKey =
        getInviteCreateDedupKey(
            guild.id,
            inviteData.code
        );

    if (!dedupKey) {
        return;
    }

    if (
        inviteCreateLogsInFlight.has(dedupKey) ||
        wasRecentlyLoggedInviteCreate(
            guild.id,
            inviteData.code
        )
    ) {
        return;
    }

    inviteCreateLogsInFlight.add(dedupKey);

    try {
        const auditEntry =
            await findAuditEntry(
                guild,
                AuditLogEvent.InviteCreate,
                null,
                10000
            );

        const actor =
            inviteData.inviter ||
            auditEntry?.executor ||
            null;

        const maxAgeSeconds =
            Number(inviteData.maxAge || 0);

        const expirationTimestamp =
            maxAgeSeconds > 0
                ? Math.floor(
                    (Date.now() + maxAgeSeconds * 1000) / 1000
                )
                : null;

        const logResult = await sendSecurityLog(
            guild,
            {
                title:
                    "🔗 Invite Created",

                level: "info",

                actor,

                fields: [
                    {
                        name: "🧩 Code",
                        value:
                            cleanLogText(
                                inviteData.code,
                                "Unknown"
                            ),
                        inline: true
                    },
                    {
                        name: "🌍 Link",
                        value:
                            `https://discord.gg/${inviteData.code}`,
                        inline: true
                    },
                    {
                        name: "📁 Channel",
                        value:
                            inviteData.channelId
                                ? `<#${inviteData.channelId}>`
                                : "Unknown",
                        inline: true
                    },
                    {
                        name: "⏱️ Expires",
                        value:
                            inviteData.expiresTimestamp
                                ? `<t:${Math.floor(inviteData.expiresTimestamp / 1000)}:F>`
                                : expirationTimestamp
                                    ? `<t:${expirationTimestamp}:F>`
                                    : "Never",
                        inline: true
                    },
                    {
                        name: "🔁 Max Uses",
                        value:
                            inviteData.maxUses
                                ? String(inviteData.maxUses)
                                : "Unlimited",
                        inline: true
                    }
                ]
            }
        );

        if (logResult?.success) {
            markRecentInviteCreate(
                guild.id,
                inviteData.code
            );
        } else {
            console.warn(
                "⚠️ Invite create log non envoyé:",
                logResult?.reason || "unknown_reason"
            );
        }
    } finally {
        inviteCreateLogsInFlight.delete(dedupKey);
    }
}


/*
 * ============================================================
 * ANTI-NUKE
 * ============================================================
 */

async function isAntiNukeWhitelisted(
    guildId,
    userId
) {
    const row = await get(
        `
        SELECT user_id
        FROM anti_nuke_whitelist
        WHERE guild_id = ?
        AND user_id = ?
        LIMIT 1
        `,
        [guildId, userId]
    );

    return Boolean(row);
}


function trackAntiNukeAction(
    guildId,
    userId,
    actionType,
    windowSeconds
) {
    const key =
        `${guildId}:${userId}`;

    const now = Date.now();

    const windowMs =
        Math.max(
            5,
            Number(windowSeconds) || 15
        ) * 1000;

    const existing =
        antiNukeActionWindows.get(key) || [];

    const updated =
        existing
            .filter(
                (eventData) =>
                    now - eventData.timestamp <=
                    windowMs
            );

    updated.push({
        timestamp: now,
        actionType
    });

    antiNukeActionWindows.set(
        key,
        updated
    );

    return {
        key,
        count: updated.length
    };
}


async function applyAntiNukeSanction(
    guild,
    executor,
    sanction,
    reason
) {
    const member =
        await guild.members.fetch(
            executor.id
        ).catch(
            () => null
        );

    if (!member) {
        return {
            success: false,
            details:
                "Membre introuvable sur le serveur."
        };
    }

    if (!member.manageable) {
        return {
            success: false,
            details:
                "Membre non gérable par le bot."
        };
    }

    if (sanction === "timeout") {
        if (!member.moderatable) {
            return {
                success: false,
                details:
                    "Le bot ne peut pas appliquer de timeout à ce membre."
            };
        }

        await member.timeout(
            24 * 60 * 60 * 1000,
            reason
        );

        return {
            success: true,
            details:
                "Timeout 24h appliqué."
        };
    }

    if (sanction === "kick") {
        await member.kick(reason);

        return {
            success: true,
            details:
                "Kick appliqué."
        };
    }

    await guild.members.ban(
        executor.id,
        {
            reason
        }
    );

    return {
        success: true,
        details:
            "Ban appliqué."
    };
}


async function processAntiNukeAction(
    guild,
    actionType,
    auditEntry,
    targetId,
    targetLabel
) {
    if (!guild || !auditEntry?.executor?.id) {
        return;
    }

    const settings =
        await ensureGuildSettings(
            guild.id
        );

    if (
        Number(settings.anti_nuke_enabled) !== 1
    ) {
        return;
    }

    const executor =
        auditEntry.executor;

    if (
        !executor ||
        !executor.id ||
        executor.id === guild.ownerId ||
        executor.id === client.user?.id
    ) {
        return;
    }

    const isWhitelisted =
        await isAntiNukeWhitelisted(
            guild.id,
            executor.id
        );

    if (isWhitelisted) {
        return;
    }

    const thresholdColumnByAction = {
        channel_create:
            "anti_nuke_threshold_channel",
        channel_delete:
            "anti_nuke_threshold_channel",
        role_create:
            "anti_nuke_threshold_role",
        role_delete:
            "anti_nuke_threshold_role",
        webhook_create:
            "anti_nuke_threshold_webhook",
        webhook_update:
            "anti_nuke_threshold_webhook",
        webhook_delete:
            "anti_nuke_threshold_webhook",
        member_ban_add:
            "anti_nuke_threshold_ban"
    };

    const thresholdColumn =
        thresholdColumnByAction[actionType] ||
        "anti_nuke_threshold";

    const threshold =
        Math.max(
            2,
            Number(settings[thresholdColumn]) ||
            Number(settings.anti_nuke_threshold) ||
            3
        );

    const windowSeconds =
        Math.max(
            5,
            Number(settings.anti_nuke_window) || 15
        );

    const tracked =
        trackAntiNukeAction(
            guild.id,
            executor.id,
            actionType,
            windowSeconds
        );

    if (tracked.count < threshold) {
        return;
    }

    antiNukeActionWindows.delete(
        tracked.key
    );

    const sanction =
        String(
            settings.anti_nuke_sanction || "ban"
        ).toLowerCase();

    const incidentDescription =
        `Activité anti-nuke détectée: ${tracked.count} actions en ${windowSeconds}s.`;

    const incidentId =
        await createSecurityIncident(
            guild.id,
            "anti_nuke",
            tracked.count >= threshold * 2
                ? "critical"
                : "high",
            incidentDescription,
            {
                action_type: actionType,
                executor_id: executor.id,
                executor_username:
                    executor.username ||
                    "inconnu",
                target_id: targetId || null,
                target_label:
                    targetLabel || null,
                action_count:
                    tracked.count,
                threshold,
                window_seconds:
                    windowSeconds,
                sanction
            }
        );

    let sanctionResult;

    try {
        sanctionResult =
            await applyAntiNukeSanction(
                guild,
                executor,
                sanction,
                `Anti-Nuke: ${tracked.count} actions en ${windowSeconds}s`
            );
    } catch (error) {
        sanctionResult = {
            success: false,
            details:
                error.message ||
                "Erreur inconnue"
        };
    }

    const caseId =
        await createModerationCase(
            guild.id,
            executor.id,
            client.user?.id || null,
            "anti_nuke",
            sanction,
            `Déclenchement anti-nuke sur ${actionType}`,
            {
                incident_id: incidentId,
                action_type: actionType,
                action_count: tracked.count,
                threshold,
                threshold_column: thresholdColumn,
                sanction_result:
                    sanctionResult.details,
                target_id: targetId || null,
                target_label:
                    targetLabel || null
            }
        );

    await sendSecurityLog(
        guild,
        {
            title:
                sanctionResult.success
                    ? "🛡️ Anti-Nuke déclenché"
                    : "⚠️ Anti-Nuke détecté (sanction échouée)",

            level:
                sanctionResult.success
                    ? "critical"
                    : "danger",

            actor: executor,

            description:
                "MiyuBot a détecté une activité administrative massive.",

            fields: [
                {
                    name: "🆔 Incident",
                    value: `#${incidentId}`,
                    inline: true
                },
                {
                    name: "🎯 Action",
                    value: actionType,
                    inline: true
                },
                {
                    name: "📈 Activité",
                    value:
                        `${tracked.count}/${threshold} en ${windowSeconds}s`,
                    inline: true
                },
                {
                    name: "⚖️ Sanction",
                    value: sanction.toUpperCase(),
                    inline: true
                },
                {
                    name: "📂 Dossier",
                    value:
                        caseId
                            ? `#${caseId}`
                            : "Non créé",
                    inline: true
                },
                {
                    name: "✅ Résultat",
                    value:
                        sanctionResult.details,
                    inline: false
                }
            ]
        }
    );
}


/*
 * ============================================================
 * ANTI-SPAM
 * ============================================================
 */

function sanitizeSpamContent(content) {
    return String(content || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}


function upperCaseRatio(content) {
    const letters =
        String(content || "")
            .replace(/[^a-zA-Z]/g, "");

    if (!letters.length) {
        return 0;
    }

    const upper =
        letters
            .split("")
            .filter(
                (char) =>
                    char >= "A" &&
                    char <= "Z"
            ).length;

    return upper / letters.length;
}


function detectSpamReasons(
    message,
    events,
    threshold
) {
    const reasons = [];

    if (events.length >= threshold) {
        reasons.push(
            `flood (${events.length}/${threshold})`
        );
    }

    const duplicates =
        new Map();

    for (const eventData of events) {
        if (!eventData.content) {
            continue;
        }

        duplicates.set(
            eventData.content,
            (duplicates.get(eventData.content) || 0) + 1
        );
    }

    const maxDuplicateCount =
        Math.max(
            0,
            ...duplicates.values()
        );

    if (
        maxDuplicateCount >=
        Math.max(3, threshold - 2)
    ) {
        reasons.push(
            `messages répétés (${maxDuplicateCount})`
        );
    }

    const mentionCount =
        message.mentions.users.size +
        message.mentions.roles.size;

    if (mentionCount >= 5) {
        reasons.push(
            `mention spam (${mentionCount} mentions)`
        );
    }

    const linkCount =
        events.filter(
            (eventData) => eventData.hasLink
        ).length;

    if (linkCount >= 4) {
        reasons.push(
            `link spam (${linkCount} liens)`
        );
    }

    const content =
        message.content || "";

    if (
        content.length >= 20 &&
        upperCaseRatio(content) >= 0.75
    ) {
        reasons.push(
            "caps abuse"
        );
    }

    return reasons;
}


function antiSpamSanctionCap(
    configuredSanction
) {
    const normalized =
        String(configuredSanction || "ban")
            .toLowerCase();

    if (normalized === "timeout") {
        return 2;
    }

    if (normalized === "kick") {
        return 3;
    }

    return 4;
}


function buildSpamAction(
    strike,
    configuredSanction
) {
    const cap =
        antiSpamSanctionCap(
            configuredSanction
        );

    const level =
        Math.min(strike, cap);

    if (level <= 1) {
        return {
            type: "warn",
            label: "Avertissement"
        };
    }

    if (level === 2) {
        return {
            type: "timeout",
            label: "Timeout 10 minutes"
        };
    }

    if (level === 3) {
        return {
            type: "kick",
            label: "Kick"
        };
    }

    return {
        type: "ban",
        label: "Ban"
    };
}


async function applySpamAction(
    message,
    action,
    reason
) {
    const member =
        message.member;

    if (!member) {
        return {
            success: false,
            details:
                "Membre introuvable."
        };
    }

    if (action.type === "warn") {
        return {
            success: true,
            details:
                "Avertissement envoyé."
        };
    }

    if (!member.manageable) {
        return {
            success: false,
            details:
                "Membre non gérable."
        };
    }

    if (action.type === "timeout") {
        if (!member.moderatable) {
            return {
                success: false,
                details:
                    "Timeout impossible sur ce membre."
            };
        }

        await member.timeout(
            10 * 60 * 1000,
            reason
        );

        return {
            success: true,
            details:
                "Timeout 10 minutes appliqué."
        };
    }

    if (action.type === "kick") {
        await member.kick(reason);

        return {
            success: true,
            details:
                "Kick appliqué."
        };
    }

    await message.guild.members.ban(
        member.id,
        {
            reason
        }
    );

    return {
        success: true,
        details:
            "Ban appliqué."
    };
}


async function checkAntiSpam(message) {
    const guild =
        message.guild;

    if (!guild || !message.member) {
        return false;
    }

    const settings =
        await ensureGuildSettings(
            guild.id
        );

    if (
        Number(settings.anti_spam_enabled) !== 1
    ) {
        return false;
    }

    if (
        message.member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    ) {
        return false;
    }

    if (
        message.author.id === guild.ownerId ||
        message.author.id === client.user?.id
    ) {
        return false;
    }

    const threshold =
        Math.max(
            3,
            Number(settings.anti_spam_threshold) || 6
        );

    const windowSeconds =
        Math.max(
            5,
            Number(settings.anti_spam_window) || 8
        );

    const now = Date.now();

    const key =
        `${guild.id}:${message.author.id}`;

    const events =
        antiSpamMessageWindows.get(key) || [];

    const filtered =
        events.filter(
            (eventData) =>
                now - eventData.timestamp <=
                windowSeconds * 1000
        );

    filtered.push({
        timestamp: now,
        content:
            sanitizeSpamContent(
                message.content
            ),
        hasLink:
            /(https?:\/\/|discord\.gg\/)/i.test(
                message.content || ""
            )
    });

    antiSpamMessageWindows.set(
        key,
        filtered.slice(-100)
    );

    const reasons =
        detectSpamReasons(
            message,
            filtered,
            threshold
        );

    if (!reasons.length) {
        return false;
    }

    const previousStrike =
        antiSpamStrikeLevels.get(key);

    const strike =
        previousStrike &&
        now - previousStrike.lastAt <=
            ANTI_SPAM_STRIKE_RESET_MS
            ? previousStrike.count + 1
            : 1;

    antiSpamStrikeLevels.set(
        key,
        {
            count: strike,
            lastAt: now
        }
    );

    const action =
        buildSpamAction(
            strike,
            settings.anti_spam_sanction
        );

    if (message.deletable) {
        await message.delete().catch(
            () => null
        );
    }

    const reason =
        `Anti-Spam strike ${strike}: ${reasons.join(", ")}`;

    let actionResult;

    try {
        actionResult =
            await applySpamAction(
                message,
                action,
                reason
            );
    } catch (error) {
        actionResult = {
            success: false,
            details:
                error.message ||
                "Erreur inconnue"
        };
    }

    const incidentId =
        await createSecurityIncident(
            guild.id,
            "anti_spam",
            strike >= 3
                ? "high"
                : "warning",
            "Comportement spam détecté.",
            {
                user_id: message.author.id,
                username:
                    message.author.username,
                strike,
                action: action.type,
                reasons
            }
        );

    const caseId =
        await createModerationCase(
            guild.id,
            message.author.id,
            client.user?.id || null,
            "anti_spam",
            action.type,
            reason,
            {
                incident_id: incidentId,
                strike,
                reasons,
                action_result:
                    actionResult.details
            }
        );

    await sendSecurityLog(
        guild,
        {
            title:
                actionResult.success
                    ? "💬 Anti-Spam déclenché"
                    : "⚠️ Anti-Spam détecté (action échouée)",

            level:
                strike >= 3
                    ? "danger"
                    : "warning",

            target:
                message.author,

            description:
                "MiyuBot a détecté un comportement spam.",

            fields: [
                {
                    name: "🆔 Incident",
                    value: `#${incidentId}`,
                    inline: true
                },
                {
                    name: "📈 Niveau",
                    value: `Strike ${strike}`,
                    inline: true
                },
                {
                    name: "⚖️ Action",
                    value: action.label,
                    inline: true
                },
                {
                    name: "📂 Dossier",
                    value:
                        caseId
                            ? `#${caseId}`
                            : "Non créé",
                    inline: true
                },
                {
                    name: "🧾 Détection",
                    value: reasons.join(", "),
                    inline: false
                },
                {
                    name: "✅ Résultat",
                    value: actionResult.details,
                    inline: false
                }
            ]
        }
    );

    if (action.type === "warn") {
        await message.channel.send(
            `⚠️ <@${message.author.id}> merci d'arrêter le spam.`
        ).catch(
            () => null
        );
    }

    return true;
}


/*
 * ============================================================
 * RAID
 * ============================================================
 */

function getRaidSeverity(
    joinCount,
    threshold
) {
    const ratio =
        joinCount / threshold;

    if (ratio >= 3) {
        return "critical";
    }

    if (ratio >= 2) {
        return "high";
    }

    return "high";
}


async function checkRaid(member) {
    const guild = member.guild;
    const guildId = guild.id;

    const settings =
        await ensureGuildSettings(
            guildId
        );

    if (
        Number(settings.anti_raid_enabled) !== 1
    ) {
        return;
    }

    const threshold =
        Number(settings.anti_raid_threshold);

    const windowSeconds =
        Number(settings.anti_raid_window);

    const windowMilliseconds =
        windowSeconds * 1000;

    const now = Date.now();

    let joins =
        recentJoins.get(guildId);

    if (!joins) {
        joins = [];
    }

    joins = joins.filter(
        (timestamp) =>
            now - timestamp <=
            windowMilliseconds
    );

    joins.push(now);

    recentJoins.set(
        guildId,
        joins
    );

    const joinCount =
        joins.length;

    if (
        joinCount < threshold
    ) {
        return;
    }

    if (
        activeRaids.has(guildId)
    ) {
        return;
    }

    const severity =
        getRaidSeverity(
            joinCount,
            threshold
        );

    const description =
        `${joinCount} membres ont rejoint ` +
        `le serveur en moins de ` +
        `${windowSeconds} secondes.`;

    const incidentId =
        await createSecurityIncident(
            guildId,
            "raid",
            severity,
            description,
            {
                join_count: joinCount,
                threshold: threshold,
                window_seconds: windowSeconds,
                detected_user_id: member.id,
                detected_username:
                    member.user.username
            }
        );

    activeRaids.set(
        guildId,
        {
            incidentId,
            detectedAt: now,
            joinCount,
            severity
        }
    );

    console.log(
        `🚨 RAID DÉTECTÉ sur ${guild.name} : ` +
        `${joinCount} arrivées en ` +
        `${windowSeconds} secondes.`
    );

    await logRaid(
        guild,
        {
            title:
                severity === "critical"
                    ? "🚨 RAID CRITIQUE DÉTECTÉ"
                    : "⚠️ RAID DÉTECTÉ",

            description:
                "MiyuBot a détecté une arrivée massive de membres.",

            level:
                severity === "critical"
                    ? "critical"
                    : "warning",

            fields: [
                {
                    name: "🆔 Incident",
                    value: `#${incidentId}`,
                    inline: true
                },
                {
                    name: "🔥 Gravité",
                    value:
                        `**${severity.toUpperCase()}**`,
                    inline: true
                },
                {
                    name: "👥 Arrivées",
                    value:
                        `**${joinCount} membres**`,
                    inline: true
                },
                {
                    name: "⏱️ Fenêtre",
                    value:
                        `**${windowSeconds} secondes**`,
                    inline: true
                },
                {
                    name: "🛡️ Seuil",
                    value:
                        `**${threshold} membres**`,
                    inline: true
                },
                {
                    name: "🔒 Lockdown automatique",
                    value:
                        Number(settings.auto_lockdown) === 1
                            ? "Activé"
                            : "Désactivé",
                    inline: true
                }
            ],

            footer:
                `MiyuBot Security • Incident #${incidentId}`
        }
    );

    if (
        Number(settings.auto_lockdown) === 1 &&
        Number(settings.lockdown_active) === 0
    ) {
        try {
            const lockdownResult =
                await activateLockdown(
                    guild,
                    "Anti-Raid automatique",
                    {
                        type: "anti_raid",
                        incident_id: incidentId,
                        severity: severity,
                        join_count: joinCount,
                        threshold: threshold,
                        window_seconds: windowSeconds,
                        detected_user_id: member.id,
                        detected_username:
                            member.user.username
                    }
                );

            if (
                lockdownResult &&
                lockdownResult.success
            ) {
                await logLockdown(
                    guild,
                    true,
                    {
                        title:
                            "🔒 LOCKDOWN AUTOMATIQUE ACTIVÉ",

                        description:
                            "MiyuBot a automatiquement verrouillé " +
                            "le serveur suite à la détection d'un raid.",

                        level: "critical",

                        fields: [
                            {
                                name: "🆔 Incident",
                                value:
                                    `#${incidentId}`,
                                inline: true
                            },
                            {
                                name: "🚨 Raid",
                                value:
                                    `${joinCount} arrivées / ` +
                                    `${windowSeconds}s`,
                                inline: true
                            },
                            {
                                name: "🔒 Salons protégés",
                                value:
                                    `**${lockdownResult.protectedCount || 0}**`,
                                inline: true
                            },
                            {
                                name: "❌ Échecs",
                                value:
                                    `**${lockdownResult.failedCount || 0}**`,
                                inline: true
                            }
                        ],

                        footer:
                            `MiyuBot Security • Incident #${incidentId}`
                    }
                );
            } else {
                await sendSecurityLog(
                    guild,
                    {
                        title:
                            "❌ ÉCHEC DU LOCKDOWN AUTOMATIQUE",

                        description:
                            "MiyuBot a détecté un raid mais n'a pas pu " +
                            "activer correctement le lockdown.",

                        level: "critical",

                        fields: [
                            {
                                name: "🆔 Incident",
                                value:
                                    `#${incidentId}`,
                                inline: true
                            }
                        ]
                    }
                );
            }
        } catch (error) {
            console.error(
                "❌ Erreur lockdown automatique :",
                error
            );

            await sendSecurityLog(
                guild,
                {
                    title:
                        "❌ ERREUR LOCKDOWN AUTOMATIQUE",

                    description:
                        "Une erreur est survenue pendant le lockdown automatique.",

                    level: "critical",

                    fields: [
                        {
                            name: "🆔 Incident",
                            value:
                                `#${incidentId}`,
                            inline: true
                        },
                        {
                            name: "❗ Erreur",
                            value:
                                error.message ||
                                "Erreur inconnue"
                        }
                    ]
                }
            );
        }
    }

    setTimeout(
        () => {
            activeRaids.delete(
                guildId
            );

            recentJoins.delete(
                guildId
            );

            console.log(
                `🟢 État Anti-Raid réinitialisé sur ${guild.name}`
            );
        },
        windowMilliseconds * 2
    );
}


async function applyQuarantineIfNeeded(member) {
    if (!member?.guild || member.user?.bot) {
        return;
    }

    const settings =
        await ensureGuildSettings(
            member.guild.id
        );

    if (
        Number(settings.quarantine_enabled) !== 1
    ) {
        return;
    }

    const ageLimitDays =
        Number(
            settings.quarantine_account_age_days || 0
        );

    if (ageLimitDays <= 0) {
        return;
    }

    const quarantineRoleId =
        settings.quarantine_role_id;

    if (!quarantineRoleId) {
        return;
    }

    const quarantineRole =
        member.guild.roles.cache.get(
            quarantineRoleId
        );

    if (!quarantineRole) {
        return;
    }

    const ageMs =
        Date.now() - member.user.createdTimestamp;

    const ageDays =
        ageMs / (24 * 60 * 60 * 1000);

    if (ageDays >= ageLimitDays) {
        return;
    }

    if (
        member.roles.cache.has(
            quarantineRole.id
        )
    ) {
        return;
    }

    try {
        await member.roles.add(
            quarantineRole,
            `Quarantaine auto: compte trop récent (${ageDays.toFixed(2)} jours)`
        );
    } catch (error) {
        await sendSecurityLog(
            member.guild,
            {
                title:
                    "⚠️ Échec quarantaine automatique",
                level: "warning",
                target: member,
                fields: [
                    {
                        name: "🧾 Erreur",
                        value:
                            error.message ||
                            "Erreur inconnue",
                        inline: false
                    }
                ]
            }
        );

        return;
    }

    const caseId =
        await createModerationCase(
            member.guild.id,
            member.id,
            client.user?.id || null,
            "quarantine",
            "role_add",
            "Compte trop récent pour les règles du serveur.",
            {
                account_age_days:
                    Number(ageDays.toFixed(2)),
                threshold_days:
                    ageLimitDays,
                quarantine_role_id:
                    quarantineRole.id
            }
        );

    await sendSecurityLog(
        member.guild,
        {
            title:
                "🧪 Quarantaine automatique appliquée",
            level: "warning",
            target: member,
            description:
                "Un nouveau compte a été placé en quarantaine automatiquement.",
            fields: [
                {
                    name: "📅 Âge du compte",
                    value:
                        `${ageDays.toFixed(2)} jours`,
                    inline: true
                },
                {
                    name: "🛡️ Seuil",
                    value:
                        `${ageLimitDays} jours`,
                    inline: true
                },
                {
                    name: "🎭 Rôle",
                    value:
                        `<@&${quarantineRole.id}>`,
                    inline: true
                },
                {
                    name: "📂 Dossier",
                    value:
                        caseId
                            ? `#${caseId}`
                            : "Non créé",
                    inline: true
                }
            ]
        }
    );
}


/*
 * ============================================================
 * ARRIVÉE MEMBRE
 * ============================================================
 */

client.on(
    "guildMemberAdd",
    async (member) => {
        try {
            await databaseReady;

            const usedInvite =
                await detectUsedInvite(
                    member.guild
                );

            await updateUserProfile(
                member.user
            );

            await updateGuildMember(
                member
            );

            await addMemberEvent(
                member.guild.id,
                member.id,
                member.user.bot
                    ? "bot_join"
                    : "join"
            );

            await logMemberEvent(
                member.guild,
                "join",
                member,
                {
                    description:
                        member.user.bot
                            ? "Un bot vient de rejoindre le serveur."
                            : "Un nouveau membre vient de rejoindre le serveur.",

                    fields: [
                        {
                            name: "🆔 ID",
                            value:
                                `\`${member.id}\``,
                            inline: true
                        },
                        {
                            name: "🤖 Type",
                            value:
                                member.user.bot
                                    ? "Bot"
                                    : "Utilisateur",
                            inline: true
                        },
                        {
                            name: "📅 Compte créé",
                            value:
                                `<t:${Math.floor(
                                    member.user.createdTimestamp / 1000
                                )}:R>`,
                            inline: true
                        },
                        {
                            name: "🔗 Invitation",
                            value:
                                usedInvite
                                    ? `\`${usedInvite.code}\``
                                    : "Inconnue",
                            inline: true
                        },
                        {
                            name: "👤 Invité par",
                            value:
                                usedInvite?.inviterId
                                    ? `<@${usedInvite.inviterId}>`
                                    : "Inconnu",
                            inline: true
                        }
                    ]
                }
            );

            const settings =
                await ensureGuildSettings(
                    member.guild.id
                );

            if (
                member.user.bot &&
                Number(settings.anti_bot_enabled) === 1
            ) {
                await sendSecurityLog(
                    member.guild,
                    {
                        title:
                            "🤖 BOT AJOUTÉ AU SERVEUR",

                        description:
                            "Un bot vient de rejoindre le serveur.",

                        level: "warning",

                        target: member.user,

                        fields: [
                            {
                                name: "🆔 ID",
                                value:
                                    `\`${member.id}\``,
                                inline: true
                            },
                            {
                                name: "📅 Compte créé",
                                value:
                                    `<t:${Math.floor(
                                        member.user.createdTimestamp / 1000
                                    )}:R>`,
                                inline: true
                            },
                            {
                                name: "🛡️ Anti-Bot",
                                value:
                                    "Surveillance active",
                                inline: true
                            }
                        ]
                    }
                );
            }

            await applyQuarantineIfNeeded(
                member
            );

            await checkRaid(
                member
            );

            console.log(
                `📥 ${member.user.username} a rejoint ` +
                `${member.guild.name}`
            );
        } catch (error) {
            console.error(
                "❌ Erreur arrivée membre :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * DÉPART / KICK / BAN
 * ============================================================
 */

client.on(
    "guildMemberRemove",
    async (member) => {
        try {
            await databaseReady;

            await updateUserProfile(
                member.user
            );

            const banEntry =
                await findAuditEntry(
                    member.guild,
                    AuditLogEvent.MemberBanAdd,
                    member.id
                );

            if (banEntry) {
                if (
                    wasRecentlyLoggedBan(
                        member.guild.id,
                        member.id
                    )
                ) {
                    return;
                }

                markBanAction(
                    member.guild.id,
                    member.id
                );

                await addMemberEvent(
                    member.guild.id,
                    member.id,
                    "ban",
                    null,
                    banEntry.reason || null
                );

                await logMemberEvent(
                    member.guild,
                    "ban",
                    member,
                    {
                        actor:
                            banEntry.executor,

                        description:
                            "MiyuBot a détecté le bannissement d'un membre.",

                        fields: [
                            {
                                name: "📝 Raison",
                                value:
                                    banEntry.reason ||
                                    "Aucune raison indiquée."
                            }
                        ]
                    }
                );

                console.log(
                    `🔨 ${member.user.username} a été banni de ` +
                    `${member.guild.name}`
                );

                return;
            }

            const kickEntry =
                await findAuditEntry(
                    member.guild,
                    AuditLogEvent.MemberKick,
                    member.id
                );

            if (kickEntry) {
                await addMemberEvent(
                    member.guild.id,
                    member.id,
                    "kick",
                    null,
                    kickEntry.reason || null
                );

                await logMemberEvent(
                    member.guild,
                    "kick",
                    member,
                    {
                        actor:
                            kickEntry.executor,

                        description:
                            "MiyuBot a détecté l'expulsion d'un membre.",

                        fields: [
                            {
                                name: "📝 Raison",
                                value:
                                    kickEntry.reason ||
                                    "Aucune raison indiquée."
                            }
                        ]
                    }
                );

                console.log(
                    `👢 ${member.user.username} a été expulsé de ` +
                    `${member.guild.name}`
                );

                return;
            }

            await addMemberEvent(
                member.guild.id,
                member.id,
                "leave"
            );

            await logMemberEvent(
                member.guild,
                "leave",
                member,
                {
                    description:
                        "Le membre a quitté le serveur."
                }
            );

            console.log(
                `📤 ${member.user.username} a quitté ` +
                `${member.guild.name}`
            );
        } catch (error) {
            console.error(
                "❌ Erreur départ membre :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * MODIFICATION MEMBRE
 * ============================================================
 */

client.on(
    "guildMemberUpdate",
    async (
        oldMember,
        newMember
    ) => {
        try {
            await databaseReady;

            await updateUserProfile(
                newMember.user
            );

            await updateGuildMember(
                newMember
            );

            /*
             * ==================================================
             * CHANGEMENT DE PSEUDO
             * ==================================================
             */

            if (
                oldMember.nickname !==
                newMember.nickname
            ) {
                const nicknameUpdateKey =
                    `${newMember.guild.id}:${newMember.id}:nickname`;

                const nicknameChangeKey =
                    `${oldMember.nickname || "null"}->${newMember.nickname || "null"}`;

                const lastNicknameUpdate =
                    recentMemberUpdates.get(
                        nicknameUpdateKey
                    );

                if (
                    lastNicknameUpdate &&
                    lastNicknameUpdate.changeKey ===
                        nicknameChangeKey &&
                    Date.now() -
                        lastNicknameUpdate.timestamp <
                        MEMBER_UPDATE_DEBOUNCE_MS
                ) {
                    // Ignore le doublon de pseudo, mais continue pour les autres changements.
                } else {
                    recentMemberUpdates.set(
                        nicknameUpdateKey,
                        {
                            changeKey:
                                nicknameChangeKey,
                            timestamp:
                                Date.now()
                        }
                    );

                    console.log(
                        "📝 Changement de pseudo détecté :",
                        oldMember.nickname,
                        "→",
                        newMember.nickname
                    );

                    await logMemberEvent(
                        newMember.guild,
                        "nickname",
                        newMember,
                        {
                            description:
                                `${oldMember.nickname || "Aucun"} → ${newMember.nickname || "Aucun"}`,

                            title:
                                "📝 Member Nickname Updated",

                            fields: [
                                {
                                    name: "👤 Member",
                                    value:
                                        `<@${newMember.id}>`,
                                    inline: true
                                },
                                {
                                    name: "🆔 Member ID",
                                    value:
                                        newMember.id,
                                    inline: true
                                },
                                {
                                    name: "⬅️ Old Nickname",
                                    value:
                                        oldMember.nickname ||
                                        "None",
                                    inline: true
                                },
                                {
                                    name: "➡️ New Nickname",
                                    value:
                                        newMember.nickname ||
                                        "None",
                                    inline: true
                                }
                            ]
                        }
                    );
                }
            }

            const oldRoleIds =
                oldMember.roles.cache
                    .filter(
                        (role) =>
                            role.id !==
                            oldMember.guild.id
                    )
                    .map(
                        (role) => role.id
                    );

            const newRoleIds =
                newMember.roles.cache
                    .filter(
                        (role) =>
                            role.id !==
                            newMember.guild.id
                    )
                    .map(
                        (role) => role.id
                    );

            const oldRoleSet =
                new Set(oldRoleIds);

            const newRoleSet =
                new Set(newRoleIds);

            const addedRoleIds =
                newRoleIds.filter(
                    (roleId) =>
                        !oldRoleSet.has(roleId)
                );

            const removedRoleIds =
                oldRoleIds.filter(
                    (roleId) =>
                        !newRoleSet.has(roleId)
                );

            if (
                addedRoleIds.length > 0 ||
                removedRoleIds.length > 0
            ) {
                const roleUpdateKey =
                    `${newMember.guild.id}:${newMember.id}:roles`;

                const roleChangeKey =
                    `+${addedRoleIds.slice().sort().join(",")}|-${removedRoleIds.slice().sort().join(",")}`;

                const lastRoleUpdate =
                    recentMemberUpdates.get(
                        roleUpdateKey
                    );

                if (
                    !(
                        lastRoleUpdate &&
                        lastRoleUpdate.changeKey ===
                            roleChangeKey &&
                        Date.now() -
                            lastRoleUpdate.timestamp <
                            MEMBER_UPDATE_DEBOUNCE_MS
                    )
                ) {
                    recentMemberUpdates.set(
                        roleUpdateKey,
                        {
                            changeKey:
                                roleChangeKey,
                            timestamp:
                                Date.now()
                        }
                    );

                    const roleAuditEntry =
                        await findAuditEntry(
                            newMember.guild,
                            AuditLogEvent.MemberRoleUpdate,
                            newMember.id,
                            10000
                        );

                    const addedRoles =
                        addedRoleIds
                            .map(
                                (roleId) =>
                                    newMember.guild.roles.cache.get(roleId)
                            )
                            .filter(Boolean)
                            .map(
                                (role) =>
                                    `<@&${role.id}>`
                            );

                    const removedRoles =
                        removedRoleIds
                            .map(
                                (roleId) =>
                                    oldMember.guild.roles.cache.get(roleId)
                            )
                            .filter(Boolean)
                            .map(
                                (role) =>
                                    `<@&${role.id}>`
                            );

                    await addMemberEvent(
                        newMember.guild.id,
                        newMember.id,
                        "roles_change",
                        removedRoles.join(", ") || null,
                        addedRoles.join(", ") || null
                    );

                    await sendSecurityLog(
                        newMember.guild,
                        {
                            title:
                                "🏷️ Member Roles Updated",
                            level: "warning",
                            actor:
                                roleAuditEntry?.executor ||
                                null,
                            target:
                                newMember,
                            description:
                                `${addedRoles.length} added, ${removedRoles.length} removed`,
                            fields: [
                                {
                                    name: "🆔 Member ID",
                                    value:
                                        newMember.id,
                                    inline: true
                                },
                                {
                                    name: "➕ Added Roles",
                                    value:
                                        addedRoles.length > 0
                                            ? addedRoles.join("\n")
                                            : "None",
                                    inline: false
                                },
                                {
                                    name: "➖ Removed Roles",
                                    value:
                                        removedRoles.length > 0
                                            ? removedRoles.join("\n")
                                            : "None",
                                    inline: false
                                }
                            ]
                        }
                    );
                }
            }
        } catch (error) {
            console.error(
                "❌ Erreur modification membre :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * BAN
 * ============================================================
 */

client.on(
    "guildBanAdd",
    async (ban) => {
        try {
            await databaseReady;

            if (
                wasRecentlyLoggedBan(
                    ban.guild.id,
                    ban.user.id
                )
            ) {
                return;
            }

            markBanAction(
                ban.guild.id,
                ban.user.id
            );

            const entry =
                await findAuditEntry(
                    ban.guild,
                    AuditLogEvent.MemberBanAdd,
                    ban.user.id
                );

            await processAntiNukeAction(
                ban.guild,
                "member_ban_add",
                entry,
                ban.user.id,
                ban.user.username
            );

            await addMemberEvent(
                ban.guild.id,
                ban.user.id,
                "ban",
                null,
                entry?.reason || null
            );

            await logMemberEvent(
                ban.guild,
                "ban",
                ban.user,
                {
                    actor:
                        entry?.executor || null,

                    description:
                        "A member was banned from the server.",

                    fields: [
                        {
                            name: "📝 Reason",
                            value:
                                entry?.reason ||
                                "No reason provided."
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur ban :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * UNBAN
 * ============================================================
 */

client.on(
    "guildBanRemove",
    async (ban) => {
        try {
            await databaseReady;

            await addMemberEvent(
                ban.guild.id,
                ban.user.id,
                "unban"
            );

            const entry =
                await findAuditEntry(
                    ban.guild,
                    AuditLogEvent.MemberBanRemove,
                    ban.user.id
                );

            await logMemberEvent(
                ban.guild,
                "unban",
                ban.user,
                {
                    actor:
                        entry?.executor || null,

                    description:
                        "A member was unbanned from the server.",

                    fields: [
                        {
                            name: "🆔 User ID",
                            value:
                                `\`${ban.user.id}\``
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur unban :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * CRÉATION SALON
 * ============================================================
 */

client.on(
    "channelCreate",
    async (channel) => {
        try {
            if (!channel.guild) {
                return;
            }

            const entry =
                await findAuditEntry(
                    channel.guild,
                    AuditLogEvent.ChannelCreate,
                    channel.id
                );

            await processAntiNukeAction(
                channel.guild,
                "channel_create",
                entry,
                channel.id,
                channel.name
            );

            await logChannelEvent(
                channel.guild,
                "create",
                channel,
                {
                    actor:
                        entry?.executor || null,

                    description:
                        "A new channel was created.",

                    fields: [
                        {
                            name: "📛 Name",
                            value:
                                `\`${channel.name}\``,
                            inline: true
                        },
                        {
                            name: "🆔 Channel ID",
                            value:
                                `\`${channel.id}\``,
                            inline: true
                        },
                        {
                            name: "📂 Type",
                            value:
                                String(channel.type),
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur channelCreate :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * SUPPRESSION SALON
 * ============================================================
 */

client.on(
    "channelDelete",
    async (channel) => {
        try {
            if (!channel.guild) {
                return;
            }

            const entry =
                await findAuditEntry(
                    channel.guild,
                    AuditLogEvent.ChannelDelete,
                    channel.id
                );

            await processAntiNukeAction(
                channel.guild,
                "channel_delete",
                entry,
                channel.id,
                channel.name
            );

            await logChannelEvent(
                channel.guild,
                "delete",
                channel,
                {
                    actor:
                        entry?.executor || null,

                    description:
                        "A channel was deleted.",

                    fields: [
                        {
                            name: "📛 Name",
                            value:
                                `\`${channel.name}\``,
                            inline: true
                        },
                        {
                            name: "🆔 Channel ID",
                            value:
                                `\`${channel.id}\``,
                            inline: true
                        },
                        {
                            name: "📝 Reason",
                            value:
                                entry?.reason ||
                                "No reason provided."
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur channelDelete :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * MODIFICATION SALON
 * ============================================================
 */

client.on(
    "channelUpdate",
    async (
        oldChannel,
        newChannel
    ) => {
        try {
            if (!newChannel.guild) {
                return;
            }

            const changes = [];

            if (
                oldChannel.name !==
                newChannel.name
            ) {
                changes.push({
                    name: "📛 Name",
                    value:
                        `\`${oldChannel.name}\` → ` +
                        `\`${newChannel.name}\``
                });
            }

            if (
                oldChannel.parentId !==
                newChannel.parentId
            ) {
                changes.push({
                    name: "📂 Category",
                    value:
                        `\`${oldChannel.parentId || "Aucune"}\` → ` +
                        `\`${newChannel.parentId || "Aucune"}\``
                });
            }

            if (
                "topic" in oldChannel &&
                oldChannel.topic !==
                newChannel.topic
            ) {
                changes.push({
                    name: "📝 Topic",
                    value:
                        newChannel.topic ||
                        "None"
                });
            }

            if (changes.length === 0) {
                return;
            }

            const entry =
                await findAuditEntry(
                    newChannel.guild,
                    AuditLogEvent.ChannelUpdate,
                    newChannel.id
                );

            await logChannelEvent(
                newChannel.guild,
                "update",
                newChannel,
                {
                    actor:
                        entry?.executor || null,

                    description:
                        "Channel settings were updated.",

                    fields: changes
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur channelUpdate :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * CRÉATION RÔLE
 * ============================================================
 */

client.on(
    "roleCreate",
    async (role) => {
        try {
            const entry =
                await findAuditEntry(
                    role.guild,
                    AuditLogEvent.RoleCreate,
                    role.id
                );

            await processAntiNukeAction(
                role.guild,
                "role_create",
                entry,
                role.id,
                role.name
            );

            await logRoleEvent(
                role.guild,
                "create",
                role,
                {
                    actor:
                        entry?.executor || null,

                    description:
                        "A new role was created.",

                    fields: [
                        {
                            name: "📛 Name",
                            value:
                                `\`${role.name}\``,
                            inline: true
                        },
                        {
                            name: "🆔 Role ID",
                            value:
                                `\`${role.id}\``,
                            inline: true
                        },
                        {
                            name: "📍 Position",
                            value:
                                String(role.position),
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur roleCreate :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * SUPPRESSION RÔLE
 * ============================================================
 */

client.on(
    "roleDelete",
    async (role) => {
        try {
            const entry =
                await findAuditEntry(
                    role.guild,
                    AuditLogEvent.RoleDelete,
                    role.id
                );

            await processAntiNukeAction(
                role.guild,
                "role_delete",
                entry,
                role.id,
                role.name
            );

            await logRoleEvent(
                role.guild,
                "delete",
                role,
                {
                    actor:
                        entry?.executor || null,

                    description:
                        "A role was deleted.",

                    fields: [
                        {
                            name: "📛 Name",
                            value:
                                `\`${role.name}\``
                        },
                        {
                            name: "🆔 Role ID",
                            value:
                                `\`${role.id}\``
                        },
                        {
                            name: "📝 Reason",
                            value:
                                entry?.reason ||
                                "No reason provided."
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur roleDelete :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * MODIFICATION RÔLE
 * ============================================================
 */

client.on(
    "roleUpdate",
    async (
        oldRole,
        newRole
    ) => {
        try {
            const changes = [];

            if (
                oldRole.name !==
                newRole.name
            ) {
                changes.push({
                    name: "📛 Name",
                    value:
                        `\`${oldRole.name}\` → ` +
                        `\`${newRole.name}\``
                });
            }

            if (
                oldRole.color !==
                newRole.color
            ) {
                changes.push({
                    name: "🎨 Color",
                    value:
                        `\`${oldRole.hexColor}\` → ` +
                        `\`${newRole.hexColor}\``
                });
            }

            if (
                oldRole.permissions.bitfield !==
                newRole.permissions.bitfield
            ) {
                changes.push({
                    name: "🛡️ Permissions",
                    value:
                        "Role permissions were updated."
                });
            }

            if (
                changes.length === 0
            ) {
                return;
            }

            const entry =
                await findAuditEntry(
                    newRole.guild,
                    AuditLogEvent.RoleUpdate,
                    newRole.id
                );

            await logRoleEvent(
                newRole.guild,
                "update",
                newRole,
                {
                    actor:
                        entry?.executor || null,

                    description:
                        "Role settings were updated.",

                    fields: changes
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur roleUpdate :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * MESSAGES (LOGS MODÉRATION)
 * ============================================================
 */

client.on(
    "messageDelete",
    async (message) => {
        try {
            let deletedMessage =
                message;

            if (deletedMessage.partial) {
                try {
                    deletedMessage =
                        await deletedMessage.fetch();
                } catch (error) {
                    // Le message peut être introuvable si déjà purgé du cache/API.
                }
            }

            if (!deletedMessage.guild) {
                return;
            }

            const entry =
                deletedMessage.author
                    ? await findAuditEntry(
                        deletedMessage.guild,
                        AuditLogEvent.MessageDelete,
                        deletedMessage.author.id,
                        5000
                    )
                    : null;

            await sendSecurityLog(
                deletedMessage.guild,
                {
                    title:
                        "🗑️ Message Deleted",

                    level: "danger",

                    actor:
                        entry?.executor || null,

                    target:
                        deletedMessage.author || null,

                    fields: [
                        {
                            name: "📁 Channel",
                            value:
                                deletedMessage.channel?.id
                                    ? `<#${deletedMessage.channel.id}>`
                                    : "Unknown",
                            inline: true
                        },
                        {
                            name: "🆔 Message ID",
                            value:
                                cleanLogText(
                                    deletedMessage.id,
                                    "Inconnu"
                                ),
                            inline: true
                        },
                        {
                            name: "🧾 Content",
                            value:
                                formatMessageContent(
                                    deletedMessage.content
                                ),
                            inline: false
                        },
                        {
                            name: "📎 Attachments",
                            value: String(
                                deletedMessage.attachments
                                    ?.size || 0
                            ),
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur messageDelete :",
                error
            );
        }
    }
);


client.on(
    "messageUpdate",
    async (
        oldMessage,
        newMessage
    ) => {
        try {
            let previousMessage =
                oldMessage;

            let updatedMessage =
                newMessage;

            if (previousMessage.partial) {
                try {
                    previousMessage =
                        await previousMessage.fetch();
                } catch (error) {
                    // Certains messages modifiés restent partiels.
                }
            }

            if (updatedMessage.partial) {
                try {
                    updatedMessage =
                        await updatedMessage.fetch();
                } catch (error) {
                    // Certains messages modifiés restent partiels.
                }
            }

            if (!updatedMessage.guild) {
                return;
            }

            const oldContent =
                previousMessage.content || "";

            const newContent =
                updatedMessage.content || "";

            if (
                oldContent === newContent
            ) {
                return;
            }

            await sendSecurityLog(
                updatedMessage.guild,
                {
                    title:
                        "✏️ Message Updated",

                    level: "info",

                    target:
                        updatedMessage.author ||
                        null,

                    fields: [
                        {
                            name: "📁 Channel",
                            value:
                                updatedMessage.channel?.id
                                    ? `<#${updatedMessage.channel.id}>`
                                    : "Unknown",
                            inline: true
                        },
                        {
                            name: "🔗 Jump",
                            value:
                                updatedMessage.url ||
                                "Non disponible",
                            inline: true
                        },
                        {
                            name: "⬅️ Before",
                            value:
                                formatMessageContent(
                                    oldContent
                                ),
                            inline: false
                        },
                        {
                            name: "➡️ After",
                            value:
                                formatMessageContent(
                                    newContent
                                ),
                            inline: false
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur messageUpdate :",
                error
            );
        }
    }
);


client.on(
    "messageDeleteBulk",
    async (
        messages,
        channel
    ) => {
        try {
            const guild =
                channel?.guild ||
                messages.first()?.guild;

            if (!guild) {
                return;
            }

            await sendSecurityLog(
                guild,
                {
                    title:
                        "🧹 Suppression massive de messages",

                    level: "danger",

                    fields: [
                        {
                            name: "📁 Salon",
                            value:
                                channel?.id
                                    ? `<#${channel.id}>`
                                    : "Inconnu",
                            inline: true
                        },
                        {
                            name: "🗑️ Messages supprimés",
                            value:
                                String(messages.size),
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur messageDeleteBulk :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * INVITATIONS
 * ============================================================
 */

client.on(
    "inviteCreate",
    async (invite) => {
        try {
            if (!invite.guild) {
                return;
            }

            await sendInviteCreateLog(
                invite.guild,
                {
                    code:
                        invite.code,
                    inviter:
                        invite.inviter || null,
                    channelId:
                        invite.channel?.id || null,
                    expiresTimestamp:
                        invite.expiresTimestamp || null,
                    maxUses:
                        invite.maxUses || 0,
                    maxAge:
                        invite.maxAge || 0
                }
            );

            await refreshGuildInviteCache(
                invite.guild
            );
        } catch (error) {
            console.error(
                "❌ Erreur inviteCreate :",
                error
            );
        }
    }
);


client.on(
    "raw",
    async (packet) => {
        try {
            if (packet.t !== "INVITE_CREATE") {
                return;
            }

            const data = packet.d;

            if (!data?.guild_id || !data?.code) {
                return;
            }

            const guild =
                client.guilds.cache.get(
                    data.guild_id
                );

            if (!guild) {
                return;
            }

            await sendInviteCreateLog(
                guild,
                {
                    code:
                        data.code,
                    inviter:
                        data.inviter || null,
                    channelId:
                        data.channel_id || null,
                    expiresTimestamp:
                        data.expires_at
                            ? new Date(data.expires_at).getTime()
                            : null,
                    maxUses:
                        data.max_uses || 0,
                    maxAge:
                        data.max_age || 0
                }
            );

        } catch (error) {
            console.error(
                "❌ Erreur fallback INVITE_CREATE :",
                error
            );
        }
    }
);


client.on(
    "inviteDelete",
    async (invite) => {
        try {
            if (!invite.guild) {
                return;
            }

            const entry =
                await findAuditEntry(
                    invite.guild,
                    AuditLogEvent.InviteDelete,
                    null,
                    10000
                );

            await sendSecurityLog(
                invite.guild,
                {
                    title:
                        "❌ Invite Deleted",

                    level: "warning",

                    actor:
                        entry?.executor || null,

                    fields: [
                        {
                            name: "🧩 Code",
                            value:
                                cleanLogText(
                                    invite.code,
                                    "Unknown"
                                ),
                            inline: true
                        },
                        {
                            name: "📁 Channel",
                            value:
                                invite.channel?.id
                                    ? `<#${invite.channel.id}>`
                                    : "Unknown",
                            inline: true
                        }
                    ]
                }
            );

            await refreshGuildInviteCache(
                invite.guild
            );
        } catch (error) {
            console.error(
                "❌ Erreur inviteDelete :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * SERVEUR
 * ============================================================
 */

client.on(
    "guildUpdate",
    async (
        oldGuild,
        newGuild
    ) => {
        try {
            const changes = [];

            if (
                oldGuild.name !==
                newGuild.name
            ) {
                changes.push({
                    name: "📛 Nom",
                    value:
                        `\`${oldGuild.name}\` → ` +
                        `\`${newGuild.name}\``
                });
            }

            const oldIcon =
                oldGuild.iconURL() || null;

            const newIcon =
                newGuild.iconURL() || null;

            if (oldIcon !== newIcon) {
                changes.push({
                    name: "🖼️ Icône",
                    value:
                        newIcon
                            ? "Icône modifiée"
                            : "Icône supprimée"
                });
            }

            if (changes.length === 0) {
                return;
            }

            const entry =
                await findAuditEntry(
                    newGuild,
                    AuditLogEvent.GuildUpdate,
                    newGuild.id
                );

            await sendSecurityLog(
                newGuild,
                {
                    title:
                        "⚙️ Server Settings Updated",

                    level: "warning",

                    actor:
                        entry?.executor || null,

                    fields: changes
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur guildUpdate :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * EMOJIS / STICKERS
 * ============================================================
 */

client.on(
    "emojiCreate",
    async (emoji) => {
        try {
            await sendSecurityLog(
                emoji.guild,
                {
                    title:
                        "😀 Emoji Created",

                    level: "info",

                    fields: [
                        {
                            name: "😀 Emoji",
                            value:
                                `${emoji} (\`${emoji.name}\`)`,
                            inline: true
                        },
                        {
                            name: "🆔 Emoji ID",
                            value:
                                `\`${emoji.id}\``,
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur emojiCreate :",
                error
            );
        }
    }
);


client.on(
    "emojiDelete",
    async (emoji) => {
        try {
            const entry =
                await findAuditEntry(
                    emoji.guild,
                    AuditLogEvent.EmojiDelete,
                    emoji.id
                );

            await sendSecurityLog(
                emoji.guild,
                {
                    title:
                        "🗑️ Emoji Deleted",

                    level: "warning",

                    actor:
                        entry?.executor || null,

                    fields: [
                        {
                            name: "😀 Emoji",
                            value:
                                cleanLogText(
                                    emoji.name,
                                    "Unknown"
                                ),
                            inline: true
                        },
                        {
                            name: "🆔 Emoji ID",
                            value:
                                `\`${emoji.id}\``,
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur emojiDelete :",
                error
            );
        }
    }
);


client.on(
    "emojiUpdate",
    async (
        oldEmoji,
        newEmoji
    ) => {
        try {
            if (
                oldEmoji.name ===
                newEmoji.name
            ) {
                return;
            }

            const entry =
                await findAuditEntry(
                    newEmoji.guild,
                    AuditLogEvent.EmojiUpdate,
                    newEmoji.id
                );

            await sendSecurityLog(
                newEmoji.guild,
                {
                    title:
                        "✏️ Emoji Updated",

                    level: "info",

                    actor:
                        entry?.executor || null,

                    fields: [
                        {
                            name: "😀 Emoji",
                            value:
                                `<:${newEmoji.name}:${newEmoji.id}>`,
                            inline: true
                        },
                        {
                            name: "📛 Name",
                            value:
                                `\`${oldEmoji.name}\` → ` +
                                `\`${newEmoji.name}\``,
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur emojiUpdate :",
                error
            );
        }
    }
);


client.on(
    "stickerCreate",
    async (sticker) => {
        try {
            await sendSecurityLog(
                sticker.guild,
                {
                    title:
                        "🧩 Sticker Created",

                    level: "info",

                    fields: [
                        {
                            name: "🧩 Name",
                            value:
                                `\`${sticker.name}\``,
                            inline: true
                        },
                        {
                            name: "🆔 Sticker ID",
                            value:
                                `\`${sticker.id}\``,
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur stickerCreate :",
                error
            );
        }
    }
);


client.on(
    "stickerDelete",
    async (sticker) => {
        try {
            const entry =
                await findAuditEntry(
                    sticker.guild,
                    AuditLogEvent.StickerDelete,
                    sticker.id
                );

            await sendSecurityLog(
                sticker.guild,
                {
                    title:
                        "🗑️ Sticker Deleted",

                    level: "warning",

                    actor:
                        entry?.executor || null,

                    fields: [
                        {
                            name: "🧩 Name",
                            value:
                                cleanLogText(
                                    sticker.name,
                                    "Unknown"
                                ),
                            inline: true
                        },
                        {
                            name: "🆔 Sticker ID",
                            value:
                                `\`${sticker.id}\``,
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur stickerDelete :",
                error
            );
        }
    }
);


client.on(
    "stickerUpdate",
    async (
        oldSticker,
        newSticker
    ) => {
        try {
            const changes = [];

            if (
                oldSticker.name !==
                newSticker.name
            ) {
                changes.push({
                    name: "📛 Name",
                    value:
                        `\`${oldSticker.name}\` → ` +
                        `\`${newSticker.name}\``
                });
            }

            if (
                oldSticker.description !==
                newSticker.description
            ) {
                changes.push({
                    name: "📝 Description",
                    value:
                        cleanLogText(
                            oldSticker.description,
                            "None"
                        ) +
                        " → " +
                        cleanLogText(
                            newSticker.description,
                            "None"
                        )
                });
            }

            if (changes.length === 0) {
                return;
            }

            const entry =
                await findAuditEntry(
                    newSticker.guild,
                    AuditLogEvent.StickerUpdate,
                    newSticker.id
                );

            await sendSecurityLog(
                newSticker.guild,
                {
                    title:
                        "✏️ Sticker Updated",

                    level: "info",

                    actor:
                        entry?.executor || null,

                    fields: [
                        {
                            name: "🆔 Sticker ID",
                            value:
                                `\`${newSticker.id}\``,
                            inline: true
                        },
                        ...changes
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur stickerUpdate :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * WEBHOOKS
 * ============================================================
 */

client.on(
    "webhookUpdate",
    async (channel) => {
        try {
            if (!channel.guild) {
                return;
            }

            const updateEntry =
                await findAuditEntry(
                    channel.guild,
                    AuditLogEvent.WebhookUpdate,
                    null,
                    10000
                );

            const createEntry =
                await findAuditEntry(
                    channel.guild,
                    AuditLogEvent.WebhookCreate,
                    null,
                    10000
                );

            const deleteEntry =
                await findAuditEntry(
                    channel.guild,
                    AuditLogEvent.WebhookDelete,
                    null,
                    10000
                );

            const antiNukeEntry =
                updateEntry ||
                createEntry ||
                deleteEntry ||
                null;

            let antiNukeActionType =
                "webhook_update";

            if (createEntry) {
                antiNukeActionType =
                    "webhook_create";
            } else if (deleteEntry) {
                antiNukeActionType =
                    "webhook_delete";
            }

            await processAntiNukeAction(
                channel.guild,
                antiNukeActionType,
                antiNukeEntry,
                channel.id,
                channel.name
            );

            await sendSecurityLog(
                channel.guild,
                {
                    title:
                        "🪝 Webhook Updated",

                    level: "danger",

                    actor:
                        updateEntry?.executor ||
                        createEntry?.executor ||
                        deleteEntry?.executor ||
                        null,

                    description:
                        "A webhook was created, updated, or deleted.",

                    fields: [
                        {
                            name: "📁 Channel",
                            value:
                                channel.id
                                    ? `<#${channel.id}>`
                                    : "Unknown",
                            inline: true
                        }
                    ]
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur webhookUpdate :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * VOICE STATE
 * ============================================================
 */

client.on(
    "voiceStateUpdate",
    async (
        oldState,
        newState
    ) => {
        try {
            if (!newState.guild) {
                return;
            }

            const member =
                newState.member ||
                oldState.member ||
                null;

            const oldChannelValue =
                oldState.channelId
                    ? `<#${oldState.channelId}>`
                    : "Aucun";

            const newChannelValue =
                newState.channelId
                    ? `<#${newState.channelId}>`
                    : "Aucun";

            let title =
                "🎙️ Voice State Updated";

            let level =
                "info";

            let description = null;

            const fields = [];

            if (
                oldState.channelId !==
                newState.channelId
            ) {
                if (!oldState.channelId && newState.channelId) {
                    title =
                        "🔊 Voice Channel Joined";
                    description =
                        "A member joined a voice channel.";
                } else if (oldState.channelId && !newState.channelId) {
                    title =
                        "🔇 Voice Channel Left";
                    description =
                        "A member left a voice channel.";
                } else {
                    title =
                        "🔁 Voice Channel Moved";
                    description =
                        "A member moved between voice channels.";
                }

                fields.push({
                    name: "🔊 Voice Channel",
                    value:
                        `${oldChannelValue} → ${newChannelValue}`,
                    inline: false
                });
            }

            if (
                oldState.serverMute !==
                newState.serverMute
            ) {
                fields.push({
                    name: "🔇 Server Mute",
                    value:
                        newState.serverMute
                            ? "Enabled"
                            : "Disabled",
                    inline: true
                });
            }

            if (
                oldState.serverDeaf !==
                newState.serverDeaf
            ) {
                fields.push({
                    name: "🙉 Server Deaf",
                    value:
                        newState.serverDeaf
                            ? "Enabled"
                            : "Disabled",
                    inline: true
                });
            }

            if (
                oldState.selfVideo !==
                newState.selfVideo
            ) {
                fields.push({
                    name: "📹 Camera",
                    value:
                        newState.selfVideo
                            ? "Enabled"
                            : "Disabled",
                    inline: true
                });
            }

            if (fields.length === 0) {
                return;
            }

            await sendSecurityLog(
                newState.guild,
                {
                    title,

                    level,

                    description,

                    target:
                        member,

                    fields
                }
            );
        } catch (error) {
            console.error(
                "❌ Erreur voiceStateUpdate :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * MESSAGES / COMMANDES
 * ============================================================
 */

client.on(
    "messageCreate",
    async (message) => {
        if (
            message.author.bot ||
            !message.guild
        ) {
            return;
        }

        try {
            await updateUserProfile(
                message.author
            );

            if (message.member) {
                await updateGuildMember(
                    message.member
                );
            }

            const spamHandled =
                await checkAntiSpam(
                message
            );

            if (spamHandled) {
                return;
            }
        } catch (error) {
            console.error(
                "❌ Erreur mise à jour utilisateur :",
                error
            );
        }

        const prefix = "!";

        if (
            !message.content.startsWith(
                prefix
            )
        ) {
            return;
        }

        const args =
            message.content
                .slice(prefix.length)
                .trim()
                .split(/\s+/);

        const commandName =
            args
                .shift()
                ?.toLowerCase();

        const subcommandArg =
            String(args[0] || "")
                .toLowerCase()
                .replace(/[.,;:!?]+$/, "");

        if (!commandName) {
            return;
        }

        const command =
            client.commands.get(
                commandName
            );

        if (!command) {
            return message.reply(
                "❌ Cette commande n'existe pas.\n" +
                "Utilise `!help` pour voir les commandes."
            );
        }

        const isAdmin =
            Boolean(message.member) &&
            message.member.permissions.has(
                PermissionsBitField.Flags.Administrator
            );

        const publicCommands = [
            "help",
            "ping",
            "userinfo"
        ];

        if (
            !publicCommands.includes(commandName) &&
            !isAdmin
        ) {
            return message.reply(
                "❌ Cette commande est réservée aux administrateurs.\n" +
                "Utilise `!help` pour voir les commandes disponibles pour ton rôle."
            );
        }

        try {
            await command.execute(
                message,
                args
            );

            const securityCommands = [
                "lockdown",
                "unlock",
                "config",
                "setupcheck",
                "securitylogs",
                "antinuke",
                "whitelist"
            ];

            if (
                securityCommands.includes(
                    commandName
                )
            ) {
                const rawCommandText =
                    String(message.content || "")
                        .trim()
                        .toLowerCase();

                const normalizedSubcommand =
                    subcommandArg
                        .trim()
                        .replace(/\u200B/g, "");

                const configMutatingSubcommands = [
                    "lockdown",
                    "raid",
                    "spam",
                    "bot",
                    "antinuke",
                    "quarantine",
                    "age",
                    "logs"
                ];

                const shouldSkipSecurityLog =
                    (/^!config(?:\s+show)?[.,;:!?]*$/i.test(rawCommandText)) ||
                    (commandName === "config" &&
                        (
                            !normalizedSubcommand ||
                            normalizedSubcommand === "show" ||
                            !configMutatingSubcommands.includes(
                                normalizedSubcommand
                            )
                        )) ||
                    (commandName === "securitylogs" &&
                        (
                            !normalizedSubcommand ||
                            normalizedSubcommand === "info" ||
                            normalizedSubcommand === "test"
                        )) ||
                    (commandName === "antinuke" &&
                        (
                            !normalizedSubcommand ||
                            normalizedSubcommand === "status"
                        )) ||
                    (commandName === "whitelist" &&
                        (
                            !normalizedSubcommand ||
                            normalizedSubcommand === "help" ||
                            normalizedSubcommand === "list"
                        ));

                if (shouldSkipSecurityLog) {
                    return;
                }

                await logConfiguration(
                    message.guild,
                    {
                        actor:
                            message.author,

                        description:
                            `La commande \`!${commandName}\` ` +
                            `a été exécutée.`,

                        fields: [
                            {
                                name: "💬 Commande",
                                value:
                                    `\`${cleanLogText(message.content, "Commande", 400)}\``
                            }
                        ]
                    }
                );
            }
        } catch (error) {
            console.error(
                `❌ Erreur commande ${commandName}:`,
                error
            );

            await message.reply(
                "❌ Une erreur est survenue lors de l'exécution de cette commande."
            );
        }
    }
);


/*
 * ============================================================
 * BOT PRÊT
 * ============================================================
 */

client.once(
    "clientReady",
    async () => {
        try {
            await databaseReady;

            setInterval(
                sweepRuntimeCaches,
                CACHE_SWEEP_INTERVAL_MS
            ).unref();

            for (const guild of client.guilds.cache.values()) {
                await refreshGuildInviteCache(
                    guild
                );

                if (
                    guild.members.me &&
                    !guild.members.me.permissions.has(
                        PermissionsBitField.Flags.ManageGuild
                    )
                ) {
                    console.warn(
                        `⚠️ Permissions manquantes sur ${guild.name} : Gérer le serveur requis pour un suivi complet des invitations.`
                    );
                }
            }

            console.log(
                "🗄️ Base de données prête."
            );

            console.log(
                `🤖 MiyuBot est connecté à Discord en tant que ${client.user.tag}`
            );

            console.log(
                "👀 Surveillance des utilisateurs activée."
            );

            console.log(
                "🛡️ Système Anti-Raid activé."
            );

            console.log(
                "🚨 Système d'incidents de sécurité activé."
            );

            console.log(
                "🔒 Système Lockdown activé."
            );

            console.log(
                "📋 Journal de sécurité automatique activé."
            );

            console.log(
                "👮 Surveillance des Audit Logs activée."
            );

            console.log(
                "👂 Événement guildMemberUpdate activé."
            );
        } catch (error) {
            console.error(
                "❌ Impossible d'initialiser la base :",
                error
            );
        }
    }
);


/*
 * ============================================================
 * ERREURS DISCORD
 * ============================================================
 */

client.on(
    "error",
    (error) => {
        console.error(
            "❌ Erreur Discord :",
            error
        );
    }
);


/*
 * ============================================================
 * PROMESSES NON GÉRÉES
 * ============================================================
 */

process.on(
    "unhandledRejection",
    (error) => {
        console.error(
            "❌ Promise non gérée :",
            error
        );
    }
);


/*
 * ============================================================
 * EXCEPTIONS NON GÉRÉES
 * ============================================================
 */

process.on(
    "uncaughtException",
    (error) => {
        console.error(
            "❌ Exception non gérée :",
            error
        );
    }
);


/*
 * ============================================================
 * CONNEXION DISCORD
 * ============================================================
 */

if (!process.env.DISCORD_TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN est absent du fichier .env"
    );

    process.exit(1);
}

client.login(
    process.env.DISCORD_TOKEN
);


/*
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = client;