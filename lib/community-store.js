'use strict';
const { randomUUID } = require('node:crypto');
function createCommunityStore(collections, timezone = 'America/Los_Angeles') {
  let pending;
  const ready = () => pending ||= collections().then(async c => {
    await c.events.createIndex({ visibility: 1, startsAt: 1, _id: 1 });
    await c.responses.createIndex({ eventId: 1, email: 1 });
    await c.responses.createIndex({ userId: 1, attendance: 1 });
    return c;
  }).catch(e => { pending = null; throw e; });
  return {
    async list({ after, audience, past, now = new Date(), limit = 20 }) {
      const c = await ready();
      const filter = { visibility: { $in: audience }, ...(past ? { endsAt: { $lte: now } } : { endsAt: { $gt: now } }), ...(after ? { $or: [{ startsAt: { [past ? '$lt' : '$gt']: new Date(after.time) } }, { startsAt: new Date(after.time), _id: { [past ? '$lt' : '$gt']: after.id } }] } : {}) };
      const events = await c.events.find(filter).sort({ startsAt: past ? -1 : 1, _id: past ? -1 : 1 }).limit(limit + 1).toArray();
      const next = events.length > limit ? { time: events[limit - 1].startsAt.toISOString(), id: events[limit - 1]._id } : null;
      return { events: events.slice(0, limit), next };
    },
    async get(id) { return (await ready()).events.findOne({ _id: id }); },
    async create(input, actor) {
      const c = await ready(), now = new Date(), event = { _id: randomUUID(), ...input, version: 0, createdAt: now, updatedAt: now, createdBy: actor, history: [{ action: 'created', actor, at: now }] };
      await c.events.insertOne(event, { writeConcern: { w: 'majority' } }); return event;
    },
    async update(id, input, version, actor) {
      return (await ready()).events.findOneAndUpdate({ _id: id, version }, { $set: { ...input, updatedAt: new Date() }, $inc: { version: 1 }, $push: { history: { $each: [{ action: 'updated', actor, at: new Date(), status: input.status }], $slice: -50 } } }, { returnDocument: 'after', writeConcern: { w: 'majority' } });
    },
    async response(eventId, userId) { return (await ready()).responses.findOne({ _id: eventId + ':' + userId }); },
    async rsvp(eventId, userId, email, rsvp) {
      const c = await ready(), id = eventId + ':' + userId, now = new Date();
      const update = { $set: { rsvp, updatedAt: now }, $setOnInsert: { eventId, userId, email, attendance: 'unconfirmed', version: 0, createdAt: now } };
      try { return await c.responses.findOneAndUpdate({ _id: id }, update, { upsert: true, returnDocument: 'after', writeConcern: { w: 'majority' } }); }
      catch (e) { if (e.code !== 11000) throw e; return c.responses.findOneAndUpdate({ _id: id }, { $set: update.$set }, { returnDocument: 'after', writeConcern: { w: 'majority' } }); }
    },
    async roster(eventId, after) {
      const c = await ready(), rows = await c.responses.find({ eventId, ...(after ? { _id: { $gt: after } } : {}) }).sort({ _id: 1 }).limit(51).toArray();
      return { responses: rows.slice(0, 50), next: rows.length > 50 ? rows[49]._id : null };
    },
    async attendance(eventId, userId, email, attendance, version, actor) {
      const c = await ready(), now = new Date();
      // A single record per event/person prevents double counting.
      return c.responses.findOneAndUpdate({ _id: eventId + ':' + userId, version }, { $set: { attendance, email, updatedAt: now, confirmedBy: actor, confirmedAt: now }, $inc: { version: 1 }, $push: { history: { $each: [{ attendance, actor, at: now }], $slice: -50 } } }, { returnDocument: 'after', writeConcern: { w: 'majority' } });
    },
    async milestones(userId, now = new Date()) {
      const c = await ready();
      const period = unit => ({ $dateTrunc: { date: now, unit, timezone, ...(unit === 'week' ? { startOfWeek: 'monday' } : {}) } });
      const [result] = await c.responses.aggregate([
        { $match: { userId, attendance: 'attended' } },
        { $lookup: { from: c.events.collectionName, localField: 'eventId', foreignField: '_id', as: 'event' } },
        { $unwind: '$event' },
        { $match: { 'event.status': 'scheduled', 'event.endsAt': { $lte: now } } },
        { $group: { _id: null, total: { $sum: 1 }, firstAttendedAt: { $min: '$event.startsAt' }, thisWeek: { $sum: { $cond: [{ $gte: ['$event.startsAt', period('week')] }, 1, 0] } }, thisMonth: { $sum: { $cond: [{ $gte: ['$event.startsAt', period('month')] }, 1, 0] } } } }
      ]).toArray();
      return { total: result?.total || 0, firstAttendedAt: result?.firstAttendedAt || null, participatedThisWeek: (result?.thisWeek || 0) > 0, thisMonth: result?.thisMonth || 0, timezone };
    }
  };
}
module.exports = { createCommunityStore };
