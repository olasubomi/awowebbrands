'use strict';
async function buildFixture(config) {
  const { buildAuth, wrapAuth } = await import('../../lib/admin-auth.mjs');
  const { memoryAdapter } = await import('better-auth/adapters/memory');
  const db = Object.fromEntries(['users', 'sessions', 'accounts', 'verifications'].map(name => [config.prefix + name, []]));
  const sent = [];
  const auth = buildAuth({ database: memoryAdapter(db), config, sendCode: async (email, code) => { sent.push({ email, code }); } });
  return { auth, runtime: wrapAuth(auth), db, sent };
}
module.exports = { buildFixture };
