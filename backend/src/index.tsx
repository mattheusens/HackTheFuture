/*
  RMDY - Fish Tracker APIx
*/


// Load .env in development so environment variables from .env are available to Bun/Node
try {
  // Use dotenv when available. This is a no-op if dotenv is not installed.
  // Import style is used to support ESM/TS.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require('dotenv');
  dotenv.config();
} catch (e) {
  // ignore if dotenv is not installed in the environment
}

import { Hono } from 'hono'
import { logger } from './middleware'
import { Lander } from './templates'
import { openApiDoc } from './swagger'
import { swaggerUI } from '@hono/swagger-ui'
import { intitateMongoDb } from './db'
import deviceRoute from './routes/device.route'
import fishRoute from './routes/fish.route'
import { Debug } from './templates/debug/debug'
import debugRoute from './routes/debug.route'
import chatRoute from './routes/chat.route'

const app = new Hono().basePath("/api")

// Initialize DB with error handling (no Effect)
intitateMongoDb().catch((error) => {
  console.error(error.message)
  process.exit(1)
})

// Middleware
app.use(logger)


/**
 *  SWAGGER
 * - serve doc
 * - serve UI
 */

app.get("/health", (c) => c.json({ status: "ok" }))

app.get("/swagger/doc", (c) => c.json(openApiDoc));
app.get('/swagger/ui', swaggerUI({ url: '/api/swagger/doc' }))


/*
* Entrypoint for the API
* - serves a small React app
*/
app.get('/', (c) => {
  return c.html(<Lander />)
})

//Webroute for testing
app.get('/debug', (c) => {
  return c.html(<Debug />)
})

// Development helper: report whether important env vars are loaded (do NOT expose secrets)
app.get('/debug/env', (c) => {
  return c.json({
    openaiConfigured: !!(Bun.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY),
    storagePath: !!(Bun.env.STORAGE_PATH || process.env.STORAGE_PATH),
    apiBaseUrl: Bun.env.API_BASE_URL || process.env.API_BASE_URL || null
  });
});


// Device and Fish routes
app.route("/device", deviceRoute)
app.route("/fish", fishRoute)
app.route("/debug", debugRoute)
app.route("/chat", chatRoute)


export default {
  port: Bun.env.PORT || 3000,
  fetch: app.fetch,
}
