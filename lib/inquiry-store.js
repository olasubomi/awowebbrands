'use strict';
const mongoose = require('mongoose');
const crypto = require('node:crypto');

// Each application instance reuses its pool. No URI or customer data is logged.
function createMongoStore(env = process.env) {
  let connectionPromise;
  async function models() {
    if (!env.MONGODB_URI) throw new Error('DATABASE_NOT_CONFIGURED');
    if (!connectionPromise) {
      connectionPromise = (async () => {
        const connection = mongoose.createConnection(env.MONGODB_URI, {
          dbName: env.MONGODB_DB || (env.VERCEL_ENV === 'production' ? 'softwebservices' : 'softwebservices_dev'),
          serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
          maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 60000,
          autoIndex: false, bufferCommands: false
        });
        try {
          await connection.asPromise();
          const Inquiry = connection.model('Inquiry', inquirySchema(), 'inquiries');
          const RateBucket = connection.model('IntakeRateBucket', rateSchema(), 'intake_rate_buckets');
          // Only this ephemeral abuse-control collection has automatic expiry.
          await RateBucket.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
          return { Inquiry, RateBucket };
        } catch (_) {
          await connection.close().catch(() => {});
          throw new Error('DATABASE_UNAVAILABLE');
        }
      })().catch(error => { connectionPromise = undefined; throw error; });
    }
    return connectionPromise;
  }
  return {
    async check() { await models(); },
    async allowRequest(address, limit, time) {
      const { RateBucket } = await models();
      const hour = Math.floor(time / 3600000);
      const key = crypto.createHash('sha256').update(`${address}:${hour}`).digest('hex');
      let bucket;
      try {
        bucket = await RateBucket.findOneAndUpdate({ _id: key }, {
          $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((hour + 2) * 3600000) }
        }, { upsert: true, returnDocument: 'after', lean: true });
      } catch (error) {
        if (error.code !== 11000) throw error;
        bucket = await RateBucket.findOneAndUpdate({ _id: key }, { $inc: { count: 1 } }, { returnDocument: 'after', lean: true });
      }
      return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil(((hour + 1) * 3600000 - time) / 1000)) };
    },
    async save(key, digest, input, serviceName) {
      const { Inquiry } = await models();
      const document = {
        _id: key, digest, reference: `SWS-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
        ...input, serviceName, status: 'new', notificationStatus: 'pending', acknowledgmentSent: false
      };
      try { return (await Inquiry.create([document], { writeConcern: { w: 'majority' } }))[0].toObject(); }
      catch (error) {
        if (error.code !== 11000) throw error;
        const existing = await Inquiry.findById(key).lean();
        if (!existing) throw new Error('DATABASE_UNAVAILABLE');
        return existing;
      }
    },
    async claimNotification(key) {
      const { Inquiry } = await models();
      return Inquiry.findOneAndUpdate({ _id: key, notificationStatus: 'pending' }, {
        $set: { notificationStatus: 'processing', notificationAttemptedAt: new Date() }
      }, { returnDocument: 'after', lean: true });
    },
    async finishNotification(key, result) {
      const { Inquiry } = await models();
      await Inquiry.updateOne({ _id: key, notificationStatus: 'processing' }, { $set: result });
    }
  };
}

function inquirySchema() {
  const bounded = (max, required = false) => ({ type: String, maxlength: max, required });
  return new mongoose.Schema({
    _id: { type: String, required: true }, digest: { type: String, required: true },
    reference: { type: String, required: true }, serviceId: bounded(64, true), serviceName: bounded(160, true),
    fullName: bounded(120, true), businessName: bounded(160), email: bounded(254, true), phone: bounded(40),
    contactPreference: { type: String, enum: ['email', 'phone', 'either'], required: true },
    goal: bounded(3000, true), availableDays: [String], availableTimes: bounded(300), timezone: bounded(80, true),
    answers: { type: Map, of: { type: String, maxlength: 500 }, default: {} },
    status: { type: String, enum: ['new', 'in-progress', 'closed'], default: 'new' },
    notificationStatus: { type: String, enum: ['pending', 'processing', 'sent', 'failed'], default: 'pending' },
    notificationAttemptedAt: Date, acknowledgmentSent: { type: Boolean, default: false }
  }, { timestamps: true, strict: 'throw', versionKey: false });
}
function rateSchema() {
  return new mongoose.Schema({ _id: String, count: Number, expiresAt: Date }, { versionKey: false });
}
module.exports = { createMongoStore, inquirySchema };
