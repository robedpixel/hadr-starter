# TypeScript / Node.js with grammY and the Anthropic SDK

The agent is built in **TypeScript on Node.js**, using **grammY** for the Telegram bot and the **Anthropic TypeScript SDK** for the LLM parts (intent classification and destination extraction). Python (`python-telegram-bot` + `anthropic`) was a viable alternative and was rejected only on maintainer preference; nothing in the design requires Node.

The earlier WhatsApp plan had forced Node (`whatsapp-web.js` is Node-only); with the Telegram pivot that constraint is gone, so this is now a deliberate, free choice rather than a forced one.

## Consequences

- The existing repo's Go/Angular CRUD sample is unrelated and is not reused.
