import type { IGalaxyDraftTodos } from '@api/types';

import { Banner } from '@components/ui';

/**
 * **몇 개 남았는지 센다** — 정확히는, **도구가 센 것을 그대로 옮긴다.**
 *
 * ⛔⛔ 도구는 못 읽은 자리를 `TODO:` 로 남긴다. 화면이 그것을 빈칸으로 감추거나
 * 그럴듯한 기본값을 넣으면 **초안이 완성본 행세를 한다.** 그래서 숫자를 위에 못 박는다.
 *
 * ⛔ **개수를 화면이 다시 세지 않는다.** 두 자리에서 세면 언젠가 갈리고, 갈린 뒤에는
 * 어느 쪽이 사실인지 아무도 모른다. `count === null` 은 「도구의 말에서 개수를 못 읽었다」(⚪)이고,
 * 그때는 **완성이라고 절대 말하지 않는다** — 0건이 「위반 없음」인지 「안 봤다」인지는 분모를 봐야 안다.
 */
export interface IBlankCounterProps {
  todos: IGalaxyDraftTodos;
  /** ⛔ 도구가 `TODO:` 를 **실제로 0개로 세었을 때만** true. 못 셌으면 false 다. */
  complete: boolean;
  /** 지금 사람이 화면에서 채워 넣은 칸 수. 개수의 출처가 아니라 **진행 표시**다. */
  typed: number;
}

export function BlankCounter({ todos, complete, typed }: IBlankCounterProps) {
  if (todos.count === null) {
    return (
      <Banner tone="warn">
        <strong>⚪ 몇 곳이 남았는지 못 읽었다.</strong>
        <div className="mt-1.5">
          도구가 센 개수를 서버가 그 말에서 못 뽑았다. <strong>완성이라고 말하지 않는다</strong> —
          아래 「사람이 채울 자리」 목록을 눈으로 확인해라.
        </div>
        {todos.note !== null && <div className="mt-1.5 whitespace-pre-wrap">{todos.note}</div>}
      </Banner>
    );
  }

  if (complete) {
    return (
      <Banner tone="ok">
        <strong>도구가 `TODO:` 를 0개로 세었다.</strong>
        <div className="mt-1.5">
          좌표에 사람이 채울 자리가 없다는 뜻이다. 그래도 아래 「읽어낸 실행 명령어」와
          「없는 명령」은 눈으로 확인해라 — 없는 명령은 채울 자리가 아니라 <strong>안 재지는 축</strong>이다.
        </div>
        {todos.note !== null && <div className="mt-1.5 whitespace-pre-wrap">{todos.note}</div>}
      </Banner>
    );
  }

  return (
    <Banner tone="warn">
      <strong>
        사람이 채울 자리 {todos.count}곳 — 지금 화면에서 {typed}곳을 적었다.
      </strong>
      <div className="mt-1.5">
        도구가 <code>TODO:</code> 로 남긴 자리다. <strong>짐작으로 채우지 않았다.</strong>
        비워 둔 채로 두면 초안이 완성본 행세를 하고, 관문은 엉뚱한 것을 재게 된다.
      </div>
      {todos.note !== null && <div className="mt-1.5 whitespace-pre-wrap">{todos.note}</div>}
    </Banner>
  );
}
