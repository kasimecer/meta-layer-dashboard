// meta-layer-core — Açık-soru durum özeti (READ-ONLY, MODELSİZ).
//
// PAYLAŞILAN ÇEKİRDEK: scripts/planlama-baslat.mjs (CLI, Türkçe konsol biçimlendirmesi) VE
// scripts/build-card-data.js (tarayıcı için JSON anlık-görüntü) AYNI acikSoruDurum'u çağırır —
// "tarayıcı ve CLI aynı olguda hemfikir" garantisi buradan gelir (tek fonksiyon, iki çağıran).
// tools/ katmanında yaşar (scripts/*.mjs başka bir scripts/*.mjs'yi İTHAL ETMEZ — repo
// konvansiyonu); her iki çağıran da yalnız bu saf modülden okur.

import { sorulariOku, yanitlariHamOku, yanitButunluk, acikSorular, atlananlar } from './planlamaSorular.mjs'

// Aktif aşamanın sorular artefaktından açık-soru durumu.
// Dönüş: null (soru katmanı yok — eski proje veya henüz üretilmedi) veya
//   { asama, paket, acik, atlanan, butunluk: 'gecerli'|'yok'|'bozuk', neden? }
export function acikSoruDurum(nsYolu, state) {
  const A = state.aktif_asama
  if (A === 'tamamlandi') return null
  const ss = state.asamalar?.[A]?.sorular_surum
  if (ss == null) return null
  const paket = sorulariOku(nsYolu, A, ss)
  if (!paket) return null
  const substantive = paket.sorular.filter(s => s.tip !== 'APPROVAL')
  if (substantive.length === 0) return { asama: A, paket, acik: [], atlanan: [], butunluk: 'gecerli' }
  const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, A, ss))
  if (but.durum === 'gecerli') {
    return { asama: A, paket, acik: acikSorular(paket, but.yanitlar), atlanan: atlananlar(paket, but.yanitlar), butunluk: 'gecerli' }
  }
  return { asama: A, paket, acik: substantive, atlanan: [], butunluk: but.durum, neden: but.neden }
}
