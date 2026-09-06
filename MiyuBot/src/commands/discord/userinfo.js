const {
    EmbedBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    all,
    get
} = require("../../database/database");


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
        // PROFIL ENREGISTRÉ
        // ==========================================

        const profile = await get(
            `
            SELECT *
            FROM user_profiles
            WHERE user_id = ?
            `,
            [user.id]
        );


        // ==========================================
        // INFORMATIONS DU SERVEUR
        // ==========================================

        const guildMember = await get(
            `
            SELECT *
            FROM guild_members
            WHERE guild_id = ?
            AND user_id = ?
            `,
            [
                message.guild.id,
                user.id
            ]
        );


        // ==========================================
        // HISTORIQUE DES NOMS
        // ==========================================

        const nameHistory = await all(
            `
            SELECT
                name_type,
                old_value,
                new_value,
                changed_at
            FROM name_history
            WHERE
                user_id = ?
                AND (
                    guild_id = ?
                    OR guild_id IS NULL
                )
            ORDER BY changed_at DESC
            LIMIT 15
            `,
            [
                user.id,
                message.guild.id
            ]
        );


        // ==========================================
        // HISTORIQUE DES ÉVÉNEMENTS
        // ==========================================

        const eventHistory = await all(
            `
            SELECT
                event_type,
                old_value,
                new_value,
                event_date
            FROM member_history
            WHERE
                user_id = ?
                AND (
                    guild_id = ?
                    OR guild_id = "GLOBAL"
                )
            ORDER BY event_date DESC
            LIMIT 15
            `,
            [
                user.id,
                message.guild.id
            ]
        );


        // ==========================================
        // FORMATAGE DES RÔLES
        // ==========================================

        let rolesText =
            "Aucune information disponible.";


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

            } else {

                rolesText =
                    "Aucun rôle supplémentaire.";

            }

        }


        // ==========================================
        // FORMATAGE DE L'HISTORIQUE DES NOMS
        // ==========================================

        let namesText =
            "Aucun changement enregistré.";


        if (nameHistory.length > 0) {

            namesText = nameHistory
                .map((item) => {

                    const timestamp =
                        Math.floor(
                            item.changed_at / 1000
                        );


                    let typeText;


                    switch (item.name_type) {

                        case "username":

                            typeText =
                                "🌐 Nom d'utilisateur";

                            break;


                        case "global_name":

                            typeText =
                                "🏷️ Nom d'affichage";

                            break;


                        case "nickname":

                            typeText =
                                "🏠 Pseudo serveur";

                            break;


                        default:

                            typeText =
                                "📝 Nom";

                    }


                    return (
                        `${typeText}\n` +
                        `\`${item.old_value || "Aucun"}\` ` +
                        `→ \`${item.new_value}\`\n` +
                        `<t:${timestamp}:R>`
                    );

                })
                .join("\n\n");

        }


        // ==========================================
        // FORMATAGE DES ÉVÉNEMENTS
        // ==========================================

        let eventsText =
            "Aucun événement enregistré.";


        if (eventHistory.length > 0) {

            eventsText = eventHistory
                .map((event) => {

                    const timestamp =
                        Math.floor(
                            event.event_date / 1000
                        );


                    switch (event.event_type) {

                        case "join":

                            return (
                                `📥 A rejoint le serveur\n` +
                                `<t:${timestamp}:F>`
                            );


                        case "leave":

                            return (
                                `📤 A quitté le serveur\n` +
                                `<t:${timestamp}:F>`
                            );


                        case "nickname_change":

                            return (
                                `🏠 Changement de pseudo\n` +
                                `\`${event.old_value || "Aucun"}\` ` +
                                `→ \`${event.new_value || "Aucun"}\`\n` +
                                `<t:${timestamp}:R>`
                            );


                        case "username_change":

                            return (
                                `🌐 Changement de nom Discord\n` +
                                `\`${event.old_value}\` ` +
                                `→ \`${event.new_value}\`\n` +
                                `<t:${timestamp}:R>`
                            );


                        case "global_name_change":

                            return (
                                `🏷️ Changement de nom d'affichage\n` +
                                `\`${event.old_value || "Aucun"}\` ` +
                                `→ \`${event.new_value || "Aucun"}\`\n` +
                                `<t:${timestamp}:R>`
                            );


                        case "avatar_change":

                            return (
                                `🖼️ Changement d'avatar\n` +
                                `<t:${timestamp}:R>`
                            );


                        default:

                            return (
                                `❓ ${event.event_type}\n` +
                                `<t:${timestamp}:R>`
                            );

                    }

                })
                .join("\n\n");

        }


        // ==========================================
        // LIMITES DISCORD
        // ==========================================

        if (rolesText.length > 1024) {

            rolesText =
                rolesText.slice(0, 1021) + "...";

        }


        if (namesText.length > 1024) {

            namesText =
                namesText.slice(0, 1021) + "...";

        }


        if (eventsText.length > 1024) {

            eventsText =
                eventsText.slice(0, 1021) + "...";

        }


        // ==========================================
        // EMBED PRINCIPAL
        // ==========================================

        const embed = new EmbedBuilder()

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

                // ----------------------------------
                // IDENTITÉ
                // ----------------------------------

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


                // ----------------------------------
                // NOM GLOBAL
                // ----------------------------------

                {
                    name:
                        "🏷️ Nom d'affichage",

                    value:
                        user.globalName ||
                        "Aucun",

                    inline:
                        true
                },


                // ----------------------------------
                // PSEUDO SERVEUR
                // ----------------------------------

                {
                    name:
                        "🏠 Pseudo sur le serveur",

                    value:
                        member?.nickname ||
                        "Aucun",

                    inline:
                        true
                },


                // ----------------------------------
                // DATE COMPTE
                // ----------------------------------

                {
                    name:
                        "📅 Compte créé",

                    value:
                        `<t:${Math.floor(
                            user.createdTimestamp / 1000
                        )}:F>`,

                    inline:
                        false
                }

            );


        // ==========================================
        // INFORMATIONS SERVEUR
        // ==========================================

        if (member) {

            if (member.joinedTimestamp) {

                embed.addFields({

                    name:
                        "📥 A rejoint le serveur",

                    value:
                        `<t:${Math.floor(
                            member.joinedTimestamp / 1000
                        )}:F>`,

                    inline:
                        false

                });

            }


            embed.addFields({

                name:
                    `🎭 Rôles (${member.roles.cache.size - 1})`,

                value:
                    rolesText,

                inline:
                    false

            });

        } else if (guildMember) {

            if (guildMember.joined_at) {

                embed.addFields({

                    name:
                        "📥 Dernière arrivée connue",

                    value:
                        `<t:${Math.floor(
                            guildMember.joined_at / 1000
                        )}:F>`,

                    inline:
                        false

                });

            }

        }


        // ==========================================
        // HISTORIQUES
        // ==========================================

        embed.addFields(

            {
                name:
                    `📝 Historique des noms (${nameHistory.length})`,

                value:
                    namesText,

                inline:
                    false
            },


            {
                name:
                    `📜 Historique des événements (${eventHistory.length})`,

                value:
                    eventsText,

                inline:
                    false
            }

        );


        // ==========================================
        // FOOTER
        // ==========================================

        embed
            .setFooter({
                text:
                    profile
                        ? "MiyuBot • Historique enregistré automatiquement"
                        : "MiyuBot • Utilisateur non encore enregistré dans la base"
            })

            .setTimestamp();


        // ==========================================
        // ENVOI
        // ==========================================

        await message.reply({
            embeds: [embed]
        });

    }
};