// meta-layer-core — 2026-07-18 "Priority 1-5" onarım turunun kalan testleri (hermetik,
// MODELSİZ). planlama-fikir-duzeltme-test-runner.mjs (A/B/C) ve soru-yanit-queue-test.mjs (T9,
// blocker-skip reddi) ile BİRLİKTE tam kapsam:
//   Priority 1b — gate operator-beyan'ı KENDİ etiketi olarak kabul ediyor; kontrol artık SATIR
//                 değil CÜMLE/HÜCRE bazında (bir iddia komşusunun etiketiyle "kurtarılmıyor").
//   Priority 1a — "Veriyi gir" seçeneği artık KOŞULSUZ "doğrulanmış" demiyor.
//   Priority 2a/4b — tablo hücre-sızıntısı yok, kelime-sınırı farkında kırpma.
//   Priority 2b — registry ozet'i de kelime ortasında kesmiyor.
//   Priority 4d — hazirDurumuHesapla zorunlu-tamlığı toplam'dan ayrı hesaplıyor.
//   Priority 4c — atlanabilirMi blocker'ı hariç tutuyor.
//
// Koşum: node scripts/planlama-priority-onarim-test-runner.mjs

import { ciplakSayiVarMi } from '../tools/planlamaKapilari.mjs'
import { VERI_ISTEK_SECENEKLERI, dataRequestAdaylari } from '../tools/planlamaSorular.mjs'
import { kelimeSiniriKirp } from '../src/lib/metinKirp.js'
import { projeKaydiUret } from '../src/lib/intakeBuilder.js'
import { hazirDurumuHesapla, atlanabilirMi, icEtiketleriTemizle, kartBasligiUret } from '../src/lib/soruYanitMantik.js'

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

// ══ Priority 1b — gate: operator-beyan kabul + cümle/hücre-bazlı kapsam ═══════════════════════
bolum('Priority 1b — ciplakSayiVarMi: operator-beyan kabul edilir, kapsam CÜMLE/HÜCRE bazında')
{
  // NOT: SAYI_DESENI yalnız "10%"/"10 milyon" gibi RAKAM-ÖNCE düzenini yakalar, "%10" (yüzde-
  // işareti ÖNCE) düzenini YAKALAMAZ — bu, bu turun kapsamı DIŞINDA, AYRICA bulunan bir kusur
  // (bkz nihai rapor); testler bu ayrı kusurla karışmasın diye rakam-önce biçimler kullanır.

  // Kendi başına: operator-beyan etiketli bir sayı artık GEÇERLİ.
  ok('operator-beyan KENDİ başına geçerli bir etikettir', !ciplakSayiVarMi('Oran 10% [operator-beyan:veri:x] olarak öngörülmüştür.'))

  // 2026-07-18 CANLI-VAKA (bugünkü rapor): iki cümle AYNI paragrafta; birinde geçerli etiket
  // olan bir sayı var, DİĞERİNDE etiketsiz çıplak bir sayı var — eski (satır-bazlı) kontrol bunu
  // KAÇIRIRDI (komşu cümlenin etiketi "kapatırdı"), yeni (cümle-bazlı) kontrol YAKALAMALI.
  const komsuKurtarmaDenemesi = 'Bu cümlede 5000 birim hiç etiket taşımıyor. Bu farklı cümlede 20% [operator-beyan:veri:baska] var.'
  ok('KOMŞU CÜMLENİN etiketi artık "kurtarmıyor" — etiketsiz cümle YAKALANIR', ciplakSayiVarMi(komsuKurtarmaDenemesi))

  // Aynı cümledeki etiket kendi sayısını hâlâ doğru şekilde kapatıyor (regresyon).
  ok('AYNI cümledeki etiket kendi sayısını hâlâ kapatıyor (regresyon)', !ciplakSayiVarMi('Oran 10% [tahmin-doğrulanacak:kaynak-x] civarındadır.'))

  // Tablo hücresi: aynı hücrede etiket varsa geçer; KOMŞU hücrenin etiketi kurtarmamalı.
  const tabloSatiri = '| 1 | 5% büyüme | Açıklama [tahmin-doğrulanacak:kaynak-y] | notlar |'
  ok('tablo: sayı KENDİ hücresinde etiketsizse yakalanır (komşu hücrenin etiketi kurtarmaz)', ciplakSayiVarMi(tabloSatiri))
  const tabloSatiriTemiz = '| 1 | 5% [tahmin-doğrulanacak:kaynak-y] büyüme | Açıklama | notlar |'
  ok('tablo: sayı KENDİ hücresinde etiketliyse geçer', !ciplakSayiVarMi(tabloSatiriTemiz))

  // Tablo ayraç satırı hâlâ atlanıyor (regresyon).
  ok('tablo ayraç satırı (|---|---|) hâlâ atlanıyor (regresyon)', !ciplakSayiVarMi('|---|---|---|'))
}

// ══ Task 2 — SAYI_DESENI: Türkçe "%N" (yüzde-önce) biçimi artık yakalanıyor ════════════════════
bolum('Task 2 — SAYI_DESENI: "%10" (yüzde-önce, Türkçe yaygın biçim) artık ÇIPLAK sayı sayılıyor')
{
  ok('"%55 civarı" (etiketsiz) → ÇIPLAK sayı olarak YAKALANIR', ciplakSayiVarMi('Ziyaretçilerin %55 civarı yabancıdır.'))
  ok('"%55 [tahmin-doğrulanacak:x] civarı" (etiketli) → geçer (regresyon)', !ciplakSayiVarMi('Ziyaretçilerin %55 [tahmin-doğrulanacak:x] civarı yabancıdır.'))
  ok('"55%" (rakam-önce, eski davranış) hâlâ yakalanıyor (regresyon)', ciplakSayiVarMi('Büyüme 55% civarındadır.'))
  ok('gerçek arastirma.md cümlesi (canlı-vaka, "%55") artık YAKALANIYOR',
    ciplakSayiVarMi('Göteborg ziyaretçilerinin %55 civarı İsveç dışından gelmektedir ve yabancı ziyaretçiler daha yüksek harcar.'))
  ok('etiketsiz normal metin (sayı yok) hâlâ temiz (yanlış-pozitif YOK)', !ciplakSayiVarMi('Bu cümlede hiç sayı yok.'))
}

// ══ Priority 1a — UI seçenek metni artık koşulsuz "doğrulanmış" demiyor ═══════════════════════
bolum('Priority 1a — "Veriyi gir" seçeneği koşulsuz "doğrulanmış" demiyor')
{
  const ilkSecenek = VERI_ISTEK_SECENEKLERI[0]
  ok('"Veriyi gir" metni artık KOŞULSUZ "doğrulanmış olarak girer" DEMİYOR (koşullu ifade var)',
    !/^Veriyi gir \(kaynaklı — doğrulanmış olarak girer\)$/.test(ilkSecenek))
  ok('metin, kaynak boşsa/operatörse operatör-beyanı olacağını AÇIKÇA belirtiyor',
    /operatör.*beyan/i.test(ilkSecenek))
}

// ══ Priority 4b — tablo hücre-sızıntısı yok ════════════════════════════════════════════════════
bolum('Priority 4b — tablo hücre-sızıntısı: yalnız KENDİ hücresi, komşu hücre/ham | YOK')
{
  const satir = '| 2 | Çoklu Poz Paketi | Aynı seansta 3–5 farklı poz; dijital albüm teslim; [tahmin-doğrulanacak:yerel fiyat araştırması] | Seçme özgürlüğü artırır |'
  const adaylar = dataRequestAdaylari(satir)
  ok('tam olarak 1 aday üretildi', adaylar.length === 1)
  const iddia = adaylar[0]?.iddia ?? ''
  ok('iddia KOMŞU hücrelerin metnini İÇERMİYOR ("Çoklu Poz Paketi" sızmamış)', !iddia.includes('Çoklu Poz Paketi'))
  ok('iddia satır-başı numarasını İÇERMİYOR ("2 |" sızmamış)', !iddia.startsWith('2') && !iddia.includes('2 |'))
  ok('iddia ham "|" karakteri TAŞIMIYOR', !iddia.includes('|'))
  ok('iddia KENDİ hücresinin içeriğini TAM taşıyor', iddia.includes('Aynı seansta 3–5 farklı poz') && iddia.includes('[tahmin-doğrulanacak:yerel fiyat araştırması]'))
}

// ══ Priority 2a — kelime-sınırı farkında kırpma (paylaşılan yardımcı) ═════════════════════════
bolum('Priority 2a/2b — kelimeSiniriKirp: kelime ortasında ASLA kesmez')
{
  ok('kısa metin DEĞİŞMEDEN döner', kelimeSiniriKirp('kısa metin', 100) === 'kısa metin')
  const uzun = 'Bu cümle otuz karakterden uzun bir örnektir'
  const kirpilmis = kelimeSiniriKirp(uzun, 20)
  ok('kırpılmış metin sınırı AŞMIYOR', kirpilmis.length <= 21) // +1 "…" için
  ok('kırpılmış metin KELİME ORTASINDA bitmiyor (bir sonraki karakter orijinalde boşluktu ya da metin tam kelime sınırında bitti)',
    !/\S…$/.test(kirpilmis) || uzun[kirpilmis.length - 1] === ' ' || kirpilmis.replace('…', '') === uzun.slice(0, kirpilmis.length - 1))
  ok('"…" ile bitiyor (kırpıldığı görünür)', kirpilmis.endsWith('…'))
  ok('boşluksuz/tek-kelime patolojik girdi çökmüyor (son çare sert kesim)', kelimeSiniriKirp('a'.repeat(50), 10).length > 0)

  // 2b canlı-vaka: registry ozet'i artık "...Ücret 50-100 s" gibi kelime ortasında kesmiyor.
  const kayit = projeKaydiUret({
    id: 'x', kip: 'fikir-var', ad: 'Test',
    icerik: { fikirMetni: 'Göteborg\'ta Norstan yanı, kalp sembolu önünde, insanlara foto çekme hizmeti, QR kod ile anında digital teslim. Ekipman hazır. Ücret 50-100 sek arası olabilir.' },
  })
  ok('registry ozet KELİME ORTASINDA bitmiyor ("50-100 s" gibi bir kesim YOK)', !/\d+ [a-zçğıöşü]$/i.test(kayit.ozet))
}

// ══ Priority 2a — dataRequestAdaylari BÜTÜNLEŞİK testi: >240 karaktere UZAMIŞ TEK cümle ════════
bolum('Priority 2a — dataRequestAdaylari: 240 karakterden uzun tek cümle ARTIK kırpılmadan geçiyor')
{
  // 2026-07-18 canlı-vaka: premise.md'deki gerçek cümle 304 karakterdi, eski davranış onu
  // "...dijital albüm s" diye 240'ta kelimenin ortasında kesiyordu. Burada AYNI sınıf bir
  // cümleyi (>240, <600 — normal-yol GÜVENLİK-TAVANINI aşmıyor) üretip dataRequestAdaylari
  // ÜZERİNDEN (yalnız kelimeSiniriKirp'i izole DEĞİL, GERÇEK bütünleşik yolu) doğruluyoruz.
  const uzunCumle =
    'Bu proje sabit lokasyon, hazır ekipman ve QR kodu üzerinden saniyeler içinde dijital ' +
    'teslim üçgenine dayanan bir anlık hatıra servisidir; temel model müşteri tercihine göre ' +
    'aynı seansta birden fazla poz içeren bir yükseltme seçeneğine [tahmin-doğrulanacak:kaynak-x] ' +
    'sahiptir ve bu KELİME buraya sınırın ötesinde biter.'
  const adaylar = dataRequestAdaylari(uzunCumle)
  ok('tam olarak 1 aday üretildi', adaylar.length === 1)
  ok('kaynak metin 240 karakterden UZUN (test anlamlı)', uzunCumle.length > 240)
  ok('iddia KIRPILMADI — cümlenin SON kelimesi ("biter.") TAM olarak orada', adaylar[0]?.iddia.trim().endsWith('biter.'))
  ok('iddia "…" ile bitmiyor (kırpma tetiklenmedi, normal yol 600 güvenlik-tavanının altında kaldı)', !adaylar[0]?.iddia.includes('…'))
}

// ══ Priority 4d — hazirDurumuHesapla: zorunlu-tamlık toplam'dan AYRI ═══════════════════════════
bolum('Priority 4d — hazirDurumuHesapla: blocker tamlığı, opsiyonel/önemliden bağımsız hesaplanır')
{
  const acikSorular = [
    { anahtar: 'a', tip: 'CHOICE', tier: 'blocker' },
    { anahtar: 'b', tip: 'DATA-REQUEST', tier: 'onemli' },
    { anahtar: 'c', tip: 'FREE-TEXT', tier: 'opsiyonel' },
  ]
  // Yalnız blocker (a) yanıtlanmış — b/c BOŞ.
  const taslaklarBlockerTamam = { a: { secim: 'X' } }
  const durum1 = hazirDurumuHesapla(acikSorular, taslaklarBlockerTamam)
  ok('yalnız blocker yanıtlandığında blockerTamam=true (onemli/opsiyonel BEKLEMEZ)', durum1.blockerTamam === true)
  ok('toplam hazır SAYISI hâlâ 1/3 (yanıltıcı "tam" göstermiyor)', durum1.hazirSayisi === 1 && durum1.toplam === 3)
  ok('blocker sayacı 1/1 doğru', durum1.blockerHazirSayisi === 1 && durum1.blockerToplam === 1)

  // Hiçbiri yanıtlanmamış.
  const durum2 = hazirDurumuHesapla(acikSorular, {})
  ok('hiçbiri yanıtlanmadığında blockerTamam=false', durum2.blockerTamam === false)

  // Blocker YOKSA (yalnız onemli/opsiyonel) — blockerTamam vakit kaybetmeden true (engel yok).
  const durum3 = hazirDurumuHesapla(acikSorular.filter(s => s.tier !== 'blocker'), {})
  ok('hiç blocker yoksa blockerTamam=true (0/0)', durum3.blockerTamam === true && durum3.blockerToplam === 0)

  ok('boş/eksik girdi çökmüyor', hazirDurumuHesapla(undefined, {}).toplam === 0)
}

// ══ Priority 4c — atlanabilirMi: blocker hariç ═════════════════════════════════════════════════
bolum('Priority 4c — atlanabilirMi: blocker kart atlanamaz, diğerleri atlanabilir')
{
  ok('blocker → atlanamaz', atlanabilirMi({ tip: 'DATA-REQUEST', tier: 'blocker' }) === false)
  ok('onemli → atlanabilir', atlanabilirMi({ tip: 'DATA-REQUEST', tier: 'onemli' }) === true)
  ok('opsiyonel → atlanabilir', atlanabilirMi({ tip: 'FREE-TEXT', tier: 'opsiyonel' }) === true)
  ok('APPROVAL → atlanamaz (tier ne olursa olsun, zaten formdan yanıtlanmıyor)', atlanabilirMi({ tip: 'APPROVAL', tier: 'blocker' }) === false)
}

// ══ Kart-okunabilirlik turu (2026-07-18) — icEtiketleriTemizle + kartBasligiUret ═══════════════
bolum('icEtiketleriTemizle: iç/belge etiketleri operatöre görünmez')
{
  ok('tam etiket temizleniyor', icEtiketleriTemizle('Oran %10 [tahmin-doğrulanacak:kaynak-x] civarındadır.') === 'Oran %10 civarındadır.')
  ok('YARIM (kapanışsız) etiket de temizleniyor (canlı-vaka: "...saha-gözlemi" kapanmadan biten tag)',
    !icEtiketleriTemizle('...bir ilk-giren avantajı tanımaktadır [tahmin-doğrulanacak:saha-gözlemi').includes('['))
  ok('operator-beyan temizleniyor', !icEtiketleriTemizle('Değer %10 [operator-beyan:veri:x] öngörülmüştür.').includes('['))
  ok('birden fazla etiket TEK cümlede temizleniyor', !icEtiketleriTemizle('9 [tahmin-doğrulanacak:x] milyon, payı %30 [tahmin-doğrulanacak:y].').includes('['))
  ok('etiketsiz metin DEĞİŞMİYOR (fazla kırpma/bozma yok)', icEtiketleriTemizle('Sıradan bir cümle, hiç etiket yok.') === 'Sıradan bir cümle, hiç etiket yok.')
  ok('boş/eksik girdi çökmüyor', icEtiketleriTemizle(undefined) === '')
}

bolum('kartBasligiUret: her DATA-REQUEST kart AYIRT EDİCİ, etiketsiz, iddiadan türeyen bir başlık taşır')
{
  const s1 = { tip: 'DATA-REQUEST', anahtar: 'veri:a', iddia: 'Göteborg ziyaretçilerinin %55 civarı İsveç dışından gelmektedir ve bu segment daha yüksek harcama eğilimi taşır.' }
  const s2 = { tip: 'DATA-REQUEST', anahtar: 'veri:b', iddia: 'Ekipman temin maliyeti sıfırdır çünkü operatör hazır ekipmanla başlamaktadır [operator-beyan:veri:b].' }
  const b1 = kartBasligiUret(s1), b2 = kartBasligiUret(s2)
  ok('İKİ FARKLI iddia İKİ FARKLI başlık üretir (23-özdeş-kart canlı-vakası)', b1 !== b2)
  ok('başlık iddianın KENDİSİNDEN türüyor (sabit jenerik metin DEĞİL)', b1.startsWith('Göteborg ziyaretçilerinin'))
  ok('başlıkta iç etiket YOK', !b1.includes('[') && !b2.includes('['))
  ok('başlık "bir bakışta" okunabilir uzunlukta (≤91 karakter — kelime-sınırı + "…")', b1.length <= 91)

  // Savunma: iddia YOKSA (eski/bozuk veri) yine de anahtar üzerinden AYIRT EDİCİ kalır — sabit
  // jenerik metne ASLA geri düşmez.
  const s3 = { tip: 'DATA-REQUEST', anahtar: 'veri:c', iddia: null }
  const s4 = { tip: 'DATA-REQUEST', anahtar: 'veri:d', iddia: null }
  ok('iddia yokken bile İKİ FARKLI kart İKİ FARKLI başlık üretir (anahtar üzerinden)', kartBasligiUret(s3) !== kartBasligiUret(s4))

  // CHOICE/FREE-TEXT/APPROVAL etkilenmez — soru.metin AYNEN döner (regresyon).
  const sChoice = { tip: 'CHOICE', metin: 'Hangisi?' }
  ok('CHOICE etkilenmedi (soru.metin aynen döner)', kartBasligiUret(sChoice) === 'Hangisi?')
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
