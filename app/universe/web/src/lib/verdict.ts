import type { ILawObservation, IRuleObservation, IScanScope, RuleFiring } from '@api/types';
import type { BannerTone, PillTone } from '@components/ui';

/**
 * **판정을 한 자리에서 내린다.**
 *
 * ⛔⛔ 이 저장소의 판정 어휘는 셋이다 — ✅ 잰 초록 · ❌(🔴) 잰 빨강 · ⚪ **못 쟀다.**
 * 그리고 이 저장소가 여러 번 데인 사고는 전부 **⚪ 를 ✅ 로 접은 것**이었다:
 * 파일 0개를 훑고 「0건」을 심어 은하가 영원히 초록이 됐고(R162), 규칙 11개가 무발동인데
 * 「위반 없음」으로 읽혔다(§8).
 *
 * ⚠️ **판단이 두 곳에 있으면 언젠가 갈린다** — 색만 고치고 문구는 안 고쳐지는 식으로.
 * 그래서 색·표·문구를 **한 함수가 함께** 낸다. 호출부는 고르지 않고 받아 쓴다.
 */
export type Verdict = 'green' | 'red' | 'unmeasured';

export interface IVerdict {
  verdict: Verdict;
  /** 관측소 터미널이 쓰는 것과 **같은 표**다 — 두 화면이 다른 기호를 쓰면 대조가 안 된다. */
  mark: string;
  tone: BannerTone;
  /** ⛔ 「0건」만 적지 않는다. **왜 그렇게 판정했는지**가 같은 문장에 있어야 한다. */
  why: string;
}

/**
 * 법칙 하나를 판정한다.
 *
 * ⛔⛔ **분모가 0이면 분자를 읽지 않는다.** 훑은 파일이 0개일 때의 「0건」은
 * 「위반이 없다」가 아니라 **「안 봤다」**다. 여기서 접으면 그 은하는 영원히 초록이 된다 —
 * 코드가 아무리 나빠져도 0과 0은 늘 같으니까.
 */
export const judgeLaw = (law: ILawObservation, scope: IScanScope): IVerdict => {
  if (scope.files === 0) {
    return {
      verdict: 'unmeasured',
      mark: '⚪',
      tone: 'unknown',
      why: `안 봤다 — 훑은 파일이 0개다. 여기 적힌 ${law.total}건은 잰 수가 아니다.`,
    };
  }
  if (law.baseline === null) {
    return {
      verdict: 'unmeasured',
      mark: '⚪',
      tone: 'unknown',
      why: `기준선이 없다 — ${law.total}건이 늘어난 것인지 줄어든 것인지 견줄 것이 없다.`,
    };
  }
  const drift = law.total - law.baseline;
  if (drift === 0) {
    return {
      verdict: 'green',
      mark: '✅',
      tone: 'ok',
      why: `기준선과 같다 — 파일 ${scope.files}개를 훑어 ${law.total}건.`,
    };
  }
  /* 내리는 것은 **목표**, 올리는 것은 **빚**이다. 같은 「달라졌다」로 접지 않는다. */
  const debt = drift > 0 ? '늘었다 — 빚이다' : '줄었다 — 목표 방향이다';
  const sign = drift > 0 ? '+' : '';
  return {
    verdict: 'red',
    mark: '🔴',
    tone: 'bad',
    why: `기준선 ${law.baseline} → 실측 ${law.total} (${sign}${drift}) ${debt}. 훑은 파일 ${scope.files}개.`,
  };
};

/**
 * **표본이 왔는가** — 안 왔으면 「위반이 없다」가 아니라 **「무엇을 고칠지 못 받았다」**다.
 *
 * ⛔ 실측(R94): 건수는 오는데 처방이 안 와서 사람은 목록만 보고 뭘 고칠지 몰랐다.
 * 건수 > 0 인데 표본이 0건인 상태를 **초록으로도 빈칸으로도** 두지 않는다.
 */
export const missingSamples = (law: ILawObservation, scope: IScanScope): string | null => {
  if (scope.files === 0) { return null; }
  if (law.total === 0) { return null; }
  if (law.samples.length > 0) { return null; }
  return `위반 ${law.total}건인데 표본이 0건이다 — 자리도 처방도 안 왔다. 표본 수를 올려 다시 재라.`;
};

/**
 * 규칙 하나의 「0건」이 무슨 뜻인가.
 *
 * ⛔⛔ **무발동 규칙을 조용히 감추지 않는다.** 감추면 「위반이 없다」와 「규칙이 약하다」가
 * 한 화면에서 구분되지 않는다. 갈라 주는 근거는 `observatory/rules-proven.json` 이다 —
 * 화면이 판단하지 않고 명부를 옮긴다.
 */
export const FIRING_LABEL: Record<RuleFiring, string> = {
  fired: '발동함',
  'silent-proven': '0건 — 위반이 없다',
  'silent-unproven': '⚪ 0건 — 뜻을 모른다',
};

export const FIRING_TONE: Record<RuleFiring, PillTone> = {
  fired: 'auto',
  'silent-proven': 'filled',
  'silent-unproven': 'unknown',
};

export const FIRING_WHY: Record<RuleFiring, string> = {
  fired: '이 은하에서 실제로 물었다 — 건수는 잰 것이다.',
  'silent-proven':
    '여기선 0건인데, 더러운 은하에서 발동함이 증명된 규칙이다 ⇒ 여기 0건은 위반이 없다는 뜻이다(관측 법칙 §8).',
  'silent-unproven':
    '⛔ 한 번도 발동한 적이 증명되지 않았다 — 위반이 없는 것인지 규칙이 약한 것인지 모른다. 초록으로 읽지 마라(§8).',
};

export interface IRuleVerdict {
  label: string;
  tone: PillTone;
  why: string;
}

/**
 * 규칙 한 줄을 판정한다.
 *
 * ⛔⛔ **분모가 0이면 규칙 줄도 초록일 수 없다.** 화면을 눈으로 돌려 보고서야 보였다 —
 * 법칙 머리는 ⚪ 로 그리는데 그 밑의 규칙 줄은 「0건 — 위반이 없다」라는 **초록 배지**를 달고
 * 서 있었다. 아무것도 안 훑었는데 「위반이 없다」고 말한 것이다.
 * 이 화면이 막으려던 바로 그 사고를 이 화면이 저지르고 있었다(`CommandList` 가 겪은 것과 같은 형태다).
 * ⇒ 안 봤으면 규칙도 ⚪ 다.
 */
export const judgeRule = (rule: IRuleObservation, scope: IScanScope): IRuleVerdict => {
  if (scope.files === 0) {
    return {
      label: '⚪ 안 봤다',
      tone: 'unknown',
      why: '훑은 파일이 0개다 — 이 규칙이 물었는지 안 물었는지조차 모른다.',
    };
  }
  return {
    label: FIRING_LABEL[rule.firing],
    tone: FIRING_TONE[rule.firing],
    why: FIRING_WHY[rule.firing],
  };
};
