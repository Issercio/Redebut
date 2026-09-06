const tmi = require("tmi.js");

require("dotenv").config({
	override: true
});

const twitchEnabled =
	["1", "true", "yes", "on"].includes(
		(process.env.TWITCH_ENABLED || "").trim().toLowerCase()
	);

if (!twitchEnabled) {

	console.log(
		"[TWITCH] Module désactivé (TWITCH_ENABLED=false)"
	);

	module.exports = {
		enabled: false,
		client: null
	};

	return;
}

const requiredEnvVars = [
	"TWITCH_USERNAME",
	"TWITCH_OAUTH_TOKEN",
	"TWITCH_CHANNEL"
];

const missingVars =
	requiredEnvVars.filter(
		(name) => !process.env[name] || !process.env[name].trim()
	);

if (missingVars.length > 0) {

	console.warn(
		"[TWITCH] Module désactivé. Variables manquantes :",
		missingVars.join(", ")
	);

	module.exports = {
		enabled: false,
		client: null
	};

	return;
}

const twitchUsername =
	process.env.TWITCH_USERNAME.trim();

const oauthToken =
	process.env.TWITCH_OAUTH_TOKEN
		.trim()
		.startsWith("oauth:")
		? process.env.TWITCH_OAUTH_TOKEN.trim()
		: `oauth:${process.env.TWITCH_OAUTH_TOKEN.trim()}`;

const twitchChannel =
	process.env.TWITCH_CHANNEL
		.trim()
		.replace(/^#/, "");

const client = new tmi.Client({
	options: {
		debug: false
	},
	identity: {
		username: twitchUsername,
		password: oauthToken
	},
	channels: [
		twitchChannel
	],
	connection: {
		reconnect: true,
		secure: true
	}
});

let isConnected = false;

function getErrorText(error) {

	if (!error) {
		return "erreur inconnue";
	}

	if (typeof error === "string") {
		return error;
	}

	if (error.message) {
		return error.message;
	}

	return JSON.stringify(error);
}

async function sendChatMessage(
	channel,
	message,
	allowRetry = true
) {
	const targetChannel =
		String(channel || "").startsWith("#")
			? String(channel)
			: `#${twitchChannel}`;

	try {
		await client.say(
			targetChannel,
			message
		);

		console.log(
			`[TWITCH] Message envoyé sur ${targetChannel}: ${message}`
		);

		return true;
	} catch (error) {
		console.error(
			`[TWITCH] Erreur envoi message sur ${targetChannel}:`,
			getErrorText(error)
		);

		if (!allowRetry) {
			return false;
		}

		console.warn(
			"[TWITCH] Retry envoi message..."
		);

		return sendChatMessage(
			targetChannel,
			message,
			false
		);
	}
}

client.on(
	"connected",
	(
		address,
		port
	) => {

		isConnected = true;

		console.log(
			`[TWITCH] Connecté sur ${address}:${port} - canal #${twitchChannel}`
		);
	}
);

client.on(
	"disconnected",
	(reason) => {

		isConnected = false;

		console.warn(
			`[TWITCH] Déconnecté : ${reason}`
		);
	}
);

client.on(
	"reconnect",
	() => {

		console.log(
			"[TWITCH] Reconnexion en cours..."
		);
	}
);

client.on(
	"message",
	(
		channel,
		tags,
		message,
		self
	) => {
		const normalizedMessage =
			String(message || "")
				.trim()
				.toLowerCase();

		if (!normalizedMessage.startsWith("!ping")) {
			return;
		}

		// Permet de tester !ping même si le message vient du compte bot.
		if (self) {
			console.log(
				"[TWITCH] !ping détecté depuis le compte bot"
			);
		}

		const requester =
			tags["display-name"] ||
			tags.username ||
			"utilisateur";

		console.log(
			`[TWITCH] Commande !ping détectée sur ${channel} par ${requester}`
		);

		sendChatMessage(
			channel,
			`@${requester} Pong ! MiyuBot Twitch est en ligne.`
		).catch(
			(error) => {
				console.error(
					"[TWITCH] Erreur inattendue !ping :",
					getErrorText(error)
				);
			}
		);
	}
);

client.connect().catch(
	(error) => {

		console.error(
			"[TWITCH] Échec de connexion :",
			getErrorText(error)
		);
	}
);

async function shutdownTwitch() {

	if (!isConnected) {
		return;
	}

	try {

		await client.disconnect();

		console.log(
			"[TWITCH] Déconnexion propre effectuée"
		);

	} catch (error) {

		console.error(
			"[TWITCH] Erreur pendant la déconnexion :",
			error.message
		);
	}
}

module.exports = {
	enabled: true,
	client,
	shutdownTwitch
};
