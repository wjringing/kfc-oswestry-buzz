/**
 * KFC Review Scheduler - Multi-location + Admin Heartbeat
 * Runs at 9am, 3pm, 9pm (Europe/London)
 * Heartbeat daily at 00:00, Weekly summary Sunday 21:00
 */

const cron = require("node-cron");
const axios = require("axios");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const os = require("os");

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SERPAPI_KEY || !TELEGRAM_BOT_TOKEN) {
  console.error("❌ Missing required environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TZ = "Europe/London";
const schedulerStart = Date.now();
let lastRunTime = null;

async function sendTelegram(chatId, message, parseMode = "HTML") {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: parseMode,
    });
  } catch (err) {
    console.error("🚨 Telegram send failed:", err.message);
  }
}

async function fetchAdminChatId() {
  const { data, error } = await supabase
    .from("locations")
    .select("telegram_chat_id")
    .is("place_id", null)
    .eq("active", true)
    .maybeSingle();

  if (error) console.error("❌ Failed to fetch admin chat ID:", error.message);
  return data ? data.telegram_chat_id : null;
}

async function fetchActiveLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, place_id, telegram_chat_id")
    .eq("active", true)
    .not("place_id", "is", null);

  if (error) {
    console.error("❌ Error fetching locations:", error.message);
    return [];
  }
  return data || [];
}

async function fetchGoogleReviews(placeId) {
  const url = `https://serpapi.com/search.json?engine=google_maps_reviews&hl=en&place_id=${placeId}&api_key=${SERPAPI_KEY}`;
  const { data } = await axios.get(url);
  return data.reviews || [];
}

async function insertReviews(location, reviews) {
  const { data: existing } = await supabase
    .from("reviews")
    .select("google_review_id")
    .eq("location_id", location.id);

  const existingIds = new Set(existing.map((r) => r.google_review_id));
  const newReviews = reviews.filter((r) => !existingIds.has(r.review_id));

  if (newReviews.length === 0) return 0;

  const formatted = newReviews.map((r) => ({
    location_id: location.id,
    google_review_id: r.review_id,
    author_name: r.author_title || r.author_name,
    profile_photo_url: r.profile_photo_url,
    rating: r.rating,
    review_text: r.text,
    review_date: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("reviews").insert(formatted);
  if (error) throw new Error(error.message);
  return formatted.length;
}

async function logSync(status, locationName, count, message = null) {
  await supabase.from("review_sync_logs").insert({
    status,
    message: message || status,
    inserted_count: count,
    review_count: count,
    created_at: new Date().toISOString(),
  });
}

async function runScheduler() {
  const adminChat = await fetchAdminChatId();
  const locations = await fetchActiveLocations();
  lastRunTime = new Date().toLocaleString("en-GB", { timeZone: TZ });

  for (const loc of locations) {
    try {
      const reviews = await fetchGoogleReviews(loc.place_id);
      const inserted = await insertReviews(loc, reviews);

      if (inserted > 0) {
        await sendTelegram(
          loc.telegram_chat_id,
          `✅ <b>${loc.name}</b>: ${inserted} new review${inserted > 1 ? "s" : ""} added ⭐`
        );
      } else {
        await sendTelegram(loc.telegram_chat_id, `ℹ️ <b>${loc.name}</b>: No new reviews found`);
      }

      await logSync("success", loc.name, inserted, "Sync completed");
    } catch (err) {
      console.error(`❌ Error syncing ${loc.name}:`, err.message);
      await logSync("error", loc.name, 0, err.message);
    }
  }

  if (adminChat)
    await sendTelegram(adminChat, `📦 Review sync completed for ${locations.length} location(s).`);
}

// --- Heartbeat @ 00:00 (London) ---
cron.schedule("0 0 * * *", async () => {
  const adminChat = await fetchAdminChatId();
  if (!adminChat) return;

  const uptimeMs = Date.now() - schedulerStart;
  const uptimeHrs = Math.floor(uptimeMs / 3600000);
  const uptimeDays = Math.floor(uptimeHrs / 24);
  const uptimeMins = Math.floor((uptimeMs % 3600000) / 60000);
  const memoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const msg = `✅ <b>Scheduler Heartbeat OK</b>\n` +
              `Uptime: ${uptimeDays}d ${uptimeHrs % 24}h ${uptimeMins}m\n` +
              `Last run: ${lastRunTime || "N/A"}\n` +
              `Next run: 09:00\n` +
              `Memory: ${memoryMB} MB`;

  await sendTelegram(adminChat, msg);
}, { timezone: TZ });

// --- Main schedule (9am, 3pm, 9pm London) ---
cron.schedule("0 9,15,21 * * *", runScheduler, { timezone: TZ });

// --- Weekly summary Sunday 21:00 ---
cron.schedule("0 21 * * 0", async () => {
  const adminChat = await fetchAdminChatId();
  if (!adminChat) return;

  const { data, error } = await supabase.rpc("get_weekly_review_counts");
  if (error) return console.error("Error fetching weekly counts:", error.message);

  const chartUrl = `https://quickchart.io/chart?c={type:'bar',data:{labels:${JSON.stringify(
    data.map((d) => d.day)
  )},datasets:[{label:'Reviews',data:${JSON.stringify(data.map((d) => d.count))}]}}`;

  await sendTelegram(adminChat, `📊 <b>Weekly Review Summary</b>\n${chartUrl}`);
}, { timezone: TZ });

// --- Immediate run with --force flag ---
if (process.argv.includes("--force")) {
  console.log("⚡ Running immediate review fetch (--force mode)...");
  runScheduler();
}

console.log("📅 Scheduler started. Will run at 9am, 3pm, 9pm daily.");
