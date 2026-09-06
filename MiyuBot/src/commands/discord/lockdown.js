const {
    PermissionsBitField,
    EmbedBuilder
} = require("discord.js");

const {
    activateLockdown
} = require("../../security/lockdown");


module.exports = {
    name: "lockdown",


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
                "❌ Tu n'as pas la permission de gérer le lockdown."
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
            `Lockdown manuel par ${message.author.tag}`;


        try {

            const result =
                await activateLockdown(
                    message.guild,
                    reason,
                    {
                        type: "manual",

                        moderator_id:
                            message.author.id,

                        moderator_tag:
                            message.author.tag,

                        severity:
                            "high"
                    }
                );


            // ==================================
            // DÉJÀ ACTIF
            // ==================================

            if (
                result.alreadyActive
            ) {

                return message.reply(
                    "⚠️ Le serveur est déjà en lockdown."
                );
            }


            // ==================================
            // EMBED
            // ==================================

            const embed =
                new EmbedBuilder()

                    .setColor(
                        0xE74C3C
                    )

                    .setTitle(
                        "🔒 LOCKDOWN ACTIVÉ"
                    )

                    .setDescription(
                        "Le serveur est maintenant en mode lockdown."
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
                                "🔒 Salons protégés",

                            value:
                                `${result.protectedChannels}`,

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
                                "🆔 Incident",

                            value:
                                `#${result.incidentId}`,

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
                "❌ Erreur activation lockdown :",
                error
            );


            await message.reply(
                "❌ Impossible d'activer le lockdown.\n" +
                `\`${error.message}\``
            );
        }
    }
};