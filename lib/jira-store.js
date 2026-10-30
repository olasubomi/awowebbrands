'use strict';
const { randomUUID } = require('node:crypto');
function createJiraStore(collections) {
  let pending;
  const ready = () => pending ||= collections().then(async c => { await c.states.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); return c; }).catch(e => { pending = null; throw e; });
  return {
    async putState(state) { const { states } = await ready(); await states.insertOne(state); },
    async consumeState(id, userId, sessionId) { const { states } = await ready(); return states.findOneAndDelete({ _id: id, userId, sessionId, expiresAt: { $gt: new Date() } }); },
    async getConnection(userId) { return (await ready()).connections.findOne({ _id: userId }); },
    async lock(userId) {
      const c = (await ready()).connections, now = new Date(), holder = randomUUID();
      try { await c.updateOne({ _id: userId }, { $setOnInsert: { createdAt: now } }, { upsert: true }); } catch (e) { if (e.code !== 11000) throw e; }
      const record = await c.findOneAndUpdate({ _id: userId, $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: { $exists: false } }] }, { $set: { holder, lockedUntil: new Date(+now + 60000) } }, { returnDocument: 'after' });
      if (!record) return null;
      return {
        record,
        async save(data) { const r = await c.updateOne({ _id: userId, holder, lockedUntil: { $gt: new Date() } }, { $set: { ...data, updatedAt: new Date() } }, { writeConcern: { w: 'majority' } }); if (!r.matchedCount) throw Error('JIRA_LEASE_EXPIRED'); },
        async disconnect() { await this.save({ encrypted: null, accountId: null, displayName: null, expiresAt: null }); },
        async release() { await c.updateOne({ _id: userId, holder }, { $unset: { holder: '', lockedUntil: '' } }); }
      };
    }
  };
}
module.exports = { createJiraStore };
