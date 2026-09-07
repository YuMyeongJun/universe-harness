/**
 * 업로드 전 비밀정보 가드 — **원격에 올리기 전에** 막는다.
 *
 * TC 본문과 실행 이력에는 계정·URL·토큰이 섞여 들어갈 여지가 있다.
 * 한 번 올라가면 트리에서 지워도 **이슈 편집 이력과 알림 메일에 남는다.**
 * 그래서 처음부터 안 올리는 것이 유일한 답이고, 그 자리가 여기다.
 *
 * ⛔ **회사 이름·서비스 이름을 열거해 막지 않는다.** 목록 방식은 다음 이름을 못 막는다.
 *    **구조로** 잰다 — 토큰의 형태, 라벨 뒤에 값이 붙은 형태처럼.
 *
 * ⚠️ 이 가드는 **완전하지 않다.** 형태가 없는 비밀(평문 계정명, 사내 전용 용어)은 못 잡는다.
 *    못 잡는다고 여기 적어 두는 것이 지금 할 수 있는 최선이다.
 */

export interface ISecretHit {
  kind: string;
  /** 원문을 그대로 담지 않는다 — 가려서 보여준다 */
  redacted: string;
  line: number;
}

interface IPattern {
  kind: string;
  re: RegExp;
}

/**
 * 값이 붙어 있어야 잡는다.
 *
 * `비밀번호 입력 필드 확인` 같은 **필드 이름 언급은 정상 TC 문장**이다.
 * `비밀번호: hunter2` 처럼 **라벨 + 구분자 + 값**일 때만 잡는다.
 */
const CREDENTIAL_LABEL = /(비밀번호|패스워드|password|passwd|pw|secret|token|api[_-]?key)\s*[:=]\s*\S{4,}/i;

const PATTERNS: IPattern[] = [
  { kind: 'github-token', re: /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { kind: 'aws-access-key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { kind: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: 'openai-style-key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { kind: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { kind: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: 'authorization-header', re: /\bAuthorization\s*:\s*(Bearer|Basic)\s+\S{8,}/i },
  { kind: 'url-with-credentials', re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i },
  { kind: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { kind: 'credential-label', re: CREDENTIAL_LABEL },
];

/** 앞뒤 몇 글자만 남기고 가린다. 로그에 원문을 다시 흘리지 않기 위해서다. */
const redact = (value: string): string =>
  value.length <= 8 ? '*'.repeat(value.length) : `${value.slice(0, 4)}…${'*'.repeat(6)}…${value.slice(-2)}`;

export const findSecrets = (text: string): ISecretHit[] => {
  const hits: ISecretHit[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const { kind, re } of PATTERNS) {
      const match = re.exec(line);
      if (match) hits.push({ kind, redacted: redact(match[0]), line: index + 1 });
    }
  });
  return hits;
};

/**
 * 원격에 올리기 **직전**에 부른다. 걸리면 **실패**다 — ⚪ 가 아니다.
 *
 * 판정 기준은 되돌릴 수 있는가다. 올린 뒤에는 되돌릴 수 없으므로 멈춘다.
 */
export const assertNoSecrets = (label: string, text: string): void => {
  const hits = findSecrets(text);
  if (hits.length === 0) return;
  const lines = hits.map((h) => `  ${h.line}행 [${h.kind}] ${h.redacted}`).join('\n');
  throw new Error(
    `[secrets] ${label}: 원격에 올리기 전에 막았다 — ${hits.length}건.\n${lines}\n` +
      '  한 번 올라가면 이슈 편집 이력과 알림 메일에 남는다. 트리에서 지워도 되돌아오지 않는다.\n' +
      '  ⚠️ 이 가드는 완전하지 않다 — 형태가 없는 비밀(평문 계정명 등)은 못 잡는다.',
  );
};
