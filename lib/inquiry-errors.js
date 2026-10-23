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
    // Atlas may wrap authentication/authorization errors under code 8000.
    // Match only these fixed phrases, and never return the original message.
    const atlasMessage = item.code === 8000 && typeof item.message === 'string' ? item.message : '';
    if (/authentication failed|bad auth/i.test(atlasMessage)) return 'SWS-AUTH';
    if (/not authorized|not allowed to (?:do action|execute)|unauthorized/i.test(atlasMessage)) return 'SWS-ACCESS';
    if (item.code === 18 || item.codeName === 'AuthenticationFailed') return 'SWS-AUTH';
    if (item.code === 13 || item.codeName === 'Unauthorized') return 'SWS-ACCESS';
    if (item.message === 'DATABASE_NOT_CONFIGURED') return 'SWS-CONFIG';
    if (['MongoParseError', 'MongoInvalidArgumentError'].includes(item.name)) return 'SWS-CONFIG';
    if (['ValidationError', 'StrictModeError', 'CastError'].includes(item.name)) return 'SWS-SCHEMA';
    if (['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(item.code) || ['MongooseServerSelectionError', 'MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError'].includes(item.name)) fallback = 'SWS-CONNECTION';
    if (Number.isSafeInteger(item.code) && item.code > 0 && item.code < 100000 && fallback === 'SWS-SAVE') fallback = `SWS-SAVE-${item.code}`;
    pending.push(item.cause, item.reason, item.originalError);
    if (item.servers instanceof Map) for (const server of item.servers.values()) pending.push(server.error);
  }
  return fallback;
}
module.exports = { inquiryFailureCode };
