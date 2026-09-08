#!/usr/bin/env bash
# **TC 입구가 도는가** — 양식을 실제로 내주고, 채우고, 돌려서 **종료코드와 값**을 잰다.
#
# ⛔ 화면 문구를 읽지 않는다. 「⚪ 라고 말했다」가 아니라 **exit 3 이 나왔는가**를 본다.
# ⛔ 저장소를 안 더럽힌다: 전부 `mktemp -d` 안에서 논다.
#
# ## 여기서만 잡히는 것 — **따옴표·줄바꿈이 든 칸**
# 사람이 채워 오는 표에는 반드시 줄바꿈 든 사유가 들어온다. 순진하게 읽으면 한 줄이 두 줄이
# 되고 **사유가 반토막 난 채로 초록**이 나온다. 여기서 그 값을 왕복시켜 **글자까지** 본다.
#
# ## ⛔ 못 재는 것 (§8)
#   · 진짜 Playwright 는 안 돌린다(브라우저가 필요하다). 리포트 JSON 을 넣어 **합치는 자리**만 잰다.
#   · 진짜 모델도 안 부른다. PATH 에 가짜 `claude` 를 놓고 **불렸는지 세어서** 잰다.
#   · 엑셀이 만든 진짜 파일은 못 잰다 — BOM·CRLF 를 **손으로 만들어** 흉내 낸다.
#
# 재는 법: `bash observatory/probe-tc.sh`
# ⛔ 파이프 뒤에서 종료코드를 읽지 마라(관측 법칙 §3).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
CLI="$ROOT/qa/dist/tc/cli.js"
DRAFT="$ROOT/qa/dist/tc/draft-cli.js"

# ⛔⛔ **낡은 빌드를 재고 초록이라 하지 않는다 — 낡았으면 다시 짓는다.**
#    실측: 소스를 바꾸는 변이가 `dist` 를 안 거쳐 **조건이 안 만들어졌다**(❌ 놓쳤다가 났다).
#    재려던 것은 「지금 소스가 도는가」이지 「누가 지었나」가 아니다(probe-console 과 같은 규율).
if [ -d "$ROOT/qa/src/tc" ]; then
  if [ ! -f "$CLI" ] || [ -n "$(find "$ROOT/qa/src" -name '*.ts' -newer "$CLI" 2>/dev/null | head -1)" ]; then
    echo "  ⓘ qa 빌드가 소스보다 낡았다 — 다시 짓는다."
    npm --prefix "$ROOT/qa" run build >/dev/null 2>&1 || { echo "⛔ qa 가 컴파일되지 않는다."; exit 1; }
  fi
fi

if [ ! -f "$CLI" ] || [ ! -f "$DRAFT" ]; then
  echo "⚪ 못 쟀다 — qa 빌드가 없다(qa/dist/tc). \`npm --prefix qa run build\` 를 먼저 돌려라."
  exit 3
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fail=0
ok ()   { echo "✅ $1"; }
bad ()  { echo "⛔ $1"; fail=1; }

# 기대한 종료코드가 나왔는가. ⛔ 「죽었다」가 아니라 **「그 코드로 죽었는가」**를 본다.
expect_exit () { # <기대> <이름> <명령…>
  local want="$1" name="$2"; shift 2
  local out; out="$("$@" 2>&1)"; local got=$?
  if [ "$got" -eq "$want" ]; then ok "$name (exit $got)"; else
    bad "$name — exit $want 를 기대했는데 $got 이다"; echo "$out" | sed 's/^/     /'; fi
}

TAB=$'\t'
HEAD="id${TAB}origin${TAB}status${TAB}attribution${TAB}verdict.kind${TAB}verdict.why"

# ── ① 양식을 내주고, 빈 양식은 **초록이 아니다** ────────────────────────────
expect_exit 0 "양식을 내준다" node "$CLI" --emit "$WORK/양식"
[ -f "$WORK/양식/tc-cases.tsv" ] || bad "케이스 양식이 안 나왔다"
[ -f "$WORK/양식/tc-preconditions.tsv" ] || bad "전제 양식이 안 나왔다"
expect_exit 3 "빈 양식을 그대로 넣으면 **못 쟀다**(0줄은 「없다」가 아니다)" \
  node "$CLI" --cases "$WORK/양식/tc-cases.tsv" --preconditions "$WORK/양식/tc-preconditions.tsv"
expect_exit 3 "이미 있는 자리에 양식을 덮어쓰지 않는다" node "$CLI" --emit "$WORK/양식"

# ── ② 채운 양식 — 종료코드 셋이 다 나오는가 ────────────────────────────────
printf 'id\tok\tdetail\n세션\tyes\t확인함\n' > "$WORK/pre.tsv"
printf 'id\tok\tdetail\n세션\tunknown\t확인 못 했다\n' > "$WORK/pre-unknown.tsv"

printf '%s\nTC-1\tpolicy\tfailed\tstar\t\t\n' "$HEAD" > "$WORK/unjudged.tsv"
expect_exit 1 "판단하지 않은 fail 이 있으면 1" node "$CLI" --cases "$WORK/unjudged.tsv" --preconditions "$WORK/pre.tsv"

printf '%s\nTC-1\tpolicy\tfailed\tstar\tfixed\t셀렉터를 고쳤다\n' "$HEAD" > "$WORK/judged.tsv"
expect_exit 0 "판단이 붙으면 0 — **「fail 0」이라서가 아니다**" \
  node "$CLI" --cases "$WORK/judged.tsv" --preconditions "$WORK/pre.tsv"

expect_exit 3 "전제 양식을 안 주면 3 — 「전제 0개」는 통과가 아니다" node "$CLI" --cases "$WORK/judged.tsv"
expect_exit 3 "전제가 unknown 이면 3 — 확인 못 한 것은 「섰다」가 아니다" \
  node "$CLI" --cases "$WORK/judged.tsv" --preconditions "$WORK/pre-unknown.tsv"

printf '%s\nTC-1\tderived-from-code\tpassed\tstar\t\t\n' "$HEAD" > "$WORK/self.tsv"
expect_exit 3 "구현에서 나온 TC 만 있으면 3 — 자기 채점은 검증이 아니다" \
  node "$CLI" --cases "$WORK/self.tsv" --preconditions "$WORK/pre.tsv"

printf 'id\torigin\tstatus\tattr\nTC-1\tpolicy\tpassed\tstar\n' > "$WORK/badcol.tsv"
expect_exit 3 "모르는 칸 이름을 거부한다 — 안 읽힌 칸은 「안 적은 것」과 구별이 안 된다" \
  node "$CLI" --cases "$WORK/badcol.tsv" --preconditions "$WORK/pre.tsv"

printf '%s\nTC-1\tpolciy\tpassed\tstar\t\t\n' "$HEAD" > "$WORK/badval.tsv"
expect_exit 3 "origin 오타를 거부한다 — 흘리면 **검증 분모가 는다**" \
  node "$CLI" --cases "$WORK/badval.tsv" --preconditions "$WORK/pre.tsv"

# ── ③ ⛔ 따옴표·줄바꿈·쉼표가 든 칸이 **글자 그대로** 살아 오는가 ───────────
#    (여기가 조용히 깨지는 자리다 — 값이 반토막 나도 종료코드는 0 이 될 수 있다)
{
  printf '%s\n' "$HEAD"
  printf 'TC-1\tpolicy\tfailed\tstar\taccepted\t"1) 로그인한다\n'
  printf '2) 문구는 ""5회 실패"" 이고, 쉼표도 있다 — 팀이 다음 스프린트로 미루기로 합의했다"\n'
} > "$WORK/nasty.tsv"
NASTY_JSON="$(node "$CLI" --json --cases "$WORK/nasty.tsv" --preconditions "$WORK/pre.tsv" 2>/dev/null)"
nasty_code=$?
if [ "$nasty_code" -ne 0 ]; then
  bad "줄바꿈·따옴표가 든 사유를 못 읽었다 (exit $nasty_code)"; echo "$NASTY_JSON" | sed 's/^/     /'
else
  echo "$NASTY_JSON" | node -e '
    let raw = ""; process.stdin.on("data", (d) => { raw += d; });
    process.stdin.on("end", () => {
      const why = JSON.parse(raw).cases[0].verdict.why;
      const want = `1) 로그인한다\n2) 문구는 "5회 실패" 이고, 쉼표도 있다 — 팀이 다음 스프린트로 미루기로 합의했다`;
      if (why === want) { console.log("✅ 줄바꿈·따옴표·쉼표가 든 사유가 **글자 그대로** 살아 왔다"); process.exit(0); }
      console.log("⛔ 사유가 갈렸다:"); console.log(`   받은 것: ${JSON.stringify(why)}`);
      console.log(`   원본  : ${JSON.stringify(want)}`); process.exit(1);
    });'
  [ $? -eq 0 ] || fail=1
fi

# 엑셀이 뱉는 CSV — **BOM + CRLF**. 흉내 내서 넣는다.
printf '\xEF\xBB\xBFid,origin,status,attribution,verdict.kind,verdict.why\r\nTC-1,policy,failed,star,fixed,"고쳤다, 그리고 확인했다"\r\n' > "$WORK/excel.csv"
printf '\xEF\xBB\xBFid,ok,detail\r\n세션,yes,확인함\r\n' > "$WORK/excel-pre.csv"
expect_exit 0 "엑셀 CSV(BOM+CRLF)를 읽는다 — 안 지우면 첫 칸 이름이 안 맞아 죽는다" \
  node "$CLI" --cases "$WORK/excel.csv" --preconditions "$WORK/excel-pre.csv"

printf 'id\torigin\tstatus\tattribution\nTC-1\tpolicy\t"passed\tstar\n' > "$WORK/unterminated.tsv"
expect_exit 3 "인용이 안 닫힌 표를 거부한다 — 삼키면 표 전체가 한 칸이 된다" \
  node "$CLI" --cases "$WORK/unterminated.tsv" --preconditions "$WORK/pre.tsv"

cp "$WORK/judged.tsv" "$WORK/judged.xlsx"
expect_exit 3 ".xlsx 를 빈 표로 읽지 않고 거부한다" \
  node "$CLI" --cases "$WORK/judged.xlsx" --preconditions "$WORK/pre.tsv"

# ── ④ 주행과 합치기 — **spec 이 없는 TC** 를 이름으로 부르는가 ──────────────
PW="$ROOT/qa/tests/fixtures/run/playwright-report.json"
if [ ! -f "$PW" ]; then
  echo "⚪ 못 쟀다 — Playwright 리포트 픽스처가 없다: $PW"
else
  printf '%s\nTC-201\tpolicy\tunmeasured\tstar\t\t\nTC-999\tpolicy\tunmeasured\tstar\t\t\n' "$HEAD" > "$WORK/merge.tsv"
  MERGED="$(node "$CLI" --json --cases "$WORK/merge.tsv" --preconditions "$WORK/pre.tsv" --playwright "$PW" 2>/dev/null)"
  echo "$MERGED" | node -e '
    let raw = ""; process.stdin.on("data", (d) => { raw += d; });
    process.stdin.on("end", () => {
      const r = JSON.parse(raw);
      const notRun = r.form.notRun;
      const tc201 = r.cases.find((c) => c.id === "TC-201");
      if (!notRun.includes("TC-999")) { console.log("⛔ spec 이 없는 TC 를 이름으로 안 불렀다"); process.exit(1); }
      if (tc201.status !== "passed") { console.log(`⛔ 주행 결과를 안 썼다: ${tc201.status}`); process.exit(1); }
      console.log("✅ 상태는 주행이, 출처·탓은 양식이 채웠다 · spec 없는 TC 를 ⚪ 로 이름 불렀다");
    });'
  [ $? -eq 0 ] || fail=1
fi

# `--run` 의 종료코드가 **전제로 선다** — 주행이 깨졌으면 케이스는 제품 신호가 아니다.
expect_exit 3 "주행 명령이 실패하면 전제가 안 서서 3 — 케이스를 ❌ 로 안 센다" \
  node "$CLI" --cases "$WORK/judged.tsv" --preconditions "$WORK/pre.tsv" --run "exit 7" --playwright "$PW"
expect_exit 3 "--run 만 주고 --playwright 를 안 주면 3 — 결과를 어디서 읽을지 모른다" \
  node "$CLI" --cases "$WORK/judged.tsv" --preconditions "$WORK/pre.tsv" --run "true"

# ── ⑤ ⛔⛔ 돈 — 기본은 모델 호출 **0회** ────────────────────────────────────
mkdir -p "$WORK/bin"
cat > "$WORK/bin/claude" <<SH
#!/usr/bin/env bash
cat > /dev/null
echo called >> "$WORK/calls.txt"
printf '{"result":"[{\\\\"title\\\\":\\\\"5회 실패하면 잠긴다\\\\",\\\\"quote\\\\":\\\\"5회 실패 시 10분간 잠근다\\\\"}]","is_error":false}'
SH
chmod +x "$WORK/bin/claude"
printf '# 로그인 잠금\n5회 실패 시 10분간 잠근다\n\n# 안내 문구\n잠긴 동안 안내 문구를 보여 준다\n' > "$WORK/policy.md"
calls () { [ -f "$WORK/calls.txt" ] && wc -l < "$WORK/calls.txt" | tr -d ' ' || echo 0; }

DRY="$(PATH="$WORK/bin:$PATH" node "$DRAFT" --policy "$WORK/policy.md" 2>&1)"
dry_code=$?
if [ "$dry_code" -ne 0 ]; then bad "초안 미리보기가 죽었다 (exit $dry_code)"; echo "$DRY" | sed 's/^/     /'; fi
if [ "$(calls)" != "0" ]; then bad "**--write 없이 모델을 불렀다** ($(calls)회) — 돈이 나가는 자리다";
else ok "--write 없이는 모델을 **한 번도 안 부른다** (가짜 claude 로 세서 쟀다)"; fi
case "$DRY" in *"모델을 2번"*) ok "몇 번 부를지 **수로** 먼저 말한다" ;;
  *) bad "몇 번 부를지 안 말했다"; echo "$DRY" | sed 's/^/     /' ;; esac

WRITE="$(PATH="$WORK/bin:$PATH" node "$DRAFT" --policy "$WORK/policy.md" --out "$WORK/draft.tsv" --write 2>&1)"
write_code=$?
if [ "$write_code" -ne 0 ]; then bad "초안 뽑기가 죽었다 (exit $write_code)"; echo "$WRITE" | sed 's/^/     /'; fi
if [ "$(calls)" = "2" ]; then ok "--write 를 주면 **말한 수만큼**(2회) 부른다"; else bad "부른 횟수가 다르다: $(calls) (2 를 기대했다)"; fi
case "$WRITE" in *"토큰 사용량이 큽니다"*) ok "부르기 전에 **⚠️ 토큰 사용량이 큽니다** 를 경고한다" ;;
  *) bad "토큰 경고문이 없다 — 사용자가 명시적으로 요구한 줄이다" ;; esac

# ⛔ 초안은 검증이 아니다 — 그대로 돌리면 **못 쟀다(3)** 여야 한다.
expect_exit 3 "초안을 그대로 돌리면 3 — 사람이 안 본 TC 는 아무것도 검증하지 않는다" \
  node "$CLI" --cases "$WORK/draft.tsv" --preconditions "$WORK/pre.tsv"

# 사람이 확인한 것처럼 origin 을 policy 로 고치면 **검증으로 센다**.
# ⛔ 탭을 셸이 만들어 준다 — BSD sed 는 패턴의 `\t` 를 탭으로 안 읽는다(조용히 안 바뀐다).
#   첫 `unknown` 은 origin, 그 다음 `unmeasured` 는 status 다(sed 는 줄마다 첫 짝만 바꾼다).
sed -e "s/${TAB}unknown${TAB}/${TAB}policy${TAB}/" -e "s/${TAB}unmeasured${TAB}/${TAB}passed${TAB}/" \
  "$WORK/draft.tsv" > "$WORK/confirmed.tsv"
grep -q "${TAB}policy${TAB}" "$WORK/confirmed.tsv" || bad "변환이 안 먹었다 — 이 아래 판정은 뜻이 없다"
expect_exit 0 "사람이 origin 을 policy 로 고치면 검증으로 센다 — 고리가 닫힌다" \
  node "$CLI" --cases "$WORK/confirmed.tsv" --preconditions "$WORK/pre.tsv"

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "⛔ TC 입구가 위에 적힌 자리에서 어긋난다."
  exit 1
fi
echo ""
echo "✅ TC 입구가 돈다 — 양식 내주기 · 채운 표 읽기(따옴표·줄바꿈·엑셀 CSV) · 주행 합치기 · 초안(모델 0회 기본)"
echo "⚠️ **진짜 Playwright 와 진짜 모델은 안 불렀다**(§8) — 브라우저·구독이 필요한 축은 여기서 못 쟀다."
