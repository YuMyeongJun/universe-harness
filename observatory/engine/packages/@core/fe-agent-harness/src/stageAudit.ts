/**
 * 스테이지 감사 — **하네스가 사적인 스키마를 조용히 버리지 않는가.**
 *
 * ⚠️⚠️ 이 감사가 있는 이유는 실측이다. 진짜 에이전트가 —
 *   · `viewerRequestFunction` 에 **진짜 CloudFront Function 코드**를 썼고(현실에선 그게 맞다) 채점이 터졌다
 *   · `customErrorResponses` 를 **AWS 의 진짜 필드명**으로 썼고 조용히 버려졌다
 *   · 무효화 경로를 **진짜 `--paths`** 로 썼는데 우리는 우리만의 이름만 봤다
 * 셋 다 궤적에는 「에이전트가 못 했다」로 남았다. **reward 가 거짓말을 했다.**
 *
 * ⛔ 이 결함은 **오라클로는 절대 안 보인다** — 오라클은 정답을 알고 있어 틀리게 쓸 일이 없다.
 * 그래서 사람이 아니라 기계가 보게 한다.
 *
 * ⚠️ 코어에 둔 이유: 플러그인마다 베끼면 **언젠가 어긋난다.** 새 플러그인이 이 감사를
 * 안 받는 것이 가장 흔한 어긋남이다.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ISignal, IStageDefinition, IStageIO } from './types.ts';

/** `verify` 안에서 「스키마 파싱」으로 치는 호출. ⛔ **이름으로 찾는다** — 완전한 판별이 아니다. */
export const SCHEMA_PARSE_CALL = /JSON\.parse|load[A-Z]\w+|read[A-Z]\w*Intent/;

export interface IStageAuditFailure {
  stage: string;
  what: string;
}

/**
 * ① 선언한 파싱 자리에 **쓰레기**를 넣고 `verify` 가 터지지 않고 빨간 신호를 내는가.
 *
 * @param seed 스테이지가 verify 를 돌리는 데 필요한 최소 전제(빌드 산출물 등)를 깐다.
 *             ⚠️ 이게 없어서 터지면 **스테이지 결함이 아니라 시험이 비현실적인 것**이다.
 */
export const auditDeclaredParses = async (
  stages: IStageDefinition[],
  seed?: (io: IStageIO) => Promise<void>,
): Promise<IStageAuditFailure[]> => {
  const failures: IStageAuditFailure[] = [];

  for (const stage of stages) {
    for (const target of stage.parses ?? []) {
      const box = await fs.mkdtemp(path.join(os.tmpdir(), 'stage-audit-'));
      const io: IStageIO = {
        root: box,
        exec: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }),
        read: (rel) => fs.readFile(path.join(box, rel), 'utf8'),
        write: async (rel, content) => {
          await fs.mkdir(path.dirname(path.join(box, rel)), { recursive: true });
          await fs.writeFile(path.join(box, rel), content);
        },
        exists: (rel) => fs.stat(path.join(box, rel)).then(() => true).catch(() => false),
        log: () => undefined,
      };
      try {
        await seed?.(io);
        await io.write(target, '이것은 이 스테이지가 아는 어떤 문법도 아니다 {{{ ???');
        let signals: ISignal[];
        try {
          signals = await stage.verify(io);
        } catch (error) {
          failures.push({ stage: stage.id, what: `${target} 에 쓰레기를 넣었더니 **터졌다**: ${String(error).slice(0, 120)}` });
          continue;
        }
        if (!signals.some((signal) => !signal.ok)) {
          failures.push({ stage: stage.id, what: `${target} 의 쓰레기를 **조용히 삼켰다** — 빨간 신호가 하나도 없다` });
        }
      } finally {
        await fs.rm(box, { recursive: true, force: true });
      }
    }
  }
  return failures;
};

/**
 * ①-b **선언 안 한 스테이지에도 쓰레기를 먹인다** — 읽은 자리를 기록해서.
 *
 * ⛔ 실측(R114): ①은 **선언한 자리에만** 쓰레기를 넣는다. 그래서 「파싱하는데 선언을 안 한」
 * 스테이지는 ②(소스 훑기)에만 걸리고, ②는 **이름에 기댄다**(§9). 막고 있던 것은 하나였다 —
 * 「안 선언한 스테이지는 **어느 파일을 망가뜨릴지 모른다**」.
 *
 * 풀이: `verify` 를 **한 번 그냥 돌려 `io.read` 가 무엇을 읽는지 적는다.** 그다음 그 자리마다
 * 쓰레기를 넣고 다시 돌린다. 터지면 파싱한 것이다 — **이름을 몰라도 안다.**
 *
 * ⚠️ 읽기가 없으면 잴 것이 없다. **그때는 「못 쟀다」고 말한다**(§8) — 통과가 아니다.
 * ⚠️ 빨간 신호를 내는 것은 결함이 아니다. 여기서 보는 것은 **터지는가**뿐이다 —
 * 쓰레기를 보고 빨간 신호를 내는 것은 옳은 행동이다.
 */
export const auditUndeclaredParses = async (
  stages: IStageDefinition[],
  seed?: (io: IStageIO) => Promise<void>,
): Promise<IStageAuditFailure[]> => {
  const failures: IStageAuditFailure[] = [];

  for (const stage of stages) {
    if ((stage.parses ?? []).length > 0) {
      continue;   /* 선언한 스테이지는 ①이 본다 */
    }
    const box = await fs.mkdtemp(path.join(os.tmpdir(), 'stage-audit-open-'));
    const readPaths = new Set<string>();
    const makeIo = (): IStageIO => ({
      root: box,
      exec: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }),
      read: async (rel) => {
        /* ⛔ **읽기에 성공한 자리만 적는다(R115).** 없는 파일을 읽으려던 자리까지 적으면
           그 자리에 쓰레기를 넣어도 **다른 파일이 없어서** 터진다 — 그것을 「파싱한다」로
           읽으면 R69 가 가른 구분(「실패한 것」과 「못 돌린 것」)을 뭉개는 것이다. */
        const text = await fs.readFile(path.join(box, rel), 'utf8');
        readPaths.add(rel);
        return text;
      },
      write: async (rel, content) => {
        await fs.mkdir(path.dirname(path.join(box, rel)), { recursive: true });
        await fs.writeFile(path.join(box, rel), content);
      },
      exists: (rel) => fs.stat(path.join(box, rel)).then(() => true).catch(() => false),
      log: () => undefined,
    });
    try {
      const io = makeIo();
      await seed?.(io);
      /* 첫 주행은 **읽는 자리를 알아내려는 것**이다. 터져도 상관없다. */
      await stage.verify(io).catch(() => undefined);
      if (readPaths.size === 0) {
        failures.push({ stage: stage.id, what: '**못 쟀다** — verify 가 `io.read` 를 한 번도 안 불렀다. 통과가 아니다(§8)' });
        continue;
      }
      for (const target of readPaths) {
        const probe = makeIo();
        await seed?.(probe);
        await probe.write(target, '이것은 이 스테이지가 아는 어떤 문법도 아니다 {{{ ???');
        try {
          await stage.verify(probe);
        } catch (error) {
          /* ⚠️ **없는 파일 때문에 터진 것은 파싱이 아니다.** 전제를 못 깔아 준 내 탓이지
             스테이지 탓이 아니다 — 그렇게 말한다(§8: 못 잰 것을 남의 잘못으로 돌리지 않는다). */
          const missing = /ENOENT/.test(String(error));
          failures.push({
            stage: stage.id,
            what: missing
              ? `${target} 은 **못 쟀다** — 다른 전제 파일이 없어 verify 가 거기까지 못 갔다(${String(error).slice(0, 60)})`
              : `${target} 에 쓰레기를 넣었더니 **터졌다** — 파싱하는데 \`parses\` 를 안 적었다: ${String(error).slice(0, 100)}`,
          });
        }
      }
    } finally {
      await fs.rm(box, { recursive: true, force: true });
    }
  }
  return failures;
};

/**
 * ② `verify` 가 스키마를 파싱하는데 `parses` 를 **안 적었는가**(또는 그 반대).
 *
 * 선언은 자발적이라 안 적으면 ①이 아예 안 돈다. 그래서 소스를 직접 본다.
 * 소스를 **텍스트로만** 보는 스테이지는 사적 스키마가 없으므로 해당 없다.
 */
export const auditParsesDeclarations = async (stageDir: string): Promise<IStageAuditFailure[]> => {
  const failures: IStageAuditFailure[] = [];
  const files = (await fs.readdir(stageDir)).filter((name) => /^s\d\d-.*\.ts$/.test(name));

  if (files.length === 0) {
    return [{ stage: stageDir, what: '스테이지 파일을 하나도 못 찾았다 — 이름 규칙이 바뀌었나(0 은 무죄가 아니다)' }];
  }

  for (const file of files) {
    const source = await fs.readFile(path.join(stageDir, file), 'utf8');
    const verifyBody = /verify: async[\s\S]*?\n {4}\},/.exec(source)?.[0] ?? '';
    /* ⛔ **이름 하나에 기대면 다른 이름의 헬퍼는 안 보인다**(R16 이 적어 둔 한계).
       두 번째 신호를 붙인다 — **verify 가 `.json` 을 읽으면** 그 뒤는 대개 파싱이다.
       ⚠️ 둘 다 완전하지 않다. 이름을 숨긴 헬퍼가 `.json` 도 안 드러내면 여전히 못 본다 —
       **어느 쪽도 완전하지 않다는 것을 적어 두는 것**이 지금 할 수 있는 전부다(R114 실측:
       지금 놓치는 것은 0건이고, 그 0을 스테이지 넷의 verify 를 읽어 확인했다). */
    const readsJsonInVerify = /\.json\b/.test(verifyBody);
    const parsesInVerify = SCHEMA_PARSE_CALL.test(verifyBody) || readsJsonInVerify;
    const declares = /\n {4}parses: \[/.test(source);
    if (parsesInVerify && !declares) {
      failures.push({ stage: file, what: 'verify 에서 스키마를 파싱하는데 **parses 를 선언하지 않았다** — 쓰레기를 조용히 삼켜도 아무도 모른다' });
    }
    if (!parsesInVerify && declares) {
      failures.push({ stage: file, what: 'verify 에서 스키마를 파싱하지 않는데 parses 를 선언했다 — 시험이 헛돈다' });
    }
  }
  return failures;
};
