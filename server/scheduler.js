import cron from "node-cron";
import { fetchGoogleReviews } from "./googleReviews.js";
import { sendTelegramMessage } from "./telegram.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

const REVIEW_TRACKER_FILE = "./lastReviews.json";

function getLastReviews() {
  try {
    if (existsSync(REVIEW_TRACKER_FILE)) {
      const data = readFileSync(REVIEW_TRACKER_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading review tracker:", err.message);
  }
  return [];
}

function saveLastReviews(reviews) {
  try {
    writeFileSync(REVIEW_TRACKER_FILE, JSON.stringify(reviews, null, 2));
  } catch (err) {
    console.error("Error saving review tracker:", err.message);
  }
}

async function runJob() {
  try {
    console.log(`[${new Date().toISOString()}] Fetching Google reviews...`);
    const reviews = await fetchGoogleReviews();

    if (!reviews.length) {
      console.log("No reviews found from API.");
      await sendTelegramMessage("ℹ️ <b>Review Check Complete</b>\n\nNo reviews found at this time.");
      return;
    }

    // Get previously seen reviews
    const lastReviews = getLastReviews();
    const lastReviewIds = new Set(lastReviews.map(r => `${r.user}_${r.date}`));
    
    // Find new reviews
    const newReviews = reviews.filter(r => {
      const reviewId = `${r.user}_${r.date}`;
      return !lastReviewIds.has(reviewId);
    });

    if (newReviews.length === 0) {
      console.log("No new reviews since last check.");
      await sendTelegramMessage("✅ <b>Review Check Complete</b>\n\nNo new reviews since last check.");
    } else {
      const latest = newReviews.slice(0, 10); // Show up to 10 new reviews
      let msg = `⭐ <b>New Google Reviews for KFC Oswestry</b> ⭐\n\n`;
      msg += `📊 <b>${newReviews.length} new review${newReviews.length > 1 ? 's' : ''}</b> found\n\n`;
      
      for (const r of latest) {
        msg += `👤 <b>${r.user || "Anonymous"}</b>\n⭐ ${r.rating}/5\n"${r.snippet || ""}"\n🕒 ${r.date}\n\n`;
      }

      if (newReviews.length > 10) {
        msg += `... and ${newReviews.length - 10} more\n`;
      }

      await sendTelegramMessage(msg);
      console.log(`✅ Sent ${newReviews.length} new reviews to Telegram.`);
    }

    // Save current reviews for next comparison
    saveLastReviews(reviews.slice(0, 50)); // Keep last 50 reviews
  } catch (err) {
    console.error("❌ Error running scheduled job:", err.message);
  }
}

// Run immediately on startup
runJob();

// Schedule for 9am, 3pm, and 9pm daily
cron.schedule("0 9,15,21 * * *", runJob);

console.log("📅 Scheduler started. Will run at 9am, 3pm, and 9pm daily.");
