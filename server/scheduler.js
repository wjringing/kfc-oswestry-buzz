// scheduler.cjs
const cron = require("node-cron");
const dotenv = require("dotenv");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// Load environment variables
dotenv.config();
const {
  SUPABASE_SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL,
  SERPAPI_KEY,
  PLACE_ID,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} = process.env;

// Validate env vars
if (!SUPABASE_SERVICE_ROLE_KEY || !VITE_SUPABASE_URL || !SERPAPI_KEY || !PLACE_ID) {
  console.error("❌ Missing required environment variables.");
  process.exit(1);
}

// Supabase client
const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Telegram message sender
async function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    });
  } catch (err) {
    console.error("🚨 Telegram send failed:", err.message);
  }
}

// Fetch Google reviews via SerpAPI
async function fetchReviews() {
  const url = `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${PLACE_ID}&api_key=${SERPAPI_KEY}`;
  const { data } = await axios.get(url);
  return (data.reviews || []).map((r) => ({
    google_review_id: r.review_id,
    author_name: r.user?.name || null,
    author_photo_url: r.user?.thumbnail || null,
    rating: r.rating || null,
    review_text: r.text || null,
    review_date: r.time ? new Date(r.time * 1000).toISOString() : null,
    fetched_at: new Date().toISOString(),
  }));
}

// Insert only new reviews and log the results
async function syncReviews(trigger = "auto") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Fetching Google reviews...`);

  try {
    const reviews = await fetchReviews();
    if (!reviews.length) {
      console.log("⚠️ No reviews returned from SerpAPI.");
      await supabase.from("review_sync_logs").insert({
        created_at: new Date().toISOString(),
        status: "empty",
        review_count: 0,
        inserted_count: 0,
        message: "No reviews returned from SerpAPI.",
      });
      await sendTelegramNotification("⚠️ No reviews returned from SerpAPI.");
      return;
    }

    const { data: existing, error: fetchError } = await supabase
      .from("reviews")
      .select("google_review_id");
    if (fetchError) throw fetchError;

    const existingIds = new Set(existing.map((r) => r.google_review_id));
    const newReviews = reviews.filter((r) => !existingIds.has(r.google_review_id));

    if (newReviews.length > 0) {
      const { error: insertError } = await supabase.from("reviews").insert(newReviews);
      if (insertError) throw insertError;
      console.log(`✅ Inserted ${newReviews.length} new reviews into Supabase.`);

      await supabase.from("review_sync_logs").insert({
        created_at: new Date().toISOString(),
        status: "success",
        review_count: reviews.length,
        inserted_count: newReviews.length,
        message: `Inserted ${newReviews.length} new reviews (${trigger}).`,
      });

      await sendTelegramNotification(`⭐ ${newReviews.length} new Google review(s) added!`);
    } else {
      console.log("📭 No new reviews found.");
      await supabase.from("review_sync_logs").insert({
        created_at: new Date().toISOString(),
        status: "no_new_reviews",
        review_count: reviews.length,
        inserted_count: 0,
        message: `No new reviews found (${trigger}).`,
      });
      await sendTelegramNotification("📭 No new reviews found.");
    }
  } catch (err) {
    console.error("❌ Error fetching/syncing:", err.message);
    await supabase.from("review_sync_logs").insert({
      created_at: new Date().toISOString(),
      status: "error",
      review_count: 0,
      inserted_count: 0,
      message: err.message,
    });
    await sendTelegramNotification(`🚨 Error fetching reviews: ${err.message}`);
  }
}

// Generate daily or weekly summary
async function sendSummary(type = "day") {
  const now = new Date();
  const start =
    type === "week"
      ? new Date(now.setDate(now.getDate() - now.getDay())) // start of week (Sunday)
      : new Date(now.setHours(0, 0, 0, 0)); // start of today

  const { data, error } = await supabase
    .from("review_sync_logs")
    .select("inserted_count, created_at")
    .gte("created_at", start.toISOString());

  if (error) {
    console.error("Summary query failed:", error.message);
    return;
  }

  const total = data.reduce((sum, r) => sum + (r.inserted_count || 0), 0);
  const label = type === "week" ? "this week" : "today";

  await supabase.from("review_sync_logs").insert({
    created_at: new Date().toISOString(),
    status: `summary_${type}`,
    review_count: data.length,
    inserted_count: total,
    message: `📊 Summary: ${total} new reviews ${label}.`,
  });

  await sendTelegramNotification(`📊 Summary: ${total} new reviews ${label}.`);
}

// Send heartbeat ping at midnight
async function sendHeartbeat() {
  const now = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  await sendTelegramNotification(`💤 Heartbeat OK – scheduler alive at ${now}`);
  console.log(`[${now}] ✅ Heartbeat sent`);
}

// Scheduler setup
async function runScheduler() {
  console.log("📅 Scheduler started. Will run at 9am, 3pm, 9pm & midnight daily.");
  await sendTelegramNotification("🕓 Scheduler started on review.ringing.org.uk ✅");

  // 9am: sync + weekly summary
  cron.schedule("0 9 * * *", async () => {
    await syncReviews("9am");
    await sendSummary("week");
  });

  // 3pm: mid-day sync only
  cron.schedule("0 15 * * *", async () => {
    await syncReviews("3pm");
  });

  // 9pm: sync + daily summary
  cron.schedule("0 21 * * *", async () => {
    await syncReviews("9pm");
    await sendSummary("day");
  });

  // Midnight heartbeat
  cron.schedule("0 0 * * *", async () => {
    await sendHeartbeat();
  });

  // Manual trigger
  if (process.argv.includes("--force")) {
    console.log("⚡ Running immediate review fetch (--force mode)...");
    await syncReviews("manual");
  }
}

// Start scheduler
runScheduler();
