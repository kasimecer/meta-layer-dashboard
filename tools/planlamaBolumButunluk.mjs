// Master-plan BÖLÜM BÜTÜNLÜK (completeness) kontrolü — planlamaBolumKapilari.mjs'nin SATIR-
// ETİKETİ kuralından (bolumIcerikGovdesiKontrolEt) TAMAMEN AYRI bir eksen: o kural yalnız VAR OLAN
// satırların etiketli olup olmadığına bakar, bir dosyanın KIRPILMIŞ/EKSİK olup olmadığına DEĞİL —
// temiz-etiketli bir kuyruk, dosyanın BAŞI kırpılmış olsa bile o kuraldan GEÇER (gözlemlenen gerçek
// vaka: bütçe/finansal bölüm 4436 bayta kırpıldı, ilk alt-konuları eksikti, ilk satırı cümle-ortası
// bir parçaydı — ama satır-etiketi kuralından GEÇTİ). Bu dosya o sınıf hatayı yakalar.
//
// KASITLI OLARAK LENIENT: 2026-07-06'da (bkz canliExecutor.mjs'deki executor fonksiyonu üstündeki
// yorum) genel bir "ilk #-başlığından öncesini kırp" sarmalayıcı-temizleme heuristiği GERİ ALINDI —
// risk-varsayimlar'da içeriğin ORTASINDAN bir kelimeyi keserek sessiz veri kaybına yol açtığı
// gözlemlendi. Bu kontrol AYNI hataya düşmemek için: (a) beklenen-başlık anahtar-kelimeleri TEK
// bir sabit başlık metniyle DEĞİL, eş-anlamlı gruplarla eşleşir (paraphrase toleranslı), (b) her
// bölüm için yalnız 1-2 EN merkezi konu istenir (hedefAciklama'nın HER cümlesini zorunlu KILMAZ),
// (c) minBayt eşiği her bölüm türü için ayrı ayarlanır (tek küresel sabit DEĞİL) ve mevcut
// hermetik test fikstürlerinin GERÇEK boyutunun altında kalacak şekilde kalibre edilir — birincil
// kırpılma-dedektörü başlık/ilk-satır kontrolleridir, minBayt yalnız EK bir savunma katmanıdır.
//
// 2026-07-16 GÜÇLENDİRME (P2): eksikKonularBul eskiden anahtar-kelimeyi belgenin TAMAMINDA (her
// yerde, .includes()) arıyordu — bu, kırpılmış bir bölümün HAYATTA KALAN kuyruğunda beklenen
// kelimenin ALAKASIZ bir cümlede geçmesi durumunda GEÇTİ vermesine yol açtı (gerçek vaka:
// bütce-finansal 4436 bayta kırpıldı, "başlangıç" ve "nakit" kelimeleri kuyrukta alakasız
// bağlamda geçtiği için kapı YANLIŞLIKLA geçti verdi). Artık arama yüzeyi yalnız BAŞLIK
// SATIRLARI (basliklariCikar) — bir konunun kelimesi gövde metninde HERHANGİ BİR YERDE geçmesi
// ARTIK YETMEZ, o konuyu TANIMLAYAN bir başlık satırının GERÇEKTEN var olması gerekir (yapısal/
// konumsal farkındalık). Gerçek üretilmiş bölüm çıktıları (fotball-podcast-2026-07-09 üzerinde
// doğrulandı — her 15 bölüm de model tarafından zengin ##/### başlık yapısıyla üretiliyor, prompt
// bunu ZORUNLU KILMASA bile) bu değişiklikten ETKİLENMEDİ; yalnız "kelime var ama o bölümü
// tanımlayan başlık YOK" sınıfı artık doğru biçimde REDDEDİLİYOR.

const BASLIK_KARAKTERI_DESENI = /^[#*"'„«\d(]/

// İlk anlamlı (boş olmayan) satır cümle-ortası bir PARÇA gibi mi görünüyor? Başlık işaretleri
// (#, *, tırnak, rakam/liste-öğesi, parantez) veya büyük harfle (TR-farkında) başlıyorsa HAYIR —
// gerçek bir başlık/cümle başlangıcı sayılır. Küçük harfle başlıyorsa (bir önceki, artık VAR
// OLMAYAN satırdan cümlenin devamı gibi) EVET — kırpılmışlık şüphesi.
export function ilkSatirParcaMi(icerik) {
  const satirlar = String(icerik ?? '').split('\n')
  const ilk = satirlar.find(s => s.trim().length > 0)
  if (ilk == null) return true // tamamen boş/whitespace-only içerik — eksik sayılır
  const t = ilk.trim()
  if (BASLIK_KARAKTERI_DESENI.test(t)) return false
  const ilkHarf = t.charAt(0)
  const buyukMu = ilkHarf !== ilkHarf.toLocaleLowerCase('tr') || ilkHarf === ilkHarf.toLocaleUpperCase('tr')
  // ilkHarf harf DEĞİLSE (ör. bir sembol) yukarıdaki karşılaştırma anlamsız kalır — güvenli
  // varsayılan: parça SAYMA (yalnız AÇIKÇA küçük-harf-Latin/Türkçe başlangıç işaretlenir).
  const harfMi = /\p{L}/u.test(ilkHarf)
  if (!harfMi) return false
  return !buyukMu
}

// Markdown BAŞLIK satırı deseni (## / ### / #### ... — H1 "#" DAHİL, bölümün KENDİ üst başlığı
// da geçerli bir eşleşme yüzeyidir).
const BASLIK_SATIRI_DESENI = /^#{1,6}\s+(.+)$/

// İçerikteki TÜM başlık satırlarının METNİNİ çıkarır (# işaretleri + baştaki/sondaki boşluk
// temizlenmiş) — eksikBasliklarBul'un ARAMA YÜZEYİ budur, gövde metninin TAMAMI DEĞİL. RAW
// (büyük/küçük harf DÖNÜŞTÜRÜLMEMİŞ) döner — karşılaştırma basliktaGecerMi'de, İKİ ayrı
// büyük/küçük-harf stratejisiyle yapılır (bkz orada). Numaralandırma önekleri ("1. ", "§1 — ",
// "2.1 ") KASITLI OLARAK KIRPILMADI — arama zaten alt-dize (includes) ile yapıldığı için önek
// eşleşmeyi ETKİLEMEZ; bir önek-kırpma denemesi modelin farklı numaralandırma biçimlerine
// (1. / §1 / 1a / hiç) karşı kırılgan ek bir varsayım katmanı eklerdi (bkz F0 "makine
// büyümesin" ilkesiyle aynı ruh).
export function basliklariCikar(icerik) {
  const basliklar = []
  for (const satir of String(icerik ?? '').split('\n')) {
    const m = BASLIK_SATIRI_DESENI.exec(satir)
    if (m) basliklar.push(m[1].trim())
  }
  return basliklar
}

// Bir başlık metninde bir kelimenin geçip geçmediğini İKİ büyük/küçük-harf stratejisiyle dener:
// TR-locale (Türkçe İ/I/ı/i kurallarını doğru uygular — Türkçe kelimeler için GEREKLİ) VE düz
// ASCII toLowerCase() (TR-locale'in yabancı KISALTMALARDA — KPI, MVP, SPEC gibi — 'I'yı Türkçe
// noktasız 'ı'ya çevirip yanlış-red ÜRETTİĞİ durumu yakalar; ör. "KPI".toLocaleLowerCase('tr')
// === "kpı" ("kpi" DEĞİL) — gerçek gözlemlenen vaka: olcumleme-kpi'nin "# Ölçümleme (KPI)"
// başlığı, TR-locale TEK BAŞINA kullanılsaydı kendi "kpi" eş-anlamlısıyla YANLIŞ-REDDEDİLİRDİ).
// İkisinden HERHANGİ BİRİ eşleşirse yeterli — Türkçe kelime + yabancı kısaltma karışık başlıklı
// içerikte (bu kod tabanının GERÇEK içeriğinde norm) HİÇBİRİ yanlış-red ÜRETMEZ.
function basliktaGecerMi(baslikRaw, kelimeRaw) {
  if (baslikRaw.toLocaleLowerCase('tr').includes(kelimeRaw.toLocaleLowerCase('tr'))) return true
  return baslikRaw.toLowerCase().includes(kelimeRaw.toLowerCase())
}

// Beklenen başlık gruplarından HANGİLERİ belgenin BAŞLIK SATIRLARINDA hiç geçmiyor (grup İÇİNDE
// herhangi bir eş-anlamlı yeterli — OR, paraphrase-toleranslı — ama artık yalnız başlık
// satırlarına karşı, bkz dosya-üstü 2026-07-16 notu). Her grup {grup[0]} etiketiyle raporlanır
// (ilk eleman = insan-okunur temsilci ad).
export function eksikBasliklarBul(icerik, beklenenBasliklar) {
  const basliklar = basliklariCikar(icerik)
  const eksik = []
  for (const grup of (beklenenBasliklar ?? [])) {
    const varMi = grup.some(kelime => basliklar.some(b => basliktaGecerMi(b, kelime)))
    if (!varMi) eksik.push(grup[0])
  }
  return eksik
}

// Ana bütünlük kontrolü — bolumKapidanGecerMi tarafından SATIR-ETİKETİ kuralından ÖNCE çağrılır.
// tanim: BOLUM_TANIMLARI[bolumId] (minBayt, beklenenBasliklar alanlarını taşır — ikisi de
// yoksa/boşsa o kontrol atlanır, bölüm türüne göre farklı sıkılıkta olması BEKLENİR — bkz görev
// notu: "tek küresel sabit değil, bölüm-türüne göre kalibre").
export function bolumButunlukKontrolEt(bolumId, icerik, tanim) {
  const metin = String(icerik ?? '')
  const bayt = Buffer.byteLength(metin, 'utf8')
  const minBayt = tanim?.minBayt ?? 0

  if (bayt < minBayt) {
    return {
      gecti: false,
      neden: `${bolumId}: içerik beklenenden çok kısa (${bayt} bayt, bu bölüm-türü için beklenen ≥${minBayt} bayt) — kırpılmış/eksik yazım olabilir`,
    }
  }

  if (ilkSatirParcaMi(metin)) {
    return {
      gecti: false,
      neden: `${bolumId}: ilk satır bir başlık/cümle başlangıcı gibi görünmüyor (küçük harfle başlıyor) — dosyanın BAŞI kırpılmış olabilir`,
    }
  }

  const eksikBasliklar = eksikBasliklarBul(metin, tanim?.beklenenBasliklar)
  if (eksikBasliklar.length > 0) {
    return {
      gecti: false,
      neden: `${bolumId}: beklenen başlık(lar) belge başlıklarında hiç geçmiyor: ${eksikBasliklar.join(', ')} — ` +
             `bölüm eksik/kırpılmış olabilir (kelime gövde metninde geçse bile, o bölümü tanımlayan bir başlık satırı YOK)`,
    }
  }

  return { gecti: true }
}
