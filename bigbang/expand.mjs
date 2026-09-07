/**
 * 2차 팽창 — **태어난 별을 게이트까지 밀어 본다.**
 *
 * 1차 팽창은 관문(정적 규칙)까지다. 관문은 별의 *글자*를 본다.
 * 게이트는 별이 **은하 안에서 실제로 도는지**를 본다 — lint · build · test · typecheck.
 * 둘은 다른 것을 재므로, 관문이 초록불이어도 게이트는 빨간불일 수 있다.
 *
 * ⛔ `observatory/verify.mjs` 는 다른 갈래의 소유다. 여기서는 **자식 프로세스로 부르기만** 한다.
 *    고치지 않는다. import 해서 안을 헤집지도 않는다 — 부르는 쪽이 게이트의 판정 규칙을
 *    다시 구현하기 시작하면 두 개의 진실이 생긴다.
 *
 * ⚠️ **파이프 뒤 종료코드로 판정하지 않는다**(관측 법칙 §3·§4).
 *    자식의 exit code 와 **출력 전체**를 둘 다 받아서 판정하고, 받은 출력은 한 줄도 버리지 않고
 *    화면에 그대로 흘린다. 걸러 본 화면 위에서 내린 판정은 판정이 아니다.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { packageHome } from '../lib/home.mjs';
import { firstFilled } from '../lib/pick.mjs';

/**
 * 게이트를 최대 몇 번 도는가 — **2번**(최초 1 + 자가 수정 후 재확인 1).
 *
 * 근거는 두 가지다.
 *  1) 게이트는 비싸다. 타입 인지 lint 저장소에서는 파일 하나만 재도 저장소 전체 타입 그래프를
 *     세운다(실측: `eslint ./src` 10.3초 → 21분). build 게이트의 타임아웃만 20분이다.
 *  2) 이 도구가 할 수 있는 자가 수정은 **eslint --fix 하나뿐이고, 그것은 멱등이다.**
 *     1회차에 --fix 가 못 고친 규칙은 2회차에도 못 고친다. 그러므로 3번째 게이트는
 *     **새 정보를 하나도 주지 못하면서** 20분을 더 쓴다. 상한은 정보가 끊기는 자리에 둔다.
 */
export const MAX_GATE_RUNS_SECOND = 2;

/** 종료코드 — 사람이 셋을 구분할 수 있어야 한다. */
export const EXIT = {
  ok: 0,
  /** 게이트가 **돌았고** 빨간불이었다. */
  gateRed: 1,
  /** 게이트가 **못 돌았다**(크래시·설정 오류). 잰 것이 없으므로 별을 판단하지 않았다. */
  gateDead: 2,
};

/* ─────────────────────────────────────────────────────────────────────
 * 자식 프로세스 — 출력을 흘리면서 동시에 모은다
 * ──────────────────────────────────────────────────────────────────── */

/**
 * 명령 하나를 돌리고 `{ code, output }` 을 준다.
 * 자식의 stdout/stderr 를 **한 줄도 빼지 않고** 접두사만 붙여 그대로 흘린다.
 * ⚠️ 접두사는 필터가 아니다 — 줄을 지우지 않는다. 지우기 시작하면 크래시가 시야 밖으로 나간다.
 */
const runChild = (command, args, { cwd, prefix }) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['inherit', 'pipe', 'pipe'], shell: false });
    let output = '';
    let pending = '';

    const flow = (chunk) => {
      const text = chunk.toString();
      output += text;
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        console.log(`${prefix}${line}`);
      }
    };

    child.stdout.on('data', flow);
    child.stderr.on('data', flow);
    child.on('error', (error) => {
      output += `\n${error.message}`;
      console.log(`${prefix}${error.message}`);
    });
    child.on('close', (code) => {
      if (pending !== '') {
        console.log(`${prefix}${pending}`);
      }
      resolve({ code: code ?? 1, output });
    });
  });

/** 셸이 필요한 명령(은하의 lint 명령은 문자열 하나로 온다). ⚠️ 3차의 계약 단계도 이것을 쓴다 — 두 번 구현하지 않는다. */
export const runShell = (command, { cwd, prefix }) =>
  new Promise((resolve) => {
    const child = spawn(command, { cwd, stdio: ['inherit', 'pipe', 'pipe'], shell: true });
    let output = '';
    let pending = '';
    const flow = (chunk) => {
      const text = chunk.toString();
      output += text;
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        console.log(`${prefix}${line}`);
      }
    };
    child.stdout.on('data', flow);
    child.stderr.on('data', flow);
    child.on('error', (error) => {
      output += `\n${error.message}`;
    });
    child.on('close', (code) => {
      if (pending !== '') {
        console.log(`${prefix}${pending}`);
      }
      resolve({ code: code ?? 1, output });
    });
  });

/* ─────────────────────────────────────────────────────────────────────
 * 게이트 부르기
 * ──────────────────────────────────────────────────────────────────── */

/**
 * `--base` 를 왜 `HEAD` 로 두는가.
 *
 * verify 의 변경분 계산은 `git diff --name-only <base>` **+ `git ls-files --others`** 다.
 * 갓 태어난 별은 **추적되지 않은 파일**이므로 base 가 무엇이든 후자에 잡힌다.
 * 그래서 `HEAD` 로 충분하고, `HEAD~1` 은 **직전 커밋에 들어 있던 남의 파일까지** 관문에
 * 끌고 들어온다 — 별의 잘못이 아닌 것으로 별이 막힌다. 그러므로 기본은 `HEAD`,
 * 사람이 굳이 넓히고 싶으면 `--base` 로 덮는다.
 */
export const DEFAULT_BASE = 'HEAD';

const verifyArgsOf = ({ galaxyName, root, base, judge }) => [
  '--universe', root,
  '--galaxy', galaxyName,
  '--base', base,
  /* 판정 레인(LLM)은 기본으로 끈다. 별은 방금 관문에서 **은하가 켠 법칙 전부**로 판정됐고,
     판정 레인은 모델 호출이라 느리고 비결정적이다. 자동 루프의 기본값은 결정론이어야 한다.
     사람이 원하면 `--judge` 로 켠다. */
  ...(judge ? [] : ['--static-only']),
];

/** 게이트 한 번. 출력과 종료코드를 **둘 다** 돌려준다. 3차 팽창(`nebula.mjs`)도 이 하나를 쓴다. */
export const runGate = async ({ root, galaxyName, base, judge }) => {
  const verifyPath = path.join(packageHome, 'observatory/verify.mjs');
  const args = verifyArgsOf({ galaxyName, root, base, judge });
  console.log(`\n── 게이트 — 자식 프로세스로 관측소를 부른다`);
  console.log(`   $ node ${verifyPath} ${args.join(' ')}\n`);
  const result = await runChild(process.execPath, [verifyPath, ...args], { cwd: root, prefix: '   │ ' });
  console.log(`\n   └ 자식 종료코드: ${result.code}`);
  return result;
};

/* ─────────────────────────────────────────────────────────────────────
 * 출력 읽기 — 무엇이 빨간불인가
 * ──────────────────────────────────────────────────────────────────── */

/**
 * verify 의 출력을 읽는다. 형식은 `observatory/engine` 의 `verify.ts` 가 낸다:
 *
 *   [CONTRACT REJECTED]\n<사유들>       ← 관문에서 막힘. 게이트는 아예 안 돎
 *   [CONTRACT ALLOWED] 변경 파일 N개
 *   ✅ lint:@acme/app error 0 · warning 3
 *   ❌ build exit 1
 *         <실패 출력 40줄>
 *   [SOLVED] | [NOT YET]
 *
 * ⚠️ `finished` 가 거짓이면 게이트가 **판정을 못 냈다**(크래시). 빨간불과 다른 사건이다.
 */
export const parseVerify = (output) => {
  const lines = output.split('\n');
  const contractRejected = lines.some((line) => line.startsWith('[CONTRACT REJECTED]'));

  /* 관문 사유: `1. [규칙] 경로:줄` — `formatFeedback` 이 내는 모양이다. */
  const contractReasons = [];
  for (const line of lines) {
    const matched = /^\s*\d+\.\s*\[([^\]]+)\]\s*(.+)$/.exec(line);
    if (matched && contractRejected) {
      contractReasons.push({ rule: matched[1], where: matched[2].trim() });
    }
  }

  /* 게이트 신호: `✅|❌ <이름> <수치>` + 뒤따르는 들여쓴 detail 줄들. */
  const signals = [];
  for (let i = 0; i < lines.length; i += 1) {
    const matched = /^(✅|❌)\s+(\S+)\s*(.*)$/.exec(lines[i]);
    if (!matched) {
      continue;
    }
    /* detail 은 여러 줄이다. `formatSignal` 이 첫 줄만 들여쓰므로 **들여쓰기로 끊으면 안 된다** —
       다음 신호(✅/❌)나 `[...]` 표지가 나올 때까지가 이 신호의 detail 이다. */
    const detail = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^(✅|❌)\s/.test(lines[j]) || /^\[/.test(lines[j].trim())) {
        break;
      }
      detail.push(lines[j].trim());
    }
    signals.push({ name: matched[2], ok: matched[1] === '✅', measured: matched[3].trim(), detail: detail.join('\n') });
  }

  const solved = lines.some((line) => line.trim() === '[SOLVED]');
  const notYet = lines.some((line) => line.trim() === '[NOT YET]');

  return {
    contractRejected,
    contractReasons,
    signals,
    /** 게이트가 끝까지 돌아 **판정을 냈는가.** 관문 반려도 판정이다. */
    finished: solved || notYet || contractRejected,
    solved,
  };
};

/* ─────────────────────────────────────────────────────────────────────
 * 귀속 — 이 빨간불은 별 탓인가 은하 탓인가
 * ──────────────────────────────────────────────────────────────────── */

export const inStar = (relPath, starDir) => relPath === starDir || relPath.startsWith(`${starDir}/`);

/**
 * 절대경로를 **은하 기준 상대경로**로 바꾼다.
 *
 * ⚠️ 심볼릭 링크가 귀속을 뒤집는다. macOS 에서 `/tmp` 는 `/private/tmp` 의 링크라
 *    lint JSON 의 `filePath` 와 은하의 `path` 가 서로 다른 문자열로 같은 파일을 가리킨다.
 *    실측(2026-09-04): 그대로 `path.relative` 하면 별의 파일이 `../../private/tmp/...` 가 되어
 *    **별 탓이 은하 탓으로 뒤집혔다.** 그래서 실제 경로까지 풀어 두 후보로 재본다.
 */
const relativeToGalaxy = (bases, absPath) => {
  for (const base of bases) {
    const rel = path.relative(base, absPath).split(path.sep).join('/');
    if (!rel.startsWith('..')) {
      return rel;
    }
  }
  return path.relative(bases[0], absPath).split(path.sep).join('/');
};

/** lint 신호 이름 → 게이트가 떨어뜨린 JSON 산출 경로(`gates.ts` 의 규칙과 같은 변환). */
export const lintJsonPathOf = (galaxyPath, signalName) =>
  path.join(galaxyPath, '.harness', `lint-${signalName.replace(/[^a-z0-9]/gi, '-')}.json`);

/**
 * lint 실패의 **정확한 증거**를 원본 산출(JSON)에서 읽는다.
 * ⚠️ 화면의 detail 은 `worst` 5개로 잘려 있다 — 그것으로 귀속을 판단하면 6번째 파일이 시야 밖이다.
 */
const lintErrorFiles = async (bases, signalName, notBefore = 0) => {
  const galaxyPath = bases[0];
  const file = lintJsonPathOf(galaxyPath, signalName);
  /* ⛔ **묵은 산출을 근거로 쓰지 마라**(R143). 실측: 게이트는 샌드박스 안에서 lint JSON 을 쓰고
   * 그 샌드박스는 사라진다. 은하 폴더에는 **이틀 묵은 같은 이름의 파일**이 남아 있었고, 귀속은
   * 그것을 읽어 「별의 폴더 안에는 error 가 하나도 없다 · 근거: 원본 산출」이라고 **확신했다** —
   * 같은 실행의 집안 규칙 관문은 「별이 error 15건」이라 말하고 있었는데.
   * 이제 이번 게이트보다 오래된 파일은 **없는 것으로 친다**. 못 읽으면 「못 읽었다」다(§8). */
  const stat = await fs.stat(file).catch(() => null);
  if (stat === null || stat.mtimeMs < notBefore) {
    return null;
  }
  const raw = await fs.readFile(file, 'utf8').catch(() => null);
  if (raw === null) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parsed
    .filter((file) => file.errorCount > 0)
    .map((file) => relativeToGalaxy(bases, file.filePath));
};

/**
 * build·test·typecheck 의 출력에서 경로처럼 생긴 토큰을 줍는다.
 * ⚠️ **추정이다.** 실패 출력의 형식은 도구마다 다르고 스택트레이스에는 남의 파일도 섞인다.
 *    그래서 이 결과는 사람에게 보여 줄 뿐 **자동 수정의 근거로 쓰지 않는다**(`planRepair` 참고).
 */
export const pathsMentioned = (text, bases) => {
  const found = new Set();
  for (const token of text.match(/[\w./@~-]*[\w-]\.(?:tsx?|jsx?|mjs|cjs)\b/g) ?? []) {
    const stripped = token.replace(/^file:\/\//, '');
    /* 슬래시가 없으면 경로가 아니라 낱말이다(`Node.js` 같은 것). */
    if (!stripped.includes('/')) {
      continue;
    }
    found.add(stripped.startsWith('/') ? relativeToGalaxy(bases, stripped) : stripped);
  }
  return [...found];
};

/**
 * 실패한 신호마다 「별 탓 / 은하 탓 / 섞임 / 모름」을 붙인다.
 *
 * - `exact: true`  — 원본 산출(lint JSON) 또는 관문의 `where` 에서 온 경로다. 자동 수정의 근거가 된다.
 * - `exact: false` — 실패 출력에서 주운 문자열이다. **사람에게 넘길 때만** 쓴다.
 */
export const attribute = async ({ parsed, galaxyPath, starDir, gateStartedAt = 0 }) => {
  const findings = [];
  /* 링크를 푼 경로를 후보로 함께 들고 간다(위 `relativeToGalaxy` 의 ⚠️ 참고). */
  const real = await fs.realpath(galaxyPath).catch(() => galaxyPath);
  const bases = real === galaxyPath ? [galaxyPath] : [galaxyPath, real];

  if (parsed.contractRejected) {
    const wheres = parsed.contractReasons.map((reason) => reason.where.split(':')[0]);
    findings.push({
      name: '관문(contract)',
      exact: true,
      paths: wheres,
      star: wheres.filter((p) => inStar(p, starDir)),
      outside: wheres.filter((p) => !inStar(p, starDir)),
      kind: 'contract',
      reasons: parsed.contractReasons,
    });
  }

  for (const signal of parsed.signals.filter((s) => !s.ok)) {
    const isLint = signal.name === 'lint' || signal.name.startsWith('lint:');
    const fromJson = isLint ? await lintErrorFiles(bases, signal.name, gateStartedAt) : null;
    const paths = fromJson ?? pathsMentioned(signal.detail, bases);
    findings.push({
      name: signal.name,
      exact: fromJson !== null,
      paths,
      star: paths.filter((p) => inStar(p, starDir)),
      outside: paths.filter((p) => !inStar(p, starDir)),
      kind: isLint ? 'lint' : 'command',
      measured: signal.measured,
      detail: signal.detail,
    });
  }

  return findings;
};

/**
 * **컴파일 실패 하나를 귀속한다** — 별 탓인가 · 은하 탓인가 · 아니면 **못 쟀나.**
 *
 * ⚠️⚠️ 셋째 갈래가 이 함수가 생긴 이유다(R146 실측). 진짜 은하에서 `yarn build` 가
 * **0.2초 만에** exit 1 로 죽었다 — `Environment variable not found (NODE_AUTH_TOKEN)`.
 * yarn 이 자기 설정에서 멈춰 **컴파일에 들어가지도 못한** 것인데, 도구는
 * 「⛔ 별이 은하에서 서지 않는다」고 말하고 2차 팽창을 끊었다.
 * 그 별은 멀쩡히 컴파일된다 — env 를 채우고 같은 명령을 돌려 반증했다.
 * ⇒ 우주가 **못 잰 것을 별의 잘못으로** 돌리고 있었다(§8).
 *
 * ⛔ **사유 문자열을 열거해서 가르지 않는다**(§9 · R29 가 열거의 한계를 적어 뒀다).
 *    증거로 가른다: 컴파일러가 별을 봤다면 실패 출력에 **파일 경로가 나온다**
 *    (`tsc` 도 `vite` 도 그렇다). 한 줄도 없으면 우리가 잰 것은 아무것도 없다.
 *
 * @returns `{ kind: 'unmeasured' | 'galaxy' | 'star', paths, starPaths }`
 */
export const attributeCompileFailure = ({ out, bases, starDir }) => {
  const paths = pathsMentioned(out, bases);
  const starPaths = paths.filter((p) => inStar(p, starDir));
  if (paths.length === 0) {
    return { kind: 'unmeasured', paths, starPaths };
  }
  return { kind: starPaths.length === 0 ? 'galaxy' : 'star', paths, starPaths };
};

/* ─────────────────────────────────────────────────────────────────────
 * 자가 수정 — 할 수 있는 것은 하나뿐이다
 * ──────────────────────────────────────────────────────────────────── */

/**
 * **고칠 수 있는 것과 없는 것.**
 *
 * 고칠 수 있다 — `eslint --fix` 가 고치는 lint error 가 **전부 별의 폴더 안**에 있을 때.
 *   별의 폴더는 방금 이 명령이 만든 것이고 그 안에는 우리가 쓴 4개 파일밖에 없다. 그러므로
 *   범위를 그 폴더로 묶으면 은하의 코드를 건드릴 수 없다. 이 부류가 실제로 흔하다 —
 *   템플릿은 은하의 import 순서·따옴표·세미콜론 컨벤션을 모르고 태어나기 때문이다.
 *
 * 고칠 수 없다(그리고 고친 척하지 않는다):
 *   · 관문 반려 — 템플릿이 법칙을 어긴다는 뜻이다. **고칠 곳은 별이 아니라 템플릿**이고,
 *     그것은 우주의 자산이라 사람이 정한다. 별을 고치면 다음 별이 같은 위반을 다시 찍는다.
 *   · build·test·typecheck 실패 — 실패 출력에서 파일을 줍는 것은 **추정**이고, 고치려면
 *     코드의 뜻을 알아야 한다. 규칙이 아니라 판단이다.
 *   · 별의 폴더 **밖**의 실패 — 별의 잘못이 아니다. 은하가 원래 빨간불이었을 수 있다.
 *   · 테스트를 지우거나 완화하는 것 — ⛔ 그것은 수정이 아니라 증거 인멸이다.
 *     `{Star}.test.tsx` 는 행동 계약이다.
 */
export const planRepair = ({ findings, galaxy, relDir }) => {
  if (findings.some((f) => f.kind === 'contract')) {
    return { can: false, why: '관문 반려는 템플릿의 문제다 — 별을 고쳐서 지나가면 다음 별이 같은 위반을 찍는다.' };
  }

  const failing = findings.filter((f) => f.paths.length > 0 || f.kind !== 'lint');
  const lintOnly = findings.every((f) => f.kind === 'lint');
  if (!lintOnly) {
    const other = findings.filter((f) => f.kind !== 'lint').map((f) => f.name);
    return { can: false, why: `lint 밖의 게이트가 빨간불이다(${other.join(' · ')}) — 자동 수정의 근거가 되는 원본 산출이 없다.` };
  }
  /* ⚠️ 이 둘을 **한 말로 뭉뚱그리면 안 된다**(R143).
   *  · 신호가 아예 없다  → 우리 파싱이 깨졌을 수 있다.
   *  · 신호는 있는데 별의 파일에 error 가 하나도 없다 → **파싱은 멀쩡하고 별이 무죄다.**
   *  실측: 은하 전체를 무는 규칙을 켜자 lint error 52개가 났고, 별의 파일은 error 0이었다.
   *  도구는 옳게 거절했지만 「출력 형식이 바뀌었을 수 있다」고 말해 **없는 고장을 가리켰다.**
   *  읽는 사람을 엉뚱한 곳으로 보내는 거절 사유는 거절하지 않는 것만큼 나쁘다. */
  if (findings.length === 0) {
    return { can: false, why: '실패한 신호를 찾지 못했다 — 출력 형식이 바뀌었을 수 있다.' };
  }
  if (failing.length === 0) {
    return {
      can: false,
      why: '별의 폴더 안에는 lint error 가 하나도 없다 — 이 빨간불은 별의 것이 아니다(은하가 원래 빨갰나 재라).',
    };
  }
  const notExact = findings.filter((f) => !f.exact);
  if (notExact.length > 0) {
    return { can: false, why: `lint JSON 산출을 읽지 못했다(${notExact.map((f) => f.name).join(' · ')}) — 추정으로 코드를 고치지 않는다.` };
  }
  const outside = findings.flatMap((f) => f.outside);
  if (outside.length > 0) {
    return { can: false, why: `별의 폴더 밖에 error 가 있다 — 별의 잘못이 아니다: ${[...new Set(outside)].slice(0, 5).join(', ')}` };
  }

  /* 여기까지 왔으면 error 는 전부 별의 폴더 안이다. 명령을 은하의 것으로 세운다. */
  const commands = [];
  for (const finding of findings) {
    const workspace = finding.name.startsWith('lint:') ? finding.name.slice('lint:'.length) : '';
    const target = fixTargetOf({ galaxy, relDir, workspace });
    if (target === null) {
      return {
        can: false,
        why: `lint 대상 워크스페이스 ${workspace || '(단일)'} 안에서 별의 자리를 확정할 수 없다 — 잘못된 경로에 --fix 를 걸지 않는다.`,
      };
    }
    /* ⛔ 빈 문자열이 통과하면 **빈 명령을 돌린다**(R46 과 같은 종류). */
    const template = firstFilled(galaxy.commands?.lintFix, `${firstFilled(galaxy.commands?.lintJson) ?? ''} --fix`);
    if (!galaxy.commands?.lintJson && !galaxy.commands?.lintFix) {
      return { can: false, why: '은하에 lintJson/lintFix 명령이 없다 — 무엇으로 고칠지 모른다.' };
    }
    commands.push(
      template
        .replaceAll('<WORKSPACE>', workspace)
        .replaceAll('<TARGET>', target)
        .replaceAll('<OUT>', `.harness/lint-fix-${workspace.replace(/[^a-z0-9]/gi, '-') || 'app'}.json`),
    );
  }
  return { can: true, commands };
};

/**
 * `<TARGET>` 을 별의 폴더로 좁힌다.
 * ⚠️ 워크스페이스 명령은 **그 워크스페이스 디렉터리**에서 돈다. 별이 앱 워크스페이스에 있을 때만
 *    `appDir` 기준으로 상대경로를 낼 수 있다. 다른 워크스페이스면 자리를 모르므로 `null`(=포기).
 */
const fixTargetOf = ({ galaxy, relDir, workspace }) => {
  if (workspace === '') {
    return `./${relDir}`;
  }
  if (workspace !== galaxy.appWorkspace) {
    return null;
  }
  const rel = path.relative(galaxy.appDir === '' ? '.' : galaxy.appDir, relDir).split(path.sep).join('/');
  return rel.startsWith('..') ? null : `./${rel}`;
};

/* ─────────────────────────────────────────────────────────────────────
 * 되돌리기
 * ──────────────────────────────────────────────────────────────────── */

/**
 * 태어난 별을 지운다.
 *
 * ⛔ **우리가 쓴 그대로인 파일만** 지운다. 게이트는 몇 분이 걸리므로 그 사이에 사람이 별을
 *    고쳤을 수 있다. 내용이 달라졌으면 남의 작업이다 — 남기고 알린다.
 * ⛔ 별의 폴더만 지운다. 만들어 준 상위 폴더는 건드리지 않는다 — 은하의 구조는 은하의 것이다.
 */
export const revertStar = async ({ targetBase, files, relDir }) => {
  const removed = [];
  const kept = [];
  for (const file of files) {
    const abs = path.join(targetBase, file.path);
    const current = await fs.readFile(abs, 'utf8').catch(() => null);
    if (current === null) {
      continue;
    }
    if (current !== file.content) {
      kept.push(file.path);
      continue;
    }
    await fs.rm(abs);
    removed.push(file.path);
  }
  const dir = path.join(targetBase, relDir);
  const rest = await fs.readdir(dir).catch(() => ['(못 읽음)']);
  if (rest.length === 0) {
    await fs.rmdir(dir).catch(() => {});
  }
  return { removed, kept, dirRemoved: rest.length === 0 };
};

/* ─────────────────────────────────────────────────────────────────────
 * 보고 — 사람에게 넘기는 자리
 * ──────────────────────────────────────────────────────────────────── */

const templateOf = (starFilePath, starName) =>
  `bigbang/templates/star/${path.basename(starFilePath).replaceAll(starName, '__Star__')}.tpl`;

export const reportFindings = ({ findings, starName, starDir, dirtyBefore }) => {
  console.log('\n── 빨간 축');
  for (const finding of findings) {
    const scope =
      finding.star.length > 0 && finding.outside.length > 0
        ? '섞임 — 별과 은하 양쪽'
        : finding.star.length > 0
          ? '별 탓'
          : finding.outside.length > 0
            ? '은하 탓 — 별의 폴더 밖'
            : '모름 — 실패 출력에서 파일을 특정하지 못했다';
    console.log(`   ❌ ${finding.name}${finding.measured ? ` (${finding.measured})` : ''}`);
    console.log(`      귀속: ${scope}${finding.exact ? ' · 근거: 원본 산출' : ' · 근거: 실패 출력에서 주움(추정)'}`);
    for (const p of [...new Set([...finding.star, ...finding.outside])].slice(0, 8)) {
      console.log(`        · ${p}${inStar(p, starDir) ? '  ← 별' : ''}`);
    }
    if (finding.kind === 'contract') {
      for (const reason of finding.reasons) {
        const file = reason.where.split(':')[0];
        console.log(`        · [${reason.rule}] ${reason.where}`);
        if (inStar(file, starDir)) {
          console.log(`          → 고칠 곳은 별이 아니라 템플릿이다: ${templateOf(file, starName)}`);
        }
      }
    }
  }

  if (dirtyBefore.length > 0) {
    /* ⚠️ **누가 더럽혔는지 말한다.** 실측(R46): 진짜 은하에서 더러운 세 항목이
       `.harness/` · `universe/` · 갓 태어난 별 — **셋 다 우주 자신이 만든 것**이었다.
       뭉뚱그려 「더럽다」고만 하면 사람은 자기 코드를 뒤지다 시간을 버린다.
       재는 도구가 자기 산출물로 자기 측정을 오염시켜 놓고 남 탓처럼 말하면 안 된다. */
    const mine = dirtyBefore.filter((line) => /(^|\s)(\?\?\s+)?(\.harness|universe)\//.test(line));
    const theirs = dirtyBefore.filter((line) => !mine.includes(line));
    console.log(
      `\n   ⚠️ 별이 태어나기 전에 이미 워킹트리가 더러웠다(${dirtyBefore.length}개 항목).` +
        (mine.length > 0
          ? `\n      그중 ${mine.length}개는 **우주 자신이 만든 것**이다: ${mine.map((l) => l.replace(/^\?\?\s*/, '')).join(' · ')}` +
            '\n      `universe/` 는 커밋해라(법칙과 기준선은 팀의 합의다). `.harness/` 는 gitignore 다.'
          : '') +
        (theirs.length > 0 ? `\n      나머지 ${theirs.length}개는 은하의 것이다.` : '') +
        '\n      이 빨간불이 별 때문인지 원래 그랬는지는 **이 실행으로는 가릴 수 없다.**' +
        '\n      깨끗한 상태에서 한 번 재라 — 그것이 유일한 근거다.',
    );
  }
};

/* ─────────────────────────────────────────────────────────────────────
 * 본체
 * ──────────────────────────────────────────────────────────────────── */

/**
 * 2차 팽창을 돈다. 별은 **이미 쓰여 있어야** 한다(1차가 끝난 뒤 불린다).
 *
 * 흐름: 게이트 → (빨간불) 귀속 → (고칠 수 있으면) 자가 수정 → 게이트 재확인 → 판정/되돌리기.
 * 반환값은 프로세스 종료코드다(`EXIT`).
 */
export const runSecondExpansion = async ({
  root,
  galaxyName,
  galaxy,
  files,
  relDir,
  starName,
  targetBase,
  base = DEFAULT_BASE,
  judge = false,
  keepOnFail = false,
  autoFix = true,
  dirtyBefore = [],
}) => {
  let run = 0;
  let repaired = false;

  for (;;) {
    run += 1;
    /* 게이트가 **시작한 시각**을 잡아 둔다 — 귀속은 이보다 오래된 lint 산출을 안 믿는다(R143). */
    const gateStartedAt = Date.now();
    const gate = await runGate({ root, galaxyName, base, judge });
    const parsed = parseVerify(gate.output);

    /* ⚠️ 판정은 **종료코드와 출력 둘 다**로 한다. 하나만 보면 크래시를 빨간불로 오독한다. */
    if (!parsed.finished) {
      console.log('\n⛔ 게이트가 판정을 내지 못했다 — [SOLVED]/[NOT YET]/관문 반려 중 어느 줄도 없다.');
      console.log('   관측소가 죽었거나 은하 좌표가 틀렸다. **별을 판단한 것이 아니므로 되돌리지 않는다.**');
      console.log(`   별은 그대로 있다: ${path.join(targetBase, relDir)}`);
      console.log(`   직접 재라: node observatory/verify.mjs --galaxy ${galaxyName}`);
      return EXIT.gateDead;
    }

    if (gate.code === 0 && parsed.solved) {
      console.log(`\n⭐ 별이 게이트를 지난다${repaired ? ' (자가 수정 1회 후)' : ''} — ${path.join(targetBase, relDir)}`);
      console.log('\n다음:');
      console.log('  1. 라우트에 잇는다 (은하의 라우터) — 게이트는 별이 도는지 볼 뿐, 사람이 볼 수 있는지는 안 본다');
      console.log('  2. 데이터 소스를 붙인다 (훅의 TODO)');
      return EXIT.ok;
    }

    /* 종료코드와 출력이 어긋나면 그 사실 자체를 적는다. 조용히 한쪽을 믿지 않는다. */
    if ((gate.code === 0) !== parsed.solved) {
      console.log(`\n⚠️ 종료코드(${gate.code})와 마지막 줄(${parsed.solved ? '[SOLVED]' : '[NOT YET]'})이 어긋난다.`);
      console.log('   빨간불로 읽는다 — 어긋난 관측은 통과의 근거가 될 수 없다.');
    }

    const findings = await attribute({ parsed, galaxyPath: galaxy.path, starDir: relDir, gateStartedAt });
    reportFindings({ findings, starName, starDir: relDir, dirtyBefore });

    if (run >= MAX_GATE_RUNS_SECOND) {
      console.log(`\n   (게이트 상한 ${MAX_GATE_RUNS_SECOND}회에 닿았다 — 더 돌아도 새 정보가 없다)`);
      return await handOff({ findings, targetBase, files, relDir, galaxyName, keepOnFail, starDir: relDir });
    }

    const plan = autoFix
      ? planRepair({ findings, galaxy, relDir })
      : { can: false, why: '--no-fix — 자가 수정을 끄고 돌렸다.' };

    if (!plan.can) {
      console.log(`\n── 자가 수정: 하지 않는다`);
      console.log(`   ${plan.why}`);
      return await handOff({ findings, targetBase, files, relDir, galaxyName, keepOnFail, starDir: relDir });
    }

    console.log('\n── 자가 수정 — 별의 폴더 안으로만 범위를 묶는다');
    let fixOk = true;
    for (const command of plan.commands) {
      console.log(`   $ ${command}`);
      const fix = await runShell(command, { cwd: galaxy.path, prefix: '   │ ' });
      /* eslint 는 남은 error 가 있으면 0 이 아니다 — 그것은 실패가 아니라 **아직 빨간불**이다.
         고쳤는지는 다음 게이트가 판정한다. 여기서는 명령이 아예 못 돈 경우만 가른다. */
      if (fix.code !== 0 && /command not found|not recognized|ENOENT/i.test(fix.output)) {
        console.log(`   ⛔ 명령을 돌리지 못했다 — 은하의 lint 명령을 확인하라.`);
        fixOk = false;
      }
    }
    if (!fixOk) {
      return await handOff({ findings, targetBase, files, relDir, galaxyName, keepOnFail, starDir: relDir });
    }

    /* ⚠️ 자가 수정은 별의 파일을 바꾼다. 여기서 다시 찍지 않으면 되돌리기가 그 변경을
       「게이트가 도는 동안 사람이 고쳤다」로 읽고 **파일을 못 지운다**(실측 2026-09-04).
       우리가 낸 변경은 우리 것이다 — 남의 변경만 보호한다. */
    for (const file of files) {
      const abs = path.join(targetBase, file.path);
      file.content = await fs.readFile(abs, 'utf8').catch(() => file.content);
    }
    repaired = true;
    console.log('\n   수정했다면 게이트가 재확인한다 — 「고쳤다」는 선언이 아니라 측정이다.');
  }
};

/**
 * 끝내 빨간불일 때. **기본은 되돌리기다.**
 *
 * 근거 셋:
 *  1) 1차와 같은 불변을 지킨다 — 「빅뱅이 빨간불로 끝나면 은하에 흔적이 없다」.
 *     1차는 관문 위반이면 파일을 아예 쓰지 않는다. 2차만 반쯤 태어난 별을 남기면 규칙이 둘이 된다.
 *  2) 빅뱅은 **덮어쓰지 않는다.** 실패한 별을 남기면 다음 시도가 「이미 있다」로 막혀,
 *     사람이 먼저 손으로 지워야 한다. 되돌리기가 없으면 이 명령은 한 번밖에 못 쓴다.
 *  3) 별은 **재생 가능하다.** 같은 명령 한 줄로 다시 태어난다. 은하의 워킹트리는 그렇지 않다.
 *
 * ⚠️ 되돌려도 **원인은 사라지지 않는다.** 그래서 지우기 전에 빨간 축을 전부 찍는다.
 *    조사하려면 `--keep-on-fail` 로 별을 남겨라.
 */
const handOff = async ({ findings, targetBase, files, relDir, galaxyName, keepOnFail }) => {
  const onlyOutside = findings.length > 0 && findings.every((f) => f.star.length === 0 && f.outside.length > 0);

  console.log('\n── 사람에게 넘긴다');
  if (onlyOutside) {
    console.log('   빨간 축이 **전부 별의 폴더 밖**이다 — 이 빨간불은 별의 잘못이 아니다.');
    console.log('   은하를 먼저 초록불로 만든 뒤 다시 태워라.');
  } else {
    console.log('   위의 빨간 축을 사람이 읽어야 한다. 이 도구가 고칠 수 있는 부류가 아니다.');
  }

  if (keepOnFail) {
    console.log(`\n   --keep-on-fail — 별을 남긴다: ${path.join(targetBase, relDir)}`);
    console.log('   ⚠️ 게이트를 지나지 않은 별이 은하에 남아 있다. 고치거나 지워라.');
    return EXIT.gateRed;
  }

  const reverted = await revertStar({ targetBase, files, relDir });
  console.log(`\n   되돌렸다 — 지운 파일 ${reverted.removed.length}개${reverted.dirRemoved ? ' + 빈 폴더' : ''}`);
  for (const p of reverted.removed) {
    console.log(`     - ${p}`);
  }
  if (reverted.kept.length > 0) {
    console.log(`   ⚠️ 내용이 달라져 남긴 파일 ${reverted.kept.length}개 — 게이트가 도는 동안 누군가 고쳤다:`);
    for (const p of reverted.kept) {
      console.log(`     · ${p}`);
    }
  }
  console.log(`\n   남기고 싶으면: universe new <은하> <태양계> <별> --expand --keep-on-fail`);
  console.log(`   게이트만 다시: node observatory/verify.mjs --galaxy ${galaxyName}`);
  return EXIT.gateRed;
};
