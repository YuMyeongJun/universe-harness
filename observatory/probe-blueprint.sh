#!/usr/bin/env bash
# **구조 설명이 셋으로 갈리는가** — `universe blueprint` 의 관문 탐침.
#
# ⛔⛔ **모델을 절대 안 부르는 갈래만 잰다.** `--write` 는 여기서 한 번도 안 준다 —
#    관문은 커밋마다 도는데, 돈이 나가는 갈래를 관문에 걸면 **커밋 한 번이 청구서**가 된다.
#    그래서 이 탐침이 재는 것은 「**안 부른다고 말하는가**」와 「**셋으로 갈리는가**」다.
#
# ⛔ **남의 저장소를 안 건드린다.** 우주의 진짜 `universe.config.json` 도 안 건드린다 —
#    임시 폴더에 **복사본 우주**와 **가짜 저장소**를 세우고 `--universe` 로 겨눈다
#    (`observatory/probe-clone.sh` 가 세운 규율이다).
#
# ## ⛔ 이 탐침이 **못 재는 것** (§8 — 적어 둔다)
#   · **`--write` 갈래 전부.** 카드가 실제로 어떻게 생겼는지 · 모델이 무엇을 쓰는지는 안 재진다.
#     재는 것은 **부르기 전에 몇 번 부르는지 말하는가**까지다.
#   · **`--fix` 가 실제로 고치는가.** 은하가 `commands.lintFix` 를 선언한 갈래는 **남의 저장소를
#     고치는 일**이라 관문에서 안 돌린다. 재는 것은 **선언이 없을 때 거절하는가**뿐이다.
#   · **진짜 저장소의 관례.** 여기 세우는 가짜 저장소는 작다 — 큰 저장소의 자르기는 안 재진다.
set -uo pipefail
cd "$(dirname "$0")/.."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail=0
say () { echo "  $1"; }

# ── 복사본 우주 + 가짜 저장소 ────────────────────────────────────────────
home="$work/home"; repo="$work/repo"
mkdir -p "$home/galaxies.local" "$repo/src/pages"
printf '%s\n' '{"name":"probe","version":"0.0.0"}' > "$repo/package.json"

# ⛔ 폴더 이름으로 찾지 않는다는 것을 **여기서 못 박는다** — 자리 이름을 한글로 둔다(§9).
mkdir -p "$repo/src/화면묶음"
cat > "$repo/src/화면묶음/index.tsx" <<'TSX'
export const Entry = () => <div>들어오는 자리</div>;
TSX
cat > "$repo/src/화면묶음/Detail.tsx" <<'TSX'
export const Detail = () => <div>자세히</div>;
TSX
# 라우터 — **URL 모양 리터럴**로만 잡힌다. 라이브러리 이름을 안 쓴다.
cat > "$repo/src/길잡이.tsx" <<'TSX'
export const table = [
  { at: '/', label: '처음' },
  { at: '/orders', label: '주문' },
  { at: '/orders/:id', label: '주문 하나' },
];
TSX

write_home () {   # $1 = 좌표 JSON 본문
  printf '%s\n' '{"$schema":"universe","name":"Probe","galaxies":["탐침은하"]}' > "$home/universe.config.json"
  printf '%s\n' "$1" > "$home/galaxies.local/탐침은하.json"
}
COORD_PLAIN='{"name":"탐침은하","description":"임시","path":"'"$repo"'","appDir":".","commands":{},"thresholds":{},"solarSystems":[],"observed":{}}'
write_home "$COORD_PLAIN"

run () {   # 인자를 그대로 넘기고 출력·종료코드를 파일에 남긴다. ⛔ 파이프 뒤에서 안 읽는다(§3).
  node observatory/blueprint.mjs --universe "$home" --galaxy 탐침은하 "$@" > "$work/out.txt" 2>&1
  echo $? > "$work/code.txt"
}
code () { cat "$work/code.txt"; }

# ── ① 구조 설명이 없는 은하 → ⚪ 3 (「없다」가 아니다) ──────────────────────
run
if [ "$(code)" = "3" ]; then
  if grep -q '못 쟀다' "$work/out.txt" && grep -q '「구조가 없다」가 \*\*아니다' "$work/out.txt"; then
    say "✅ 설명이 없는 은하를 **⚪ 못 쟀다**(3)로 낸다 — 「구조가 없다」라고 말하지 않는다"
  else
    say "⛔ 3 으로 끝나긴 했는데 **그 이유가 아니다** — 「못 쟀다」와 「구조가 없다가 아니다」를 안 말했다"
    cat "$work/out.txt"; fail=1
  fi
else
  cat "$work/out.txt"
  say "⛔ 설명이 없는데 종료코드가 $(code) 다 — **못 쟀다(3)** 여야 한다(§8)"; fail=1
fi

# ── ② `--write` 없이는 **모델 호출 0회**임을 화면이 말한다 ────────────────
# ⛔ 「안 부른다」는 **화면이 말해야** 한다. 안 말하면 사람은 부르는 줄 알고 안 돌리거나,
#    부르는 줄 모르고 돌린다 — 「공짜인 줄 알고 돌렸다」가 그 두 번째다(R145).
if grep -q '모델을 0번 부른다' "$work/out.txt"; then
  say "✅ \`--write\` 없이는 **모델을 0번 부른다**고 화면이 말한다"
else
  say "⛔ **모델을 몇 번 부르는지 화면이 말하지 않는다** — 돈이 나가는 도구의 첫째 의무다"
  cat "$work/out.txt"; fail=1
fi
# 그리고 **부르면 몇 번인지**도 미리 말해야 한다(부르기 전에 아는 것이 요점이다).
grep -q '모델을 2번\*\* 부른다' "$work/out.txt" \
  && say "✅ \`--write\` 를 주면 몇 번 부를지 **미리** 말한다" \
  || { say "⛔ 부르면 몇 번인지 **미리 안 말한다** — 그럼 사람은 청구서로 안다"; cat "$work/out.txt"; fail=1; }

# ── ③ 구조를 **구조로** 찾았는가 (§9 — 이름을 열거하지 않는다) ────────────
# ⚠️ 자리 이름이 한글이다. 폴더 이름을 열거하는 훑개였다면 여기서 0개가 된다.
grep -q '자리 \*\*2개\*\*' "$work/out.txt" \
  && say "✅ 자리 2개를 **구조로** 찾는다 (\`index.*\` 가 있는 폴더 · URL 리터럴이 둘 이상인 파일)" \
  || { say "⛔ 자리를 2개로 못 셌다 — 훑개가 이름에 기대고 있다(§9)"; cat "$work/out.txt"; fail=1; }

# ── ④ 모르는 플래그를 거부하는가 (§7) ────────────────────────────────────
run --oracle
if [ "$(code)" = "0" ]; then
  say "⛔ **모르는 플래그를 삼켰다** — 안 켜진 모드가 켜진 것처럼 보인다(§7)"; fail=1
else
  grep -q '모르는 플래그 --oracle' "$work/out.txt" \
    && say "✅ 모르는 플래그를 거절한다" \
    || { say "⛔ 죽기는 했는데 **거절 사유가 아니다**"; cat "$work/out.txt"; fail=1; }
fi

# ── ⑤ 「수정」은 **두 겹** — 선언이 없으면 안 고친다 ───────────────────────
run --fix
if [ "$(code)" = "3" ] && grep -q '못 고쳤다' "$work/out.txt"; then
  say "✅ 은하가 \`commands.lintFix\` 를 선언 안 했으면 **안 고치고 ⚪ 로 말한다**"
else
  cat "$work/out.txt"
  say "⛔ 선언이 없는데 \`--fix\` 가 그냥 지나갔다(종료코드 $(code)) — 남의 저장소를 자동으로 고치는 일이다"
  fail=1
fi

# ── ⑥ 설명이 있으면 **1차가 돌고 초록이 된다** ────────────────────────────
card () {   # $1 = 카드 파일 이름  $2 = at  $3 = 본문 꼬리
  mkdir -p "$repo/universe/blueprint"
  cat > "$repo/universe/blueprint/$1" <<CARD
---
unit: ${1%.md}
at: $2
kind: 탐침
galaxy: 탐침은하
---

## 이 자리는 무엇인가
탐침이 손으로 놓은 설명이다. 모델을 부르지 않고 1차 검사만 재려고 둔다. $3
CARD
}
card "src-화면묶음.md" "src/화면묶음" ""
card "src-길잡이.tsx.md" "src/길잡이.tsx" ""
run
if [ "$(code)" = "0" ]; then
  say "✅ 자리가 전부 덮이고 규칙에 맞으면 **초록(0)** 이다"
else
  cat "$work/out.txt"; say "⛔ 카드가 다 있는데 초록이 아니다(종료코드 $(code))"; fail=1
fi

# ── ⑦ 1차가 **정말 무는가** — 사람이 채울 자리가 남은 카드 ────────────────
# ⛔ 이 갈래가 없으면 ⑥ 은 「검사가 장식이어도 초록」과 구별이 안 된다.
card "src-화면묶음.md" "src/화면묶음" "TODO: 여기는 아직 안 적었다"
run
if [ "$(code)" = "1" ] && grep -q '사람이 채울 자리' "$work/out.txt"; then
  say "✅ 사람이 채울 자리가 남은 설명을 **어긋남(1)** 으로 문다"
else
  cat "$work/out.txt"; say "⛔ 안 채운 설명을 그냥 통과시켰다(종료코드 $(code)) — 1차가 장식이다"; fail=1
fi
card "src-화면묶음.md" "src/화면묶음" ""

# ── ⑧ **안 덮인 자리**를 어긋남으로 세는가 ────────────────────────────────
rm -f "$repo/universe/blueprint/src-길잡이.tsx.md"
run
if [ "$(code)" = "1" ] && grep -q '설명하는 카드가 없다' "$work/out.txt"; then
  say "✅ 설명이 **일부만** 있는 것을 어긋남으로 센다 (한 장이라도 있으면 조용해지지 않는다)"
else
  cat "$work/out.txt"; say "⛔ 자리 하나가 안 덮였는데 조용하다(종료코드 $(code)) — 「일부만 봤다」가 통과가 된다(§8)"; fail=1
fi
card "src-길잡이.tsx.md" "src/길잡이.tsx" ""

# ── ⑨ **좌표가 없는 자리를 가리키면** 카드가 아니라 좌표를 고치라고 말하는가 ──
write_home '{"name":"탐침은하","description":"임시","path":"'"$repo"'","appDir":".","commands":{},"thresholds":{},"solarSystems":[{"name":"유령","description":"없는 자리","srcDir":"src/없는자리"}],"observed":{}}'
run
if [ "$(code)" = "1" ] && grep -q '좌표가 선언한 자리가 저장소에 없다' "$work/out.txt"; then
  say "✅ 좌표가 **없는 자리**를 선언하면 그 사실을 말한다 (카드를 고치라고 하지 않는다)"
else
  cat "$work/out.txt"; say "⛔ 좌표가 허공을 가리키는데 그 말을 안 한다(종료코드 $(code)) — 사람이 카드를 고치러 간다"; fail=1
fi
write_home "$COORD_PLAIN"

if [ "$fail" -ne 0 ]; then
  echo; echo "⛔ 구조 설명이 셋으로 안 갈린다."
  exit 1
fi
echo; echo "✅ 설명 없음은 ⚪ · 모델은 0번 · 모르는 플래그는 거절 · 1차는 물고 · 수정은 두 겹이다."
