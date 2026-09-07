/**
 * REST — 화면이 부르는 것 전부. 상태를 바꾸는 것은 전부 명시적 POST/PUT 이다.
 *
 * ⚠️ **화면이 판정을 뒤집지 못하게 한다.** 어떤 라우트도 "확인 안 된 항목을 확인된 것으로"
 *    바꾸는 지름길을 주지 않는다. 사람이 항목마다 눌러야 `confirmed` 가 된다.
 */
import { createReadStream, existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

import express, { type Request, type Response } from 'express';

import { closeBrowser, openBrowser, scan, sessionState } from './collect.js';
import { domainExists, listDomains } from './domains.js';
import { listGalaxies } from './galaxies.js';
import { applyEmit, planEmit } from './emit.js';
import {
  draftIdProblem,
  inputProblem,
  makeGalaxyDraft,
  readGalaxyDraft,
} from './galaxy-draft.js';
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
import { detect } from './provenance.js';
import { dataDir, locate, workflowRoot } from './paths.js';
import {
  cannotMeasureBecause,
  galaxyName,
  measurePreconditions,
  stands,
  type IPrecondition,
} from './preconditions.js';
import {
  emptySurvey,
  progressOf,
  readSurvey,
  writeSurvey,
  type ISurvey,
  type ISurveyItem,
} from './survey.js';

const fail = (res: Response, code: number, message: string): void => {
  res.status(code).json({ error: message });
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 도메인 경로 파라미터를 한 자리에서 검증한다 — 경로 조작(`..`)도 여기서 막는다. */
const domainOf = (req: Request, res: Response): string | null => {
  const raw = String(req.params['domain'] ?? '').normalize('NFC');
  if (!/^[a-z0-9-]+$/.test(raw)) {
    fail(res, 400, `도메인 이름이 올바르지 않습니다: ${raw}`);
    return null;
  }
  if (!domainExists(raw)) {
    fail(res, 404, `지식 저장소에 그런 도메인이 없습니다: ${raw}`);
    return null;
  }
  return raw;
};

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
   * 지식 저장소를 찾았는지. **못 찾았으면 화면 맨 위에 그대로 띄운다** —
   * 도메인 0개를 "괜찮은 상태"로 보여주지 않는다.
   */
  app.get('/api/health', (_req: Request, res: Response) => {
    const found = locate();
    res.json({
      ok: found.ok,
      workflowRoot: workflowRoot(),
      ...(found.ok ? {} : { tried: found.tried, hint: found.hint }),
      browser: sessionState(),
    });
  });

  app.get('/api/domains', (_req: Request, res: Response) => {
    const found = locate();
    if (!found.ok) {
      return fail(res, 503, `지식 저장소를 찾지 못했습니다: ${found.tried}\n${found.hint}`);
    }
    res.json({ domains: listDomains() });
  });

  app.get('/api/domains/:domain/survey', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const survey = readSurvey(domain);
    res.json({ survey, progress: progressOf(survey) });
  });

  app.put('/api/domains/:domain/survey', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const body = req.body as Partial<ISurvey>;
    const current = readSurvey(domain);

    /**
     * 판정이 **바뀐 항목에만** 주체·시각을 찍는다. 안 바뀐 항목의 기록은 보존한다 —
     * 저장을 누를 때마다 갱신되면 "언제 판정했나"가 "마지막으로 저장한 때"가 되어 버린다.
     *
     * ⚠️ 값은 **서버가 정한다.** 화면이 보낸 `decidedBy`·`decidedAt` 은 버린다.
     */
    const stamp = (incoming: ISurveyItem[]): ISurveyItem[] => {
      const before = new Map(current.items.map((i) => [i.id, i]));
      const who = userInfo().username;
      const when = new Date().toISOString();
      return incoming.map((item) => {
        const prev = before.get(item.id);
        const { decidedBy: _b, decidedAt: _a, ...clean } = item;
        if (clean.status === 'unmeasured') return clean; // 판정을 되돌린 것이다 — 기록도 지운다
        if (prev && prev.status === clean.status && prev.decidedAt !== undefined) {
          return { ...clean, decidedBy: prev.decidedBy, decidedAt: prev.decidedAt };
        }
        return { ...clean, decidedBy: who, decidedAt: when };
      });
    };

    const next: ISurvey = {
      ...current,
      entry: { ...current.entry, ...(body.entry ?? {}) },
      items: Array.isArray(body.items) ? stamp(body.items) : current.items,
      ...(body.collectedAt !== undefined ? { collectedAt: body.collectedAt } : {}),
    };
    const saved = writeSurvey({ ...next, domain });
    res.json({ survey: saved, progress: progressOf(saved) });
  });

  app.post('/api/domains/:domain/survey/reset', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const saved = writeSurvey(emptySurvey(domain));
    res.json({ survey: saved, progress: progressOf(saved) });
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

  /**
   * 도메인까지 정해졌을 때 — 여기서만 `session-alive` 를 **실제로 새로고침해서** 잰다.
   *
   * ⭐ `requiresSession: true` 는 **이 주행의 선언**이다(좌표와 OR). 화면을 걷는 주행은
   *    좌표가 세션을 안 적었어도 **살아 있는 세션이 있어야 잰다** — 짐작이 아니라 선언이다.
   */
  app.get('/api/domains/:domain/preconditions', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const survey = readSurvey(domain);
    void measurePreconditions({
      domain,
      loginUrl: survey.entry.loginUrl,
      galaxy: galaxyName(),
      requiresSession: true,
    }).then((preconditions: IPrecondition[]) => {
      res.json({
        preconditions,
        measurable: stands(preconditions),
        unmeasured: cannotMeasureBecause(preconditions),
      });
    });
  });

  // ── 브라우저 ──────────────────────────────────────────────
  // 사람이 직접 로그인한다. 서버는 창을 띄우고, 사람이 누르면 그 화면을 걷는다.

  app.get('/api/browser', (_req: Request, res: Response) => {
    res.json(sessionState());
  });

  app.post('/api/domains/:domain/browser/open', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const survey = readSurvey(domain);
    const target = survey.entry.loginUrl.trim() || survey.entry.baseUrl.trim();
    if (target === '') {
      return fail(res, 400, '먼저 로그인 URL 또는 테스트 환경 주소를 입력하세요.');
    }
    void openBrowser(domain, {
      loginUrl: target,
      accountId: survey.entry.accountId,
      accountPw: survey.entry.accountPw,
      allowInsecureTls: survey.entry.allowInsecureTls === true,
    }).then(
      (r) => res.json({ ok: true, url: r.url }),
      (e: unknown) => fail(res, 500, `브라우저를 열지 못했습니다: ${(e as Error).message}`),
    );
  });

  app.post('/api/browser/close', (_req: Request, res: Response) => {
    void closeBrowser().then(() => res.json({ ok: true }));
  });

  /**
   * 지금 열린 화면을 걷는다. 결과는 **전부 미확인**으로 돌아온다.
   * 기존 항목과 라벨+URL 이 같으면 **사람 판정을 보존**한다 — 다시 스캔했다고 확인이 풀리면
   * 사람이 한 일이 조용히 사라진다.
   */
  app.post('/api/domains/:domain/scan', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const before = readSurvey(domain);
    /**
     * ⭐⭐ **전제를 먼저 잰다.** 걷고 나서 실패 메시지를 보고 「환경 탓인가」를 맞히지 않는다.
     *    세션은 여기서 **새로고침**해서 재므로, 오래 도는 루프 중간에 세션이 죽어도
     *    그 다음 주행이 ❌ 가 아니라 ⚪ 로 갈린다.
     */
    void measurePreconditions({
      domain,
      loginUrl: before.entry.loginUrl,
      galaxy: galaxyName(),
      /* ⭐ **이 주행은 세션을 요구한다** — 걷는 화면이 로그인 뒤에 있기 때문이다.
         좌표가 안 적었어도 여기서 선언한다. 그래야 브라우저가 없을 때 400(❌ 처럼 보임)이
         아니라 ⚪ 로 갈린다. */
      requiresSession: true,
    }).then((preconditions: IPrecondition[]) => {
      if (!stands(preconditions)) {
        /**
         * ⛔ **아무것도 쓰지 않는다.** 항목도 안 붙이고 `collectedAt` 도 안 찍는다 —
         *    못 잰 주행이 실측일을 남기면 문서에 「그날 열어서 확인했다」는 거짓이 박힌다.
         * ⛔ `cases` 는 `[]` 가 **아니라 `null`** 이다. 빈 목록은 「0건을 쟀다」로 읽힌다.
         */
        res.json({
          preconditions,
          measurable: false,
          cases: null,
          unmeasured: cannotMeasureBecause(preconditions),
          survey: before,
          progress: progressOf(before),
          scanned: null,
        });
        return;
      }
      runScan(domain, preconditions, res);
    });
  });

  /** 전제가 선 뒤에만 부른다 — 실제로 화면을 걷는 자리. */
  const runScan = (domain: string, preconditions: IPrecondition[], res: Response): void => {
    void scan(domain).then(
      (result) => {
        const current = readSurvey(domain);
        const keyOf = (label: string, url: string): string => `${label}|${url}`;
        const known = new Map(current.items.map((i) => [keyOf(i.label, i.url), i]));
        const merged = [...current.items];
        let added = 0;
        for (const found of result.items) {
          const hit = known.get(keyOf(found.label, found.url));
          if (hit) continue; // 이미 있는 항목 — 사람 판정을 건드리지 않는다
          merged.push(found);
          added += 1;
        }
        /**
         * ⭐ **못 쟀으면 실측일을 찍지 않는다.**
         * `collectedAt` 은 생성되는 지식 문서의 **실측일**이 된다. 404 를 걷어 놓고
         * 날짜를 찍으면 "그날 제품을 열어 확인했다"는 거짓말이 문서에 박힌다.
         */
        const measured = result.unmeasured === null;
        const saved = writeSurvey({
          ...current,
          items: merged,
          ...(measured ? { collectedAt: new Date().toISOString() } : {}),
        });
        /* ⭐ `preconditions` 를 `cases` **보다 먼저** 싣는다 — 숫자보다 「믿어도 되는가」가 먼저다. */
        res.json({
          preconditions,
          measurable: true,
          cases: result.items,
          unmeasured: result.unmeasured,
          survey: saved,
          progress: progressOf(saved),
          scanned: {
            url: result.url,
            title: result.title,
            shot: result.shot,
            found: result.items.length,
            added,
            reach: result.reach,
            unmeasured: result.unmeasured,
          },
        });
      },
      (e: unknown) => fail(res, 400, (e as Error).message),
    );
  };

  app.get('/api/domains/:domain/shots/:file', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const file = String(req.params['file'] ?? '');
    if (!/^scan-\d+\.png$/.test(file)) return fail(res, 400, '파일 이름이 올바르지 않습니다.');
    const abs = join(dataDir(), 'shots', domain, file);
    if (!existsSync(abs)) return fail(res, 404, '스크린샷이 없습니다.');
    res.type('png');
    createReadStream(abs).pipe(res);
  });

  /**
   * 「수집 대상 빌드」를 **서버에서 확인**한다. 사람 기억에 기대지 않는다.
   * 못 알아내면 `detected: false` 와 **이유**를 준다 — 모르는 것을 아는 척하지 않는다.
   */
  app.get('/api/domains/:domain/provenance', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const survey = readSurvey(domain);
    const target = survey.entry.baseUrl.trim() || survey.entry.loginUrl.trim();
    if (target === '') return fail(res, 400, '먼저 테스트 환경 주소를 입력하세요.');
    res.json(detect(target));
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
   * 만들어 둔 초안을 다시 본다 — **후보·읽어낸 명령·못 읽은 자리**를 그대로 준다.
   * ⛔ 태양계는 여기서도 **고르지 않는다.** 후보만 준다(관측 법칙 §9).
   */
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

  // ── 지식 생성 ────────────────────────────────────────────

  /** 미리보기 — 무엇을 쓸지 **먼저 보여준다.** 여기서는 아무것도 안 쓴다. */
  app.get('/api/domains/:domain/emit/preview', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const survey = readSurvey(domain);
    const title = String(req.query['title'] ?? domain);
    try {
      res.json({ files: planEmit(survey, title), progress: progressOf(survey) });
    } catch (e) {
      fail(res, 400, (e as Error).message);
    }
  });

  app.post('/api/domains/:domain/emit', (req: Request, res: Response) => {
    const domain = domainOf(req, res);
    if (domain === null) return;
    const survey = readSurvey(domain);
    const body = req.body as { title?: string; overwrite?: string[] };
    try {
      const files = planEmit(survey, body.title ?? domain);
      const result = applyEmit(files, Array.isArray(body.overwrite) ? body.overwrite : []);
      res.json(result);
    } catch (e) {
      fail(res, 400, (e as Error).message);
    }
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
