// ── Source Badge Utilities ─────

import { appEvents, AppEvents } from "../core/appEvents.js";

/**
 * Helper to emit open source event programmatically
 * @param {Object} source - Source object with bookId, page, etc.
 */
export function emitOpenSource(source) {
  try {
    appEvents.emit(AppEvents.OPEN_SOURCE, { filename: source?.bookId, page: source?.page, source });
  } catch {}
}