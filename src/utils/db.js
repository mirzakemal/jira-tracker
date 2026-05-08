import { initDatabase } from '../db/indexeddb.js'
import logger from './logger.js'

export async function ensureDB(state) {
  if (!state.dbInitialized) {
    try {
      await initDatabase()
      state.dbInitialized = true
    } catch (error) {
      logger.error('[DB] Failed to initialize:', error)
      throw error
    }
  }
}
