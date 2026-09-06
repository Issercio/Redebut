const {
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const db = require("../../database/database");

// Empêche plusieurs synchronisations simultanées
const synchronizingGuilds = new Set();


// ===============================
// FONCTION SQLITE
// ===============================

function getAsync(query, params) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}


function runAsync(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve(this);
        });
    });
}


// ===============================
// COMMANDE
// ===============================

module.exports = {
    name: "syncmembers",

    description:
        "Synchronise les membres du serveur avec la base de données",

    async execute(message) {

        const { guild } = message;


        // ===============================
        // VÉRIFICATIONS
        // ===============================

        if (!guild) {
            return message.reply(
                "❌ Cette commande doit être utilisée sur un serveur."
            );
        }


        if (
            !message.member.permissions.has(
                PermissionFlagsBits.Administrator
            )
        ) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("🚫 Permission refusée")
                .setDescription(
                    "Tu dois posséder la permission **Administrateur** pour utiliser cette commande."
                )
                .setFooter({
                    text: "MiyuBot • Sécurité"
                });

            return message.reply({
                embeds: [embed]
            });
        }


        // ===============================
        // EMPÊCHE LES DOUBLES SYNCS
        // ===============================

        if (synchronizingGuilds.has(guild.id)) {

            const embed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle("⏳ Synchronisation déjà en cours")
                .setDescription(
                    "Une synchronisation est déjà en cours sur ce serveur.\n" +
                    "Merci d'attendre qu'elle soit terminée."
                )
                .setFooter({
                    text: "MiyuBot"
                });

            return message.reply({
                embeds: [embed]
            });
        }


        synchronizingGuilds.add(guild.id);


        const startTime = Date.now();


        // ===============================
        // MESSAGE DE DÉPART
        // ===============================

        const startEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🔄 Synchronisation des membres")
            .setDescription(
                "MiyuBot récupère actuellement les membres du serveur..."
            )
            .addFields(
                {
                    name: "📌 Serveur",
                    value: guild.name,
                    inline: true
                },
                {
                    name: "⏳ Statut",
                    value: "Initialisation...",
                    inline: true
                }
            )
            .setFooter({
                text: "MiyuBot • Synchronisation"
            })
            .setTimestamp();


        const statusMessage = await message.reply({
            embeds: [startEmbed]
        });


        try {

            // ===============================
            // RÉCUPÉRATION DES MEMBRES
            // ===============================

            const members = await guild.members.fetch();

            const humanMembers = [
                ...members.values()
            ].filter((member) => !member.user.bot);


            // ===============================
            // STATISTIQUES
            // ===============================

            let processed = 0;
            let added = 0;
            let alreadyExists = 0;
            let errors = 0;


            // ===============================
            // SYNCHRONISATION
            // ===============================

            for (const member of humanMembers) {

                processed++;

                const username =
                    member.nickname ||
                    member.user.username;


                try {

                    // Vérifie si ce pseudo existe déjà
                    const existing = await getAsync(
                        `
                        SELECT id
                        FROM username_history
                        WHERE guild_id = ?
                        AND user_id = ?
                        AND username = ?
                        LIMIT 1
                        `,
                        [
                            guild.id,
                            member.id,
                            username
                        ]
                    );


                    if (existing) {

                        alreadyExists++;

                    } else {

                        await runAsync(
                            `
                            INSERT INTO username_history
                            (
                                guild_id,
                                user_id,
                                username,
                                recorded_at
                            )
                            VALUES (?, ?, ?, ?)
                            `,
                            [
                                guild.id,
                                member.id,
                                username,
                                Date.now()
                            ]
                        );


                        added++;
                    }


                } catch (error) {

                    errors++;

                    console.error(
                        `❌ Erreur synchronisation membre ${member.id}:`,
                        error
                    );
                }
            }


            // ===============================
            // CALCUL DU TEMPS
            // ===============================

            const duration =
                ((Date.now() - startTime) / 1000)
                    .toFixed(2);


            // ===============================
            // EMBED FINAL
            // ===============================

            const successEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle("✅ Synchronisation terminée")
                .setDescription(
                    "Les informations des membres ont été vérifiées et synchronisées avec succès."
                )
                .addFields(
                    {
                        name: "👥 Membres analysés",
                        value: `${humanMembers.length}`,
                        inline: true
                    },
                    {
                        name: "📝 Nouveaux pseudos",
                        value: `${added}`,
                        inline: true
                    },
                    {
                        name: "📚 Déjà enregistrés",
                        value: `${alreadyExists}`,
                        inline: true
                    },
                    {
                        name: "❌ Erreurs",
                        value: `${errors}`,
                        inline: true
                    },
                    {
                        name: "⏱️ Durée",
                        value: `${duration} seconde(s)`,
                        inline: true
                    },
                    {
                        name: "📊 Résultat",
                        value:
                            errors === 0
                                ? "Synchronisation réussie"
                                : "Synchronisation terminée avec des erreurs",
                        inline: true
                    }
                )
                .setFooter({
                    text: `MiyuBot • Demandé par ${message.author.username}`
                })
                .setTimestamp();


            await statusMessage.edit({
                embeds: [successEmbed]
            });


            console.log(
                `✅ Synchronisation terminée sur "${guild.name}" | ` +
                `${humanMembers.length} membres | ` +
                `${added} ajoutés | ` +
                `${duration}s`
            );


        } catch (error) {

            console.error(
                "❌ Erreur générale pendant la synchronisation :",
                error
            );


            const errorEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("❌ Erreur de synchronisation")
                .setDescription(
                    "Une erreur inattendue est survenue pendant la synchronisation.\n\n" +
                    "L'erreur a été enregistrée dans les logs de MiyuBot."
                )
                .setFooter({
                    text: "MiyuBot • Erreur"
                })
                .setTimestamp();


            await statusMessage.edit({
                embeds: [errorEmbed]
            });


        } finally {

            // Retire le verrou
            synchronizingGuilds.delete(guild.id);

        }
    }
};