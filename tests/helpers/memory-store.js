'use strict';
// Isolated test double. Production never falls back to memory storage.
function memoryStore() {
  const documents = new Map(), buckets = new Map();
  return {
    documents,
    async allowRequest(address, limit, time) {
      const key = `${address}:${Math.floor(time / 3600000)}`;
      const count = (buckets.get(key) || 0) + 1; buckets.set(key, count);
      return { allowed: count <= limit, retryAfter: 3600 };
    },
    async save(key, digest, input, serviceName) {
      if (!documents.has(key)) documents.set(key, { _id: key, digest, ...input, serviceName, reference: `SWS-${key}`, status: 'new', notificationStatus: 'pending', acknowledgmentSent: false });
      return { ...documents.get(key) };
    },
    async claimNotification(key) {
      const saved = documents.get(key);
      if (saved.notificationStatus !== 'pending') return null;
      saved.notificationStatus = 'processing';
      return { ...saved };
    },
    async finishNotification(key, result) { Object.assign(documents.get(key), result); }
  };
}
module.exports = { memoryStore };
