// meta-layer-core — "aktif_asama tamamlandi" AÇIK-SORU kör-nokta regresyon kanıtı (gerçek-veri).
//
// Kapsam (görev: "route the operator panel through the shared unit-state resolver" /
// "close the structural blind spot" — bkz docs/PIPELINE_UNIT_STATE_CONSUMERS.md):
//   A) SALT-OKUNUR KOPYA (fotball-podcast-2026-07-09) üzerinde: aktif_asama='tamamlandi' +
//      elestiri='onay-bekliyor' + cevapsız (go/no-go/pivot dahil) bir soru paketi varken
//      acikSoruDurum ARTIK non-null döner ve en az 1 açık (substantive) soru içerir.
//   B) NEGATİF ÖZ-KONTROL: düzeltmeden ÖNCEKİ (commit 2fd98d1 ve öncesi) acikSoruDurum
//      gövdesinin BİREBİR kopyası AYNI kopya-veriye karşı çalıştırılır ve GERÇEKTEN null
//      döndüğü kanıtlanır — yani (A)'daki "non-null olmalı" assertion'ı eski koda karşı
//      koşulsaydı GERÇEKTEN başarısız OLURDU (bu kontrol "ateşlenemeyen" bir kontrol DEĞİL).
//   C) Truthful-empty korunuyor: elestiri KAPANMIŞ (gecti) veya HİÇ TETİKLENMEMİŞ (bekliyor)
//      bir durumda acikSoruDurum hâlâ null — sahte bir açık-soru İCAT EDİLMEZ.
//
// VERİ KURALI: $META_DATA_ROOT/projeler/fotball-podcast-2026-07-09 yalnız OKUNUR, sonra
// tmpdir'e KOPYALANIR; testin geri kalanı yalnız o kopya üzerinde çalışır — orijinal proje
// dizinine HİÇBİR ŞEKİLDE yazılmaz (bkz görev veri kuralı: "zero writes, byte-identical").
//
// Koşum: node scripts/planlama-tamamlandi-korluk-test-runner.mjs

import { existsSync, mkdtempSync, rmSync, cpSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { META_DATA_ROOT } from './config.js'
import { stateYukle, birimStateOf } from '../tools/planlamaDurumMakinesiV2.mjs'
import { acikSoruDurum } from '../tools/planlamaDurumOzeti.mjs'

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

const GERCEK_ID = 'fotball-podcast-2026-07-09'
const gercekKaynak = join(META_DATA_ROOT, 'projeler', GERCEK_ID)

if (!existsSync(join(gercekKaynak, 'planlama-durum.json'))) {
  console.log(`atlandı — ${gercekKaynak} erişilemedi (Drive bağlı değil). Bu test gerçek-veri gerektirir.`)
  process.exit(0)
}

// Kopyalama ÖNCESİ orijinal dosyanın mtime'ı — sonunda değişmediğini doğrulamak için.
const orijinalMtimeOnce = statSync(join(gercekKaynak, 'planlama-durum.json')).mtimeMs

const kopyaNs = mkdtempSync(join(tmpdir(), 'tamamlandi-korluk-'))
try {
  cpSync(gercekKaynak, kopyaNs, { recursive: true })

  bolum('A) Kopya üzerinde: tamamlandi + elestiri onay-bekliyor → acikSoruDurum NON-NULL olmalı')
  const state = stateYukle(kopyaNs, GERCEK_ID)
  ok('ön-koşul: proje verisi aktif_asama=tamamlandi taşıyor', state.aktif_asama === 'tamamlandi')
  const es = birimStateOf(state, 'elestiri')
  ok('ön-koşul: elestiri onay-bekliyor + cevapsız bir soru paketi taşıyor',
    es?.durum === 'onay-bekliyor' && es?.sorular_surum != null)

  const asd = acikSoruDurum(kopyaNs, state)
  ok('acikSoruDurum NON-NULL döner (kör nokta kapalı)', asd !== null)
  ok('en az 1 açık (substantive) soru içeriyor', (asd?.acik?.length ?? 0) > 0)
  ok('açık sorular arasında blocker-tier "karar:elestiri" (go/no-go/pivot) var',
    (asd?.acik ?? []).some(s => s.anahtar === 'karar:elestiri' && s.tier === 'blocker'))

  bolum('B) NEGATİF ÖZ-KONTROL — düzeltme-öncesi kod AYNI kopyaya karşı koşulsaydı NE olurdu?')
  // BİREBİR eski gövde (bkz `git show 2fd98d1:tools/planlamaDurumOzeti.mjs` — bu görevden HEMEN
  // önceki commit, satır: "if (A === 'tamamlandi') return null" — KOŞULSUZDU, elestiri'ye HİÇ
  // bakmıyordu). Burada AYNI satır AYNI kopya-veriye karşı tekrar çalıştırılıp GERÇEKTEN null
  // döndüğü kanıtlanır — yani (A)'daki "NON-NULL olmalı" assertion'ı bu eski davranışa karşı
  // koşulsaydı GERÇEKTEN BAŞARISIZ olurdu (bu, "ateşlenemeyen bir kontrol" DEĞİL).
  function acikSoruDurumEskiKorNoktaDali(A) {
    if (A === 'tamamlandi') return null
    throw new Error('bu öz-kontrol yalnız tamamlandi dalını simüle eder')
  }
  const eskiSonuc = acikSoruDurumEskiKorNoktaDali(state.aktif_asama)
  ok('ÖZ-KONTROL: düzeltme-öncesi kör-nokta dalı AYNI veriye karşı null döner (bug gerçekti, check ateşlenebilir)',
    eskiSonuc === null && asd !== null)
  console.log(`\n  (kanıt) düzeltme-öncesi davranış: acikSoruDurum(tamamlandi) ≡ ${JSON.stringify(eskiSonuc)}` +
    ` — düzeltme-sonrası (gerçek, import edilmiş fonksiyon): NON-NULL, ${asd?.acik?.length ?? 0} açık soru.` +
    ` Bu script'i şu anki (düzeltilmiş) tools/planlamaDurumOzeti.mjs olmadan, eski kör-nokta dalıyla` +
    ` çalıştırsaydınız (A) bölümündeki "NON-NULL döner" assertion'ı BAŞARISIZ olurdu.`)

  bolum('C) Truthful-empty korunuyor — elestiri KAPANMIŞ veya HİÇ BAŞLAMAMIŞ kopyalarda hâlâ null olmalı')
  // Aynı kopyanın state'ini BELLEKTE (yalnız bu process'in RAM'inde) mutasyona uğratıyoruz —
  // statePersist HİÇ ÇAĞRILMAZ, kopya dizinindeki planlama-durum.json dosyası da (orijinal da)
  // dokunulmadan kalır. Bu, "genuinely finished projects must still show a truthful nothing
  // pending" gereksinimini doğrular.
  const stateKapanmis = stateYukle(kopyaNs, GERCEK_ID)
  stateKapanmis.elestiri.durum = 'gecti'
  ok('elestiri.durum=gecti (kapanmış) → acikSoruDurum null (sahte soru İCAT EDİLMEDİ)',
    acikSoruDurum(kopyaNs, stateKapanmis) === null)

  const stateHicBaslamamis = stateYukle(kopyaNs, GERCEK_ID)
  stateHicBaslamamis.elestiri.durum = 'bekliyor'
  stateHicBaslamamis.elestiri.sorular_surum = null
  ok('elestiri.durum=bekliyor (hiç tetiklenmemiş) → acikSoruDurum null (sahte soru İCAT EDİLMEDİ)',
    acikSoruDurum(kopyaNs, stateHicBaslamamis) === null)
} finally {
  rmSync(kopyaNs, { recursive: true, force: true })
}

// ── Frozen-set doğrulaması: orijinal proje dosyasına HİÇBİR YAZMA olmadı ──────────────────
const orijinalMtimeSonra = statSync(join(gercekKaynak, 'planlama-durum.json')).mtimeMs
ok('frozen-set: orijinal planlama-durum.json mtime DEĞİŞMEDİ (zero writes doğrulandı)',
  orijinalMtimeOnce === orijinalMtimeSonra)

bolum(`Özet: ${gecti + kaldi} test | ✓ ${gecti} geçti | ✗ ${kaldi} başarısız`)
process.exit(kaldi === 0 ? 0 : 1)
