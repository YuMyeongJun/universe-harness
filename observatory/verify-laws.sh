#!/usr/bin/env bash
# 우주가 자기 법칙을 지키는지 검사한다.
#
# ⛔ 이 스크립트가 없으면 법칙은 장식이다(laws/README.md).
#    법칙 문서를 바꾸면 여기 검사도 같이 바꾼다 — 정본은 법칙, 스크립트는 집행자.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
fail=0

# ⛔ 실측(R91): 이 진입점은 bash 라 JS 집행자(lib/flags.mjs)를 못 쓴다 — 그래서 **모르는
#    플래그를 조용히 삼키고 초록불을 냈다.** §7 은 언어가 아니라 자리마다 걸어야 한다.
for arg in "$@"; do
  case "$arg" in
    --universe) ;;
    --*) printf '⛔ universe laws: 모르는 플래그 %s\n' "$arg" >&2
         printf '   아는 플래그는 이것뿐이다: --universe\n' >&2
         exit 1 ;;
  esac
done

# 생성 산출물은 **자산이 아니다**(보존 법칙 §자산 vs 산출물). 법칙은 우주가 손으로 쓴 것에만 적용한다.
# ⚠️ 여기 빠뜨리면 렌더 결과가 중력 법칙 위반으로 잡힌다 — 실제로 R03 에서 그렇게 잡혔다.
#
#   beacon/out    발행 렌더 결과
#   observatory/engine  벤더링한 관측 엔진 — 우주가 쓴 것이 아니라 **가져온** 것이다.
#                       정본은 fe-agent-harness 저장소이므로 우주의 법칙(중력·frontmatter)을 걸지 않는다.
#   node_modules  중첩된 것까지 전부(엔진이 자기 것을 갖는다)
GENERATED='./beacon/out/*'
VENDORED='./observatory/engine/*'
NODE_MODULES='*/node_modules/*'
# ⚠️ 픽스처는 **시험 자산이지 별이 아니다.** 스테이지를 돌리려면 은하가 필요한데,
#    실제 저장소를 쓰지 않으려면 저장소 안에 시험용 은하를 둘 수밖에 없다.
#    보존 법칙의 「자산 vs 산출물」 구분이 여기까지 미친다 — 대신 배달되지 않는다(package.json files).
# ⛔⛔ **은하의 집은 좌표에서 읽는다 — 손으로 적지 않는다.**
#
# 여기 `./fixtures/*` 라고 **손으로 적혀 있었다.** 그래서 우주 안에 은하를 하나 더
# 벤더링하자(`app/universe` — 콘솔) 보존 법칙이 그 별들을 「우주 안에 별이 섞였다」로
# 잡았다. ⚠️ 그때 사람이 배우는 것은 **예외를 하나 더 적는 법**이다.
# ⛔ §9 가 네 번 잡은 형태다 — **사람이 정한 이름을 열거하면 그 밖은 안 보인다.**
# ⇒ 등록된 은하 좌표(`galaxies/*.json` 의 `path`)가 곧 은하의 집이다. 법은 약해지지 않는다 —
#   오히려 **「등록도 안 한 은하를 우주 안에 뒀다」가 이제 잡힌다.**
# ⚠️ 같은 규칙이 `lib/selftest.mjs` 에도 있다. **두 자리에 있는 것을 알고 둔다** —
#   집행자가 둘(bash·node)이라 합칠 수가 없다. 한쪽만 고치면 다른 쪽이 문다(실제로 그랬다).
GALAXY_HOMES=()
while IFS= read -r home; do
  [ -n "$home" ] && GALAXY_HOMES+=( -not -path "./$home/*" )
done < <(node -e '
  const fs = require("node:fs");
  for (const f of fs.readdirSync("galaxies").filter((x) => x.endsWith(".json"))) {
    try {
      const p = JSON.parse(fs.readFileSync(`galaxies/${f}`, "utf8")).path;
      if (typeof p === "string" && p && !p.startsWith("/")) { console.log(p); }
    } catch { /* 못 읽는 좌표는 건너뛴다 — 좌표 감사가 따로 문다 */ }
  }' 2>/dev/null)
# ⚠️ **가져온 도구** — `qa/`(TC 관문·린터)는 `qa-harness` 에서 흡수한 것이다.
#    `observatory/engine` 과 같은 성질이라 우주의 문서 법칙(중력·frontmatter)을 걸지 않는다.
#    ⛔ 특히 `qa/tests/fixtures/*.md` 는 **일부러 어긋나게 쓴 린터 입력**이다 —
#       거기에 frontmatter 를 붙이면 그 시험이 재던 것이 사라진다.
ABSORBED='./qa/*'
NOT_ASSET=( -not -path "$GENERATED" -not -path "$VENDORED" -not -path "$NODE_MODULES" -not -path './node_modules/*' -not -path "$ABSORBED" ${GALAXY_HOMES[@]+"${GALAXY_HOMES[@]}"} )

say() { printf '%s\n' "$1"; }
bad() { printf '  ❌ %s\n' "$1"; fail=1; }
# ⚠️ warn 은 fail 을 올리지 않는다 — 사람이 그 줄을 열어 보라는 표시다. 이유는 아래 「파이프 뒤 판정」 절에 적어 둔다.
warn() { printf '  ⚠️  %s\n' "$1"; }

say "── 중력 법칙 — 모든 문서는 parent 또는 related 를 갖는다"
while IFS= read -r f; do
  head -20 "$f" | grep -qE '^(parent|related):' || bad "$f"
done < <(find . -name '*.md' "${NOT_ASSET[@]}")

say "── 보존 법칙 — 별(소스 산출물)은 우주 안에 두지 않는다"
while IFS= read -r f; do
  bad "$f — 별은 은하로"
done < <(find . \( -name '*.tsx' -o -name '*.jsx' -o -name '*.vue' \) "${NOT_ASSET[@]}")

say "── 관측 법칙 — 모든 법칙에 「재는 법」이 있고, 그 안에 돌릴 명령이 있다"
# ⚠️ 예전엔 제목만 있으면 통과였다. 변이 시험이 그 헐거움을 드러냈다 —
#    제목을 「## 재는 법이 사라진 자리」로 바꿔도 `^## 재는 법` 에 걸려 **통과했다.**
#    법칙 문서가 말하는 것은 「재는 법이 없으면 그것은 법칙이 아니라 의견이다」이므로,
#    빈 절도 의견이다. 절 안에 **펜스 코드블록(=돌릴 명령)** 이 있는지까지 본다.
for f in laws/*.md; do
  [ "$(basename "$f")" = 'README.md' ] && continue
  n=$(awk '/^## .*재는 법/{inside=1;next} /^## /{inside=0} inside&&/^```/{c++} END{print c+0}' "$f")
  if [ "$n" -lt 2 ]; then
    bad "$f — 재는 법에 돌릴 명령이 없다(펜스 ${n}개)"
  fi
done

# ── 관측 법칙 §3·§4 — 검사 명령을 파이프에 물려 그 결과로 판정하지 않는다.
#
# ⚠️ 왜 경고에 그치는가 (exit 1 로 만들지 않은 이유):
#   ① 정적으로는 파이프라인의 종료코드가 **판정에 쓰이는지** 화면에 뿌리기만 하는지 가를 수 없다.
#   ② 필터가 판정자인 정당한 형태가 있다 — 이 스크립트 자신의 `head -20 "$f" | grep -qE` 가 그것이다.
#   ③ R04·R05 의 재발은 사람이 대화형 셸에서 밟은 것이라 스크립트 훑기로는 애초에 안 잡힌다.
#      이 검사가 막는 것은 그 습관이 **스크립트로 굳는 것**뿐이다.
#   근거 없이 무는 관문은 별이 무시하는 법부터 배우게 한다(laws/README.md 「법칙이 헛돌면 뺀다」).
#
# ⚠️ 아래 grep 둘은 **판정이 아니라 목록 만들기**다 — 종료코드를 읽지 않는다(관측 법칙 §4 자기참조).
say "── 관측 법칙 — 검사 명령을 파이프에 물려 판정하지 않는다 (경고만)"
# 왼쪽: 「무언가를 판정하는 명령」 · 오른쪽: 종료코드를 삼켜 버리는 순수 필터
CHECK_CMD='(verify-laws\.sh|verify\.mjs|observe\.mjs|bigbang\.mjs|render\.mjs|(bash|sh|node|npx)[[:space:]]+[^|]*\.(sh|mjs|js)|(yarn|npm|pnpm)[[:space:]]+(run[[:space:]]+)?(lint|test|build|typecheck)|eslint|tsc|vitest|playwright|pytest)'
OUT_FILTER='(head|tail|grep|sed|awk|cut|sort|uniq|wc|less|more|tee)([[:space:]]|$)'
piped=0
while IFS= read -r f; do
  while IFS= read -r hit; do
    warn "$f:$hit"; piped=1
  done < <(grep -nE "$CHECK_CMD[^|]*\|[[:space:]]*$OUT_FILTER" "$f" | grep -vE '^[0-9]+:[[:space:]]*(#|//|\*)')
done < <(find . \( -name '*.sh' -o -name '*.mjs' \) "${NOT_ASSET[@]}")
if [ "$piped" -eq 1 ]; then warn '위 줄들을 직접 열어 보라. 판정이면 파일로 떨구고(cmd > log 2>&1; echo "exit=$?") 그다음에 걸러라 — laws/observation.md 「검사를 판정하는 법」'; fi

say "── frontmatter 필수 필드 (name·title·type·description)"
while IFS= read -r f; do
  for k in name title type description; do
    head -20 "$f" | grep -qE "^$k:" || bad "$f — $k 없음"
  done
done < <(find . -name '*.md' "${NOT_ASSET[@]}")

# ⚠️ 예전엔 여기서 `measured:` 를 요구했다. 그런데 **법칙 하나가 은하 N개에 걸린다** —
#    값 하나로는 담을 수 없다. 실측은 은하의 것이므로 `galaxies/*.json` 의 `observed` 로 옮겼다.
#    법칙에 남아야 하는 것은 「어느 규칙을 덮는가」다 — 그것이 없으면 관측소가 잴 수 없다.
say "── 물질 법칙은 applies_to 와 rules 를 갖는다"
for f in laws/*.md; do
  grep -q '^scope: matter' "$f" || continue
  grep -qE '^applies_to:' "$f" || bad "$f — applies_to 없음"
  grep -qE '^rules:\s*\[.+\]' "$f" || bad "$f — rules 없음 (관측소가 잴 수 없다)"
  grep -qE '^measured:' "$f" && bad "$f — measured 는 법칙이 아니라 은하의 것이다(galaxies/*.json observed)"
done

say "── config 정합 — laws · forces · orbits 배열 ↔ 파일"
for organ in forces orbits; do
  for n in $(python3 -c "import json;print(' '.join(json.load(open('universe.config.json')).get('$organ',[])))"); do
    [ -f "$organ/$n.md" ] || bad "config 의 $organ 에 있는 파일이 없다: $organ/$n.md"
  done
  for f in $organ/*.md; do
    n=$(basename "$f" .md); [ "$n" = 'README' ] && continue
    grep -q "\"$n\"" universe.config.json || bad "파일은 있는데 config($organ) 에 없다: $n"
  done
done
for n in $(python3 -c "import json;print(' '.join(json.load(open('universe.config.json'))['laws']))"); do
  [ -f "laws/$n.md" ] || bad "config 에 있는 법칙 파일이 없다: laws/$n.md"
done
for f in laws/*.md; do
  n=$(basename "$f" .md); [ "$n" = 'README' ] && continue
  grep -q "\"$n\"" universe.config.json || bad "파일은 있는데 config 에 없다: $n"
done

if [ "$fail" -eq 0 ]; then say $'\n✅ 우주가 자기 법칙을 지킨다.'; else say $'\n⛔ 위반이 있다.'; fi
exit $fail
