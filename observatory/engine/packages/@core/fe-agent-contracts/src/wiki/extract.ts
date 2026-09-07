/**
 * WikiSkill 추출 — 성공 궤적에서 지식 카드를 뽑아 스킬 디렉터리에 쌓는다.
 *
 * ⚠️ 이 스크립트가 지식을 만드는 것이 아니다. **필터**다 — 무엇을 넣지 않을지가 본체다.
 *    지식창고가 커지면 읽는 길목이 길어지고, 길어진 길목은 안 읽힌다.
 *
 * ⚠️ 경로는 하나도 하드코딩하지 않는다. 저장소 루트·지식창고 위치·하우스룰 파일은 전부
 *    `IExtractOptions` 로 받는다 — 그래야 다른 프로젝트에서 그대로 돈다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callClaude } from '@core/fe-agent-harness';
import type { IClaudeCall, IClaudeResult } from '@core/fe-agent-harness';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXTRACT_PROMPT_PATH = path.join(here, '..', 'prompts', 'EXTRACT_PROMPT.md');

export interface IWikiCard {
  id: string;
  title: string;
  scope: string[];
  rule: string;
  why: string;
  verify: string;
  counterexample: string;
  confidence: 'high' | 'medium';
  supersedes: string;
}

export interface IExtractOptions {
  repoRoot: string;
  /** 카드가 쌓이는 곳. 예: `.claude/skills/wiki-frontend/knowledge` */
  knowledgeDir: string;
  /** 카드 목록을 다시 쓰는 스킬 index. 예: `.claude/skills/wiki-frontend/SKILL.md` */
  indexPath: string;
  /** 이미 문서가 말하고 있는 것을 카드로 만들지 않기 위해 넣는다. 예: `CLAUDE.md` */
  houseRulesPath?: string;
  /** 스킬 index 머리말(프로젝트 소개 한 문단). */
  skillDescription?: string;
  /** 카드를 다시 뽑는 명령 — index 에 그대로 적힌다. */
  regenerateCommand?: string;
  model?: string;
  dryRun?: boolean;
  /**
   * 모델 호출부. 기본은 `callClaude` 다 — **바꾸지 않으면 동작은 그대로다.**
   * 테스트가 고정 응답을 꽂아 궤적 없이 전 경로(접기 → 파싱 → 두 필터 → 파일 쓰기 → index)를
   * 재현하려고 뚫어 놓은 자리다. 실제 LLM 없이 수율을 재려면 이것 말고는 방법이 없었다.
   */
  callModel?: (call: IClaudeCall) => Promise<IClaudeResult>;
  /** 오늘 날짜. 호출자가 준다(스크립트가 시간을 몰래 읽으면 재현이 안 된다). */
  today: string;
}

interface IEntry {
  kind: string;
  step: number;
  stageId: string;
  [key: string]: unknown;
}

const readTrajectory = async (filePath: string): Promise<IEntry[]> => {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as IEntry);
};

/** 궤적을 프롬프트 입력으로 접는다. 원문을 통째로 넣으면 판단이 아니라 요약이 나온다. */
export const foldTrajectory = (entries: IEntry[]) => {
  const submit = [...entries].reverse().find((entry) => entry.kind === 'submit');
  const rejects = entries.filter((entry) => entry.kind === 'contract' && entry.decision === 'REJECTED');

  const lines = entries
    .filter((entry) => entry.kind !== 'log')
    .map((entry) => {
      if (entry.kind === 'probe' || entry.kind === 'shell') {
        return `- step ${entry.step} probe(exit ${String(entry.exit)}): ${String(entry.command)}`;
      }
      if (entry.kind === 'contract') {
        const verdict = entry.verdict as { reasons?: { rule: string }[] } | undefined;
        const rules = (verdict?.reasons ?? []).map((reason) => reason.rule);
        return `- step ${entry.step} contract ${String(entry.decision)}${rules.length ? ` [${[...new Set(rules)].join(', ')}]` : ''} ${String(entry.note ?? '')}`;
      }
      if (entry.kind === 'submit') {
        const gates = (entry.gates as { name: string; ok: boolean; measured?: string }[]) ?? [];
        const checks = (entry.checks as { name: string; ok: boolean; measured?: string }[]) ?? [];
        return [
          `- step ${entry.step} submit ${String(entry.decision)} reward=${String(entry.reward)}`,
          ...[...gates, ...checks].map((signal) => `    ${signal.ok ? 'PASS' : 'FAIL'} ${signal.name} ${signal.measured ?? ''}`),
        ].join('\n');
      }
      return `- step ${entry.step} ${entry.kind}`;
    });

  return {
    outcome: String(submit?.decision ?? 'UNKNOWN'),
    reward: Number(submit?.reward ?? 0),
    rejects: rejects.length,
    steps: entries.at(-1)?.step ?? 0,
    text: lines.join('\n'),
    diff: String(submit?.diff ?? ''),
    stageId: entries[0]?.stageId ?? 'unknown',
  };
};

const existingCards = async (knowledgeDir: string) => {
  const files = await fs.readdir(knowledgeDir).catch(() => [] as string[]);
  const cards = await Promise.all(
    files
      .filter((name) => name.endsWith('.md'))
      .map(async (name) => {
        const body = await fs.readFile(path.join(knowledgeDir, name), 'utf8');
        return `- ${name.replace(/\.md$/, '')}: ${/^title:\s*(.+)$/m.exec(body)?.[1] ?? ''}`;
      }),
  );
  return cards.join('\n') || '(비어 있음)';
};

/**
 * verify 명령 안의 경로 토큰 중 저장소에 없는 첫 번째를 돌려준다(글롭은 **글롭 앞까지만** 본다).
 *
 * ⚠️ 실측(2026-09-04, 수율 계측): 이 함수는 두 자리에서 **멀쩡한 카드를 죽이고 있었다.**
 *    (a) 글롭을 `path.dirname` 으로 잘라 **마지막 한 칸만** 떼어 냈다. 이중 별표가 가운데 낀
 *        경로에서는 잘라 낸 뒤에도 별표가 남아 stat 이 항상 실패한다 — 「src 아래 tsx 전부」를
 *        훑는 가장 흔한 형태의 verify 를 통째로 「없는 경로」로 버렸다.
 *    (b) 앞의 슬래시가 매치 **밖에** 남아 **절대 경로가 저장소 상대 경로로 둔갑했다.**
 *        `-o /tmp/lint.json` 이 `<repo>/tmp/lint.json` 으로 읽혔다 — 이 저장소가 권장하는
 *        「lint JSON 을 /tmp 에 떨구고 세라」 형태의 verify 가 통째로 버려지고 있었다.
 *        같은 결함이 URL 도 죽였다. 그리고 옛 URL 가드(`^https?:`)는 **한 번도 물지 않았다** —
 *        토큰 정규식이 `:` 를 못 먹어 매치가 스킴 뒤(`example.com/a/b`)에서 시작했기 때문이다.
 *    둘 다 필터가 **조용히** 새는 쪽이 아니라 **조용히 무는** 쪽 결함이라 수를 재기 전에는 안 보였다.
 *
 * ⚠️ URL 을 따로 지우는 줄은 **두지 않는다.** `스킴://호스트/경로` 는 `//` 때문에 언제나
 *    슬래시로 시작하는 토큰이 되어 아래 절대 경로 가드에 걸린다 — 변이 시험으로 확인했다
 *    (URL 제거 줄을 떼도 셀프테스트가 초록이었다). 시험이 못 무는 줄은 두지 않는다.
 */
export const firstMissingPath = async (verify: string, repoRoot: string): Promise<string | null> => {
  /* 앞의 `/` 를 **매치 안에** 넣어야 절대 경로를 절대 경로로 알아본다(밖에 두면 상대 경로로 둔갑한다). */
  for (const token of verify.match(/(?:\.\/|\/)?[\w.@-]+(?:\/[\w.*@-]+)+/g) ?? []) {
    /* 저장소 밖(절대 경로 · URL)과 플래그는 판정 대상이 아니다 — 없다고 벌하면 멀쩡한 카드가 죽는다. */
    if (token.startsWith('/') || /^--/.test(token)) {
      continue;
    }
    /* 글롭이 나오는 순간부터는 확인할 수 없다 — 그 **앞까지만** 실재를 묻는다. */
    const segments = token.split('/');
    const globAt = segments.findIndex((segment) => segment.includes('*'));
    const probe = globAt === -1 ? token : segments.slice(0, globAt).join('/');
    /* 상위로 튀어 오르는 토큰(`../x`)은 저장소 밖이라 판정 대상이 아니다. */
    if (!probe || probe.split('/').includes('..')) {
      continue;
    }
    const exists = await fs
      .stat(path.join(repoRoot, probe))
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      return token;
    }
  }
  return null;
};

/** 카드 id 는 파일 이름이 된다. 모델이 준 문자열을 그대로 `path.join` 에 넣으면 안 된다. */
const isSafeCardId = (id: string | undefined): id is string => /^[\w.-]+$/.test(id ?? '') && !/^\.+$/.test(id ?? '');

const toMarkdown = (card: IWikiCard, stageId: string, today: string) =>
  `---
id: ${card.id}
title: ${card.title}
scope: [${card.scope.join(', ')}]
confidence: ${card.confidence}
source: envharness/${stageId}
created: ${today}
${card.supersedes ? `supersedes: ${card.supersedes}\n` : ''}---

## 규칙
${card.rule}

## 왜 (관측된 근거)
${card.why}

## 다시 재는 법
\`\`\`bash
${card.verify}
\`\`\`

${card.counterexample ? `## 그럴듯한 오답\n${card.counterexample}\n` : ''}`;

const rewriteIndex = async (options: IExtractOptions) => {
  const files = (await fs.readdir(options.knowledgeDir)).filter((name) => name.endsWith('.md')).sort();
  const rows = await Promise.all(
    files.map(async (name) => {
      const body = await fs.readFile(path.join(options.knowledgeDir, name), 'utf8');
      const title = /^title:\s*(.+)$/m.exec(body)?.[1] ?? name;
      const scope = /^scope:\s*(.+)$/m.exec(body)?.[1] ?? '';
      return `| ${scope} | [${title}](knowledge/${name}) |`;
    }),
  );

  const skill = `---
name: ${path.basename(path.dirname(options.indexPath))}
description: ${options.skillDescription ?? '이 저장소의 프론트엔드 실전 지식창고. EnvHarness 궤적에서 **실제로 관측된** 규칙만 모았다.'}
---

# 프론트엔드 지식창고 (EnvHarness 추출)

카드는 전부 **관측에서 나왔다.** 각 카드에는 다시 재는 명령이 있다 — 인용하지 말고 재라.
카드와 코드베이스가 어긋나면 **코드베이스가 이긴다.** 그 자리에서 카드를 고쳐라.

| 범위 | 카드 |
|------|------|
${rows.join('\n')}

## 새 카드는 어떻게 들어오나

\`${options.regenerateCommand ?? 'yarn harness:wiki <궤적.jsonl>'}\` — 성공 궤적에서만 뽑는다.
손으로 추가하지 마라. 관측 없는 카드가 한 장 섞이면 나머지 카드의 신뢰도까지 같이 떨어진다.
`;
  await fs.writeFile(options.indexPath, skill, 'utf8');
};

export const extractWikiCards = async (trajectoryPaths: string[], options: IExtractOptions): Promise<IWikiCard[]> => {
  await fs.mkdir(options.knowledgeDir, { recursive: true });
  const houseRules = options.houseRulesPath ? await fs.readFile(options.houseRulesPath, 'utf8').catch(() => '') : '';
  const accepted: IWikiCard[] = [];

  for (const target of trajectoryPaths) {
    const folded = foldTrajectory(await readTrajectory(path.resolve(options.repoRoot, target)));
    if (folded.outcome !== 'SOLVED') {
      console.log(`건너뜀(${folded.outcome}): ${target} — 실패 궤적은 카드가 되지 않는다.`);
      continue;
    }

    const answer = await (options.callModel ?? callClaude)({
      systemPromptFile: EXTRACT_PROMPT_PATH,
      input: [
        `[STAGE] ${folded.stageId}`,
        `[OUTCOME] ${folded.outcome} · reward=${folded.reward} · 스텝 ${folded.steps} · Contract 반려 ${folded.rejects}회`,
        '[TRAJECTORY]',
        folded.text,
        '[FINAL_DIFF]',
        folded.diff.slice(0, 60_000),
        '[EXISTING_CARDS]',
        await existingCards(options.knowledgeDir),
        '[HOUSE_RULES]',
        houseRules.slice(0, 20_000),
      ].join('\n'),
      model: options.model ?? 'opus',
    });
    if (answer.isError) {
      throw new Error('추출기 호출이 실패했다(인증·모델 확인).');
    }

    /* ⚠️ 0장은 정당한 결과다 — 그런데 예전엔 배열이 없는 응답이 `JSON.parse('')` 로 **터져서**
       궤적 여러 개를 한꺼번에 날렸다. 못 읽은 응답은 그 궤적만 0장으로 접고 넘어간다. */
    const start = answer.text.indexOf('[');
    const end = answer.text.lastIndexOf(']');
    let cards: IWikiCard[] = [];
    try {
      /* 대괄호가 아예 없으면 `slice(-1, 0)` 이 빈 문자열이 되어 여기서 던진다 — 그것도 0장이다. */
      const parsed: unknown = JSON.parse(answer.text.slice(start, end + 1));
      cards = Array.isArray(parsed) ? (parsed as IWikiCard[]) : [];
    } catch {
      cards = [];
    }
    if (cards.length === 0) {
      console.log(`카드 0장: ${target} — 응답에서 카드 배열을 못 읽었거나 낼 것이 없었다.`);
    }

    for (const card of cards) {
      if (!isSafeCardId(card.id) || (card.supersedes && !isSafeCardId(card.supersedes))) {
        /* id 는 그대로 파일 이름이 되고 `supersedes` 는 그대로 `fs.rm` 에 들어간다.
           `../../CLAUDE` 같은 id 하나가 지식창고 밖 파일을 지울 수 있었다. */
        console.log(`버림(id 형태 위반): ${String(card.id)}`);
        continue;
      }
      if (!card.verify?.trim()) {
        console.log(`버림(재는 법 없음): ${card.id}`);
        continue;
      }
      /* ⚠️ 실측으로 드러난 실패 모드(2026-09-04 스모크): 추출기가 경로를 **재구성**한다.
         `dist/index.html` 을 `apps/partners/dist/index.html` 로 고쳐 쓴 카드가 나왔다
         (실제 outDir 은 저장소 루트 `dist/` 다). 존재하지 않는 경로를 가리키는 카드는 버린다 —
         한 장이 틀리면 나머지 카드의 신뢰도까지 같이 떨어진다. */
      const ghost = await firstMissingPath(card.verify, options.repoRoot);
      if (ghost) {
        console.log(`버림(없는 경로 ${ghost}): ${card.id}`);
        continue;
      }

      console.log(
        `${options.dryRun ? '[dry] ' : ''}${card.supersedes ? `갱신(${card.supersedes} → )` : '추가'} ${card.id} — ${card.title}`,
      );
      accepted.push(card);
      if (!options.dryRun) {
        await fs.writeFile(
          path.join(options.knowledgeDir, `${card.id}.md`),
          toMarkdown(card, folded.stageId, options.today),
          'utf8',
        );
        if (card.supersedes && card.supersedes !== card.id) {
          await fs.rm(path.join(options.knowledgeDir, `${card.supersedes}.md`), { force: true });
        }
      }
    }
  }

  if (!options.dryRun) {
    await rewriteIndex(options);
    console.log(`지식창고 index 갱신: ${options.indexPath}`);
  }
  return accepted;
};
