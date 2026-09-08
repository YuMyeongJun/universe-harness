/**
 * REST — 화면이 부르는 것 전부. 상태를 바꾸는 것은 전부 명시적 POST/PUT 이다.
 *
 * ── ⭐ 형제 저장소를 끊었다 ──────────────────────────────
 * 전에는 이 파일의 라우트 **13개**가 `/api/domains/**` 였고, 그것들은 전부
 * **형제 폴더의 남의 저장소**(`qa-workflow-v2-main`)를 지식 출처로 삼았다.
 * `qa-harness` 에서 이 콘솔이 흡수돼 올 때 딸려 온 길이고, 우주의 은하와는
 * 아무 관계가 없었다 — 첫 화면이 남의 저장소의 「도메인」을 보여 주고 있었다.
 * ⇒ 라우트도, 그것을 먹이던 모듈(`domains`·`survey`·`collect`·`emit`·`provenance`)도
 *   **전부 지웠다.** 이 콘솔이 읽는 정본은 이제 `universe.config.json` 과
 *   `galaxies/`·`galaxies.local/` 뿐이다.
 *
 * ⚠️ **화면이 판정을 뒤집지 못하게 한다.** 어떤 라우트도 "확인 안 된 항목을 확인된 것으로"
 *    바꾸는 지름길을 주지 않는다. 사람이 항목마다 눌러야 `confirmed` 가 된다.
 */
import { createReadStream, existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

import express, { type Request, type Response } from 'express';

import { browse, browseProblem } from './browse.js';
import { listGalaxies } from './galaxies.js';
import { ghLoginBusy, ghLoginCancel, ghLoginStart, ghLoginState, ghOrgs, ghStatus } from './gh.js';
import {
  draftIdProblem,
  inputProblem,
  makeGalaxyDraft,
  readGalaxyDraft,
  writeGalaxyCoordinates,
  writeInputProblem,
} from './galaxy-draft.js';
import { adoptDraft, adoptInputProblem, branchProblem, cloneInputProblem, cloneRepo, listBranches, listRepos, ownerProblem } from './clone.js';
import { emitTemplate, runTc, tcInputProblem, watchInputProblem, watchRun, type TcFormat } from './tc.js';
import { galaxyNameProblem, observeGalaxy, sampleProblem } from './observation.js';
import {
  fromParamProblem,
  receiveRunResult,
  unwrapEnvelope,
} from './run-result.js';
import {
  listRuns,
  readRun,
  recordVerdict,
  runIdProblem,
  saveRun,
  verdictInputProblem,
} from './run-store.js';
import { dataDir, HARNESS_ROOT } from './paths.js';
import {
  cannotMeasureBecause,
  galaxyName,
  measurePreconditions,
  stands,
  type IPrecondition,
} from './preconditions.js';

const fail = (res: Response, code: number, message: string): void => {
  res.status(code).json({ error: message });
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const createApp = (): express.Express => {
  const app = express();

  /**
   * ⛔⛔ **주행 결과 길만 `express.json` 을 태우지 않는다.**
   *    `express.json` 은 깨진 본문을 **400** 으로 만든다. 그런데 「JSON 이 깨졌다」는
   *    ⚪ **못 쟀다**이지 「요청이 잘못됐다」가 아니고, 그 말을 하는 자리는 계약
   *    (`qa/src/run/cli.ts`)이다. 앞에서 400 을 내면 판정 어휘가 하나 사라지고,
   *    화면은 「못 쟀다」를 「보내다 실패했다」로 그린다.
   *    ⇒ 이 길은 본문을 **글자 그대로** 받아(`express.text`) 도구에게 그대로 넘긴다.
   */
  const jsonBody = express.json({ limit: '4mb' });
  const RUNS_PATH = '/api/runs';
  app.use((req: Request, res: Response, next: express.NextFunction) => {
    if (req.path === RUNS_PATH) return next();
    jsonBody(req, res, next);
  });

  /**
   * 서버가 서 있는가, 그리고 **무엇을 정본으로 읽는가.**
   *
   * ⚠️⚠️ 전에는 이 자리가 **형제 폴더의 남의 저장소**(`qa-workflow-v2-main`)를 찾았는지
   * 답했다. 그 길은 이 콘솔이 `qa-harness` 에서 흡수돼 올 때 딸려 온 것이고,
   * 우주의 은하와는 아무 관계가 없었다 — **끊었다.**
   *
   * ⛔ 그래서 `ok` 를 **상수 `true` 로 두지 않았다.** 그건 「서버가 답했다」와
   *    「읽을 것이 실재한다」를 같은 말로 만드는 자리다(이 저장소가 제일 싫어하는 모양).
   *    이제 이 콘솔의 정본은 **우주 자신의 명부**(`universe.config.json`)이므로,
   *    그것이 실재하는지를 **재서** 답한다. 없으면 `ok:false` 와 **찾아본 자리**를 준다.
   */
  app.get('/api/health', (_req: Request, res: Response) => {
    const manifest = join(HARNESS_ROOT, 'universe.config.json');
    const ok = existsSync(manifest);
    res.json({
      ok,
      universeRoot: HARNESS_ROOT,
      ...(ok
        ? {}
        : {
            tried: manifest,
            hint: '우주 저장소 뿌리에서 서버를 띄우세요 — universe.config.json 이 이 콘솔의 정본입니다.',
          }),
    });
  });

  /**
   * ⭐ **재기 전에 「잴 수 있는가」를 묻는 자리.** 화면이 주행 버튼을 누르기 **전에** 부른다.
   *
   * ⛔ 여기서 `ok:false` 나 `ok:null` 이 나오면 그 주행의 결과는 전부 ⚪ 다 — ❌ 로 세지 않는다.
   *    이걸 안 물어보고 돌리면, 「환경이 없어서 못 잰 것」이 「제품이 깨진 것」으로 보고된다.
   */
  app.get('/api/preconditions', (_req: Request, res: Response) => {
    /* ⛔ 주행이 안 정해진 자리다 — 세션 축을 쓸지는 **좌표만** 말한다. 여기서 요구하지 않는다. */
    void measurePreconditions({ galaxy: galaxyName() }).then((preconditions: IPrecondition[]) => {
      res.json({
        preconditions,
        measurable: stands(preconditions),
        unmeasured: cannotMeasureBecause(preconditions),
      });
    });
  });


  // ── 은하 등록 ────────────────────────────────────────────
  // 로컬 폴더를 받아 **좌표 초안**을 만든다. ⛔ 여기서 좌표를 만들지 않는다 —
  // `bin/galaxy.mjs` 가 만들고, 서버는 부르고 나른다(자세한 이유는 galaxy-draft.ts 머리말).

  /**
   * 초안 만들기. `{ name, dir }` 를 받는다.
   *
   * ⛔ **못 쟀을 때 4xx 를 주지 않는다.** 「그 폴더에 `package.json` 이 없다」는
   *    제품이 깨진 것(❌)이 아니라 **잴 수 없는 것**(⚪)이다. `/scan` 이 전제가 안 설 때
   *    200 + `measurable:false` 로 답하는 것과 같은 갈림이다. 입력이 잘못된 것만 400 이다.
   * ⛔ 초안은 **`.data/`(gitignore)** 에 떨어진다. 커밋되는 `galaxies/` 에 올릴지는 사람이 정한다.
   */
  app.post('/api/galaxy-drafts', (req: Request, res: Response) => {
    const body = req.body as { name?: unknown; dir?: unknown };
    const problem = inputProblem(body.name, body.dir);
    if (problem !== null) return fail(res, 400, problem);
    void makeGalaxyDraft(String(body.name).trim(), String(body.dir).trim()).then(
      (result) => res.json(result),
      (e: unknown) => fail(res, 500, `좌표 도구를 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * **깃 주소를 받아 저장소를 받아 온다.** `{ url, name? }`.
   *
   * ⛔ 받는 규율은 `bin/clone.mjs` 가 안다 — 서버는 **부르고 나른다**(clone.ts 머리말).
   * ⛔ **토큰 칸이 없다.** 인증은 그 기계의 git 이 한다. 자격이 박힌 주소는 거절한다 —
   *    그 순간 토큰이 **인자**가 되어 셸 히스토리·프로세스 목록·서버 로그에 남는다.
   * ⛔ **못 받은 것을 4xx 로 만들지 않는다.** 「자격이 없다」·「그런 저장소가 없다」는
   *    **결과**다(200 + `ok:false` + 도구가 한 말). 400 은 **요청의 모양**이 틀렸을 때뿐이다.
   */
  /**
   * 그 저장소의 **가지 목록.** ⛔ 여기서 받아 오지 않는다 — 묻기만 한다.
   * ⛔ `ok:false` 를 빈 목록으로 접지 않는다: 「가지가 없다」와 「자격이 없어 못 물어봤다」는 다르다.
   */
  app.get('/api/branches', (req: Request, res: Response) => {
    const url = req.query['url'];
    /* 주소 규율은 받아 오기와 **같은 자리**를 쓴다 — 두 벌이면 하나만 고쳐진다. */
    const problem = cloneInputProblem(url, undefined);
    if (problem !== null) return fail(res, 400, problem);
    void listBranches(String(url).trim()).then(
      (result) => res.json(result),
      (e: unknown) => fail(res, 500, `가지 목록 도구를 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  app.post('/api/clones', (req: Request, res: Response) => {
    const body = req.body as { url?: unknown; name?: unknown; branch?: unknown };
    const problem = cloneInputProblem(body.url, body.name) ?? branchProblem(body.branch);
    if (problem !== null) return fail(res, 400, problem);
    void cloneRepo(
      String(body.url).trim(),
      body.name === undefined ? undefined : String(body.name),
      body.branch === undefined ? undefined : String(body.branch),
    ).then(
      (result) => res.json(result),
      (e: unknown) => fail(res, 500, `받아 오는 도구를 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * **이 기계의 gh 가 아는 레포 목록.** `?limit=` 만 받는다.
   *
   * ⛔ 서버가 `gh` 를 직접 부르지 않는다 — `bin/repos.mjs` 가 토큰 방어를 갖고 있다(clone.ts 머리말).
   * ⛔ 못 읽은 것을 **빈 목록으로 접지 않는다** — 「레포가 없다」와 「못 쟀다」는 다른 사실이다.
   */
  /**
   * ── 폴더 훑기 ── 화면이 폴더를 **고를** 수 있게 한다.
   *
   * ⛔⛔ 브라우저의 폴더 선택기로는 **절대 경로를 못 얻는다**(`webkitdirectory` 는 앞이 잘리고,
   *    `showDirectoryPicker` 는 경로가 아예 없다). 서버는 `bin/galaxy.mjs` 에 실제 경로를
   *    넘겨야 하므로 **서버가 훑어 준다.** 자세한 이유와 한계는 `browse.ts` 머리말에 있다.
   * ⚠️ 홈 밖은 거절한다 — 「로컬이니까 괜찮다」로 안 넘겼다.
   */
  app.get('/api/fs', (req: Request, res: Response) => {
    const raw = req.query['dir'];
    const problem = browseProblem(raw);
    if (problem !== null) return fail(res, 400, problem);
    void browse(raw === undefined ? undefined : String(raw)).then(
      (result) => res.json(result),
      /* ⛔ 못 읽었으면 **빈 목록을 주지 않는다** — 빈 목록은 「폴더가 없다」로 읽힌다(§8). */
      (e: unknown) => fail(res, 400, `그 폴더를 읽지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * ── 깃 로그인 ──
   *
   * ⭐ `GET` 은 **지금 어느 계정인가**를 늘 함께 낸다. 「로그인됨」만 내면
   *    조직 계정과 개인 계정이 섞이는 날 **어느 쪽으로 붙었는지 아무도 모른다**
   *    (`bin/gh-auth.mjs` 머리말의 그 규율).
   */
  app.get('/api/gh', (_req: Request, res: Response) => {
    void ghStatus().then((status) => res.json({ ...status, login: ghLoginState() }));
  });

  /**
   * 기기 흐름 시작 — **코드와 URL 을 먼저** 돌려주고 나머지는 배경에서 돈다.
   * ⛔ 이미 돌고 있으면 새로 안 띄운다(409). 코드가 둘이면 사람이 어느 것을 넣을지 모른다.
   */
  app.post('/api/gh/login', (_req: Request, res: Response) => {
    if (ghLoginBusy()) {
      return fail(res, 409, '로그인이 이미 진행 중입니다 — 화면의 일회용 코드를 그대로 쓰세요.');
    }
    void ghLoginStart().then((state) => res.json(state));
  });

  /**
   * 이 계정이 속한 **조직**. 화면이 소유자 칸의 후보로 쓴다.
   * ⛔ 「조직이 없다」와 「못 물어봤다」를 화면이 가를 수 있게 `ok` 를 함께 낸다.
   */
  app.get('/api/gh/orgs', (_req: Request, res: Response) => {
    void ghOrgs().then((r) => res.json(r));
  });

  /** 진행 상태를 묻는다. 화면이 이걸 주기적으로 부른다. */
  app.get('/api/gh/login', (_req: Request, res: Response) => {
    res.json(ghLoginState());
  });

  app.post('/api/gh/login/cancel', (_req: Request, res: Response) => {
    ghLoginCancel();
    res.json(ghLoginState());
  });

  /**
   * ⚠️⚠️ `?owner=` 를 **받는다.** 없던 칸이고, 없어서 데였다:
   * 계정이 **조직에만** 속해 있으면 자기 소유 레포가 0개라 화면이 「저장소가 없다」로 보인다.
   * ⛔ 그건 **못 본 것**이지 없는 것이 아니다(§8). 소유자를 못 바꾸면 사람은
   *    「private 이라 안 보이나」를 혼자 추측하게 된다 — 실제로 그렇게 물었다.
   */
  app.get('/api/repos', (req: Request, res: Response) => {
    const raw = req.query['limit'];
    const limit = raw === undefined ? undefined : Number(raw);
    if (raw !== undefined && (!Number.isInteger(limit) || (limit as number) < 1)) {
      return fail(res, 400, 'limit 은 1 이상의 정수라야 합니다.');
    }
    const owner = req.query['owner'];
    const bad = ownerProblem(owner);
    if (bad !== null) return fail(res, 400, bad);
    void listRepos(limit, owner === undefined ? undefined : String(owner)).then(
      (result) => res.json(result),
      (e: unknown) => fail(res, 500, `레포 목록 도구를 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * **TC 양식을 내준다.** `?format=tsv|csv`. 모델 **0회**.
   *
   * ⛔ 서버가 양식을 손으로 짜지 않는다 — 도구를 돌려 나온 파일을 읽는다(`tc.ts` 머리말).
   * ⛔ 도구를 못 돌린 것을 **빈 양식으로 접지 않는다** — 빈 양식을 받은 사람은
   *    그걸 채워서 올리고, 그때 거부당하며 **자기가 틀린 줄 안다.**
   */
  app.get('/api/tc/template', (req: Request, res: Response) => {
    const raw = req.query['format'];
    const format: TcFormat = raw === 'csv' ? 'csv' : 'tsv';
    if (raw !== undefined && raw !== 'csv' && raw !== 'tsv') {
      return fail(res, 400, 'format 은 tsv 나 csv 라야 합니다.');
    }
    void emitTemplate(format).then(
      (result) => res.json(result),
      (e: unknown) => fail(res, 500, `양식 도구를 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * **채워 온 TC 를 돌린다.** `{ cases, preconditions?, casesName?, preconditionsName? }`.
   *
   * ⛔ **경로가 아니라 내용을 받는다** — 경로를 받으면 우주 밖 아무 파일이나 읽는 자리가 된다.
   * ⛔ **`--run` 을 안 만든다** — 그 칸을 열면 이 콘솔이 원격 명령 실행기가 된다.
   * ⛔ **종료코드 3(못 쟀다)을 4xx 로 만들지 않는다.** 「전제가 안 섰다」·「검증 분모가 0이다」는
   *    **결과**다(200 + `unmeasured:true`). 400 은 요청의 모양이 틀렸을 때뿐이다.
   */
  app.post('/api/tc/runs', (req: Request, res: Response) => {
    const problem = tcInputProblem(req.body);
    if (problem !== null) return fail(res, 400, problem);
    void runTc(req.body as Parameters<typeof runTc>[0]).then(
      (result) => res.json(result),
      (e: unknown) => fail(res, 500, `TC 도구를 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * **보면서 돌린다.** `{ galaxy }` — 브라우저 창이 뜨고 느리게 움직인다.
   *
   * ⛔⛔ **명령을 받지 않는다.** 은하 이름만 받고, 돌릴 축은 **은하 파일이 선언한다**
   *    (`commands.e2eWatch`). 안 그러면 이 자리가 원격 명령 실행기가 된다.
   * ⛔ **못 쟀다(3)를 4xx 로 만들지 않는다** — 「그 은하가 보는 축을 선언 안 했다」는
   *    **결과**다(200 + `unmeasured:true`). 400 은 요청의 모양이 틀렸을 때뿐이다.
   */
  app.post('/api/e2e/watch', (req: Request, res: Response) => {
    const body = req.body as { galaxy?: unknown };
    const problem = watchInputProblem(body.galaxy);
    if (problem !== null) return fail(res, 400, problem);
    void watchRun(String(body.galaxy)).then(
      (result) => res.json(result),
      (e: unknown) => fail(res, 500, `보는 축을 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * **채운 초안을 은하로 들인다.** `{ draft }`.
   *
   * ⛔ 들이는 규율은 `bin/adopt.mjs` 가 안다 — 서버는 **부르고 나른다**.
   * ⛔ **받아 온 자리 안의 초안만** 받는다 — 아무 경로나 받으면 우주 밖 파일을 읽는 자리가 된다.
   * ⛔ **못 들인 것을 4xx 로 만들지 않는다.** 「`TODO:` 가 남았다」·「이미 있는 은하다」는
   *    **결과**다(200 + `ok:false` + 도구가 한 말). 400 은 요청의 모양이 틀렸을 때뿐이다.
   */
  app.post('/api/adopt', (req: Request, res: Response) => {
    const body = req.body as { draft?: unknown };
    const problem = adoptInputProblem(body.draft);
    if (problem !== null) return fail(res, 400, problem);
    void adoptDraft(String(body.draft)).then(
      (result) => res.json(result),
      (e: unknown) => fail(res, 500, `들이는 도구를 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * 만들어 둔 초안을 다시 본다 — **후보·읽어낸 명령·못 읽은 자리**를 그대로 준다.
   * ⛔ 태양계는 여기서도 **고르지 않는다.** 후보만 준다(관측 법칙 §9).
   */
  /**
   * ⭐ **사람이 채운 값을 초안에 적는다** — 화면의 마지막 한 걸음.
   *
   * ⛔⛔ **이 라우트는 없었다.** 화면은 이 주소를 부르고 있었는데 서버에 자리가 없어서,
   * 「좌표에 적기」를 누르면 ⚪ 로 물러나고 사람은 결국 **파일을 손으로 열어야** 했다.
   * 「화면이 정본이다」가 마지막 칸에서 깨져 있었던 것이다.
   * ⛔ 여전히 커밋되는 `galaxies/` 에는 안 쓴다 — 초안은 `.data/` 에 산다.
   */
  app.put('/api/galaxy-drafts/:id/coordinates', (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const bad = draftIdProblem(id);
    if (bad !== null) return fail(res, 400, bad);
    const body = req.body as { filled?: unknown };
    const problem = writeInputProblem(body.filled);
    if (problem !== null) return fail(res, 400, problem);
    try {
      res.json(writeGalaxyCoordinates(id, body.filled as Record<string, string>));
    } catch (e: unknown) {
      /* ⛔ 4xx 다 — 「못 쟀다」가 아니라 **사람이 잘못 준 것**이다(없는 자리 · TODO 가 아닌 칸). */
      return fail(res, 400, (e as Error).message);
    }
  });

  app.get('/api/galaxy-drafts/:id', (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const problem = draftIdProblem(id);
    if (problem !== null) return fail(res, 400, problem);
    const found = readGalaxyDraft(id);
    if (found === null) return fail(res, 404, '그런 좌표 초안이 없습니다.');
    res.json(found);
  });

  // ── 은하 목록 ────────────────────────────────────────────
  // ⭐ **이 콘솔의 첫 화면이 보는 것.** 우주가 아는 은하를 그대로 나른다.
  // ⛔ 여기서 좌표를 찾는 규칙을 다시 짜지 않는다 — `lib/galaxy-load.mjs` 가 안다(galaxies.ts 머리말).

  /**
   * `GET /api/galaxies`
   *
   * ⛔ **못 쟀을 때 4xx 를 주지 않는다.** 「좌표 파일이 없다」·「경로가 이 기계에 없다」·
   *    「기준선이 없다」는 전부 **결과**이지 요청이 잘못된 것이 아니다.
   *    `observations`·`galaxy-drafts` 와 같은 갈림이다. 입력이 없는 라우트라 400 도 없다.
   *    `universe.config.json` 자체를 못 읽었을 때만 `registered: null` + `unmeasured` 다.
   * ⛔ **한쪽에만 있는 것을 조용히 빼지 않는다** — 등재만 된 것도, 좌표만 있는 것도 실어 보낸다.
   *    그 침묵이 R121 에서 「아무것도 안 재고 초록불」을 냈다.
   * ⛔ **응답을 로그로 남기지 않는다.** `galaxies.local/` 의 경로는 남의 홈 경로다(R152).
   */
  app.get('/api/galaxies', (_req: Request, res: Response) => {
    void listGalaxies().then(
      (result) => res.json(result),
      /* 여기까지 오면 목록을 만드는 것조차 못 한 것이다 — 그것은 서버 잘못이라 5xx 다. */
      (e: unknown) => fail(res, 500, `은하 목록을 만들지 못했습니다: ${(e as Error).message}`),
    );
  });

  // ── 관측 ────────────────────────────────────────────────
  // 은하를 **다시 재서** 위반과 처방을 준다. ⛔ 여기서 위반을 세지 않는다 —
  // `observatory/observe.mjs --json` 이 세고, 서버는 부르고 나른다(observation.ts 머리말).

  /**
   * `GET /api/observations/:galaxy?sample=<n>`
   *
   * ⛔ **못 쟀을 때 4xx 를 주지 않는다.** 「그런 은하가 없다」·「기준선이 낡았다」·
   *    「훑은 파일이 0개다」는 전부 **결과**이지 요청이 잘못된 것이 아니다.
   *    `galaxy-draft` 가 「그 폴더에 `package.json` 이 없다」를 4xx 로 안 주는 것과 같은 갈림이다.
   *    400 은 **입력의 모양**이 틀렸을 때뿐이다(빈 이름 · 이상한 글자 · 음수 표본).
   * ⭐ 응답에 `exitCode` 를 **그대로** 싣는다 — 없으면 화면은 「위반이 없다」와 「안 봤다」를
   *    구별할 수 없고, 그 구별이 이 콘솔의 존재 이유다.
   * ⛔ `--update` 는 넘기지 않는다. 화면에서 기준선이 갱신되면 관문이 도장이 된다.
   */
  app.get('/api/observations/:galaxy', (req: Request, res: Response) => {
    const galaxy = String(req.params['galaxy'] ?? '').normalize('NFC');
    const nameProblem = galaxyNameProblem(galaxy);
    if (nameProblem !== null) return fail(res, 400, nameProblem);
    /* 안 주면 0 이다 — 도구의 기본값과 같다. ⚠️ 0 이면 **표본이 하나도 안 온다**(처방 없음). */
    const rawSample = String(req.query['sample'] ?? '0');
    const problem = sampleProblem(rawSample);
    if (problem !== null) return fail(res, 400, problem);

    void observeGalaxy(galaxy, Number(rawSample)).then(
      (result) => res.json(result),
      /* 여기까지 오면 도구를 부르는 것조차 못 한 것이다 — 그것은 서버 잘못이라 5xx 다. */
      (e: unknown) => fail(res, 500, `관측 도구를 부르지 못했습니다: ${(e as Error).message}`),
    );
  });

  // ── 주행 결과 ────────────────────────────────────────────
  // Playwright 가 **밖에서** 돌고, 그 결과를 여기로 던진다. ⛔ 서버는 브라우저를 띄우지 않는다.
  // ⛔ 여기서 판정을 만들지 않는다 — 접는 것·세는 것·「끝났는가」는 `qa/src/run` 이 안다
  //    (자세한 이유는 run-result.ts 머리말). 서버는 **부르고 나른다.**

  /**
   * `POST /api/runs?from=playwright|contract`
   *
   * 본문은 **주행 결과 그 자체**다 — 계약 모양(`preconditions[]`·`cases[]`) 이거나
   * Playwright JSON 리포터(`suites[]`). 출처 표를 함께 주려면 봉투로 싼다:
   * `{ "report": <결과>, "origins": { "TC-201": { "origin": "policy" } } }`.
   *
   * ⛔ **결과에 4xx 를 쓰지 않는다.** 「전제가 안 섰다」(→ 케이스 전부 ⚪) ·
   *    「검증 분모가 0이다」(전부 구현에서 나온 TC) · 「본문이 깨졌다」는 전부 **결과**다.
   *    400 은 **질의 문자열의 모양**이 틀렸을 때뿐이다.
   * ⭐ 응답의 `exitCode` 를 **그대로** 싣는다 — 0(끝났다) · 1(판단하지 않은 fail) ·
   *    3(**못 쟀다**). 없으면 화면은 「다 봤는데 괜찮다」와 「안 봤다」를 구별할 수 없다.
   * ⛔ 도구의 JSON 은 **통째로** `report` 에 담는다. 칸을 골라 담으면 `stats`(분모)가 빠지고,
   *    「fail 3건」이 3/3 인지 3/300 인지 모르게 된다.
   */
  app.post(
    RUNS_PATH,
    express.text({ type: () => true, limit: '16mb' }),
    (req: Request, res: Response) => {
      const from = req.query['from'] === undefined ? undefined : String(req.query['from']);
      const problem = fromParamProblem(from);
      if (problem !== null) return fail(res, 400, problem);
      /* 본문이 아예 안 왔다 — 이건 **요청의 모양**이라 400 이다(결과가 아니다). */
      const raw = typeof req.body === 'string' ? req.body : '';
      if (raw.trim() === '') return fail(res, 400, '주행 결과 본문이 비어 있습니다.');

      const unwrapped = unwrapEnvelope(raw);
      void receiveRunResult(unwrapped.raw, { from, origins: unwrapped.origins }).then(
        (receipt) => {
          /**
           * ⭐ **남긴다.** 안 남기면 판정을 적을 자리가 없고, 그러면 「판단하지 않은 fail」은
           *    영영 0이 안 된다 — 종료 조건이 있는데 그 조건에 닿을 길이 없는 상태가 된다.
           * ⛔ 저장에 실패해도 **잰 결과를 삼키지 않는다.** 그것은 별개의 일이라
           *    `notes` 에 적고 결과는 그대로 보낸다.
           */
          try {
            const meta = saveRun(unwrapped.raw, receipt, { from });
            res.json({ ...receipt, id: meta.id, run: { ...meta, remeasured: false } });
          } catch (e) {
            res.json({
              ...receipt,
              id: null,
              run: null,
              notes: [
                ...receipt.notes,
                `⚠️ 주행을 남기지 못했다 — 판정을 적을 자리가 없다: ${(e as Error).message}`,
              ],
            });
          }
        },
        /* 여기까지 오면 도구를 부르는 것조차 못 한 것이다 — 그것은 서버 잘못이라 5xx 다. */
        (e: unknown) => fail(res, 500, `주행 결과 도구를 부르지 못했습니다: ${(e as Error).message}`),
      );
    },
  );

  /**
   * `GET /api/runs` — 남아 있는 주행 목록.
   * ⛔ 여기에 「끝났다/안 끝났다」는 없다. 그 답은 주행을 **열어서 다시 재야** 나온다.
   */
  app.get(RUNS_PATH, (_req: Request, res: Response) => {
    try {
      res.json(listRuns());
    } catch (e) {
      fail(res, 500, `주행 목록을 읽지 못했습니다: ${(e as Error).message}`);
    }
  });

  /**
   * `GET /api/runs/:id` — **판정이 붙은 채로** 다시 잰 주행.
   *
   * ⭐ 서버가 「판단하지 않은 fail 이 하나 줄었다」를 계산하지 않는다 — 저장해 둔 케이스에
   *    판정을 붙여 **도구를 다시 부르고**, 그 답을 그대로 나른다. 그래야 화면의 수와
   *    관문의 수가 갈리지 않는다.
   * ⛔ 「그 주행의 전제가 안 섰다」는 여전히 **결과**(⚪)라 4xx 가 아니다. 404 는
   *    **그런 주행이 없을 때**뿐이다.
   */
  app.get(`${RUNS_PATH}/:id`, (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const problem = runIdProblem(id);
    if (problem !== null) return fail(res, 400, problem);
    void readRun(id).then(
      (run) => (run === null ? fail(res, 404, '그런 주행이 없습니다.') : res.json(run)),
      (e: unknown) => fail(res, 500, `주행을 읽지 못했습니다: ${(e as Error).message}`),
    );
  });

  /**
   * `POST /api/runs/:id/verdict` — **사람이 내린 판정을 적는다.**
   *
   * 본문: `{ "caseId": "TC-102", "verdict": { "kind": "fixed", "why": "..." } }`
   *       `{ "caseId": "TC-102", "verdict": null }` ← **지운다**(장부에는 남는다)
   *
   * ⛔ **판정이 판단인지 여기서 보지 않는다.** 「사유가 30자 미만이면 판단이 아니다」는
   *    `qa/src/run/contract.ts` 가 아는 일이고, 서버가 그 규칙을 복사하면 두 자리가 갈린다.
   *    ⇒ 짧은 사유도 **저장되고**(사람이 쓰던 중일 수 있다), 답으로 돌아오는 수는
   *    도구를 다시 불러 받은 것이다 — 「판단하지 않은 fail」에 그대로 남아 있다.
   * ⛔ **일괄 갈래가 없다.** caseId 는 하나다. 목록을 보내면 400 이다.
   * ⛔ **화면이 보낸 「누가」를 믿지 않는다.** 서명은 서버가 아는 것(프로세스 사용자·시계)으로
   *    적고, 화면이 보낸 이름은 `untrustedClientClaim` 에 증거로만 남는다.
   * ⚠️ 404 는 **없는 것을 가리켰을 때**다 — 없는 주행 · 그 주행에 없는 케이스.
   *    없는 케이스에 판정을 달면 **조용히 만들지 않고 거절한다**(만들면 분모 밖에서
   *    「판정했다」만 남는다).
   */
  app.post(`${RUNS_PATH}/:id/verdict`, (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const idProblem = runIdProblem(id);
    if (idProblem !== null) return fail(res, 400, idProblem);

    const body: unknown = req.body;
    const parsed = verdictInputProblem(body);
    if ('problem' in parsed) return fail(res, 400, parsed.problem);

    /* 화면이 스스로 밝힌 「누가」 — 받아만 두고 서명으로 쓰지 않는다. */
    const claim = isRecord(body) ? body['by'] : undefined;

    void recordVerdict(id, parsed.caseId, parsed.verdict, claim).then(
      (result) => {
        if (result.ok) return res.json(result.run);
        if (result.kind === 'no-such-run') return fail(res, 404, '그런 주행이 없습니다.');
        if (result.kind === 'no-such-case') {
          return res.status(404).json({ error: result.why, knownIds: result.knownIds });
        }
        /* 판정을 붙일 칸 자체가 없다 — 요청이 잘못된 게 아니라 **그 주행의 상태**다. */
        return res.status(409).json({ error: result.why });
      },
      (e: unknown) => fail(res, 500, `판정을 적지 못했습니다: ${(e as Error).message}`),
    );
  });

  return app;
};
