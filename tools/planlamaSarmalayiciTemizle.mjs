// Executor çıktısı sohbet-sarmalayıcı (pre/postamble) temizliği.
//
// 2026-07-06'da (bkz tools/canliExecutor.mjs'nin executor fonksiyonu üstündeki tarihli yorum)
// genel bir "ilk #-başlığından öncesini kırp" heuristiği denendi ve GERİ ALINDI — risk-
// varsayimlar'da içeriğin ORTASINDAN bir kelimeyi keserek SESSİZ VERİ KAYBINA yol açtığı
// gözlemlendi (muhtemelen gövde içinde satır-başı "#" ile başlayan alakasız bir ifade gerçek
// başlıkmış gibi yanlış eşleşti). Yanlış-pozitif maliyeti (sessiz içerik kaybı) yanlış-negatif
// maliyetinden (görünür sarmalayıcı metin, kapı zaten statüsüz-satır olarak yakalar) ÇOK daha
// yüksektir.
//
// BU MODÜL O HATAYA DÜŞMEMEK için KASITLI OLARAK dar kapsamlı:
//   - Yalnız BİLİNEN, SPESİFİK desenleri arar (genel "bir başlık bul" araması YOK).
//   - Yalnız metnin MUTLAK BAŞINDA (^ — index 0) veya MUTLAK SONUNDA ($ — string sonu) eşleşir;
//     ortada bir yerde asla arama yapmaz.
//   - Eşleşme yoksa içerik BİREBİR aynen döner (no-op) — "belki budur" tahminiyle KIRPMA YOK.
//   - En fazla BİR ön-sarmalayıcı + BİR art-sarmalayıcı soyulur (ilk eşleşen desen yeterli).

const ON_SARMALAYICI_DESENLERI = [
  // "Format confirmed", "Format onaylandı" vb. tek-satırlık meta-yorum — MUTLAK baştan.
  /^\s*(format (confirmed|onaylandı)|onaylandı[,:]?\s*format)[^\n]*\n+/i,
  // Bölüm-giriş cümlesi: "İşte <X> bölümü:", "Aşağıda ...:", "Here is/here's the ... section:"
  // — MUTLAK baştan, İÇERİK satırı DEĞİL (satırın TAMAMI giriş cümlesi, iki-nokta-üst-üste ile biter).
  /^\s*(İşte|Aşağıda|Here(?:'s| is))\b[^\n]{0,120}:[ \t]*\n+/i,
]

const ART_SARMALAYICI_DESENLERI = [
  // "(Kaydedildi: ...)", "Saved to registry.", "Registry updated.", "Dosyaya kaydedildi" vb. —
  // MUTLAK SONDAKİ ayrı paragraf/satır (önce boş-satır ayracı, \s*$ ile string sonuna kadar).
  // Gövdenin ORTASINDA geçen "kayıt/kaydedildi" kelimesine DOKUNMAZ (yalnız EN SONDAKİ ayrı blok).
  /\n+[ \t]*\(?(?:saved|kaydedildi|registry updated|kayıt güncellendi|dosya(?:ya)? kaydedildi)[^\n]*\)?[ \t]*\n*$/i,
]

/**
 * @param {string} metin — executor'dan gelen ham çıktı
 * @returns {{ temiz:string, onSoyuldu:string|null, artSoyuldu:string|null, degisti:boolean }}
 */
export function executorSarmalayicisiniTemizle(metin) {
  let sonuc = String(metin ?? '')
  let onSoyuldu = null
  let artSoyuldu = null

  for (const desen of ON_SARMALAYICI_DESENLERI) {
    const m = desen.exec(sonuc)
    if (m && m.index === 0) {
      onSoyuldu = m[0]
      sonuc = sonuc.slice(m[0].length)
      break
    }
  }

  for (const desen of ART_SARMALAYICI_DESENLERI) {
    const m = desen.exec(sonuc)
    if (m && m.index + m[0].length === sonuc.length) {
      artSoyuldu = m[0]
      sonuc = sonuc.slice(0, m.index)
      // \n+ açgözlü eşleşmesi, gövdenin KENDİ tek sondaki satır-sonunu da yutabilir (boş-satır
      // ayracıyla birlikte) — dosya konvansiyonunu (tek sondaki \n) geri yükle.
      if (sonuc.length > 0 && !sonuc.endsWith('\n')) sonuc += '\n'
      break
    }
  }

  return { temiz: sonuc, onSoyuldu, artSoyuldu, degisti: onSoyuldu != null || artSoyuldu != null }
}
