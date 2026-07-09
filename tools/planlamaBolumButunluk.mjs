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
// gözlemlendi. Bu kontrol AYNI hataya düşmemek için: (a) konu-anahtar-kelimeleri TEK bir sabit
// başlık metniyle DEĞİL, eş-anlamlı gruplarla eşleşir (paraphrase toleranslı), (b) her bölüm için
// yalnız 1-2 EN merkezi konu istenir (hedefAciklama'nın HER cümlesini zorunlu KILMAZ), (c) minBayt
// eşiği her bölüm türü için ayrı ayarlanır (tek küresel sabit DEĞİL) ve mevcut hermetik test
// fikstürlerinin GERÇEK boyutunun altında kalacak şekilde kalibre edilir — birincil kırpılma-
// dedektörü konu/ilk-satır kontrolleridir, minBayt yalnız EK bir savunma katmanıdır.

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

// Beklenen konu gruplarından HANGİLERİ içerikte hiç geçmiyor (grup İÇİNDE herhangi bir eş-anlamlı
// yeterli — OR). Her grup {grup[0]} etiketiyle raporlanır (ilk eleman = insan-okunur temsilci ad).
export function eksikKonularBul(icerik, beklenenKonular) {
  const metin = String(icerik ?? '').toLocaleLowerCase('tr')
  const eksik = []
  for (const grup of (beklenenKonular ?? [])) {
    const varMi = grup.some(kelime => metin.includes(kelime.toLocaleLowerCase('tr')))
    if (!varMi) eksik.push(grup[0])
  }
  return eksik
}

// Ana bütünlük kontrolü — bolumKapidanGecerMi tarafından SATIR-ETİKETİ kuralından ÖNCE çağrılır.
// tanim: BOLUM_TANIMLARI[bolumId] (minBayt, beklenenKonular alanlarını taşır — ikisi de yoksa/boşsa
// o kontrol atlanır, bölüm türüne göre farklı sıkılıkta olması BEKLENİR — bkz görev notu: "tek
// küresel sabit değil, bölüm-türüne göre kalibre").
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

  const eksikKonular = eksikKonularBul(metin, tanim?.beklenenKonular)
  if (eksikKonular.length > 0) {
    return {
      gecti: false,
      neden: `${bolumId}: beklenen konu(lar) içerikte hiç geçmiyor: ${eksikKonular.join(', ')} — bölüm eksik/kırpılmış olabilir`,
    }
  }

  return { gecti: true }
}
