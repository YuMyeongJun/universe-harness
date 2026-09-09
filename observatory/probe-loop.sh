#!/usr/bin/env bash
# 「이 은하는 끝났는가」가 **셋으로 갈리는가** — 브라우저 없이 잰다.
#
# ⛔ 이 탐침은 **판정을 만들지 않는다.** `loop` 이 리포트를 읽고 0/1/3 으로 옳게 가르는지만 본다.
#
# ⚠️ 예전 판은 `qa/`(TC 도구)의 얼려 둔 리포트와 `galaxies.local/` 의 은하에 매여 있었다.
#    둘 다 이 가지에 없다 — 그래서 **깨끗한 클론과 CI 에서는 애초에 못 돌던 탐침**이었다.
#    지금은 커밋되는 픽스처와 커밋되는 은하(tiny-galaxy)만 쓴다.
#
# ⛔ **이것이 재지 못하는 것**(§8): 진짜 e2e 주행. 여기서 재는 것은 「리포트를 읽고 셋으로
#    가르는가」이지 「브라우저에서 도는가」가 아니다. 브라우저는 은하가 `commands.e2e` 를
#    선언한 뒤 사람이 돌린다 — 관문에 넣으면 매 바퀴 브라우저를 띄운다.
#
# 재는 법:
#   bash observatory/probe-loop.sh
set -u
cd "$(dirname "$0")/.."
fail=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

want() {   # want <이름> <기대 종료코드> <명령...>
  local label="$1" expect="$2"; shift 2
  "$@" >"$tmp/out.txt" 2>&1
  local code=$?
  if [ "$code" = "$expect" ]; then
    echo "  ✅ $label  exit=$code"
  else
    echo "  ⛔ $label — 기대 exit=$expect 인데 $code 였다"
    tail -4 "$tmp/out.txt" | sed 's/^/     /'
    fail=$((fail + 1))
  fi
}

echo "── 「끝났는가」가 셋으로 갈리는가 (브라우저 없이)"

want "① 판정 붙은 주행 → 끝났다" 0 \
  node observatory/loop-state.mjs --galaxy tiny-galaxy --report fixtures/loop/judged-run.json

want "② 판정 없는 fail → 남았다" 1 \
  node observatory/loop-state.mjs --galaxy tiny-galaxy --report fixtures/loop/playwright-run.json

# ⛔ 출처 명부를 뺏을 때 **⚪ 로 떨어져야** 한다 — 무엇을 검증하는지 모르는 TC 로
#    「끝났다」를 말하면 그것이 자기 채점이다.
cp galaxies/tiny-galaxy.json "$tmp/coord.bak"
node -e 'const f="galaxies/tiny-galaxy.json";const d=require("./"+f);delete d.commands.e2eOrigins;require("fs").writeFileSync(f,JSON.stringify(d,null,2)+"\n")'
want "③ 출처 명부가 없으면 → 못 쟀다" 3 \
  node observatory/loop-state.mjs --galaxy tiny-galaxy --report fixtures/loop/playwright-run.json
cp "$tmp/coord.bak" galaxies/tiny-galaxy.json

printf '이건 JSON 이 아니다\n' > "$tmp/notjson.json"
want "④ 못 읽는 리포트 → 못 쟀다(날 스택이 아니다)" 3 \
  node observatory/loop-state.mjs --galaxy tiny-galaxy --report "$tmp/notjson.json"

want "⑤ 축을 선언 안 한 은하 → 못 쟀다" 3 \
  node observatory/loop-state.mjs --galaxy messy-galaxy

# `repeat` 은 `loop` 을 부른다 — 같은 재료로 멈추는 자리를 본다.
want "⑥ repeat — 판정 붙은 주행이면 끝났다" 0 \
  node observatory/repeat.mjs --galaxy tiny-galaxy --report fixtures/loop/judged-run.json

want "⑦ repeat — 안 줄어들면 멈춘다" 1 \
  node observatory/repeat.mjs --galaxy tiny-galaxy --max 3 --stall 2 --report fixtures/loop/playwright-run.json

if [ "$fail" -gt 0 ]; then
  echo ""
  echo "⛔ 갈리지 않는 자리 ${fail}건 — 「끝났는가」가 셋으로 안 갈리면 이 명령은 장식이다."
  exit 1
fi
echo ""
echo "✅ 「끝났는가」가 셋으로 갈린다 — 그리고 ⚪ 를 ✅ 로 접지 않는다."
