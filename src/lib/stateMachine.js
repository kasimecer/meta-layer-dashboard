// meta-layer-core — Kart şeması v1 + Durum-makinesi v1
// KK-47/48: yapı SABİTLENMEMİŞTİ; bu dosya şema + durum-makinesini v1 olarak KİLİTLER.
// Gerçek kullanımla rafine edilir. Saf JS (React yok) → node ile de koşar.

/**
 * @typedef {Object} Kart  — Kart şeması v1
 * @property {string}  id
 * @property {'ilerleme'|'girdi-talebi'|'build-task'|'feedback'} tip
 * @property {string}  durum           // tip'e bağlı; bkz AKIS
 * @property {string}  ozet            // kapalıyken görünen tek satır
 * @property {string}  detay           // açılınca görünen
 * @property {?string} partner_cevap   // girdi-talebi cevaplanınca; ilerleme'de Barış verbatim alıntısı
 * @property {string}  olusturma       // ISO tarih
 * @property {string}  guncelleme      // ISO tarih
 */

export const TIP = {
  ILERLEME: 'ilerleme',
  GIRDI_TALEBI: 'girdi-talebi',
  BUILD_TASK: 'build-task',
  FEEDBACK: 'feedback',
}

export const DURUM = {
  BITTI: 'bitti',
  CEVAP_BEKLIYOR: 'cevap-bekliyor',
  CEVAPLANDI: 'cevaplandi',
  YAPILACAK: 'yapilacak',
  YAPILIYOR: 'yapiliyor',
  ACIK: 'acik',
  ELE_ALINDI: 'ele-alindi',
}

// Tip başına TEK-YÖN durum akışı (yalnız bitişik ileri adım). UI durum'a göre render eder.
//   ilerleme:     bitti (statik)
//   girdi-talebi: cevap-bekliyor → cevaplandi
//   build-task:   yapilacak → yapiliyor → bitti
//   feedback:     acik → ele-alindi
export const AKIS = {
  'ilerleme':     ['bitti'],
  'girdi-talebi': ['cevap-bekliyor', 'cevaplandi'],
  'build-task':   ['yapilacak', 'yapiliyor', 'bitti'],
  'feedback':     ['acik', 'ele-alindi'],
}

export function baslangicDurum(tip) {
  const a = AKIS[tip]
  return a ? a[0] : undefined
}

export function gecerliDurumMu(tip, durum) {
  return (AKIS[tip] ?? []).includes(durum)
}

// Bir adım ileri; son durumda null.
export function sonrakiDurum(tip, durum) {
  const a = AKIS[tip] ?? []
  const i = a.indexOf(durum)
  return (i < 0 || i === a.length - 1) ? null : a[i + 1]
}

// Tek-yön: yalnız bitişik ileri adım geçerli (geri/atlama reddedilir).
export function gecisGecerliMi(tip, from, to) {
  const a = AKIS[tip] ?? []
  const fi = a.indexOf(from)
  const ti = a.indexOf(to)
  return fi >= 0 && ti === fi + 1
}

// Saf: yeni kart döndürür (mutasyon yok), guncelleme'yi damgalar.
export function gecisUygula(kart, hedefDurum) {
  if (!gecisGecerliMi(kart.tip, kart.durum, hedefDurum)) {
    throw new Error(`Geçersiz geçiş: ${kart.tip} "${kart.durum}" → "${hedefDurum}"`)
  }
  return { ...kart, durum: hedefDurum, guncelleme: new Date().toISOString() }
}

// Yükleme-anı şema doğrulaması (v1 minimum). Hata listesi döndürür ([] = temiz).
export function kartDogrula(k) {
  const hatalar = []
  if (!k || !k.id) hatalar.push('id eksik')
  if (!AKIS[k?.tip]) hatalar.push(`bilinmeyen tip: ${k?.tip}`)
  else if (!gecerliDurumMu(k.tip, k.durum)) hatalar.push(`${k.tip} için geçersiz durum: ${k.durum}`)
  if (k?.ozet == null) hatalar.push('ozet eksik')
  return hatalar
}
