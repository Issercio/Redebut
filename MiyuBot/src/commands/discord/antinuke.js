const {
    EmbedBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    run,
    get,
    databaseReady
} = require("../../database/database");

const ALLOWED_SANCTIONS = [
    "ban",
    "kick",
    "timeout"
];


async function ensureSettings(guildId) {
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
            created_at,
            updated_at
        )
        VALUES (?, ?, ?)
        `,
        [guildId, now, now]
    );

    settings = await get(
        `
        SELECT *
        FROM guild_settings
        WHERE guild_id = ?
        `,
        [guildId]
    );

    return settings;
}


async function updateSetting(guildId, column, value) {
    const allowedColumns = [
        "anti_nuke_enabled",
        "anti_nuke_threshold",
        "anti_nuke_window",
        "anti_nuke_sanction"
    ];

    if (!allowedColumns.includes(column)) {
        throw new Error(`Paramètre interdit : ${column}`);
    }

    await run(
        `
        UPDATE guild_settings
        SET
            ${column} = ?,
            updated_at = ?
        WHERE guild_id = ?
        `,
        [value, Date.now(), guildId]
    );

    return ensureSettings(guildId);
}


function toStatus(value) {
    return Number(value) === 1
        ? "🟢 Activé"
        : "🔴 Désactivé";
}


module.exports = {
    name: "antinuke",

    async execute(message, args) {
        if (!message.guild) {
            return message.reply("❌ Cette commande doit être utilisée sur un serveur.");
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply("❌ Tu dois avoir la permission Gérer le serveur.");
        }

        const sub = args.shift()?.toLowerCase();

        const settings = await ensureSettings(message.guild.id);

        if (!sub || sub === "status") {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("🛡️ Anti-Nuke MiyuBot")
                .setDescription("Protection contre les actions administratives massives.")
                .addFields(
                    {
                        name: "État",
                        value: toStatus(settings.anti_nuke_enabled),
                        inline: true
                    },
                    {
                        name: "Seuil",
                        value: `${Number(settings.anti_nuke_threshold || 3)} actions`,
                        inline: true
                    },
                    {
                        name: "Fenêtre",
                        value: `${Number(settings.anti_nuke_window || 15)} secondes`,
                        inline: true
                    },
                    {
                        name: "Sanction",
                        value: String(settings.anti_nuke_sanction || "ban").toUpperCase(),
                        inline: true
                    },
                    {
                        name: "Commandes",
                        value:
                            "!antinuke on/off\n" +
                            "!antinuke threshold <nombre>\n" +
                            "!antinuke window <secondes>\n" +
                            "!antinuke sanction <ban|kick|timeout>\n" +
                            "!antinuke status"
                    }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        if (sub === "on" || sub === "off") {
            const enabled = sub === "on" ? 1 : 0;
            const updated = await updateSetting(message.guild.id, "anti_nuke_enabled", enabled);

            const embed = new EmbedBuilder()
                .setColor(enabled === 1 ? 0x57F287 : 0xED4245)
                .setTitle(enabled === 1 ? "🟢 Anti-Nuke activé" : "🔴 Anti-Nuke désactivé")
                .addFields({ name: "État", value: toStatus(updated.anti_nuke_enabled) })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        if (sub === "threshold") {
            const value = Number(args.shift());

            if (!Number.isInteger(value) || value < 2 || value > 20) {
                return message.reply("❌ Valeur invalide. Utilise un nombre entre 2 et 20.");
            }

            const updated = await updateSetting(message.guild.id, "anti_nuke_threshold", value);

            return message.reply(
                `✅ Seuil Anti-Nuke défini sur ${Number(updated.anti_nuke_threshold)} actions.`
            );
        }

        if (sub === "window") {
            const value = Number(args.shift());

            if (!Number.isInteger(value) || value < 5 || value > 120) {
                return message.reply("❌ Valeur invalide. Utilise un nombre entre 5 et 120 secondes.");
            }

            const updated = await updateSetting(message.guild.id, "anti_nuke_window", value);

            return message.reply(
                `✅ Fenêtre Anti-Nuke définie sur ${Number(updated.anti_nuke_window)} secondes.`
            );
        }

        if (sub === "sanction") {
            const value = args.shift()?.toLowerCase();

            if (!ALLOWED_SANCTIONS.includes(value)) {
                return message.reply("❌ Sanction invalide. Choisis ban, kick, ou timeout.");
            }

            const updated = await updateSetting(message.guild.id, "anti_nuke_sanction", value);

            return message.reply(
                `✅ Sanction Anti-Nuke définie sur ${String(updated.anti_nuke_sanction).toUpperCase()}.`
            );
        }

        return message.reply(
            "❌ Utilisation:\n" +
            "!antinuke on/off\n" +
            "!antinuke threshold <nombre>\n" +
            "!antinuke window <secondes>\n" +
            "!antinuke sanction <ban|kick|timeout>\n" +
            "!antinuke status"
        );
    }
};
