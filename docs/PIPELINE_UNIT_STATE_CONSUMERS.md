# Pipeline-Unit State — Consumer Inventory

**Status:** map of the codebase, kept current. Originally written as a READ-ONLY inventory at
commit `fd7eb18c4cee1987b95bb904a790a248fba2f180` (2026-07-19); **updated the same day** as part of
a follow-up task that actually rewired the panel-build chain (below), so the "via shared resolver?"
column reflects real code changes, not just a plan. Every row is either connected or carries an
explicit, verified reason it stays separate — see "2026-07-19 update" immediately below.

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
findings. `src/lib/intakeBuilder.js:fazHesapla` sits on the boundary (see row 34 below) and *is*
listed because it is genuinely invoked with pipeline-derived data in one call site.

**Row count:** 33 production-code consumers that touch the state object directly (rows 1–33) + 2
new rows added by the 2026-07-19 update (35–36, leftover-visibility) + 1 boundary/fallback consumer
one hop removed from the state object (row 34, `fazHesapla`) + 1 explicitly-excluded look-alike
system (above) + a compact list of test/fixture consumers (§ Test & fixture consumers).

---

## 2026-07-19 update — panel routed through the shared resolver, blind spot closed

Follow-up task: route `scripts/build-card-data.js` (the panel/card build step) through
`birimStateOf`, close the structural blind spot where a project whose active stage is `tamamlandi`
but whose Kritik Pasaj (elestiri) review is still pending (`onay-bekliyor`/`donduruldu`) showed
`"soru_turu":"yok"` — the operator could not see the pending go/no-go/pivot decision — and make
walk-deferred leftover candidates visible. **Files actually changed** (verified via `git diff
--stat`; nothing else touched): `tools/planlamaDurumOzeti.mjs`, `tools/planlamaKartTuretici.mjs`,
`tools/planlamaBolumLoop.mjs` (one function only — `aktifBolumBilgisi`), `scripts/planlama-
baslat.mjs`, `scripts/build-card-data.js`, `src/views/ProjectView.jsx`, `src/views/
SoruYanitView.jsx`, `package.json` (new test script), plus new file `scripts/planlama-
tamamlandi-korluk-test-runner.mjs`. **Deliberately NOT touched** (see reasons on the affected rows
below): `tools/planlamaLoopV2.mjs`, `tools/planlamaBirimMotoru.mjs`, `tools/elestiriPasi.mjs`,
`tools/planlamaBolumLoop.mjs`'s write paths (`bolumWalkAdimAt`, `layer2VeSonrasi`, `outerOnayIsle`,
`bolumeGeriDon`), `src/lib/registry.js`, `src/lib/intakeBuilder.js` — all of these are either the
live walk/gate engine (out of scope: "do not change walk/deferral behavior") or carry a genuine
technical blocker (browser-bundle safety, for `registry.js`).

**What changed, row by row:** rows 3, 4, 5, 6, 7, 8, 9, 21 unchanged (canonical or live-engine,
untouched, existing reasons stand). Rows **16, 17, 18, 19, 20** (CLI display, `scripts/planlama-
baslat.mjs`) now route through `birimStateOf` — connected. Row **22** (`acikSoruDurum`) now
resolves its birim-state lookups via `birimStateOf` **and** closes the `tamamlandi` blind spot —
partially connected (state acquisition yes; the open-question *algorithm* itself is still a
separate implementation from `birimAcikDurum`, reason below). Row **23** (`aktifBolumBilgisi`) now
connected. Rows **25, 26, 27** (card-generator, `planlamaKartTuretici.mjs`) now connected — row 26's
"avoid circular import" problem is resolved outright (uses `birimStateOf`, already imported from
the same module as `GERCEK_ASAMALAR`, so no new module edge is added). Row **30** (`build-card-
data.js` inline `durum_etiketi`) now connected, and additionally fixed to reflect elestiri's durum
when `aktif_asama==='tamamlandi'` instead of going `null`. Rows **31, 32, 33** behaviorally fixed
(the functions they call, rows 24 and 22, now produce correct output for the blind-spot case) —
resolver-routing status unchanged (24 stays inline for a verified reason; 22 is now partial).
Row **24** (`pipelineDurumFazHesapla`) — considered, **not** touched; reason below. Row **28, 29**
— considered, **not** touched (their call sites live inside the untouched live-engine parts of
`planlamaBolumLoop.mjs`); reasons tightened below. Row **34** (`fazHesapla`) — considered, **not**
touched (stale vocabulary confirmed real but currently dead for pipeline data; reason below). New
rows **35, 36** added for the leftover-visibility aggregator.

---

## Summary

- **Total production consumers touching the state object directly: 35** (33 original + 2 new
  leftover-visibility rows) — writes: **9**, reads: **11**, derives: **15**. Plus **1**
  boundary/fallback consumer (row 34, `fazHesapla`) one hop removed from the state object.
- **Consumers with at least one non-resolver-routed aspect, after this update: 11 of 35** — the 7
  untouched live-engine write paths (rows 3–9), the two verified-blocked engine-adjacent reads
  (rows 28, 29 — their call sites live inside the untouched engine), the one verified
  browser-bundle-safety case (row 24), and row 22 (partial: state *acquisition* is now connected,
  the open-question *algorithm* remains a documented, justified duplicate — see its row).
  **Every one of these 11 carries a written, verified reason**; none are silent gaps. Row 34 stays
  not-applicable/reasoned (legacy vocabulary, verified dead for pipeline data).
- **Distinct resolution mechanisms found: 8** (calibration floor was 4) — unchanged in count, but
  three of them (`acikSoruDurum`, the card-generator, and the CLI display layer) now sit *on top of*
  `birimStateOf` for their state acquisition instead of bypassing it — they remain distinct
  *algorithms* (different output shapes for different purposes: gate decision vs. CLI text vs.
  browser JSON vs. card objects), which is why they're still separately listed, but they no longer
  independently decide *how to find* a birim's state object, only *what to do with it*.
- **The card/panel build step** is `scripts/build-card-data.js`, specifically the per-project loop
  (originally lines 357–452, now longer after this update) that writes `public/cards-<id>.json`
  (via `projeKartlariniTuret`, now `birimStateOf`-routed), `public/sorular-<id>.json` (via
  `acikSoruDurum`, now `birimStateOf`-routed **and** `tamamlandi`-aware, plus the new leftover
  aggregator), and `public/registry.json`'s `durum`/`faz` (via `pipelineDurumFazHesapla`,
  unchanged, proven byte-identical for all 6 real projects — see report).

---

## Inventory

Columns: **Consumer** (file:symbol) · **Role** · **State source** (named path) · **Via shared
resolver?** · **If no, why not**.

### Writers

| # | Consumer | Role | State source | Via shared resolver? | If no, why not |
|---|---|---|---|---|---|
| 1 | `tools/planlamaBirimMotoru.mjs:birimKostur` | writes | mutates `birimler[birimId]` (caller-supplied map — `state.asamalar` or `mp.bolumler` or `{elestiri: state.elestiri}`) directly: `durum`, `cikti_pointer`, `surum`, `kabul_edilen_ust_surum`, `tuketilen_ust_yanit_surum`, `kapi_sonuc`, `blok_nedeni`, `duzeltme_uyarilari`, `sorular_surum` | — (this **is** the canonical write path for the "execute a unit" transition) | n/a — canonical. Not touched by the 2026-07-19 update (live engine). |
| 2 | `tools/planlamaBirimMotoru.mjs:birimGeriDon` | writes | mutates `birimler[hedef]` directly: `durum='bekliyor'`, `kapi_sonuc=null`, `blok_nedeni=null`, `sorular_surum=null` | — (canonical write path for the "geri-dönüş" transition) | n/a — canonical. Not touched. |
| 3 | `tools/planlamaLoopV2.mjs:ileriMod` (inline, lines ~276–339) | writes | mutates `state.asamalar[A]` directly: `durum`, `kapi_sonuc`, `blok_nedeni`, `sorular_surum` (recovery-from-`donduruldu` and onay/approval transitions) | no | intentional — these are the "re-validate on re-invocation" and "human approval" transitions, which are *not* the "execute" transition `birimKostur` owns; no shared writer exists for them, each covers a disjoint set of `durum` transitions. **2026-07-19: deliberately NOT touched** — this is the live walk engine; the task's "do not change walk/deferral behavior" constraint applies directly. `state.asamalar[A]` here *could* mechanically become `birimStateOf(state, A)` (verified identical reference), but the file was left untouched to keep the engine diff at zero. |
| 4 | `tools/planlamaLoopV2.mjs:ileriMod` mod=`'tut'` block (lines ~193–226) | writes | mutates `state.asamalar[A]` directly: `kabul_edilen_ust_surum`, `durum='gecti'`, `kapi_sonuc`, `blok_nedeni` | no | intentional — "olduğu-gibi-kabul" (accept-as-is) is its own transition, no LLM call, deliberately bypasses `birimKostur`. **2026-07-19: not touched**, same reasoning as row 3. |
| 5 | `tools/planlamaBolumLoop.mjs:bolumWalkAdimAt` (inline, lines ~466–530) | writes | mutates `mp.bolumler[B]` directly: `durum`, `kapi_sonuc`, `blok_nedeni`, `sorular_surum` (bölüm-level recovery/onay, mirrors row 3 one level down) | no | intentional, same reasoning as row 3, duplicated at bölüm granularity. **2026-07-19: not touched** — note that a *different, read-only* function in this same file (`aktifBolumBilgisi`, row 23) *was* touched; this write path deliberately was not, to keep the live walk untouched while still fixing the read-only display helper. |
| 6 | `tools/planlamaBolumLoop.mjs:layer2VeSonrasi` (lines 385–426) | writes | mutates `mp` (the **outer** master-plan unit, i.e. `state.asamalar['master-plan']`) directly: `surum`, `cikti_pointer`, `blok_nedeni`, `sorular_surum`, `durum='onay-bekliyor'`, `kabul_edilen_ust_surum` | no | **historical, previously a real bug** — code comment at lines 410–418 records that `kabul_edilen_ust_surum` was never written here before a 2026-07-16 fix because the outer master-plan record never passes through `birimKostur` (only its 15 sub-bölümler do); this was fixed by writing it directly here rather than routing through a shared writer. **2026-07-19: not touched** (live engine). |
| 7 | `tools/planlamaBolumLoop.mjs:outerOnayIsle` (lines 430–454) | writes | mutates `mp` directly: `durum='gecti'`, `kapi_sonuc='gecti'`, `blok_nedeni=null` | no | same reasoning as row 6 — outer master-plan unit's final-approval transition, no shared writer covers it. **2026-07-19: not touched.** |
| 8 | `tools/planlamaBolumLoop.mjs:bolumeGeriDon` (lines 588–599) | writes | calls `birimGeriDon` (row 2) for `mp.bolumler[hedef]`, **then** additionally mutates `mp.durum='kosuyor'`, `mp.kapi_sonuc=null`, `mp.blok_nedeni=null`, and possibly `state.aktif_asama` directly | partial | the sub-bölüm write goes through `birimGeriDon`; the container (`mp`)-level bookkeeping after it is inline, because `birimGeriDon`'s contract only knows about one `sira`/`birimler` map at a time and the outer container isn't in that map. **2026-07-19: not touched.** |
| 9 | `tools/elestiriPasi.mjs:elestiriAdimAt` (inline, lines ~246–277) | writes | mutates `state.elestiri` directly: `durum`, `kapi_sonuc`, `blok_nedeni`, `sorular_surum` (recovery + onay transitions, elestiri-level mirror of row 3); the "execute" transition inside the same function delegates to `birimKostur` (row 1) | mixed | same reasoning as row 3, one more level of duplication (asama/bölüm/elestiri each have their own copy of the "re-validate + human-approval" transition logic). **2026-07-19: not touched** — this is the exact unit whose *read* side (via row 22) got the blind-spot fix; its *write* side (this row) was deliberately left alone. |

### Readers

| # | Consumer | Role | State source | Via shared resolver? | If no, why not |
|---|---|---|---|---|---|
| 10 | `tools/planlamaDurumMakinesiV2.mjs:stateYukle` / `statePersist` | reads/writes (disk I/O) | `planlama-durum.json` on disk, parsed via `normalizeState` | — | n/a — this is the disk-boundary itself, the root of every other path. Not touched. |
| 11 | `scripts/soru-yanit-queue-watch.mjs:gonderimiIsle` (line 94) | reads | `birimStateOf(state, asama)` — `.sorular_surum` compared against submitted queue entry's `surum` | **yes** | — |
| 12 | `scripts/planlama-baslat.mjs:birimPaketiVeYanitlarOf` (line 47) | reads | `birimStateOf(state, id)` | **yes** | — |
| 13 | `scripts/planlama-baslat.mjs:seceneklerYaz`→ call site (inside `raporYaz`) | reads | `birimStateOf(state, a)` | **yes** | — |
| 14 | `scripts/planlama-baslat.mjs:raporYaz`, `'sorular-acik'` branch | reads | `birimStateOf(state, a)?.duzeltme_uyarilari` | **yes** | — |
| 15 | `scripts/planlama-baslat.mjs:raporYaz`, `'bayat-karar'` branch | reads | `birimStateOf(state, a)` | **yes** | — |
| 16 | `scripts/planlama-baslat.mjs:durumOzetiCikar` | reads | **2026-07-19: now** `birimStateOf(state, 'elestiri')` and `birimStateOf(state, A)` (was: `state.elestiri`, `state.asamalar[A]` inline) | **yes** | — (previously "no — historical, predates the `birimStateOf` extraction"; migrated in this update) |
| 17 | `scripts/planlama-baslat.mjs:raporYaz`, `'tamamlandi'` branch | reads | **2026-07-19: now** `birimStateOf(state, a)` for `a` in `GERCEK_ASAMALAR` (was: `state.asamalar[a]` inline loop) | **yes** | — |
| 18 | `scripts/planlama-baslat.mjs:raporYaz`, `'elestiri-tamamlandi'` branch | reads | **2026-07-19: now** `birimStateOf(state, 'elestiri')` (was: `state.elestiri` inline) | **yes** | — |
| 19 | `scripts/planlama-baslat.mjs:raporYaz`, `'donduruldu'`/default branch | reads | **2026-07-19: now** `birimStateOf(state, 'master-plan')`, `birimStateOf(state, bilgi.bolumId)`, `birimStateOf(state, a)` (was: three-way inline branch reading `state.asamalar[...]` directly) — the three-way *branching logic itself* (Layer-2 container vs. in-progress bölüm vs. plain aşama) is unchanged, only the leaf field-lookups now go through the resolver | **yes** | — (the branch-selection logic still can't be replaced by a single `birimStateOf` call — that's inherent to the question being asked, not a gap — but every leaf lookup is now resolver-routed) |
| 20 | `scripts/planlama-baslat.mjs:geriYap` | reads | **2026-07-19: now** `birimStateOf(state, hedef)` unconditionally (was: `bolumHedefMi ? state.asamalar['master-plan'].bolumler[hedef] : state.asamalar[hedef]`) | **yes** | — this also incidentally closes the previously-flagged "incomplete copy, no `elestiri` branch" gap: `birimStateOf`'s three-way dispatch is now used directly instead of a hand-written two-way copy |

### Derives

| # | Consumer | Role | State source | Via shared resolver? | If no, why not |
|---|---|---|---|---|---|
| 21 | `tools/planlamaBirimMotoru.mjs:birimAcikDurum` | derives | takes an explicit birim-state object (`birimler[birimId]`) + reads its `sorular_surum`, then reads the soru-paketi/yanıt artifacts via `tools/planlamaSorular.mjs` | — | n/a — this is itself one of the shared resolvers (see Summary #2); called by `planlamaLoopV2.mjs:acikDurum`, `planlamaBolumLoop.mjs` (`bolumWalkAdimAt`, `layer2Kontrol`), `elestiriPasi.mjs`, and (2026-07-19, new) `tools/planlamaDurumOzeti.mjs:projeLeftoverOzetiCikar` (row 35). Not touched — its contract (return shape) is load-bearing for live gate decisions, so it was extended by nothing, only given a new *caller*. |
| 22 | `tools/planlamaDurumOzeti.mjs:acikSoruDurumJenerik`/`acikSoruDurum` | derives | **2026-07-19: now** `birimStateOf(state, A)` / `birimStateOf(state, bilgi.bolumId)` / `birimStateOf(state, 'elestiri')` (was: `state.aktif_asama` + `state.asamalar?.[A]` inline) for state acquisition; **also fixed**: `aktif_asama==='tamamlandi'` no longer unconditionally returns `null` — it now checks `birimStateOf(state,'elestiri').durum` and delegates to the same per-unit resolution when elestiri is `onay-bekliyor`/`donduruldu` (still returns `null`, truthfully, when elestiri is `bekliyor`/`gecti`) | **partial — yes for acquisition, no for algorithm** | state acquisition is now connected (see left column). The open-question *algorithm* itself (paket load → yanıt-bütünlük check → open/blocker/deferred split) remains a separate, hand-written implementation from `birimAcikDurum` (row 21) rather than calling it. **Verified reason this stays separate:** the two functions have materially different return shapes for different purposes — `birimAcikDurum` returns a gate-decision shape (`engelli` boolean, no `paket`/`atlanan` fields) consumed by the *live* walk/gate engine (rows 3–9), while `acikSoruDurumJenerik` returns a display shape (`paket`, `atlanan`, `butunluk` string) consumed by the CLI and browser (rows 32, 33). Merging them would require either reshaping `birimAcikDurum`'s contract (risk to the live gate — out of scope for a visibility-only task) or duplicating logic anyway inside a shape-adapter; the duplication is real (see "Bugs found while mapping" #1, still open) but deliberately not resolved by this task. |
| 23 | `tools/planlamaBolumLoop.mjs:aktifBolumBilgisi` | derives | **2026-07-19: now** `birimStateOf(state, 'master-plan')` (was: `state.asamalar[MP]` inline) | **yes** | — this is the one function touched in `planlamaBolumLoop.mjs`; everything else in that file (the live walk/gate engine — rows 5, 6, 7, 8, 28, 29) was deliberately left untouched |
| 24 | `src/lib/registry.js:pipelineDurumFazHesapla` | derives | `state.aktif_asama`, `state.asamalar[asama]`, `state.elestiri?.durum` — own inline read | no | **considered and deliberately NOT touched, 2026-07-19 — verified technical reason, not laziness.** `registry.js`'s own header comment states it is a *pure* function with zero I/O so it can run safely inside the browser bundle. `tools/planlamaDurumMakinesiV2.mjs` (where `birimStateOf` lives) imports Node's `fs` (`readFileSync`/`writeFileSync`/`existsSync`/`mkdirSync`) at module scope. Confirmed by grep that **no file under `src/` currently imports anything from `tools/`**, and `vite.config.js` has no Node-polyfill plugin configured — importing `birimStateOf` here would be the first such edge and risks breaking (or silently mis-bundling) the Vite browser build that `registry.js` is explicitly designed to be safe in. Equivalence was proven instead (see report): output byte-identical for all 6 real projects, before/after this task's other changes. |
| 25 | `tools/planlamaKartTuretici.mjs:asamaKartiUret`/`projeKartlariniTuret` | derives | **2026-07-19: now** `birimStateOf(state, asama)` / `birimStateOf(state, 'elestiri')` (was: `state.asamalar?.[asama]`, `state.elestiri` inline), still iterating `GERCEK_ASAMALAR` | **yes** | — iteration over all 5 asamalar is inherent to building a full card list (not something a single-id lookup replaces), but each per-id lookup inside the loop is now resolver-routed |
| 26 | `tools/planlamaKartTuretici.mjs:masterPlanKararBirimi` | derives | **2026-07-19: now** `birimStateOf(state, mp.aktif_bolum)` (was: `mp.bolumler[mp.aktif_bolum]` inline, justified in-code as avoiding a circular import with `planlamaBolumLoop.mjs`) | **yes** | — the previously-documented "avoid circular import" reason is now moot: `birimStateOf` is imported from `planlamaDurumMakinesiV2.mjs`, the *same module* this file already imports `GERCEK_ASAMALAR` from, so routing through it adds no new module edge and carries no cycle risk. Function signature changed to accept `state` (was `asama, asamaState` only) — sole call site (`projeKartlariniTuret`, same file) updated accordingly. |
| 27 | `tools/planlamaKartTuretici.mjs:kararKartiUret` | derives | `asamaState.durum`, `asamaState.sorular_surum` (parameter, caller-resolved) | n/a (given, not looked up) | takes an already-resolved birim-state object as a parameter; doesn't itself choose how to resolve it. Its caller (row 25/26) now resolves that parameter via `birimStateOf`, so this row is transitively connected. |
| 28 | `tools/planlamaIddiaDurumu.mjs:iddialariCozumle` | derives | `bolumState?.sorular_surum` — own inline read of a birim-state object passed in by the caller | no | takes a pre-resolved birim-state object; does its own follow-on resolution (paket + yanıt-bütünlük) instead of delegating to `birimAcikDurum`/`acikSoruDurum`. **2026-07-19: not touched** — its callers (`kapiFnKur`, `provenansVerisiTopla`, `layer2Kontrol`, all in `planlamaBolumLoop.mjs`) are part of the live walk/gate engine, which was deliberately left untouched in this update (only the unrelated, read-only `aktifBolumBilgisi` in the same file was touched — see row 23). |
| 29 | `tools/planlamaBolumKapilari.mjs:bolumKapidanGecerMi` (bölüm gate/validator) | derives | receives `baglam` (pre-built by `planlamaBolumLoop.mjs:kapiFnKur`, itself an inline reader of `mp.bolumler[bolumId].sorular_surum`) — does not read `planlama-durum.json` state directly | no (indirect) | gate logic is intentionally decoupled from state-shape. **2026-07-19: not touched** — `kapiFnKur` runs inside the live gate-decision path during real bölüm execution; changing its state-acquisition (even to a verified-identical `birimStateOf` call) was judged out of scope for a visibility-only task. |
| 30 | `scripts/build-card-data.js` per-project loop — `anlikGoruntu.durum_etiketi` | derives | **2026-07-19: now** `birimStateOf(state, 'elestiri')?.durum` when `aktif_asama==='tamamlandi'`, else `birimStateOf(state, state.aktif_asama)?.durum` (was: `state.asamalar[A]?.durum`, and was unconditionally `null` when `tamamlandi`) | **yes** | — closes part of the blind spot directly: an operator can now see `durum_etiketi: "onay-bekliyor"` for a pending elestiri instead of `null` |
| 31 | `scripts/build-card-data.js` — registry `durum`/`faz` | derives | calls `pipelineDurumFazHesapla(stateYukle(...))` (row 24) | via row 24's own logic | unchanged call site; row 24 itself was deliberately not touched (see its reason) — proven byte-identical output for all 6 real projects |
| 32 | `scripts/build-card-data.js` — `sorular-<id>.json` open-question snapshot | derives | calls `acikSoruDurum(nsYolu, state)` (row 22) — **2026-07-19: the `if (state.aktif_asama !== 'tamamlandi')` guard around this call was removed**; `acikSoruDurum` itself now decides, correctly, when there's nothing to show | via row 22's own logic | this is the exact call site that produced the reported bug (`fotball-podcast-2026-07-09` showing `"soru_turu":"yok"` despite a pending elestiri decision) — now fixed; see report for the before/after JSON |
| 33 | `scripts/planlama-baslat.mjs:durumOzetiCikar` — CLI open-question display | derives | calls `acikSoruDurum(nsYolu, state)` (row 22) | via row 22's own logic | same function as row 32 — CLI and browser genuinely agree, because both call row 22 rather than each rolling their own. The CLI's `durumOzetiCikar` *also* had its own separate `tamamlandi`+elestiri special-case (lines 88–101, pre-existing) that already showed the pending elestiri decision in prose form — this is *why* the CLI never had this blind spot, only the browser did (row 32, pre-fix) |
| 35 | `tools/planlamaDurumOzeti.mjs:projeLeftoverOzetiCikar` (**new**, 2026-07-19) | derives | `birimStateOf(state, id)` for every candidate unit id (5 asamalar + `elestiri` + up to 15 bölüm ids, gated on `birimStateOf(state,'master-plan')?.bolumler` existing), then `birimAcikDurum(nsYolu, {[id]: bs}, id)` (row 21) per unit, reading only its `.acikErtelenen` field | **yes** | — added for "leftover visibility" (task item 4); reuses `birimStateOf` and `birimAcikDurum` (both pre-existing shared resolvers) with **zero new resolution logic** — does not touch walk/deferral production code, read-only |
| 36 | `scripts/build-card-data.js` — `sorular-<id>.json` `leftover_by_unit` field (**new**, 2026-07-19) | derives | calls `projeLeftoverOzetiCikar(nsYolu, state)` (row 35) | via row 35's own logic | wrapped in its own try/catch so a corrupt packet in one project can't break the open-question snapshot written just above it in the same loop iteration |

### Boundary / fallback case

| # | Consumer | Role | State source | Via shared resolver? | If no, why not |
|---|---|---|---|---|---|
| 34 | `src/lib/intakeBuilder.js:fazHesapla` (called from `src/views/ProjectView.jsx:184`, `src/views/PartnerView.jsx:271`) | derives (fallback only) | a raw `durum` string, using its **own** vocabulary (`PLANLAMA_DURUMLARI = {fikir, araştırma, premise, plan}`) — invoked only when `.faz` is absent from the already-derived object (`projeEtkin.faz`/`ozet.faz`) | no | **considered and deliberately NOT touched, 2026-07-19.** Confirmed (by tracing both real call sites): for registry-sourced pipeline projects, `build-card-data.js` (row 31) unconditionally sets `.faz` via `pipelineDurumFazHesapla`, so `ProjectView.jsx:184`'s fallback branch (`projeEtkin.faz ?? fazHesapla(...)`) never actually executes for pipeline data — the vocabulary mismatch (`arastirma` vs. `araştırma`, `master-plan` vs. `plan`) is real but currently dead-in-practice. The fallback *is* live for the unrelated `operator.proje_meta`/`_demo-foya` path, which uses its own non-pipeline durum vocabulary (`build`, etc.) — correctly, since `fazHesapla`'s `Set` was written for that domain. Not routed through `birimStateOf` because it doesn't operate on pipeline state at all (it takes a bare string). Left as a documented latent risk — see "Bugs found while mapping" #3. |

---

## Card/panel build step — explicit confirmation

**`scripts/build-card-data.js`**, per-project loop (`if (existsSync(projelerDir))` block), is the
card/panel build step. Its state source, per output file, **after the 2026-07-19 update**:

- `public/cards-<id>.json` ← `tools/planlamaKartTuretici.mjs:projeKartlariniTuret` (rows 25–27),
  now `birimStateOf`-routed.
- `public/sorular-<id>.json` ← `tools/planlamaDurumOzeti.mjs:acikSoruDurum` (row 22, now
  `birimStateOf`-routed and `tamamlandi`-aware) **plus** its own inline `durum_etiketi` field (row
  30, now `birimStateOf`-routed) **plus** the new `leftover_by_unit` field (rows 35–36).
- `public/registry.json`'s `durum`/`faz` fields ← `src/lib/registry.js:pipelineDurumFazHesapla`
  (row 24, unchanged — browser-bundle-safety reason above), called at build-card-data.js's registry
  block. Proven byte-identical output for all 6 real projects before/after this task (see report).
- `public/operator-<id>.json` ← does not touch pipeline-unit state; sourced from `signal.json`
  (a hand/agent-maintained sidecar file, not `planlama-durum.json`) — listed here only to confirm
  it was checked, not because it's a unit-state consumer.

All three state-bearing output paths now acquire their birim-state objects through `birimStateOf`.
They remain three separate *algorithms* on top of that shared acquisition (card objects vs. CLI/
browser open-question display vs. registry durum/faz enum) — see Summary for why that's judged
correct rather than a remaining gap.

---

## Bugs found while mapping — status after 2026-07-19 update

1. **`acikSoruDurumJenerik` (planlamaDurumOzeti.mjs, row 22) duplicates `birimAcikDurum`
   (planlamaBirimMotoru.mjs, row 21) instead of calling it.** **STILL OPEN — deliberately not
   merged** (see row 22's reason: different return shapes for different purposes; merging risks the
   live gate engine). State *acquisition* was fixed (now via `birimStateOf`); the open-question
   *algorithm* duplication itself remains. Both currently agree in behavior (re-verified after this
   update, including against real `fotball-podcast-2026-07-09` data), but nothing structurally
   prevents future drift.

2. **`pipelineDurumFazHesapla` (registry.js, row 24) and `durumOzetiCikar` (planlama-baslat.mjs,
   row 16) both answer "what is this project's current status" independently.** **PARTIALLY
   NARROWED.** `durumOzetiCikar` (row 16) is now `birimStateOf`-routed for its state acquisition,
   same as `pipelineDurumFazHesapla` would need to be — but `pipelineDurumFazHesapla` itself was
   *not* touched (browser-bundle-safety reason, row 24), so the two functions still independently
   decide the *classification logic* (e.g., how `tamamlandi`+pending-elestiri maps to a label), even
   though both now read the underlying fields through equivalent means. Not a regression from this
   task; the duplication predates it and is now better-documented (row 24's reason is a real
   technical constraint, not an oversight).

3. **`fazHesapla` (intakeBuilder.js, row 34) uses a stale/mismatched vocabulary.** **STILL OPEN,
   confirmed still dead-for-pipeline-data** (traced both real call sites this session — see row 34).
   Not fixed: changing the `Set` risks the unrelated, currently-correct `_demo-foya` code path, and
   is out of scope for a visibility-only task.

4. **`geriYap`'s inline resolver (planlama-baslat.mjs, row 20) was a second, incomplete copy of
   `birimStateOf`'s dispatch.** **FIXED, 2026-07-19.** `geriYap` now calls `birimStateOf(state,
   hedef)` directly instead of a hand-written two-way ternary — the previously-missing `elestiri`
   branch is now present for free (still not reachable via any current CLI flag, but no longer a
   landmine for a future one).

**New finding from this update:** none beyond the above — the leftover-visibility aggregator (rows
35–36) was written to reuse `birimStateOf` + `birimAcikDurum` exactly, specifically to avoid adding
a 9th resolution mechanism.

---

## Test & fixture consumers (not given individual rows)

The following files import and call the shared resolvers/derivers listed above (`birimStateOf`,
`birimAcikDurum`, `acikSoruDurum`, `pipelineDurumFazHesapla`, `iddialariCozumle`, `stateYukle`,
`statePersist`) to build synthetic fixtures and assert behavior. They are consumers in the literal
sense (they do read/write `state.asamalar[...]` fields) but none of them reimplement resolution
logic independently — they all call into the same production functions rows 1–33/35–36 already
cover, so giving each its own row would restate the same "via shared resolver: yes" 25+ times
without new information:

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
`scripts/claude-retry-fault-injection-test.mjs`, `scripts/verify-slice1.mjs`,
and (**new**, 2026-07-19) `scripts/planlama-tamamlandi-korluk-test-runner.mjs` — the regression/
negative test for the blind-spot fix (see report); it calls the real, imported `acikSoruDurum`
(row 22) against a read-only copy of real `fotball-podcast-2026-07-09` data, so it belongs in this
list under the same criterion, not as its own numbered row.

**Verified exception, worth naming:** `scripts/registry-durum-faz-test.mjs` specifically re-runs
`pipelineDurumFazHesapla` (row 24) against the *real* `planlama-durum.json` of the 6 live projects
under `$META_DATA_ROOT/projeler/` (per its own commit message, a8107e5) — this is closer to a
regression oracle for row 24 than a synthetic fixture, but it still calls the production function
rather than duplicating its logic, so it stays in this list rather than getting its own row. It
was re-run as part of the 2026-07-19 equivalence proof and passed unchanged (38/38).

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

# 8. Distinguish test/fixture consumers that call the shared resolvers from ones that don't
grep -rln "birimStateOf\|birimAcikDurum\|acikSoruDurum\|pipelineDurumFazHesapla\|iddialariCozumle" scripts/*test*.mjs

# 9. Spot-check for stale/mismatched vocabulary (the fazHesapla finding)
grep -n "fazHesapla" --include="*.mjs" --include="*.js" --include="*.jsx" -r . | grep -v node_modules

# 10. (2026-07-19) Confirm exactly which files this update touched, no more no less
git diff --stat

# 11. (2026-07-19) Prove registry.json byte-equivalence for all 6 real projects (stash/rebuild/diff)
git stash && node scripts/build-card-data.js && cp public/registry.json /tmp/registry-before.json && git stash pop && node scripts/build-card-data.js && diff /tmp/registry-before.json public/registry.json && echo IDENTICAL

# 12. (2026-07-19) Run the blind-spot regression test (uses a read-only tmpdir copy of real data)
npm run planlama-tamamlandi-korluk-test
```

Everything else in this document (line numbers, "why not" reasoning, which branch of which function
reads which field) came from reading the following files in full, not from grep alone:
`tools/planlamaDurumMakinesiV2.mjs`, `tools/planlamaBirimMotoru.mjs`, `tools/planlamaLoopV2.mjs`,
`tools/planlamaBolumLoop.mjs`, `tools/elestiriPasi.mjs`, `tools/planlamaDurumOzeti.mjs`,
`tools/planlamaKartTuretici.mjs`, `tools/planlamaIddiaDurumu.mjs`, `tools/planlamaBolumKapilari.mjs`,
`src/lib/registry.js`, `src/lib/intakeBuilder.js`, `src/lib/stateMachine.js`,
`scripts/build-card-data.js`, `scripts/planlama-baslat.mjs` (full file), `scripts/soru-yanit-
queue-watch.mjs`, `src/views/ProjectView.jsx`, `src/views/PartnerView.jsx`, `src/views/
SoruYanitView.jsx` (full), `src/components/Badges.jsx`, `tools/seamReconcile.mjs` / `scripts/
seam-reconcile.mjs`, `scripts/masterPlanBolucu.mjs`, `scripts/kararWire.mjs` (heads, scope-boundary
check), and, for the 2026-07-19 update specifically, `vite.config.js` (browser-bundle-safety check
for row 24) and real project data under `$META_DATA_ROOT/projeler/fotball-podcast-2026-07-09/`
(read-only).
