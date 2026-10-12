const form = document.getElementById('subscribe-form');
const status = document.getElementById('subscribe-status');
let config;
let token = '';
let widget;

function safeLink(value) {
  if (typeof value !== 'string') return null;
  if (/^\/downloads\/[A-Za-z0-9._-]+\.zip$/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
async function init() {
  config = await (await fetch('/site.json', { cache: 'no-store' })).json();
  document.getElementById('version-badge').textContent = `v${config.version} · ${config.beta ? '베타' : '정식'} · ${config.releasedAt}`;
  for (const platform of ['windows', 'mac']) {
    const link = document.getElementById(`download-${platform}`);
    const href = safeLink(config.downloads?.[platform]?.url);
    if (href) { link.href = href; link.removeAttribute('aria-disabled'); }
  }
  if (!config.newsletter?.enabled || !config.newsletter.turnstileSiteKey) return;
  status.textContent = '확인 메일의 링크를 눌러야 구독이 확정됩니다. 체크 항목은 기본 선택되지 않습니다.';
  for (const id of ['email', 'privacy-consent', 'updates-consent']) document.getElementById(id).disabled = false;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.onload = () => {
    widget = window.turnstile.render('#challenge', {
      sitekey: config.newsletter.turnstileSiteKey, action: 'subscribe',
      callback: value => { token = value; document.getElementById('subscribe-button').disabled = false; },
      'expired-callback': () => { token = ''; document.getElementById('subscribe-button').disabled = true; },
      'error-callback': () => { token = ''; document.getElementById('subscribe-button').disabled = true; status.textContent = '보안 확인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.'; }
    });
  };
  script.onerror = () => { status.textContent = '보안 확인을 불러오지 못했습니다. 이메일은 전송되지 않았습니다.'; };
  document.head.append(script);
}
form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!config?.newsletter?.enabled || !token || !form.reportValidity()) return;
  const button = document.getElementById('subscribe-button');
  button.disabled = true; status.textContent = '확인 메일 요청 중…';
  try {
    const response = await fetch('/api/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('email').value.trim(), privacyConsent: document.getElementById('privacy-consent').checked, updatesConsent: document.getElementById('updates-consent').checked, consentVersion: config.newsletter.consentVersion, token, website: form.elements.website.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '신청을 처리하지 못했습니다.');
    status.textContent = result.message;
    form.reset();
  } catch (error) { status.textContent = error.message; }
  finally { token = ''; if (widget !== undefined) window.turnstile.reset(widget); }
});
init().catch(() => { document.getElementById('version-badge').textContent = '다운로드 정보를 불러오지 못했습니다.'; });
