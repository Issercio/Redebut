const {
    PermissionsBitField,
    EmbedBuilder
} = require("discord.js");

const {
    deactivateLockdown
} = require("../../security/lockdown");


module.exports = {
    name: "unlock",


    async execute(
        message,
        args
    ) {

        if (!message.guild) {
            return;
        }


        // ======================================
        // PERMISSION UTILISATEUR
        // ======================================

        if (
            !message.member.permissions.has(
                PermissionsBitField.Flags.ManageChannels
            )
        ) {

            return message.reply(
                "❌ Tu n'as pas la permission de retirer le lockdown."
            );
        }


        // ======================================
        // PERMISSION BOT
        // ======================================

        const botMember =
            message.guild.members.me;


        if (
            !botMember ||
            !botMember.permissions.has(
                PermissionsBitField.Flags.ManageChannels
            )
        ) {

            return message.reply(
                "❌ MiyuBot n'a pas la permission `Gérer les salons`."
            );
        }


        // ======================================
        // RAISON
        // ======================================

        const reason =
            args
                .join(" ")
                .trim() ||
            `Lockdown retiré par ${message.author.tag}`;


        try {

            const result =
                await deactivateLockdown(
                    message.guild,
                    reason,
                    message.author.id
                );


            // ==================================
            // DÉJÀ INACTIF
            // ==================================

            if (
                result.alreadyInactive
            ) {

                return message.reply(
                    "⚠️ Le serveur n'est pas actuellement en lockdown."
                );
            }


            // ==================================
            // EMBED
            // ==================================

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0x2ECC71
                    )

                    .setTitle(
                        "🔓 LOCKDOWN DÉSACTIVÉ"
                    )

                    .setDescription(
                        "Les permissions précédentes ont été restaurées."
                    )

                    .addFields(

                        {
                            name:
                                "👮 Modérateur",

                            value:
                                `<@${message.author.id}>`,

                            inline:
                                true
                        },

                        {
                            name:
                                "🔓 Salons restaurés",

                            value:
                                `${result.restoredChannels}`,

                            inline:
                                true
                        },

                        {
                            name:
                                "⚠️ Échecs",

                            value:
                                `${result.failedChannels}`,

                            inline:
                                true
                        },

                        {
                            name:
                                "📝 Raison",

                            value:
                                reason.substring(
                                    0,
                                    1024
                                )
                        }

                    )

                    .setFooter({
                        text:
                            "MiyuBot • Protection du serveur"
                    })

                    .setTimestamp();


            await message.channel.send({
                embeds: [
                    embed
                ]
            });


        } catch (error) {

            console.error(
                "❌ Erreur désactivation lockdown :",
                error
            );


            await message.reply(
                "❌ Impossible de retirer le lockdown.\n" +
                `\`${error.message}\``
            );
        }
    }
};