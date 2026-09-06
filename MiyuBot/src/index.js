console.log("🚀 Démarrage de MiyuBot...");

require("dotenv").config();

const discordClient = require("./discord");
const twitchRuntime = require("./twitch");

let shutdownInProgress = false;

async function shutdownAll(signal) {

	if (shutdownInProgress) {
		return;
	}

	shutdownInProgress = true;

	console.log(`🛑 Arrêt demandé (${signal})...`);

	try {

		if (twitchRuntime && twitchRuntime.enabled && typeof twitchRuntime.shutdownTwitch === "function") {
			await twitchRuntime.shutdownTwitch();
		}

		if (discordClient && typeof discordClient.destroy === "function") {
			discordClient.destroy();
			console.log("[DISCORD] Déconnexion propre effectuée");
		}

	} catch (error) {

		console.error("❌ Erreur pendant l'arrêt :", error);

	} finally {
		process.exit(0);
	}
}

process.on("SIGINT", () => shutdownAll("SIGINT"));
process.on("SIGTERM", () => shutdownAll("SIGTERM"));