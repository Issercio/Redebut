const {
    PermissionFlagsBits
} = require("discord.js");

module.exports = {
    name: "help",
    description: "Affiche la liste des commandes",

    execute(message) {
        const isAdmin =
            Boolean(message.member) &&
            message.member.permissions.has(
                PermissionFlagsBits.Administrator
            );

        const publicCommands =
            "🤖 Commandes disponibles :\n" +
            "`!ping` - Vérifie si MiyuBot répond\n" +
            "`!help` - Affiche cette liste\n" +
            "`!userinfo` - Fiche membre";

        if (!isAdmin) {
            return message.reply(publicCommands);
        }

        const adminCommands =
            "`!config` - Configuration sécurité\n" +
            "`!cases` - Dossiers de modération\n" +
            "`!setupcheck` - Verification pre-production\n" +
            "`!securitylogs` - Gestion salon logs\n" +
            "`!lockdown` / `!unlock` - Verrouillage serveur\n" +
            "`!antinuke` - Réglages anti-nuke\n" +
            "`!whitelist` - Liste blanche anti-nuke\n" +
            "`!syncmembers` - Synchronisation base";

        return message.reply(
            publicCommands + adminCommands
        );
    }
};