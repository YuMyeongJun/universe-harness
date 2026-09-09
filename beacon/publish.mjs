#!/usr/bin/env node
/**
 * 전파 — 발행. 렌더 결과를 Confluence 페이지로 **update** 한다.
 *
 *   node beacon/publish.mjs [--dry-run] [--only <slug>]
 *
 * ## 왜 헤드리스인가
 * 발행을 대화형 MCP 로 하면 **사람이 있어야만 우주가 전파된다.** 커밋 훅·cron 에 걸 수 없고,
 * 그래서 라운드 평가에서 자동화 완결성이 C 였다. 이 스크립트가 그 C 를 없애는 것이다.
 *
 * ## 방향은 한쪽이다
 * 저장소가 정본, 위키는 뷰다(보존 법칙). 여기서는 **쓰기만** 한다 — 위키에서 읽어 오지 않는다.
 *
 * ⛔ **create 하지 않는다.** `beacon/pages.json` 에 id 가 있는 페이지만 update 한다.
 *    create 를 섞으면 발행할 때마다 중복 페이지가 쌓이고, 그 순간 정본이 둘이 된다.
 * ⛔ 이 스크립트는 **`beacon/out/` 을 만들지 않는다.** 렌더가 먼저다 —
 *    낡은 산출을 발행하는 것이 안 하느니만 못하다(관측 법칙).
 * ⚠️ Confluence Cloud REST **v2** 는 본문을 `storage`(XHTML) 로만 받는다. 마크다운을 그대로
 *    올리면 원문이 그대로 보인다. 그래서 아래에 최소 변환기를 직접 들고 있다(외부 의존 없음).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'beacon/out/pages');
const pagesFile = path.join(root, 'beacon/pages.json');
const secretFile = path.join(root, '.secret/confluence.json');

const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const exists = (p) => fs.stat(p).then(() => true).catch(() => false);
const die = (msg) => { console.error(msg); process.exit(1); };

/* ── 인자 ─────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const known = ['--dry-run', '--only', '--help', '-h'];
const has = (n) => argv.includes(n);
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);

const usage = [
  '사용법: node beacon/publish.mjs [--dry-run] [--only <slug>]',
  '',
  '  --dry-run     무엇이 올라갈지만 본다. 네트워크를 쓰지 않고 자격증명도 필요 없다.',
  '  --only <slug> 그 페이지 한 장만 발행한다 (index·laws·forces·observatory·galaxies·nebula·rounds)',
  '',
  '  먼저 node beacon/render.mjs 로 beacon/out/ 을 채워야 한다.',
].join('\n');

if (has('--help') || has('-h')) {
  console.log(usage);
  process.exit(0);
}

// ⚠️ 오타난 플래그를 조용히 무시하면 `--dry-run` 을 `--dryrun` 으로 쳤을 때 **진짜로 발행된다.**
const unknown = argv.filter((a, i) => a.startsWith('--') && !known.includes(a) && argv[i - 1] !== '--only');
if (unknown.length > 0) {
  /* ⚠️ 문구를 「모르는 플래그」로 맞춘다 — §7 갈래는 **사유 문자열**로 판정하는데(종료코드만
     보면 다른 이유로 죽어도 통과다), 여기만 「옵션」이라 거부하고도 삼킨 것으로 보였다(R91). */
  die(`⛔ universe publish: 모르는 플래그 ${unknown.join(' ')}\n\n${usage}`);
}

const dryRun = has('--dry-run');
const only = flag('--only');
if (has('--only') && (!only || only.startsWith('--'))) {
  die(`--only 에 슬러그가 없다.\n\n${usage}`);
}

/* ── markdown → Confluence storage ────────────────────────── */
/**
 * 최소 변환기. **지원 범위를 넘는 것은 조용히 통과시키지 않고 원문 그대로 둔다** —
 * 위키에서 이상하게 보이는 편이, 없어진 줄 모르는 것보다 낫다.
 *
 * 지원: 제목(h1–h6) · 문단 · 굵게 · 인라인 코드 · 링크 · 인용 · 순서/비순서 목록(중첩) ·
 *       표(헤더+본문) · 펜스 코드블록(code 매크로) · 수평선
 * 미지원: 기울임 · 취소선 · 이미지 · 각주 · 표 정렬 · HTML 인라인 (§README)
 */

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Confluence code 매크로가 아는 언어만 넘긴다. 모르는 이름을 넘기면 매크로가 깨진 채 뜬다. */
const LANGS = {
  bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash',
  js: 'javascript', javascript: 'javascript', mjs: 'javascript',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  html: 'xml', xml: 'xml', sql: 'sql', python: 'python', py: 'python',
  java: 'java', go: 'go', diff: 'diff', css: 'css',
  text: 'none', txt: 'none', none: 'none', plain: 'none',
};

/**
 * 인라인 변환. **백틱을 가장 먼저 떼어 낸다** — 안 그러면 `` `**\/*.tsx` `` 같은 글롭의
 * 별표를 굵게 문법으로 먹는다. (법칙 표의 `applies_to` 칸이 실제로 그렇게 생겼다.)
 */
const inline = (text) => {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0001${codes.length - 1}\u0001`;
  });
  s = escapeXml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href.replace(/"/g, '&quot;')}">${t}</a>`);
  // ⚠️ 굵게: 여는 별표 뒤에 공백·별표·슬래시가 오면 강조가 아니다. 이 가드가 없으면
  //    백틱 밖의 글롭 `["**\/*.tsx", "**\/*.ts"]` 이 통째로 <strong> 이 된다 — 실제로 그렇게 깨졌다.
  //    (법칙 표의 applies_to 칸이 그 모양이다. 마크다운 규격대로 파싱해도 똑같이 깨지므로 여기서 막는다.)
  s = s.replace(/\*\*(?![\s*/])((?:[^*\n]|\*(?!\*))+?)(?<![\s*])\*\*(?!\/)/g, '<strong>$1</strong>');
  // 기울임은 `_..._` 만 본다. `*...*` 는 글롭과 구분이 안 서서 지원하지 않는다(README §변환기).
  s = s.replace(/(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, '<em>$1</em>');
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => `<code>${escapeXml(codes[Number(i)])}</code>`);
};

/** 표의 칸 나누기. 백틱 안의 `|`(예: `lint | tail`)를 칸 경계로 세면 표가 어긋난다. */
const splitRow = (line) => {
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      cur += '|';
      i += 1;
      continue;
    }
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  if (cells.length > 0 && cells[0].trim() === '') {
    cells.shift();
  }
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') {
    cells.pop();
  }
  return cells.map((c) => c.trim());
};

const isFence = (l) => /^\s*```/.test(l);
const isHr = (l) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
const isHeading = (l) => /^#{1,6}\s+/.test(l);
const isQuote = (l) => /^\s*>/.test(l);
const isTableSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');
const isTable = (l, next) => /^\s*\|/.test(l) && next !== undefined && isTableSep(next);
const listMarker = (l) => /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
const startsBlock = (l, next) => isFence(l) || isHr(l) || isHeading(l) || isQuote(l) || isTable(l, next) || listMarker(l) !== null;

const codeMacro = (lang, body) => {
  // ⚠️ CDATA 안에 `]]>` 가 있으면 블록이 거기서 끊긴다 — 쪼개서 이어 붙인다.
  const safe = body.replace(/\]\]>/g, ']]]]><![CDATA[>');
  const mapped = LANGS[(lang ?? '').toLowerCase()];
  const param = mapped ? `<ac:parameter ac:name="language">${mapped}</ac:parameter>` : '';
  return `<ac:structured-macro ac:name="code" ac:schema-version="1">${param}<ac:plain-text-body><![CDATA[${safe}]]></ac:plain-text-body></ac:structured-macro>`;
};

const mdToStorage = (md) => {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (isFence(line)) {
      const lang = line.trim().replace(/^```+/, '').trim();
      const body = [];
      i += 1;
      while (i < lines.length && !isFence(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // 닫는 펜스
      out.push(codeMacro(lang, body.join('\n')));
      continue;
    }

    if (isHr(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (isQuote(line)) {
      const body = [];
      while (i < lines.length && isQuote(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      // 인용 안에도 문단·목록이 올 수 있으므로 재귀한다.
      out.push(`<blockquote>${mdToStorage(body.join('\n'))}</blockquote>`);
      continue;
    }

    if (isTable(line, next)) {
      const head = splitRow(line);
      i += 2; // 헤더 + 구분선
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
      const tb = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
      out.push(`<table><tbody><tr>${th}</tr>${tb}</tbody></table>`);
      continue;
    }

    const first = listMarker(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length) {
        const m = listMarker(lines[i]);
        if (!m || /\d/.test(m[2]) !== ordered) {
          break;
        }
        const indent = m[1].length + m[2].length + 1;
        const chunk = [m[3]];
        i += 1;
        // 이어지는 줄: 들여쓴 줄(중첩 목록 포함)은 이 항목의 것이다.
        while (i < lines.length && lines[i].trim() !== '' && listMarker(lines[i]) === null && /^\s/.test(lines[i])) {
          chunk.push(lines[i].replace(new RegExp(`^\\s{0,${indent}}`), ''));
          i += 1;
        }
        while (i < lines.length && /^\s{2,}/.test(lines[i]) && listMarker(lines[i]) !== null) {
          chunk.push(lines[i].replace(new RegExp(`^\\s{0,${indent}}`), ''));
          i += 1;
        }
        // 빈 줄 뒤에 같은 종류의 항목이 이어지면 **같은 목록이다**(느슨한 목록).
        if (i < lines.length && lines[i].trim() === '') {
          const peek = lines.findIndex((l, k) => k > i && l.trim() !== '');
          const cont = peek === -1 ? null : listMarker(lines[peek]);
          if (cont && /\d/.test(cont[2]) === ordered && cont[1].length === first[1].length) {
            i = peek;
          }
        }
        const body = chunk.join('\n');
        const nested = chunk.slice(1).some((l, k) => startsBlock(l, chunk[k + 2]));
        items.push(`<li>${nested ? mdToStorage(body) : inline(body)}</li>`);
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i], lines[i + 1])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(para.join('\n'))}</p>`);
  }

  return out.join('\n');
};

/* ── 발행 대상 모으기 ─────────────────────────────────────── */

/* ⛔ **좌표는 저장소에 두지 않는다**(R151). 커밋된 `beacon/pages.json` 에는 장 이름표만 있고,
   사이트·스페이스·페이지 id 는 `.secret/confluence-pages.json`(gitignore) 에 둔다.
   ⚠️ 기본 전파 경로는 이제 **git 위키**다(`beacon/wiki.mjs`) — 거기엔 적을 좌표가 아예 없다. */
const localPages = await readJson(path.join(root, '.secret/confluence-pages.json')).catch(() => null);
const pagesJson = localPages ?? await readJson(pagesFile).catch(() => null);
if (!pagesJson) {
  die(`발행 좌표를 읽지 못했다: ${path.relative(root, pagesFile)}`);
}

const slugs = Object.keys(pagesJson.pages);
if (only && !slugs.includes(only)) {
  die(`없는 슬러그: ${only}\n발행 대상: ${slugs.join(' · ')}`);
}

/**
 * ⛔⛔ **좌표가 없어서 안 올라가는 장을 조용히 빼지 않는다** (실측 2026-09-08).
 *
 * 커밋된 이름표(`beacon/pages.json`)는 **11장**을 선언하는데 좌표 파일에는 **7장**이 있었다.
 * 그런데 화면은 「발행 대상 7장」이라고만 했다 — 나머지 넷(`guide*`)은 렌더까지 끝나고도
 * **아무 말 없이 안 올라갔다.** 위키를 보는 사람에게는 그 넷이 「아직 안 쓴 글」로 보이고,
 * 저장소에서는 「썼다」로 보인다. 정본과 뷰가 갈렸는데 **아무도 안 쟀다**(관측 법칙 §8).
 *
 * ⛔ 그렇다고 여기서 **create 하지 않는다** — 발행할 때마다 중복이 쌓이고 정본이 둘이 된다.
 *    사람이 위키에 한 번 만들고 그 id 를 `.secret/confluence-pages.json` 에 적어야 한다.
 * ⛔ 그 id 를 `beacon/pages.json`(커밋된다)에 적지 마라 — 좌표가 공개 저장소에 남는다(R151).
 */
const chartedElsewhere = localPages ? await readJson(pagesFile).catch(() => null) : null;
const uncharted = chartedElsewhere
  ? Object.keys(chartedElsewhere.pages ?? {}).filter((slug) => !slugs.includes(slug))
  : [];

// ⛔ 렌더가 먼저다. 낡은(혹은 없는) 산출을 발행하면 위키가 조용히 거짓이 된다(관측 법칙).
if (!(await exists(outDir))) {
  die([
    `렌더 산출이 없다: ${path.relative(root, outDir)}/`,
    '',
    '  먼저 이것을 돌려라 →  node beacon/render.mjs',
  ].join('\n'));
}

const targets = [];
const missing = [];
for (const slug of slugs) {
  if (only && slug !== only) {
    continue;
  }
  const file = path.join(outDir, `${slug}.md`);
  const md = await fs.readFile(file, 'utf8').catch(() => null);
  if (md === null) {
    missing.push(`${slug}.md`);
    continue;
  }
  targets.push({ slug, ...pagesJson.pages[slug], md, storage: mdToStorage(md) });
}

if (missing.length > 0) {
  die([
    `렌더 산출이 모자란다 — 없는 파일: ${missing.join(' ')}`,
    '',
    '  먼저 이것을 돌려라 →  node beacon/render.mjs',
  ].join('\n'));
}

/* ── dry-run — 네트워크도 자격증명도 쓰지 않는다 ──────────── */

const bytes = (s) => Buffer.byteLength(s, 'utf8');

/** ⚠️ 안 올라가는 장을 **이름을 불러** 말한다. 조용히 빼면 위키가 낡은 줄 아무도 모른다. */
const reportUncharted = () => {
  if (uncharted.length === 0) {
    return;
  }
  console.log(`  ⚠️ ${uncharted.length}장은 **좌표가 없어 안 올라간다**: ${uncharted.join(' · ')}`);
  console.log('     이름표는 `beacon/pages.json` 에 있는데 `.secret/confluence-pages.json` 에 페이지 id 가 없다.');
  console.log('     ⛔ 여기서 create 하지 않는다 — 중복 페이지가 쌓이면 그 순간 정본이 둘이 된다.');
  console.log('     ⇒ 위키에 한 번 만들고 그 id 를 `.secret/confluence-pages.json` 에 적어라(⛔ 커밋되는 쪽 말고).');
  console.log('');
};

if (dryRun) {
  console.log(`발행 대상 ${targets.length}장 — dry-run (네트워크를 쓰지 않는다)`);
  console.log(`  사이트 ${pagesJson.site} · 스페이스 ${pagesJson.spaceKey}`);
  console.log('');
  console.log(`  ${'슬러그'.padEnd(12)} ${'페이지 id'.padEnd(11)} ${'md'.padStart(8)} ${'storage'.padStart(8)}  제목`);
  for (const t of targets) {
    console.log(`  ${t.slug.padEnd(12)} ${String(t.id).padEnd(11)} ${`${bytes(t.md)}B`.padStart(8)} ${`${bytes(t.storage)}B`.padStart(8)}  ${t.title}`);
  }
  console.log('');
  reportUncharted();
  console.log('  update 만 한다 — create 는 하지 않는다. 실제 발행: --dry-run 을 떼라.');
  process.exit(0);
}

/* ── 자격증명 ─────────────────────────────────────────────── */

const guide = (headline) => [
  `${headline}: ${path.relative(root, secretFile)}`,
  '',
  '  1) cp .secret/confluence.json.tmp .secret/confluence.json',
  '  2) email 과 apiToken 을 채운다',
  '     토큰 발급 → https://id.atlassian.com/manage-profile/security/api-tokens',
  '',
  '  ⚠️ 이 파일은 .gitignore 로 막혀 있다. 커밋하지 마라.',
  '  발행 없이 무엇이 올라갈지만 보려면 →  node beacon/publish.mjs --dry-run',
].join('\n');

if (!(await exists(secretFile))) {
  die(guide('자격증명이 없다'));
}

const secret = await readJson(secretFile).catch((e) => {
  die(`자격증명 파일이 JSON 이 아니다: ${path.relative(root, secretFile)}\n  ${e.message}`);
});

// 템플릿을 그대로 복사만 하고 안 채운 경우를 잡는다 — 안 잡으면 401 을 원인 모른 채 본다.
const placeholder = !secret.email || !secret.email.includes('@') || secret.email === 'your@email'
  || !secret.apiToken || secret.apiToken.startsWith('http');
if (placeholder) {
  die(guide('자격증명이 채워지지 않았다 — email 과 apiToken 이 템플릿 그대로다'));
}

// ⚠️ Confluence Cloud 의 REST 는 `/wiki` 아래 있다. baseUrl 에서 빠뜨리면 전부 404 가 된다.
const rawBase = (secret.baseUrl ?? `https://${pagesJson.site}/wiki`).replace(/\/+$/, '');
const baseUrl = rawBase.endsWith('/wiki') ? rawBase : `${rawBase}/wiki`;
const auth = Buffer.from(`${secret.email}:${secret.apiToken}`, 'utf8').toString('base64');
const today = new Date().toISOString().slice(0, 10);

const api = async (method, urlPath, body) => {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → ${res.status} ${res.statusText}\n    ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
};

/* ── 발행 ─────────────────────────────────────────────────── */

/* ⚠️ 실제 발행에서도 **안 올라가는 장을 먼저 말한다.** dry-run 에서만 말하면
   그대로 미는 사람은 영영 못 본다 — 그게 조용히 빼는 것과 같다. */
reportUncharted();

console.log(`발행 ${targets.length}장 → ${baseUrl}`);
const failed = [];

for (const t of targets) {
  try {
    // 현재 버전을 먼저 읽는다. v2 의 update 는 낙관적 잠금이라 version.number+1 이 아니면 409 다.
    const current = await api('GET', `/api/v2/pages/${t.id}`);
    if (current.title !== t.title) {
      console.log(`  ⚠️ ${t.slug} — 위키 제목이 다르다: "${current.title}" → "${t.title}" 로 되돌린다 (정본은 저장소다)`);
    }
    const version = Number(current.version?.number ?? 0) + 1;
    await api('PUT', `/api/v2/pages/${t.id}`, {
      id: String(t.id),
      status: 'current',
      title: t.title,
      body: { representation: 'storage', value: t.storage },
      version: { number: version, message: `beacon/publish.mjs · ${today}` },
    });
    console.log(`  ✅ ${t.slug.padEnd(12)} v${version}  ${t.title}`);
  } catch (e) {
    failed.push(t.slug);
    console.error(`  ❌ ${t.slug.padEnd(12)} ${e.message}`);
  }
}

if (failed.length > 0) {
  console.error(`\n⛔ 실패 ${failed.length}장: ${failed.join(' ')}`);
  process.exit(1);
}
console.log('\n✅ 전파 완료. 저장소가 정본이다 — 위키를 고치지 말고 저장소를 고쳐라.');
