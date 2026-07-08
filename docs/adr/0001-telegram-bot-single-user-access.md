# Access via a single-user Telegram bot (long-polling, ID whitelist)

The agent is exposed as a **Telegram bot** using the official Telegram Bot API, chosen over the originally-proposed WhatsApp integration. WhatsApp had no viable path for reading a *personal* account's messages: the official Cloud API is business-only, and `whatsapp-web.js` is unofficial and carries an account-ban risk. Telegram's Bot API is official, free, and purpose-built for exactly this.

The bot receives updates via **long-polling** (`getUpdates`) rather than a webhook, so it runs as a local process with no public URL, TLS cert, or hosting.

Because a Telegram bot is reachable by anyone who finds its handle, the "only used by me" requirement is enforced by **whitelisting the owner's numeric Telegram user ID** — the bot declines messages from any other user. This ID is the sole authentication mechanism.

## Consequences

- Switching to a webhook (e.g. if deployed to a server) is a later, contained change.
- The whitelist is the only access control; losing/leaking the bot token still can't grant a non-whitelisted user any action.
