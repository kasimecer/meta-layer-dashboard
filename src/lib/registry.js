// meta-layer-core — Proje registry yardımcıları (PROJE-seviyesi; kart-seviyesinden AYRI).
// Portföy = projeler-arası denge + zaman-bazlı sıralama (KK-48 v1).
// efor/deger = MANUEL etiket; skor formülü YOK (ayrı açık-madde).

/**
 * @typedef {Object} Proje  — Registry şeması v2 (2026-07-19, Görev 2)
 * @property {string}  id
 * @property {string}  ad
 * @property {'bilinmiyor'|'fikir'|'genesis'|'premise'|'arastirma'|'strateji'|'master-plan'|'tamamlandi-elestiri-bekliyor'|'tamamlandi'} durum
 *   — ARTIK stored/write-once bir alan DEĞİL: build-time'da GERÇEK pipeline durumundan
 *   (planlama-durum.json) türetilir (bkz scripts/build-card-data.js + pipelineDurumFazHesapla).
 *   Kanonik registry.json'da bu alan taşınsa bile YOK SAYILIR — TEK gerçek kaynak pipeline
 *   state'idir. 'bilinmiyor' = bu proje için hiç pipeline state YOK (henüz planlama başlamamış
 *   VEYA bu sistemin dışında/öncesinde yaratılmış) — 'fikir' ile KARIŞTIRILMAMALI: 'fikir' "pipeline
 *   başladı, henüz hiçbir aşama üretmedi" demektir (GERÇEK bilgi); 'bilinmiyor' "bu konuda HİÇ
 *   bilgimiz yok" demektir (bilginin YOKLUĞU — sahte bir "fikir" değeriyle GİZLENMEZ).
 * @property {'solo'|'uzman-ortak'|'eş-ortak'|'ortak-tek'} rol
 * @property {'aktif'|'duraklı'} status
 * @property {'düşük'|'orta'|'yüksek'|'?'} efor
 * @property {'düşük'|'orta'|'yüksek'|'?'} deger
 * @property {?string} zaman_son_aktivite
 * @property {string}  ozet
 */

// Yaşam-döngüsü sırası (sol→sağ ilerleme) — GERÇEK pipeline aşama adlarıyla (ASAMA_SIRASI,
// tools/planlamaDurumMakinesiV2.mjs) BİREBİR uyumlu. ÖNCEKİ sürüm (v1) kendi icat ettiği bir
// sözlük kullanıyordu ('araştırma' 'premise'DEN ÖNCE sıralıydı) — ki bu GERÇEK pipeline sırasıyla
// (genesis→premise→arastirma→strateji→master-plan) ÇELİŞİYORDU; hiçbir kod bu alanı GERÇEK
// pipeline'dan türetmediği için bu çelişki hiç fark edilmemişti (bkz Görev 3 bulgusu — alan hiç
// güncellenmiyordu). 'bilinmiyor' EN BAŞTA (en düşük sıra) — "bilmiyoruz" hiçbir zaman "en ileri"
// gibi SIRALANMAMALI.
export const DURUM_YASAM = ['bilinmiyor', 'fikir', 'genesis', 'premise', 'arastirma', 'strateji', 'master-plan', 'tamamlandi-elestiri-bekliyor', 'tamamlandi']

export const DURUM_RENK = {
  'bilinmiyor':                    { bg: '#f4f4f5', fg: '#a1a1aa' },
  'fikir':                         { bg: '#f1f5f9', fg: '#475569' },
  'genesis':                       { bg: '#e0e7ff', fg: '#4338ca' },
  'premise':                       { bg: '#ddd6fe', fg: '#6d28d9' },
  'arastirma':                     { bg: '#dbeafe', fg: '#1d4ed8' },
  'strateji':                      { bg: '#cffafe', fg: '#0e7490' },
  'master-plan':                   { bg: '#fef9c3', fg: '#854d0e' },
  'tamamlandi-elestiri-bekliyor':  { bg: '#fed7aa', fg: '#9a3412' },
  'tamamlandi':                    { bg: '#bbf7d0', fg: '#15803d' },
}

export const ETIKET_RENK = {
  'düşük':  { bg: '#f1f5f9', fg: '#64748b' },
  'orta':   { bg: '#fef9c3', fg: '#854d0e' },
  'yüksek': { bg: '#fed7aa', fg: '#9a3412' },
  '?':      { bg: '#f1f5f9', fg: '#94a3b8' },
}

// 2026-07-19 (Görev 2) — `durum`/`faz`'ın TEK gerçek kaynağı: bu fonksiyon, gerçek pipeline
// state'inden (tools/planlamaDurumMakinesiV2.mjs:stateYukle çıktısı) türetir. SAF fonksiyon —
// dosya OKUMAZ (çağıran, `state`'i ÖNCEDEN yüklemiş olmalı) — bu yüzden tarayıcıda da (JSDoc
// üstündeki modülün geri kalanı gibi) güvenle çalışır/test edilir.
//
// `state` parametresi İKİ değerden biri OLMALI:
//   - `stateYukle(nsYolu, id)` çıktısı (planlama-durum.json GERÇEKTEN varsa)
//   - `null` (dosya YOKSA — çağıran ÖNCEDEN `existsSync` kontrolü yapmış olmalı)
// KRİTİK: `stateYukle`'nin KENDİSİ dosya yoksa SESSİZCE sentetik bir "taze genesis" state
// SENTEZLER (bkz boslukState) — o sentetik state BU FONKSİYONA ASLA geçirilmemelidir, aksi
// hâlde "bu proje için hiç bilgimiz yok" durumu "henüz başlamadı" gibi GÖRÜNÜR — tam olarak bu
// görevin kaçınmaya çalıştığı "gerçek bilgi gibi görünen sahte varsayılan" hatası.
export const PIPELINE_BILGISI_YOK = 'bilinmiyor'

export function pipelineDurumFazHesapla(state) {
  if (!state) return { durum: PIPELINE_BILGISI_YOK, faz: PIPELINE_BILGISI_YOK }
  const asama = state.aktif_asama
  if (asama === 'tamamlandi') {
    // 5-aşama yürüyüşü bitti — ama Kritik Pasaj (elestiri) AYRI bir birim, kendi durumunu
    // taşır (bkz tools/elestiriPasi.mjs). "tamamlandi" tek başına, elestiri hâlâ operatör
    // onayı bekliyorken/donduruluşken YANILTICI olurdu (canlı-vaka: fotball-podcast-2026-07-09,
    // aktif_asama=tamamlandi AMA elestiri.durum=onay-bekliyor). AMA: 'bekliyor' — kritik pasaj
    // HİÇ TETİKLENMEMİŞ demektir (bkz tools/planlamaDurumMakinesiV2.mjs:bosAsama varsayılanı) —
    // bu, "hâlâ blokluyor" DEĞİL "bu projenin akışında hiç devreye girmedi" demektir (canlı-vaka:
    // nevresim-sabitleyici-2026-07-01 — elestiri hiç çalıştırılmamış, proje yine de TAM anlamıyla
    // bitmiş). Yalnız GERÇEKTEN devam eden/bekleyen durumlar (kosuyor/onay-bekliyor/donduruldu)
    // "bekliyor" sayılır.
    const elestiriDurum = state.elestiri?.durum
    if (elestiriDurum && elestiriDurum !== 'gecti' && elestiriDurum !== 'bekliyor') {
      return { durum: 'tamamlandi-elestiri-bekliyor', faz: 'planlama' }
    }
    return { durum: 'tamamlandi', faz: 'planlama' }
  }
  const asamaDurum = state.asamalar?.[asama]
  if (asama === 'genesis' && (!asamaDurum || asamaDurum.durum === 'bekliyor')) {
    // Pipeline başladı ama genesis dahi HENÜZ üretilmedi — bu, GERÇEKTEN "fikir" aşamasıdır
    // (eskiden write-once yazılan sabit değerle AYNI ANLAMA gelir, ama şimdi GERÇEK durumdan
    // doğrulanıyor, dondurulmuş bir varsayım DEĞİL).
    return { durum: 'fikir', faz: 'planlama' }
  }
  // Aktif aşamanın KENDİ adı — genesis/premise/arastirma/strateji/master-plan; en az bir kısmı
  // (kosuyor/onay-bekliyor/donduruldu/gecti) üretilmiş demektir. Tahmin/yorum YOK — pipeline'ın
  // KENDİ ASAMA_SIRASI adı, olduğu gibi.
  return { durum: asama ?? PIPELINE_BILGISI_YOK, faz: 'planlama' }
}

export function durumSira(durum) {
  const i = DURUM_YASAM.indexOf(durum)
  return i < 0 ? -1 : i
}

// Basit v1 sıralama (KK-48 v1):
//   'durum'    → yaşam-döngüsünde ileri olan üstte; eşitlikte aktif önce
//   'aktivite' → en yeni son-aktivite üstte (null en altta)
export function sirala(projeler, mod) {
  const x = [...projeler]
  if (mod === 'aktivite') {
    x.sort((a, b) => (b.zaman_son_aktivite || '').localeCompare(a.zaman_son_aktivite || ''))
  } else {
    x.sort((a, b) => {
      const d = durumSira(b.durum) - durumSira(a.durum)
      if (d !== 0) return d
      return (a.status === 'duraklı' ? 1 : 0) - (b.status === 'duraklı' ? 1 : 0)
    })
  }
  return x
}
