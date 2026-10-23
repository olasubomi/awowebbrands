'use strict';

// Only fixed categories leave this boundary. Driver messages can contain credentials,
// cluster addresses or customer values, so never log or return the original error.
function inquiryFailureCode(error) {
  const pending = [error], seen = new Set();
  let fallback = 'SWS-SAVE';
  while (pending.length && seen.size < 30) {
    const item = pending.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    if (item.code === 18 || item.codeName === 'AuthenticationFailed') return 'SWS-AUTH';
    if (item.code === 13 || item.codeName === 'Unauthorized') return 'SWS-ACCESS';
    if (item.message === 'DATABASE_NOT_CONFIGURED') return 'SWS-CONFIG';
    if (['MongoParseError', 'MongoInvalidArgumentError'].includes(item.name)) return 'SWS-CONFIG';
    if (['ValidationError', 'StrictModeError', 'CastError'].includes(item.name)) return 'SWS-SCHEMA';
    if (['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(item.code) || ['MongooseServerSelectionError', 'MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError'].includes(item.name)) fallback = 'SWS-CONNECTION';
    pending.push(item.cause, item.reason, item.originalError);
    if (item.servers instanceof Map) for (const server of item.servers.values()) pending.push(server.error);
  }
  return fallback;
}
module.exports = { inquiryFailureCode };
