'use strict';
// A separate collection extends identity without changing existing users or inquiries.
function createStaffStore(collection) {
  let pending;
  const ready = () => pending ||= collection().then(async c => { await c.createIndex({ status: 1, _id: 1 }); return c; }).catch(error => { pending = undefined; throw error; });
  const view = record => record && ({ email: record._id, roles: record.roles.filter(role => role !== 'employee'), relationship: record.relationship || 'employee', status: record.status, version: record.version, invitationExpiresAt: record.invitationExpiresAt, createdAt: record.createdAt, updatedAt: record.updatedAt, history: record.history, sessionValidAfter: record.sessionValidAfter });
  return {
    async getStaff(email) { return view(await (await ready()).findOne({ _id: email })); },
    async listStaff(after) {
      const records = await (await ready()).find(after ? { _id: { $gt: after } } : {}).sort({ _id: 1 }).limit(51).toArray();
      return { members: records.slice(0, 50).map(view), next: records.length > 50 ? records[49]._id : null };
    },
    async inviteStaff(email, roles, actor, relationship = 'employee') {
      const now = new Date();
      try {
        await (await ready()).insertOne({ _id: email, roles, relationship, status: 'invited', version: 0, invitationExpiresAt: new Date(+now + 7 * 86400000), createdAt: now, updatedAt: now, history: [{ action: 'invited', actor, at: now, roles, relationship, status: 'invited' }] }, { writeConcern: { w: 'majority' } });
      } catch (error) { if (error.code === 11000) return null; throw error; }
      return this.getStaff(email);
    },
    async updateStaff(email, roles, status, version, actor, relationship = 'employee') {
      const now = new Date();
      const set = { roles, relationship, status, updatedAt: now, sessionValidAfter: now, ...(status === 'invited' ? { invitationExpiresAt: new Date(+now + 7 * 86400000) } : {}) };
      return view(await (await ready()).findOneAndUpdate({ _id: email, version }, { $set: set, $inc: { version: 1 }, $push: { history: { $each: [{ action: 'updated', actor, at: now, roles, relationship, status }], $slice: -50 } } }, { returnDocument: 'after', writeConcern: { w: 'majority' } }));
    },
    async activateStaff(email) {
      const c = await ready(), now = new Date();
      const activated = await c.findOneAndUpdate({ _id: email, status: 'invited', invitationExpiresAt: { $gt: now } }, { $set: { status: 'active', updatedAt: now }, $inc: { version: 1 }, $push: { history: { $each: [{ action: 'accepted', actor: email, at: now }], $slice: -50 } } }, { returnDocument: 'after', writeConcern: { w: 'majority' } });
      return view(activated || await c.findOne({ _id: email, status: 'active' }));
    }
  };
}
module.exports = { createStaffStore };
