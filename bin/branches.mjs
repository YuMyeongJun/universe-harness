#!/usr/bin/env node
/**
 * `universe branches <주소>` — **그 저장소에 어떤 가지가 있는가.**
 *
 * ## ⛔⛔ 왜 있는가
 *
 * `universe clone` 이 가지를 안 받던 동안, 받아 오는 것은 언제나 **원격의 기본 가지**였다.
 * 그런데 잴 대상이 `main` 이 아닌 경우가 흔하다 — 이 우주의 실측 은하들부터가
 * `refactor-…` · `universe-trial` 같은 작업 가지에 있다.
 * ⛔ 기본 가지를 받아 놓고 「이 저장소를 쟀다」고 말하면 **다른 코드를 잰 것**이다.
 * ⇒ 고를 수 있게 하려면 **무엇을 고를 수 있는지**부터 말해야 한다.
 *
 * ## ⛔ 받아 오지 않는다 · 체크아웃하지 않는다
 *
 * 이 도구는 **묻기만** 한다(`git ls-remote --heads`). 받는 것은 `universe clone` 한 자리다 —
 * 두 자리에서 받아 오면 조용히 갈린다(R47·R91 이 반복해 데인 형태).
 * ⚠️ 그래서 **디스크를 안 건드린다.** 원격에 한 번 묻고 끝이다.
 *
 * ## ⛔ 토큰을 안 받는다
 *
 * 자격은 **그 기계의 git 이 이미 아는 것**을 쓴다(`gh auth login` · SSH 키 · credential helper).
 * ⚠️ 비공개 저장소에서 자격이 없으면 git 이 거절한다 — 그때는 **⚪ 못 쟀다**이지
 *    「가지가 없다」가 아니다. 이 둘을 붙이면 사람이 없는 저장소를 찾으러 간다(§8).
 *
 * ## ⚠️ 못 재는 것 (적어 둔다)
 *
 *  · **기본 가지가 무엇인지** 이 도구는 못 잰다. `ls-remote --heads` 는 `HEAD` 를 안 준다 —
 *    ⛔ 그래서 「아마 main 이겠지」로 표시하지 않는다. 받은 뒤 `clone` 이 **실제 가지를 찍는다.**
 *  · **그 가지를 받아 올 수 있는지**는 못 잰다. 목록에 떴다고 `git clone` 이 되는 것은 아니다.
 *
 *   universe branches <주소> [--json]
 *
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 *
 * 종료 코드
 *   0  **잰 초록** — 가지를 1개 이상 받았다
 *   1  **잰 빨강** — 사람이 잘못 줬다(주소가 없다 · 모르는 플래그 · 자격이 박힌 주소)
 *   3  **못 쟀다** — git 이 거절했다 · 0개를 받았다
 */
import { spawn } from 'node:child_process';

import { rejectUnknownFlags } from '../lib/flags.mjs';

const EXIT_UNMEASURED = 3;

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--json'], 'universe branches');
const asJson = argv.includes('--json');
const url = argv.find((a) => !a.startsWith('--'));

if (url === undefined) {
  console.error('주소를 줘라: universe branches <주소> [--json]');
  process.exit(1);
}

/**
 * ⛔ **자격이 박힌 주소를 거절한다** — `clone.mjs` 와 **같은 규율**이다.
 * 받으면 그 값이 인자가 되어 셸 히스토리·프로세스 목록·서버 로그에 남는다.
 */
if (/^[a-z+]+:\/\/[^/@]*@/i.test(url)) {
  console.error('⛔ 주소에 자격이 박혀 있다 — 토큰을 빼고 주소만 줘라. 인증은 이 기계의 git 이 한다.');
  process.exit(1);
}

const ran = await new Promise((done) => {
  /* `--` 로 끊는다 — 주소가 `-` 로 시작해도 옵션으로 안 읽힌다. */
  const c = spawn('git', ['ls-remote', '--heads', '--', url], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { err += d; });
  c.on('close', (code) => done({ code: code ?? 1, out, err }));
  c.on('error', (e) => done({ code: 127, out, err: String(e?.message ?? e) }));
});

/** ⛔ git 의 말에 자격이 섞여 올 수 있다 — 나르기 전에 지운다(`repos.mjs` 와 같은 하한). */
const hideSecrets = (t) => String(t ?? '')
  .replace(/(token\s*[:=]\s*)\S+/gi, '$1***')
  .replace(/gh[pousr]_[A-Za-z0-9_]{4,}/g, '***')
  .replace(/github_pat_[A-Za-z0-9_]{4,}/g, '***')
  .replace(/:\/\/[^/@\s]*@/g, '://***@');

const say = (payload) => {
  if (asJson) { process.stdout.write(`${JSON.stringify(payload)}\n`); return; }
  process.stdout.write(`${payload.say}\n`);
  for (const b of payload.branches) process.stdout.write(`   ${b}\n`);
};

if (ran.code !== 0) {
  say({
    ok: false,
    branches: [],
    why: hideSecrets(ran.err).trim(),
    say: `⚪ 못 쟀다 — git 이 거절했다(종료코드 ${ran.code}). **「가지가 없다」가 아니다.**\n   ⚠️ 비공개 저장소라면 자격이 없는 것이다 — 화면의 「깃 로그인」을 먼저 보라.`,
  });
  process.exit(EXIT_UNMEASURED);
}

/* `<sha>\trefs/heads/<이름>` — 이름에 `/` 가 들어가므로 **첫 번째 접두만** 떼어낸다. */
const branches = ran.out.split('\n')
  .map((l) => l.split('\t')[1] ?? '')
  .filter((r) => r.startsWith('refs/heads/'))
  .map((r) => r.slice('refs/heads/'.length))
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b));

if (branches.length === 0) {
  say({ ok: false, branches: [], why: '', say: '⚪ 못 쟀다 — 가지를 0개 받았다. **「없다」가 아니다**(빈 저장소이거나, 권한이 그만큼인 것일 수 있다).' });
  process.exit(EXIT_UNMEASURED);
}

say({ ok: true, branches, why: '', say: `✅ 가지 ${branches.length}개` });
process.exit(0);
