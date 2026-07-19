# Pipeline-Unit State — Consumer Inventory

**Status:** READ-ONLY inventory. Nothing in this document changes behavior. It is a map of the
codebase as it existed at commit `fd7eb18c4cee1987b95bb904a790a248fba2f180` (2026-07-19), so that
a later claim of "this is fixed everywhere" can be checked against a list instead of against
memory.

**Scope — what counts as "pipeline-unit state" here.** A "unit" (`birim`) is one of: a top-level
planning stage (`genesis`/`premise`/`arastirma`/`strateji`/`master-plan`), a master-plan section
(`bölüm`), or the Kritik Pasaj (`elestiri`) — each represented by an object with the shape produced
by `bosAsama()` (`durum`, `cikti_pointer`, `kapi_sonuc`, `blok_nedeni`, `surum`,
`kabul_edilen_ust_surum`, `sorular_surum`, `tuketilen_ust_yanit_surum`, `duzeltme_uyarilari`),
stored inside one project's `planlama-durum.json` (`state.asamalar[x]`, `state.asamalar['master-
plan'].bolumler[x]`, `state.elestiri`). "Reads/writes/derives" covers: status (`durum`), progress
(`surum`, `kapi_sonuc`, `cikti_pointer`, staleness), and open questions (`sorular_surum` and what
it resolves to).

**Explicitly out of scope (verified, not silently dropped).** `src/lib/stateMachine.js` defines a
*different* state machine — Kart şeması v1 (`tip`: `ilerleme`/`girdi-talebi`/`build-task`/
`feedback`, its own `durum`/`AKIS`) for the partner-dashboard/build-board card system (Barış
retirement, `_demo-foya`, `kararFasilitasyon`, `seamReconcile`, `masterPlanBolucu`, `kararWire`,
`worker/worker.js`). It shares the Turkish word "durum" and even some literal values
(`onay-bekliyor`-shaped flows) with the planning pipeline, but it is a genuinely separate domain
object with its own consumers (`src/components/Card.jsx`, `src/lib/writePath.js`,
`src/lib/kararFasilitasyon.js`, `src/views/PartnerView.jsx`'s card list, `scripts/kararWire.mjs`,
`scripts/masterPlanBolucu.mjs`, `scripts/olayWire.mjs`, `tools/seamReconcile.mjs` /
`scripts/seam-reconcile.mjs`, `worker/worker.js`). None of these files read or write
`planlama-durum.json`; confirmed by grep (see §How I found this). They are not listed as rows
below — listing 15 files that share a vocabulary word but not the data would bury the real
findings. `src/lib/intakeBuilder.js:fazHesapla` sits on the boundary (see row 27 below) and *is*
listed because it is genuinely invoked with pipeline-derived data in one call site.

**Row count:** 33 production-code consumers that touch the state object directly (rows 1–33) + 1
boundary/fallback consumer one hop removed from the state object (row 34, `fazHesapla`) + 1
explicitly-excluded look-alike system (above) + a compact list of test/fixture consumers (§ Test &
fixture consumers). Test files that only import and call the shared resolvers (no reimplementation)
are grouped rather than given one row each — see that section for the criterion.

---

## Summary

- **Total production consumers touching the state object directly: 33** — writes: **9**, reads:
  **11**, derives: **13**. Plus **1** boundary/fallback consumer (row 34, `fazHesapla`) one hop
  removed from the state object — 34 total.
- **Consumers that do NOT go through a shared resolver: 18 of 33 clearly (55%), plus 2 more
  (rows 8, 9) that are partial/mixed** (part of the write goes through a shared function, part is
  inline) — 20 of 33 in total have at least one inline/independent path. Plus row 34. Most of
  these are not bugs — see the "why not" column — but rows 22, 24, and 34 are genuine,
  previously-unnoticed duplicate/mismatched-logic sites flagged under "Bugs found while mapping"
  below.
- **Distinct resolution mechanisms found: 8** (calibration floor was 4):
  1. `birimStateOf` (tools/planlamaDurumMakinesiV2.mjs) — canonical generic getter by id.
  2. `birimAcikDurum` (tools/planlamaBirimMotoru.mjs) — open-question status given an explicit
     birim-state object.
  3. `acikSoruDurum`/`acikSoruDurumJenerik` (tools/planlamaDurumOzeti.mjs) — open-question status
     for the *currently active* unit; independent reimplementation of (2)'s logic, not a caller of it.
  4. `aktifBolumBilgisi` (tools/planlamaBolumLoop.mjs) — is the master-plan bölüm-walk active;
     own inline read of `mp.durum`/`mp.bolumler`/`mp.aktif_bolum`.
  5. `pipelineDurumFazHesapla` (src/lib/registry.js) — project-level durum/faz; own inline read.
  6. `projeKartlariniTuret`/`masterPlanKararBirimi` (tools/planlamaKartTuretici.mjs) — card/panel
     build step; own inline read, explicitly documented in-code as an intentional duplicate of (4).
  7. `durumOzetiCikar`/`raporYaz` (scripts/planlama-baslat.mjs) — CLI status/report text; own
     inline reads, partially via (1), partially not.
  8. `iddialariCozumle` (tools/planlamaIddiaDurumu.mjs) — claim/open-question closure status from
     a birim-state object's `sorular_surum`; own inline read.
- **The card/panel build step** is `scripts/build-card-data.js`, specifically the per-project loop
  at lines 357–452 that writes `public/cards-<id>.json` (via `projeKartlariniTuret`), `public/
  sorular-<id>.json` (via `acikSoruDurum` + its own inline snapshot fields), and `public/
  registry.json`'s `durum`/`faz` (via `pipelineDurumFazHesapla`). See rows 20–23.

---

## Inventory

Columns: **Consumer** (file:symbol) · **Role** · **State source** (named path) · **Via shared
resolver?** · **If no, why not**.

### Writers

| # | Consumer | Role | State source | Via shared resolver? | If no, why not |
|---|---|---|---|---|---|
| 1 | `tools/planlamaBirimMotoru.mjs:birimKostur` | writes | mutates `birimler[birimId]` (caller-supplied map — `state.asamalar` or `mp.bolumler` or `{elestiri: state.elestiri}`) directly: `durum`, `cikti_pointer`, `surum`, `kabul_edilen_ust_surum`, `tuketilen_ust_yanit_surum`, `kapi_sonuc`, `blok_nedeni`, `duzeltme_uyarilari`, `sorular_surum` | — (this **is** the canonical write path for the "execute a unit" transition) | n/a — canonical |
| 2 | `tools/planlamaBirimMotoru.mjs:birimGeriDon` | writes | mutates `birimler[hedef]` directly: `durum='bekliyor'`, `kapi_sonuc=null`, `blok_nedeni=null`, `sorular_surum=null` | — (canonical write path for the "geri-dönüş" transition) | n/a — canonical |
| 3 | `tools/planlamaLoopV2.mjs:ileriMod` (inline, lines ~276–339) | writes | mutates `state.asamalar[A]` directly: `durum`, `kapi_sonuc`, `blok_nedeni`, `sorular_surum` (recovery-from-`donduruldu` and onay/approval transitions) | no | intentional — these are the "re-validate on re-invocation" and "human approval" transitions, which are *not* the "execute" transition `birimKostur` owns; no shared writer exists for them, each covers a disjoint set of `durum` transitions |
| 4 | `tools/planlamaLoopV2.mjs:ileriMod` mod=`'tut'` block (lines ~193–226) | writes | mutates `state.asamalar[A]` directly: `kabul_edilen_ust_surum`, `durum='gecti'`, `kapi_sonuc`, `blok_nedeni` | no | intentional — "olduğu-gibi-kabul" (accept-as-is) is its own transition, no LLM call, deliberately bypasses `birimKostur` |
| 5 | `tools/planlamaBolumLoop.mjs:bolumWalkAdimAt` (inline, lines ~466–530) | writes | mutates `mp.bolumler[B]` directly: `durum`, `kapi_sonuc`, `blok_nedeni`, `sorular_surum` (bölüm-level recovery/onay, mirrors row 3 one level down) | no | intentional, same reasoning as row 3, duplicated at bölüm granularity |
| 6 | `tools/planlamaBolumLoop.mjs:layer2VeSonrasi` (lines 385–426) | writes | mutates `mp` (the **outer** master-plan unit, i.e. `state.asamalar['master-plan']`) directly: `surum`, `cikti_pointer`, `blok_nedeni`, `sorular_surum`, `durum='onay-bekliyor'`, `kabul_edilen_ust_surum` | no | **historical, previously a real bug** — code comment at lines 410–418 records that `kabul_edilen_ust_surum` was never written here before a 2026-07-16 fix because the outer master-plan record never passes through `birimKostur` (only its 15 sub-bölümler do); this was fixed by writing it directly here rather than routing through a shared writer |
| 7 | `tools/planlamaBolumLoop.mjs:outerOnayIsle` (lines 430–454) | writes | mutates `mp` directly: `durum='gecti'`, `kapi_sonuc='gecti'`, `blok_nedeni=null` | no | same reasoning as row 6 — outer master-plan unit's final-approval transition, no shared writer covers it |
| 8 | `tools/planlamaBolumLoop.mjs:bolumeGeriDon` (lines 588–599) | writes | calls `birimGeriDon` (row 2) for `mp.bolumler[hedef]`, **then** additionally mutates `mp.durum='kosuyor'`, `mp.kapi_sonuc=null`, `mp.blok_nedeni=null`, and possibly `state.aktif_asama` directly | partial | the sub-bölüm write goes through `birimGeriDon`; the container (`mp`)-level bookkeeping after it is inline, because `birimGeriDon`'s contract only knows about one `sira`/`birimler` map at a time and the outer container isn't in that map |
| 9 | `tools/elestiriPasi.mjs:elestiriAdimAt` (inline, lines ~246–277) | writes | mutates `state.elestiri` directly: `durum`, `kapi_sonuc`, `blok_nedeni`, `sorular_surum` (recovery + onay transitions, elestiri-level mirror of row 3); the "execute" transition inside the same function delegates to `birimKostur` (row 1) | mixed | same reasoning as row 3, one more level of duplication (asama/bölüm/elestiri each have their own copy of the "re-validate + human-approval" transition logic) |

### Readers

| # | Consumer | Role | State source | Via shared resolver? | If no, why not |
|---|---|---|---|---|---|
| 10 | `tools/planlamaDurumMakinesiV2.mjs:stateYukle` / `statePersist` | reads/writes (disk I/O) | `planlama-durum.json` on disk, parsed via `normalizeState` | — | n/a — this is the disk-boundary itself, the root of every other path |
| 11 | `scripts/soru-yanit-queue-watch.mjs:gonderimiIsle` (line 94) | reads | `birimStateOf(state, asama)` — `.sorular_surum` compared against submitted queue entry's `surum` | **yes** | — |
| 12 | `scripts/planlama-baslat.mjs:birimPaketiVeYanitlarOf` (line 47) | reads | `birimStateOf(state, id)` | **yes** | — |
| 13 | `scripts/planlama-baslat.mjs:seceneklerYaz`→ call site line 177 (inside `raporYaz`) | reads | `birimStateOf(state, a)` | **yes** | — |
| 14 | `scripts/planlama-baslat.mjs:raporYaz`, `'sorular-acik'` branch (line 223) | reads | `birimStateOf(state, a)?.duzeltme_uyarilari` | **yes** | — |
| 15 | `scripts/planlama-baslat.mjs:raporYaz`, `'bayat-karar'` branch (line 267) | reads | `birimStateOf(state, a)` | **yes** | — |
| 16 | `scripts/planlama-baslat.mjs:durumOzetiCikar` (lines 79–127) | reads | `state.aktif_asama`, `state.elestiri` (line 91), `state.asamalar[A]` (line 105) — **own inline access**, does not call `birimStateOf` | no | historical — this CLI list-summary function predates the `birimStateOf` extraction (fd7eb18, 2026-07-19) and was not migrated; it already special-cases `elestiri` vs. asama inline rather than through the generic resolver |
| 17 | `scripts/planlama-baslat.mjs:raporYaz`, `'tamamlandi'` branch (line 161) | reads | `state.asamalar[a]` for `a` in `GERCEK_ASAMALAR` — own inline loop | no | intentional — iterating all 5 asamalar by construction, `birimStateOf` is a single-id lookup and would add no value here |
| 18 | `scripts/planlama-baslat.mjs:raporYaz`, `'elestiri-tamamlandi'` branch (line 169) | reads | `state.elestiri` — own inline access | no | same as row 16 — inline special-case instead of `birimStateOf(state,'elestiri')` |
| 19 | `scripts/planlama-baslat.mjs:raporYaz`, `'donduruldu'`/default branch (lines 290–305) | reads | **three-way own inline branch**: (a) `state.asamalar['master-plan']` for Layer-2 container block, (b) `aktifBolumBilgisi(state)` for an in-progress bölüm, (c) `state.asamalar[state.aktif_asama]` fallback | no | not a simple oversight — this branch resolves a case `birimStateOf` cannot: distinguishing a Layer-2 (whole-plan) block from a single-bölüm block, which requires container-level state `birimStateOf` doesn't expose |
| 20 | `scripts/planlama-baslat.mjs:geriYap` (line 358) | reads | own inline ternary: `bolumHedefMi ? state.asamalar['master-plan'].bolumler[hedef] : state.asamalar[hedef]` | no | duplicates two of `birimStateOf`'s three branches (asama, bölüm) but omits the `elestiri` branch entirely — geri-dönüş to `elestiri` is not a supported CLI operation, so the omission is currently harmless, but this is a second, incomplete copy of `birimStateOf`'s dispatch logic that would silently need updating if a 4th birim-kind were ever added |

### Derives

| # | Consumer | Role | State source | Via shared resolver? | If no, why not |
|---|---|---|---|---|---|
| 21 | `tools/planlamaBirimMotoru.mjs:birimAcikDurum` | derives | takes an explicit birim-state object (`birimler[birimId]`) + reads its `sorular_surum`, then reads the soru-paketi/yanıt artifacts via `tools/planlamaSorular.mjs` | — | n/a — this is itself one of the shared resolvers (see Summary #2); called by `planlamaLoopV2.mjs:acikDurum`, `planlamaBolumLoop.mjs` (`bolumWalkAdimAt`, `layer2Kontrol`), `elestiriPasi.mjs` |
| 22 | `tools/planlamaDurumOzeti.mjs:acikSoruDurumJenerik`/`acikSoruDurum` | derives | `state.aktif_asama` (own inline read) + delegates bölüm-case to `aktifBolumBilgisi` (row 24); re-implements the same paket/yanıt-butunluk/açık-soru logic as `birimAcikDurum` (row 21) independently rather than calling it | **no — this is the significant one** | not documented as intentional in-code; the module docstring frames this as sharing logic between CLI and browser (which it does — see rows 25, 29), but it is a *second, hand-written copy* of `birimAcikDurum`'s question-resolution algorithm with slightly different output shape (`acikBloker` vs `acikBlokerler`, added `atlanan`/`butunluk` fields) — see "Bugs found while mapping" |
| 23 | `tools/planlamaBolumLoop.mjs:aktifBolumBilgisi` (lines 59–64) | derives | `mp.durum`, `mp.bolumler`, `mp.aktif_bolum` — own inline read of the outer master-plan unit's fields | no | intentional per its own doc-comment (line 4: "planlamaDurumOzeti.mjs'nin acikSoruDurum sarmalayıcısı bunu kullanır") — it is *the* purpose-built helper for "is the bölüm-walk active", consumed by row 22 |
| 24 | `src/lib/registry.js:pipelineDurumFazHesapla` | derives | `state.aktif_asama`, `state.asamalar[asama]`, `state.elestiri?.durum` — own inline read | no | not flagged in-code as intentional vs. the CLI's parallel computation (row 16/`durumOzetiCikar`) — both answer "what's this project's current status" independently; see "Bugs found while mapping" |
| 25 | `tools/planlamaKartTuretici.mjs:asamaKartiUret`/`projeKartlariniTuret` | derives | `state.asamalar?.[asama]`, `state.elestiri` — own inline read, iterating `GERCEK_ASAMALAR` | no | card-shape construction, no natural single-id lookup to delegate to |
| 26 | `tools/planlamaKartTuretici.mjs:masterPlanKararBirimi` (lines 123–129) | derives | `mp.bolumler`, `mp.aktif_bolum`, `mp.durum` — own inline read, reading the **same three fields** as `aktifBolumBilgisi` (row 23) | no | **explicitly documented as intentional** in-code (lines 117–122): avoiding a circular import between `planlamaKartTuretici.mjs` and `planlamaBolumLoop.mjs`/`planlamaDurumOzeti.mjs` — flagged here per task instructions as exactly the "looks the same but is a separate copy" pattern, even though the author already knew and left a note |
| 27 | `tools/planlamaKartTuretici.mjs:kararKartiUret` | derives | `asamaState.durum`, `asamaState.sorular_surum` (parameter, caller-resolved) | n/a (given, not looked up) | takes an already-resolved birim-state object as a parameter; doesn't itself choose how to resolve it |
| 28 | `tools/planlamaIddiaDurumu.mjs:iddialariCozumle` (lines 229–260) | derives | `bolumState?.sorular_surum` — own inline read of a birim-state object passed in by the caller | no | takes a pre-resolved birim-state object, but does its own follow-on resolution (paket + yanıt-bütünlük) instead of delegating to `birimAcikDurum`/`acikSoruDurum`; called from `planlamaBolumLoop.mjs` (`kapiFnKur`, `provenansVerisiTopla`, `layer2Kontrol`) |
| 29 | `tools/planlamaBolumKapilari.mjs:bolumKapidanGecerMi` (bölüm gate/validator) | derives | receives `baglam` (pre-built by `planlamaBolumLoop.mjs:kapiFnKur`, itself an inline reader of `mp.bolumler[bolumId].sorular_surum` at line 322) — does not read `planlama-durum.json` state directly | no (indirect) | gate logic is intentionally decoupled from state-shape; but this means the gate's picture of "has this bölüm ever produced questions" is only as fresh as whatever `kapiFnKur` passed in, a second hop removed from the state file |
| 30 | `scripts/build-card-data.js` per-project loop (lines 392–439) — `anlikGoruntu.durum_etiketi` | derives | `state.asamalar[A]?.durum` for `A = state.aktif_asama` — **own inline read**, a third independent copy of "resolve the active unit's `durum`" (alongside `birimStateOf` and `durumOzetiCikar`) | no | not documented as intentional; this is the browser-facing snapshot writer's own copy, parallel to rows 16 and 20 |
| 31 | `scripts/build-card-data.js` (line 120) — registry `durum`/`faz` | derives | calls `pipelineDurumFazHesapla(stateYukle(...))` (row 24) | via row 24's own logic | this is the call site that makes row 24's output the canonical `registry.json` `durum`/`faz` — see "Bugs found while mapping" for why row 24 and row 16 can disagree |
| 32 | `scripts/build-card-data.js` (lines 420–434) — `sorular-<id>.json` open-question snapshot | derives | calls `acikSoruDurum(nsYolu, state)` (row 22) | via row 22's own logic | documented in-code (lines 328–330) as deliberately sharing one function with the CLI (row 33) — this is the "CLI and browser agree" guarantee the codebase explicitly engineers for, but it rests on row 22, which is itself a second copy relative to `birimAcikDurum` (row 21) |
| 33 | `scripts/planlama-baslat.mjs:durumOzetiCikar` (line 112) — CLI open-question display | derives | calls `acikSoruDurum(nsYolu, state)` (row 22) | via row 22's own logic | same function as row 32 — CLI and browser genuinely agree here, because both call row 22 rather than each rolling their own |

### Boundary / fallback case

| # | Consumer | Role | State source | Via shared resolver? | If no, why not |
|---|---|---|---|---|---|
| 34 | `src/lib/intakeBuilder.js:fazHesapla` (called from `src/views/ProjectView.jsx:184`, `src/views/PartnerView.jsx:271`) | derives (fallback only) | a raw `durum` string, using its **own** vocabulary (`PLANLAMA_DURUMLARI = {fikir, araştırma, premise, plan}`) — invoked only when `.faz` is absent from the already-derived object (`projeEtkin.faz`/`ozet.faz`) | no | see "Bugs found while mapping" — this vocabulary does not match the real pipeline's `durum` strings (`arastirma` vs `araştırma`, `master-plan` vs `plan`), so if this fallback is ever exercised against a real pipeline project it silently misclassifies faz |

---

## Card/panel build step — explicit confirmation

The task calibration specifically asks that this appear: **`scripts/build-card-data.js`**, lines
357–452 (per-project loop), is the card/panel build step. Its state source, per output file:

- `public/cards-<id>.json` ← `tools/planlamaKartTuretici.mjs:projeKartlariniTuret` (rows 25–27).
- `public/sorular-<id>.json` ← `tools/planlamaDurumOzeti.mjs:acikSoruDurum` (row 22) **plus** its
  own inline `state.asamalar[A]?.durum` read for `durum_etiketi` (row 30).
- `public/registry.json`'s `durum`/`faz` fields ← `src/lib/registry.js:pipelineDurumFazHesapla`
  (row 24), called at build-card-data.js line 120.
- `public/operator-<id>.json` ← does not touch pipeline-unit state; sourced from `signal.json`
  (a hand/agent-maintained sidecar file, not `planlama-durum.json`) — listed here only to confirm
  it was checked, not because it's a unit-state consumer.

None of these three output-writing paths call `birimStateOf`. `cards-<id>.json` and `sorular-
<id>.json` go through two *different* purpose-built derivers (rows 25–27 and 22, respectively);
`registry.json`'s durum/faz goes through a third (row 24). All three are independent
reimplementations of "what state is this project/unit in", not three callers of one function.

---

## Bugs found while mapping (NOT fixed — recorded per task instructions)

1. **`acikSoruDurumJenerik` (planlamaDurumOzeti.mjs, row 22) duplicates `birimAcikDurum`
   (planlamaBirimMotoru.mjs, row 21) instead of calling it.** Both take a birim-state object,
   read `sorular_surum`, load the soru-paketi, check yanıt-bütünlük, and split questions into
   open/blocker/deferred — but they are two separately-maintained implementations. They currently
   agree in behavior (verified by reading both), but nothing prevents them from drifting: a future
   fix to blocker-tier filtering in one (e.g. `birimAcikDurum`'s `acikBlokerler`) has no structural
   reason to also land in the other (`acikSoruDurumJenerik`'s `acikBloker` — note the field is even
   *named* differently, `acikBloker` vs `acikBlokerler`). This is the clearest instance of "two
   paths that look equivalent but are maintained as separate code."

2. **`pipelineDurumFazHesapla` (registry.js, row 24) and `durumOzetiCikar` (planlama-baslat.mjs,
   row 16) both answer "what is this project's current status" from the same three state fields
   (`aktif_asama`, `asamalar[asama].durum`, `elestiri.durum`), computed independently, with no
   shared helper and no cross-reference comment.** They currently produce compatible-but-different
   output shapes (registry.js: a `DURUM_YASAM`-indexed enum for sorting/badges; planlama-baslat.mjs:
   free-text Turkish CLI status lines) — so a literal test-for-equality isn't meaningful — but a
   *logic* change to how staleness or the elestiri-pending case is classified in one has no
   structural path to the other. Given that the whole point of the 2026-07-19 "Görev 2" fix
   (commit a8107e5) was making `durum`/`faz` build-time-derived-and-trustworthy instead of stale,
   having a second independent deriver of the same fact is the kind of thing that could silently
   reintroduce a CLI/browser disagreement.

3. **`fazHesapla` (intakeBuilder.js, row 34) uses a stale/mismatched vocabulary.**
   `PLANLAMA_DURUMLARI = new Set(['fikir', 'araştırma', 'premise', 'plan'])` — but the real pipeline
   emits `arastirma` (no diacritic) and `master-plan` (not `plan`), and also emits `genesis`/
   `strateji`/`tamamlandi`/`tamamlandi-elestiri-bekliyor`, none of which are in this set. Since
   `build-card-data.js` now unconditionally sets `.faz` on every registry project (row 31), this
   fallback is currently dead for registry-sourced pipeline projects (`ProjectView.jsx:184`'s
   `projeEtkin.faz ?? fazHesapla(...)` never reaches the fallback for those). It is *not* dead for
   the `operator.proje_meta`/`_demo-foya` code path (a different, non-pipeline durum vocabulary,
   where it's arguably correct) — but the function has no scoping/naming that signals "only valid
   for the demo-foya vocabulary, not the pipeline vocabulary," so a future call site could easily
   invoke it against a real pipeline `durum` and get a silently wrong `faz`.

4. **`geriYap`'s inline resolver (planlama-baslat.mjs, row 20) is a second, incomplete copy of
   `birimStateOf`'s dispatch** (asama/bölüm branches only, no `elestiri` branch). Currently harmless
   because `--geri` to `elestiri` isn't offered, but it means `birimStateOf`'s three-way dispatch
   (asama / bölüm / elestiri, tools/planlamaDurumMakinesiV2.mjs:158–162) has a second, physically
   separate two-way copy elsewhere that must be remembered and kept in sync if a fourth birim-kind
   is ever added, or if `--geri elestiri` is ever wired up.

---

## Test & fixture consumers (not given individual rows)

The following files import and call the shared resolvers/derivers listed above (`birimStateOf`,
`birimAcikDurum`, `acikSoruDurum`, `pipelineDurumFazHesapla`, `iddialariCozumle`, `stateYukle`,
`statePersist`) to build synthetic fixtures and assert behavior. They are consumers in the literal
sense (they do read/write `state.asamalar[...]` fields) but none of them reimplement resolution
logic independently — they all call into the same production functions rows 1–33 already cover, so
giving each its own row would restate the same "via shared resolver: yes" 25+ times without new
information:

`scripts/planlama-test-runner.mjs`, `scripts/planlama-bolum-test-runner.mjs`,
`scripts/planlama-elestiri-test-runner.mjs`, `scripts/planlama-fikir-duzeltme-test-runner.mjs`,
`scripts/planlama-kart-turetici-test-runner.mjs`, `scripts/planlama-priority-onarim-test-runner.mjs`,
`scripts/planlama-sarmalayici-test-runner.mjs`, `scripts/planlama-soru-test-runner.mjs`,
`scripts/planlama-tier-test-runner.mjs`, `scripts/registry-durum-faz-test.mjs`,
`scripts/soru-yanit-queue-test.mjs`, `scripts/soru-yanit-demo-setup.mjs`,
`scripts/planlama-soru-demo.mjs`, `scripts/planlama-prompt-intake-proof.mjs`,
`scripts/planlama-bolum-fikstur.mjs`, `scripts/planlama-soru-fikstur.mjs`,
`scripts/planlama-test-fikstur.mjs`, `scripts/canli-genesis-pilot.mjs`,
`scripts/canli-genesis-v2-pilot.mjs`, `scripts/canli-premise-pilot.mjs`,
`scripts/canli-kalan-asamalar.mjs`, `scripts/canli-loop-entegre.mjs`,
`scripts/claude-retry-fault-injection-test.mjs`, `scripts/verify-slice1.mjs`.

**Verified exception, worth naming:** `scripts/registry-durum-faz-test.mjs` specifically re-runs
`pipelineDurumFazHesapla` (row 24) against the *real* `planlama-durum.json` of the 6 live projects
under `$META_DATA_ROOT/projeler/` (per its own commit message, a8107e5) — this is closer to a
regression oracle for row 24 than a synthetic fixture, but it still calls the production function
rather than duplicating its logic, so it stays in this list rather than getting its own row.

**Criterion used:** a test file gets promoted to its own numbered row only if it *reimplements*
state-resolution logic rather than calling the shared functions. None found; if one is added later,
re-run the greps below and check.

---

## How I found this

Commands are copy-pasteable from the repo root (`/Users/kasimecer/dev/meta-layer-dashboard`) and
regenerate the candidate list — re-run them to see what's changed since 2026-07-19.

```bash
# 0. Orientation — recent commits that touched unit-state resolution (the seed for this whole task)
git log --oneline -20

# 1. Find the canonical resolver and confirm its current call sites
grep -rn "birimStateOf" --include="*.mjs" --include="*.js" -l . | grep -v node_modules

# 2. Find every file that touches the on-disk state file or its load/persist functions
grep -rln "planlama-durum.json" --include="*.mjs" --include="*.js" . | grep -v node_modules
grep -rln "stateYukle\|statePersist" --include="*.mjs" --include="*.js" . | grep -v node_modules

# 3. Find every file that reads/writes specific unit-state fields directly (bypassing any resolver)
grep -rln "state\.asamalar\[\|state\.elestiri\|\.bolumler\[\|birimIlerlet\|birimBayatMi\|birimGeriDon\|birimUst\b" \
  --include="*.mjs" --include="*.js" --include="*.jsx" . | grep -v node_modules

# 4. Find every file that touches kapi_sonuc / aktif_asama specifically (progress + status fields)
grep -rln "kapi_sonuc" --include="*.mjs" --include="*.js" --include="*.jsx" . | grep -v node_modules
grep -rln "aktif_asama" --include="*.mjs" --include="*.js" --include="*.jsx" . | grep -v node_modules

# 5. Find the project-level (registry/build) derivers
grep -rln "pipelineDurumFazHesapla" --include="*.mjs" --include="*.js" --include="*.jsx" . | grep -v node_modules
grep -n "^export function\|^export const" src/lib/registry.js

# 6. Find the card/panel build step and what it imports (confirms scripts/build-card-data.js is
#    the card/panel build step, and lists everything it pulls unit state through)
sed -n '1,10p' scripts/build-card-data.js

# 7. Confirm the look-alike "Kart" state machine is a different system (scope boundary check).
#    Expect near-zero overlap with the step-2/3 file list; `comm -12` finds the intersection.
grep -rln "stateMachine" --include="*.mjs" --include="*.js" --include="*.jsx" . | grep -v node_modules | sort > /tmp/kart_files.txt
grep -rln "state\.asamalar\[\|state\.elestiri\|\.bolumler\[\|birimIlerlet\|birimBayatMi\|birimGeriDon\|birimUst\b" \
  --include="*.mjs" --include="*.js" --include="*.jsx" . | grep -v node_modules | sort > /tmp/birim_files.txt
comm -12 /tmp/kart_files.txt /tmp/birim_files.txt
# → only tools/planlamaKartTuretici.mjs, and only because its docstring *mentions* stateMachine.js's
#   shape in a comment (it does not import it) — confirms the two systems are not code-coupled.
#   (src/lib/intakeBuilder.js, src/views/ProjectView.jsx, src/views/PartnerView.jsx bridge the two
#   systems too, but via `fazHesapla`, not via `stateMachine.js` itself — see row 34.)

# 8. Distinguish test/fixture consumers that call the shared resolvers from ones that don't
grep -rln "birimStateOf\|birimAcikDurum\|acikSoruDurum\|pipelineDurumFazHesapla\|iddialariCozumle" scripts/*test*.mjs

# 9. Spot-check for stale/mismatched vocabulary (the fazHesapla finding)
grep -n "fazHesapla" --include="*.mjs" --include="*.js" --include="*.jsx" -r . | grep -v node_modules
```

Everything else in this document (line numbers, "why not" reasoning, which branch of which function
reads which field) came from reading the following files in full, not from grep alone:
`tools/planlamaDurumMakinesiV2.mjs`, `tools/planlamaBirimMotoru.mjs`, `tools/planlamaLoopV2.mjs`,
`tools/planlamaBolumLoop.mjs`, `tools/elestiriPasi.mjs`, `tools/planlamaDurumOzeti.mjs`,
`tools/planlamaKartTuretici.mjs`, `tools/planlamaIddiaDurumu.mjs`, `tools/planlamaBolumKapilari.mjs`,
`src/lib/registry.js`, `src/lib/intakeBuilder.js`, `src/lib/stateMachine.js`,
`scripts/build-card-data.js`, `scripts/planlama-baslat.mjs` (full file, 536 lines),
`scripts/soru-yanit-queue-watch.mjs`, `src/views/ProjectView.jsx`, `src/views/PartnerView.jsx`,
`src/views/SoruYanitView.jsx` (relevant sections), `src/components/Badges.jsx`,
`tools/seamReconcile.mjs` / `scripts/seam-reconcile.mjs`, `scripts/masterPlanBolucu.mjs`,
`scripts/kararWire.mjs` (heads, for the scope-boundary check).
