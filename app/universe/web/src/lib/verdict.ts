import type {
  GalaxyState,
  IGalaxyEntry,
  ILawObservation,
  IRuleObservation,
  IScanScope,
  RuleFiring,
} from '@api/types';
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

/* ══════════════════════════════════════════════════════════════════════════
 * ── 은하 하나를 판정한다 ── 콘솔 **첫 화면**의 판정이 사는 자리.
 *
 * ⛔⛔ 판정을 컴포넌트에 흩지 않는다. 이 파일 머리말과 같은 이유다 — 판단이 두 곳에
 * 있으면 언젠가 색만 고쳐지고 문구는 안 고쳐진다.
 *
 * ⛔⛔ **이 화면에는 ✅ 가 하나도 없다.** 은하 목록이 아는 것은 「등재됐나 · 좌표가 있나 ·
 * 경로가 있나 · 기준선이 있나」뿐이고, 그중 어느 것도 **「위반이 없다」가 아니다.**
 * 지금 몇 건인지는 다시 재야(`observe`) 안다. 여기서 초록을 그리면 그 순간 이 화면은
 * 「안 봤다」를 「괜찮다」로 접는다 — 이 저장소가 R121·R162 에서 데인 바로 그 형태다.
 * ══════════════════════════════════════════════════════════════════════════ */

/** 배지 한 개 — **표 · 글자 · 색 · 이유가 한 몸이다.** 하나만 고쳐지는 것을 막는다. */
export interface IGalaxyVerdict {
  /** 관측소 터미널과 **같은 표**를 쓴다(⛔ · ⚪ · ⓘ). 두 화면이 다른 기호를 쓰면 대조가 안 된다. */
  mark: string;
  label: string;
  tone: PillTone;
  /** ⛔ 배지만 두지 않는다. **왜 그렇게 판정했는지**가 늘 따라다닌다. */
  why: string;
}

/**
 * `state` — ⛔ **다섯 갈래 중 어느 것도 목록에서 빼지 않는다.**
 *
 * ⚠️ 실측(R121): 좌표를 만들어 놓고 `universe.config.json` 에 안 올렸더니 관측이
 * **「아무것도 안 재고 초록불」**을 냈다. 조용히 빼면 「원래 없었다」와 구별이 안 된다.
 */
export const judgeGalaxyState = (state: GalaxyState): IGalaxyVerdict => {
  switch (state) {
    case 'listed':
      return {
        mark: 'ⓘ',
        label: '등재됨 · 좌표 있음',
        tone: 'auto',
        why:
          '목록에도 있고 좌표도 있다. ⛔ 이것은 ✅ 가 아니다 — ' +
          '지금 위반이 몇 건인지는 다시 재야(`observe`) 안다.',
      };
    case 'no-coordinate':
      return {
        mark: '⛔',
        label: '좌표 파일이 없다',
        tone: 'bad',
        why:
          '등재됐는데 좌표 파일이 없다 — 관측이 이 은하를 잴 수가 없다. ' +
          '⛔ 목록에서 조용히 빼지 않았다: 빼면 「원래 없었다」와 구별이 안 된다.',
      };
    case 'not-registered':
      return {
        mark: '⛔',
        label: '목록에 없다 — 안 재진다',
        tone: 'bad',
        why:
          '좌표는 있는데 `universe.config.json` 의 `galaxies` 에 없다 ⇒ 관측이 이 은하를 안 잰다. ' +
          '⚠️ 그 침묵은 화면에서 초록으로 보인다 — 이 저장소가 R121 에서 데인 자리다.',
      };
    case 'unreadable':
      return {
        mark: '⛔',
        label: '좌표를 못 읽었다',
        tone: 'bad',
        why: '좌표 파일은 있다 — 읽을 수가 없을 뿐이다. ⛔ 「없는 은하」와 같은 말이 아니다.',
      };
    case 'bad-name':
      return {
        mark: '⛔',
        label: '이름 모양이 좌표가 될 수 없다',
        tone: 'bad',
        why: '이름이 곧 좌표 파일 이름이 되는데 그 모양이 아니다. 막았다고 목록에서 빼지 않았다.',
      };
    default:
      /* ⛔ 모르는 상태를 초록으로 접지 않는다 — 서버가 갈래를 늘리면 여기서 ⚪ 로 보인다. */
      return {
        mark: '⚪',
        label: '모르는 상태',
        tone: 'unknown',
        why: `서버가 준 \`state\` 를 화면이 모른다: ${JSON.stringify(state)} — 초록으로 읽지 마라.`,
      };
  }
};

/**
 * 경로가 이 기계에 있나.
 *
 * ⛔⛔ `pathExists: false` 는 **⚪ 다.** 「이 기계엔 없다」이지 ❌(실패)가 아니고,
 * 무엇보다 ✅ 가 아니다. 초록으로 그리면 **아무도 못 잰 은하가 통과한 은하로 보인다.**
 */
export const judgeGalaxyPath = (entry: IGalaxyEntry): IGalaxyVerdict => {
  if (entry.path === null) {
    return {
      mark: '⚪',
      label: '경로를 모른다',
      tone: 'unknown',
      why: '좌표에 `path` 가 없거나 좌표를 못 읽었다 — 어디를 재야 하는지 모른다.',
    };
  }
  if (entry.pathExists === null) {
    return {
      mark: '⚪',
      label: '경로를 못 봤다',
      tone: 'unknown',
      why: '있는지 없는지 확인하지 못했다. 「없다」와 다른 말이다.',
    };
  }
  if (!entry.pathExists) {
    return {
      mark: '⚪',
      label: '이 기계엔 없다',
      tone: 'unknown',
      why:
        '좌표가 가리키는 경로가 이 기계에 없다 — 못 잰다(⚪). ' +
        '⛔ 실패(❌)가 아니고, 무엇보다 ✅ 가 아니다.',
    };
  }
  return {
    mark: 'ⓘ',
    label: '이 기계에 있다',
    tone: 'auto',
    why: '경로가 실재한다 — 잴 수는 있다는 뜻이지, 재서 괜찮았다는 뜻이 아니다.',
  };
};

/**
 * 기준선.
 *
 * ⛔⛔ **없으면 「아직 안 쟀다」다.** ✅ 로도 「위반 0」으로도 만들지 않는다.
 * ⚠️ 실측(R162): `appDir` 이 소스 없는 곳을 가리켜 훑개가 **파일 0개**를 보았고,
 *    모든 법칙 0건이 기준선으로 심겨 그 은하는 **영원히 초록**이 됐다. 분모를 먼저 본다.
 */
export const judgeGalaxyBaseline = (entry: IGalaxyEntry): IGalaxyVerdict => {
  const baseline = entry.baseline;
  if (baseline === null) {
    return {
      mark: '⚪',
      label: '아직 안 쟀다',
      tone: 'unknown',
      why: '기준선(`observed`)이 없다 — ⛔ 「위반 0」이 아니라 아직 아무도 안 쟀다.',
    };
  }
  if (baseline.files === 0) {
    return {
      mark: '⛔',
      label: '파일 0개로 심긴 기준선',
      tone: 'bad',
      why:
        `기준선이 파일 0개를 훑고 심겼다(appDir: ${JSON.stringify(entry.appDir)}) — ` +
        '그 「0건」은 「위반이 없다」가 아니라 「안 봤다」다. 이 은하는 영원히 초록이다(R162).',
    };
  }
  if (baseline.files === null) {
    return {
      mark: '⚪',
      label: '분모가 없다',
      tone: 'unknown',
      why: '기준선에 훑은 파일 수가 없다 — 분모가 없으면 건수는 뜻이 없다.',
    };
  }
  return {
    mark: 'ⓘ',
    label: `기준선 — 파일 ${baseline.files}개`,
    tone: 'auto',
    why:
      `${baseline.measuredAt ?? '(시각 없음)'} 에 파일 ${baseline.files}개를 훑어 심은 값이다. ` +
      '⛔ 지금 값이 아니다 — 지금을 알려면 다시 재라(`observe`).',
  };
};

/**
 * 명령 축 — ⛔ **없는 명령을 빈칸으로 두지 않는다.**
 *
 * 빈칸은 「그 축이 초록」으로 읽힌다. 없으면 **없다고 적고, 그래서 무엇이 안 재지는지**까지 적는다.
 */
export const judgeGalaxyCommands = (entry: IGalaxyEntry): IGalaxyVerdict => {
  const declared = Object.keys(entry.commands).length;
  if (declared === 0) {
    return {
      mark: '⚪',
      label: '선언된 명령이 0개',
      tone: 'unknown',
      why: '좌표에 명령이 하나도 없다 — 이 은하에서는 명령 축을 못 잰다. 「통과했다」가 아니다.',
    };
  }
  if (entry.missingCommands !== null) {
    return {
      mark: '⚪',
      label: `명령 ${declared}개 · 없는 축이 있다`,
      tone: 'unknown',
      why: '좌표가 「이 저장소엔 없다」고 적어 둔 명령이 있다 — 그 축은 ⚪ 로 안 재진다.',
    };
  }
  return {
    mark: 'ⓘ',
    label: `명령 ${declared}개`,
    tone: 'auto',
    why: '좌표에 선언된 명령이다 — 선언됐다는 뜻이지, 돌려서 통과했다는 뜻이 아니다.',
  };
};

/** 이 은하가 켠 법칙. ⛔ `null` 은 「법칙이 0개」가 아니라 **못 읽었다**다. */
export const judgeGalaxyLaws = (entry: IGalaxyEntry): IGalaxyVerdict => {
  if (entry.laws === null) {
    return {
      mark: '⚪',
      label: '법칙을 못 읽었다',
      tone: 'unknown',
      why: '좌표의 `laws` 를 못 읽었다 — 무엇으로 재는지 모른다. 「법칙이 0개」와 다른 말이다.',
    };
  }
  if (entry.laws.length === 0) {
    return {
      mark: '⛔',
      label: '켠 법칙이 0개',
      tone: 'bad',
      why: '이 은하는 아무 법칙도 켜지 않았다 — 무엇을 재도 늘 0건이다. 그건 초록이 아니다.',
    };
  }
  return {
    mark: 'ⓘ',
    label: `법칙 ${entry.laws.length}개`,
    tone: 'auto',
    why: `켠 법칙: ${entry.laws.join(' · ')}. ⛔ 켰다는 것이지 통과했다는 것이 아니다.`,
  };
};

/**
 * **지금 이 기계에서 잴 수 있는가.**
 *
 * ⛔ 「못 잰다」를 링크를 조용히 지워서 말하지 않는다 — 호출부는 이 이유를 **화면에 적는다.**
 * `null` 이면 잴 수 있다.
 */
export const cannotObserve = (entry: IGalaxyEntry): string | null => {
  if (!entry.coordinate.found) {
    return '⚪ 좌표 파일이 없어 잴 수가 없다 — 먼저 좌표를 만들어야 한다.';
  }
  if (entry.state === 'unreadable') {
    return '⚪ 좌표를 못 읽어 잴 수가 없다 — 좌표 파일을 고쳐야 한다.';
  }
  if (entry.path === null) {
    return '⚪ 좌표에 `path` 가 없어 어디를 잴지 모른다.';
  }
  if (entry.pathExists !== true) {
    return '⚪ 경로가 이 기계에 없어 못 잰다 — 이 기계의 문제이지 그 은하의 실패가 아니다.';
  }
  return null;
};
