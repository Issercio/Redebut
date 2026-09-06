const {
    EmbedBuilder,
    PermissionFlagsBits
} = require("discord.js");


module.exports = {
    name: "userinfo",

    description:
        "Affiche les informations complètes et l'historique d'un utilisateur",


    async execute(message, args) {

        if (!message.guild) {
            return message.reply(
                "❌ Cette commande doit être utilisée sur un serveur."
            );
        }

        let user;


        // ==========================================
        // RECHERCHE DE L'UTILISATEUR
        // ==========================================

        if (args.length === 0) {

            user = message.author;

        } else {

            // Recherche avec une mention
            user = message.mentions.users.first();


            // Recherche avec un ID
            if (!user) {

                const userId = args[0];

                try {

                    user = await message.client.users.fetch(
                        userId
                    );

                } catch (error) {

                    return message.reply(
                        "❌ Impossible de trouver cet utilisateur.\n" +
                        "Utilise une mention Discord ou un ID valide."
                    );

                }

            }

        }


        // ==========================================
        // RÉCUPÉRATION DU MEMBRE
        // ==========================================

        let member = null;


        try {

            member = await message.guild.members.fetch(
                user.id
            );

        } catch (error) {

            // L'utilisateur n'est probablement
            // plus présent sur le serveur

        }


        // ==========================================
        // DROITS DU DEMANDEUR
        // ==========================================

        const isAdmin =
            Boolean(message.member) &&
            message.member.permissions.has(
                PermissionFlagsBits.Administrator
            );


        // ==========================================
        // AFFICHAGE CLASSIQUE (NON-ADMIN)
        // ==========================================

        if (!isAdmin) {

            const joinedServerValue =
                member?.joinedTimestamp
                    ? `<t:${Math.floor(
                        member.joinedTimestamp / 1000
                    )}:F>`
                    : "Inconnu";

            const classicEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({
                    name:
                        `Profil de ${user.username}`,
                    iconURL:
                        user.displayAvatarURL()
                })
                .setThumbnail(
                    user.displayAvatarURL({
                        size: 512
                    })
                )
                .addFields(
                    {
                        name:
                            "👤 Nom d'utilisateur",
                        value:
                            user.username,
                        inline:
                            true
                    },
                    {
                        name:
                            "🏷️ Nom d'affichage",
                        value:
                            user.globalName ||
                            "Aucun",
                        inline:
                            true
                    },
                    {
                        name:
                            "🏠 Pseudo sur le serveur",
                        value:
                            member?.nickname ||
                            "Aucun",
                        inline:
                            false
                    },
                    {
                        name:
                            "📥 A rejoint le serveur",
                        value:
                            joinedServerValue,
                        inline:
                            false
                    }
                )
                .setFooter({
                    text:
                        "MiyuBot • Affichage classique"
                })
                .setTimestamp();

            return message.reply({
                embeds: [classicEmbed]
            });
        }


        // ==========================================
        // AFFICHAGE ADMIN COMPACT
        // ==========================================

        let rolesText =
            "Aucun rôle supplémentaire.";

        if (member) {
            const roles = member.roles.cache
                .filter(
                    (role) =>
                        role.id !== message.guild.id
                )
                .map(
                    (role) => `<@&${role.id}>`
                );

            if (roles.length > 0) {
                rolesText = roles.join(", ");
            }
        }

        if (rolesText.length > 1024) {
            rolesText =
                rolesText.slice(0, 1021) + "...";
        }

        const joinedServerValue =
            member?.joinedTimestamp
                ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
                : "Inconnu";

        const adminEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({
                name:
                    `Profil de ${user.username}`,
                iconURL:
                    user.displayAvatarURL()
            })
            .setThumbnail(
                user.displayAvatarURL({
                    size: 512
                })
            )
            .addFields(
                {
                    name:
                        "👤 Nom d'utilisateur",
                    value:
                        user.username,
                    inline:
                        true
                },
                {
                    name:
                        "🆔 ID Discord",
                    value:
                        `\`${user.id}\``,
                    inline:
                        true
                },
                {
                    name:
                        "🤖 Type",
                    value:
                        user.bot
                            ? "Bot"
                            : "Utilisateur",
                    inline:
                        true
                },
                {
                    name:
                        "🏷️ Nom d'affichage",
                    value:
                        user.globalName ||
                        "Aucun",
                    inline:
                        true
                },
                {
                    name:
                        "🏠 Pseudo sur le serveur",
                    value:
                        member?.nickname ||
                        "Aucun",
                    inline:
                        true
                },
                {
                    name:
                        "📅 Compte créé",
                    value:
                        `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
                    inline:
                        false
                },
                {
                    name:
                        "📥 A rejoint le serveur",
                    value:
                        joinedServerValue,
                    inline:
                        false
                },
                {
                    name:
                        `🎭 Rôles (${member ? member.roles.cache.size - 1 : 0})`,
                    value:
                        rolesText,
                    inline:
                        false
                }
            )
            .setFooter({
                text:
                    "MiyuBot • Profil"
            })
            .setTimestamp();

        return message.reply({
            embeds: [adminEmbed]
        });

    }
};