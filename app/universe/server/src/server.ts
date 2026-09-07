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
import { applyEmit, planEmit } from './emit.js';
import { detect } from './provenance.js';
import { dataDir, locate, workflowRoot } from './paths.js';
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
  app.use(express.json({ limit: '4mb' }));

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
        res.json({
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
  });

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

  return app;
};
