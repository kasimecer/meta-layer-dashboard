// meta-layer-core — A) kanonik fikir kaynağı + B) operatör-cevap → etiket üretimi testleri
// (hermetik, MODELSİZ — gerçek Claude/OpenRouter çağrısı YOK). Amaç: 2026-07-18 kök-neden
// raporlarında (sokak-fotografciligi kalibrasyon koşumu + aynı gün ikinci tur "Priority 1-5"
// onarımı) bulunan kusurların bir daha SESSİZCE geri gelmediğini mekanik olarak doğrulamak:
//   A) baglamlar.intake (materyalize anında yazılan, tam/kırpılmamış fikir metni) HER aşama VE
//      HER master-plan bölümü prompt'una UÇUK-KESİLMEDEN ulaşıyor mu (140-karakter kırpma yok).
//   B) yanitlarMetni() operatör-onaylı ('tahmin' deger'li/deger'siz VE 'veri' kaynaksız) her
//      cevap için DETERMİNİSTİK, anahtar-türetilmiş [operator-beyan:<anahtar>] üretiyor mu
//      (model kendi parametresini UYDURMUYOR mu) — Priority 1c/1d.
//   C) duzeltmeTutarliligiKontrolEt artık POZİTİF/etiket-bazlı — beklenen etiketin GERÇEKTEN
//      üretilen içerikte olup olmadığına bakıyor, aşama-geçişinde de (metin yeniden yazılsa
//      bile) SESSİZ KALMIYOR — Priority 5.
//
// Koşum: node scripts/planlama-fikir-duzeltme-test-runner.mjs

import { promptUret, promptUretBolum, yanitlarMetni, operatorBeyaniMi } from '../tools/canliExecutor.mjs'
import { duzeltmeTutarliligiKontrolEt } from '../tools/planlamaBirimMotoru.mjs'
import { BOLUM_TANIMLARI } from '../tools/planlamaBolumTanimlari.mjs'

let gecti = 0, kaldi = 0
function ok(ad, kosul, ekBilgi = '') {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
}

const proje = { ad: 'Test Projesi', aciklama: 'kısa özet (140-karakter teaser)' }

// >140 karakter, benzersiz bir "işaret" (marker) taşıyan sahte intake metni — eski (140-
// karakter kırpma) davranışında bu marker prompt'a HİÇ ulaşmazdı.
const BENZERSIZ_ISARET = 'GÖTEBORG-NORDSTAN-KALP-SEMBOLU-BENZERSIZ-ISARET-7f3a9'
const UZUN_FIKIR_METNI =
  'Bu fikir metni kasıtlı olarak 140 karakterden UZUN tutulmuştur ki eski registry-ozet ' +
  'kırpma davranışı geri gelirse test kırılsın. Kritik konum detayı en sonda: ' +
  `${BENZERSIZ_ISARET}.`

console.log('=== A) Kanonik fikir kaynağı — promptUret (5 aşama) ===')
{
  const baglamlar = {
    intake: UZUN_FIKIR_METNI,
    genesis: '# Genesis (sahte)', premise: '# Premise (sahte)',
    arastirma: '# Araştırma (sahte)', strateji: '# Strateji (sahte)',
  }
  for (const asama of ['genesis', 'premise', 'arastirma', 'strateji', 'master-plan']) {
    const p = promptUret(asama, proje, baglamlar)
    ok(`${asama}: prompt UZUN_FIKIR_METNI'ni TAM/kırpılmadan içeriyor`, p.includes(UZUN_FIKIR_METNI))
    ok(`${asama}: prompt benzersiz işareti içeriyor`, p.includes(BENZERSIZ_ISARET))
  }
  // intake YOKSA (eski proje / henüz materyalize edilmemiş) hata FIRLATMAMALI — boş blok.
  const pIntakesiz = promptUret('genesis', proje, {})
  ok('intake yokken promptUret çökmüyor (boş blok)', typeof pIntakesiz === 'string' && pIntakesiz.length > 0)
}

console.log('\n=== A) Kanonik fikir kaynağı — promptUretBolum (normal + iddiaMuaf bölüm) ===')
{
  const baglamlarBolum = { intake: UZUN_FIKIR_METNI, strateji: '# Strateji (sahte)' }
  const pNormal = promptUretBolum('urun-tanimi', proje, baglamlarBolum, BOLUM_TANIMLARI['urun-tanimi'])
  ok('urun-tanimi (normal bölüm): benzersiz işareti içeriyor', pNormal.includes(BENZERSIZ_ISARET))

  const pMuaf = promptUretBolum('ozet-yonetici', proje, baglamlarBolum, BOLUM_TANIMLARI['ozet-yonetici'])
  ok('ozet-yonetici (iddiaMuaf bölüm): benzersiz işareti içeriyor', pMuaf.includes(BENZERSIZ_ISARET))

  // mekanik (provenans-ek) BİLEREK muaf — saf JSON-yeniden-biçimlendirme, grounding gürültü.
  const pMekanik = promptUretBolum('provenans-ek', proje, { ...baglamlarBolum, __provenansVerisi: { tumIddialar: [], tumAtlananlar: [] } }, BOLUM_TANIMLARI['provenans-ek'])
  ok('provenans-ek (mekanik): fikir bloğu YOK (kasıtlı — pure reformat)', !pMekanik.includes(BENZERSIZ_ISARET))
}

console.log('\n=== B) operatorBeyaniMi() — paylaşılan sınıflandırma ===')
{
  ok('kaynak yok → operatör-beyanı', operatorBeyaniMi(undefined) === true)
  ok('kaynak boş string → operatör-beyanı', operatorBeyaniMi('') === true)
  ok('kaynak "operatör kararı" içeriyor → operatör-beyanı', operatorBeyaniMi('operatör kararı (2026-07-18)') === true)
  ok('kaynak "Operator decision" (İngilizce) içeriyor → operatör-beyanı', operatorBeyaniMi('Operator decision') === true)
  ok('gerçek kaynak metni → operatör-beyanı DEĞİL', operatorBeyaniMi('McKinsey abonelik raporu 2024') === false)
}

console.log('\n=== B) yanitlarMetni() — operatör-onaylı her yol DETERMİNİSTİK, anahtar-türetilmiş etiket üretiyor ===')
{
  const paket = {
    sorular: [
      { anahtar: 'veri:eski-iddia', tip: 'DATA-REQUEST', metin: 'Eski iddia sorusu', iddia: 'Hedef kitle Türkiye kentli 22-38 yaş nüfustur.' },
    ],
  }

  // tahmin + deger (düzeltme)
  const tuketimDuzeltmeli = { surum: 1, paket, kayitlar: [
    { anahtar: 'veri:eski-iddia', karar: 'tahmin', deger: 'Hedef kitle İsveç Göteborg kentli yetişkinleridir — GDPR geçerli.' },
  ] }
  const metinDuzeltmeli = yanitlarMetni(tuketimDuzeltmeli)
  ok('tahmin+deger: yeni deger metni prompt\'ta VAR', metinDuzeltmeli.includes('İsveç Göteborg kentli yetişkinleridir'))
  ok('tahmin+deger: anahtar-türetilmiş [operator-beyan:<anahtar>] üretiyor', metinDuzeltmeli.includes('[operator-beyan:veri:eski-iddia]'))
  ok('tahmin+deger: modele eski iddiayı YAZMA talimatı veriyor', metinDuzeltmeli.includes('AYNEN YAZMA'))

  // 2026-07-18 (Priority 1c/1d/3a/3b) — tahmin, deger YOK (saf onay): ARTIK jenerik/paylaşılan
  // [tahmin-doğrulanacak:operatör-onaylı] DEĞİL, AYNI anahtar-türetilmiş [operator-beyan:...] —
  // bu SAYEDE operator-beyan TAHMIN_DESENI taramasında hiç yakalanmıyor ve bir SONRAKİ aşama
  // "operatör zaten cevapladı" bir iddiayı YENİDEN sormuyor (canlı-vaka: genesis'te tahmin ile
  // kabul edilen 2 iddia, eski şemada premise'de 3 özdeş etikete dönüşüp premise'in KENDİ yeni
  // bir sorusuna katlanmıştı — operatör bunu ayrı ayrı GÖRMEMİŞTİ).
  const tuketimSafOnay = { surum: 1, paket, kayitlar: [
    { anahtar: 'veri:eski-iddia', karar: 'tahmin' }, // deger YOK — saf onay
  ] }
  const metinSafOnay = yanitlarMetni(tuketimSafOnay)
  ok('tahmin (deger YOK): artık anahtar-türetilmiş [operator-beyan:<anahtar>] üretiyor', metinSafOnay.includes('[operator-beyan:veri:eski-iddia]'))
  ok('tahmin (deger YOK): ARTIK jenerik [tahmin-doğrulanacak:operatör-onaylı] ÜRETMİYOR', !metinSafOnay.includes('[tahmin-doğrulanacak:operatör-onaylı]'))
  ok('tahmin (deger YOK): parametre KOD tarafından SABİT — model "..." ile baş başa bırakılmıyor', !metinSafOnay.includes('[operator-beyan:...]'))

  // veri + kaynak boş (operatör-beyanı yolu, Priority 1a/1c'nin canlı-vakası: "10%" deger, kaynak yok)
  const tuketimVeriKaynaksiz = { surum: 1, paket, kayitlar: [
    { anahtar: 'veri:eski-iddia', karar: 'veri', deger: '10%' }, // kaynak YOK
  ] }
  const metinVeriKaynaksiz = yanitlarMetni(tuketimVeriKaynaksiz)
  ok('veri (kaynak YOK): anahtar-türetilmiş [operator-beyan:<anahtar>] üretiyor (kaynaksız veri = operatör beyanı)', metinVeriKaynaksiz.includes('[operator-beyan:veri:eski-iddia]'))
  ok('veri (kaynak YOK): [dogrulandi:...] ASLA kullanma talimatı hâlâ var', metinVeriKaynaksiz.includes('ASLA [dogrulandi:...] ile KULLANMA'))

  // veri + gerçek kaynak (dogrulandi yolu — DEĞİŞMEDİ)
  const tuketimVeriKaynakli = { surum: 1, paket, kayitlar: [
    { anahtar: 'veri:eski-iddia', karar: 'veri', deger: '42', kaynak: 'McKinsey abonelik raporu 2024' },
  ] }
  const metinVeriKaynakli = yanitlarMetni(tuketimVeriKaynakli)
  // Not: bu dal HEM dogrulandi HEM operator-beyan olasılığını modele göstermeye devam eder
  // (kaynağın GERÇEKTEN araştırmanın doğruladığı bir şey mi yoksa operatörün kendi kararı mı
  // olduğuna model karar verir) — DEĞİŞMEDİ; yalnız [dogrulandi:kaynak-...] önerisinin VAR
  // olduğunu doğruluyoruz.
  ok('veri (gerçek kaynak): [dogrulandi:kaynak-...] önerisi VAR', /\[dogrulandi:kaynak-[^\]]+\]/.test(metinVeriKaynakli))
}

console.log('\n=== C) duzeltmeTutarliligiKontrolEt — POZİTİF/etiket-bazlı kontrol (Priority 5) ===')
{
  const eskiIddia = 'Hedef kitle Türkiye kentli 22-38 yaş nüfustur ve büyük şehirlerde yaşar, bu iddia yeterince uzun.'
  const paket = { sorular: [{ anahtar: 'veri:eski-iddia', tip: 'DATA-REQUEST', metin: 'x', iddia: eskiIddia }] }

  // tahmin (deger yok) — beklenen etiket [operator-beyan:veri:eski-iddia]
  const tuketimTahmin = { surum: 1, paket, kayitlar: [{ anahtar: 'veri:eski-iddia', karar: 'tahmin' }] }
  ok('tahmin: beklenen etiket YOKSA → uyarı ÜRETİLİR (aşama-geçişinde METİN yeniden yazılsa BİLE)',
    duzeltmeTutarliligiKontrolEt('Tamamen farklı, yeniden yazılmış bir cümle, hiç etiket yok.', tuketimTahmin)
      .some(u => u.anahtar === 'veri:eski-iddia' && u.beklenen === '[operator-beyan:veri:eski-iddia]'))
  ok('tahmin: beklenen etiket VARSA (içerik TAMAMEN farklı cümlelerle yeniden yazılmış olsa BİLE) → temiz',
    duzeltmeTutarliligiKontrolEt('Bambaşka bir cümle burada. [operator-beyan:veri:eski-iddia]', tuketimTahmin).length === 0)

  // Bu, ESKİ tasarımın YAPISAL kör-noktasıydı: eski kontrol yalnız "eski metin hâlâ var mı" diye
  // bakıyordu — bir aşama-geçişinde metin HER ZAMAN yeniden yazıldığından bu SESSİZ kalırdı.
  // Yeni kontrol pozitif olduğu için (beklenen etiketi arar), İÇERİK TAMAMEN FARKLI YENİDEN
  // YAZILMIŞ OLSA BİLE (eski metin hiç geçmese bile) beklenen etiket yoksa YİNE DE uyarır.
  ok('YAPISAL FARK: eski metin hiç geçmiyor OLSA BİLE (tam yeniden-yazım) beklenen etiket yoksa uyarır',
    duzeltmeTutarliligiKontrolEt('Sıfırdan, alakasız, kısa bir cümle.', tuketimTahmin).length === 1)

  // veri + gerçek kaynak — beklenen [dogrulandi:kaynak-...]
  const tuketimVeri = { surum: 1, paket, kayitlar: [{ anahtar: 'veri:eski-iddia', karar: 'veri', deger: '42', kaynak: 'gercek-arastirma-2024' }] }
  ok('veri+kaynak: beklenen [dogrulandi:...] YOKSA → uyarır',
    duzeltmeTutarliligiKontrolEt('hiçbir etiket yok', tuketimVeri).length === 1)
  ok('veri+kaynak: beklenen [dogrulandi:...] VARSA → temiz',
    duzeltmeTutarliligiKontrolEt('[dogrulandi:kaynak-gercek-arastirma-2024] burada', tuketimVeri).length === 0)

  // dusur — TEK istisna: negatif (yokluk) kontrolü hâlâ doğru semantik
  const tuketimDusur = { surum: 1, paket, kayitlar: [{ anahtar: 'veri:eski-iddia', karar: 'dusur' }] }
  ok('dusur: eski iddia HÂLÂ VARSA → uyarır (düşürülmemiş)', duzeltmeTutarliligiKontrolEt(eskiIddia, tuketimDusur).length === 1)
  ok('dusur: eski iddia GERÇEKTEN yoksa → temiz', duzeltmeTutarliligiKontrolEt('alakasız içerik', tuketimDusur).length === 0)

  // CHOICE/FREE-TEXT hiç etiket üretmez — kontrol dışı
  const paketChoice = { sorular: [{ anahtar: 'secim:x', tip: 'CHOICE', metin: 'x' }] }
  const tuketimChoice = { surum: 1, paket: paketChoice, kayitlar: [{ anahtar: 'secim:x', secim: 'A' }] }
  ok('CHOICE: hiç kontrol edilmez (etiket beklenmiyor)', duzeltmeTutarliligiKontrolEt('hiçbir şey', tuketimChoice).length === 0)

  ok('boş/eksik girdi çökmüyor', duzeltmeTutarliligiKontrolEt(null, null).length === 0)
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
