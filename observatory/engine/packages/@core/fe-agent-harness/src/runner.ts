/**
 * 러너 — 하네스 하나를 끝까지 돌린다. **하네스 구현을 모른다**(주입받는다).
 *
 * 에이전트는 도구 없는 `claude -p` 다. 행동은 오직 JSON 한 개로 나오고, 그 JSON 이 step() 에
 * 들어간다. 즉 **환경만이 파일을 만진다.** 에이전트가 직접 쓰면 Contract 를 우회하게 되고
 * 훈련장이 무의미해진다.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callClaude } from './agent/claudeCli.ts';
import type { EnvHarness } from './EnvHarness.ts';
import type { IActionCode } from './types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const AGENT_PROTOCOL_PATH = path.join(here, 'agent', 'agentProtocol.md');

/** 모델이 규약을 어겨도 훈련을 죽이지 않는다 — 첫 JSON 객체만 건져 쓴다. */
export const parseAction = (text: string): IActionCode => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return { kind: 'probe', command: 'echo "행동 JSON 을 못 읽었다"', note: 'protocol violation' };
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as IActionCode;
  } catch {
    return { kind: 'probe', command: 'echo "행동 JSON 파싱 실패"', note: 'protocol violation' };
  }
};

export interface IRunOptions {
  harness: EnvHarness;
  stageId: string;
  agentModel?: string;
  protocolPath?: string;
  maxTurns?: number;
  /** 에이전트 한 턴의 상한. 기본 600초 — 조사에 도구를 못 쓰므로 여러 probe 턴으로 나뉜다. */
  agentTimeoutMs?: number;
  onLog?: (message: string) => void;
}

export interface IEpisodeResult {
  solved: boolean;
  reward: number;
  trajectoryPath: string;
  /** LLM 호출 횟수(재시도 포함). 오라클 주행이면 0 이다. */
  agentCalls: number;
  /** CLI 가 스스로 보고한 비용의 합(USD). **한 번이라도 보고가 없으면 null** — 반쪽 합계는 거짓이다. */
  costUsd: number | null;
}

export const runEpisode = async (options: IRunOptions): Promise<IEpisodeResult> => {
  const { harness, stageId, agentModel = 'sonnet', protocolPath = AGENT_PROTOCOL_PATH, maxTurns = 40 } = options;
  const log = options.onLog ?? ((message: string) => console.log(message));

  let observation = await harness.reset(stageId);
  let sessionId: string | null = null;
  let reward = 0;
  let solved = false;
  /* ⚠️ 비용을 세지 않던 시절엔 보고서에 달러를 적으려면 추정을 해야 했다.
     CLI 가 스스로 보고하므로 그대로 더한다. 단 **한 호출이라도 보고가 없으면 합계를 null 로**
     떨어뜨린다 — 일부만 더한 수는 「싸 보이는 거짓말」이 된다. */
  let agentCalls = 0;
  let costUsd: number | null = 0;
  const addCost = (reply: { costUsd: number | null }) => {
    agentCalls += 1;
    if (costUsd === null) { return; }
    costUsd = reply.costUsd === null ? null : costUsd + reply.costUsd;
  };
  log(observation.text);

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const ask = () =>
      callClaude({
        systemPromptFile: protocolPath,
        input: observation.text,
        model: agentModel,
        resumeSessionId: sessionId,
        toolless: true,
        timeoutMs: options.agentTimeoutMs,
      });

    /* 한 번은 봐준다 — 빈 출력·타임아웃은 흔하고, 그것 때문에 30분짜리 에피소드를 버릴 이유가 없다.
       두 번째도 실패하면 **끝내되 지금까지의 궤적은 지킨다**(예외로 죽지 않는다). */
    let answer = await ask();
    addCost(answer);
    if (answer.isError) {
      log(`\n⚠️ 에이전트 호출 실패 — 한 번 재시도한다: ${answer.failure ?? ''}`);
      answer = await ask();
      addCost(answer);
    }
    if (answer.isError) {
      log(`\n⛔ 에이전트 호출이 두 번 실패해 에피소드를 여기서 끝낸다: ${answer.failure ?? ''}`);
      break;
    }
    sessionId = answer.sessionId;

    const action = parseAction(answer.text);
    log(`\n▶ ${action.kind} ${action.note ?? ''}`);

    const result = await harness.step(action);
    observation = result.observation;
    reward = result.reward;
    solved = result.status === 'SOLVED';
    log(`${observation.text}\n(reward ${result.reward})`);

    if (result.done) {
      break;
    }
  }

  const spent = costUsd === null ? '보고 없음' : `$${costUsd.toFixed(4)}`;
  log(`\n💸 LLM 호출 ${agentCalls}회 · 비용 ${spent} (CLI 자기 보고 · 추정 아님)`);
  await harness.annotate({ kind: 'cost', agentCalls, costUsd });

  await harness.close();
  return { solved, reward, trajectoryPath: harness.trajectoryPath, agentCalls, costUsd };
};
