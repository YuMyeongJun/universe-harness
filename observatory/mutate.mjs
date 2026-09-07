#!/usr/bin/env node
/**
 * **손으로 거는 변이의 틀** — 「물었다」와 「사고로 죽었다」를 가른다.
 *
 * ## ⛔ 왜 생겼나 — 규칙 하나 = 사고 하나
 *
 * `observatory/verify-checks.mjs` 는 **등재된** 변이를 돌리며 이 규율을 이미 지킨다.
 * 그런데 **손으로 거는 변이**(검사를 새로 넣고 「정말 무나」 볼 때)에는 그 틀이 없다.
 * 이 세션에서만 **네 번** 밟았다:
 *   ① `perl` 이스케이프가 어긋나 **치환이 0건**인데 exit 0 → 「검사가 약하다」로 읽을 뻔했다
 *   ② 없는 문자열에 겨눠 **변이가 안 먹었다**(두 번)
 *   ③ 거절 갈래를 껐는데 **git 이 대신 죽어** exit≠0 → 「물었다」로 셀 뻔했다
 * ⚠️ 셋 다 **종료코드만 보면 구별이 안 된다.** 옆 저장소 세션도 같은 사고를 세 번 겪고
 * 같은 결론에 왔다: **「죽었다」는 판정이 아니다. 판정은 「그 이유로 죽었는가」다.**
 *
 * ## ⛔ 문법 검사에 기대지 않는다
 *
 * 「깨진 변이를 문법 검사로 거른다」로 가려다 **접었다**(옆 세션의 실측이 먼저 알려 줬다):
 * `.ts` 는 정상이어도 `node --check` 가 죽는다. 그리고 **애초에 필요 없다** —
 * 깨진 파일은 **기대한 사유를 못 낸다.** 문법 검사는 `.mjs`·`.sh` 에서만 **덤**으로 한다.
 *
 * ## ⛔ 겨냥은 「가드를 지운다」가 아니라 **「조건을 만든다」**로 잡는다
 *
 * 가드를 재려고 **가드를 지우면** 기준선이 이미 빨간 상태여야 하고, 그러면 이 틀이
 * **⚠️ 기준선빨강**으로 옳게 거부한다 — 옆 저장소 세션이 그 자리에서 「틀로는 못 쟀다」고 적었다.
 * ⇒ **가드가 막으려는 그 조건을 만들어라.** 기준선은 초록으로 남고, 가드가 있으면 빨개진다.
 *   · ✅ 훑개를 눈멀게 한다(정규식을 죽인다) → 「하나도 못 찾았다」로 물어야 한다
 *   · ⛔ 가드 줄을 지운다 → 기준선이 빨개서 못 잰다(그리고 그건 가드가 아니라 **조건**을 지운 것이다)
 * ⚠️ 실측: `verify-corpora` 의 분모 가드를 이 방식으로 쟀다 — 조건(눈멂)을 만드니 ✅ 물었다.
 *   그 전에 **두 번은 조건이 안 만들어져** ❌ 놓쳤다가 나왔고, 하마터면 「구멍」이라 적을 뻔했다.
 *
 * ## 여섯 갈래
 *
 *   ✅ 물었다       검증이 실패했고 **그 이유가 기대와 맞다**
 *   ⚠️ 사유불일치   죽긴 했는데 **다른 이유로** 죽었다
 *   ⚠️ 겨냥실패     앵커가 **0곳 또는 여럿** — 어디를 바꿀지 모른다
 *   ⚠️ 변이미적용   치환했는데 **원본과 같다**
 *   ⚠️ 변이본깨짐   싼 문법 검사가 죽었다 — **변이가 아니라 사고**다
 *   ❌ 놓쳤다       검증이 **통과했다** — 검사가 장식이다
 *   ⚠️ 기준선빨강   **변이 전부터 빨갛다** — 무슨 변이를 넣든 「물었다」로 보인다
 *
 * ⛔⛔ **마지막 갈래가 이 틀의 가장 위험한 구멍이었다.** 옆 저장소 세션이 자기 틀에서 먼저
 * 밟았다 — 복사본의 자기 시험이 애초에 실패하고 있어서 **세 건이 전부 ✅ 로 찍혔다.**
 * 여기서도 재현했다: 검증기가 늘 죽게 만들어 놓고 무해한 변이를 넣으니 **「✅ 물었다」**가 나왔다.
 * ⇒ **변이 전에 원본으로 한 번 돌린다.** 그때 이미 빨가면 그 뒤 판정은 전부 무의미하다.
 * ⚠️ 값은 싸지 않다(검증을 두 번 돌린다). 그런데 **거짓 초록보다 싸다** —
 *    이 틀의 존재 이유가 「죽었다」와 「그 이유로 죽었다」를 가르는 것인데,
 *    기준선이 빨가면 **그 구분 자체가 성립하지 않는다.**
 * ⛔ **어떤 경로로 끝나든 원본을 되돌린다.** 커밋 안 된 파일을 변이시키는 일이라 여기서 새면 끝이다
 *   (실측: `git checkout` 으로 커밋 안 된 새 검사를 통째로 지운 적이 있다).
 *
 * 재는 법:
 *   node observatory/mutate.mjs --file <경로> --from <문자열> --to <문자열> \
 *     --expect <거부 사유> -- <명령> [인자…]
 *   node observatory/mutate.mjs --self-test     # 여섯 갈래를 임시 파일로 전부 잰다
 * ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { rejectUnknownFlags } from '../lib/flags.mjs';

const argv = process.argv.slice(2);
const dashdash = argv.indexOf('--');
const mine = dashdash === -1 ? argv : argv.slice(0, dashdash);
const command = dashdash === -1 ? [] : argv.slice(dashdash + 1);
rejectUnknownFlags(mine, ['--universe', '--file', '--from', '--to', '--expect', '--self-test'], 'universe mutate');
const flag = (n) => (mine.includes(n) ? mine[mine.indexOf(n) + 1] : undefined);

/** 판정 여섯 갈래. ⛔ 「물었다」만 초록이다 — 나머지는 **재는 데 실패한 것**이다. */
export const VERDICTS = {
  BIT: '✅ 물었다',
  REASON: '⚠️ 사유불일치',
  AIM: '⚠️ 겨냥실패',
  NOOP: '⚠️ 변이미적용',
  BROKEN: '⚠️ 변이본깨짐',
  MISSED: '❌ 놓쳤다',
  RED: '⚠️ 기준선빨강',
};

/** 싼 문법 검사 — 아는 모양만. ⛔ 모르면 **검사했다고 말하지 않는다**(`null`). */
export const cheapSyntax = (file, text) => {
  const ext = path.extname(file);
  if (ext === '.mjs' || ext === '.js') {
    const probe = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    return probe.status === 0 ? null : (probe.stderr || '문법 오류');
  }
  if (ext === '.sh') {
    const probe = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
    return probe.status === 0 ? null : (probe.stderr || '문법 오류');
  }
  if (ext === '.json') {
    try {
      JSON.parse(text);
      return null;
    } catch (error) {
      return String(error.message);
    }
  }
  /* ⛔ `.ts` 는 **정상이어도** `node --check` 가 죽는다(타입 주석). 안 재고 안 재졌다고 말한다. */
  return null;
};

/**
 * 한 건을 재고 **갈래와 증거**를 돌려준다. ⛔ 파일은 반드시 원상복구된다.
 */
export const runMutation = async ({ file, from, to, expect, cmd, cwd = process.cwd() }) => {
  const at = path.resolve(cwd, file);
  const original = readFileSync(at, 'utf8');

  /* ⛔ 앵커가 **정확히 한 곳**이어야 한다. 0곳이면 안 바뀌고, 여럿이면 **어디가 바뀌었는지 모른다.** */
  const hits = original.split(from).length - 1;
  if (hits !== 1) {
    return { verdict: VERDICTS.AIM, evidence: `앵커가 ${hits}곳이다 (한 곳이어야 한다): ${from.slice(0, 60)}` };
  }

  const mutated = original.replace(from, to);
  if (mutated === original) {
    return { verdict: VERDICTS.NOOP, evidence: '치환했는데 원본과 같다 — 변이가 안 일어났다' };
  }

  /**
   * ⛔ **변이 전에 원본으로 한 번 돌린다** — 기준선이 이미 빨가면 무슨 변이든 「물었다」로 보인다.
   * `verify-checks` 는 이 가드를 갖고 있었는데(「깨끗한 상태에서 빨간 검사가 있다」),
   * 손 변이 틀에는 **안 옮겨졌다.** 옆 저장소 세션이 자기 틀에서 그 값을 먼저 치렀다.
   */
  const runCmd = () => new Promise((done) => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.stderr.on('data', (d) => { text += d; });
    child.on('close', (code) => done({ code, text }));
    child.on('error', (error) => done({ code: 127, text: String(error.message) }));
  });
  const baseline = await runCmd();
  if (baseline.code !== 0) {
    const why = baseline.text.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 160);
    return {
      verdict: VERDICTS.RED,
      evidence: `변이 전부터 빨갛다(종료코드 ${baseline.code}) — 이 위에서 재는 판정은 무의미하다: ${why}`,
    };
  }

  const restore = () => { writeFileSync(at, original); };
  const onSignal = () => { restore(); process.exit(130); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    writeFileSync(at, mutated);
    const broken = cheapSyntax(at, mutated);
    if (broken) {
      return { verdict: VERDICTS.BROKEN, evidence: broken.split('\n').slice(0, 3).join(' ').slice(0, 200) };
    }
    const out = await runCmd();
    if (out.code === 0) {
      return { verdict: VERDICTS.MISSED, evidence: '검증이 그대로 통과했다 — 이 검사는 장식이다' };
    }
    /* ⛔⛔ **판정은 종료코드가 아니라 거부 사유다.** 「죽었다」는 판정이 아니다 —
       git 이 대신 죽었을 수도, 파일이 깨져 죽었을 수도 있다(실측으로 둘 다 겪었다). */
    if (!out.text.includes(expect)) {
      const why = out.text.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 200);
      return { verdict: VERDICTS.REASON, evidence: `기대한 사유가 없다: 「${expect}」 · 실제로는: ${why}` };
    }
    return { verdict: VERDICTS.BIT, evidence: `종료코드 ${out.code} · 사유가 맞다` };
  } finally {
    restore();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
};

/* ── 자기 시험 — ⛔ 틀 자체가 「배선 안 된 검사기」가 되지 않게 ────────────── */

const selfTest = async () => {
  /* ⛔ **머리말을 먼저 찍는다.** 예전엔 문서·커버리지 가드가 머리말보다 **먼저 죽어서**,
     바깥에서 재던 검사가 「틀이 안 돌았다」고 말했다 — 죽은 이유가 한 겹 가려졌다. */
  console.log('── 손 변이 틀 — 자기 시험 (임시 파일로만 돈다)');
  const dir = mkdtempSync(path.join(tmpdir(), 'mutate-self-'));
  const write = (name, body) => {
    const at = path.join(dir, name);
    writeFileSync(at, body);
    return at;
  };
  /* 「거부 사유」를 내는 검증기 — 인자로 준 파일을 읽고 표식이 없으면 사유와 함께 죽는다. */
  const checker = write('check.mjs', [
    "import { readFileSync } from 'node:fs';",
    "const text = readFileSync(process.argv[2], 'utf8');",
    "if (!text.includes('SAFE')) { console.error('⛔ 표식이 사라졌다'); process.exit(1); }",
    "if (text.includes('BOOM')) { console.error('⛔ 다른 이유로 죽었다'); process.exit(1); }",
    'process.exit(0);',
  ].join('\n'));

  const cases = [
    ['물었다', { body: 'const a = "SAFE";\n', from: 'SAFE', to: 'GONE', expect: '표식이 사라졌다' }, VERDICTS.BIT],
    ['사유불일치', { body: 'const a = "SAFE";\n', from: '"SAFE"', to: '"SAFE"; const b = "BOOM"', expect: '표식이 사라졌다' }, VERDICTS.REASON],
    ['겨냥실패(0곳)', { body: 'const a = "SAFE";\n', from: '없는앵커', to: 'x', expect: '표식이 사라졌다' }, VERDICTS.AIM],
    ['겨냥실패(여러곳)', { body: 'const a = "SAFE"; const b = "SAFE";\n', from: 'SAFE', to: 'GONE', expect: '표식이 사라졌다' }, VERDICTS.AIM],
    ['변이미적용', { body: 'const a = "SAFE";\n', from: 'SAFE', to: 'SAFE', expect: '표식이 사라졌다' }, VERDICTS.NOOP],
    ['변이본깨짐', { body: 'const a = "SAFE";\n', from: 'const a', to: 'const const a', expect: '표식이 사라졌다' }, VERDICTS.BROKEN],
    ['놓쳤다', { body: 'const a = "SAFE"; const keep = 1;\n', from: 'const keep = 1', to: 'const keep = 2', expect: '표식이 사라졌다' }, VERDICTS.MISSED],
    /* ⛔ 검증기를 **늘 죽게** 만들어 놓고 무해한 변이를 넣는다 — 예전엔 이것이 「✅ 물었다」였다. */
    ['기준선빨강', { body: 'const a = "GONE"; const keep = 1;\n', from: 'const keep = 1', to: 'const keep = 2', expect: '표식이 사라졌다' }, VERDICTS.RED],
  ];

  let failed = 0;
  for (const [name, spec, want] of cases) {
    const target = write(`${name.replace(/[()]/g, '')}.mjs`, spec.body);
    const before = readFileSync(target, 'utf8');
    /* eslint-disable-next-line no-await-in-loop */
    const got = await runMutation({
      file: target, from: spec.from, to: spec.to, expect: spec.expect,
      cmd: [process.execPath, checker, target],
    });
    const restored = readFileSync(target, 'utf8') === before;
    const ok = got.verdict === want && restored;
    console.log(`  ${ok ? '✅' : '⛔'} ${name.padEnd(16)} → ${got.verdict}${restored ? '' : '  ⛔ 원복 안 됨'}`);
    if (!ok) {
      console.log(`     기대 ${want} · 증거: ${got.evidence}`);
      failed += 1;
    }
  }
  /**
   * ⛔⛔ **말한 갈래와 만든 갈래가 같은가** — 옆 저장소 세션이 「여섯을 가른다」고 적고
   * 일곱을 재고 있었다. **「검사가 무는가」의 한 단계 앞**, 「무엇을 만들었는지 세는 것」이다.
   * ⇒ 갈래를 하나 더 만들고 시험을 안 붙이면 여기서 문다.
   */
  /**
   * ⛔⛔ **문서가 말하는 갈래와 만든 갈래가 같은가.**
   * 옆 저장소 세션은 화면에 「여섯」이라 **적고** 일곱을 재고 있었다. 나는 그 실측을 듣고
   * 「시험을 안 붙인 갈래」는 막았는데, **문서에만 안 적는 것**은 열어 둔 채였다 —
   * 그 자리를 「하한이다」라고 적기만 하고 지나갔다. ⇒ 싸니까 막는다.
   * ⚠️ 문서는 사람이 처음 읽는 자리다. 거기 없는 갈래는 **없는 것과 같다.**
   */
  const usage = await readFile(new URL('../docs/02-usage.md', import.meta.url), 'utf8').catch(() => null);
  if (usage === null) {
    console.log('  ⏭  문서 대조 — `docs/02-usage.md` 가 없다(배달본이다). 못 쟀다.');
  } else {
    const documented = new Set(Object.values(VERDICTS).filter((v) => usage.includes(`| ${v} |`)));
    const missing = Object.values(VERDICTS).filter((v) => !documented.has(v));
    if (missing.length > 0) {
      console.error(`⛔ **문서에 없는 갈래 ${missing.length}개**: ${missing.join(' · ')}`);
      console.error('   `docs/02-usage.md` 의 `universe mutate` 표에 적어라 — 문서에 없으면 아무도 모른다.');
      process.exit(1);
    }
    /**
     * ⛔⛔ **문서가 말하는 「수」까지 대조한다** — 표는 맞는데 문장이 틀릴 수 있다.
     * 실측: 갈래를 일곱으로 늘리면서 문서에 **「여덟 갈래로 가른다」**고 적었다.
     * 자기 시험의 **케이스**가 여덟(겨냥실패를 0곳/여러곳 둘로 재서)이라 그 수를 옮겨 적은 것이다.
     * ⚠️ 옆 저장소 세션이 「여섯이라 적고 일곱을 쟀다」로 데인 **바로 그 자리를 그대로 밟았다** —
     *    남의 사고를 듣고 검사까지 넣어 놓고, **그 검사가 표만 보고 문장은 안 봤다.**
     */
    const KO = ['영', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
    /* ⛔ **수사만 본다.** 처음엔 `([가-힣]+) 갈래` 로 집었더니 「**아래** 갈래로 가른다」의
       「아래」를 **수로 읽고** 빨간불을 냈다(수를 지우자마자 났다). 훑개가 먼저 틀리는 자리다. */
    /* ⛔ 지금 문서에는 **수가 없다**(옆 세션의 처방: 대조 대신 제거 — 두 벌이 애초에 안 생긴다).
       이 갈래는 **누가 다시 적었을 때**를 위해 남긴다. 없으면 조용히 지나간다. */
    const stated = new RegExp(`(${KO.slice(1).join('|')}) 갈래로 가른다`).exec(usage)?.[1];
    const want = KO[Object.values(VERDICTS).length];
    if (stated && stated !== want) {
      console.error(`⛔ 문서가 **「${stated} 갈래」**라고 말하는데 실제로는 **${want} 갈래**다.`);
      console.error('   ⚠️ 「검사가 무는가」의 한 단계 앞 — **무엇을 만들었는지 세는 것**에서 틀린 자리다.');
      process.exit(1);
    }
    console.log(`  ⓘ 문서가 갈래 ${documented.size}개를 전부 적고, 「${stated ?? '?'} 갈래」라는 말도 맞다.`);
  }

  /* ⛔ **케이스를 다 돌고 나서** 본다 — 먼저 죽으면 화면에 판정이 하나도 안 남고,
     바깥에서 재는 검사가 「전부 안 쟀다」고 **틀린 진단**을 내놓는다(실측으로 겪었다). */
  const covered = new Set(cases.map(([, , want]) => want));
  const uncovered = Object.values(VERDICTS).filter((v) => !covered.has(v));
  if (uncovered.length > 0) {
    console.error(`⛔ **만들어 놓고 안 재는 갈래 ${uncovered.length}개**: ${uncovered.join(' · ')}`);
    console.error('   갈래를 늘렸으면 시험도 늘려라 — 안 재는 갈래는 있는지 없는지 아무도 모른다(§8).');
    process.exit(1);
  }

  rmSync(dir, { recursive: true, force: true });
  /* ⛔ 분모를 말한다 — 「0건 실패」는 **0건을 쟀을 때도** 참이다(§8). */
  console.log(`\n${failed === 0 ? '✅' : '⛔'} 갈래 ${cases.length}개 중 ${cases.length - failed}개가 제 갈래로 떨어진다.`);
  process.exit(failed === 0 ? 0 : 1);
};

/* ⚠️ `mine.includes(...)` 로 읽었더니 부품 시험이 **「허용해 놓고 안 읽는다」**고 물었다.
   훑개는 **읽는 방식**(`argv.includes` · `flag`)으로 판정한다 — 문자열 유무로 보면
   `git status --porcelain` 의 인자에 속기 때문이다. 훑개를 느슨하게 하는 대신 관례를 따른다. */
/* ⛔ **`argv` 가 아니라 `mine` 이다.** `argv` 는 `--` 뒤의 **명령까지** 담는다. 그래서
   `universe mutate … -- node observatory/mutate.mjs --self-test` 처럼 **자기를 검증기로 쓰면**
   바깥쪽이 그 `--self-test` 를 자기 것으로 읽고 **변이 대신 자기 시험을 돌린다**(실측으로 겪었다).
   ⚠️ 이 틀을 이 틀로 재는 순간 드러났다 — **도구를 자기 자신에게 써 보는 것**이 그래서 값싸다. */
const wantsSelfTest = mine.includes('--self-test');
if (wantsSelfTest) {
  await selfTest();
}

const file = flag('--file');
const from = flag('--from');
const to = flag('--to');
const expect = flag('--expect');
if (!file || from === undefined || to === undefined || !expect || command.length === 0) {
  console.error('쓰임: universe mutate --file <경로> --from <문자열> --to <문자열> --expect <거부 사유> -- <명령>');
  console.error('      universe mutate --self-test');
  console.error('  ⛔ `--expect` 는 **거부 사유**다. 종료코드로는 「물었다」와 「사고로 죽었다」가 구별되지 않는다.');
  process.exit(1);
}

const result = await runMutation({ file, from, to, expect, cmd: command });
console.log(`${result.verdict}  ${file}`);
console.log(`   ${result.evidence}`);
/* ⛔ 「물었다」만 0 이다. 「사유불일치」·「겨냥실패」는 **재는 데 실패한 것**이라 통과가 아니다. */
process.exit(result.verdict === VERDICTS.BIT ? 0 : 1);
