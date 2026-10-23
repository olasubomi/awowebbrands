'use strict';
function receipt(document) {
  return {
    reference: document.reference,
    saved: true,
    notificationStatus: document.notificationStatus,
    acknowledgmentSent: !!document.acknowledgmentSent,
    message: 'Your inquiry has been saved. We will follow up using your contact preferences. An appointment has not been confirmed.'
  };
}
function createSubmitInquiry(store, sendInquiry) {
  return async function submit(key, digest, inquiry, service) {
    // The unique document ID provides durable idempotency across Vercel instances.
    const saved = await store.save(key, digest, inquiry, service.name);
    if (saved.digest !== digest) return { status: 409, body: { message: 'This request changed. Please submit it again with a new request key.' } };
    let claim;
    try { claim = await store.claimNotification(key); }
    catch (_) { return { status: 201, body: receipt(saved) }; }
    if (!claim) return { status: 201, body: receipt(saved) };
    let result;
    try {
      const delivery = await sendInquiry(inquiry, service, saved.reference);
      result = { notificationStatus: 'sent', acknowledgmentSent: !!delivery.acknowledgmentSent };
    } catch (_) {
      result = { notificationStatus: 'failed', acknowledgmentSent: false };
    }
    // Database acceptance remains a success even if notification/status recording fails.
    // Never send mail again automatically: SMTP outcomes can be ambiguous.
    try { await store.finishNotification(key, result); }
    catch (_) { result = { notificationStatus: 'processing', acknowledgmentSent: false }; }
    return { status: 201, body: receipt({ ...saved, ...result }) };
  };
}
module.exports = { createSubmitInquiry };
