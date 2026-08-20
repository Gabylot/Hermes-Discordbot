# Veli Bot

Discord bot for managing production, MPF, facility, and delivery tickets. Integrates with the **Hermes** Laravel backend to track work orders, container deliveries, and crew assignments directly from Discord.

## Features

### Ticket Management
- **Claim Tickets** — Crew members claim production/MPF/facility tickets from designated channels
- **`/tickets` Command** — Pick a category, choose an open ticket, and claim it (auto-creates a private thread)
- **Done Tickets** — Mark tickets as completed in threaded conversations
- **Cancel Tickets** — Cancel tickets that are no longer needed
- **Auto-threading** — Each claimed ticket gets its own Discord thread for focused discussion

### Delivery Management
- **Request Delivery** — Persistent button in the delivery channel to request container deliveries
- **`/delivery` Command** — Interactive delivery planner: pick a production and a frontline city, enter your container count in a modal, then it opens a private thread with your transport list (done/cancel buttons included)
- **Structure Selection** — Interactive button-based UI to select which structures need delivery
- **Done Delivery** — Mark a delivery as completed
- **Cancel Delivery** — Cancel a delivery request

### Embeds & Messages
- Rich Discord embeds for all ticket and delivery states (open, claimed, completed, cancelled)
- Leaderboard embeds to track crew performance
- **`/highscore` Command** — Show the leaderboard on demand (top players by score, deliveries, and tickets)
- Ticket poster utility to sync tickets from the Hermes backend into Discord channels

## Architecture

```
veli-bot/            ← This repo (Discord bot)
  └── src/
      ├── index.js                  # Entry point — login, load handlers
      ├── events/                   # Discord event listeners
      ├── handlers/                 # Event & button loaders
      ├── buttons/                  # Button interaction logic
      ├── embeds/                   # Embed builders
      └── utils/                    # API client, ticket poster

Hermes/              ← Laravel backend (separate repo)
  └── app/
      └── Http/
          └── Controllers/
              └── DiscordBotController.php  # API endpoints the bot calls
```

The bot communicates with the Hermes backend via its REST API to create, read, update, and delete tickets and delivery records.

## Quick Start

```bash
git clone https://github.com/Gabylot/Hermes-Discordbot.git
cd Hermes-Discordbot
npm install
cp .env.example .env
# Fill in your Discord bot token, client ID, guild ID, and channel IDs
npm start
```

## Setup

For a detailed step-by-step setup guide covering:

- Node.js installation
- Discord Application creation and bot invitation
- Environment variable configuration
- PM2 deployment for production
- Server updates workflow

See **[SETUP.md](./SETUP.md)**.

## Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID from Discord Developer Portal |
| `DISCORD_GUILD_ID` | Discord server ID |
| `CHANNEL_MPF` | Channel ID for MPF tickets |
| `CHANNEL_FACTORY` | Channel ID for factory tickets |
| `CHANNEL_RESOURCES` | Channel ID for resource tickets |
| `CHANNEL_VEHICLES_STRUCTURES` | Channel ID for vehicles/structures tickets |
| `CHANNEL_DELIVERY` | Channel ID for delivery requests |
| `CHANNEL_LEADERBOARD` | Channel ID for leaderboard |
| `CHANNEL_ADMIN_LOG` | Channel ID for admin logging |
| `API_BASE_URL` | Hermes backend API URL (e.g., `http://localhost:8000/api`) |
| `API_SECRET` | Shared secret for API authentication |

## Running in Production

```bash
# Install PM2
sudo npm install -g pm2

# Start the bot
pm2 start src/index.js --name veli-bot

# Save PM2 process list
pm2 save
pm2 startup
```

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** discord.js v14
- **HTTP Client:** Axios
- **Config:** dotenv

## License

MIT