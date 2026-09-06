const {
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const {
    get,
    databaseReady
} = require("../../database/database");

const REQUIRED_BOT_PERMISSIONS = [
    {
        label: "Voir les logs d'audit",
        flag: PermissionFlagsBits.ViewAuditLog
    },
    {
        label: "Gerer le serveur",
        flag: PermissionFlagsBits.ManageGuild
    },
    {
        label: "Gerer les salons",
        flag: PermissionFlagsBits.ManageChannels
    },
    {
        label: "Gerer les roles",
        flag: PermissionFlagsBits.ManageRoles
    },
    {
        label: "Moderer les membres",
        flag: PermissionFlagsBits.ModerateMembers
    },
    {
        label: "Expulser des membres",
        flag: PermissionFlagsBits.KickMembers
    },
    {
        label: "Bannir des membres",
        flag: PermissionFlagsBits.BanMembers
    },
    {
        label: "Voir les salons",
        flag: PermissionFlagsBits.ViewChannel
    },
    {
        label: "Envoyer des messages",
        flag: PermissionFlagsBits.SendMessages
    },
    {
        label: "Integrer des liens",
        flag: PermissionFlagsBits.EmbedLinks
    },
    {
        label: "Lire l'historique",
        flag: PermissionFlagsBits.ReadMessageHistory
    }
];


function boolIcon(value) {
    return value ? "OK" : "NON";
}


module.exports = {
    name: "setupcheck",

    async execute(message) {
        if (!message.guild) {
            return message.reply("Cette commande doit etre utilisee sur un serveur.");
        }

        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("Cette commande est reservee aux administrateurs.");
        }

        await databaseReady;

        const botMember = message.guild.members.me;

        if (!botMember) {
            return message.reply("Impossible de recuperer les permissions du bot.");
        }

        const settings = await get(
            `
            SELECT *
            FROM guild_settings
            WHERE guild_id = ?
            `,
            [message.guild.id]
        );

        const missingPermissions = REQUIRED_BOT_PERMISSIONS
            .filter((permission) => !botMember.permissions.has(permission.flag))
            .map((permission) => `- ${permission.label}`);

        const warnings = [];

        if (!settings) {
            warnings.push("- Configuration serveur absente: lance !config show une fois.");
        } else {
            if (!settings.security_log_channel_id) {
                warnings.push("- Salon de logs non configure: utilise !config logs #salon.");
            }

            if (Number(settings.anti_raid_threshold || 10) < 5) {
                warnings.push("- Seuil anti-raid faible (<5): risque de faux positifs.");
            }

            if (Number(settings.anti_spam_threshold || 6) < 4) {
                warnings.push("- Seuil anti-spam tres agressif (<4).");
            }

            if (Number(settings.quarantine_enabled || 0) === 1 && !settings.quarantine_role_id) {
                warnings.push("- Quarantaine active sans role configure.");
            }
        }

        const roleOrderOk =
            !message.member ||
            botMember.roles.highest.comparePositionTo(message.member.roles.highest) > 0;

        const embed = new EmbedBuilder()
            .setColor(missingPermissions.length ? 0xED4245 : 0x57F287)
            .setTitle("Verification de preparation MiyuBot")
            .setDescription(
                "Controle rapide avant mise en production Discord/Twitch."
            )
            .addFields(
                {
                    name: "Permissions critiques",
                    value:
                        missingPermissions.length
                            ? `Manquantes:\n${missingPermissions.join("\n")}`
                            : "Toutes les permissions critiques sont presentes."
                },
                {
                    name: "Hierarchie role bot",
                    value:
                        `${boolIcon(roleOrderOk)} - Le role du bot doit etre au-dessus des membres a moderer.`
                },
                {
                    name: "Avertissements configuration",
                    value:
                        warnings.length
                            ? warnings.join("\n")
                            : "Aucun avertissement detecte."
                },
                {
                    name: "Actions conseillees",
                    value:
                        "1) Tester !securitylogs test\n" +
                        "2) Tester !cases recent\n" +
                        "3) Tester une invitation et verifier un seul log"
                }
            )
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
};
