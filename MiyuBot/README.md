# MiyuBot

MiyuBot est un bot de securite pour Discord et Twitch.

## Installation

```bash
npm install
```

## Configuration de l'environnement

Copie `.env.example` vers `.env` puis renseigne les valeurs.

Obligatoire:
- `DISCORD_TOKEN`

Optionnel pour Twitch:
- `TWITCH_ENABLED=true` pour activer Twitch
- `TWITCH_USERNAME`
- `TWITCH_OAUTH_TOKEN`
- `TWITCH_CHANNEL`

Si Twitch est desactive ou non configure, Discord continue de fonctionner.

## Lancement local

```bash
npm start
```

Scripts utiles:
- `npm run start:discord`
- `npm run start:twitch`
- `npm run dev`

## Lancement 24/7 sans VS Code (PM2)

```bash
npm install -g pm2
npm run pm2:start
pm2 save
pm2 startup
```

Apres `pm2 startup`, execute la commande affichee par PM2.

Scripts PM2 utiles:
- `npm run pm2:logs`
- `npm run pm2:restart`
- `npm run pm2:stop`

## Verification production pour un serveur de 50 membres

Lance ces commandes administrateur dans Discord:

```text
!setupcheck
!config show
!securitylogs test
!cases recent 10
```

Exemple de configuration recommandee:

```text
!config raid threshold 6
!config raid window 20
!config spam threshold 6
!config spam window 8
!config spam sanction ban
!config antinuke on
!config antinuke threshold channel 3
!config antinuke threshold role 3
!config antinuke threshold webhook 2
!config antinuke threshold ban 3
```

## Profil croissance (50 -> 100K membres)

Utilise ce profil si ton serveur grandit fortement:

```text
!config raid threshold 10
!config raid window 20
!config spam threshold 7
!config spam window 8
!config spam sanction ban
!config antinuke on
!config antinuke threshold channel 4
!config antinuke threshold role 4
!config antinuke threshold webhook 2
!config antinuke threshold ban 4
!config antinuke window 15
!config antinuke sanction ban
```

Bonnes pratiques exploitation:
- Lance `!setupcheck` apres chaque gros changement de permissions.
- Verifie `!cases recent 20` tous les jours au debut.
- Surveille `npm run pm2:logs` pour detecter les erreurs rapidement.
- Garde un seul process bot actif (pas de double instance).

Exemple de configuration quarantaine:

```text
!config quarantine on
!config quarantine role @quarantine
!config quarantine age 7
```

## Securite

- Ne partage jamais les tokens de `.env`.
- Regenerate immediatement un token expose.
- Place le role du bot au-dessus des membres qu'il doit moderer.
