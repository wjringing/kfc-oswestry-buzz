import { exec } from "child_process";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PROCESS_NAME = "kfc-scheduler";

function sendTelegram(msg) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg }),
  }).catch(console.error);
}

exec(`pm2 jlist`, (err, stdout) => {
  if (err) return;
  try {
    const processes = JSON.parse(stdout);
    const app = processes.find(p => p.name === PROCESS_NAME);
    if (app && app.pm2_env.status === "online") {
      sendTelegram(`✅ PM2 process *${PROCESS_NAME}* is running normally.`);
    } else {
      sendTelegram(`🚨 PM2 process *${PROCESS_NAME}* is NOT running!`);
    }
  } catch (e) {
    console.error(e);
  }
});
