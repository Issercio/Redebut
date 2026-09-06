const {
    ChannelType,
    PermissionsBitField
} = require("discord.js");

const {
    run,
    get,
    all
} = require("../database/database");


// ==========================================
// ACTIVER LE LOCKDOWN
// ==========================================

async function activateLockdown(
    guild,
    reason,
    metadata = {}
) {

    if (!guild) {

        throw new Error(
            "Serveur Discord invalide."
        );
    }


    // ======================================
    // PERMISSION DU BOT
    // ======================================

    const botMember =
        guild.members.me;


    if (
        !botMember ||
        !botMember.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        )
    ) {

        throw new Error(
            "MiyuBot n'a pas la permission Gérer les salons."
        );
    }


    // ======================================
    // CONFIGURATION
    // ======================================

    let settings =
        await get(
            `
            SELECT *
            FROM guild_settings
            WHERE guild_id = ?
            `,
            [
                guild.id
            ]
        );


    if (!settings) {

        const now =
            Date.now();


        await run(
            `
            INSERT INTO guild_settings (
                guild_id,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?)
            `,
            [
                guild.id,
                now,
                now
            ]
        );


        settings =
            await get(
                `
                SELECT *
                FROM guild_settings
                WHERE guild_id = ?
                `,
                [
                    guild.id
                ]
            );
    }


    // ======================================
    // DÉJÀ ACTIF
    // ======================================

    if (
        Number(
            settings.lockdown_active
        ) === 1
    ) {

        return {
            alreadyActive: true,
            protectedChannels: 0,
            failedChannels: 0,
            incidentId: null
        };
    }


    const now =
        Date.now();


    // ======================================
    // NETTOYER LES ANCIENNES SAUVEGARDES
    // ======================================

    await run(
        `
        DELETE FROM lockdown_permissions
        WHERE guild_id = ?
        `,
        [
            guild.id
        ]
    );


    // ======================================
    // SALONS
    // ======================================

    const channels =
        guild.channels.cache.filter(
            (channel) =>
                channel.type ===
                    ChannelType.GuildText ||
                channel.type ===
                    ChannelType.GuildAnnouncement ||
                channel.type ===
                    ChannelType.GuildForum
        );


    const everyoneRole =
        guild.roles.everyone;


    let protectedChannels = 0;
    let failedChannels = 0;


    // ======================================
    // VERROUILLAGE
    // ======================================

    for (
        const channel of channels.values()
    ) {

        try {

            const overwrite =
                channel.permissionOverwrites.cache.get(
                    everyoneRole.id
                );


            // ==================================
            // OVERWRITE EXISTANT
            // ==================================

            if (overwrite) {

                await run(
                    `
                    INSERT INTO lockdown_permissions (
                        guild_id,
                        channel_id,
                        role_id,
                        had_overwrite,
                        allow_bits,
                        deny_bits,
                        created_at,
                        restored
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                    `,
                    [
                        guild.id,
                        channel.id,
                        everyoneRole.id,
                        1,
                        overwrite.allow.bitfield.toString(),
                        overwrite.deny.bitfield.toString(),
                        now
                    ]
                );

            } else {

                /*
                 * "0" est volontaire.
                 *
                 * Certaines anciennes versions de la
                 * table utilisaient NOT NULL sur allow_bits
                 * et deny_bits.
                 *
                 * had_overwrite = 0 indique qu'il faudra
                 * supprimer l'overwrite au moment du unlock.
                 */

                await run(
                    `
                    INSERT INTO lockdown_permissions (
                        guild_id,
                        channel_id,
                        role_id,
                        had_overwrite,
                        allow_bits,
                        deny_bits,
                        created_at,
                        restored
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                    `,
                    [
                        guild.id,
                        channel.id,
                        everyoneRole.id,
                        0,
                        "0",
                        "0",
                        now
                    ]
                );
            }


            // ==================================
            // APPLICATION DU LOCKDOWN
            // ==================================

            await channel.permissionOverwrites.edit(
                everyoneRole,
                {
                    SendMessages: false,
                    AddReactions: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false
                },
                {
                    reason
                }
            );


            protectedChannels++;

        } catch (error) {

            failedChannels++;


            console.error(
                `❌ Lockdown ${channel.name}:`,
                error.message
            );
        }
    }


    // ======================================
    // ÉTAT LOCKDOWN
    // ======================================

    await run(
        `
        UPDATE guild_settings

        SET
            lockdown_active = 1,
            updated_at = ?

        WHERE guild_id = ?
        `,
        [
            now,
            guild.id
        ]
    );


    // ======================================
    // INCIDENT
    // ======================================

    const incident =
        await run(
            `
            INSERT INTO security_incidents (

                guild_id,
                incident_type,
                severity,
                description,
                metadata,
                status,
                detected_at

            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                guild.id,
                "lockdown",
                metadata.severity || "high",
                reason,
                JSON.stringify({
                    ...metadata,

                    channels_protected:
                        protectedChannels,

                    channels_failed:
                        failedChannels
                }),
                "active",
                now
            ]
        );


    console.log(
        `🔒 Lockdown activé sur ${guild.name} ` +
        `| ${protectedChannels} salons protégés`
    );


    return {
        alreadyActive: false,

        protectedChannels,

        failedChannels,

        incidentId:
            incident.lastID
    };
}


// ==========================================
// DÉSACTIVER LE LOCKDOWN
// ==========================================

async function deactivateLockdown(
    guild,
    reason,
    resolvedBy
) {

    if (!guild) {

        throw new Error(
            "Serveur Discord invalide."
        );
    }


    const settings =
        await get(
            `
            SELECT *
            FROM guild_settings
            WHERE guild_id = ?
            `,
            [
                guild.id
            ]
        );


    if (
        !settings ||
        Number(
            settings.lockdown_active
        ) === 0
    ) {

        return {
            alreadyInactive: true,
            restoredChannels: 0,
            failedChannels: 0
        };
    }


    // ======================================
    // RÉCUPÉRER LES PERMISSIONS
    // ======================================

    const savedPermissions =
        await all(
            `
            SELECT *
            FROM lockdown_permissions

            WHERE guild_id = ?

            AND restored = 0

            ORDER BY id ASC
            `,
            [
                guild.id
            ]
        );


    const now =
        Date.now();


    let restoredChannels = 0;
    let failedChannels = 0;


    // ======================================
    // RESTAURATION
    // ======================================

    for (
        const permission
            of savedPermissions
    ) {

        try {

            const channel =
                guild.channels.cache.get(
                    permission.channel_id
                );


            // ==================================
            // SALON SUPPRIMÉ
            // ==================================

            if (!channel) {

                await run(
                    `
                    UPDATE lockdown_permissions

                    SET
                        restored = 1,
                        restored_at = ?

                    WHERE id = ?
                    `,
                    [
                        now,
                        permission.id
                    ]
                );

                continue;
            }


            // ==================================
            // OVERWRITE EXISTANT
            // ==================================

            if (
                Number(
                    permission.had_overwrite
                ) === 1
            ) {

                const allow =
                    new PermissionsBitField(
                        BigInt(
                            permission.allow_bits
                        )
                    );


                const deny =
                    new PermissionsBitField(
                        BigInt(
                            permission.deny_bits
                        )
                    );


                await channel.permissionOverwrites.edit(
                    permission.role_id,
                    {
                        allow,
                        deny
                    },
                    {
                        reason
                    }
                );

            } else {

                // ==================================
                // PAS D'OVERWRITE AVANT
                // ON SUPPRIME CELUI DU LOCKDOWN
                // ==================================

                await channel.permissionOverwrites.delete(
                    permission.role_id,
                    reason
                );
            }


            // ==================================
            // MARQUER RESTAURÉ
            // ==================================

            await run(
                `
                UPDATE lockdown_permissions

                SET
                    restored = 1,
                    restored_at = ?

                WHERE id = ?
                `,
                [
                    now,
                    permission.id
                ]
            );


            restoredChannels++;

        } catch (error) {

            failedChannels++;


            console.error(
                `❌ Restauration ${permission.channel_id}:`,
                error.message
            );
        }
    }


    // ======================================
    // DÉSACTIVER LOCKDOWN
    // ======================================

    await run(
        `
        UPDATE guild_settings

        SET
            lockdown_active = 0,
            updated_at = ?

        WHERE guild_id = ?
        `,
        [
            now,
            guild.id
        ]
    );


    // ======================================
    // RÉSOUDRE INCIDENTS
    // ======================================

    await run(
        `
        UPDATE security_incidents

        SET
            status = 'resolved',
            resolved_at = ?,
            resolved_by = ?

        WHERE guild_id = ?

        AND incident_type = 'lockdown'

        AND status = 'active'
        `,
        [
            now,
            resolvedBy || null,
            guild.id
        ]
    );


    console.log(
        `🔓 Lockdown désactivé sur ${guild.name} ` +
        `| ${restoredChannels} salons restaurés`
    );


    return {
        alreadyInactive: false,

        restoredChannels,

        failedChannels
    };
}


module.exports = {
    activateLockdown,
    deactivateLockdown
};