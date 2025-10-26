#!/bin/bash
set -e

# === CONFIGURATION ===
APP_DIR="/var/www/review.ringing.org.uk"
DOMAIN="review.ringing.org.uk"
REPO_URL="https://github.com/wjringing/kfc-oswestry-buzz.git"
NODE_VERSION="20"

# === FUNCTIONS ===
function log() { echo -e "\n\033[1;34m$1\033[0m\n"; }

# === SYSTEM SETUP ===
log "🔧 Updating system and installing dependencies..."
sudo apt update -y && sudo apt upgrade -y
sudo apt install -y git curl ufw nginx certbot python3-certbot-nginx jq

# === NODE INSTALL ===
if ! command -v node >/dev/null 2>&1; then
  log "📦 Installing Node.js v$NODE_VERSION..."
  curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# === CLONE OR UPDATE REPO ===
if [ ! -d "$APP_DIR" ]; then
  log "📥 Cloning repo..."
  sudo git clone "$REPO_URL" "$APP_DIR"
else
  log "📂 Repo already exists, pulling latest changes..."
  cd "$APP_DIR"
  sudo git pull
fi

cd "$APP_DIR"

# === CREATE ENV FILE ===
if [ ! -f ".env" ]; then
  log "🧩 Creating .env file..."
  cat <<EOF | sudo tee .env > /dev/null
# === Review Bot Environment Variables ===
SERPAPI_KEY=REPLACE_WITH_YOUR_SERPAPI_KEY
GOOGLE_PLACE_ID=ChIJm8vU6X66cUgRLpYxEcbfPQQ  # KFC Oswestry
TELEGRAM_BOT_TOKEN=REPLACE_WITH_YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=REPLACE_WITH_YOUR_TELEGRAM_CHAT_ID
EOF
else
  log "✅ .env file already exists, skipping."
fi

# === INSTALL DEPENDENCIES ===
log "📦 Installing dependencies..."
sudo npm install --omit=dev

# === BUILD FRONTEND (if applicable) ===
if [ -f "package.json" ] && grep -q "\"build\"" package.json; then
  log "🏗️ Building frontend..."
  sudo npm run build || true
fi

# === CREATE SERVER FOLDER AND SCHEDULER FILES ===
log "🕒 Setting up scheduler..."
mkdir -p server

# --- server/scheduler.js ---
cat <<'EOF' | sudo tee server/scheduler.js > /dev/null
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

// Run immediately + 3pm & 9pm daily
runJob();
cron.schedule("0 15,21 * * *", runJob);
EOF

# --- server/googleReviews.js ---
cat <<'EOF' | sudo tee server/googleReviews.js > /dev/null
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export async function fetchGoogleReviews() {
  const { SERPAPI_KEY, GOOGLE_PLACE_ID } = process.env;
  const url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${GOOGLE_PLACE_ID}&api_key=${SERPAPI_KEY}`;

  const res = await axios.get(url);
  return res.data.reviews?.map(r => ({
    user: r.user?.name,
    rating: r.rating,
    snippet: r.snippet,
    date: r.date,
  })) || [];
}
EOF

# --- server/telegram.js ---
cat <<'EOF' | sudo tee server/telegram.js > /dev/null
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export async function sendTelegramMessage(message) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML",
  });
}
EOF

# === PM2 SETUP ===
if ! command -v pm2 >/dev/null 2>&1; then
  log "🚀 Installing PM2..."
  sudo npm install -g pm2
fi

log "⚙️ Starting scheduler with PM2..."
sudo pm2 delete kfc-scheduler || true
sudo pm2 start server/scheduler.js --name "kfc-scheduler"
sudo pm2 save
sudo pm2 startup systemd -u "$USER" --hp "$HOME"

# === NGINX SETUP ===
log "🌐 Configuring Nginx..."
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<EOF
server {
  listen 80;
  server_name $DOMAIN;

  root $APP_DIR/dist;
  index index.html;

  location / {
    try_files \$uri /index.html;
  }
}
EOF

sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
sudo nginx -t && sudo systemctl restart nginx

# === SSL CERTIFICATE ===
log "🔒 Setting up SSL via Certbot..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m you@$DOMAIN || true

# === FIREWALL ===
log "🧱 Configuring UFW firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

log "✅ Deployment complete!"
echo "Site: https://$DOMAIN"
echo "Scheduler: managed by PM2 (runs 3pm & 9pm daily)"
