import type { IRuleObservation, IScanScope } from '@api/types';

import { judgeRule } from '@lib/verdict';

import { Pill } from '@components/ui';

/**
 * 이 법칙이 **켠 규칙 전부** — 발동한 것도, 한 번도 안 문 것도.
 *
 * ⛔⛔ **「한 번도 발동 안 한 규칙」을 조용히 감추지 않는다.**
 * 감추면 화면에는 「0건」만 남고, 그것이 **「위반이 없다」인지 「규칙이 약한 것」인지**
 * 구분되지 않는다. 둘은 완전히 다른 이야기다 — 앞은 잰 것이고 뒤는 못 잰 것이다.
 *
 * ⚠️ 실측(§8): 남의 저장소에서 규칙 13개 중 11개가 0건이었는데 「위반 없음」으로 읽혔다.
 * 열어 보니 규칙이 그 저장소의 코드 모양을 **아예 몰랐다**(`<Input>` 350개 중 24개만 보고 있었다).
 *
 * ⛔ 갈라 주는 근거를 **화면이 지어내지 않는다.** `observatory/rules-proven.json` 의
 * 「더러운 은하에서 발동함이 증명된 규칙」 명부를 서버가 옮겨 주고, 화면은 그것을 표시만 한다.
 */
const ROW = 'grid grid-cols-entry items-baseline gap-3.5 border-b border-ui-line py-2.5 last:border-b-0';
const NAME = 'block font-mono text-label';
const WHY = 'mt-0.5 block text-meta text-ui-ink-faint';
const COUNT = 'font-mono';

export interface IRuleRosterProps {
  rules: IRuleObservation[];
  /** 분모. ⛔ 규칙 줄도 분모 없이는 판정할 수 없다 — 안 훑었으면 「위반이 없다」가 아니다. */
  scope: IScanScope;
}

export function RuleRoster({ rules, scope }: IRuleRosterProps) {
  if (rules.length === 0) {
    return (
      <p className="text-meta text-ui-warn">
        ⚪ 이 법칙이 켠 규칙 목록이 안 왔다 — <strong>무엇으로 쟀는지 모른다.</strong>{' '}
        건수만 보고 판단하지 마라.
      </p>
    );
  }

  return (
    <div>
      {rules.map((rule) => {
        const judged = judgeRule(rule, scope);
        return (
          <div key={rule.rule} className={ROW}>
            <span>
              <span className={NAME}>
                <span className={COUNT}>{rule.count}건</span> · {rule.rule}
              </span>
              <span className={WHY}>{judged.why}</span>
            </span>
            <Pill tone={judged.tone}>{judged.label}</Pill>
          </div>
        );
      })}
    </div>
  );
}
