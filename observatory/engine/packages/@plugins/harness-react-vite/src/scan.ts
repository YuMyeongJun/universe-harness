/**
 * `fe-harness scan` — 관문의 **결정론 레인을 지금 코드베이스에 그대로 걸어 본다.**
 *
 * 훈련장을 돌리기 전에 이걸 먼저 해라. 두 가지를 알려 준다:
 *   1) 이 관문이 우리 코드에서 무엇을 잡는가 (얹을 가치가 있는가)
 *   2) 잡은 것 중 **오탐이 얼마나 되는가** — 표본을 눈으로 봐야 안다.
 *
 * ⚠️ 이것은 게이트가 아니다. 항상 0으로 끝난다 — 수치를 보고 사람이 판단하는 명령이다.
 *    작은 표본에서 오탐 0 은 아무것도 보장하지 않는다(whitehole-front 1,227개 파일에
 *    걸었을 때 오탐 3종 · 100건이 드러났다). 새 규칙을 넣으면 반드시 한 번 걸어 봐라.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { isBlindPath, isSourcePath, runStaticRules } from '@core/fe-agent-contracts';
import type { IContractLanes, IPatchFile, IStaticRule } from '@core/fe-agent-harness';

const ALL_LANES: IContractLanes = { quality: true, typeSafety: true, tailwind: true, a11y: true, delivery: true };

/**
 * **규칙이 읽을 수 있는 것과, 코드인데 못 읽는 것.**
 *
 * ⚠️⚠️ 이 분모가 없어서 **44% 를 못 보면서 멀쩡해 보였다.** Nuxt 저장소에 우주를 깔아 봤더니
 * 코드 파일 217개 중 `.vue` 95개를 규칙이 아예 안 읽는데, 105건이 보고돼 정상으로 보였다.
 * 규칙 13개 중 11개가 **0건**인 것도 「위반 없음」으로 읽혔다 — 관측 법칙 §8 이 제품 층에서 난 것이다.
 * ⇒ 못 읽은 것을 **세어서 말한다.** 세지 않으면 사용자는 자기 UI 절반이 안 재졌다는 걸 알 길이 없다.
 *
 * ⛔⛔ **여기 목록을 다시 적지 마라 — 적었다가 갈렸다(R47·R91).**
 * 이 파일은 `READABLE`/`CODE_BUT_BLIND` 를 **자기 것으로 한 벌 더** 갖고 있었다. 그래서
 * 규칙 쪽(`applies`)에서 `.js`·`.jsx` 를 열었는데도 **파일이 규칙까지 오지 못했고**,
 * `census` 는 「.js 를 100% 읽는다」 · `observe` 는 「못 읽은 파일 2개」라고 **서로 반대말을 했다.**
 * ⇒ 판정은 규칙 패키지(`rules/helpers.ts`)가 한 자리에서 한다. 여기는 **가져다 쓴다.**
 *
 * ⛔ `.vue`·`.svelte`·`.astro` 가 아직 「못 읽는」 쪽인 이유도 거기 적혀 있다 —
 *    **문법이 달라서**지(`<template>` 블록) 깜빡한 것이 아니다. 열려면 그 주석부터 읽어라.
 */

const walk = async (dir: string): Promise<{ seen: string[]; blind: string[] }> => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry): Promise<{ seen: string[]; blind: string[] }> => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === 'node_modules' || entry.name.startsWith('.')
          ? { seen: [], blind: [] }
          : walk(full);
      }
      /* 테스트 파일은 뺀다 — 규칙 대부분이 프로덕션 코드를 겨냥한 것이라 신호가 흐려진다.
         ⚠️ 이건 **일부러 안 보는 것**이라 눈먼 것과 다르다. 그래서 blind 에도 안 넣는다. */
      if (/\.(test|spec)\./.test(entry.name)) {
        return { seen: [], blind: [] };
      }
      if (isSourcePath(entry.name)) {
        return { seen: [full], blind: [] };
      }
      return { seen: [], blind: isBlindPath(entry.name) ? [full] : [] };
    }),
  );
  return {
    seen: nested.flatMap((n) => n.seen),
    blind: nested.flatMap((n) => n.blind),
  };
};

export interface IScanResult {
  fileCount: number;
  /** 코드인데 규칙이 못 읽은 파일 — 확장자별 개수. **커버리지의 분모다.** */
  blind: [string, number][];
  /**
   * **실제로 읽은 파일의 상대경로.**
   * ⚠️ 예전엔 관측이 지문을 `samples` 에서 만들었는데, `--sample` 을 안 주면 표본이 **항상 비어**
   * 지문이 은하마다 늘 `e3b0c442…`(빈 문자열의 해시)였다. 상수인 줄 아무도 몰랐다 —
   * 깨끗한 은하만 재고 있었기 때문이다. 잰 것으로 지문을 만든다.
   */
  paths: string[];
  total: number;
  byRule: [string, number][];
  samples: { rule: string; where: string; evidence: string; fix?: string }[];
}

export const scanCodebase = async (options: {
  repoRoot: string;
  targets: string[];
  rules: IStaticRule[];
  sampleCount?: number;
  ruleFilter?: string;
  /**
   * **분모에서 뺄 것** — 저장소 뿌리 기준 상대경로를 받아 참이면 안 훑는다.
   *
   * ⛔ 여기에 `dist`·`build` 같은 **이름 목록을 넣지 마라**(§9). 사람이 정한 이름을 열거하면
   * 이름이 다른 저장소에서 조용히 새어 든다. 부르는 쪽이 **구조로 판정해서** 넘긴다 —
   * 우주는 `git ls-files --others --ignored` 를 쓴다(`lib/git-ignored.mjs`).
   *
   * ⚠️ 실측(R163): 이 갈래가 없어서 벤더링된 엔진의 **`dist/` 생성물**이 훑혔고,
   * 규칙이 **자기 예시 문자열을 물어** `.mjs` 도구 코드에서 「tailwind 임의 값 55건」이 나왔다.
   * `census` 는 생성물을 분모 밖으로 뺐는데 `observe` 는 안 뺐다 — **두 도구가 반대말을 했다.**
   */
  ignore?: (relPath: string) => boolean;
}): Promise<IScanResult> => {
  const walked = await Promise.all(options.targets.map((target) => walk(path.join(options.repoRoot, target))));
  const keep = (full: string): boolean =>
    !options.ignore || !options.ignore(path.relative(options.repoRoot, full).split(path.sep).join('/'));
  const files = walked.flatMap((w) => w.seen).filter(keep);
  const blindCounts = new Map<string, number>();
  /* ⛔ **못 읽는 것도 같은 축으로 뺀다.** 한쪽만 빼면 「못 읽는 비율」이 거짓이 된다. */
  for (const file of walked.flatMap((w) => w.blind).filter(keep)) {
    const ext = path.extname(file);
    blindCounts.set(ext, (blindCounts.get(ext) ?? 0) + 1);
  }
  const patches: IPatchFile[] = await Promise.all(
    files.map(async (file) => ({
      path: path.relative(options.repoRoot, file),
      content: await fs.readFile(file, 'utf8'),
    })),
  );

  const reasons = runStaticRules(patches, options.rules, ALL_LANES).filter(
    (reason) => !options.ruleFilter || reason.rule === options.ruleFilter,
  );

  const counts = new Map<string, number>();
  for (const reason of reasons) {
    counts.set(reason.rule, (counts.get(reason.rule) ?? 0) + 1);
  }

  /* 표본은 **고르게** 뽑는다 — 앞에서 N개만 보면 한 파일에서만 뽑혀 오탐 판단이 왜곡된다. */
  const wanted = options.sampleCount ?? 8;
  const step = Math.max(1, Math.floor(reasons.length / wanted));
  const samples = reasons
    .filter((_, index) => index % step === 0)
    .slice(0, wanted)
    /* ⛔ `fix` 를 안 실어 보냈다(R94). 규칙마다 처방을 강제해 놓고(`universe fix`) 정작
       **사람이 보는 화면에는 안 왔다** — 자리는 알려 주면서 무엇을 하라고는 안 한 것이다.
       R35: 「처방 없는 관문은 무시하는 법부터 가르친다.」 */
    .map((reason) => ({
      rule: reason.rule, where: reason.where, evidence: reason.evidence, fix: reason.fix,
    }));

  return {
    fileCount: patches.length,
    paths: patches.map((patch) => patch.path),
    blind: [...blindCounts].sort((left, right) => right[1] - left[1]),
    total: reasons.length,
    byRule: [...counts].sort((left, right) => right[1] - left[1]),
    samples,
  };
};

export const formatScan = (result: IScanResult, presets: string[]): string => {
  const lines = [
    `파일 ${result.fileCount.toLocaleString()}개 · 사유 ${result.total.toLocaleString()}건  (preset: ${presets.join(' · ')})`,
    ...(result.blind.length > 0
      ? [`⚠️ 코드인데 **규칙이 못 읽은 파일** ${result.blind.reduce((sum, [, n]) => sum + n, 0)}개 — ${result.blind.map(([ext, n]) => `${ext} ${n}`).join(' · ')}`]
      : []),
    '',
  ];
  for (const [rule, count] of result.byRule) {
    lines.push(`${String(count).padStart(6)}  ${rule}`);
  }
  lines.push('', `표본 ${result.samples.length}건 — **눈으로 보고 오탐을 세라**:`, '');
  for (const sample of result.samples) {
    lines.push(`  [${sample.rule}] ${sample.where}`);
    lines.push(`      ${sample.evidence.slice(0, 120)}`);
  }
  lines.push(
    '',
    '오탐이 보이면 규칙을 고쳐라. 관문이 헛돌면 에이전트는 관문을 무시하는 법부터 배운다.',
  );
  return lines.join('\n');
};
