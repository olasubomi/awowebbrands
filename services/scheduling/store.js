'use strict';
const { token } = require('./model');
function createSchedulingStore(collection) {
  let pending;
  const ready = () => pending ||= collection().then(async c => { await c.createIndex({ ownerId: 1, _id: 1 }); return c; }).catch(e => { pending = null; throw e; });
  return {
    async create(input, ownerId) {
      const now = new Date(), poll = { _id: token(), ownerId, ...input, status: 'open', anonymous: false, responses: [], version: 0, createdAt: now, updatedAt: now, history: [{ action: 'created', actor: ownerId, at: now }] };
      await (await ready()).insertOne(poll, { writeConcern: { w: 'majority' } }); return poll;
    },
    async get(id) { return (await ready()).findOne({ _id: id }); },
    async list(ownerId, after) {
      const rows = await (await ready()).find({ ...(ownerId ? { ownerId } : {}), ...(after ? { _id: { $gt: after } } : {}) }).project({ _id: 1, title: 1, status: 1, deadline: 1, createdAt: 1 }).sort({ _id: 1 }).limit(21).toArray();
      return { polls: rows.slice(0, 20).map(({ _id, ...p }) => ({ id: _id, ...p })), next: rows.length > 20 ? rows[19]._id : null };
    },
    async change(id, version, fields, action, actor, requireVotingOpen = false) {
      const now = new Date();
      return (await ready()).findOneAndUpdate({ _id: id, version, ...(requireVotingOpen ? { status: 'open', deadline: { $gt: now } } : {}) }, { $set: { ...fields, updatedAt: now }, $inc: { version: 1 }, $push: { history: { $each: [{ action, actor, at: now }], $slice: -50 } } }, { returnDocument: 'after', writeConcern: { w: 'majority' } });
    }
  };
}
module.exports = { createSchedulingStore };
