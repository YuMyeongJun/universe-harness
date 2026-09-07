/**
 * 도구가 **무엇을 어떻게 불렸고 뭐라고 했는지** 그대로 보여 준다.
 *
 * ⚠️ 「했습니다」는 주장이지 측정이 아니다. 사람이 **손으로 다시 칠 수 있어야** 그 주장이
 * 검증된다 — 그래서 명령 한 줄과 도구의 출력을 그대로 싣는다. 요약하지 않는다.
 */
const CODE_BLOCK = [
  'my-2 max-h-code overflow-x-auto whitespace-pre-wrap',
  'rounded-control border border-ui-line bg-ui-surface-sunken p-3',
  'text-xs leading-code',
].join(' ');

export interface IToolEchoProps {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export function ToolEcho({ command, exitCode, stdout, stderr }: IToolEchoProps) {
  return (
    <div>
      <span className="block text-xs text-ui-ink-faint">
        돌린 명령 (종료코드 {exitCode === null ? '⚪ 못 읽음' : exitCode})
      </span>
      <pre className={CODE_BLOCK}>{command}</pre>
      {stdout.trim() !== '' && <pre className={CODE_BLOCK}>{stdout}</pre>}
      {stderr.trim() !== '' && <pre className={`${CODE_BLOCK} text-ui-bad`}>{stderr}</pre>}
    </div>
  );
}
