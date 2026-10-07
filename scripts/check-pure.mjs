// Bảo đảm logic game (src/game) không kéo lib DOM vào: nếu có, server sẽ không dùng lại được.
import { execFileSync } from 'node:child_process';

const files = execFileSync('npx', ['tsc', '-p', 'tsconfig.game.json', '--listFilesOnly'], {
  encoding: 'utf8',
});
const leaked = files.split('\n').filter((f) => /lib\.dom|preact|node_modules\/three/.test(f));
if (leaked.length) {
  console.error('Logic game kéo theo phụ thuộc trình duyệt/UI:\n' + leaked.join('\n'));
  process.exit(1);
}
console.log('✓ src/game không phụ thuộc DOM/UI');
