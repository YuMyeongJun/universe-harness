#!/usr/bin/env node
/**
 * `universe repos [<소유자>]` — **이 기계의 `gh` 가 아는 계정으로 레포 목록을 보여 준다.**
 *
 * ## 사람이 하려던 것
 *
 *   깃 로그인을 하고 → **레포를 골라서** → 받아 오고 → 재고 → TC → 화면 시험 → fail 0
 *
 * 그 「고른다」 칸이 비어 있었다. 지금까지는 `universe clone <주소>` 로 **주소를 손으로 쳐야만**
 * 했다. 주소를 외우고 있는 사람은 이 하네스를 이미 쓰던 사람뿐이다.
 * ⇒ 이 도구는 **목록을 내는 데까지** 한다. 받아 오는 것은 `universe clone` 이 한다 —
 *   두 자리에서 받아 오면 조용히 갈린다(R47·R91 이 반복해 데인 형태).
 *
 * ## ⛔⛔ 토큰을 **보지도 않는다** — 편의가 아니라 규율이다
 *
 * · 토큰을 **인자로도 · 파일로도 · 화면으로도** 받지 않는다. 받는 순간 그 값이
 *   **셸 히스토리 · `ps` 의 프로세스 목록 · 이 저장소의 로그**에 남고, 이 저장소는 **공개 MIT** 다.
 * · ⛔ **`gh auth token` 을 부르지 않는다.** 부를 이유가 없다 — `gh` 가 자기 토큰으로 대신 묻는다.
 * · ⛔ **`gh auth login` 을 이 도구가 실행하지 않는다.** 로그인은 **사람이 한다.**
 *   안 돼 있으면 「`gh auth login` 을 먼저 하라」고 말하고 **⚪ 못 쟀다(3)** 로 끝낸다.
 *   도구가 대신 로그인 화면을 띄우면, 사람은 **자기가 어느 계정으로 들어갔는지 모른 채** 진행한다.
 * · `gh` 가 내는 말을 화면에 나를 때는 **토큰처럼 생긴 것을 지우고** 나른다(`hideSecrets`).
 *   `gh auth status` 는 이미 가려서 찍지만, **가려 주는 쪽을 믿고 안 가리면** 그쪽이 바뀌는 날 샌다.
 *
 * ## ⛔ 0은 무죄가 아니다 (관측 법칙 §8)
 *
 * 레포를 **0개 받았으면 「없다」가 아니다.** 셋 다 0으로 보인다 —
 * ① 진짜 없다 ② 토큰 스코프에 `repo` 가 없어 **비공개가 통째로 안 보인다**
 * ③ 그 소유자에 대한 권한이 없다. ⇒ **못 쟀다(3)** 로 끝내고 **분모를 같이 말한다.**
 *
 * ## ⚠️ 이 도구가 **못 재는 것** (§8 — 적어 둔다)
 *
 *   · **그 레포를 정말 받아 올 수 있는지**는 못 잰다. 목록에 떴다고 `git clone` 이 되는 것이 아니다
 *     (SSH 키만 있고 credential helper 가 없는 기계가 흔하다). 그건 `universe clone` 이 안다.
 *   · **목록이 전부인지** 못 잰다. `gh` 는 상한(`--limit`)까지만 준다 — 받은 수가 상한과 같으면
 *     **잘렸을 수 있다**고 말하지만, 진짜 총 개수는 안 묻는다.
 *   · **스코프 밖의 것**은 못 본다. 토큰에 `repo` 가 없으면 비공개는 아예 안 온다 —
 *     그래서 스코프를 화면에 같이 찍는다. **분모 없이 목록만 보면 「이게 전부」로 읽힌다.**
 *   · **어느 계정이 옳은지**는 못 정한다. 이 기계의 `gh` 가 활성 계정이라고 말한 것을 그대로 쓴다.
 *   · 네트워크·요금·속도는 안 잰다.
 *
 *   universe repos [<소유자>] [--limit <개수>] [--json]
 *
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3) — 여기서도 `spawn` 으로 직접 받는다.
 *
 * 종료 코드 — 이 저장소의 어휘는 셋이다
 *   0  **잰 초록** — 목록을 냈다(1개 이상)
 *   1  **잰 빨강** — 사람이 잘못 줬다(모르는 플래그 · 말이 안 되는 상한)
 *   3  **못 쟀다** — `gh` 가 없다 · 로그인이 안 됐다 · `gh` 가 거절했다 · **0개를 받았다**
 */
import { spawn } from 'node:child_process';

import { rejectUnknownFlags } from '../lib/flags.mjs';

/** 못 쟀다. ⛔ 1(어긋남)과 **절대 같은 값이면 안 된다** — 「없다」와 「못 봤다」가 붙어 버린다. */
const EXIT_UNMEASURED = 3;

const argv = process.argv.slice(2);
rejectUnknownFlags(argv, ['--limit', '--json'], 'universe repos');
const flagValue = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

/**
 * ⛔ **토큰처럼 생긴 것을 지운다.** `gh` 의 말을 그대로 나르다가 토큰이 화면·로그에 박히는 자리다.
 * ⚠️ 이것은 **하한**이다 — 여기 열거한 모양(§9 의 그 위험) 밖의 새 토큰 형식은 못 지운다.
 *   그래서 애초에 **토큰을 부르지 않는 것**(`gh auth token` 금지)이 1차 방어고, 이것은 2차다.
 */
const hideSecrets = (text) => String(text ?? '')
  .replace(/(token\s*[:=]\s*)\S+/gi, '$1***')
  .replace(/gh[pousr]_[A-Za-z0-9_]{4,}/g, '***')
  .replace(/github_pat_[A-Za-z0-9_]{4,}/g, '***')
  .replace(/\b[0-9a-f]{40}\b/g, '***');

/**
 * ⛔ 파이프를 안 쓴다(§3) — 종료코드를 `spawn` 에서 직접 받는다.
 * `error` 는 「도구가 없다」와 「도구가 실패했다」를 가르는 자리다(`lib/tool.mjs` 의 그 규율).
 */
const capture = (cmd, args) => new Promise((done) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => done({ code: code ?? 1, out, err, missing: false }));
  child.on('error', (e) => done({ code: 127, out, err: String(e?.message ?? e), missing: true }));
});

/** ⚪ 못 쟀다 — 사유를 대고 3으로 끝낸다. ⛔ 「없다」로 말하지 않는다(§8). */
const unmeasured = (lines) => {
  /* ⛔ ⚪ 는 **실패가 아니라 못 쟀다**다 — `console.error` 로 내면 `lib/why.mjs` 의 실패 패턴에
     새 기호가 필요해지고, 진단이 「왜 죽었나」에 「안 쟀다」를 섞는다(부품 시험이 옳게 물었다). */
  console.log(`⚪ 못 쟀다 — ${lines[0]}`);
  for (const line of lines.slice(1)) {
    console.error(`   ${line}`);
  }
  process.exit(EXIT_UNMEASURED);
};

/* 상한. ⛔ 말이 안 되는 값은 **조용히 고치지 않는다** — 고치면 사람이 준 것과 잰 것이 갈린다. */
const rawLimit = flagValue('--limit');
if (rawLimit !== undefined && !/^[1-9][0-9]*$/.test(String(rawLimit))) {
  console.error(`⛔ universe repos: --limit 은 1 이상의 정수라야 한다: ${rawLimit}`);
  process.exit(1);
}
const limit = Number(rawLimit ?? 30);

/* 소유자(계정·조직)는 **사람이 준다.** ⛔ 코드에 이름을 박지 않는다(관측 법칙 §9). */
const taken = new Set(['--limit'].flatMap((f) => (argv.includes(f) ? [argv[argv.indexOf(f) + 1]] : [])));
const owner = argv.find((a) => !a.startsWith('--') && !taken.has(a));
const asJson = argv.includes('--json');

/* ── ① `gh` 가 있는가 ─────────────────────────────────────────────────── */
const status = await capture('gh', ['auth', 'status']);
if (status.missing || status.code === 127) {
  unmeasured([
    '이 기계에 `gh`(GitHub CLI)가 없다.',
    '「레포가 없다」가 아니라 **묻지도 못했다**는 뜻이다(§8).',
    '먼저 깔아라: https://cli.github.com  ⇒ 그리고 `gh auth login`.',
    '⛔ 우주가 대신 깔거나 대신 로그인하지 않는다 — 자격은 사람과 gh 의 일이다.',
  ]);
}

/* ── ② 로그인이 돼 있는가. ⛔ 안 돼 있으면 **사람에게 시킨다** ────────── */
if (status.code !== 0) {
  unmeasured([
    '`gh` 가 이 기계에서 **로그인돼 있지 않다.**',
    '⛔ 우주는 `gh auth login` 을 **대신 실행하지 않는다** — 로그인은 사람이 한다.',
    '   (도구가 대신 띄우면 사람은 **자기가 어느 계정으로 들어갔는지 모른 채** 진행한다.)',
    '',
    '   $ gh auth login',
    '',
    '그리고 다시: universe repos',
    '── gh 가 한 말 (토큰처럼 생긴 것은 지웠다):',
    ...hideSecrets(`${status.err}${status.out}`).split('\n').filter(Boolean).map((l) => `   ${l}`),
  ]);
}

/**
 * 계정과 **스코프**를 읽는다. ⛔ 토큰 값은 안 읽는다 — `gh auth status` 는 이미 가려서 찍고,
 * 우리는 그 가려진 줄조차 `hideSecrets` 를 통과시켜 나른다.
 * ⚠️ 못 뽑으면 **지어내지 않는다** — 「모른다」로 찍는다(빈칸이 거짓말보다 낫다).
 */
const statusText = hideSecrets(`${status.out}${status.err}`);
const account = statusText.match(/account\s+([^\s(]+)/i)?.[1] ?? null;
const host = statusText.match(/^\s*([\w.-]+\.[a-z]{2,})\s*$/im)?.[1] ?? null;
const scopes = statusText.match(/scopes?\s*:\s*([^\n]+)/i)?.[1]?.replace(/'/g, '').trim() ?? null;
/* ⛔ **열거로 판정하지 않는다**(§9): `repo` 가 든 스코프면 무엇으로 불리든 비공개가 보인다. */
const seesPrivate = scopes === null ? null : /(^|[\s,])repo([\s,]|$)/.test(scopes);

/* ── ③ 목록을 받는다 ─────────────────────────────────────────────────── */
const FIELDS = 'nameWithOwner,description,visibility,isFork,isArchived,updatedAt,url';
const listed = await capture('gh', [
  'repo', 'list', ...(owner ? [owner] : []), '--limit', String(limit), '--json', FIELDS,
]);
if (listed.code !== 0) {
  unmeasured([
    `\`gh repo list\` 가 거절했다(종료코드 ${listed.code}).`,
    '「레포가 없다」가 아니라 **못 물었다**는 뜻이다(§8).',
    '── gh 가 한 말 (토큰처럼 생긴 것은 지웠다):',
    ...hideSecrets(`${listed.err}${listed.out}`).split('\n').filter(Boolean).map((l) => `   ${l}`),
  ]);
}

let repos;
try {
  repos = JSON.parse(listed.out);
} catch {
  unmeasured([
    '`gh` 가 준 것을 **JSON 으로 못 읽었다.**',
    'gh 판이 바뀌었거나 출력이 잘렸다 — 어느 쪽이든 「0개」가 아니다(§8).',
  ]);
}
if (!Array.isArray(repos)) {
  unmeasured(['`gh` 가 목록이 아닌 것을 줬다 — 「0개」가 아니라 **못 읽은 것**이다(§8).']);
}

/* ── ④ ⛔ **0은 무죄가 아니다** ───────────────────────────────────────── */
if (repos.length === 0) {
  unmeasured([
    `${owner ? `\`${owner}\` 에서 ` : ''}레포를 **0개 받았다.**`,
    '⛔ 이것은 「없다」가 **아니다.** 셋이 똑같이 0으로 보인다:',
    '   ① 진짜 없다',
    `   ② 토큰 스코프에 \`repo\` 가 없어 **비공개가 통째로 안 보인다** (지금 스코프: ${scopes ?? '모른다'})`,
    '   ③ 그 소유자(계정·조직)에 대한 권한이 없다',
    `── 분모: 계정 ${account ?? '모른다'}${host ? ` (${host})` : ''} · 소유자 ${owner ?? '(활성 계정 자신)'} · 상한 ${limit}개`,
    '   다른 소유자를 겨눠 보려면: universe repos <소유자>',
  ]);
}

/* ── ⑤ 냈다 ──────────────────────────────────────────────────────────── */
if (asJson) {
  /* 화면이 골라 넘기기 좋게. ⛔ 여기에도 토큰은 없다 — 애초에 안 받았다. */
  console.log(JSON.stringify({
    account, host, scopes, owner: owner ?? null, limit, count: repos.length,
    truncated: repos.length >= limit,
    repos: repos.map((r) => ({
      nameWithOwner: r.nameWithOwner,
      url: r.url,
      visibility: r.visibility,
      isFork: r.isFork,
      isArchived: r.isArchived,
      updatedAt: r.updatedAt,
      description: r.description ?? '',
    })),
  }, null, 2));
  process.exit(0);
}

console.log('── 이 기계의 `gh` 가 아는 계정으로 레포를 본다');
console.log(`   계정: ${account ?? '모른다'}${host ? ` (${host})` : ''} · 소유자: ${owner ?? '(활성 계정 자신)'}`);
console.log(`   토큰 스코프: ${scopes ?? '모른다'}`);
console.log('   ⛔ 토큰 값은 **읽지도 찍지도 않는다.**');
console.log('');

/**
 * ⚠️ **한글은 두 칸을 먹는다.** `padEnd` 는 글자 수를 세므로 한글 표식이 섞이면 줄이 어긋난다
 * (실측: 「비공개」와 「공개」가 한 칸씩 밀렸다). ⛔ 이건 예쁨이 아니라 **읽히는가**의 문제다 —
 * 어긋난 표를 사람은 대충 읽는다. ⚠️ 이 셈도 하한이다: 이모지·결합 문자는 못 잰다.
 */
const cells = (text, want) => {
  const s = String(text ?? '');
  const shown = [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
  return s + ' '.repeat(Math.max(0, want - shown));
};
const width = Math.max(...repos.map((r) => String(r.nameWithOwner ?? '').length));
repos.forEach((r, at) => {
  const marks = [
    r.visibility === 'PRIVATE' ? '비공개' : r.visibility === 'INTERNAL' ? '내부' : '공개',
    r.isFork ? '갈래' : null,
    r.isArchived ? '보관됨' : null,
  ].filter(Boolean).join('·');
  /* ⛔ **주소를 여기서 만들어 내지 않는다.** gh 가 준 것만 찍는다 — 지어내면 없는 자리를 가리킨다. */
  console.log(`  ${String(at + 1).padStart(3)}  ${cells(r.nameWithOwner, width)}  ${cells(marks, 14)}  ${r.url ?? '(주소를 못 받았다)'}`);
});

console.log('');
console.log(`── 분모: 상한 ${limit}개를 물어 **${repos.length}개**를 받았다.`);
if (repos.length >= limit) {
  console.log(`   ⚠️ 받은 수가 상한과 같다 — **잘렸을 수 있다.** 더 보려면 \`--limit ${limit * 2}\`.`);
}
if (seesPrivate === false) {
  console.log('   ⚠️ 토큰 스코프에 `repo` 가 없다 — **비공개 레포는 여기 안 나온다.** 「없다」가 아니다(§8).');
} else if (seesPrivate === null) {
  console.log('   ⚠️ 스코프를 못 읽었다 — **비공개가 다 보이는지 모른다.** 「다 봤다」로 읽지 마라(§8).');
}
console.log('   ⚠️ 목록에 떴다고 **받아 올 수 있다는 뜻은 아니다** — 그건 `universe clone` 이 안다.');

console.log('');
console.log('다음 — **고른 줄의 주소**를 그대로 넘겨라:');
console.log(`   universe clone ${repos[0].url ?? '<위 목록의 주소>'}`);
console.log('   ⛔ 여기서 받아 오지 않는다 — 받는 것은 `universe clone` 한 자리에서만 한다.');
console.log('   (화면·기계가 골라 넘기려면 `--json`)');
