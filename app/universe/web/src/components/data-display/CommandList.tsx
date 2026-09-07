import { Pill } from '@components/ui';

/**
 * 저장소에서 **읽어낸 실행 명령어**와, 도구가 「없다」고 말한 것.
 *
 * ⛔⛔ **없는 명령을 빈칸으로 두지 않는다.** 빈칸은 「아직 안 적었다」로 읽히고 사람은
 * 있는 줄 안다. 없으면 **없다고 적고, 그래서 무엇이 안 재지는지**까지 적는다.
 * (`bin/galaxy.mjs` 도 같은 이유로 `test` 를 지어내지 않는다 — `npm init -y` 가 심는
 *  가짜 `test` 를 진짜로 읽어 빌드를 깬 적이 있다.)
 *
 * ⛔⛔ **`TODO:` 로 시작하는 값은 명령이 아니다.** 처음엔 `commands` 를 통째로 「읽어냄」
 * 배지와 함께 늘어놓았는데, 실제로 돌려 보니 `lintJson: "TODO: lint 스크립트가 없다"` 가
 * **초록 배지를 달고 명령인 척 서 있었다.** 이 화면이 막으려던 바로 그 사고를 이 화면이
 * 저지르고 있었던 것이다 — 눈으로 한 번 돌려 보기 전에는 안 보였다.
 * ⇒ 값이 `TODO:` 면 **읽어낸 것이 아니라 사람이 채울 자리**로 가른다.
 *
 * ⛔ 도구가 남긴 문장은 **다시 쓰지 않고 그대로** 보여 준다. 고쳐 적으면 그 순간
 * 화면의 말과 도구의 말이 갈리고, 갈린 뒤에는 어느 쪽이 사실인지 아무도 모른다.
 */
const ROW = 'grid grid-cols-entry items-baseline gap-3.5 border-b border-ui-line py-2.5';
const CODE = 'block rounded-chip bg-ui-surface-sunken px-1.25 py-px font-mono text-xs';
const MISSING = 'mt-3 rounded-control border border-tone-warn-line bg-tone-warn-face px-3.5 py-3 text-tone-warn-ink';

/** 도구가 못 읽은 자리에 남기는 표시. `bin/galaxy.mjs` 가 쓰는 그 접두사다. */
const TODO_MARK = 'TODO:';

export interface ICommandListProps {
  /** 도구가 좌표의 `commands` 칸에 적은 것 그대로. 화면은 여기에 아무것도 더하지 않는다. */
  commands: Record<string, string>;
  /** 도구가 「이 저장소엔 없다」고 적은 문장. `null` 이면 도구가 그런 말을 안 했다. */
  missing: string | null;
}

export function CommandList({ commands, missing }: ICommandListProps) {
  const keys = Object.keys(commands);
  const read = keys.filter((key) => !(commands[key] ?? '').startsWith(TODO_MARK));
  const unread = keys.filter((key) => (commands[key] ?? '').startsWith(TODO_MARK));

  return (
    <div>
      {read.length === 0 && (
        <p className="mt-0 text-meta text-ui-warn">
          <strong>읽어낸 명령이 하나도 없다.</strong> 이 저장소에서 돌릴 것을 도구가 못 찾았다는
          뜻이고, <strong>그만큼 관문이 덜 잰다.</strong> ⛔ 지어내지 않았다.
        </p>
      )}

      {read.map((key) => (
        <div key={key} className={ROW}>
          <span>
            <span className="block text-label font-semibold">{key}</span>
            <code className={`mt-0.5 ${CODE}`}>{commands[key]}</code>
          </span>
          <Pill tone="filled">읽어냄</Pill>
        </div>
      ))}

      {unread.map((key) => (
        <div key={key} className={ROW}>
          <span>
            <span className="block text-label font-semibold">{key}</span>
            <span className="mt-0.5 block text-meta text-ui-warn">
              ⛔ 못 읽었다 — 명령이 아니라 <strong>사람이 채울 자리</strong>다. 도구의 말:{' '}
              {commands[key]}
            </span>
          </span>
          <Pill tone="stub">못 읽음</Pill>
        </div>
      ))}

      {missing !== null && (
        <p className={MISSING}>
          <strong>없는 명령 — 그 축은 안 재진다.</strong>
          <span className="mt-1.5 block whitespace-pre-wrap text-meta">{missing}</span>
        </p>
      )}
    </div>
  );
}
