import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync('public/site.json'));
const html = fs.readFileSync('public/index.html', 'utf8');
test('subscription is disabled by default, not a download gate, and consents are unchecked', () => {
  assert.equal(config.newsletter.enabled, false);
  assert.ok(html.includes('id="download-windows"')); assert.ok(html.includes('id="download-mac"'));
  assert.ok(!/id="(?:privacy|updates)-consent"[^>]*\bchecked/.test(html));
  assert.ok(html.includes('동의하지 않아도 다운로드할 수 있습니다'));
});
test('website has no private schedule, account paths, frontend secrets, or analytics', () => {
  for (const file of ['public/index.html', 'public/site.mjs', 'public/site.json', 'public/style.css']) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/\/Users\/|OpenCode Memory|\.obsidian|universityClasses|BREVO_API_KEY|TURNSTILE_SECRET/.test(text));
  }
});
