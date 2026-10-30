'use strict';
const { emailPattern } = require('./admin-config');
const roles = ['community-member', 'event-organizer', 'developer', 'product-manager', 'admin'];
const permissions = {
  'community-member': ['workspace:read'],
  'event-organizer': ['workspace:read', 'events:manage'],
  developer: ['workspace:read'],
  'product-manager': ['workspace:read', 'work:manage'],
  admin: ['workspace:read', 'work:manage', 'team:manage', 'inquiries:manage', 'events:manage']
};
function normalizeEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function validEmail(value) { return value.length <= 254 && emailPattern.test(value); }
function validRoles(value) {
  return Array.isArray(value) && value.length <= roles.length && new Set(value).size === value.length && value.every(role => roles.includes(role));
}
function createStaffAccess(config, store, enabled) {
  async function member(email) {
    const bootstrap = config.emails.has(email);
    const raw = enabled ? await store.getStaff(email) : null;
    // Legacy Employee was a base role, not a functional responsibility.
    const record = raw ? { ...raw, relationship: raw.relationship === undefined ? 'employee' : raw.relationship, roles: raw.roles.filter(role => role !== 'employee') } : null;
    if (bootstrap) return { ...record, email, relationship: 'employee', status: 'active', roles: [...new Set(['admin', ...(config.productManagers?.has(email) ? ['product-manager'] : []), ...(record?.roles || [])])], bootstrap: true, version: record?.version || 0 };
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
      return { ...record, permissions: [...new Set(['workspace:read', ...(record.relationship !== null || record.roles.some(r => ['developer', 'product-manager', 'admin'].includes(r)) ? ['work:read'] : []), ...record.roles.flatMap(role => permissions[role] || [])])] };
    },
    async activate(email) {
      if (config.emails.has(email)) return true;
      return !!(await store.activateStaff(email));
    }
  };
}
function validRelationship(value) { return value === null || ['employee', 'contractor'].includes(value); }
module.exports = { validRelationship, roles, permissions, normalizeEmail, validEmail, validRoles, createStaffAccess };
