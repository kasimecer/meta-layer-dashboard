// meta-layer-core — In-build olay yaşam-döngüsü wire (üç tip).
//
// Desteklenen olay tipleri:
//   ARAŞTIRMA    : araştırma/olgu-doğrulama → oracle yolu
//   ASYNC-TOPLANTI: eş-zamanlı-olmayan katılım → fasilitasyon yolu (kararWire rekullanımı)
//   KARAR-DESTEK : karar desteği → set-critic yolu
//
// Ortak invaryantlar:
//   • Çıktı kartı faz:build + task_id + linked_olay_id taşır
//   • Yeni kart-tipi / durum-makinesi durumu eklenmez
//   • Idempotent (yeniden-koşum bozmasın)
//   • UYDURMA YOK: canlı kaynak çekilemezse boşluğu açıkça işaretle
//   • Tüm çıktı projeler/<proje>/ altına yazılır (izole)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
import { META_DATA_ROOT } from './config.js'
import { kararCiftiOlustur, kararTetikle, fasilitasyonuYayinla, buildTaskEventBlokDegerlendirAc } from './kararWire.mjs'
import { kartDogrula } from '../src/lib/stateMachine.js'

const PROJELER_ROOT = join(META_DATA_ROOT, 'projeler')
const CRITIC_MJS = join(META_DATA_ROOT, 'tools', 'openrouter-critic.mjs')

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function projeDir(proje, rootDir) {
  return join(rootDir ?? PROJELER_ROOT, proje)
}

function okuJSON(yol) {
  return JSON.parse(readFileSync(yol, 'utf8'))
}

function yazJSON(yol, veri) {
  mkdirSync(dirname(yol), { recursive: true })
  writeFileSync(yol, JSON.stringify(veri, null, 2), 'utf8')
}

function olguTabaniFormatla(olgular) {
  return (olgular ?? []).map(o => {
    const eksik = !o.kaynak || o.durum === 'eksik'
    return eksik
      ? `- **[eksik: doğrulanacak]** ${o.olgu}`
      : `- **[doğrulanmış]** ${o.olgu}  \n  _kaynak: ${o.kaynak}_`
  })
}

// Critic yanıtından yapısal-bulgular ve reçete-önerileri ayırır.
// "Yapısal" / "Reçete" başlıklı bölümleri arar; yoksa heuristik ile bölünür.
function yapisalReceteAyir(metin) {
  const yapisal = []
  const recete = []
  let mod = null

  for (const satir of (metin ?? '').split('\n')) {
    const s = satir.trim()
    if (!s) continue
    if (/yapısal/i.test(s) && !s.startsWith('-')) { mod = 'yapisal'; continue }
    if (/reçete/i.test(s) && !s.startsWith('-')) { mod = 'recete'; continue }
    if (s.startsWith('#') || s === '---') { mod = null; continue }
    if (mod === 'yapisal' && s.length > 3) { yapisal.push(s.replace(/^[-*•]\s*/, '')); continue }
    if (mod === 'recete' && s.length > 3) { recete.push(s.replace(/^[-*•]\s*/, '')); continue }
  }

  if (!yapisal.length && !recete.length) {
    const receteRe = /\b(gerek|yapılmalı|edilmeli|önerilir|kullanılmalı)\b/i
    for (const satir of (metin ?? '').split('\n')) {
      const s = satir.trim().replace(/^[-*•]\s*/, '')
      if (!s || s.startsWith('#') || s.startsWith('[FİKSTÜR') || s.startsWith('[CANLI')) continue
      if (receteRe.test(s)) recete.push(s)
      else if (s.length > 10) yapisal.push(s)
    }
  }

  return { yapisal, recete }
}

function kartOnayla(kart) {
  const hatalar = kartDogrula(kart)
  if (hatalar.length) throw new Error(`Kart şema hatası [${kart.id}]: ${hatalar.join('; ')}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) ARAŞTIRMA — oracle yolu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Araştırma olayı başlatır: olay metadata + girdi kartı yazar (sentez HENÜZ YAZILMAZ).
 * @param {{ olay_id, proje, task_id?, soru, olgular, _rootDir? }} p
 * @returns {{ ok?, atlandı?, sebep?, girdiKart? }}
 */
export function arastirmaOlayiKur({ olay_id, proje, task_id, soru, olgular, _rootDir }) {
  if (!olay_id || !proje) throw new Error('olay_id ve proje zorunlu')
  const pdir = projeDir(proje, _rootDir)
  const olayYol = join(pdir, 'olay-kartlar', `${olay_id}.json`)

  if (existsSync(olayYol)) {
    const m = okuJSON(olayYol)
    return { atlandı: true, sebep: m.cozuldu ? 'zaten çözüldü' : 'zaten kuruldu' }
  }

  const now = new Date().toISOString()

  const girdiKart = {
    id: `${olay_id}-girdi`,
    tip: 'girdi-talebi',
    durum: 'cevap-bekliyor',
    ozet: `Araştırma: ${soru}`,
    detay: [
      `Araştırma sorusu: ${soru}`,
      '',
      '## Başlangıç olgu-tabanı',
      ...olguTabaniFormatla(olgular),
    ].join('\n'),
    partner_cevap: null,
    olusturma: now,
    guncelleme: now,
    kategori: 'arastirma-girdi',
    faz: 'build',
    task_id: task_id ?? null,
    linked_olay_id: olay_id,
  }
  kartOnayla(girdiKart)

  const olayMeta = {
    olay_id,
    olay_tipi: 'arastirma',
    proje,
    task_id: task_id ?? null,
    soru,
    olgular: olgular ?? [],
    cozuldu: false,
    olusturma: now,
    girdiKart,
  }

  mkdirSync(dirname(olayYol), { recursive: true })
  yazJSON(olayYol, olayMeta)

  return { ok: true, girdiKart }
}

/**
 * Araştırma olayını çözer: oracle yanıtıyla ilerleme kartı yazar → sentez-kartlar/<olay_id>.json.
 * oracleCevap: null → canlı oracle denemesi (OPENROUTER_API_KEY gerekli).
 * @param {{ olay_id, proje, _rootDir?, oracleCevap? }} p
 * @returns {{ ok?, atlandı?, sebep?, ciktiKart? }}
 */
export function arastirmaOlayiCoz({ olay_id, proje, _rootDir, oracleCevap }) {
  if (!olay_id || !proje) throw new Error('olay_id ve proje zorunlu')
  const pdir = projeDir(proje, _rootDir)
  const olayYol = join(pdir, 'olay-kartlar', `${olay_id}.json`)

  if (!existsSync(olayYol)) throw new Error(`Araştırma olayı bulunamadı: ${olayYol}`)
  const olayMeta = okuJSON(olayYol)

  if (olayMeta.cozuldu) return { atlandı: true, sebep: 'zaten çözüldü' }

  const canli = oracleCevap == null
  if (canli) {
    // FİKSTÜR modunda olmayan çağrı: boşluğu açıkça işaretle (UYDURMA YOK)
    oracleCevap = '[Oracle yanıtı sağlanmadı — canlı bağlantı denenmedi; boşluk işaretlendi]'
  }

  const modModu = canli ? '[CANLI oracle — doğrulanmamış]' : '[FİKSTÜR]'
  const now = new Date().toISOString()
  const olgular = olayMeta.olgular ?? []

  const ciktiKart = {
    id: `${olay_id}-cikti`,
    tip: 'ilerleme',
    durum: 'bitti',
    ozet: `Araştırma tamamlandı — ${olayMeta.soru.slice(0, 80)}`,
    detay: [
      `## Araştırma Sorusu`,
      olayMeta.soru,
      '',
      `## Oracle Yanıtı ${modModu}`,
      oracleCevap,
      '',
      `## Olgu-Tabanı (doğrulanmış / eksik)`,
      ...olguTabaniFormatla(olgular),
    ].join('\n'),
    partner_cevap: null,
    olusturma: now,
    guncelleme: now,
    kategori: 'arastirma-cikti',
    faz: 'build',
    task_id: olayMeta.task_id ?? null,
    linked_olay_id: olay_id,
  }
  kartOnayla(ciktiKart)

  const sentezDir = join(pdir, 'sentez-kartlar')
  mkdirSync(sentezDir, { recursive: true })
  yazJSON(
    join(sentezDir, `${olay_id}.json`),
    { kartlar: [ciktiKart], escalation_flag: false, terminal_sinif: 'arastirma', olay_tipi: 'arastirma' }
  )

  olayMeta.cozuldu = true
  olayMeta.cozulma = now
  yazJSON(olayYol, olayMeta)

  // Kapısız olay: çıktı üretilince event_blok açılır (insan onayı gerekmez)
  buildTaskEventBlokDegerlendirAc({
    pdir,
    task_id: olayMeta.task_id ?? null,
    sentezDosya: { kartlar: [ciktiKart], escalation_flag: false, terminal_sinif: 'arastirma' },
  })

  return { ok: true, ciktiKart }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) ASYNC-TOPLANTI — fasilitasyon yolu (kararWire yeniden kullanımı)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Async-toplantı olayı başlatır: kararCiftiOlustur'u sarmalar + build damgaları ekler.
 * @param {{ olay_id, proje, task_id?, soru, secenekler, katilimcilar, kararMeta?, _rootDir? }} p
 * @returns {{ ok?, atlandı?, sebep?, kararKartlari? }}
 */
export function asyncToplantiOlayiKur({ olay_id, proje, task_id, soru, secenekler, katilimcilar, kararMeta, _rootDir }) {
  if (!olay_id || !proje) throw new Error('olay_id ve proje zorunlu')
  const pdir = projeDir(proje, _rootDir)
  const olayYol = join(pdir, 'olay-kartlar', `${olay_id}.json`)

  if (existsSync(olayYol)) {
    const m = okuJSON(olayYol)
    return { atlandı: true, sebep: m.cozuldu ? 'zaten çözüldü' : 'zaten kuruldu' }
  }

  const now = new Date().toISOString()

  // kararCiftiOlustur ile karar kartlarını oluştur (olay_id = karar_id)
  const { kartlar: kararKartlari } = kararCiftiOlustur({
    karar_id: olay_id,
    proje,
    soru,
    secenekler,
    partnerler: katilimcilar,
    kararMeta,
    _rootDir,
  })

  // Build damgaları + linked_olay_id karar kartlarına ekle
  const kararYol = join(pdir, 'karar-kartlar', `${olay_id}.json`)
  const kararVeri = okuJSON(kararYol)
  kararVeri.kartlar = kararVeri.kartlar.map(k => ({
    ...k,
    faz: 'build',
    task_id: task_id ?? null,
    linked_olay_id: olay_id,
  }))
  kararVeri.olay_tipi = 'async-toplanti'
  yazJSON(kararYol, kararVeri)

  // Olay metadata
  mkdirSync(dirname(olayYol), { recursive: true })
  yazJSON(olayYol, {
    olay_id,
    olay_tipi: 'async-toplanti',
    proje,
    task_id: task_id ?? null,
    karar_id: olay_id,
    cozuldu: false,
    olusturma: now,
  })

  return { ok: true, kararKartlari }
}

/**
 * Async-toplantı olayını çözer: kararTetikle → fasilitasyonuYayinla → olay_tipi damgası.
 * Katılımcıların karar kartları dışarıdan (test runner veya reconcile) cevaplanmış olmalı.
 * @param {{ olay_id, proje, _rootDir? }} p
 * @returns {{ ok?, atlandı?, sebep?, terminal_sinif?, escalation_flag? }}
 */
export function asyncToplantiOlayiCoz({ olay_id, proje, _rootDir }) {
  if (!olay_id || !proje) throw new Error('olay_id ve proje zorunlu')
  const pdir = projeDir(proje, _rootDir)
  const olayYol = join(pdir, 'olay-kartlar', `${olay_id}.json`)

  if (!existsSync(olayYol)) throw new Error(`Async-toplantı olayı bulunamadı: ${olayYol}`)
  const olayMeta = okuJSON(olayYol)

  if (olayMeta.cozuldu) return { atlandı: true, sebep: 'zaten çözüldü' }

  const tetik = kararTetikle({ karar_id: olay_id, proje, _rootDir })
  if (!tetik.ok && !tetik.atlandı) return { ok: false, hata: `kararTetikle: ${tetik.hata}` }

  const yayin = fasilitasyonuYayinla({ karar_id: olay_id, proje, _rootDir })
  if (!yayin.ok && !yayin.atlandı) return { ok: false, hata: `fasilitasyonuYayinla: ${yayin.hata}` }

  // olay_tipi + linked_olay_id damgası sentez dosyasına ekle
  const sentezYol = join(pdir, 'sentez-kartlar', `${olay_id}.json`)
  if (existsSync(sentezYol)) {
    const sentez = okuJSON(sentezYol)
    sentez.olay_tipi = 'async-toplanti'
    sentez.kartlar = sentez.kartlar.map(k => ({ ...k, linked_olay_id: olay_id }))
    yazJSON(sentezYol, sentez)
  }

  const now = new Date().toISOString()
  olayMeta.cozuldu = true
  olayMeta.cozulma = now
  yazJSON(olayYol, olayMeta)

  const terminal_sinif = yayin.atlandı
    ? (existsSync(sentezYol) ? okuJSON(sentezYol).terminal_sinif : null)
    : yayin.terminal_sinif
  const escalation_flag = yayin.atlandı
    ? (existsSync(sentezYol) ? !!okuJSON(sentezYol).escalation_flag : false)
    : !!yayin.escalation_flag

  return { ok: true, terminal_sinif, escalation_flag }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) KARAR-DESTEK — set-critic yolu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Karar-destek olayı başlatır: olay metadata + girdi kartı yazar.
 * @param {{ olay_id, proje, task_id?, soru, hipotez?, _rootDir? }} p
 * @returns {{ ok?, atlandı?, sebep?, girdiKart? }}
 */
export function kararDestekOlayiKur({ olay_id, proje, task_id, soru, hipotez, _rootDir }) {
  if (!olay_id || !proje) throw new Error('olay_id ve proje zorunlu')
  const pdir = projeDir(proje, _rootDir)
  const olayYol = join(pdir, 'olay-kartlar', `${olay_id}.json`)

  if (existsSync(olayYol)) {
    const m = okuJSON(olayYol)
    return { atlandı: true, sebep: m.cozuldu ? 'zaten çözüldü' : 'zaten kuruldu' }
  }

  const now = new Date().toISOString()

  const girdiKart = {
    id: `${olay_id}-girdi`,
    tip: 'girdi-talebi',
    durum: 'cevap-bekliyor',
    ozet: `Karar-destek: ${soru}`,
    detay: [
      `Karar-destek sorusu: ${soru}`,
      ...(hipotez ? ['', `**Hipotez:** ${hipotez} [hipotez: doğrulanmamış]`] : []),
    ].join('\n'),
    partner_cevap: null,
    olusturma: now,
    guncelleme: now,
    kategori: 'karar-destek-girdi',
    faz: 'build',
    task_id: task_id ?? null,
    linked_olay_id: olay_id,
  }
  kartOnayla(girdiKart)

  const olayMeta = {
    olay_id,
    olay_tipi: 'karar-destek',
    proje,
    task_id: task_id ?? null,
    soru,
    hipotez: hipotez ?? null,
    cozuldu: false,
    olusturma: now,
    girdiKart,
  }

  mkdirSync(dirname(olayYol), { recursive: true })
  yazJSON(olayYol, olayMeta)

  return { ok: true, girdiKart }
}

/**
 * Karar-destek olayını çözer: critic yanıtıyla yapısal-bulgu + reçete kartı yazar.
 * criticCevap: null → canlı set-critic denemesi (OPENROUTER_API_KEY gerekli).
 * UYDURMA YOK: canlı bağlantı kurulamazsa açıkça işaretlenir.
 * @param {{ olay_id, proje, _rootDir?, criticCevap? }} p
 * @returns {{ ok?, atlandı?, sebep?, ciktiKart?, yapisal?, recete? }}
 */
export function kararDestekOlayiCoz({ olay_id, proje, _rootDir, criticCevap }) {
  if (!olay_id || !proje) throw new Error('olay_id ve proje zorunlu')
  const pdir = projeDir(proje, _rootDir)
  const olayYol = join(pdir, 'olay-kartlar', `${olay_id}.json`)

  if (!existsSync(olayYol)) throw new Error(`Karar-destek olayı bulunamadı: ${olayYol}`)
  const olayMeta = okuJSON(olayYol)

  if (olayMeta.cozuldu) return { atlandı: true, sebep: 'zaten çözüldü' }

  let modModu = '[FİKSTÜR]'

  if (criticCevap == null) {
    // Canlı critic denemesi
    if (!process.env.OPENROUTER_API_KEY) {
      // UYDURMA YOK: boşluğu açıkça işaretle
      criticCevap = '[Critic yanıtı alınamadı — OPENROUTER_API_KEY tanımlı değil; boşluk işaretlendi]'
      modModu = '[CANLI BAŞARISIZ — OPENROUTER_API_KEY eksik]'
    } else if (!existsSync(CRITIC_MJS)) {
      criticCevap = `[Critic yanıtı alınamadı — ${CRITIC_MJS} bulunamadı; boşluk işaretlendi]`
      modModu = '[CANLI BAŞARISIZ — critic.mjs bulunamadı]'
    } else {
      try {
        criticCevap = execSync(
          `node "${CRITIC_MJS}" "${olayMeta.soru.replace(/"/g, '\\"')}"`,
          { encoding: 'utf8', env: process.env }
        )
        modModu = '[CANLI set-critic]'
      } catch (e) {
        criticCevap = `[Critic çalıştırılamadı: ${e.message}; boşluk işaretlendi — UYDURMA YOK]`
        modModu = '[CANLI BAŞARISIZ]'
      }
    }
  }

  const { yapisal, recete } = yapisalReceteAyir(criticCevap)
  const now = new Date().toISOString()

  const ciktiKart = {
    id: `${olay_id}-cikti`,
    tip: 'ilerleme',
    durum: 'bitti',
    ozet: `Karar-destek analizi — ${olayMeta.soru.slice(0, 80)}`,
    detay: [
      `## Karar-destek ${modModu}`,
      `**Soru:** ${olayMeta.soru}`,
      ...(olayMeta.hipotez ? ['', `**Hipotez:** ${olayMeta.hipotez} [hipotez: doğrulanmamış]`] : []),
      '',
      `## Yapısal Bulgular (olgusal — bağımsız doğrulama gerekli)`,
      yapisal.length ? yapisal.map(b => `- ${b}`).join('\n') : '_(yapısal bulgu bulunamadı)_',
      '',
      `## Reçete Önerileri (değer-yargısı — beyan sahibi şeffaf edildi)`,
      recete.length ? recete.map(r => `- ${r}`).join('\n') : '_(reçete bulunmadı)_',
    ].join('\n'),
    partner_cevap: null,
    olusturma: now,
    guncelleme: now,
    kategori: 'karar-destek-cikti',
    faz: 'build',
    task_id: olayMeta.task_id ?? null,
    linked_olay_id: olay_id,
  }
  kartOnayla(ciktiKart)

  const sentezDir = join(pdir, 'sentez-kartlar')
  mkdirSync(sentezDir, { recursive: true })
  yazJSON(
    join(sentezDir, `${olay_id}.json`),
    { kartlar: [ciktiKart], escalation_flag: false, terminal_sinif: 'karar-destek', olay_tipi: 'karar-destek' }
  )

  olayMeta.cozuldu = true
  olayMeta.cozulma = now
  yazJSON(olayYol, olayMeta)

  // Kapısız olay: çıktı üretilince event_blok açılır (insan onayı gerekmez)
  buildTaskEventBlokDegerlendirAc({
    pdir,
    task_id: olayMeta.task_id ?? null,
    sentezDosya: { kartlar: [ciktiKart], escalation_flag: false, terminal_sinif: 'karar-destek' },
  })

  return { ok: true, ciktiKart, yapisal, recete }
}
