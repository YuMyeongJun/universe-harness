/**
 * Contract 레이어 — 에이전트의 `patch`/`submit` 을 **파일에 쓰기 전에** 가로챈다.
 *
 * 순서가 중요하다: 정적 레인 → (통과 시) 판정 레인. 정적에서 이미 걸리면 LLM 을 부르지
 * 않는다. 재현 가능한 사유가 이미 있는데 비결정 판정을 덧붙일 이유가 없고, 토큰도 아낀다.
 *
 * 판정 레인은 `claude -p` 를 **도구 없이** 부르고 시스템 프롬프트만 세운다. 관문이 저장소
 * 맥락을 몰래 참조하면 판정이 흔들린다.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callClaude } from '@core/fe-agent-harness';
import type {
  IContractEvaluator,
  IContractInput,
  IContractLanes,
  IContractReason,
  IContractVerdict,
  IPatchFile,
  IStaticRule,
} from '@core/fe-agent-harness';

import { COMMON_RULES } from './rules/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT_SYSTEM_PROMPT_PATH = path.join(here, 'prompts', 'CONTRACT_SYSTEM_PROMPT.md');

export interface IContractOptions {
  /** 켤 규칙 묶음. 기본은 `COMMON_RULES`(toss·a11y·tailwind). 사내 컨벤션은 `resolveRulePresets(['house-style'])` 로 얹는다. */
  baseRules?: IStaticRule[];
  /** 판정 레인 모델. 관문은 싸고 일관되어야 하므로 기본은 sonnet. */
  model?: string;
  /** 판정 레인을 끈다(오프라인 훈련·CI 스모크). 정적 레인만 돈다. */
  staticOnly?: boolean;
  systemPromptPath?: string;
  cliBin?: string;
  timeoutMs?: number;
}

export const runStaticRules = (files: IPatchFile[], rules: IStaticRule[], lanes: IContractLanes): IContractReason[] =>
  files.flatMap((file) =>
    rules
      .filter((rule) => lanes[rule.lane] && rule.applies(file))
      .flatMap((rule) => rule.scan(file)),
  );

/** 판정 레인 출력 파싱. 문법을 어기면 **막지 말고 통과**시키되 신호를 남긴다(관문 오류로 훈련을 죽이지 않는다). */
export const parseVerdict = (raw: string): { status: 'ALLOWED' | 'REJECTED'; reasons: IContractReason[]; next: string } => {
  const text = raw.trim();
  if (!/^\[STATUS\]/m.test(text)) {
    return { status: 'ALLOWED', reasons: [], next: '판정 레인이 문법을 어겼다 — 통과 처리하고 로그에 남긴다.' };
  }

  const status = /\[STATUS\]\s*REJECTED/.test(text) ? 'REJECTED' : 'ALLOWED';
  const reasons: IContractReason[] = [];

  for (const block of text.split(/\n-\s+rule:\s*/).slice(1)) {
    reasons.push({
      rule: block.split('\n')[0].trim(),
      where: /where:\s*(.+)/.exec(block)?.[1]?.trim() ?? '',
      evidence: /evidence:\s*(.+)/.exec(block)?.[1]?.trim() ?? '',
      fix: `${/why:\s*(.+)/.exec(block)?.[1]?.trim() ?? ''} → ${/fix:\s*(.+)/.exec(block)?.[1]?.trim() ?? ''}`,
    });
  }

  return { status, reasons, next: /\[NEXT\]\s*(.+)/.exec(text)?.[1]?.trim() ?? '' };
};

export const formatFeedback = (reasons: IContractReason[], header: string): string =>
  [
    header,
    ...reasons.map(
      (reason, index) => `${index + 1}. [${reason.rule}] ${reason.where}\n   증거: ${reason.evidence}\n   고칠 것: ${reason.fix}`,
    ),
  ].join('\n');

const withLineNumbers = (content: string) =>
  content
    .split('\n')
    .map((line, index) => `${String(index + 1).padStart(4, ' ')}| ${line}`)
    .join('\n');

const buildJudgeInput = (input: IContractInput, staticReasons: IContractReason[]) => {
  const lanes = Object.entries(input.lanes)
    .filter(([, on]) => on)
    .map(([lane]) => lane)
    .join('|');

  return [
    `[STAGE] ${input.stageId} — ${input.intent}`,
    `[LANES] ${lanes}`,
    '[STATIC]',
    staticReasons.length ? staticReasons.map((reason) => `- ${reason.rule} @ ${reason.where}`).join('\n') : '(없음)',
    '[FILES]',
    ...input.files.map((file) => `--- ${file.path}\n${withLineNumbers(file.content)}`),
  ].join('\n');
};

/**
 * 코어가 받는 `IContractEvaluator` 구현체를 만든다.
 *
 *   const harness = new ReactViteHarness({ contract: { evaluator: createContractEvaluator({ staticOnly }) } })
 */
export const createContractEvaluator = (options: IContractOptions = {}): IContractEvaluator => ({
  evaluate: async (input: IContractInput): Promise<IContractVerdict> => {
    const rules = [...(options.baseRules ?? COMMON_RULES), ...input.extraRules];
    const staticReasons = runStaticRules(input.files, rules, input.lanes);

    if (staticReasons.length > 0) {
      return {
        status: 'REJECTED',
        reasons: staticReasons,
        raw: '',
        lane: 'static',
        feedback: formatFeedback(staticReasons, '결정론 레인에서 막혔다. 아래를 고치고 다시 제출하라.'),
      };
    }

    if (options.staticOnly) {
      return { status: 'ALLOWED', reasons: [], raw: '', lane: 'skipped', feedback: '' };
    }

    const answer = await callClaude({
      systemPromptFile: options.systemPromptPath ?? CONTRACT_SYSTEM_PROMPT_PATH,
      input: buildJudgeInput(input, staticReasons),
      model: options.model ?? 'sonnet',
      timeoutMs: options.timeoutMs ?? 180_000,
      bin: options.cliBin,
      toolless: true,
    });
    if (answer.isError) {
      throw new Error('판정 레인 호출이 실패했다(인증·모델 확인).');
    }

    const verdict = parseVerdict(answer.text);
    return {
      status: verdict.status,
      reasons: verdict.reasons,
      raw: answer.text,
      lane: 'llm',
      feedback:
        verdict.status === 'REJECTED' ? formatFeedback(verdict.reasons, `판정 레인에서 막혔다. ${verdict.next}`) : '',
    };
  },
});
