import fs from 'node:fs';
import path from 'node:path';

const production = process.argv.includes('--production');
const config = JSON.parse(fs.readFileSync('public/site.json'));
if (production) {
  for (const platform of ['windows', 'mac']) {
    const url = new URL(config.downloads[platform].url);
    if (url.protocol !== 'https:' || url.hostname.endsWith('.example')) throw new Error('실제 HTTPS 배포 파일 주소를 먼저 설정하세요.');
  }
  if (!config.operator.name || !config.operator.contactEmail) throw new Error('운영자와 공개 문의처를 먼저 확정하세요.');
  const policy = fs.readFileSync('public/privacy.html', 'utf8');
  if (policy.includes('공개 전 검토가 필요한 초안')) throw new Error('개인정보 안내의 운영 정보와 공개 전 검토를 완료하세요.');
}
fs.mkdirSync('dist', { recursive: true });
// Only public website assets: never app records, repository ancestors, API secrets or private notes.
function copy(folder, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const from = path.join(folder, item.name), to = path.join(destination, item.name);
    if (item.isDirectory()) copy(from, to); else fs.copyFileSync(from, to);
  }
}
copy('public', 'dist');
console.log(`미슴도치 사이트 ${production ? '공개용' : '미리보기용'} 빌드 완료: dist/`);
