/**
 * 깃 로그인 — **화면이 밟을 수 있는 자리.**
 *
 * ⛔⛔ **서버가 `gh` 를 직접 부르지 않는다.** `clone.ts` 가 적어 둔 그 규율 그대로다:
 *    토큰 방어(‘`gh auth token` 을 안 부른다’ · ‘토큰처럼 생긴 것을 지운다’)가 도구 안에 있고,
 *    서버가 `gh` 를 따로 부르면 **그 방어가 자리마다 갈린다.** ⇒ 여기는 `bin/gh-auth.mjs` 를
 *    부르고 그 JSON 을 나를 뿐이다.
 *
 * ## ⚠️ 로그인은 **오래 걸린다** — 그래서 상태를 들고 있는다
 *
 * 기기 흐름은 「코드를 낸다 → 사람이 브라우저에서 끝낸다 → 도구가 끝난다」의 셋이고,
 * 가운데가 몇 분이다. HTTP 한 번으로 못 담으므로 **서버가 진행 중인 시도 하나를 들고 있다.**
 *
 * ⛔ **동시에 둘을 안 띄운다.** 두 개가 돌면 코드가 둘 생기고, 사람은 어느 것이 자기 것인지
 *    모른 채 하나를 넣는다 — 그러면 「안 끝났다」가 나오는데 이유를 아무도 모른다.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { HARNESS_ROOT } from './paths.js';

export interface IGhStatus {
  installed: boolean;
  loggedIn: boolean;
  account: string | null;
  protocol: string | null;
  scopes: string[];
  say: string;
}

/** 진행 중인 로그인 하나. ⛔ 「idle」 과 「waiting」 을 같은 말로 쓰지 않는다. */
export type GhLoginState =
  | { stage: 'idle' }
  | { stage: 'waiting'; code: string; url: string; before: string | null }
  | { stage: 'done'; before: string | null; after: string | null; switched: boolean; say: string }
  | { stage: 'failed'; why: string; say: string };

let current: GhLoginState = { stage: 'idle' };
let child: ChildProcess | null = null;

const TOOL = (): string => join(HARNESS_ROOT, 'bin', 'gh-auth.mjs');

/** 도구가 뱉은 **JSON 줄만** 골라 읽는다. ⛔ 사람용 줄을 파싱하려 들지 않는다. */
const lastJsonLine = (text: string): Record<string, unknown> | null => {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{') && l.endsWith('}'));
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i] ?? '') as Record<string, unknown>;
    } catch {
      /* 다음 줄을 본다 — ⛔ 여기서 「JSON 이 아니다」를 실패로 만들지 않는다. */
    }
  }
  return null;
};

export const ghStatus = (): Promise<IGhStatus> =>
  new Promise((done) => {
    const p = spawn(process.execPath, [TOOL(), 'status', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += String(d); });
    const fallback: IGhStatus = {
      installed: false, loggedIn: false, account: null, protocol: null, scopes: [],
      say: '⚪ 못 쟀다 — 상태를 읽지 못했다.',
    };
    p.on('error', () => done(fallback));
    p.on('close', () => {
      const parsed = lastJsonLine(out);
      /* ⛔ 종료코드로 판정하지 않는다 — 3(못 쟀다)에도 **읽어야 할 모양이 들어 있다.** */
      done(parsed === null ? fallback : ({ ...fallback, ...parsed } as IGhStatus));
    });
  });

export interface IGhOrgs {
  ok: boolean;
  orgs: string[];
  account: string | null;
  scopes: string[];
  say: string;
}

/**
 * 이 계정이 속한 조직. ⚠️ **네트워크를 탄다** — `status` 와 갈라 둔 이유가 그것이다.
 * ⛔ 실패를 빈 목록으로 접지 않는다: 「조직이 없다」와 「못 물어봤다」는 다른 말이다(§8).
 */
export const ghOrgs = (): Promise<IGhOrgs> =>
  new Promise((done) => {
    const p = spawn(process.execPath, [TOOL(), 'orgs', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += String(d); });
    const fallback: IGhOrgs = { ok: false, orgs: [], account: null, scopes: [], say: '⚪ 못 쟀다 — 도구를 부르지 못했다.' };
    p.on('error', () => done(fallback));
    p.on('close', () => {
      const parsed = lastJsonLine(out);
      done(parsed === null ? fallback : ({ ...fallback, ...parsed } as IGhOrgs));
    });
  });

export const ghLoginState = (): GhLoginState => current;

/** ⛔ 이미 돌고 있으면 **새로 안 띄운다** — 코드가 둘 생기는 것을 막는다. */
export const ghLoginBusy = (): boolean => current.stage === 'waiting';

/**
 * 기기 흐름을 시작한다. **코드가 나올 때까지만** 기다렸다가 돌려주고,
 * 나머지(사람이 브라우저에서 끝내는 것)는 **배경에서** 계속 돈다.
 */
export const ghLoginStart = (): Promise<GhLoginState> =>
  new Promise((done) => {
    current = { stage: 'idle' };
    const p = spawn(process.execPath, [TOOL(), 'login', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child = p;
    let out = '';
    let answered = false;
    const answer = (state: GhLoginState): void => {
      current = state;
      if (answered) return;
      answered = true;
      done(state);
    };
    p.stdout.on('data', (d) => {
      out += String(d);
      const parsed = lastJsonLine(out);
      if (parsed === null) return;
      const stage = parsed['stage'];
      if (stage === 'waiting') {
        answer({
          stage: 'waiting',
          code: String(parsed['code'] ?? ''),
          url: String(parsed['url'] ?? 'https://github.com/login/device'),
          before: (parsed['before'] as string | null) ?? null,
        });
      } else if (stage === 'done') {
        current = {
          stage: 'done',
          before: (parsed['before'] as string | null) ?? null,
          after: (parsed['after'] as string | null) ?? null,
          switched: parsed['switched'] === true,
          say: String(parsed['say'] ?? ''),
        };
      } else if (stage === 'failed') {
        current = { stage: 'failed', why: String(parsed['why'] ?? ''), say: String(parsed['say'] ?? '') };
      }
    });
    p.on('error', (e) => {
      answer({ stage: 'failed', why: e.message, say: '⚪ 못 쟀다 — 도구를 띄우지 못했다.' });
    });
    p.on('close', () => {
      child = null;
      /* 코드도 못 내고 끝났다면 그 자체가 판정이다. */
      if (current.stage === 'waiting') {
        current = { stage: 'failed', why: out.slice(-500), say: '⚪ 못 쟀다 — 로그인이 끝나지 않았다.' };
      }
      answer(current);
    });
  });

/** 사람이 그만둔다. ⛔ 조용히 지우지 않는다 — 「그만뒀다」도 상태다. */
export const ghLoginCancel = (): void => {
  child?.kill('SIGTERM');
  child = null;
  current = { stage: 'failed', why: '사람이 그만뒀다.', say: '⚪ 못 쟀다 — 로그인을 그만뒀다.' };
};
