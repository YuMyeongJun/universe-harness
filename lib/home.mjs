/**
 * 두 개의 집 — **패키지의 집**과 **우주의 집**은 다르다.
 *
 * 설치된 상태에서는 이렇게 갈린다:
 *
 *   node_modules/universe-front-harness/   ← 패키지의 집 (씨앗 · 엔진 · 스크립트)
 *   <소비 저장소>/universe/           ← 우주의 집 (법칙 · 은하 · 성운 · 로그)
 *
 * ⛔ **두 줄의 `universe` 는 서로 다른 것이다.** 위는 **패키지 이름**(`npm i <여기>`)이라
 *    `universe-front-harness` 이고, 아래는 `init` 이 만드는 **폴더 이름**이라 `universe` 그대로다
 *    (`bin/init.mjs` 의 `--dir` 기본값). ⚠️ 여기 `@scope/universe` 라고 적혀 있었는데
 *    그런 이름으로 발행한 적이 없다 — 짐작이 문서가 되면 다음 사람이 그것을 근거로 쓴다.
 *
 * ⚠️ 예전에는 스크립트가 `import.meta.url` 기준으로 `..` 를 세어 **자기 저장소를 우주로 가정**했다.
 *    그러면 소비 저장소에 설치됐을 때 **패키지 안의 법칙을 보고 소비 저장소의 은하를 못 찾는다.**
 *    그래서 우주의 집은 **cwd 에서 위로 올라가며 `universe.config.json` 을 찾는다**(git 이 `.git` 을 찾듯이).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exists = (p) => fs.stat(p).then(() => true).catch(() => false);

/** 이 패키지가 설치된 자리. 씨앗과 엔진이 여기 있다. */
export const packageHome = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 우주의 집을 찾는다. 순서: `--universe` → `UNIVERSE_HOME` → cwd 에서 위로 탐색.
 * 못 찾으면 null — 부르는 쪽이 안내하고 멈춘다(조용히 패키지 안을 보지 않는다).
 */
export const findUniverseHome = async (explicit) => {
  if (explicit) {
    return path.resolve(explicit);
  }
  if (process.env.UNIVERSE_HOME) {
    return path.resolve(process.env.UNIVERSE_HOME);
  }
  let dir = process.cwd();
  for (;;) {
    if (await exists(path.join(dir, 'universe.config.json'))) {
      return dir;
    }
    /* 소비 저장소는 보통 `<repo>/universe/` 에 우주를 깐다 — 한 겹 아래도 본다. */
    if (await exists(path.join(dir, 'universe', 'universe.config.json'))) {
      return path.join(dir, 'universe');
    }
    const up = path.dirname(dir);
    if (up === dir) {
      return null;
    }
    dir = up;
  }
};

/** 우주를 못 찾았을 때의 안내. 추측해서 도는 것보다 멈추는 것이 낫다(관측 법칙). */
export const requireUniverseHome = async (explicit) => {
  const home = await findUniverseHome(explicit);
  if (home) {
    return home;
  }
  console.error(
    [
      '우주를 찾지 못했다 — `universe.config.json` 이 있는 디렉터리가 없다.',
      '',
      '  · 소비 저장소라면 먼저 깔아라:  node <우주-저장소>/bin/init.mjs',
      /* ⛔⛔ **이 경고는 이름이 바뀌어도 그대로 유효하다 — 오히려 더 필요해졌다.**
         npm 의 `universe` 는 여전히 **남의 패키지**(crossfilter/universe)이고,
         이 패키지는 `universe-front-harness` 라는 **다른 이름**으로 올라간다. 그런데 **명령 이름**은
         `universe` 라서, 이미 깔린 저장소 안에서 npx 로 그 이름을 부르면 로컬 bin 이 잡히고
         **밖에서 부르면 남의 것을 내려받는다** — 같은 글자가 자리에 따라 다른 것을 가리킨다.
         ⇒ 안내에 그 형태를 아예 안 적는다(가르친 것이 상황에 따라 틀리면 안 가르친 것만 못하다).
         ⚠️ 이 줄에 `npx universe-front-harness …` 를 적지 마라 — 부품 시험의 `npx\s+universe\b`
         감시가 그것도 「남의 패키지를 시키는 자리」로 물어 버린다(정규식이 `-` 를 경계로 본다). */
      '    (⛔ `npx universe` 가 아니다 — npm 의 그 이름은 남의 패키지(crossfilter/universe)다.',
      '     이 패키지의 **npm 이름**은 `universe-front-harness` 이고, **명령 이름**만 `universe` 다)',
      '  · 다른 곳에 있다면:            --universe <경로>  또는  UNIVERSE_HOME=<경로>',
      '',
      `  (찾기 시작한 자리: ${process.cwd()})`,
    ].join('\n'),
  );
  process.exit(1);
};

/**
 * 관측 엔진의 자리. 우주의 집에 있으면 그것을, 없으면 **패키지가 들고 온 것**을 쓴다.
 * 소비 저장소는 엔진을 갖지 않는 것이 정상이다 — 엔진은 배달된다.
 */
export const resolveEngine = async (universeHome, configured) => {
  for (const candidate of [
    configured ? path.resolve(universeHome, configured) : null,
    path.join(universeHome, 'observatory/engine'),
    path.join(packageHome, 'observatory/engine'),
  ].filter(Boolean)) {
    if (await exists(path.join(candidate, 'packages/@core/fe-agent-contracts/dist/index.js'))) {
      return candidate;
    }
  }
  console.error(
    [
      '관측 엔진을 찾지 못했다.',
      '',
      '  **소비 저장소에는 엔진이 없는 것이 정상이다** — 엔진은 배달되지 않는다.',
      '  깔린 폴더 안에서 직접 부르지 말고, 우주 패키지의 CLI 로 부르고 그 폴더를 겨눠라:',
      '',
      '      universe observe --universe <깔린 폴더>',
      '',
      '  · 우주 저장소 자체라면 빌드가 필요하다:  cd observatory/engine && npm install && npm run build',
      '  · 엔진이 다른 곳에 있다면 universe.config.json 의 observatory.path 를 고쳐라',
    ].join('\n'),
  );
  process.exit(1);
};

/** 씨앗(법칙·궤도·힘 템플릿)의 자리. 항상 패키지가 들고 있다. */
export const seedHome = path.join(packageHome, 'seed');

/**
 * 우주 **자신의 소스**가 있는 자리인가 — 없으면 사유를 대고 죽는다.
 *
 * ⛔ 실측(R91): 소비 저장소에서 `universe/observatory/verify-enumeration.mjs` 를 직접 부르면
 * **생 ENOENT 스택트레이스**로 죽었다. 배달은 받았는데 그 자리에서는 영영 못 도는 도구다.
 * `universe check` 는 「여기선 못 잰다」고 제대로 말하지만, **폴더를 열어 직접 부른 사람**에게는
 * 아무도 말해 주지 않았다 — R90 이 고친 것과 같은 종류(이유를 안 대는 죽음)다.
 *
 * @param {string} home 우주의 집
 * @param {string} name 명령 이름(메시지에 쓴다)
 */
export const universeSourceProblem = async (home, name) => {
  if (await fs.stat(path.join(home, 'observatory/engine')).catch(() => null)) {
    return null;
  }
  return [
    `⛔ \`${name}\` 은 **우주 자신의 소스를 읽는 검사**라 배달본에서는 못 돈다.`,
    `   여기(${home})에는 규칙 소스(observatory/engine)가 없다 — 배달되지 않기 때문이다.`,
    '   당신 저장소에서 재고 싶은 것은 `universe check` 가 돌려 준다.',
  ].join('\n');
};

/** 위를 부르고, 문제가 있으면 사유를 찍고 죽는다. */
export const requireUniverseSource = async (home, name) => {
  const problem = await universeSourceProblem(home, name);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
};
