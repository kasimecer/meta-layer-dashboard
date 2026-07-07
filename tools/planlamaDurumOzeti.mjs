// meta-layer-core — Açık-soru durum özeti (READ-ONLY, MODELSİZ).
//
// PAYLAŞILAN ÇEKİRDEK: scripts/planlama-baslat.mjs (CLI, Türkçe konsol biçimlendirmesi) VE
// scripts/build-card-data.js (tarayıcı için JSON anlık-görüntü) AYNI acikSoruDurum'u çağırır —
// "tarayıcı ve CLI aynı olguda hemfikir" garantisi buradan gelir (tek fonksiyon, iki çağıran).
// tools/ katmanında yaşar (scripts/*.mjs başka bir scripts/*.mjs'yi İTHAL ETMEZ — repo
// konvansiyonu); her iki çağıran da yalnız bu saf modülden okur.

import {
  sorulariOku, yanitlariHamOku, yanitButunluk, acikSorular, atlananlar,
  tumAcikAdaylar, acikBlokerler,
} from './planlamaSorular.mjs'
import { aktifBolumBilgisi } from './planlamaBolumLoop.mjs'

// Genel çekirdek — bir BİRİMİN (aşama VEYA master-plan bölümü) sorular artefaktından açık-soru
// durumu. birimState = state.asamalar[birimId] VEYA bir bölümün kendi state-nesnesi (AYNI şekil:
// sorular_surum alanı olan herhangi bir birim). Dönüş: null veya
//   { asama, paket, acik, atlanan, butunluk: 'gecerli'|'yok'|'bozuk', neden? }
// acikBloker/acikErtelenen: SAF EKLEME (mevcut tüketiciler görmezden gelebilir) — CLI'nin
// toplu-atla/blocker raporlaması için (bkz scripts/planlama-baslat.mjs).
function acikSoruDurumJenerik(nsYolu, birimId, birimState) {
  const ss = birimState?.sorular_surum
  if (ss == null) return null
  const paket = sorulariOku(nsYolu, birimId, ss)
  if (!paket) return null
  const substantive = paket.sorular.filter(s => s.tip !== 'APPROVAL')
  if (substantive.length === 0) return { asama: birimId, paket, acik: [], acikBloker: [], acikErtelenen: [], atlanan: [], butunluk: 'gecerli' }
  const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, birimId, ss))
  if (but.durum === 'gecerli') {
    const acik = acikSorular(paket, but.yanitlar)
    const tumAcik = tumAcikAdaylar(paket, but.yanitlar)
    return {
      asama: birimId, paket, acik,
      acikBloker: acikBlokerler(paket, but.yanitlar),
      acikErtelenen: tumAcik.filter(s => !acik.includes(s)),
      atlanan: atlananlar(paket, but.yanitlar), butunluk: 'gecerli',
    }
  }
  return { asama: birimId, paket, acik: substantive, acikBloker: substantive.filter(s => s.tier === 'blocker'), acikErtelenen: [], atlanan: [], butunluk: but.durum, neden: but.neden }
}

// Aktif aşamanın sorular artefaktından açık-soru durumu — CLI (scripts/planlama-baslat.mjs) VE
// tarayıcı (scripts/build-card-data.js) AYNI fonksiyonu çağırır, "aynı olguda hemfikir" garantisi
// buradan gelir. Master-plan bölüm-yürüyüşü SÜRERKEN (aktifBolumBilgisi != null) aktif BÖLÜMÜN
// soru-durumuna DELEGE eder — aksi halde outer master-plan.sorular_surum (henüz null / walk
// bitmiş-nihai-onay) her zamanki gibi okunur. Dönüş şekli DEĞİŞMEDİ; yalnız EKLENEN `bolum`
// alanı (null = aşama-seviyesi, aksi halde bölüm id'si) hangi granülerlikte olduğumuzu gösterir —
// SAF EKLEME (mevcut tüketiciler bu alanı görmezden gelebilir).
export function acikSoruDurum(nsYolu, state) {
  const A = state.aktif_asama
  if (A === 'tamamlandi') return null

  if (A === 'master-plan') {
    const bilgi = aktifBolumBilgisi(state)
    if (bilgi) {
      const sonuc = acikSoruDurumJenerik(nsYolu, bilgi.bolumId, bilgi.bolumler[bilgi.bolumId])
      return sonuc ? { ...sonuc, bolum: bilgi.bolumId } : null
    }
  }

  const sonuc = acikSoruDurumJenerik(nsYolu, A, state.asamalar?.[A])
  return sonuc ? { ...sonuc, bolum: null } : null
}
