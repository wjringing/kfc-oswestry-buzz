#!/bin/bash
set -e

# === CONFIGURATION ===
APP_DIR="/var/www/review.ringing.org.uk"
DOMAIN="review.ringing.org.uk"
REPO_URL="https://github.com/wjringing/kfc-oswestry-buzz.git"
NODE_VERSION="20"
EMAIL="admin@${DOMAIN}"  # For SSL certificate

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

# Add backend-specific dependencies
sudo npm install --save axios node-cron dotenv

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
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL || true

# Auto-renewal setup
(sudo crontab -l 2>/dev/null | grep -v certbot; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -

# === FIREWALL ===
log "🧱 Configuring UFW firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

log "✅ Deployment complete!"
echo ""
echo "=========================================="
echo "🎉 Site: https://$DOMAIN"
echo "📅 Scheduler: PM2 (runs at 9am, 3pm & 9pm daily)"
echo "📝 Logs: sudo pm2 logs kfc-scheduler"
echo "🔄 Restart: sudo pm2 restart kfc-scheduler"
echo "=========================================="
echo ""
echo "⚙️  Next steps:"
echo "1. Edit .env file with your API keys:"
echo "   sudo nano $APP_DIR/.env"
echo "2. Restart scheduler:"
echo "   sudo pm2 restart kfc-scheduler"
