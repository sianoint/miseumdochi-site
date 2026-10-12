function json(status, message) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function configured(env) {
  return env.EMAIL_READY === 'true' && env.LEGAL_READY === 'true' && env.BREVO_API_KEY && env.TURNSTILE_SECRET &&
    /^\d+$/.test(env.BREVO_LIST_ID ?? '') && /^\d+$/.test(env.BREVO_DOI_TEMPLATE_ID ?? '') && env.CONSENT_VERSION && env.PUBLIC_SITE_ORIGIN;
}
export async function handleSubscribe(request, env, call = fetch) {
  if (request.method !== 'POST') return json(405, 'POST 요청만 허용합니다.');
  if (!configured(env)) return json(503, '이메일 알림을 준비 중입니다. 현재 이메일을 수집하지 않습니다.');
  let origin;
  try {
    origin = new URL(env.PUBLIC_SITE_ORIGIN).origin;
    if (!origin.startsWith('https://') || request.headers.get('Origin') !== origin || new URL(request.url).origin !== origin) return json(403, '허용되지 않은 요청입니다.');
  } catch { return json(503, '이메일 알림 설정을 확인 중입니다.'); }
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json(415, '잘못된 요청 형식입니다.');
  let body;
  try {
    // Enforce the limit even when Content-Length is missing or forged.
    const reader = request.body?.getReader();
    if (!reader) return json(400, '입력 내용을 확인하세요.');
    const chunks = []; let total = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > 8192) { await reader.cancel(); return json(413, '요청이 너무 큽니다.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return json(400, '입력 내용을 확인하세요.'); }
  const accepted = '등록 가능한 주소라면 확인 메일을 보내드립니다. 메일의 링크를 눌러야 구독이 확정됩니다. 스팸함도 확인해주세요.';
  if (body?.website) return json(202, accepted);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) return json(400, '올바른 이메일 주소를 입력하세요.');
  if (body.privacyConsent !== true || body.updatesConsent !== true || body.consentVersion !== env.CONSENT_VERSION) return json(400, '현재 안내문에 대한 수집·이용과 소식 수신 동의를 각각 확인해주세요.');
  if (typeof body.token !== 'string' || !body.token || body.token.length > 2048) return json(400, '보안 확인을 다시 진행해주세요.');
  try {
    const verifiedResponse = await call('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: body.token })
    });
    const verified = await verifiedResponse.json();
    if (!verifiedResponse.ok || verified.success !== true || verified.hostname !== new URL(origin).hostname || verified.action !== 'subscribe') return json(400, '보안 확인이 만료되었거나 유효하지 않습니다. 다시 확인해주세요.');
    const response = await call('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ email, includeListIds: [Number(env.BREVO_LIST_ID)], templateId: Number(env.BREVO_DOI_TEMPLATE_ID), redirectionUrl: `${origin}/confirmed/`, contactPixelTrackingConsent: false,
        attributes: { PRIVACY_CONSENT: true, UPDATE_CONSENT: true, CONSENT_VERSION: env.CONSENT_VERSION, CONSENT_AT: new Date().toISOString(), CONSENT_SOURCE: 'miseumdochi-landing' } })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (!['duplicate_parameter', 'duplicate_request'].includes(error.code)) return json(502, '메일 서비스 연결을 확인 중입니다. 잠시 후 다시 시도해주세요.');
    }
    return json(202, accepted);
  } catch { return json(502, '메일 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'); }
}
