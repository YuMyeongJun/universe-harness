#!/usr/bin/env node
/**
 * `universe gh-auth <status|login>` — **깃 로그인을 화면에서 밟을 수 있게 하는 자리.**
 *
 * ## ⛔⛔ 이 도구는 `bin/repos.mjs` 의 규율 하나를 **일부러 뒤집는다**
 *
 * `repos.mjs` 는 이렇게 적어 두었다:
 *
 * > ⛔ `gh auth login` 을 이 도구가 실행하지 않는다. 로그인은 **사람이 한다.**
 * >   도구가 대신 로그인 화면을 띄우면, 사람은 **자기가 어느 계정으로 들어갔는지 모른 채** 진행한다.
 *
 * 그 규율의 **금지**는 뒤집혔지만 **이유는 안 뒤집혔다.** 그래서 이 도구는 로그인을 돌리되,
 * 걱정하던 그 사고(「어느 계정인지 모른 채 진행」)를 **구조로** 막는다:
 *
 *  ① `login` 은 시작 **전에** 지금 활성 계정을 찍고, 끝난 **뒤에도** 다시 찍는다.
 *  ② 계정이 **바뀌었으면 바뀌었다고 말한다**(`switched: true` · 전/후 이름을 함께).
 *  ③ ⛔ **어느 계정으로 들어갈지 이 도구가 안 고른다.** 사람이 브라우저에서 고르고,
 *     도구는 **그 결과를 읽어서 말할 뿐**이다. (조직 계정이 생기면 계정은 둘이 된다 —
 *     그때 「어느 쪽으로 붙었나」가 화면에서 안 보이면 남의 계정으로 레포를 받아 온다.)
 *
 * ## ⛔ 토큰 규율은 `repos.mjs` 와 **같다**
 *
 * · 토큰을 **인자로도 · 파일로도 · 화면으로도** 받지 않는다.
 * · ⛔ **`gh auth token` 을 부르지 않는다.**
 * · `gh` 가 내는 말은 **토큰처럼 생긴 것을 지우고** 나른다(`hideSecrets` — 2차 방어).
 * · ⚠️ **일회용 코드(`XXXX-XXXX`)는 토큰이 아니다.** 지우지 않는다 — 그걸 지우면
 *   사람이 로그인을 못 끝낸다. 이 코드는 **몇 분 뒤 만료되고 단독으로는 아무 권한이 없다.**
 *
 * ## ⭐ 왜 `--web` 이고, 왜 TTY 없이 되는가 (실측)
 *
 * `gh 2.98.0` 은 `gh auth login --web` 을 **stdin 이 터미널이 아니어도** 시작한다. 실측했다:
 *
 *     gh auth login --web --hostname github.com < /dev/null
 *     ! First copy your one-time code: 368F-752F
 *     Open this URL to continue in your web browser: https://github.com/login/device
 *
 * ⚠️ **이건 버전에 매인 사실이다.** 안 되는 버전에서는 코드를 못 뽑고, 그때 이 도구는
 *    **지어내지 않고** ⚪ 로 끝낸다(아래 `login` 의 시간 제한).
 *
 * ## 쓰는 법
 *
 *     universe gh-auth status            지금 상태 한 줄 (사람이 읽는 말)
 *     universe gh-auth status --json     화면이 먹는 모양
 *     universe gh-auth login --json      기기 흐름을 **시작**하고 코드/URL 을 먼저 낸 뒤,
 *                                        사람이 브라우저에서 끝낼 때까지 기다린다
 *
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 *
 * 종료 코드 — 이 저장소의 어휘는 셋이다
 *   0  **잰 초록** — 로그인돼 있다(`status`) · 로그인을 끝냈다(`login`)
 *   1  **잰 빨강** — 사람이 잘못 줬다(모르는 하위명령·플래그)
 *   3  **못 쟀다** — `gh` 가 없다 · 로그인이 안 돼 있다(`status`) · 흐름을 못 시작했다 ·
 *                    사람이 안 끝냈다(시간 제한) · `gh` 가 거절했다
 */
import { spawn } from 'node:child_process';

import { rejectUnknownFlags } from '../lib/flags.mjs';

/** 못 쟀다. ⛔ 1(어긋남)과 **절대 같은 값이면 안 된다** — 「없다」와 「못 봤다」가 붙어 버린다. */
const EXIT_UNMEASURED = 3;

/**
 * 사람이 브라우저에서 끝낼 때까지 기다리는 상한.
 * ⚠️ 넉넉해야 한다 — 조직 계정은 SSO 승인이 한 단계 더 붙는다. 그래도 **무한은 아니다**:
 *    안 끝난 것을 영원히 기다리면 화면이 「진행 중」에 갇히고, 그건 ⚪ 를 못 내는 상태다.
 */
const WAIT_MS = 5 * 60 * 1000;

const argv = process.argv.slice(2);
const sub = argv.find((a) => !a.startsWith('--'));
const rest = argv.filter((a) => a !== sub);
rejectUnknownFlags(rest, ['--json'], 'universe gh-auth');
const asJson = rest.includes('--json');

if (sub !== 'status' && sub !== 'login' && sub !== 'orgs') {
  console.error('⛔ universe gh-auth: 하위 명령은 `status` · `login` · `orgs` 다.');
  console.error('   universe gh-auth status [--json]');
  console.error('   universe gh-auth login  [--json]');
  console.error('   universe gh-auth orgs   [--json]');
  process.exit(1);
}

/**
 * ⛔ **토큰처럼 생긴 것을 지운다.** `repos.mjs` 의 그것과 **같은 목록**이다.
 * ⚠️ 두 자리에 같은 규칙이 적혀 있다는 것은 사실이고, 그건 빚이다 — 다만 지금 옮기면
 *    `repos.mjs` 의 방어를 건드리게 된다. **옮길 때 둘을 함께 옮긴다**(따로 옮기면 하나만 고쳐진다).
 */
const hideSecrets = (text) => String(text ?? '')
  .replace(/(token\s*[:=]\s*)\S+/gi, '$1***')
  .replace(/gh[pousr]_[A-Za-z0-9_]{4,}/g, '***')
  .replace(/github_pat_[A-Za-z0-9_]{4,}/g, '***')
  .replace(/\b[0-9a-f]{40}\b/g, '***');

/** ⛔ 파이프를 안 쓴다(§3) — 종료코드를 `spawn` 에서 직접 받는다. */
const capture = (cmd, args) => new Promise((done) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => done({ code: code ?? 1, out, err, missing: false }));
  child.on('error', (e) => done({ code: 127, out, err: String(e?.message ?? e), missing: true }));
});

/**
 * 지금 상태를 읽는다. ⛔ **여기서 판정하지 않는다** — 읽어서 모양으로 돌려줄 뿐이다.
 * 「로그인 안 됨」이 ⚪ 인지 ❌ 인지는 **부르는 쪽**이 정한다(`status` 는 ⚪, `login` 은 정상 출발점).
 */
const readStatus = async () => {
  const ran = await capture('gh', ['auth', 'status']);
  if (ran.missing || ran.code === 127) {
    return { installed: false, loggedIn: false, account: null, protocol: null, scopes: [], raw: '' };
  }
  const text = hideSecrets(`${ran.out}\n${ran.err}`);
  /* ⚠️ `gh` 의 사람용 출력에서 뽑는다 — ⛔ `--json` 이 없는 명령이라 다른 길이 없다.
     그래서 **못 뽑았을 때 지어내지 않는다**: 이름이 안 잡히면 `null` 이고, 그건 ⚪ 다. */

  /**
   * ⛔⛔ **계정이 여럿일 수 있다. 첫 번째를 집으면 틀린다.**
   *
   * 실측으로 데인 자리다 — 이 기계에 계정이 둘 있었고(`mjyu-louis` · `YuMyeongJun`),
   * 처음 쓴 파서는 `Logged in to … account (\S+)` 의 **첫 번째**를 집었다.
   * 그런데 `gh` 의 나열 순서는 **활성 여부와 무관**하다. ⇒ 화면이 **자신 있게 틀린 계정**을
   * 띄우게 되고, 그건 이 도구가 존재하는 이유(「어느 계정인지 모른 채 진행하지 않는다」)를
   * **정면으로 배신한다.** 목록에 뜨는데 실제로는 다른 계정으로 받아 온다.
   *
   * ⇒ 계정 **블록 단위**로 쪼개고 `Active account: true` 인 것을 고른다.
   * ⚠️ 활성 표시가 하나도 없으면 **지어내지 않는다** — `null` 이고 그건 ⚪ 다.
   */
  const blocks = text.split(/(?=✓ Logged in to)/).filter((b) => /Logged in to/.test(b));
  const nameOf = (b) => /Logged in to \S+ account (\S+)/.exec(b)?.[1] ?? null;
  const accounts = blocks.map((b) => ({
    name: nameOf(b),
    active: /Active account:\s*true/.test(b),
    protocol: /Git operations protocol: (\S+)/.exec(b)?.[1] ?? null,
    scopes: /Token scopes: (.+)/.exec(b)?.[1]
      ?.split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean) ?? [],
  })).filter((a) => a.name !== null);

  const active = accounts.find((a) => a.active) ?? null;
  const account = active?.name ?? null;
  const protocol = active?.protocol ?? null;
  const scopes = active?.scopes ?? [];
  /* ⭐ **다른 계정이 몇이나 있는지도 나른다.** 하나뿐인 줄 알면 「왜 이 레포가 안 보이지」에서 헤맨다. */
  const others = accounts.filter((a) => !a.active).map((a) => a.name);
  return {
    installed: true,
    loggedIn: ran.code === 0 && account !== null,
    account, protocol, scopes, others,
    raw: text.trim(),
  };
};

const emit = (payload) => {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
  process.stdout.write(`${payload.say}\n`);
};

/* ── status ─────────────────────────────────────────────────────────── */
if (sub === 'status') {
  const s = await readStatus();
  if (!s.installed) {
    emit({ ...s, say: '⚪ 못 쟀다 — 이 기계에 `gh`(GitHub CLI)가 없다. `brew install gh` 로 깔아라.' });
    process.exit(EXIT_UNMEASURED);
  }
  if (!s.loggedIn) {
    emit({ ...s, say: '⚪ 못 쟀다 — `gh` 는 있는데 **로그인이 안 돼 있다.**' });
    process.exit(EXIT_UNMEASURED);
  }
  /* ⭐ 계정 이름을 **언제나 함께** 찍는다 — 「됐다」만 찍으면 어느 계정인지 모른다. */
  emit({
    ...s,
    say: `✅ 로그인돼 있다 — 계정 ${s.account} · 프로토콜 ${s.protocol ?? '모름'} · 스코프 ${s.scopes.join(' ') || '(못 읽음)'}`
      + (s.others.length > 0 ? `\n   ⚠️ 이 기계에 **다른 계정도 있다**: ${s.others.join(' · ')} — 지금 쓰이는 것은 ${s.account} 다.` : ''),
  });
  process.exit(0);
}

/* ── orgs ───────────────────────────────────────────────────────────── */
/**
 * **이 계정이 속한 조직**을 낸다.
 *
 * ⛔⛔ 왜 있는가 — 실측으로 데인 자리다. 활성 계정이 **자기 소유 레포가 0개**이고
 * 레포가 전부 조직 아래 있으면, 소유자를 안 주는 목록은 **0개**로 온다. 화면에서 그것은
 * 「저장소가 없다」 또는 「비공개라 안 보이나」로 읽힌다 — **셋이 똑같이 0으로 보이는** 그 사고(§8).
 * ⇒ 조직 이름을 **사람이 외우게 하지 않는다.** `gh` 가 아는 것을 그대로 말한다.
 *
 * ⚠️ 이건 **네트워크를 탄다**(`gh api user/orgs`). `status` 와 달리 느릴 수 있고 실패할 수 있다 —
 *    그래서 갈라 두었다. 실패는 ⚪ 다: 「조직이 없다」가 아니라 **못 물어봤다**.
 * ⛔ 목록이 전부인지는 **못 잰다** — 비공개 멤버십은 `read:org` 스코프가 없으면 안 온다.
 *    그래서 스코프를 함께 낸다.
 */
if (sub === 'orgs') {
  const s2 = await readStatus();
  if (!s2.installed || !s2.loggedIn) {
    emit({ ok: false, orgs: [], account: s2.account, scopes: s2.scopes, say: '⚪ 못 쟀다 — 로그인이 안 돼 있다.' });
    process.exit(EXIT_UNMEASURED);
  }
  const ran = await capture('gh', ['api', 'user/orgs', '--jq', '.[].login']);
  if (ran.code !== 0) {
    emit({
      ok: false, orgs: [], account: s2.account, scopes: s2.scopes,
      why: hideSecrets(ran.err).trim(),
      say: '⚪ 못 쟀다 — 조직을 물어보지 못했다. **조직이 없다는 뜻이 아니다.**',
    });
    process.exit(EXIT_UNMEASURED);
  }
  const orgs = ran.out.split('\n').map((l) => l.trim()).filter(Boolean);
  emit({
    ok: true,
    orgs,
    account: s2.account,
    scopes: s2.scopes,
    /* ⛔ 0개를 「없다」로 말하지 않는다 — `read:org` 가 없으면 비공개 멤버십은 안 온다. */
    say: orgs.length > 0
      ? `✅ 계정 ${s2.account} 이 속한 조직 ${orgs.length}개: ${orgs.join(' · ')}`
      : `⚪ 조직을 0개 받았다 — 「없다」가 아니다. 스코프에 read:org 가 없으면 비공개 멤버십은 안 온다(지금 스코프: ${s2.scopes.join(', ') || '못 읽음'}).`,
  });
  process.exit(orgs.length > 0 ? 0 : EXIT_UNMEASURED);
}

/* ── login ──────────────────────────────────────────────────────────── */
const before = await readStatus();
if (!before.installed) {
  emit({ stage: 'failed', why: '이 기계에 `gh`(GitHub CLI)가 없다.', say: '⚪ 못 쟀다 — `gh` 가 없다. `brew install gh` 로 깔아라.' });
  process.exit(EXIT_UNMEASURED);
}

/**
 * ⚠️ `--hostname github.com` 을 **못 박는다.** 안 주면 `gh` 가 호스트를 물어보는데,
 *    stdin 이 없으니 그 물음에 아무도 답하지 못하고 **조용히 멈춘다.**
 * ⚠️ `--git-protocol https` 도 같은 이유다. ⛔ 사람의 기존 설정을 덮는 값이므로
 *    **이미 로그인돼 있으면 이 도구는 애초에 안 불려야 한다**(화면이 그렇게 막는다).
 * ⛔ `--scopes` 를 안 준다 — 권한을 이 도구가 넓히지 않는다. 필요한 스코프는 사람이 안다.
 */
const child = spawn('gh', ['auth', 'login', '--web', '--hostname', 'github.com', '--git-protocol', 'https'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let seen = '';
let announced = false;
const timer = setTimeout(() => {
  child.kill('SIGTERM');
}, WAIT_MS);

const announce = () => {
  if (announced) return;
  const code = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i.exec(seen)?.[1];
  const url = /(https:\/\/\S*github\.com\/login\/device\S*)/i.exec(seen)?.[1] ?? 'https://github.com/login/device';
  if (!code) return;
  announced = true;
  /* ⭐ 코드를 **먼저** 낸다. 화면이 이 줄을 받아 사람에게 보여 주고, 그 다음에 기다린다. */
  emit({
    stage: 'waiting',
    code,
    url,
    before: before.account,
    say: `🔑 일회용 코드 ${code} — ${url} 에서 입력하고 로그인을 끝내라. (지금 계정: ${before.account ?? '없음'})`,
  });
};

child.stdout.on('data', (d) => { seen += d; announce(); });
child.stderr.on('data', (d) => { seen += d; announce(); });

const code = await new Promise((done) => {
  child.on('close', (c) => done(c ?? 1));
  child.on('error', () => done(127));
});
clearTimeout(timer);

if (!announced) {
  /* ⛔ 코드를 못 뽑았으면 **지어내지 않는다.** `gh` 버전이 다르거나 물음에 걸렸을 수 있다. */
  emit({
    stage: 'failed',
    why: hideSecrets(seen).trim() || '`gh` 가 일회용 코드를 내지 않았다.',
    say: '⚪ 못 쟀다 — 기기 흐름을 **시작하지 못했다.** `gh auth login` 을 터미널에서 직접 해라.',
  });
  process.exit(EXIT_UNMEASURED);
}

const after = await readStatus();
if (code !== 0 || !after.loggedIn) {
  emit({
    stage: 'failed',
    why: hideSecrets(seen).trim(),
    before: before.account,
    after: after.account,
    say: '⚪ 못 쟀다 — 로그인이 **안 끝났다**(시간이 지났거나 브라우저에서 취소했다).',
  });
  process.exit(EXIT_UNMEASURED);
}

/* ⭐⭐ 계정이 **바뀌었으면 바뀌었다고 말한다.** 이것이 `repos.mjs` 의 걱정을 갚는 자리다. */
const switched = before.loggedIn && before.account !== after.account;
emit({
  stage: 'done',
  before: before.account,
  after: after.account,
  switched,
  account: after.account,
  protocol: after.protocol,
  scopes: after.scopes,
  say: switched
    ? `✅ 로그인을 끝냈다 — ⚠️ **계정이 바뀌었다: ${before.account} → ${after.account}**`
    : `✅ 로그인을 끝냈다 — 계정 ${after.account}`,
});
process.exit(0);
