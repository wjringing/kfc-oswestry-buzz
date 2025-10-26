import cron from "node-cron";
import { fetchGoogleReviews } from "./googleReviews.js";
import { sendTelegramMessage } from "./telegram.js";
import dotenv from "dotenv";
dotenv.config();

async function runJob() {
  try {
    console.log(`[${new Date().toISOString()}] Fetching Google reviews...`);
    const reviews = await fetchGoogleReviews();

    if (!reviews.length) {
      console.log("No reviews found.");
      return;
    }

    const latest = reviews.slice(0, 3);
    let msg = `⭐ <b>Latest Google Reviews for KFC Oswestry</b> ⭐\n\n`;
    for (const r of latest) {
      msg += `👤 <b>${r.user || "Anonymous"}</b>\n⭐ ${r.rating}/5\n"${r.snippet || ""}"\n🕒 ${r.date}\n\n`;
    }

    await sendTelegramMessage(msg);
    console.log("✅ Sent review update to Telegram.");
  } catch (err) {
    console.error("❌ Error running scheduled job:", err.message);
  }
}

// Run once at start and then at 3 pm & 9 pm daily
runJob();
cron.schedule("0 15,21 * * *", runJob);
