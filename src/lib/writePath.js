// meta-layer-core — Yazma-yolu (write-path) soyutlaması.
// SLICE 1: MOCK/LOKAL — cevabı state'e işler + inbox.md-format satır ÜRETİR (dosyaya yazmaz, localStorage yok).
// SONRA: submitPartnerInput GÖVDESİ Cloudflare Worker POST'una çevrilir (E'nin hesabı + GitHub token gerektirir).
//        Çağıran arayüz (imza) DEĞİŞMEZ — yalnız bu fonksiyonun içi değişir. Tek soyutlama noktası.

import { gecisUygula } from './stateMachine.js'

// İki-yazar kontratı: insan yalnız inbox.md'ye yazar, loop uzlaştırır.
// Worker bu satırı projeler/<proje>/inbox.md'ye APPEND edecek.
export function inboxSatiriUret({ projeId, kart, cevap, zaman = new Date() }) {
  const ts = zaman.toISOString().slice(0, 16).replace('T', ' ')
  return `- [${ts}] partner-cevap · proje:${projeId} · ${kart.id} (${kart.ozet}) → ${cevap}`
}

/**
 * Partner girdi-talebi kartına cevap yazar → kart cevap-bekliyor → cevaplandi.
 * @returns {Promise<{ok:true, kart:Kart, inboxSatiri:string, mock:boolean} | {ok:false, hata:string}>}
 */
export async function submitPartnerInput({ projeId, kart, cevap }) {
  if (!kart || kart.tip !== 'girdi-talebi') {
    return { ok: false, hata: `Yazma-yolu yalnız girdi-talebi içindir (tip: ${kart?.tip})` }
  }
  if (kart.durum !== 'cevap-bekliyor') {
    return { ok: false, hata: `Kart cevap-bekliyor değil (durum: ${kart.durum})` }
  }
  const temiz = String(cevap ?? '').trim()
  if (!temiz) return { ok: false, hata: 'Boş cevap' }

  // 1) Durum geçişi (saf) + partner_cevap
  const yeniKart = { ...gecisUygula(kart, 'cevaplandi'), partner_cevap: temiz }

  // 2) inbox.md-format satır (MOCK: üretilir + gösterilir; gerçek dosya-yazma SONRA Worker'da)
  const inboxSatiri = inboxSatiriUret({ projeId, kart, cevap: temiz })

  // 3) MOCK dönüş.
  //    GERÇEK impl (sonraki adım):
  //      const r = await fetch(WORKER_URL, { method:'POST', headers:{'content-type':'application/json'},
  //        body: JSON.stringify({ projeId, kartId: kart.id, cevap: temiz }) })
  //      return r.ok ? { ok:true, kart:yeniKart, inboxSatiri, mock:false } : { ok:false, hata:'worker' }
  return { ok: true, kart: yeniKart, inboxSatiri, mock: true }
}
