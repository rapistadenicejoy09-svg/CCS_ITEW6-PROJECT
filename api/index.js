/**
 * Vercel serverless entry: all `/api/*` traffic is rewritten here (see vercel.json).
 * The Express app restores the real path from headers when needed (server/index.js).
 */
import app from '../server/index.js'

export default app
