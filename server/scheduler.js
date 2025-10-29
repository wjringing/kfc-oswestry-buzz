// server/scheduler.cjs
import dotenv from "dotenv";
import cron from "node-cron";
import os from "os";
import process from "process";
import { exec } from "child_process";
import pkg from "@supabase/supabase-js";

dotenv.config({ path: "/var/www/review.ringing.org.uk/.env" });

const { createClient } = pkg;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TIMEZONE = "Europe/London";

// ------------------------------------------------------
// 📡 Telegram sender
// ------------------------------------------------------
async function sendTelegram(chatId, message, extra = {}) {
  if (!chatId || !BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        ...extra,
      }),
    });
  } catch (err) {
    console.error("🚨 Telegram send failed:", err.message);
  }
}

// ------------------------------------------------------
// 📊 Fetch weekly summary data
// ------------------------------------------------------
async function getWeeklySummary() {
  const { data, error } = await supabase.rpc("get_weekly_review_counts");
  if (error) {
    console.error("Error fetching weekly summary:", error.message);
    return null;
  }
  return data;
}

// ------------------------------------------------------
// 📈 Generate chart using QuickChart
// ------------------------------------------------------
async function generateWeeklyChart() {
  const data = await getWeeklySummary();
  if (!data || data.length === 0) return null;

  const labels = data.map((d) => d.day);
  const counts = data.map((d) => d.count);

  const totalThisWeek = counts[counts.length - 1];
  const lastWeek = counts[counts.length - 2] || 0;
  const percentChange = lastWeek ? (((totalThisWeek - lastWeek) / lastWeek) * 100).toFixed(1) : 0;

  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(
    JSON.stringify({
      type: "bar",
      data: { labels, datasets: [{ label: "Reviews per Day", data: counts }] },
      options: {
        plugins: {
          title: { display: true, text: "Weekly Review Trend" },
        },
      },
    })
  )}`;

  const summary = `📊 *Weekly Summary*\n🗓️ Total this week: *${totalThisWeek}*\n📈 Change vs last week: *${percentChange}%*`;

  return { chartUrl, summary };
}

// ------------------------------------------------------
// 💬 Send daily / weekly messages per location
// ------------------------------------------------------
async function sendDailySummary() {
  const { data: locations } = await supabase.from("locations").select("*").eq("active", true);
  if (!locations || locations.length === 0) return;

  for (const loc of locations) {
    if (!loc.chat_id) continue;

    // Fetch total reviews today
    const { data: daily } = await supabase.rpc("get_daily_review_counts");
    const todayCount = daily?.[daily.length - 1]?.count || 0;

    const msg =
      todayCount > 0
        ? `⭐ *Daily Summary*\n🏪 ${loc.name}\n📅 *${todayCount}* new reviews today!`
        : `📅 *Daily Summary*\n🏪 ${loc.name}\nNo new reviews today.`;

    await sendTelegram(loc.chat_id, msg);
  }
}

// ------------------------------------------------------
// 🕐 Heartbeat message at midnight
// ------------------------------------------------------
async function sendHeartbeat() {
  const { data: admin } = await supabase.from("locations").select("*").is("place_id", null).maybeSingle();
  if (!admin || !admin.chat_id) return;

  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

  const message = `✅ *Scheduler Heartbeat OK*\nUptime: ${days}d ${hours}h ${minutes}m\nMemory: ${mem} MB\nNext run: 09:00 / 15:00 / 21:00`;
  await sendTelegram(admin.chat_id, message);
}

// ------------------------------------------------------
// 📅 Weekly summary (Sunday 21:00)
// ------------------------------------------------------
async function sendWeeklySummary() {
  const { data: admin } = await supabase.from("locations").select("*").is("place_id", null).maybeSingle();
  if (!admin || !admin.chat_id) return;

  const chart = await generateWeeklyChart();
  if (!chart) return;

  await sendTelegram(admin.chat_id, `${chart.summary}\n\n🖼️ [View chart](${chart.chartUrl})`);
}

// ------------------------------------------------------
// 🔁 Scheduler main entry
// ------------------------------------------------------
async function runScheduler() {
  const now = new Date().toLocaleString("en-GB", { timeZone: TIMEZONE });
  console.log(`[${now}] Scheduler tick.`);

  // Placeholder: here’s where review syncing would happen
  console.log("Would run review sync for all locations...");
}

// ------------------------------------------------------
// 🕓 Cron jobs (Europe/London)
// ------------------------------------------------------
console.log("📅 Scheduler started (Europe/London)");
cron.schedule("0 9,15,21 * * *", runScheduler, { timezone: TIMEZONE }); // fetch reviews
cron.schedule("0 0 * * *", sendHeartbeat, { timezone: TIMEZONE }); // heartbeat midnight
cron.schedule("0 21 * * *", sendDailySummary, { timezone: TIMEZONE }); // daily summary 21:00
cron.schedule("0 21 * * 0", sendWeeklySummary, { timezone: TIMEZONE }); // Sunday 21:00
