// meta-layer-core — Yazma-yolu (write-path) soyutlaması. TEK soyutlama noktası.
// Çağıran arayüz (imza) DEĞİŞMEZ; yalnız bu fonksiyonun içi MOCK→CANLI olur.
//
// CANLI yol: Cloudflare Worker POST /submit → Worker GITHUB_TOKEN ile inbox dosyasına APPEND eder.
// MOCK yol:  VITE_WORKER_URL/VITE_SUBMIT_TOKEN ayarsızsa eski davranış (state'e işler, dosya yazmaz).

import { gecisUygula } from './stateMachine.js'

// Build-time (Vite) gömülür. İkisi de doluysa CANLI, değilse MOCK.
const WORKER_URL = (import.meta.env?.VITE_WORKER_URL || '').replace(/\/$/, '')
const SUBMIT_TOKEN = import.meta.env?.VITE_SUBMIT_TOKEN || ''
export const CANLI = Boolean(WORKER_URL && SUBMIT_TOKEN)

// İki-yazar kontratı: insan yalnız inbox kanalına yazar, loop uzlaştırır.
// (MOCK gösterim satırı — CANLI'da kanonik satırı Worker üretir/yazar.)
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

  // Saf durum geçişi + partner_cevap (UI optimistik günceller — yazma başarılıysa kalır)
  const yeniKart = { ...gecisUygula(kart, 'cevaplandi'), partner_cevap: temiz }
  const inboxSatiri = inboxSatiriUret({ projeId, kart, cevap: temiz })

  // MOCK: Worker yapılandırılmamış → eski davranış (gerçek dosya-yazma yok)
  if (!CANLI) {
    return { ok: true, kart: yeniKart, inboxSatiri, mock: true }
  }

  // CANLI: Worker POST /submit — mobil ağda ara sıra bağlantı yanıt gelmeden düşüyor (WebKit:
  // "Load failed"); Worker genelde yazmayı BİTİRMİŞ oluyor, yalnız yanıt istemciye ulaşmıyor
  // (bkz meta-kanal.md 2026-07-09 seam-reconcile-run-baris — partner aynı cevabı günler içinde
  // 7 kez yeniden göndermiş). Kısa backoff'lu otomatik tekrar bu görünür-hata oranını azaltır;
  // tekrar gönderim veri KAYBI yaratmaz (seam-reconcile kart-bazlı latest-wins ile dedup eder),
  // yalnız gürültü. Yalnız ATILAN (network-level) hatada tekrar edilir — sunucunun gerçek bir
  // HTTP hata yanıtı (ör. 401/400) hemen döner, körlemesine tekrar edilmez.
  const MAX_DENEME = 3
  for (let deneme = 1; deneme <= MAX_DENEME; deneme++) {
    try {
      const r = await fetch(`${WORKER_URL}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-submit-token': SUBMIT_TOKEN },
        body: JSON.stringify({ projeId, kartId: kart.id, ozet: kart.ozet, cevap: temiz }),
      })
      if (!r.ok) {
        let detay = ''
        try { detay = (await r.json()).hata || '' } catch { /* noop */ }
        return { ok: false, hata: `Gönderilemedi (${r.status}${detay ? ': ' + detay : ''})` }
      }
      return { ok: true, kart: yeniKart, inboxSatiri, mock: false }
    } catch (e) {
      if (deneme === MAX_DENEME) return { ok: false, hata: `Ağ hatası: ${String(e?.message || e)}` }
      await new Promise(res => setTimeout(res, 600 * deneme))
    }
  }
}

/**
 * Intake taslağını Worker üzerinden GitHub kuyruğuna yazar (intake-kuyruk/<id>.json).
 * Worker BURADA materyalize ETMEZ — yalnız git'e commit eder. Kullanıcının kendi
 * makinesinde çalışan scripts/intake-queue-watch.mjs bu dosyayı bulup YEREL materyalize
 * eder (kayıt + proje dosyaları). Planlama pipeline'ını başlatmaz — bu insan tarafından
 * ayrı, elle bir terminal komutuyla yapılır (node scripts/planlama-baslat.mjs <id>).
 * @returns {Promise<{ok:true, path:string, commit?:string} | {ok:false, hata:string, mock?:boolean}>}
 */
export async function submitIntakeQueue({ taslak }) {
  if (!taslak?.id || !taslak?.projeKaydi || !taslak?.cardsJson) {
    return { ok: false, hata: 'Geçersiz taslak (id/projeKaydi/cardsJson eksik)' }
  }

  // MOCK: Worker yapılandırılmamış → otomatik kuyruk yok, elle materyalize gerekir.
  if (!CANLI) {
    return { ok: false, mock: true, hata: 'Worker yapılandırılmamış (MOCK mod) — yalnız elle materyalize edilebilir.' }
  }

  try {
    const r = await fetch(`${WORKER_URL}/intake-queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-submit-token': SUBMIT_TOKEN },
      body: JSON.stringify({ taslak }),
    })
    if (!r.ok) {
      let detay = ''
      try { detay = (await r.json()).hata || '' } catch { /* noop */ }
      return { ok: false, hata: `Kuyruğa alınamadı (${r.status}${detay ? ': ' + detay : ''})` }
    }
    const data = await r.json()
    return { ok: true, path: data.path, commit: data.commit }
  } catch (e) {
    return { ok: false, hata: `Ağ hatası: ${String(e?.message || e)}` }
  }
}

/**
 * Planlama soru–yanıt gönderimini Worker üzerinden GitHub kuyruğuna yazar
 * (soru-yanit-kuyruk/<projeId>--<asama>--v<surum>.json). Worker BURADA yanıt artefaktına
 * YAZMAZ / sürüm-tazeliği DEĞERLENDİRMEZ — yalnız git'e commit eder. Kullanıcının kendi
 * makinesinde çalışan scripts/soru-yanit-queue-watch.mjs bu dosyayı bulup gerçek sürüm/imza
 * tazeliğini denetler ve YEREL yanıt artefaktına yazar. Planlama pipeline'ını
 * başlatmaz/ilerletmez — bu insan tarafından ayrı, elle bir terminal komutuyla yapılır
 * (node scripts/planlama-baslat.mjs <id>). Bkz worker/worker.js, scripts/soru-yanit-queue-watch.mjs.
 * @param {{ gonderim: { projeId, asama, surum, soruImza, yanitlar } }} args
 * @returns {Promise<{ok:true, path:string, commit?:string} | {ok:false, hata:string, mock?:boolean}>}
 */
export async function submitSoruYanit({ gonderim }) {
  if (!gonderim?.projeId || !gonderim?.asama || !Number.isInteger(gonderim?.surum) ||
      !gonderim?.soruImza || !Array.isArray(gonderim?.yanitlar) || gonderim.yanitlar.length === 0) {
    return { ok: false, hata: 'Geçersiz gönderim (projeId/asama/surum/soruImza/yanitlar eksik)' }
  }

  // MOCK: Worker yapılandırılmamış → otomatik kuyruk yok, yanıt kaydedilmez.
  if (!CANLI) {
    return { ok: false, mock: true, hata: 'Worker yapılandırılmamış (MOCK mod) — yanıt kuyruğa alınamadı.' }
  }

  try {
    const r = await fetch(`${WORKER_URL}/soru-yanit-queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-submit-token': SUBMIT_TOKEN },
      body: JSON.stringify({ gonderim }),
    })
    if (!r.ok) {
      let detay = ''
      try { detay = (await r.json()).hata || '' } catch { /* noop */ }
      return { ok: false, hata: `Kuyruğa alınamadı (${r.status}${detay ? ': ' + detay : ''})` }
    }
    const data = await r.json()
    return { ok: true, path: data.path, commit: data.commit }
  } catch (e) {
    return { ok: false, hata: `Ağ hatası: ${String(e?.message || e)}` }
  }
}
