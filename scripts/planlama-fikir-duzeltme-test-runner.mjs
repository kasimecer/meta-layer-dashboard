// meta-layer-core — A) kanonik fikir kaynağı + B) operatör-düzeltme uygulanabilirlik testleri
// (hermetik, MODELSİZ — gerçek Claude/OpenRouter çağrısı YOK). Amaç: 2026-07-18 kök-neden
// raporunda (sokak-fotografciligi kalibrasyon koşumu) bulunan iki kusurun bir daha SESSİZCE
// geri gelmediğini mekanik olarak doğrulamak:
//   A) baglamlar.intake (materyalize anında yazılan, tam/kırpılmamış fikir metni) HER aşama VE
//      HER master-plan bölümü prompt'una UÇUK-KESİLMEDEN ulaşıyor mu (140-karakter kırpma yok).
//   B) yanitlarMetni() bir DATA-REQUEST 'tahmin' yanıtının `deger` alanını prompt'a taşıyor mu
//      (eskiden yalnız 'veri' için taşınıyordu); duzeltmeTutarliligiKontrolEt eski/düzeltilmemiş
//      iddia metnini üretilen içerikte YAKALIYOR mu, düzeltilmiş içerikte SESSİZ kalıyor mu.
//
// Koşum: node scripts/planlama-fikir-duzeltme-test-runner.mjs

import { promptUret, promptUretBolum, yanitlarMetni } from '../tools/canliExecutor.mjs'
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

console.log('\n=== B) yanitlarMetni() — DATA-REQUEST tahmin+deger artık prompt\'a ulaşıyor ===')
{
  const paket = {
    sorular: [
      { anahtar: 'veri:eski-iddia', tip: 'DATA-REQUEST', metin: 'Eski iddia sorusu', iddia: 'Hedef kitle Türkiye kentli 22-38 yaş nüfustur.' },
    ],
  }
  const tuketimDuzeltmeli = {
    surum: 1, paket,
    kayitlar: [{ anahtar: 'veri:eski-iddia', karar: 'tahmin', deger: 'Hedef kitle İsveç Göteborg kentli yetişkinleridir — GDPR geçerli.' }],
  }
  const metinDuzeltmeli = yanitlarMetni(tuketimDuzeltmeli)
  ok('tahmin+deger: yeni deger metni prompt\'ta VAR', metinDuzeltmeli.includes('İsveç Göteborg kentli yetişkinleridir'))
  ok('tahmin+deger: operator-beyan etiketine yönlendiriyor (eski iddiayı KÖR ONAY DEĞİL)', metinDuzeltmeli.includes('[operator-beyan:veri:eski-iddia]'))
  ok('tahmin+deger: modele eski iddiayı YAZMA talimatı veriyor', metinDuzeltmeli.includes('AYNEN YAZMA'))

  const tuketimSafOnay = {
    surum: 1, paket,
    kayitlar: [{ anahtar: 'veri:eski-iddia', karar: 'tahmin' }], // deger YOK — saf onay
  }
  const metinSafOnay = yanitlarMetni(tuketimSafOnay)
  ok('tahmin (deger YOK): eski davranış korunuyor (operatör-onaylı tahmin etiketi)', metinSafOnay.includes('[tahmin-doğrulanacak:operatör-onaylı]'))
  ok('tahmin (deger YOK): operator-beyan etiketi ÖNERİLMİYOR', !metinSafOnay.includes('operator-beyan'))
}

console.log('\n=== B) duzeltmeTutarliligiKontrolEt — mekanik uygulanabilirlik kontrolü ===')
{
  const eskiIddia = 'Hedef kitle Türkiye kentli 22-38 yaş nüfustur ve büyük şehirlerde yaşar.'
  const paket = { sorular: [{ anahtar: 'veri:eski-iddia', tip: 'DATA-REQUEST', metin: 'x', iddia: eskiIddia }] }
  const tuketim = {
    surum: 1, paket,
    kayitlar: [{ anahtar: 'veri:eski-iddia', karar: 'tahmin', deger: 'Hedef kitle İsveç Göteborg kentli yetişkinleridir.' }],
  }

  const icerikDuzeltilmemis = `# Premise\n\n${eskiIddia} [tahmin-doğrulanacak:operatör-onaylı]\n`
  const sonuc1 = duzeltmeTutarliligiKontrolEt(icerikDuzeltilmemis, tuketim)
  ok('eski iddia AYNEN kaldıysa → uyarı ÜRETİLİR', sonuc1.length === 1 && sonuc1[0].anahtar === 'veri:eski-iddia')

  const icerikDuzeltilmis = `# Premise\n\nHedef kitle İsveç Göteborg kentli yetişkinleridir. [operator-beyan:veri:eski-iddia]\n`
  const sonuc2 = duzeltmeTutarliligiKontrolEt(icerikDuzeltilmis, tuketim)
  ok('eski iddia gerçekten değiştiyse → uyarı YOK (temiz)', sonuc2.length === 0)

  const tuketimDegersiz = { surum: 1, paket, kayitlar: [{ anahtar: 'veri:eski-iddia', karar: 'tahmin' }] } // deger yok
  const sonuc3 = duzeltmeTutarliligiKontrolEt(icerikDuzeltilmemis, tuketimDegersiz)
  ok('deger YOKSA (saf onay) → kontrol devre dışı (uyarı YOK)', sonuc3.length === 0)

  ok('boş/eksik girdi çökmüyor', duzeltmeTutarliligiKontrolEt(null, null).length === 0)
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
