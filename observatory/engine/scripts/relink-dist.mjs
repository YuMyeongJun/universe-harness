#!/usr/bin/env node
/**
 * **배달본에서 엔진이 스스로 서게 한다** — 형제 패키지를 *이름*이 아니라 *경로*로 부르게.
 *
 * ## ⛔⛔ 왜 필요한가 — 배달하면 엔진이 죽었다
 *
 * 엔진은 워크스페이스 모노레포다. `dist` 안의 코드가 형제를 **이름으로** 부른다:
 *
 *     import { … } from '@core/fe-agent-harness';
 *
 * 원본 저장소에서는 `observatory/engine/node_modules/` 에 워크스페이스 심링크가 있어서
 * 그 이름이 풀린다. ⛔ 그런데 **`node_modules` 는 npm 이 언제나 배달에서 뺀다.**
 * 그래서 배달본에서는 같은 줄이 이렇게 죽는다(실측):
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@core/fe-agent-contracts'
 *       imported from …/universe/observatory/engine/packages/@plugins/harness-react-vite/dist/scan.js
 *
 * ⚠️⚠️ 이것이 왜 치명적인가: 소비 저장소는 `observatory.path: ''` 로 깔린다 — 즉
 * **「패키지가 들고 온 엔진을 쓴다」**(`lib/home.mjs` 의 `resolveEngine`). 엔진이 안 서면
 * `observe` 가 거기서 못 돈다. ⛔ `observe` 는 **이 제품의 핵심 측정**이다.
 *
 * ## 재는 법 — 고치고 나서 반드시 확인한다
 *
 *     npm run engine:build            # 이 스크립트가 마지막에 돈다
 *     npm pack && (빈 폴더에 깔고) universe observe --universe universe
 *
 * ⛔ 원본에서 도는 것으로 확인했다고 하지 마라 — 원본에는 심링크가 있어서 **언제나 돈다.**
 * 그 둘을 가르지 못하는 것이 이 저장소가 반복해서 데인 자리다.
 *
 * ## ⚠️ 이 스크립트가 **안 하는 것**
 *
 * · **하위 경로 import 를 안 다룬다**(`@core/x/sub`). 지금은 그런 것이 하나도 없다 —
 *   실측으로 확인했다. ⛔ 생기면 **여기서 죽는다.** 조용히 넘기면 배달본에서만 죽는데,
 *   그건 원본에서 영영 안 보인다.
 * · **외부 의존을 안 다룬다.** 엔진 패키지들의 `dependencies` 는 지금 **전부 비어 있다**.
 *   생기면 그때는 이 방법이 아니라 진짜 `dependencies` 선언이 답이다.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PACKAGES = path.join(HERE, 'packages');

/** 이름 → 그 패키지의 dist 안 진입점. ⛔ 짐작이 아니라 각 `package.json` 에서 읽는다. */
const entryOf = async (dir, ext) => {
  const meta = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const main = meta.exports?.['.']?.default ?? meta.main ?? './dist/index.js';
  const js = path.join(dir, main);
  return ext === '.d.ts' ? js.replace(/\.js$/, '.d.ts') : js;
};

const walk = async (dir, out = []) => {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (full.endsWith('.js') || full.endsWith('.d.ts')) out.push(full);
  }
  return out;
};

/* 어떤 이름이 어느 폴더인지 — 실재하는 것만 담는다. */
const owners = new Map();
for (const scope of await readdir(PACKAGES, { withFileTypes: true })) {
  if (!scope.isDirectory()) continue;
  for (const pkg of await readdir(path.join(PACKAGES, scope.name), { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    owners.set(`${scope.name}/${pkg.name}`, path.join(PACKAGES, scope.name, pkg.name));
  }
}

/* 이름 → { '.js': 진입점, '.d.ts': 타입 진입점 }. ⛔ 미리 한 번만 읽는다. */
const entries = new Map();
for (const [name, dir] of owners) {
  entries.set(name, { '.js': await entryOf(dir, '.js'), '.d.ts': await entryOf(dir, '.d.ts') });
}

const BARE = /(from\s+['"])(@[a-z0-9-]+\/[a-z0-9-]+)(['"])/g;
let changedFiles = 0;
let rewrites = 0;
const unknown = new Set();
const subpaths = new Set();

for (const [, dir] of owners) {
  for (const file of await walk(path.join(dir, 'dist'))) {
    const before = await readFile(file, 'utf8');
    const ext = file.endsWith('.d.ts') ? '.d.ts' : '.js';

    /**
     * ⛔ 하위 경로 import 는 **말없이 넘기지 않는다** — 배달본에서만 죽는 종류다.
     * ⚠️⚠️ **단, 엔진이 소유한 이름만 본다.** 처음엔 모든 `@scope/pkg` 를 봤는데
     * `@testing-library/react` 가 걸렸다 — 그건 import 가 아니라 엔진이 **소비자에게
     * 만들어 주는 코드**(`s04-toss-quality.js` 의 `SEEDED_TEST` 템플릿 문자열) 안에 있었다.
     * ⛔ 남의 이름까지 잡으면 **가짜 빨간불**이 되고, 가짜 빨간불은 사람이 검사를 끄게 만든다.
     */
    for (const m of before.matchAll(/from\s+['"](@[a-z0-9-]+\/[a-z0-9-]+)\/[^'"]+['"]/g)) {
      if (owners.has(m[1])) subpaths.add(m[0]);
    }

    let touched = false;
    const after = before.replace(BARE, (whole, head, name, tail) => {
      const target = owners.get(name);
      if (target === undefined) {
        unknown.add(name);
        return whole;
      }
      touched = true;
      rewrites += 1;
      let rel = path.relative(path.dirname(file), entries.get(name)[ext]);
      if (!rel.startsWith('.')) rel = `./${rel}`;
      return `${head}${rel}${tail}`;
    });
    if (touched) {
      await writeFile(file, after, 'utf8');
      changedFiles += 1;
    }
  }
}

if (subpaths.size > 0) {
  console.error('⛔ 하위 경로 import 가 생겼다 — 이 스크립트가 못 다룬다:');
  for (const s of subpaths) console.error(`   ${s}`);
  console.error('   ⇒ relink-dist.mjs 를 넓히든지, 그 import 를 루트로 바꿔라.');
  console.error('   ⛔ 그냥 두면 **배달본에서만** 죽고 원본에서는 영영 안 보인다.');
  process.exit(1);
}
/**
 * ⛔⛔ **「dist 에 모르는 이름이 있다」로 외부 의존을 판단하지 않는다.**
 * 그렇게 했더니 `@testing-library/react` 가 걸렸는데, 그건 엔진이 **만들어 내는 코드**
 * 안의 문자열이었다 — 엔진이 그것을 부르는 것이 아니다. 가짜 빨간불이었다.
 * ⇒ 외부 의존은 **선언된 자리**에서 잰다. 그게 npm 이 실제로 설치를 결정하는 자리다.
 */
const declared = [];
for (const [name, dir] of owners) {
  const meta = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const deps = Object.keys(meta.dependencies ?? {});
  if (deps.length > 0) declared.push(`${name} → ${deps.join(' ')}`);
}
if (declared.length > 0) {
  console.error('⛔ 엔진 패키지에 외부 의존이 선언됐다:');
  for (const d of declared) console.error(`   ${d}`);
  console.error('   ⚠️ 배달본에는 `node_modules` 가 없다 — 이 의존은 **소비 저장소에서 안 깔린다.**');
  console.error('   ⇒ 상대경로로 못 푼다. 우주 패키지의 진짜 `dependencies` 로 올려야 한다.');
  process.exit(1);
}

if (unknown.size > 0) {
  /* ⚠️ 실패가 아니다 — 엔진이 소유하지 않은 이름은 대개 **생성 템플릿 안의 문자열**이다. */
  console.log(`  ⚠️ 엔진 밖 이름 ${unknown.size}종은 안 건드렸다: ${[...unknown].join(', ')}`);
}

console.log(`  ✅ 엔진 재연결 — 파일 ${changedFiles}개 · import ${rewrites}곳을 상대경로로`);
