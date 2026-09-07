/**
 * `claude -p` 호출 공통부. 에이전트 레인·판정 레인·추출 레인이 전부 이 하나를 쓴다.
 *
 * ⛔ **이 하네스는 구독 경로로만 돈다**(사용자 결정 2026-09-07, R145).
 *    그래서 자식 프로세스의 환경에서 `ANTHROPIC_API_KEY` 를 **지우고**, `--bare` 를 **안 붙인다.**
 *
 * ⚠️ `--bare` 는 인증을 **`ANTHROPIC_API_KEY` 또는 apiKeyHelper 로만** 한다(실측 2026-09-04)
 *    — OAuth/키체인을 아예 안 읽는다. 구독 로그인 상태에서 `--bare` 를 넣으면
 *    `terminal_reason: "api_error"` 로 **조용히 빈 결과**가 돌아온다.
 *    예전엔 「키가 환경에 있으면 `--bare` 를 켠다」였는데, 그러면 **키가 어디선가 새어 들어온 날
 *    아무 말 없이 과금 경로로 갈아탄다.** 모드가 바뀌는데 아무도 안 재는 자리였다(§8).
 *    이제 키를 자식에게 물려주지 않으므로 `--bare` 는 언제나 틀린 선택이고, 분기 자체가 없다.
 */
import { spawn } from 'node:child_process';

export interface IClaudeCall {
  systemPromptFile: string;
  input: string;
  model: string;
  resumeSessionId?: string | null;
  timeoutMs?: number;
  /**
   * 도구를 전부 끈다.
   *
   * ⚠️ 실측(2026-09-04): 예전엔 `Bash Edit Write WebFetch WebSearch Task` 만 껐다. 그런데
   *    **Read·Glob·Grep 이 열려 있었다.** s01 첫 완주에서 에이전트는 `probe` 액션을 한 번도
   *    쓰지 않고 Read 로 샌드박스 dist 를 직접 읽어 정답을 맞혔다 — 결과는 맞았지만
   *    **어떻게 알았는지가 궤적에 하나도 안 남았다.** 궤적은 WikiSkill 추출의 유일한 입력이고,
   *    추출 프롬프트가 가장 값지게 치는 것이 "재는 법 자체" 다. 그게 통째로 사라진 것이다.
   *    관문 레인에서도 같은 구멍이었다 — 판정자가 저장소를 훔쳐보면 판정이 흔들린다.
   */
  toolless?: boolean;
  /** 기본 `claude`. 사내 프록시 래퍼가 있으면 그 이름을 준다. */
  bin?: string;
}

export interface IClaudeResult {
  text: string;
  sessionId: string | null;
  isError: boolean;
  /** isError 일 때 사람이 볼 사유. 궤적에 그대로 남는다. */
  failure?: string;
  /** CLI 가 스스로 보고한 이 호출의 비용(USD). 없으면 null — **추정하지 않는다.** */
  costUsd: number | null;
  /** CLI 가 보고한 토큰 사용량 원본. 우리가 다시 계산하지 않는다. */
  usage: Record<string, unknown> | null;
}

/**
 * ⚠️ 실측(2026-09-04, s01 첫 완주 시도): 3번째 턴에서 CLI 가 **빈 stdout** 으로 끝났고
 *    `JSON.parse` 실패 → reject → 아무도 안 잡아 **9분짜리 게이트를 통과한 에피소드가 통째로
 *    날아갔다.** 관문 하나가 흔들렸다고 훈련을 죽이면 안 된다 — 실패를 신호로 바꿔 돌려준다.
 *    (판단은 부르는 쪽이 한다: 러너는 한 번 재시도하고, 그래도 안 되면 곱게 끝낸다.)
 */
/* 한 프로세스에서 여러 번 불리므로 **한 번만** 말한다 — 매 호출마다 찍으면 로그가 시끄럽다. */
let announcedAuthLane = false;

export const callClaude = ({
  systemPromptFile,
  input,
  model,
  resumeSessionId,
  timeoutMs = 600_000,
  toolless = true,
  bin = 'claude',
}: IClaudeCall): Promise<IClaudeResult> =>
  new Promise((resolve) => {
    const args = ['-p', '--system-prompt-file', systemPromptFile, '--model', model, '--output-format', 'json'];
    if (toolless) {
      args.push(
        '--disallowed-tools',
        'Bash Edit Write NotebookEdit Read Glob Grep WebFetch WebSearch Task TodoWrite',
      );
    }
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }

    /* ⛔ 키를 **자식에게 물려주지 않는다.** `spawn` 에 `env` 를 안 넘기면 자식이 부모 환경을
       통째로 물려받는다 — 그것이 예전 동작이었다. 구독 경로를 보증하는 자리는 여기 하나뿐이다. */
    const { ANTHROPIC_API_KEY: droppedKey, ...childEnv } = process.env;
    if (droppedKey !== undefined && !announcedAuthLane) {
      announcedAuthLane = true;
      console.log('🔑 인증 — 구독 경로 (ANTHROPIC_API_KEY 를 자식에서 지웠다)');
    }
    const child = spawn(bin, args, { env: childEnv, stdio: ['pipe', 'pipe', 'inherit'] });
    let stdout = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        /* ⚠️ 예전엔 total_cost_usd 와 usage 를 그냥 버렸다. 그래서 **재는 것이 일인 하네스가
           자기 비용을 못 쟀고**, 보고서에 달러를 적으려면 추정을 해야 했다.
           CLI 가 스스로 보고하는 값이 있으므로 그대로 나른다 — 없으면 null 로 두고 추정하지 않는다. */
        const parsed = JSON.parse(stdout) as {
          result?: string;
          session_id?: string;
          is_error?: boolean;
          total_cost_usd?: number;
          usage?: Record<string, unknown>;
        };
        resolve({
          text: parsed.result ?? '',
          sessionId: parsed.session_id ?? resumeSessionId ?? null,
          isError: Boolean(parsed.is_error),
          costUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
          usage: parsed.usage ?? null,
        });
      } catch {
        resolve({
          text: '',
          sessionId: resumeSessionId ?? null,
          isError: true,
          costUsd: null,
          usage: null,
          failure: timedOut
            ? `CLI 가 ${Math.round(timeoutMs / 1000)}초 안에 안 끝나 죽였다`
            : `CLI 출력을 못 읽었다: ${stdout.slice(0, 200) || '(빈 출력)'}`,
        });
      }
    });
    child.stdin.write(input);
    child.stdin.end();
  });
