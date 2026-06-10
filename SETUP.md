# Veli Bot — Ubuntu Server Setup Guide

## 1. Install Node.js (v20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should print v20.x.x
```

---

## 2. Create a Discord Application and Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it `Veli Bot`
3. Go to **Bot** tab → click **Add Bot**
4. Under **Privileged Gateway Intents**, enable:
   - `Server Members Intent`
   - `Message Content Intent`
5. Copy the **Token** — you'll need it for `.env`
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Send Messages`, `Send Messages in Threads`, `Create Private Threads`, `Manage Messages`, `Manage Threads`, `Read Message History`, `Embed Links`, `Use External Emojis`, `View Channels`
7. Copy the generated URL, open it in your browser, and invite the bot to the Veli server
8. Copy your **Application ID** (Client ID) from the General Information tab

---

## 3. Clone and set up the bot

```bash
# Clone the repo next to your Laravel backend
cd /var/www   # or wherever your Laravel app lives
git clone https://github.com/your-org/veli-bot.git
cd veli-bot

# Install dependencies
npm install

# Set up environment
cp .env.example .env
nano .env
```

Fill in `.env`:
```
DISCORD_TOKEN=paste_your_bot_token
DISCORD_CLIENT_ID=paste_your_application_id
DISCORD_GUILD_ID=right_click_server_in_discord_copy_id

CHANNEL_FACTORY=right_click_channel_copy_id
CHANNEL_MPF=
CHANNEL_FACILITY=
CHANNEL_DELIVERY=
CHANNEL_LEADERBOARD=
CHANNEL_ADMIN_LOG=

API_BASE_URL=http://localhost:8000/api
API_SECRET=generate_a_long_random_string_and_add_to_laravel_too
```

> **To get channel IDs in Discord:** Enable Developer Mode in Discord settings (Settings → Advanced → Developer Mode), then right-click any channel → Copy ID.

---

## 4. Test the bot manually

```bash
node src/index.js
```

You should see:
```
[events] loaded: ready
[events] loaded: interactionCreate
[events] loaded: messageCreate
[buttons] loaded: claim_ticket
...
[bot] logged in as Veli Bot#1234
```

Press `Ctrl+C` to stop after confirming it works.

---

## 5. Post the delivery request button (one time only)

```bash
# Run this once to put the persistent button in #delivery
node -e "
import('./src/index.js').then(() => {
  // wait for ready then call postDeliveryRequestButton
})
"
```

Or easier — add a temporary script `scripts/postDeliveryButton.js`:

```js
import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { postDeliveryRequestButton } from './src/utils/ticketPoster.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', async () => {
  await postDeliveryRequestButton(client);
  console.log('Done!');
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
```

Run with: `node scripts/postDeliveryButton.js`

---

## 6. Run as a background service with PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the bot
cd /var/www/veli-bot
pm2 start src/index.js --name veli-bot

# Make it restart on server reboot
pm2 startup
pm2 save
```

Useful PM2 commands:
```bash
pm2 logs veli-bot        # live logs
pm2 restart veli-bot     # restart after code changes
pm2 stop veli-bot        # stop
pm2 status               # see all running processes
```

---

## 7. Deploying updates

```bash
cd /var/www/veli-bot
git pull
npm install          # only needed if package.json changed
pm2 restart veli-bot
```

---

## Folder structure

```
veli-bot/
├── src/
│   ├── index.js                  # entry point
│   ├── events/
│   │   ├── ready.js
│   │   ├── interactionCreate.js  # routes button clicks
│   │   └── messageCreate.js      # handles container count input in threads
│   ├── handlers/
│   │   ├── eventHandler.js
│   │   ├── buttonHandler.js
│   │   └── buttons/
│   │       ├── claimTicket.js
│   │       ├── doneTicket.js
│   │       ├── deliveryRequest.js
│   │       ├── deliveryStructures.js
│   │       └── doneDelivery.js
│   ├── embeds/
│   │   └── index.js              # all Discord embed builders
│   └── utils/
│       ├── api.js                # all calls to Laravel backend
│       └── ticketPoster.js       # helpers to post/sync tickets
├── .env
├── .env.example
└── package.json
```
