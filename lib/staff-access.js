'use strict';
const { emailPattern } = require('./admin-config');
const roles = ['employee', 'product-manager', 'admin'];
const permissions = {
  employee: ['workspace:read'],
  'product-manager': ['workspace:read', 'work:manage'],
  admin: ['workspace:read', 'work:manage', 'team:manage', 'inquiries:manage']
};
function normalizeEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function validEmail(value) { return value.length <= 254 && emailPattern.test(value); }
function validRoles(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= roles.length && new Set(value).size === value.length && value.every(role => roles.includes(role)) && value.includes('employee');
}
function createStaffAccess(config, store, enabled) {
  async function member(email) {
    const bootstrap = config.emails.has(email);
    const record = enabled ? await store.getStaff(email) : null;
    if (bootstrap) return { ...record, email, status: 'active', roles: [...new Set(['employee', 'admin', ...(config.productManagers?.has(email) ? ['product-manager'] : []), ...(record?.roles || [])])], bootstrap: true, version: record?.version || 0 };
    return record;
  }
  function eligible(record, invite = false) {
    return record && (record.status === 'active' || (invite && record.status === 'invited' && new Date(record.invitationExpiresAt).getTime() > Date.now()));
  }
  return {
    member,
    async allowed(email) { return !!eligible(await member(email), true); },
    async current(email) {
      const record = await member(email);
      if (!eligible(record)) return null;
      return { ...record, permissions: [...new Set(record.roles.flatMap(role => permissions[role] || []))] };
    },
    async activate(email) {
      if (config.emails.has(email)) return true;
      return !!(await store.activateStaff(email));
    }
  };
}
module.exports = { roles, permissions, normalizeEmail, validEmail, validRoles, createStaffAccess };
