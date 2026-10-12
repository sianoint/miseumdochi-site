import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSubscribe } from '../lib/subscribe.mjs';

const env = { EMAIL_READY: 'true', LEGAL_READY: 'true', PUBLIC_SITE_ORIGIN: 'https://planner.example', CONSENT_VERSION: 'v1', BREVO_API_KEY: 'test-only-key', BREVO_LIST_ID: '4', BREVO_DOI_TEMPLATE_ID: '9', TURNSTILE_SECRET: 'test-only-secret' };
const body = { email: 'test@example.com', privacyConsent: true, updatesConsent: true, consentVersion: 'v1', token: 'mock-token', website: '' };
function request(input = body, origin = env.PUBLIC_SITE_ORIGIN) {
  return new Request('https://planner.example/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(input) });
}
function verified() { return new Response(JSON.stringify({ success: true, hostname: 'planner.example', action: 'subscribe' })); }
test('no service connection or consent readiness means no email collection', async () => {
  let calls = 0;
  const response = await handleSubscribe(request(), {}, async () => { calls++; });
  assert.equal(response.status, 503); assert.equal(calls, 0);
  assert.equal((await handleSubscribe(request(), { ...env, LEGAL_READY: 'false' })).status, 503);
});
test('both explicit consents and current policy are required before any provider call', async () => {
  for (const input of [{ ...body, privacyConsent: false }, { ...body, updatesConsent: false }, { ...body, updatesConsent: 'true' }, { ...body, consentVersion: 'old' }]) {
    let calls = 0;
    assert.equal((await handleSubscribe(request(input), env, async () => { calls++; })).status, 400);
    assert.equal(calls, 0);
  }
});
test('origin mismatch, oversized input and bad email fail closed', async () => {
  assert.equal((await handleSubscribe(request(body, 'https://other.example'), env)).status, 403);
  assert.equal((await handleSubscribe(request({ ...body, email: 'not-an-email' }), env)).status, 400);
  assert.equal((await handleSubscribe(request({ ...body, website: '', extra: 'x'.repeat(9000) }), env)).status, 413);
});
test('Turnstile hostname/action mismatch cannot subscribe', async () => {
  let calls = 0;
  const response = await handleSubscribe(request(), env, async () => {
    calls++; return new Response(JSON.stringify({ success: true, hostname: 'other.example', action: 'subscribe' }));
  });
  assert.equal(response.status, 400); assert.equal(calls, 1);
});
test('a valid request uses DOI, fixed redirect and consent metadata, never ordinary contact creation', async () => {
  const calls = [];
  const response = await handleSubscribe(request(), env, async (url, options) => {
    calls.push({ url, options }); return calls.length === 1 ? verified() : new Response('{}', { status: 201 });
  });
  assert.equal(response.status, 202); assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.brevo.com/v3/contacts/doubleOptinConfirmation');
  const sent = JSON.parse(calls[1].options.body);
  assert.deepEqual(sent.includeListIds, [4]); assert.equal(sent.templateId, 9);
  assert.equal(sent.redirectionUrl, 'https://planner.example/confirmed/');
  assert.equal(sent.attributes.UPDATE_CONSENT, true); assert.equal(sent.attributes.CONSENT_VERSION, 'v1');
  assert.equal(sent.contactPixelTrackingConsent, false);
});
test('honeypot and provider errors never expose email addresses or credentials', async () => {
  const caught = await handleSubscribe(request({ ...body, website: 'spam' }), env, () => { throw new Error('should not call'); });
  assert.equal(caught.status, 202);
  let calls = 0;
  const response = await handleSubscribe(request(), env, async () => {
    calls++; return calls === 1 ? verified() : new Response(JSON.stringify({ message: 'private provider details test@example.com', code: 'unauthorized' }), { status: 400 });
  });
  const text = await response.text(); assert.equal(response.status, 502); assert.ok(!text.includes('test@example.com')); assert.ok(!text.includes(env.BREVO_API_KEY));
});
