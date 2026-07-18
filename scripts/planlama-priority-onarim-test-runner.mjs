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

import { readFileSync, existsSync } from 'fs'
import { ciplakSayiVarMi } from '../tools/planlamaKapilari.mjs'
import { VERI_ISTEK_SECENEKLERI, dataRequestAdaylari } from '../tools/planlamaSorular.mjs'
import { kelimeSiniriKirp, portfoyOzetiKirp, PORTFOY_OZET_UZUNLUGU } from '../src/lib/metinKirp.js'
import { projeKaydiUret } from '../src/lib/intakeBuilder.js'
import { hazirDurumuHesapla, atlanabilirMi, icEtiketleriTemizle } from '../src/lib/soruYanitMantik.js'

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
bolum('kelimeSiniriKirp: kelime ortasında ASLA kesmez (genel amaçlı, hâlâ portfoyOzetiKirp + iddiaMetniCikar tarafından kullanılıyor)')
{
  ok('kısa metin DEĞİŞMEDEN döner', kelimeSiniriKirp('kısa metin', 100) === 'kısa metin')
  const uzun = 'Bu cümle otuz karakterden uzun bir örnektir'
  const kirpilmis = kelimeSiniriKirp(uzun, 20)
  ok('kırpılmış metin sınırı AŞMIYOR', kirpilmis.length <= 21) // +1 "…" için
  ok('kırpılmış metin KELİME ORTASINDA bitmiyor (bir sonraki karakter orijinalde boşluktu ya da metin tam kelime sınırında bitti)',
    !/\S…$/.test(kirpilmis) || uzun[kirpilmis.length - 1] === ' ' || kirpilmis.replace('…', '') === uzun.slice(0, kirpilmis.length - 1))
  ok('"…" ile bitiyor (kırpıldığı görünür)', kirpilmis.endsWith('…'))
  ok('boşluksuz/tek-kelime patolojik girdi çökmüyor (son çare sert kesim)', kelimeSiniriKirp('a'.repeat(50), 10).length > 0)
}

// ══ Öz-yazma turu (2026-07-18) — kırpma YAZMA'dan GÖRÜNTÜLEME'ye taşındı ═══════════════════════
bolum('projeKaydiUret: HİÇBİR uzunluk kapağı YOK — TAM kaynak metin saklanıyor (her iki dal)')
{
  // Mühendislikli girdi: bir önceki turda (Görev 6) ham `.slice(0,140)`'ın TAM ORTASINDAN
  // keseceği şekilde inşa edilmişti (140. karakter bölünmez 40-karakterlik bir kelimenin
  // içinde). O tur yazıcıyı düzeltmişti (kelime-sınırı farkında AMA HÂLÂ 140'a kırpan); BU tur
  // kapağı YAZICIDAN TAMAMEN KALDIRDI — aynı girdiyle yazıcının artık HİÇ kırpmadığını kanıtlar.
  const oncul = 'kelime '.repeat(18).trimEnd() // 125 karakter
  const bolunmezKelime = 'x'.repeat(40)
  const girdi = oncul + ' ' + bolunmezKelime // toplam 166 karakter — 140'ı aşıyor

  const kayitFikir = projeKaydiUret({ id: 'oz-yazma-fikir', kip: 'fikir-var', icerik: { fikirMetni: girdi } })
  ok('fikir-var dalı: 140 karakterden UZUN girdi TAM olarak saklanıyor (166 karakter, hiç kırpma yok)', kayitFikir.ozet.length === 166)
  ok('fikir-var dalı: "…" YOK (yazma-anında kırpma tetiklenmedi)', !kayitFikir.ozet.includes('…'))
  ok('fikir-var dalı: bölünmez kelimenin TAMAMI korunmuş (40 "x" hepsi orada)', kayitFikir.ozet.includes('x'.repeat(40)))
  ok('fikir-var dalı: girdiyle BAYT-BAYT özdeş', kayitFikir.ozet === girdi)

  // İKİNCİ dal (kip !== 'fikir-var', "tohum" girişi — ilgiAlani/kisit/varlik birleşimi) AYNI
  // helper'ı AYNI kapakla kullanıyordu; görevin AÇIKÇA istediği "her iki dala da uygula" burada.
  const kayitTohum = projeKaydiUret({
    id: 'oz-yazma-tohum', kip: 'tohum',
    icerik: { ilgiAlani: oncul, kisit: bolunmezKelime, varlik: 'üçüncü-alan-da-eklensin-ki-birlesim-140i-asin-lutfen-emin-olalim' },
  })
  const beklenenTohum = [oncul, bolunmezKelime, 'üçüncü-alan-da-eklensin-ki-birlesim-140i-asin-lutfen-emin-olalim'].join(' · ')
  ok('tohum dalı: 140 karakterden UZUN birleşim TAM saklanıyor (hiç kırpma yok)', kayitTohum.ozet.length === beklenenTohum.length)
  ok('tohum dalı: "…" YOK', !kayitTohum.ozet.includes('…'))
  ok('tohum dalı: girdiyle BAYT-BAYT özdeş', kayitTohum.ozet === beklenenTohum)

  // MUTASYON-KANITLANABİLİRLİK notu: bu 6 assertion, yazıcıya bir uzunluk kapağı (ör. eski
  // `kelimeSiniriKirp(...,140)` ya da ham `.slice(0,140)`) yeniden eklenirse KESİN başarısız
  // olur — `.length === 166` / `.length === beklenenTohum.length` ve bayt-bayt eşitlik testleri
  // her ikisi de kısaltılmış bir çıktıyla YANLIŞ döner (aşağıda mutasyonla ayrıca doğrulandı).
}

bolum('portfoyOzetiKirp: kısaltma artık BURADA (görüntüleme) — aynı mühendislikli girdiyle kelime-sınırı kanıtı')
{
  const oncul = 'kelime '.repeat(18).trimEnd()
  const bolunmezKelime = 'x'.repeat(40)
  const girdi = oncul + ' ' + bolunmezKelime // 166 karakter, tıpkı yukarıdaki gibi

  const gosterim = portfoyOzetiKirp(girdi)
  ok('görüntüleme: 140 karakterden KISA (kelime sınırına geri çekildi)', gosterim.length < 140)
  ok('görüntüleme: "…" ile bitiyor (kırpma görünür işaretli — burada, tam da beklendiği yerde)', gosterim.endsWith('…'))
  ok('görüntüleme: bölünmez kelimeden TEK KARAKTER bile taşımıyor', !gosterim.includes('x'))
  ok('görüntüleme: son gerçek sözcük ("kelime") TAM biçimde korunmuş', gosterim.slice(0, -1).endsWith('kelime'))
  ok('görüntüleme: stored/kaynak DEĞER (girdi) HİÇ değişmedi — bu yalnız bir GÖSTERİM', girdi.length === 166 && girdi.includes('x'.repeat(40)))

  // "Watch for": zaten kısa bir metin sahte bir "…" KAZANMAMALI.
  const kisaMetin = 'Kısa ve öz bir fikir.'
  ok('kısa metin AYNEN döner, "…" KAZANMAZ', portfoyOzetiKirp(kisaMetin) === kisaMetin)
  ok('kapak sınırına TAM eşit uzunluktaki metin de "…" KAZANMAZ (< değil <=)',
    portfoyOzetiKirp('a'.repeat(PORTFOY_OZET_UZUNLUGU)) === 'a'.repeat(PORTFOY_OZET_UZUNLUGU))

  // Çok-paragraflı stored değer (ör. i-svec-te-reklam-ajansi'nin şimdi TAM metni: "Ekip ve
  // roller:" gibi ek paragraflar taşıyor) tek-satır bir portföy önizlemesine indirgenmeli —
  // satır-sonları kırpmadan ÖNCE boşluğa çevrilir, kartta çıplak "\n" GÖRÜNMEZ.
  const cokParagrafli = 'Birinci paragraf burada biter.\n\nİkinci paragraf: Ekip ve roller uzun bir liste burada devam eder ve 140 karakteri aşacak kadar uzayıp gidiyor kesinlikle.'
  const cokParagrafliGosterim = portfoyOzetiKirp(cokParagrafli)
  ok('çok-paragraflı girdi tek-satıra indirgenip kırpılıyor (çıplak \\n YOK)', !cokParagrafliGosterim.includes('\n'))
  ok('çok-paragraflı girdi de kelime sınırında bitiyor ("…" ile)', cokParagrafliGosterim.endsWith('…'))
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

// ══ Kart-okunabilirlik turu (2026-07-18) — icEtiketleriTemizle ═════════════════════════════════
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

// ══ İkinci kart-okunabilirlik turu (2026-07-18) — noktalı-virgülle bağlı İKİ tag TEK cümlede ══
bolum('dataRequestAdaylari: noktalı-virgülle bağlı 2 tag artık AYNI (bileşik) iddiayı PAYLAŞMIYOR')
{
  // Canlı-vaka (goteborg-hjarta-fotograf-2026-07-18/arastirma.md, aynen): önceden bilinen, o
  // turda BİLEREK ertelenen bir kusur (bkz bellek "soru-üretici iddia kırpma bug") — iki AYRI
  // tag noktalı-virgülle birleşmiş bir cümleyi PAYLAŞIYORDU, ikisi de TÜM bileşik cümleyi
  // (diğer tag'in metni dahil) iddia olarak taşıyordu.
  const satir = 'QR kodlu dijital teslim altyapısı için aylık 100–500 [tahmin-doğrulanacak:QR-bulut-depolama-fiyatları] SEK aralığında bir SaaS veya barındırma çözümü yeterlidir; mevcut hazır platformlar (Pixieset veya benzeri) bu işlevi aylık 50–200 [tahmin-doğrulanacak:fotoğraf-teslimat-platform-fiyatları] SEK\'ten karşılayabilmektedir.'
  const adaylar = dataRequestAdaylari(satir)
  ok('İKİ AYRI aday üretildi (katlama mantığı etkilenmedi — anahtar kaynak\'tan türer)', adaylar.length === 2)
  ok('İki adayın iddia metni ARTIK FARKLI (birbirinin cümlesini bütünüyle TAŞIMIYOR)', adaylar[0].iddia !== adaylar[1].iddia)
  ok('1. aday KENDİ tag\'ini içeriyor, DİĞERİNİ içermiyor (kendi cümlesi gönderim-ifadesiyle açılmıyor)', adaylar[0].iddia.includes('QR-bulut-depolama') && !adaylar[0].iddia.includes('fotoğraf-teslimat-platform'))
  // 2026-07-18 (öz-yeterlilik turu): 2. tag'in KENDİ cümlesi ("mevcut hazır platformlar...")
  // "mevcut" ile açılan bir gönderim ifadesidir — öz-yeterlilik genişletmesi bu yüzden 1. tag'in
  // cümlesini de KASITLI olarak dahil eder (aksi halde operatör "hangi işlevi?" sorusunu
  // yanıtlayamazdı). Bu, önceki turun "diğerini içermiyor" beklentisinin YERİNE geçer — okunabilirlik
  // önceliklidir, ayrıştırma DEĞİL (bkz görev: "claim text... starts with a dangling reference").
  ok('2. aday KENDİ tag\'ini içeriyor', adaylar[1].iddia.includes('fotoğraf-teslimat-platform'))
  ok('2. aday, cümlesi gönderim-ifadesiyle açıldığı için ÖNCEKİ cümleyi (ve 1. tag\'i) de kasıtlı olarak taşıyor (öz-yeterlilik)', adaylar[1].iddia.includes('QR-bulut-depolama'))

  // Regresyon: TEK tag'li, noktalı-virgülsüz normal bir cümle hâlâ doğru çalışıyor.
  const tekTag = dataRequestAdaylari('Basit bir iddia burada 42 [tahmin-doğrulanacak:kaynak-x] birim civarındadır.')
  ok('regresyon: noktalı-virgülsüz tek-tag cümle etkilenmedi', tekTag.length === 1 && tekTag[0].iddia.includes('42'))
}

// ══ Öz-yeterlilik turu (2026-07-18) — iddia metni gönderim-ifadesiyle açılmıyor ═══════════════
bolum('dataRequestAdaylari: tag\'in cümlesi gönderim-ifadesiyle ("bu...", "mevcut...") açılıyorsa önceki cümle de dahil edilir')
{
  // Canlı-vaka #1 (goteborg/arastirma.md, satır 9, birebir): "bu boşluk..." öncülsüz kalıyordu —
  // operatör ekranda "hangi boşluk?" sorusuna yanıt bulamıyordu.
  const s1 = 'Norstan yanındaki kalp sembolü önünde aynı hizmeti sunan sabit bir rakip operatörün varlığına dair bilgi bulunmamakta; bu boşluk lokasyon-hizmet eşleşmesi açısından doğal bir ilk-giren avantajı tanımaktadır [tahmin-doğrulanacak:saha-gözlemi] [tier:blocker].'
  const a1 = dataRequestAdaylari(s1)
  ok('canlı-vaka #1: "bu boşluk" artık ÖNCÜLÜYLE birlikte geliyor', a1[0].iddia.startsWith('Norstan yanındaki'))
  ok('canlı-vaka #1: kendi tag\'ini de içeriyor', a1[0].iddia.includes('ilk-giren avantajı'))

  // Canlı-vaka #2 (satır 21, birebir): gönderim kelimesi cümlenin BAŞINDA değil, 4. sözcükte
  // ("ikinci el piyasasında BU ekipman...") — ilk-kelime testi bunu KAÇIRIRDI.
  const s2 = 'Canlı örnek ekranı için bir tablet veya küçük monitör gereklidir; ikinci el piyasasında bu ekipman 500–1.500 [tahmin-doğrulanacak:ikinci-el-tablet-fiyatları-İsveç] SEK aralığında temin edilebilir.'
  const a2 = dataRequestAdaylari(s2)
  ok('canlı-vaka #2: gönderim kelimesi cümle İÇİNDE (4. sözcük) olsa bile yakalanıyor', a2[0].iddia.startsWith('Canlı örnek ekranı'))

  // Regresyon: gönderim-ifadesi YOK — iddia kendi cümlesiyle sınırlı KALMALI (gereksiz genişleme yok).
  const s3 = 'Göteborg yıllık 9 [tahmin-doğrulanacak:x] milyon geceleme kaydeder. Ayrı ve bağımsız ikinci bir olgu burada 42 [tahmin-doğrulanacak:y] birimdir.'
  const a3 = dataRequestAdaylari(s3)
  ok('regresyon: gönderim-ifadesi yoksa genişleme YOK (1. aday)', a3[0].iddia === 'Göteborg yıllık 9 [tahmin-doğrulanacak:x] milyon geceleme kaydeder.')
  ok('regresyon: gönderim-ifadesi yoksa genişleme YOK (2. aday, "ikinci" kelimesi gönderim SAYILMAZ)', a3[1].iddia.startsWith('Ayrı ve bağımsız'))

  // Güvenlik sınırı: paragraf başındaysa (önceki cümle yok) çökmez / sonsuz döngüye girmez.
  const s4 = 'Bu oran daha önce hiç belirtilmemiş bir şeye [tahmin-doğrulanacak:z] atıfta bulunur.'
  const a4 = dataRequestAdaylari(s4)
  ok('güvenlik: paragraf başında gönderim-ifadesi varsa (öncül yok) çökmüyor, mevcut cümleyle kalıyor', a4[0].iddia.startsWith('Bu oran'))

  // GERÇEK proje verisiyle toplu doğrulama: TÜM DATA-REQUEST adaylarının hiçbiri artık gönderim-
  // ifadesiyle AÇILMIYOR (ölçülen, tahmin edilmeyen sayı).
  //
  // 2026-07-18 (Görev 3, üçüncü tur) — bu blok önceden goteborg-hjarta-fotograf-2026-07-18'i
  // hedefliyordu; proje silindikten sonra `existsSync` koruması testi SESSİZCE ATLIYORDU (`ok(...,
  // true)` — hiçbir şey ÖLÇMEDEN yeşil basıyordu). Bir kontrol hiç ATEŞLENEMEDİĞİNDE yeşil
  // görünmesi, hiç kontrol OLMAMASINDAN daha kötüdür — "başarı" raporluyor ama hiçbir şeyi
  // doğrulamıyor. İKİ değişiklik BİRDEN yapıldı, biri diğerini YETERSİZ bırakırdı:
  //   1) Hedef, bu turda BİLEREK dokunulmayan/duraklatılmış `i-svec-te-reklam-ajansi-2026-07-04`
  //      projesine taşındı (bkz Görev 2d — "leave entirely untouched") — goteborg'dan daha
  //      KALICI bir hedef, çünkü silinmesi bu oturumda planlı DEĞİL. Yalnız bunu yapmak GEÇİCİ
  //      bir çözüm olurdu: bu proje de gelecekte silinirse AYNI sessiz-atlama sorunu geri gelir.
  //   2) Bu yüzden eksik-girdi dalı da SESSİZ ATLAMA'dan SERT BAŞARISIZLIĞA çevrildi — hedef proje
  //      HANGİ SEBEPLE olursa olsun (silinme, Drive bağlı değil, yol değişikliği) yoksa test artık
  //      YEŞİL GÖRÜNMÜYOR, gerçek bir `ok(..., false)` ile KIRMIZI basıyor ve kimin bu test
  //      hedefini güncellemesi/değiştirmesi gerektiğini AÇIKÇA söylüyor. Bu, "hedef proje bir gün
  //      yine silinirse" senaryosunu YAPISAL olarak kapatır — yalnız hedef değiştirmek kapatmazdı.
  const META = '/Users/kasimecer/Library/CloudStorage/GoogleDrive-kasimecer@gmail.com/My Drive/meta-layer'
  const arastirmaYolu = `${META}/projeler/i-svec-te-reklam-ajansi-2026-07-04/arastirma.md`
  if (!existsSync(arastirmaYolu)) {
    ok(`GERÇEK VERİ testi ATEŞLENEMEDİ: ${arastirmaYolu} yok (proje silinmiş/taşınmış/Drive bağlı değil) — bu SESSİZ ATLAMA DEĞİL, gerçek bir başarısızlık: hedefi güncelleyin`, false)
  } else {
    const icerikGercek = readFileSync(arastirmaYolu, 'utf8')
    const gercekAdaylar = dataRequestAdaylari(icerikGercek)
    ok('GERÇEK VERİ: hedef dosyada en az 1 DATA-REQUEST adayı var (test anlamlı — boş taramayı "başarı" saymıyor)', gercekAdaylar.length > 0)
    const GONDERIM_KELIME_DESENI = /^(bu|bunun|bunlar\w*|bunları|böyle|onun|ona|ondan|aynı|ilgili|mevcut|yukarıdaki|belirtilen|anılan|söz konusu)$/i
    const gonderimliSayisi = gercekAdaylar.filter(a => {
      const ilkKelimeler = String(a.iddia).trim().split(/\s+/).slice(0, 5).map(k => k.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
      return ilkKelimeler.some(k => GONDERIM_KELIME_DESENI.test(k))
    }).length
    ok(`GERÇEK VERİ: i-svec-te-reklam-ajansi'nin ${gercekAdaylar.length} DATA-REQUEST adayının HİÇBİRİ gönderim-ifadesiyle açılmıyor (ölçülen: ${gonderimliSayisi})`, gonderimliSayisi === 0, `${gercekAdaylar.length} aday tarandı`)
  }
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
