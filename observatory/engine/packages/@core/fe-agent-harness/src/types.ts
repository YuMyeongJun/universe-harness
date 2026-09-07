/**
 * @core/fe-agent-harness — 규격.
 *
 * 이 파일에는 **프로젝트 고유의 것이 하나도 없다.** Vite·React·AWS·이 저장소의 명령은 전부
 * 플러그인(자식 클래스)과 `IHarnessConfig` 로 내려간다. 그래야 다른 저장소에 그대로 얹힌다.
 *
 * ⚠️ Node 의 타입 스트리핑으로 그대로 실행된다(`node <file>.ts`). 그래서 **지워지지 않는 TS
 *    문법은 금지**다 — `enum` · 파라미터 프로퍼티 · `namespace`. 상대 import 는 `.ts` 를 붙인다.
 *    (`tsconfig.json` 의 `erasableSyntaxOnly` 가 컴파일러 단계에서 먼저 막는다.)
 */

/** 에이전트가 한 스텝에 내는 행동. `shell` 은 `probe` 의 옛 이름 — 궤적 호환을 위해 받는다. */
export interface IActionCode {
  kind: 'patch' | 'probe' | 'shell' | 'submit';
  /** kind==='patch' — 워크스페이스 루트 기준 상대 경로 + 파일 전체 내용 */
  files?: IPatchFile[];
  /** kind==='probe' — 읽기 전용 조사 명령 */
  command?: string;
  /** 의도 한 줄. 궤적에 그대로 실린다. */
  note?: string;
}

export interface IPatchFile {
  path: string;
  content: string;
}

export interface IStageDefinition {
  id: string;
  title: string;
  /** 이 스테이지가 가르치려는 것 한 줄. Contract 프롬프트와 WikiSkill 추출의 축이 된다. */
  intent: string;
  maxSteps: number;
  contractLanes: IContractLanes;
  /** 결함 주입. 샌드박스 안에서만 돈다. */
  setup: (io: IStageIO) => Promise<void>;
  briefing: (io: IStageIO) => Promise<string>;
  /** 성공 판정 — 기계가 재는 것만 둔다. */
  verify: (io: IStageIO) => Promise<ISignal[]>;

  /**
   * **에이전트가 쓰는 파일 중 이 스테이지가 «파싱»하는 것.**
   *
   * ⚠️⚠️ 왜 선언하게 하는가: 하네스가 사적인 스키마를 쓰면서 그것을 안 알려 주면,
   * **현실을 아는 에이전트가 벌받는다.** 실제로 두 번 당했다 —
   *   · 에이전트가 진짜 CloudFront Function 코드를 썼는데 로더가 던져 채점이 통째로 터졌다
   *   · 에이전트가 AWS 의 진짜 필드명을 썼는데 우리 스키마와 달라 **조용히 버려졌다**
   * 둘 다 궤적에는 「에이전트가 못 했다」로 남았다. **reward 가 거짓말을 했다.**
   *
   * 여기 적으면 selftest 가 그 파일에 **쓰레기를 넣고** verify 를 돌려,
   * 스테이지가 조용히 넘어가지 않고 **빨간 신호를 내는지** 확인한다.
   *
   * ⛔ 이 결함은 **오라클로는 절대 안 보인다** — 오라클은 정답을 알고 있어 틀리게 쓸 일이 없다.
   *
   * 소스를 텍스트로만 채점하는 스테이지(사적 스키마가 없는 것)는 비워 둔다.
   */
  parses?: string[];
}

/** 스테이지가 쓰는 입출력. 하네스가 주입하므로 스테이지는 경로를 몰라도 된다. */
export interface IStageIO {
  root: string;
  exec: (command: string, options?: IExecOptions) => Promise<IExecResult>;
  read: (relPath: string) => Promise<string>;
  write: (relPath: string, content: string) => Promise<void>;
  exists: (relPath: string) => Promise<boolean>;
  log: (message: string) => void;
}

export interface IExecOptions {
  cwd?: string;
  timeoutMs?: number;
}

export interface IContractLanes {
  quality: boolean;
  typeSafety: boolean;
  tailwind: boolean;
  a11y: boolean;
  delivery: boolean;
}

export interface ISignal {
  name: string;
  ok: boolean;
  /**
   * **못 쟀다** — 이 축은 아예 돌지 않았다. 그러면 `ok` 에는 **뜻이 없다.**
   *
   * ⚠️⚠️ 실측(R146): 이 칸이 없어서 「안 잰 것」이 갈 곳은 초록불뿐이었다.
   * 은하가 `commands.test` 를 **선언하지 않았는데** 게이트는 중립 기본값(`npm test`)을
   * 지어내 돌리고 `✅ test exit 0` 을 찍었다 — 그 은하에는 테스트가 하나도 없는데도.
   * 같은 자리가 진짜 은하(yarn·test 스크립트 없음)에서는 `❌ test exit 1` 이 되어
   * **우주가 지어낸 명령의 실패를 별의 잘못으로** 돌렸다.
   * ⇒ 「잰 초록」·「잰 빨강」·「못 쟀다」는 **셋**이다. 둘로 접으면 셋째가 첫째로 둔갑한다(§8).
   *
   * ⛔ 초록으로도 빨강으로도 **세지 마라.** 세는 순간 이 칸을 만든 이유가 사라진다.
   */
  unmeasured?: string;
  /** 수치는 반드시 명령의 실제 산출에서 읽는다. 추정치를 넣지 않는다. */
  measured?: string;
  detail?: string;
}

export interface IExecResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface IContractVerdict {
  status: 'ALLOWED' | 'REJECTED';
  reasons: IContractReason[];
  /** 판정 원문. 파싱이 어긋났을 때 사람이 볼 유일한 근거다. */
  raw: string;
  lane: 'static' | 'llm' | 'skipped';
  /** 사람이 읽는 반려 사유. 그대로 에이전트 관측에 실린다. */
  feedback: string;
}

export interface IContractReason {
  rule: string;
  where: string;
  evidence: string;
  fix: string;
}

/** Contract 레이어가 받는 것. 코어는 이 규격만 알고, 구현은 `@core/fe-agent-contracts` 가 한다. */
export interface IContractInput {
  stageId: string;
  intent: string;
  lanes: IContractLanes;
  files: IPatchFile[];
  /** 플러그인이 얹는 프로젝트 고유 규칙(예: 배포 레인). */
  extraRules: IStaticRule[];
}

export interface IContractEvaluator {
  evaluate: (input: IContractInput) => Promise<IContractVerdict>;
}

export interface IStaticRule {
  id: string;
  lane: keyof IContractLanes;
  applies: (file: IPatchFile) => boolean;
  scan: (file: IPatchFile) => IContractReason[];
  /**
   * 패턴 기반 규칙이면 그 패턴. **밖에서 「규칙이 바뀌었는가」를 알기 위한 것**이다.
   *
   * ⚠️ 없으면 못 안다 — `patternRule` 이 만드는 `scan` 클로저는 패턴이 달라도 소스가
   * 똑같아서, 그것만 해시하면 **규칙을 넓혀도 지문이 그대로다.** 실측으로 당했다(R31).
   */
  pattern?: RegExp;
  /**
   * **이 규칙이 벌하면 안 되는 모양들** — 실측으로 드러난 오탐.
   *
   * ⛔ 왜 구조인가(R127): 전엔 주석에만 적혀 있었다. 그래서 `quality/magic-number` 가
   * **오탐 셋을 적어 두고 known-negative 에는 하나도 안 넣은 채** 지나갔다(R126 이 손으로
   * 훑어 찾았다). 주석은 자연어라 기계가 못 센다 — **적으면 시험이 요구하게** 만든다.
   *
   * 여기 이름을 적으면 그 규칙의 known-negative 안에 `fp: <이름>` 표시가 있어야 한다.
   * 없으면 엔진 계약 시험이 문다.
   */
  falsePositives?: string[];
}

export interface IObservation {
  stageId: string;
  step: number;
  maxSteps: number;
  text: string;
  signals: ISignal[];
}

export interface IStepResult {
  observation: IObservation;
  reward: number;
  done: boolean;
  status: 'ALLOWED' | 'REJECTED' | 'BLOCKED' | 'SOLVED' | 'FAILED';
  verdict: IContractVerdict | null;
  signals: ISignal[];
  elapsedMs: number;
}

/** 격리 워크트리. 결함 주입과 측정은 **원본 워크트리 밖**에서만 한다. */
export interface ISandbox {
  root: string;
  runId: string;
  exec: (command: string, options?: IExecOptions) => Promise<IExecResult>;
  read: (relPath: string) => Promise<string>;
  write: (relPath: string, content: string) => Promise<void>;
  exists: (relPath: string) => Promise<boolean>;
  diff: () => Promise<string>;
  dispose: () => Promise<void>;
}

export interface ITrajectoryRecorder {
  path: string;
  append: (entry: Record<string, unknown>) => Promise<void>;
}

export interface IHarnessConfig {
  /** 감쌀 저장소의 루트. 여기를 복제해 샌드박스를 만든다. */
  repoRoot: string;
  /** 스테이지 목록. 플러그인이 채운다(자식 클래스의 `provideStages()` 와 합쳐진다). */
  stages?: IStageDefinition[];
  /** 기존 하네스의 명령. **이름만 받는다 — 하네스 코드는 고치지 않는다.** */
  commands: IHarnessCommands;
  contract?: {
    /** 판정 레이어 구현. 없으면 Contract 는 통째로 건너뛴다(정적 레인도 안 돈다). */
    evaluator?: IContractEvaluator;
  };
  sandbox?: {
    /** 워크트리를 뜰 기준. 기본 `HEAD`. */
    baseRef?: string;
    /** 설치 대신 링크할 경로들(`node_modules` 등). 프로젝트마다 다르므로 여기서 받는다. */
    linkPaths?: string[];
    /** 링크 대신 실제 설치를 돌린다(의존성을 바꾸는 스테이지에 필요하다 · 느리다). */
    install?: boolean;
  };
  /** 조사(probe) 액션에서 막을 명령. 기본은 게이트·네트워크·git 쓰기. */
  probeDenyList?: RegExp[];
  /** 궤적 JSONL 이 쌓이는 곳. 기본 `<repoRoot>/.harness/trajectories`. */
  trajectoryDir?: string;
  /** 샌드박스를 남긴다(사후 조사용). */
  keepSandbox?: boolean;
  /** 끊겼을 때(`SIGINT`·`SIGTERM`) 샌드박스를 치울까. 기본 `true`. ⚠️ `SIGKILL` 은 못 잡는다. */
  cleanupOnSignal?: boolean;

  /** boot build 가 빨개도 에피소드를 계속한다. **기본은 false — 멈춘다.**
   *  기본을 「계속」으로 두면 배선 오류가 에이전트 실패로 둔갑한다(실측). */
  allowFailingBootBuild?: boolean;
}

/**
 * 은하가 **선언한** 명령들.
 *
 * ⚠️⚠️ `build` 와 `test` 는 **필수가 아니다**(R146 에서 풀었다). 예전엔 둘 다 `string` 이라
 * 타입 자체가 「모든 저장소에 테스트가 있다」고 우기고 있었고, 그래서 없는 저장소에는
 * 중립 기본값을 **지어넣어야** 했다. 지어낸 명령의 결과는 측정이 아니다.
 * ⇒ 없으면 `undefined` 로 두고, 게이트는 그 축을 `unmeasured` 로 낸다.
 * (`bigbang` 의 컴파일 관문은 이미 이 규칙이었다 — 「명령을 지어내지 않는다」.
 *  두 층이 서로 다른 규칙을 쓰고 있었던 것이 결함이었다.)
 */
export interface IHarnessCommands {
  install?: string;
  build?: string;
  test?: string;
  lint?: string;
  /** lint 결과를 JSON 으로 떨어뜨리는 명령. `<OUT>` 자리가 파일 경로로 치환된다.
   *  ⚠️ `lint | tail` 로 재지 마라 — 파이프 뒤의 종료코드는 마지막 명령의 것이라 실패가 0으로 보인다. */
  lintJson?: string;
  /**
   * 타입 검사 명령.
   * ⚠️⚠️ 실측(R146): 이 칸이 **타입에 없어서** 은하가 `commands.typecheck` 를 적어도
   * 아무도 안 읽었다. `tiny-galaxy` 는 R45 부터 이것을 선언해 왔는데 게이트는 한 번도
   * 안 돌렸고, 화면은 초록불 셋과 `[SOLVED]` 만 보여 줬다 — **안 돈 축은 화면에 없다.**
   * 그것이 R71 이 「타입 검사 갈래가 한 번도 안 탔다」고 적어 둔 자리다.
   */
  typecheck?: string;
  /** 추가 정적 검사. 이름 → 명령. */
  extraGates?: Record<string, string>;
}
