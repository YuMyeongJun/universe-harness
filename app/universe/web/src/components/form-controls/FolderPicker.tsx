import { useEffect, useState } from 'react';

import { browseDir } from '@api/client';
import type { IBrowseResult } from '@api/types';
import { ActionButton } from '@components/form-controls/ActionButton';
import { Banner, CODE, HELP_TEXT, Pill } from '@components/ui';

/**
 * **폴더를 고른다** — 경로를 손으로 치지 않는다.
 *
 * ## ⛔⛔ 왜 브라우저의 폴더 선택기가 아닌가
 *
 * `<input webkitdirectory>` 도 `showDirectoryPicker()` 도 **절대 경로를 안 준다**(규격이다).
 * 서버는 `bin/galaxy.mjs` 에 실제 경로를 넘겨야 하므로, **서버가 훑고 화면이 타고 내려간다.**
 * ⇒ 여기서 고른 것은 **서버가 실제로 읽은 자리**다 — 사람이 친 문자열이 아니라.
 *
 * ## ⛔ 이 칸이 하지 않는 것
 *
 *  1. **대신 고르지 않는다.** `package.json`·`.git` 이 있는 폴더에 배지를 달 뿐이고,
 *     ⛔ 자동으로 들어가거나 정렬을 앞으로 당기지 않는다 — 순서가 판정처럼 읽힌다.
 *  2. **「저장소로 보인다」를 「잴 수 있다」로 말하지 않는다.** 배지는 표시이고,
 *     실제로 읽히는지는 **다음 걸음(좌표 초안)이 잰다.**
 *  3. ⛔ **못 읽은 폴더를 빈 폴더로 그리지 않는다.** 권한이 없거나 사라진 자리는
 *     「못 읽었다」로 뜬다 — 빈 목록은 「폴더가 없다」로 읽힌다(§8).
 *
 * ⚠️ 홈 폴더 밖은 서버가 거절한다. 그 거절도 **그대로 보여 준다** — 삼키면 사람이
 *    「왜 안 열리지」를 혼자 추측한다.
 */
export interface IFolderPickerProps {
  /** 고른 자리. 아직 안 골랐으면 빈 문자열. */
  value: string;
  onPick: (dir: string) => void;
}

const ROW = [
  'grid grid-cols-entry items-center gap-2.5 w-full',
  'rounded-control border border-ui-line bg-ui-surface px-3 py-2.25',
  'text-left text-inherit hover:border-ui-accent',
].join(' ');

export function FolderPicker({ value, onPick }: IFolderPickerProps) {
  const [at, setAt] = useState<IBrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (dir?: string): void => {
    setBusy(true);
    setError(null);
    void browseDir(dir).then(
      (result) => { setAt(result); setBusy(false); },
      /* ⛔ 실패했는데 이전 목록을 남겨 두지 않는다 — 남기면 그것이 이 폴더인 줄 안다. */
      (failed: Error) => { setAt(null); setError(failed.message); setBusy(false); },
    );
  };

  useEffect(() => { go(); }, []);

  return (
    <div>
      <span className="mb-1.5 block text-label font-semibold">
        잴 폴더 <span className="font-normal text-ui-ink-faint">고르세요</span>
      </span>

      {error !== null && (
        <Banner tone="unknown">
          <strong>⚪ 그 폴더를 못 읽었다.</strong>
          <div className="mt-1.5 whitespace-pre-wrap">{error}</div>
        </Banner>
      )}

      {at !== null && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <ActionButton disabled={at.parent === null || busy} onClick={() => go(at.parent ?? undefined)}>
              ↑ 위로
            </ActionButton>
            {/**
              * ⭐ **지름길** — 숨김 폴더(`.` 로 시작)는 목록에 안 나오는데, 「받아 오기」가 받아 온
              * 저장소는 하필 `.data/clones/` 에 떨어진다. ⛔ 그래서 두 화면이 **이어지지 않았다.**
              * 숨김 규칙은 그대로 두고(그게 옳다), 서버가 **실재할 때만** 주는 지름길을 그린다.
              */}
            {at.shortcuts.map((one) => (
              <ActionButton key={one.path} disabled={busy} onClick={() => go(one.path)}>
                {one.label}
              </ActionButton>
            ))}
            <code className={`${CODE} truncate`}>{at.dir}</code>
          </div>

          {/* ⭐ **지금 이 폴더를 고르는 칸**이 따로 있다. 내려가기만 되면 뿌리 자체를 못 고른다. */}
          <div className="mb-2.5">
            <ActionButton primary disabled={busy} onClick={() => onPick(at.dir)}>
              여기를 고른다 — {at.dir.split('/').pop() || at.dir}
            </ActionButton>
            {(at.self.hasPackageJson || at.self.hasGit) && (
              <span className={`mt-1.5 ${HELP_TEXT}`}>
                이 폴더에 {at.self.hasPackageJson && <code className={CODE}>package.json</code>}
                {at.self.hasPackageJson && at.self.hasGit && ' 과 '}
                {at.self.hasGit && <code className={CODE}>.git</code>} 이 있습니다.
                ⚠️ <strong>「잴 수 있다」는 뜻이 아닙니다</strong> — 그건 다음 걸음이 잽니다.
              </span>
            )}
          </div>

          {/**
            * ⚠️ **틀을 두르고 안쪽에 여백을 준다.** 틀이 없으면 목록이 넘칠 때 마지막 줄이
            * **반쯤 잘린 채로** 끝나서, 스크롤 상자가 아니라 **깨진 화면으로 읽힌다**
            * (실측: 폴더가 많은 자리에서 실제로 그렇게 보였다).
            */}
          <div className="max-h-code overflow-y-auto rounded-control border border-ui-line bg-ui-surface-sunken p-1.5">
            <div className="grid gap-1.5">
            {at.entries.length === 0 && (
              <span className={HELP_TEXT}>이 폴더 아래에 하위 폴더가 없습니다.</span>
            )}
            {at.entries.map((entry) => (
              <button key={entry.path} type="button" className={ROW} disabled={busy} onClick={() => go(entry.path)}>
                <span className="truncate">{entry.name}</span>
                <span className="flex gap-1.5">
                  {entry.hasPackageJson && <Pill tone="auto">package.json</Pill>}
                  {entry.hasGit && <Pill tone="auto">git</Pill>}
                </span>
              </button>
            ))}
            </div>
          </div>
        </>
      )}

      {value !== '' && (
        <span className={`mt-2.5 ${HELP_TEXT}`}>
          고른 자리: <code className={CODE}>{value}</code>
        </span>
      )}
    </div>
  );
}
