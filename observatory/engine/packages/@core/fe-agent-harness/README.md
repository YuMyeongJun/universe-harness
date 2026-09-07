# @core/fe-agent-harness

EnvHarness 규격(`reset()` / `step()`)을 **프레임워크 무관하게** 구현한 코어.
React 도 Vite 도 AWS 도 모른다 — 그것들은 플러그인이 가진다.

## 무엇이 들어 있나

| 모듈 | 하는 일 |
|------|---------|
| `EnvHarness` | 추상 클래스. reset/step/궤적/보상 계산. **자식이 채우는 훅은 `executeBuildAndTest` 하나뿐** |
| `PluggableHarness` | 상속하지 않는 확장 경로. 플러그인 객체만 넘기면 돈다 |
| `createSandbox` | `git worktree` 격리 + `node_modules` 링크. 결함 주입은 여기서만 |
| `createLocalIO` | 격리 없이 워킹트리를 그대로 재는 IO (`verify` 전용) |
| `gates` | `runLintJsonGate`·`runCommandGate`·`runSequentialGates` — 명령을 받아 신호로 바꾼다 |
| `trajectory` | JSONL 기록. **WikiSkill 추출의 유일한 입력** |
| `runner` | 도구 없는 에이전트 루프(`runEpisode`) |
| `setup-template` | 소비 저장소의 배선(스크립트·`run-agent.mjs`)을 까는 제너레이터 |
| `contracts/agent-behavior-guide.md` | 에이전트에 주입되는 행동 규약(패키지에 내장) |

## 확장하는 두 가지 길

```ts
// ① 상속 — 훅을 여럿 덮어써야 할 때
class MyHarness extends EnvHarness {
  protected async executeBuildAndTest(io: IStageIO): Promise<ISignal[]> { /* … */ }
}

// ② 주입 — 스테이지 두어 개면 이게 싸다
const harness = new PluggableHarness({
  repoRoot: process.cwd(),
  commands: { build: 'pnpm build', test: 'pnpm test' },
  plugins: [{ id: 'next', stages: MY_STAGES, buildAndTest: myGates }],
});
```

## 설계상 양보하지 않는 것

- **소비 저장소를 고치지 않는다.** 검증은 그 저장소의 기존 명령을 부르는 것뿐이다.
- **게이트는 중앙에서 한 번만.** 스테이지도 에이전트도 게이트를 못 돌린다
  (타입 인지 lint 저장소에서 동시 실행하면 `eslint ./src` 가 10.3초 → 21분이 된다 · 실측).
- **도구 없는 에이전트.** `toolless` 는 Read·Glob·Grep 까지 막는다. 그래야 조사가
  `probe` 액션으로 기록된다 — 안 그러면 정답을 맞혀도 **어떻게 알았는지가 궤적에 안 남는다**.
- **게이트가 빨간불이면 스테이지 채점을 하지 않는다.** 죽은 빌드 위의 수치는 전부 거짓이다.

## 보상

```
0.4 × 게이트 통과율 + 0.4 × 채점 통과율 + max(0, 0.2 − 0.05 × 반려수) − 0.02 × 스텝
```

## 실행 형태

`exports` 는 `dist/*.js` 를 가리킨다. Node 의 타입 스트리핑이 `node_modules` 밑의 `.ts` 를
거부하므로(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`) **무빌드 배포는 불가능**하다.
개발 중에는 소스를 직접 실행해도 된다.

자세한 것은 저장소 루트의 [README](../../../../../README.md) · [CONTRIBUTING](../../../../../CONTRIBUTING.md).
