// meta-layer-core — Planlama ONAY-KAPILI motoru testleri (hermetik, V2).
// Drive fikstürlerinden BAĞIMSIZ: fikstürler repo-içi (planlama-test-fikstur.mjs) ve
// gerçek yapısal kapıdan doğrulanır. State + sürümlü çıktılar OS geçici dizinine yazılır
// (Drive'a DOKUNULMAZ); her bölüm kendi namespace'ini kurup temizler.
//
// Kapsam:
//   T1  Temiz akış: bir-koşum-bir-aşama + onay-kapısı + tamamlanma + idempotency
//   T2  Dondurma: koşum-kapısı reddi  +  (d) el-kırığı çıktı onayda yeniden-doğrulamada kalır
//   T3  Geçiş koruması: ileri-atlama ve ham-geri REDDEDİLİR; SIHHATLİ geri (geriAsamaya) GEÇERLİ
//   T4  Geri-dönüş tam döngü: sürümleme + bayatlık + (b) silmez/üzerine-yazmaz +
//       (c) geçersiz hedef hiçbir şeyi değiştirmez + (e) bayat aşama açık invokasyon olmadan koşmaz +
//       --tut olduğu-gibi-kabul (LLM yok) → zincir tamamlanmışa döner
//   GENEL (a) hiçbir tek invokasyon iki aşama koşturmaz (her çağrıda bağımsız sayaç ≤ 1)
//
// Koşum: node scripts/planlama-test-runner.mjs

import { existsSync, rmSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  boslukState, stateYukle, statePersist, ilerletHedefle, geriAsamaya, bayatMi, GERCEK_ASAMALAR,
} from '../tools/planlamaDurumMakinesiV2.mjs'
import { planlamaLoopV2Calistir } from '../tools/planlamaLoopV2.mjs'
import { planlamaGeri } from '../tools/planlamaBaslat.mjs'
import { FIKSTUR, BOZUK, fiksturuDogrula } from './planlama-test-fikstur.mjs'

// ── Test çerçevesi ───────────────────────────────────────────────────────────
let gecti = 0, kaldi = 0
function ok(ad, kosul) {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}`) }
}
function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

// ── Bağımsız executor çağrı sayacı (SUT'un kendi sayacına GÜVENMEZ) ───────────
let harici_cagri = 0
function fiksturExecutor(overrides = {}) {
  return async (asama, { hedefDosya } = {}) => {
    harici_cagri++
    const icerik = overrides[asama] ?? FIKSTUR[asama]
    writeFileSync(hedefDosya, icerik, 'utf8') // sürümlü yazım (loop hedefDosya'yı verir)
    return { icerik, cikti_pointer: hedefDosya, maliyet_usd: 0.001, sure_ms: 10 }
  }
}

// Bir invokasyon koştur; (a) garantisini HER çağrıda bağımsız doğrula.
let enCokTekInvokasyonCagri = 0
async function inv(ns, id, executor, mod = 'ileri') {
  harici_cagri = 0
  const sonuc = await planlamaLoopV2Calistir(ns, id, executor, { log: () => {}, mod })
  enCokTekInvokasyonCagri = Math.max(enCokTekInvokasyonCagri, harici_cagri)
  // (a) çekirdek: tek invokasyon en çok BİR aşama koşturur
  ok(`(a) tek invokasyon ≤1 aşama koşturdu [${mod}] (harici sayaç=${harici_cagri}, SUT=${sonuc.executorCagriSayisi})`,
     harici_cagri <= 1 && sonuc.executorCagriSayisi === harici_cagri)
  return sonuc
}

function yeniNs(etiket) {
  const dir = mkdtempSync(join(tmpdir(), `planlama-test-${etiket}-`))
  return { ns: dir, id: `_test-${etiket}` }
}
function temizle(ns) { try { rmSync(ns, { recursive: true, force: true }) } catch {} }
function nsDosyalar(ns) { return readdirSync(ns).sort() }
function dosyaVar(ns, ad) { return existsSync(join(ns, ad)) }
function bytesOf(p) { return readFileSync(p) }

// Temiz pipeline'ı tamamlanmaya kadar sür (her invokasyon bir aşama).
async function tamamlanaKadar(ns, id, overrides = {}) {
  const ex = fiksturExecutor(overrides)
  let sonuc, guvenlik = 0
  do {
    sonuc = await inv(ns, id, ex)
    if (++guvenlik > 20) throw new Error('tamamlanaKadar: sonsuz döngü koruması')
  } while (sonuc.durdu !== 'tamamlandi' && sonuc.durdu !== 'donduruldu')
  return sonuc
}

// ══ Fikstür kendi kendini doğrula (drift kalkanı) ═══════════════════════════════
bolum('F0 — Fikstür gerçek kapıdan doğrulama')
let f0 = false
try { f0 = fiksturuDogrula() } catch (e) { console.error('  ' + e.message) }
ok('F0: geçerli fikstürler kapıdan geçti, bozuk kaldı', f0 === true)

// ══ T1 — Temiz akış: bir-koşum-bir-aşama + onay + tamamlanma ═════════════════════
bolum('T1 — Temiz akış: bir-koşum-bir-aşama + onay-kapısı')
{
  const { ns, id } = yeniNs('t1')
  try {
    // Inv1: yalnız genesis koşar, onay-bekliyorda durur.
    const s1 = await inv(ns, id, fiksturExecutor())
    ok('T1: inv1 durdu=onay-bekliyor', s1.durdu === 'onay-bekliyor')
    ok('T1: inv1 bekleyenOnay=genesis', s1.bekleyenOnay === 'genesis')
    ok('T1: inv1 genesis.durum=onay-bekliyor', s1.state.asamalar.genesis.durum === 'onay-bekliyor')
    ok('T1: inv1 genesis.surum=1', s1.state.asamalar.genesis.surum === 1)
    ok('T1: inv1 genesis çıktısı genesis.md (v1 eski-ad)', dosyaVar(ns, 'genesis.md'))
    ok('T1: inv1 premise HENÜZ koşmadı (bekliyor)', s1.state.asamalar.premise.durum === 'bekliyor')

    // Inv2: genesis'i onayla + premise'i koştur.
    const s2 = await inv(ns, id, fiksturExecutor())
    ok('T1: inv2 genesis onaylandı (gecti)', s2.state.asamalar.genesis.durum === 'gecti')
    ok('T1: inv2 durdu=onay-bekliyor (premise)', s2.durdu === 'onay-bekliyor' && s2.bekleyenOnay === 'premise')
    ok('T1: inv2 premise built-against genesis v1', s2.state.asamalar.premise.kabul_edilen_ust_surum === 1)

    // Devamı: tamamlanana kadar sür.
    let sonuc = s2, adim = 2
    while (sonuc.durdu !== 'tamamlandi') { sonuc = await inv(ns, id, fiksturExecutor()); if (++adim > 20) break }
    ok('T1: pipeline TAMAMLANDI', sonuc.durdu === 'tamamlandi')
    ok('T1: 5 aşamada 5 invokasyon (bir-aşama-bir-invokasyon)', adim === 5)
    for (const a of GERCEK_ASAMALAR) {
      ok(`T1: ${a}.durum=gecti`, sonuc.state.asamalar[a].durum === 'gecti')
      ok(`T1: ${a}.surum=1`, sonuc.state.asamalar[a].surum === 1)
    }

    // Idempotency: tamamlanmışta yeniden çağır → koşum YOK, tamamlandı kalır.
    const sIdem = await inv(ns, id, fiksturExecutor())
    ok('T1 idempotency: tamamlandi kalır', sIdem.durdu === 'tamamlandi')
    ok('T1 idempotency: executor HİÇ çağrılmadı', sIdem.executorCagriSayisi === 0)
  } finally { temizle(ns) }
}

// ══ T2 — Dondurma (koşum-kapısı) + (d) onayda el-kırığı yeniden-doğrulama ═══════════
bolum('T2 — Dondurma + (d) onay yeniden-doğrulaması el-kırığı çıktıyı reddeder')
{
  // (i) Koşum-kapısı reddi: premise executor'u BOZUK üretir → premise donar.
  const { ns, id } = yeniNs('t2a')
  try {
    await inv(ns, id, fiksturExecutor())                     // genesis → onay-bekliyor
    const s = await inv(ns, id, fiksturExecutor({ premise: BOZUK.premise })) // onayla genesis + koş premise(BOZUK)
    ok('T2i: durdu=donduruldu', s.durdu === 'donduruldu')
    ok('T2i: premise.durum=donduruldu', s.state.asamalar.premise.durum === 'donduruldu')
    ok('T2i: premise.blok_nedeni dolu', !!s.state.asamalar.premise.blok_nedeni)
    ok('T2i: arastirma HİÇ koşmadı (bekliyor)', s.state.asamalar.arastirma.durum === 'bekliyor')
    ok('T2i: genesis yine de onaylanmıştı (gecti)', s.state.asamalar.genesis.durum === 'gecti')
  } finally { temizle(ns) }

  // (d) El-kırığı: genesis onay-bekliyorken .md'yi BOZ; onay çağrısı yeniden-doğrulamada kalmalı.
  const { ns: ns2, id: id2 } = yeniNs('t2d')
  try {
    const s1 = await inv(ns2, id2, fiksturExecutor())        // genesis → onay-bekliyor
    const genYol = s1.state.asamalar.genesis.cikti_pointer
    const premiseOnceDurum = s1.state.asamalar.premise.durum
    // İnsan .md'yi elle BOZAR (geçersiz genesis içeriği):
    writeFileSync(genYol, BOZUK.premise, 'utf8')
    const s2 = await inv(ns2, id2, fiksturExecutor())        // "onay" çağrısı → yeniden-doğrula
    ok('T2d: durdu=donduruldu (el-kırığı onayda yakalandı)', s2.durdu === 'donduruldu')
    ok('T2d: genesis.durum=donduruldu', s2.state.asamalar.genesis.durum === 'donduruldu')
    ok('T2d: genesis.blok_nedeni dolu', !!s2.state.asamalar.genesis.blok_nedeni)
    ok('T2d: İLERLEMEDİ — premise hâlâ bekliyor', s2.state.asamalar.premise.durum === premiseOnceDurum && premiseOnceDurum === 'bekliyor')
    ok('T2d: bu invokasyonda executor çağrılmadı (onay=yeniden-doğrulama, koşum değil)', s2.executorCagriSayisi === 0)
  } finally { temizle(ns2) }
}

// ══ T3 — Geçiş koruması: ileri-atlama/ham-geri RED; sıhhatli geri GEÇERLİ ══════════
bolum('T3 — Geçiş koruması (yeni sözleşme)')
{
  // İleri-atlama ham reddi (ilerletHedefle): genesis → strateji.
  const s1 = boslukState('_t3')
  let atti = false, hata = ''
  try { ilerletHedefle(s1, 'strateji') } catch (e) { atti = true; hata = e.message }
  ok('T3: ileri-atlama (genesis→strateji) hata fırlatır', atti)
  ok('T3: state değişmedi (aktif hâlâ genesis)', s1.aktif_asama === 'genesis')

  // Ham geri (ilerletHedefle ile) hâlâ reddedilir — sıhhatli yol geriAsamaya'dır.
  const s2 = { ...boslukState('_t3'), aktif_asama: 'master-plan' }
  let hamGeriRed = false
  try { ilerletHedefle(s2, 'arastirma') } catch { hamGeriRed = true }
  ok('T3: HAM geri (ilerletHedefle master-plan→arastirma) reddedilir', hamGeriRed)
  ok('T3: ham geri state değiştirmedi', s2.aktif_asama === 'master-plan')

  // SIHHATLİ geri (geriAsamaya) — tamamlanmış zincirde master-plan/ tamamlandi → genesis GEÇERLİ.
  const s3 = boslukState('_t3')
  for (const a of GERCEK_ASAMALAR) {
    s3.asamalar[a].durum = 'gecti'; s3.asamalar[a].surum = 1
    s3.asamalar[a].kabul_edilen_ust_surum = a === 'genesis' ? null : 1
  }
  s3.aktif_asama = 'tamamlandi'
  let sihhatliGeriOldu = true
  try { geriAsamaya(s3, 'genesis') } catch (e) { sihhatliGeriOldu = false; console.error('   ' + e.message) }
  ok('T3: SIHHATLİ geri (tamamlandi→genesis) GEÇERLİ transition sınıfı', sihhatliGeriOldu)
  ok('T3: geri sonrası aktif=genesis', s3.aktif_asama === 'genesis')
  ok('T3: hedef yeniden-açıldı (durum=bekliyor)', s3.asamalar.genesis.durum === 'bekliyor')
  ok('T3: geri çıktıyı SİLMEDİ (genesis.surum korunur=1)', s3.asamalar.genesis.surum === 1)

  // Geçersiz sıhhatli-geri hedefleri de reddedilir (state değişmez).
  const s4 = boslukState('_t3'); s4.aktif_asama = 'premise'
  s4.asamalar.genesis.durum = 'gecti'; s4.asamalar.genesis.surum = 1
  let bilinmeyenRed = false
  try { geriAsamaya(s4, 'yok-boyle') } catch { bilinmeyenRed = true }
  ok('T3: geriAsamaya bilinmeyen hedefi reddeder', bilinmeyenRed && s4.aktif_asama === 'premise')
  let tamamlanmamisRed = false
  try { geriAsamaya(s4, 'arastirma') } catch { tamamlanmamisRed = true } // arastirma tamamlanmadı
  ok('T3: geriAsamaya tamamlanmamış hedefi reddeder', tamamlanmamisRed && s4.aktif_asama === 'premise')
}

// ══ T4 — Geri-dönüş tam döngü: sürüm + bayat + (b)(c)(e) + --tut ═══════════════════
bolum('T4 — Geri-dönüş tam döngü (sürümleme, bayatlık, b/c/e, --tut)')
{
  const { ns, id } = yeniNs('t4')
  try {
    // Önce tamamlanmış pipeline.
    const tam = await tamamlanaKadar(ns, id)
    ok('T4: kurulum pipeline tamamlandı', tam.durdu === 'tamamlandi')
    const genesisV1Bytes = bytesOf(join(ns, 'genesis.md'))
    const premiseV1Bytes = bytesOf(join(ns, 'premise.md'))
    const dosyalarOnce = nsDosyalar(ns)

    // (c) GEÇERSİZ --geri hiçbir şeyi değiştirmez: bilinmeyen hedef.
    const stateBytesOnce = bytesOf(join(ns, 'planlama-durum.json'))
    let geciersizAtti = false
    try { planlamaGeri(ns, id, 'yok-boyle-asama') } catch { geciersizAtti = true }
    ok('T4(c): geçersiz --geri (bilinmeyen) reddedildi', geciersizAtti)
    ok('T4(c): state dosyası byte-aynı (değişmedi)', Buffer.compare(stateBytesOnce, bytesOf(join(ns, 'planlama-durum.json'))) === 0)
    ok('T4(c): dosya listesi değişmedi', JSON.stringify(dosyalarOnce) === JSON.stringify(nsDosyalar(ns)))

    // SIHHATLİ --geri genesis (en erken aşamaya — "master-plan'dan genesis'e" sınıfı).
    harici_cagri = 0 // planlamaGeri executor ALMAZ; sayacın koşum yapmadığını doğrula
    planlamaGeri(ns, id, 'genesis')
    let st = stateYukle(ns, id)
    ok('T4: --geri genesis → aktif=genesis', st.aktif_asama === 'genesis')
    ok('T4: genesis yeniden-açıldı (bekliyor)', st.asamalar.genesis.durum === 'bekliyor')
    ok('T4(b): --geri genesis.md (v1) SİLMEDİ/değiştirmedi', dosyaVar(ns, 'genesis.md') && Buffer.compare(genesisV1Bytes, bytesOf(join(ns, 'genesis.md'))) === 0)
    ok('T4: geri-dönüş yeni artefakt/sürüm ÜRETMEDİ (LLM yok)', harici_cagri === 0 && !dosyaVar(ns, 'genesis-v2.md'))

    // (c') GEÇERSİZ --geri: ileri/eşit hedef (genesis'teyken premise'e geri).
    const stBytes2 = bytesOf(join(ns, 'planlama-durum.json'))
    let ileriRed = false
    try { planlamaGeri(ns, id, 'premise') } catch { ileriRed = true }
    ok('T4(c\'): ileri/eşit hedef (genesis→premise) reddedildi', ileriRed)
    ok('T4(c\'): state byte-aynı', Buffer.compare(stBytes2, bytesOf(join(ns, 'planlama-durum.json'))) === 0)

    // genesis'i YENİDEN KOŞ → v2 (yeni dosya; v1 korunur).
    const g2 = await inv(ns, id, fiksturExecutor())
    ok('T4: genesis yeniden-koştu, durdu=onay-bekliyor', g2.durdu === 'onay-bekliyor' && g2.bekleyenOnay === 'genesis')
    ok('T4: genesis.surum=2', g2.state.asamalar.genesis.surum === 2)
    ok('T4(b): yeni sürüm genesis-v2.md yazıldı', dosyaVar(ns, 'genesis-v2.md'))
    ok('T4(b): genesis.md (v1) HÂLÂ var ve değişmedi', dosyaVar(ns, 'genesis.md') && Buffer.compare(genesisV1Bytes, bytesOf(join(ns, 'genesis.md'))) === 0)
    ok('T4: premise ARTIK bayat (genesis v2 > kabul v1)', bayatMi(g2.state, 'premise'))

    // Onay genesis → premise'e yuvarlanır; (e) bayat premise OTO-KOŞMAZ.
    const g3 = await inv(ns, id, fiksturExecutor())
    ok('T4(e): onay sonrası durdu=bayat-karar (premise)', g3.durdu === 'bayat-karar' && g3.bayatAsama === 'premise')
    ok('T4(e): bu invokasyonda executor çağrılmadı (bayat oto-koşmadı)', g3.executorCagriSayisi === 0)
    ok('T4(e): premise.surum HÂLÂ 1 (koşmadı)', g3.state.asamalar.premise.surum === 1)

    // premise'i AÇIK invokasyonla YENİDEN KOŞ → v2.
    const p2 = await inv(ns, id, fiksturExecutor())
    ok('T4: premise açık invokasyonla yeniden koştu', p2.durdu === 'onay-bekliyor' && p2.bekleyenOnay === 'premise')
    ok('T4: premise.surum=2', p2.state.asamalar.premise.surum === 2)
    ok('T4(b): premise-v2.md yazıldı; premise.md (v1) korunur',
       dosyaVar(ns, 'premise-v2.md') && dosyaVar(ns, 'premise.md') && Buffer.compare(premiseV1Bytes, bytesOf(join(ns, 'premise.md'))) === 0)

    // Onay premise → arastirma bayat-karar (yine oto-koşmaz).
    const p3 = await inv(ns, id, fiksturExecutor())
    ok('T4: onay premise → arastirma bayat-karar', p3.durdu === 'bayat-karar' && p3.bayatAsama === 'arastirma')
    ok('T4: arastirma bayat (premise v2 > kabul v1)', bayatMi(p3.state, 'arastirma'))

    // arastirma'yı --tut ile OLDUĞU-GİBİ-KABUL et (LLM yok, sürüm artmaz).
    const arastirmaSurumOnce = p3.state.asamalar.arastirma.surum
    const t = await inv(ns, id, fiksturExecutor(), 'tut')
    ok('T4(--tut): executor çağrılmadı (LLM yok)', t.executorCagriSayisi === 0)
    ok('T4(--tut): arastirma.surum ARTMADI', t.state.asamalar.arastirma.surum === arastirmaSurumOnce)
    ok('T4(--tut): arastirma kabul_edilen_ust_surum güncellendi (premise v2)', t.state.asamalar.arastirma.kabul_edilen_ust_surum === 2)
    ok('T4(--tut): arastirma-v2.md YAZILMADI (yeni sürüm yok)', !dosyaVar(ns, 'arastirma-v2.md'))
    ok('T4(--tut): arastirma ARTIK bayat değil', !bayatMi(t.state, 'arastirma'))
    // Kept arastirma (içerik değişmedi) → strateji/master-plan tutarlı → zincir TAMAMLANMIŞA döner.
    ok('T4: --tut sonrası zincir TAMAMLANDI', t.durdu === 'tamamlandi')
    for (const a of GERCEK_ASAMALAR) ok(`T4: ${a} nihai durum=gecti`, t.state.asamalar[a].durum === 'gecti')

    // (b) NİHAİ: hiçbir sürüm dosyası silinmedi/üzerine yazılmadı.
    ok('T4(b) nihai: genesis.md + genesis-v2.md + premise.md + premise-v2.md hepsi mevcut',
       dosyaVar(ns, 'genesis.md') && dosyaVar(ns, 'genesis-v2.md') && dosyaVar(ns, 'premise.md') && dosyaVar(ns, 'premise-v2.md'))
  } finally { temizle(ns) }
}

// ══ Özet ═══════════════════════════════════════════════════════════════════════
console.log(`\n(a) gözlemlenen en yüksek tek-invokasyon aşama-koşum sayısı: ${enCokTekInvokasyonCagri} (≤1 olmalı)`)
ok('(a) GENEL: hiçbir tek invokasyon >1 aşama koşturmadı', enCokTekInvokasyonCagri <= 1)

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
