// dist 안 JS 의 gzip 합계를 계산해 350KB 이하인지 확인
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const dir = 'dist/assets';
let total = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  total += gz;
  console.log(`${f}: ${(gz / 1024).toFixed(1)} KB gzip`);
}
console.log(`TOTAL: ${(total / 1024).toFixed(1)} KB gzip (limit 350 KB)`);
if (total > 350 * 1024) process.exit(1);
