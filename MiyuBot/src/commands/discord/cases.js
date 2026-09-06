const {
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const {
    all,
    databaseReady
} = require("../../database/database");


function parseUserId(input) {
    if (!input) {
        return null;
    }

    const match = String(input)
        .trim()
        .match(/^(?:<@!?)?(\d{17,22})>?$/);

    return match ? match[1] : null;
}


module.exports = {
    name: "cases",

    async execute(message, args) {
        if (!message.guild) {
            return message.reply(
                "❌ Cette commande doit être utilisée sur un serveur."
            );
        }

        if (
            !message.member.permissions.has(
                PermissionFlagsBits.Administrator
            )
        ) {
            return message.reply(
                "❌ Cette commande est réservée aux administrateurs."
            );
        }

        await databaseReady;

        const sub =
            String(args.shift() || "recent")
                .toLowerCase();

        if (sub === "recent") {
            const limitRaw = Number(args.shift() || 10);
            const limit = Math.min(
                25,
                Math.max(1, Number.isInteger(limitRaw) ? limitRaw : 10)
            );

            const rows = await all(
                `
                SELECT id, user_id, actor_id, case_type, action, reason, status, created_at
                FROM moderation_cases
                WHERE guild_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                `,
                [message.guild.id, limit]
            );

            if (!rows.length) {
                return message.reply("ℹ️ Aucun dossier de modération pour le moment.");
            }

            const text = rows.map((row) => {
                const when = Math.floor(Number(row.created_at) / 1000);
                return `#${row.id} • ${String(row.case_type).toUpperCase()} • ${String(row.action).toUpperCase()}\nCible: <@${row.user_id}> | Modérateur: ${row.actor_id ? `<@${row.actor_id}>` : "Inconnu"}\nStatut: ${row.status} • <t:${when}:R>${row.reason ? `\nRaison: ${row.reason}` : ""}`;
            }).join("\n\n").slice(0, 4000);

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("📂 Dossiers de modération récents")
                .setDescription(text)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        if (sub === "user") {
            const userArg = args.shift();
            const userId = parseUserId(userArg || message.mentions.users.first()?.id);

            if (!userId) {
                return message.reply("❌ Utilisation: !cases user @utilisateur");
            }

            const rows = await all(
                `
                SELECT id, actor_id, case_type, action, reason, status, created_at
                FROM moderation_cases
                WHERE guild_id = ?
                AND user_id = ?
                ORDER BY created_at DESC
                LIMIT 20
                `,
                [message.guild.id, userId]
            );

            if (!rows.length) {
                return message.reply(`ℹ️ Aucun dossier trouvé pour <@${userId}>.`);
            }

            const text = rows.map((row) => {
                const when = Math.floor(Number(row.created_at) / 1000);
                return `#${row.id} • ${String(row.case_type).toUpperCase()} • ${String(row.action).toUpperCase()}\nModérateur: ${row.actor_id ? `<@${row.actor_id}>` : "Inconnu"}\nStatut: ${row.status} • <t:${when}:R>${row.reason ? `\nRaison: ${row.reason}` : ""}`;
            }).join("\n\n").slice(0, 4000);

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📂 Dossiers de <@${userId}>`)
                .setDescription(text)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        return message.reply(
            "❌ Utilisation:\n" +
            "!cases recent [nombre]\n" +
            "!cases user @utilisateur"
        );
    }
};
