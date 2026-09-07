/**
 * 엔진을 여는 자리 — 빅뱅이 관측 엔진의 dist 를 import 하는 **유일한 경로**.
 *
 * 왜 따로 두는가: 1차 팽창(`bigbang.mjs`)과 3차 팽창(`nebula.mjs`) 이 **같은 관문**을 걸어야 한다.
 * 각자 법칙을 읽어 규칙을 세우면 두 개의 진실이 생기고, 어느 날 조용히 갈린다 —
 * 「관문은 통과했는데 에이전트 패치는 막힌다」 같은 자리가 그렇게 생긴다.
 *
 * ⛔ 엔진은 다른 갈래의 소유다. 여기서는 **dist 를 부르기만** 한다. 안을 헤집지 않는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { frontmatter } from '../lib/frontmatter.mjs';
import { pathToFileURL } from 'node:url';

import { openEngine } from '../lib/engine.mjs';

/** 관측 엔진의 두 패키지를 연다. ⛔ 배치를 아는 자리는 `lib/engine.mjs` **하나뿐**이다(R47). */
export const loadEngine = (root, config) => openEngine(root, config, ['contracts', 'harness']);

/**
 * 은하가 켠 법칙 → 관문 규칙.
 *
 * 법칙 문서의 frontmatter `rules: [...]` 가 진실이다. 규칙 id 를 여기 적지 않는다 —
 * 적는 순간 법칙 문서와 코드가 갈린다.
 */
/* ⚠️ **frontmatter 만 읽는다.** 그전엔 파일 전체를 훑어, 법칙 본문이 `rules: [...]` 를
   인용하면 **별의 관문이 엉뚱한 규칙 묶음**으로 세워질 수 있었다(R67 · R66 과 같은 종류). */
export const resolveGalaxyRules = async ({ root, galaxy, contracts }) => {
  const enabled = galaxy.laws ?? [];
  const lawRules = new Set();
  for (const name of enabled) {
    const text = await fs.readFile(path.join(root, 'laws', `${name}.md`), 'utf8').catch(() => '');
    for (const id of (frontmatter(text).rules ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)) {
      lawRules.add(id);
    }
  }
  const rules = Object.values(contracts.RULE_PRESETS).flat().filter((rule) => lawRules.has(rule.id));
  return { enabled, rules };
};

/** 관문의 레인. 은하가 켠 법칙이 이미 규칙을 골랐으므로 레인은 전부 연다. */
export const ALL_LANES = { quality: true, typeSafety: true, tailwind: true, a11y: true, delivery: true };
