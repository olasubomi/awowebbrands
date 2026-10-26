import { betterAuth } from 'better-auth/minimal';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { mongodbAdapter } from '@better-auth/mongo-adapter';
import { MongoClient } from 'mongodb';
import { fromNodeHeaders } from 'better-auth/node';

// ESM boundary: the existing Express application remains CommonJS JavaScript.
export function buildAuth({ database, config, sendCode }) {
  const prefix = config.prefix;
  return betterAuth({
    appName: 'Soft Web Services', baseURL: config.origin, basePath: '/api/auth',
    secret: config.secret, database, trustedOrigins: [config.origin],
    logger: { disabled: true },
    user: { modelName: `${prefix}users` },
    account: { modelName: `${prefix}accounts` },
    verification: { modelName: `${prefix}verifications` },
    session: { modelName: `${prefix}sessions`, expiresIn: 8 * 3600, updateAge: 3600, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: config.origin.startsWith('https:'), cookiePrefix: prefix, defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' } },
    emailAndPassword: { enabled: false },
    databaseHooks: { user: { create: { before: async user => {
      if (!config.emails.has(user.email.toLowerCase())) throw new Error('ACCESS_DENIED');
      return { data: user };
    } } } },
    plugins: [emailOTP({
      otpLength: 6, expiresIn: 300, allowedAttempts: 3, storeOTP: 'hashed',
      // Account creation is only reachable through the allowlisted wrapper below.
      disableSignUp: false,
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== 'sign-in' || !config.emails.has(email.toLowerCase())) throw new Error('ACCESS_DENIED');
        await sendCode(email, otp);
      }
    })]
  });
}

export function wrapAuth(auth) {
  const headers = request => fromNodeHeaders(request.headers);
  return {
    requestCode: (email, request) => auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' }, headers: headers(request) }),
    verifyCode: (email, otp, request) => auth.api.signInEmailOTP({ body: { email, otp }, headers: headers(request), asResponse: true }),
    session: request => auth.api.getSession({ headers: headers(request), query: { disableCookieCache: true } }),
    async signOut(request) {
      const current = await auth.api.getSession({ headers: headers(request), query: { disableCookieCache: true } });
      if (current) await (await auth.$context).internalAdapter.deleteSession(current.session.token);
      return auth.api.signOut({ headers: headers(request), asResponse: true });
    }
  };
}

export async function createRuntime(env, config, sendCode) {
  if (!env.MONGODB_URI) throw new Error('ADMIN_NOT_CONFIGURED');
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 60000, timeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(env.MONGODB_DB || (env.VERCEL_ENV === 'production' ? 'softwebservices' : 'softwebservices_dev'));
    // Explicit expiry checks remain authoritative; TTL is cleanup only.
    await db.collection(`${config.prefix}users`).createIndex({ email: 1 }, { unique: true });
    await db.collection(`${config.prefix}sessions`).createIndex({ token: 1 }, { unique: true });
    await db.collection(`${config.prefix}sessions`).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection(`${config.prefix}verifications`).createIndex({ identifier: 1 }, { unique: true });
    await db.collection(`${config.prefix}verifications`).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const auth = buildAuth({ database: mongodbAdapter(db, { client }), config, sendCode });
    return { ...wrapAuth(auth), close: () => client.close() };
  } catch (error) { await client.close().catch(() => {}); throw error; }
}
