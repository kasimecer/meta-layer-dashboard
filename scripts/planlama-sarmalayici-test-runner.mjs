// meta-layer-core — executorSarmalayicisiniTemizle (sohbet-sarmalayıcı temizliği) testleri.
// Hermetik, MODELSİZ: gerçek `claude` CLI'ya dokunmaz, saf metin-dönüşümü + gerçek bölüm
// kapısıyla (bolumKapidanGecerMi) entegrasyonu sınar.
// Koşum: node scripts/planlama-sarmalayici-test-runner.mjs

import { executorSarmalayicisiniTemizle } from '../tools/planlamaSarmalayiciTemizle.mjs'
import { bolumKapidanGecerMi } from '../tools/planlamaBolumKapilari.mjs'
import { FIKSTUR_BOLUM } from './planlama-bolum-fikstur.mjs'

let gecti = 0, kaldi = 0
function ok(ad, kosul, ekBilgi = '') {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
}
function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

const TEMIZ = FIKSTUR_BOLUM['urun-tanimi'] // gerçek, geçerli bir bölüm gövdesi (kontrol)

// ════════════════════════════════════════════════════════════════════════════
bolum('W1 — "Format confirmed…" ÖN-sarmalayıcı soyulur')
{
  const sarmali = `Format confirmed, proceeding with the section now.\n\n${TEMIZ}`
  const r = executorSarmalayicisiniTemizle(sarmali)
  ok('W1: değişti=true', r.degisti)
  ok('W1: onSoyuldu dolu', !!r.onSoyuldu)
  ok('W1: temiz çıktı ORİJİNAL gövdeyle BİREBİR aynı', r.temiz === TEMIZ)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('W2 — "kaydedildi/saved/registry updated" ART-sarmalayıcı soyulur')
{
  const varyantlar = [
    `${TEMIZ}\n(Kaydedildi: urun-tanimi-v2-2026-07-08.md, registry güncellendi.)\n`,
    `${TEMIZ}\nSaved to registry. Registry updated.\n`,
    `${TEMIZ}\n\nDosyaya kaydedildi (2026-07-08).\n`,
  ]
  for (const [i, sarmali] of varyantlar.entries()) {
    const r = executorSarmalayicisiniTemizle(sarmali)
    ok(`W2.${i + 1}: değişti=true`, r.degisti, r.artSoyuldu?.trim())
    ok(`W2.${i + 1}: temiz çıktı ORİJİNAL gövdeyle BİREBİR aynı`, r.temiz === TEMIZ)
  }
  // Görev notu: "bare digits in a filename/date inside the postamble" — 4 ayrı vakayı
  // temsilen, tarih/dosya-adı içeren rakamlar postambledeyken de doğru soyulmalı.
  ok('W2: rakamlı dosya-adı/tarih içeren art-sarmalayıcı da sorunsuz soyulur',
    executorSarmalayicisiniTemizle(varyantlar[0]).temiz === TEMIZ)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('W3 — HEM ön HEM art sarmalayıcı AYNI ANDA soyulur')
{
  const sarmali = `Format confirmed.\n\n${TEMIZ}\n(Kaydedildi ve registry güncellendi.)\n`
  const r = executorSarmalayicisiniTemizle(sarmali)
  ok('W3: hem onSoyuldu hem artSoyuldu dolu', !!r.onSoyuldu && !!r.artSoyuldu)
  ok('W3: temiz çıktı ORİJİNAL gövdeyle BİREBİR aynı', r.temiz === TEMIZ)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('W4 — sarmalayıcı YOKSA içerik BİREBİR aynen döner (no-op)')
{
  const r = executorSarmalayicisiniTemizle(TEMIZ)
  ok('W4: değişti=false', !r.degisti)
  ok('W4: temiz === girdi (hiçbir şey kırpılmadı)', r.temiz === TEMIZ)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('W5 — GÜVENLİK (2026-07-06 regresyonu bir daha OLMAMALI): gövde-İÇİNDEKİ benzer metne DOKUNULMAZ')
{
  // "Kayıt" kelimesi GÖVDENİN ORTASINDA (meşru içerik, ör. bir kayıt-tutma sürecinden bahsediyor)
  // — bu bir art-sarmalayıcı DEĞİL (metnin SONUNDA değil), soyulmamalı.
  const ortadaKayit = `# Operasyon Planı — Test Projesi\n\nTedarik süreci kayıt altına alınır ve haftalık raporlanır. [operator-beyan:kayit-sureci]\n\nTeslimat süreci ayrıca izlenir. [operator-beyan:teslimat-izleme]\n`
  const r1 = executorSarmalayicisiniTemizle(ortadaKayit)
  ok('W5a: gövde ORTASINDAKİ "kayıt" kelimesi soyulmaz (yalnız MUTLAK sonda arar)', !r1.degisti)
  ok('W5a: içerik BİREBİR aynen döner', r1.temiz === ortadaKayit)

  // Reverted 2026-07-06 senaryosunun AYNISI: gövde ORTASINDA satır-başı "#" ile başlayan alakasız
  // bir ifade (ör. bir renk-kodu/referans). Bu modül "başlık ara" YAPMAZ — yalnız MUTLAK baştaki
  // bilinen desenlere bakar, bu yüzden ortadaki "#" hiç etkilenmez.
  const ortadaDiyez = `# Riskler ve Varsayımlar — Test Projesi\n\nEn kritik varsayım budur. [operator-beyan:v1]\n\n#ff0000 renk kodu burada bir referans olarak geçiyor, başlık DEĞİLDİR. [operator-beyan:v2]\n`
  const r2 = executorSarmalayicisiniTemizle(ortadaDiyez)
  ok('W5b: gövde ORTASINDAKİ "#" (başlık DEĞİL) soyulmaz/kırpılmaz', !r2.degisti && r2.temiz === ortadaDiyez)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('W6 — ENTEGRASYON: sarmalı içerik kapıdan (bolumKapidanGecerMi) DÜŞER, temizlenmiş hâli GEÇER')
{
  const sarmali = `Format confirmed, here is the section.\n\n${TEMIZ}\n(Kaydedildi: urun-tanimi.md)\n`

  // İşlenmemiş (ham) hâliyle: ön-sarmalayıcının kendisi etiketsiz bir satır olduğu için kapı
  // GERÇEKTEN reddeder (görevin "these repeatedly tripped the gate" gözlemiyle birebir).
  const gHam = bolumKapidanGecerMi('urun-tanimi', sarmali)
  ok('W6: SARILI (ham) içerik kapıdan DÜŞER (sarmalayıcı satırı etiketsiz sayılır)', !gHam.gecti, gHam.neden ?? '')

  // AYNI içerik, önce temizlenip SONRA kapıya verilirse (yeni akış — canliExecutor.mjs'nin yaptığı
  // gibi) yalnız gerçek gövde üzerinden yargılanır ve normal GEÇER.
  const { temiz } = executorSarmalayicisiniTemizle(sarmali)
  const gTemiz = bolumKapidanGecerMi('urun-tanimi', temiz)
  ok('W6: TEMİZLENMİŞ (gerçek gövde) içerik kapıdan GEÇER — yalnız gövdenin liyakatine göre yargılanır', gTemiz.gecti, gTemiz.neden ?? '')
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
