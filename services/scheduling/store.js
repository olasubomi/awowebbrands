'use strict';
const { token } = require('./model');
const listStatuses = new Set(['all', 'draft', 'open', 'awaiting', 'confirmed', 'past', 'cancelled']);
function listFilter(ownerId, search, status, now) {
  const query = ownerId ? { ownerId } : {};
  if (search) query.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (status === 'draft' || status === 'cancelled') query.status = status;
  if (status === 'open' || status === 'awaiting') {
    query.status = 'open';
    query.deadline = status === 'open' ? { $gt: now } : { $lte: now };
  }
  if (status === 'confirmed' || status === 'past') {
    query.status = 'finalized';
    const ended = { $anyElementTrue: [{ $map: { input: '$slots', as: 'slot', in: { $and: [{ $eq: ['$$slot.id', '$selectedSlotId'] }, { $lte: ['$$slot.endsAt', now] }] } } }] };
    query.$expr = status === 'past' ? ended : { $not: [ended] };
  }
  return query;
}
function createSchedulingStore(collection) {
  let pending;
  const ready = () => pending ||= collection().then(async c => { await c.createIndex({ ownerId: 1, createdAt: -1, _id: -1 }); await c.createIndex({ createdAt: -1, _id: -1 }); return c; }).catch(e => { pending = null; throw e; });
  return {
    async create(input, ownerId, status = 'open') {
      const now = new Date(), poll = { _id: token(), ownerId, ...input, status, anonymous: false, responses: [], version: 0, createdAt: now, updatedAt: now, history: [{ action: status === 'draft' ? 'draft-saved' : 'published', actor: ownerId, at: now }] };
      await (await ready()).insertOne(poll, { writeConcern: { w: 'majority' } }); return poll;
    },
    async get(id) { return (await ready()).findOne({ _id: id }); },
    async list(ownerId, { after, search = '', status = 'all', order = 'newest' } = {}) {
      const c = await ready();
      const query = listFilter(ownerId, search, status, new Date());
      const direction = order === 'oldest' ? 1 : -1;
      if (after) {
        const anchor = await c.findOne({ _id: after, ...(ownerId ? { ownerId } : {}) }, { projection: { createdAt: 1 } });
        if (!anchor?.createdAt) return null;
        const cmp = direction === 1 ? '$gt' : '$lt';
        query.$or = [{ createdAt: { [cmp]: anchor.createdAt } }, { createdAt: anchor.createdAt, _id: { [cmp]: after } }];
      }
      const rows = await c.find(query).project({ _id: 1, title: 1, status: 1, deadline: 1, createdAt: 1 }).sort({ createdAt: direction, _id: direction }).limit(21).toArray();
      return { polls: rows.slice(0, 20).map(({ _id, ...p }) => ({ id: _id, ...p })), next: rows.length > 20 ? rows[19]._id : null };
    },
    async change(id, version, fields, action, actor, requireVotingOpen = false) {
      const now = new Date();
      return (await ready()).findOneAndUpdate({ _id: id, version, ...(requireVotingOpen ? { status: 'open', deadline: { $gt: now } } : {}) }, { $set: { ...fields, updatedAt: now }, $inc: { version: 1 }, $push: { history: { $each: [{ action, actor, at: now }], $slice: -50 } } }, { returnDocument: 'after', writeConcern: { w: 'majority' } });
    }
  };
}
module.exports = { createSchedulingStore, listStatuses };
