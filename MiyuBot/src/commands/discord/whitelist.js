const {
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const {
    run,
    all,
    databaseReady
} = require("../../database/database");


function parseUserId(raw) {
    if (!raw) {
        return null;
    }

    const match = raw.match(/^(?:<@!?)?(\d{17,22})>?$/);
    return match ? match[1] : null;
}


module.exports = {
    name: "whitelist",

    async execute(message, args) {
        if (!message.guild) {
            return message.reply("❌ Cette commande doit être utilisée sur un serveur.");
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply("❌ Tu dois avoir la permission Gérer le serveur.");
        }

        await databaseReady;

        const sub = args.shift()?.toLowerCase();

        if (!sub || sub === "help") {
            return message.reply(
                "📋 Commandes whitelist:\n" +
                "!whitelist add @user [raison]\n" +
                "!whitelist remove @user\n" +
                "!whitelist list"
            );
        }

        if (sub === "add") {
            const userArg = args.shift() || message.mentions.users.first()?.id;
            const userId = parseUserId(userArg || "");

            if (!userId) {
                return message.reply("❌ Utilisation: !whitelist add @user [raison]");
            }

            const reason = args.join(" ").trim() || "Aucune raison précisée";

            await run(
                `
                INSERT OR REPLACE INTO anti_nuke_whitelist (
                    guild_id,
                    user_id,
                    added_by,
                    reason,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    message.guild.id,
                    userId,
                    message.author.id,
                    reason,
                    Date.now()
                ]
            );

            return message.reply(`✅ <@${userId}> a été ajouté à la whitelist Anti-Nuke.`);
        }

        if (sub === "remove") {
            const userArg = args.shift() || message.mentions.users.first()?.id;
            const userId = parseUserId(userArg || "");

            if (!userId) {
                return message.reply("❌ Utilisation: !whitelist remove @user");
            }

            const result = await run(
                `
                DELETE FROM anti_nuke_whitelist
                WHERE guild_id = ?
                AND user_id = ?
                `,
                [message.guild.id, userId]
            );

            if (result.changes === 0) {
                return message.reply("⚠️ Cet utilisateur n'était pas dans la whitelist.");
            }

            return message.reply(`✅ <@${userId}> a été retiré de la whitelist Anti-Nuke.`);
        }

        if (sub === "list") {
            const rows = await all(
                `
                SELECT user_id, reason, created_at
                FROM anti_nuke_whitelist
                WHERE guild_id = ?
                ORDER BY created_at DESC
                LIMIT 20
                `,
                [message.guild.id]
            );

            if (!rows.length) {
                return message.reply("ℹ️ La whitelist Anti-Nuke est vide.");
            }

            const value = rows
                .map((row, index) => {
                    const when = Math.floor(Number(row.created_at || Date.now()) / 1000);
                    return `${index + 1}. <@${row.user_id}> - ${row.reason || "Aucune raison"} (ajouté <t:${when}:R>)`;
                })
                .join("\n")
                .slice(0, 4000);

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("📜 Whitelist Anti-Nuke")
                .setDescription(value)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        return message.reply("❌ Sous-commande inconnue. Utilise !whitelist help");
    }
};
