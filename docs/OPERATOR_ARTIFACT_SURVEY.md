# Operator-Decision Artifact Survey (read-only)

**Status:** one-time factual survey, 2026-07-19. Nothing regenerated, repaired, or re-signed.
No file outside a scratch path and this report was written or modified — see "Integrity proof"
at the end. This document precedes and does not resolve two intended future changes: (a) making
regeneration answer-preserving, (b) widening the per-record signature (`imza`) to cover
`text`/`claim`/`source`/`tier`. Where something is ambiguous it is reported as ambiguous, not
resolved.

---

## 1. Artifact inventory — what carries operator decisions

All paths are under `$META_DATA_ROOT/projeler/<projeId>/` (Google Drive, outside this repo per
`scripts/config.js`). Concrete file paths below are from the real project
`fotball-podcast-2026-07-09` unless noted.

| Artifact | Path pattern | Format | Generator | Records code version? | References predecessor version? |
|---|---|---|---|---|---|
| **Question packet** ("sorular") | `<asama>-sorular.json` / `<asama>-sorular-v<N>.json` | JSON: `{sema, proje_id, asama, surum, imza, olusturma, sorular[], ertelenen[], on_dolgu?}` | `tools/planlamaSorular.mjs:varsayilanSoruUretici` → `soruPaketiKur`, called from `tools/planlamaBirimMotoru.mjs:birimSorulariUretVeYaz` | **No.** No field records the extraction/question-gen code's version or commit. Only `sema` (schema number, currently `1`, unrelated to code revision) and `surum` (a per-project content-version counter). | Partially. `on_dolgu` (if present) embeds copies of matching prior answers by `anahtar`, which implicitly names a predecessor — but there is no explicit `onceki_surum` / `uretildi_surumden` field. |
| **Answer packet** ("yanitlar") | `<asama>-yanitlar.json` / `<asama>-yanitlar-v<N>.json` | JSON: `{sema, proje_id, asama, surum, soru_imza, yanitlar:[{anahtar, karar|secim|metin, atlandi?, gerekce?, varsayilan_deger?, damga}]}` | `tools/planlamaSorular.mjs:yanitKaydet` / `atlaYaz`, invoked from CLI (`scripts/planlama-baslat.mjs`), the local queue watcher (`scripts/soru-yanit-queue-watch.mjs`), and directly in tests | **No.** Same gap. | **Yes, structurally** — `soru_imza` pins this answer set to one specific question-packet content-fingerprint (see §3); `surum` pins it to one version number. This is the actual operator-consent record: `karar`/`secim`/`metin`, `atlandi` (explicit skip), `gerekce` (skip reason), `damga` (timestamp). |
| **Provenance appendix (rendered)** | `master-plan--provenans-ek.md` / `-v<N>.md` | Markdown, mechanically rendered (no model call) | `tools/planlamaBolumLoop.mjs:provenansEkRenderla`, fed by `provenansVerisiTopla` | No | No explicit link; only inferable from filename version suffix |
| **Provenance appendix question packet** | `provenans-ek-sorular.json` / `-v2.json` / `-v3.json` | Same "sorular" shape as above (asama=`provenans-ek`) | Same path as generic question packet | No | Same as generic question packet |
| **State file (gate/approval state, not the decision text itself)** | `planlama-durum.json` | JSON: `{proje_id, semasurum, aktif_asama, asamalar:{...}, elestiri:{durum, cikti_pointer, kapi_sonuc, blok_nedeni, surum, kabul_edilen_ust_surum, sorular_surum, tuketilen_ust_yanit_surum}}` | `tools/planlamaDurumMakinesiV2.mjs:stateYukle/statePersist`, mutated by `planlamaBirimMotoru.mjs`, `planlamaLoopV2.mjs`, `planlamaBolumLoop.mjs`, `elestiriPasi.mjs` | No | No — `kabul_edilen_ust_surum` records which *upstream* version this unit's approval is pinned to, which is the closest thing to a predecessor-reference in this system, but it is a data-version pointer, not a code-version pointer |
| **Stable question-identity ledger ("kimlik-defteri")** | `<asama>-kimlik-defteri.json` / `-v<N>.json` | JSON: `{sema, asama, surum, kayitlar:[{soru_id, aktif, konum_gecmisi:[{satirIdx, gecisNo, ham_pencere_hash, zaman, not}]}]}` | `tools/planlamaSoruKimligi.mjs:defterYaz` | No | **Yes, by design** (`konum_gecmisi` is explicitly append-only/predecessor-preserving) — **but this artifact does not exist for any real project.** `defterYaz`/`soruIdleriAta` are called only from `scripts/planlama-soru-kimligi-test.mjs`; grep across the repo confirms zero production call sites (see commit `d8bff2b`: "kod var, migrasyon YOK" — code exists, no migration). Listed here as a designed-but-unpopulated artifact type. |
| **Elestiri go/no-go/pivot decision** | Not a separate file — it is one `yanitlar` record (`anahtar: 'karar:elestiri'`, a CHOICE type) inside `elestiri-yanitlar.json` | (same as generic yanitlar) | Operator, via CLI or browser | No | Same as generic yanitlar |

**Not in scope / verified separate:** `src/lib/stateMachine.js`'s card/build-board state machine (Barış
retirement domain — `Card.jsx`, `writePath.js`, `kararFasilitasyon.js`, `worker/worker.js`'s `/submit`
and `/intake-queue` routes) is a genuinely different system with its own "durum" vocabulary and its
own approval concept; it does not read or write any file listed above. Confirmed by grep (no
overlap in file set), consistent with `docs/PIPELINE_UNIT_STATE_CONSUMERS.md`'s existing scope note.

**Headline finding for item 1:** *no artifact in this inventory records the code version (commit,
extraction-rule version, or anything finer than the schema number `sema`) that produced it.* The
only versioning primitive is `surum`, a monotonically-incrementing *content* version per project,
not a *code* version. This is why item 4 below has to measure drift empirically rather than by
reading a stamped version number.

---

## 2. Regeneration paths

| Path | Trigger | Rewrites | Reads previous version first? |
|---|---|---|---|
| `tools/planlamaBirimMotoru.mjs:birimSorulariUretVeYaz` (the only place that writes a brand-new `sorular.json` version) | Called from `birimKostur` (planlamaBirimMotoru.mjs:130-137, invoked at `planlamaBirimMotoru.mjs:331`) every time a unit executes forward — normal `node scripts/planlama-baslat.mjs <id>` progress, or a normal re-run after `--geri <hedef>` reopened an earlier unit | `<asama>-sorular.json` (new `surum`) | **No, not the previous *questions*.** It re-extracts candidates from scratch from the freshly (re-)generated stage content (`icerik`) via `dataRequestAdaylari`/`varsayilanSoruUretici`, with zero reference to what the prior `sorular.json` contained. It *does* read the previous *answers* (`enSonYanitliOncekiSurum` + `oncekiYanitlariOku`, planlamaBirimMotoru.mjs:132-134) purely to build `on_dolgu` — a non-binding suggestion attached to any newly-generated candidate whose `anahtar` string happens to match an old answered/skipped `anahtar`. Matching is exact-string-only; no fuzzy/positional fallback in this path. |
| CLI `--geri <hedef>` (`scripts/planlama-baslat.mjs`) → `birimGeriDon`/`bolumeGeriDon` (planlamaBirimMotoru.mjs:90-114, planlamaBolumLoop.mjs:588-599) | Operator command | Resets `sorular_surum=null` on the reopened unit (does not touch the sorular/yanitlar files themselves) | N/A — this step only clears the *pointer*; the actual regeneration happens on the next forward run via the path above |
| CLI `--tut` | Operator command | `kabul_edilen_ust_surum`, `durum='gecti'` in `planlama-durum.json` | N/A — does not touch sorular/yanitlar |
| CLI `--atla <anahtar>` / `--atla-hepsi` → `atlaYaz`/`topluAtla` (planlamaSorular.mjs:754-774) | Operator command | Appends/updates a record in `<asama>-yanitlar.json` | Yes — reads current `yanitPaketiOku` and does an anahtar-keyed upsert. This is an operator-decision *writer*, not a regenerator; it never rewrites `sorular.json`. |
| CLI `--yeniden-derecele <anahtar> <tier>` → `soruYenidenDerecele` (planlamaSorular.mjs:781-790) | Operator command | **Rewrites the existing `sorular.json` in place** (same `surum`, mutates `soru.tier`, calls `sorulariYaz`) | Operates on the already-loaded `paket` (not a new version) — but see §3: this path does **not** recompute `paket.imza` after the mutation, which is already a live inconsistency today, independent of any future signature-widening (see §3, "already-latent break"). |
| Local queue watcher `scripts/soru-yanit-queue-watch.mjs:gonderimiIsle` (single-shot `--once` or polling loop) | Browser submission relayed via `worker/worker.js`'s `POST /soru-yanit-queue` → git-committed queue file → this watcher's `git pull` | `<asama>-yanitlar.json` (via `yanitKaydet`/`atlaYaz`) | Yes — reads the live `sorular.json` to re-validate `guncelSurum`/`imza` before writing; **never rewrites `sorular.json`.** |
| `worker/worker.js` `/soru-yanit-queue` route | HTTP POST from the browser | Only the intermediate git-committed queue file (`soru-yanit-kuyruk/<id>.json` in this repo, not the Drive-side artifact) | N/A — explicitly documented (worker.js:200-201) as doing no real validation; that happens only in the local watcher above |
| `scripts/build-card-data.js` (build step) | `npm run build-data` / part of `npm run build`/`dev` | `public/cards-<id>.json`, `public/sorular-<id>.json`, `public/registry.json` | Reads (does not rewrite) the Drive-side `sorular.json`/`yanitlar.json`/`planlama-durum.json`; it is a read-only projection, not a regeneration path for the artifacts in §1 |
| `tools/planlamaSoruKimligi.mjs:soruIdleriAta`/`defterYaz` | **No production call site** — only `scripts/planlama-soru-kimligi-test.mjs` | Would write `<asama>-kimlik-defteri*.json` if wired in | Yes, by design (that is its whole purpose) — but moot until wired in |
| ~24 `scripts/*-test-runner.mjs`, `*-fikstur.mjs`, `canli-*-pilot.mjs` files | `npm run planlama-*-test` etc. | Synthetic/tmp-namespace copies only | Varies; irrelevant to real artifacts — none of these operate against `$META_DATA_ROOT` project directories except `scripts/registry-durum-faz-test.mjs`, which only *reads* real `planlama-durum.json` files (read-only regression oracle, per `docs/PIPELINE_UNIT_STATE_CONSUMERS.md`) |

**Headline finding for item 2:** exactly one production code path creates a new question-packet
version, and it is **fully-blind regeneration** — the previous question packet's content is never
consulted, only the previous *answer* packet, matched by an unstable string key for one entire
class of question (see §5). This is the mechanism item 4 measures directly.

---

## 3. Signature map

**Computation:** `tools/planlamaSorular.mjs:imzaHesapla` (lines 97-100):
```js
export function imzaHesapla(asama, surum, sorular) {
  const govde = sorular.map(s => `${s.soru_id ?? s.anahtar}|${s.tip}`).sort().join('\n')
  return createHash('sha256').update(`${asama} ${surum} ${govde}`).digest('hex').slice(0, 16)
}
```
Coverage today: `asama`, `surum`, and per question only `(soru_id ?? anahtar)` + `tip` — **not**
`metin` (text), `iddia` (claim), `kaynak` (source), or `tier`. This is deliberate and documented
in-code (line ~779-780): *"imza GÜVENLİDİR (imzaHesapla yalnız anahtar|tip hash'ler, tier'a
duyarsız...)"* — i.e., the narrow coverage is load-bearing for at least one existing feature (see
below).

**Storage:**
- `paket.imza` — stored field on every question packet (`soruPaketiKur`, planlamaSorular.mjs:178-184).
- `yanitPaketi.soru_imza` — stored field on every answer packet, set at write time in `yanitKaydet` (planlamaSorular.mjs:742: `yp.soru_imza = paket.imza`) — a copy of the question packet's imza at time of writing, not recomputed from the answer content.
- `public/sorular-<id>.json`'s `soru_imza` field — a passthrough copy written by `scripts/build-card-data.js:440`, fetched by the browser (`src/views/SoruYanitView.jsx:196`) and round-tripped unmodified into the submission payload (`SoruYanitView.jsx:209`).

**Verification consumers (recompute or compare):**
1. `tools/planlamaSorular.mjs:sorulariDogrula` (line 601-603) — **recomputes** `imzaHesapla(paket.asama, paket.surum, paket.sorular)` and throws if it doesn't equal the stored `paket.imza`. This is the only self-consistency check against the current formula; called from tests and (indirectly, via read paths) is the general schema/invariant validator for a packet.
2. `tools/planlamaSorular.mjs:yanitButunluk` (line 643) — compares stored `y.soru_imza !== paket.imza` (both read from disk, **no recompute** here) — tamper/staleness gate for whether an answer packet is still valid against its question packet. Feeds `birimAcikDurum` (planlamaBirimMotoru.mjs:147-179): a mismatch here is classified `'bozuk'` → `engelli: true` (blocks pipeline progress) regardless of tier.
3. `scripts/soru-yanit-queue-watch.mjs:gonderimiIsle` (lines 115-117) — compares the browser-submitted `soruImza` against the freshly-read live `guncelPaket.imza`; mismatch → submission rejected to `soru-yanit-kuyruk/reddedilen/`, never silently applied and never silently treated as current.
4. `worker/worker.js` — explicitly does **not** verify imza (comment at line 200-201: real validation happens only in the local watcher).

**Non-consumers worth naming to avoid confusion:** `tools/planlamaSoruKimligi.mjs:kimlikTutarliligiDogrula` is a *different* integrity mechanism (`soru_id` vs. the position ledger), operating independently of `imza`; it is unaffected by anything below. `on_dolgu` matching is by `anahtar`, not `imza`. No index, cache, export, or UI badge outside the four consumers above reads or displays `imza`/`soru_imza` — confirmed by exhaustive grep (`registry.json`, `cards-<id>.json` do not carry it; there is no operator-visible signature badge, only the hidden round-trip token described above).

### Would widening to cover `text`/`claim`/`source`/`tier` break each consumer, and how?

| Consumer | Breaks? | How |
|---|---|---|
| `sorulariDogrula` | **Yes, for every packet already on disk.** | It recomputes against the *new* formula. Every stored `paket.imza` was computed under the old (narrow) formula. The moment the widened formula ships, recomputation on unchanged, already-stored data yields a different hash than the stored one — every existing `sorular*.json` on every real project fails this check unless re-stamped. |
| `yanitButunluk` | **Yes, indirectly and severely.** | It doesn't recompute, but if `sorular.json` is re-stamped with a new-formula `imza` (to fix the break above) while the corresponding `yanitlar.json`'s `soru_imza` (an old-formula value, already on disk, already carries operator consent) is left untouched, every existing answered/skipped record starts comparing unequal → classified `'bozuk'` → `birimAcikDurum` returns `engelli:true`. **Concretely:** a project currently sitting `onay-bekliyor` on a fully-answered stage would, after the widening ships (without a coordinated re-stamp of both files), appear blocked as if its questions were never answered. |
| `soru-yanit-queue-watch.mjs:gonderimiIsle` | Transiently yes. | Any browser tab that fetched `sorular-<id>.json` before the widened formula's rebuild, then submits after, carries a stale imza → rejected to `reddedilen/`. Same failure shape as an ordinary regenerate-while-a-tab-is-open race, not a new bug class, but the migration moment would spike it. |
| `soruYenidenDerecele` | **Already broken today, independent of widening** — flagged here because widening makes the existing bug newly load-bearing. | Currently, by design, `tier` is *outside* signature coverage, so mutating `tier` in place without recomputing `imza` is harmless (documented rationale). If `tier` enters the signature, this function (planlamaSorular.mjs:781-790) still does not recompute `paket.imza` after `soru.tier = yeniTier` — it writes a packet whose own stored `imza` no longer matches its own content. `sorulariDogrula` on that exact packet would then fail immediately. This is a genuine, easily reproduced regression the moment `tier` is added to the hash body, not a hypothetical. |
| `scripts/build-card-data.js` passthrough + `SoruYanitView.jsx` round-trip | No direct break. | It just carries whatever `imza` value the live packet has forward; correctness depends only on `build-card-data.js` and `queue-watch.mjs` importing the same `imzaHesapla`, which they already do (same module). |
| Widening to include `iddia`/`metin` specifically | **New, structural risk beyond the migration-moment ones above.** | Item 4's measurement shows `iddia` (claim) text for the *same* logical question changes across code revisions purely from extraction-rule refinements (sentence-boundary, referral-expansion, table-cell fixes — none of which are operator-visible content changes). If `iddia`/`metin` enter the signature, **every future non-substantive extraction-wording fix will change `imza` for unrelated already-answered questions**, reintroducing the exact "silently invalidated by a code change nobody asked for" failure this whole survey was commissioned to characterize — but at the signature layer instead of the artifact-identity layer. |

**Headline finding for item 3:** the narrow coverage is not an oversight — one function
(`soruYenidenDerecele`) explicitly depends on it, in a documented comment, to let tier be corrected
after the fact without invalidating already-collected answers. Widening breaks that specific,
intentional design point first, and separately risks making the signature sensitive to
extraction-wording churn rather than to operator-relevant content.

---

## 4. Measurement — the 623-record provenance appendix

**Identifying the artifact:** `provenans-ek-sorular-v2.json` for project `fotball-podcast-2026-07-09`
(`asama: "provenans-ek"`, `surum: 2`, `olusturma: 2026-07-17T09:35:52.491Z`) has `sorular.length = 47`
+ `ertelenen.length = 576` = **623** — this is the file the task item refers to. (`-v3.json`, created
later the same repair session, has 28+234=262; `-v1.json` has 28+234=234... the point is v2 is the
one that is 623.)

**Layer:** this measurement is against the **on-disk artifact** (`provenans-ek-sorular-v2.json`),
compared to a **fresh in-memory extraction** written only to scratch — not against any built
snapshot (`public/sorular-<id>.json`) and not against the live pipeline state. `planlama-durum.json`
for this project currently points at `surum: 3` for provenans-ek's question set (i.e., v2 is not even
the version the live pipeline is using today) — flagging this so the count isn't mistaken for "the
current open-question count," which it is not.

**Method:** read the real, unchanged source `master-plan--provenans-ek-v2.md` (1820 lines) and the
real `provenans-ek-sorular-v2.json`, byte-verified unchanged before and after (see Integrity proof).
Ran the *current* `tools/planlamaSorular.mjs:varsayilanSoruUretici('provenans-ek', source, {projeId,
surum:2})` — the same function `birimSorulariUretVeYaz` would call today — and wrote the result only
to `/private/tmp/.../scratchpad/provenans-ek-sorular-v2-REGEN.json`. Script:
`/private/tmp/.../scratchpad/measure-item4.mjs` (kept for reproducibility, not committed).

**Resulting count:**

| | sorular (main set) | ertelenen (overflow) | total |
|---|---|---|---|
| Stored (2026-07-17) | 47 | 576 | **623** |
| Regenerated now (unchanged source) | 28 | 234 | **262** |
| Stored `imza` | `316ff101be8054ca` | | |
| Regenerated `imza` | `945733069afa45a6` | | (differ, as expected — different candidate set) |

**Field-level diff summary**, matched by raw `anahtar` (the only shared key — stored predates
`soru_id`; confirmed `has soru_id in sorular? false` on the stored file):

- **262 of 623 stored records** have an exact `anahtar` match in the regenerated set (1:1).
- **361 of 623** have no exact-`anahtar` counterpart in the regenerated set. Of those 361:
  - **358** are explained by a **suffix-explosion artifact**: the stored file contains groups of
    records sharing a common base `anahtar` with a trailing `-2`, `-3`, ... `-6` numeric suffix and
    *different* `iddia` text per sibling (example: `veri:wtp-segment-fark-olcumu`,
    `-2` … `-6`, six siblings, six different claim-text snippets). The regenerated set has exactly
    one record at the un-suffixed base `anahtar` for each such group. This matches, exactly, a bug
    documented in-code at `tools/planlamaSorular.mjs` (comment dated 2026-07-17, the same day this
    stored file was created): *"provenans-ek'in KENDİ yeniden-üretimi 46 sahte blocker doğurdu"* —
    provenans-ek's own rendered output intentionally repeats the same real-world claim across
    multiple sections with different surrounding text, and the code version that produced v2 folded
    candidates content/position-aware (producing a numbered near-duplicate per repetition) instead of
    identity-aware (folding all repetitions of the same tagged fact to one record). The current code
    fixes this specifically for "kimlikli" tag types (`tahmin-doğrulanacak`/`acik-soru`) by folding on
    the tag's own parameter alone, content-blind — which is why 206 distinct base-groups covering 564
    stored records collapse to 206 records in the regenerated set.
  - **3 unexplained by suffix-collapse alone** — see below.
- **Ambiguous, not resolved:** of the 262 exact 1:1 `anahtar` matches, **188 have different `iddia`
  (claim) text** between stored and regenerated, despite an identical source file. This is because
  `iddiaCumlesiCikar`'s extraction rules (sentence-boundary, referral-expansion, table-cell handling)
  changed between 2026-07-17 (when v2 was created) and now (multiple dated comments, all 2026-07-18).
  The *identity* (`anahtar`) held; the *captured text* under that identity did not. Reported as-is,
  not resolved — this is exactly the ambiguity class item 3's widening-risk analysis warns about.
- **Residual mismatch, genuinely ambiguous:** stripping trailing numeric suffixes, the stored file
  has **265 distinct base keys**; the regenerated set has **262**. Five stored base keys have no
  match at all in the regenerated set (`veri:arpu-nordics-media`, `veri:saas-podcast-conversion`,
  `veri:spotify-listener-survey`, `veri:patreon-sports-pricing`, `veri:youtube-public-memberships`),
  and two regenerated keys have no stored-base counterpart (`veri:patreon-sports-pricing-2024`,
  `veri:youtube-public-memberships-2024`). This is **not** the suffix-explosion pattern — it looks
  like the *tag parameter itself* (the `kaynak`/`konu` text an author put inside
  `[tahmin-doğrulanacak:...]`/`[acik-soru:...]`) differs slightly between two mentions of what is
  plausibly the same underlying fact (e.g. "patreon sports pricing" vs. "patreon sports pricing
  2024"), which changes the slug and therefore the identity, in both the old and the new code. This
  is reported as an open ambiguity, not resolved: it is plausible these are 5 genuinely-superseded
  claims and 2 genuinely-new ones, or plausible the same fact is double-counted under two spellings.
  Determining which requires reading the actual source passages, which was out of scope for this
  read-only pass.

**No file outside scratch was written to produce this measurement** — see Integrity proof.

---

## 5. Identity candidates (proposed, not implemented)

**Candidate A — `soru_id` as currently coded (`tools/planlamaSoruKimligi.mjs`).** Two sub-cases with
materially different reliability, which is itself the main finding here:

- *Kimlikli tag types* (`tahmin-doğrulanacak:kaynak`, `acik-soru:konu`): `soru_id =
  sha256(asama|anahtar)`, and `anahtar = veri:${slug(kaynak-or-konu-text)}`. **This does not survive
  code churn any better than `anahtar` already does** — it is a hash of the same input, not new
  information. Item 4's own measurement demonstrates a concrete failure mode even holding the source
  file byte-identical: the same underlying fact tagged with slightly different `kaynak`/`konu` text
  in two places (`patreon-sports-pricing` vs. `patreon-sports-pricing-2024`) produces two different
  `soru_id`s exactly as it produces two different `anahtar`s today. So for this branch, `soru_id`
  is not a stronger identity than what already exists; it is a restatement.
- *Kimliksiz tag type* (`[eksik]`): identity is assigned via a persistent, append-only ledger keyed
  primarily on `(satirIdx, gecisNo)` (exact line + n-th occurrence on that line) with a secondary
  `ham_pencere_hash` (hash of the raw ±24-character window around the tag, captured *before* any
  interpretation) as a fallback for the case where lines shift. This genuinely does not depend on
  `iddiaCumlesiCikar`'s interpretation — it is the strongest candidate found in this survey, by
  construction. **However:** (a) it requires an external, persisted mapping file per
  `asama`/`surum` (a new artifact type, not a field on the existing packet), (b) it is not called
  from any production path today (confirmed: zero non-test call sites), so it has never been
  measured against a real regeneration, and (c) item 4's dataset happens to contain zero `[eksik]`-
  type records (all 623 are kimlikli), so this survey cannot report empirical evidence either way
  for this specific artifact — only that the *design* targets exactly the failure mode item 4
  measured for the other branch, and does not yet cover it in practice.

**Candidate B — none.** No field currently populated on any stored artifact (`anahtar`, `imza`,
`soru_id` where present, `konum`) survives both (a) extraction-rule changes and (b) tag-parameter-
text variation across repeated mentions of the same fact, simultaneously, with proof. If a
implement-stable identity is required across *both* failure modes observed in item 4 (suffix-
explosion from position/content-aware folding, and tag-parameter-text drift), no currently-existing
field is sufficient as-is — the ledger-based approach for kimliksiz records is the closest available
building block, and no equivalent yet exists for kimlikli records beyond "don't change the tag's own
parameter text," which is an authoring discipline, not a code guarantee.

---

## 6. Coverage check — `docs/PIPELINE_UNIT_STATE_CONSUMERS.md`

**Does it cover signature computation? No.** That document (last updated 2026-07-19, same day as
this survey) is explicitly scoped to "pipeline-unit state" — the object shape produced by
`bosAsama()` (`durum`, `cikti_pointer`, `kapi_sonuc`, `blok_nedeni`, `surum`,
`kabul_edilen_ust_surum`, `sorular_surum`, `tuketilen_ust_yanit_surum`, `duzeltme_uyarilari`) stored
in `planlama-durum.json`. It never mentions `imza`, `imzaHesapla`, `soru_imza`, `sorulariDogrula`,
`yanitButunluk`, or `soru_id`/`planlamaSoruKimligi.mjs` — confirmed by reading the document in full
(its own §"How I found this" grep commands target `birimStateOf`, `kapi_sonuc`, `aktif_asama`, none
of which intersect the signature system).

**What is missing, if signature computation were to be added to that document's scope:**
- `tools/planlamaSorular.mjs:imzaHesapla` (computation) and `soruPaketiKur` (storage in `paket.imza`).
- The four verification consumers listed in §3 (`sorulariDogrula`, `yanitButunluk`,
  `soru-yanit-queue-watch.mjs:gonderimiIsle`, and the explicit non-verification by `worker/worker.js`).
- The `soru_imza` copy-forward chain: `paket.imza` → `yanitKaydet`'s `yp.soru_imza` →
  `build-card-data.js`'s `anlikGoruntu.soru_imza` → `SoruYanitView.jsx`'s round-trip.
- The one place a stored packet is mutated without recomputing its own signature
  (`soruYenidenDerecele`), which is a pre-existing, narrow but real inconsistency independent of any
  future widening.
- The separate, non-overlapping `soru_id`/kimlik-defteri identity system (`tools/
  planlamaSoruKimligi.mjs`), which that document's "pipeline-unit state" scope would likely also
  need to explicitly exclude (the way it already explicitly excludes `stateMachine.js`), to avoid a
  reader assuming `sorular_surum` (which *is* in scope there) says anything about signature integrity
  (it does not — `sorular_surum` is only a version pointer).

This is a scope gap, not a defect in the existing document — it was written to answer a different
question (who reads/writes/derives pipeline-unit *state*) and does so completely for that question;
signature computation lives one layer down, inside the question/answer artifacts that
`sorular_surum` merely points at.

---

## Integrity proof

```
md5 BEFORE (recorded at start of this pass):
  provenans-ek-sorular-v2.json      6bc74e92a8732e9bb7d94ecfb44ed740
  master-plan--provenans-ek-v2.md   90b44e531f70a758503ba01c2f829543

md5 AFTER (recorded after all measurement/regeneration in §4):
  provenans-ek-sorular-v2.json      6bc74e92a8732e9bb7d94ecfb44ed740   (unchanged)
  master-plan--provenans-ek-v2.md   90b44e531f70a758503ba01c2f829543   (unchanged)

git status --short (this repo, at both start and end of this pass): empty — no tracked file
  changed. This report file and the git-channel append are the only repo writes made by this
  task, both explicitly in-scope (docs/ + channel append).

Scratch-only writes (outside the repo and outside $META_DATA_ROOT's real project data):
  /private/tmp/claude-501/.../scratchpad/measure-item4.mjs
  /private/tmp/claude-501/.../scratchpad/diff-check.mjs
  /private/tmp/claude-501/.../scratchpad/diff-check2.mjs
  /private/tmp/claude-501/.../scratchpad/provenans-ek-sorular-v2-REGEN.json
```

No artifact carrying an operator answer, skip, or consent was modified, regenerated, or re-signed
during this pass.
