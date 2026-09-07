/**
 * 기동 전에 포트를 비운다.
 *
 * ⚠️ 죽지 않은 예전 인스턴스가 포트를 잡고 있으면 **고친 코드가 안 도는데 화면은 멀쩡해 보인다.**
 *    "고쳤는데 왜 반영이 안 되지"로 시간을 버리는 자리라, 조용히 다른 포트로 피하지 않고
 *    **잡은 것을 끊고 그 사실을 말한다.**
 */
import { execFileSync } from 'node:child_process';

const PORTS = [8788, 5174];

const pidsOn = (port) => {
  try {
    // lsof 는 포트가 비어 있으면 exit 1 을 낸다 — 그건 오류가 아니라 "없음"이다.
    return execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s !== '');
  } catch {
    return [];
  }
};

let freed = 0;
for (const port of PORTS) {
  for (const pid of pidsOn(port)) {
    try {
      process.kill(Number(pid), 'SIGTERM');
      process.stdout.write(`포트 ${port} 를 잡고 있던 pid ${pid} 를 끊었습니다.\n`);
      freed += 1;
    } catch (e) {
      process.stdout.write(`⚠️ 포트 ${port} 의 pid ${pid} 를 끊지 못했습니다: ${e.message}\n`);
    }
  }
}
if (freed === 0) process.stdout.write('포트 8788 · 5174 비어 있습니다.\n');
