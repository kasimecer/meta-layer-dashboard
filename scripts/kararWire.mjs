// meta-layer-core — Karar-fasilitasyon yaşam-döngüsü wire.
// kararCiftiOlustur → kararTetikle (reconcile sonrası) → fasilitasyonuYayinla
//
// Disk I/O (Drive projeler/) bu modülde; kararFasilitasyon.js saf kalır.
// Zorunlu kart-şema-alanları + durum-makinesi GEÇİŞ KURALLARI değişmez.
// karar_id / kategori / fasilitasyon_durumu = opsiyonel metadata.
//
// Koşum:
//   node scripts/kararWire.mjs --yayinla <karar_id> --proje <proje>
//   node scripts/kararWire.mjs --komut   (meta-komut.md'den YAYINLA komutlarını işler)

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'
import { baslangicDurum, kartDogrula } from '../src/lib/stateMachine.js'
import {
  fasilitasyonRutini,
  tarafsizlikDenetimi,
  sentezKartiMarkdown,
  terminalCerceve,
} from '../src/lib/kararFasilitasyon.js'

const PROJELER_ROOT = join(META_DATA_ROOT, 'projeler')

function projeDir(proje, rootDir) {
  return join(rootDir ?? PROJELER_ROOT, proje)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) kararCiftiOlustur
// ─────────────────────────────────────────────────────────────────────────────
/**
 * İki partner için birer girdi-talebi kartı oluşturur — aynı karar_id + kategori:'karar'.
 * Zorunlu şema-alanları (tip, durum, ozet, detay, partner_cevap, olusturma, guncelleme) dokunulmaz;
 * karar_id / kategori / partner_slug = opsiyonel metadata olarak eklenir.
 *
 * @param {{ karar_id, proje, soru, secenekler, partnerler, kararMeta?, _rootDir? }} p
 *   kararMeta = { baslik?, ozet?, olguTabani?, krux? }  — fasilitasyonRutini için
 *   _rootDir = test izolasyonu için kök override (prod: META_DATA_ROOT/projeler)
 * @returns {{ kartlar: Kart[], karar: object }}
 */
export function kararCiftiOlustur({ karar_id, proje, soru, secenekler, partnerler, kararMeta, _rootDir }) {
  if (!karar_id || !proje) throw new Error('karar_id ve proje zorunlu')
  if (!Array.isArray(secenekler) || secenekler.length !== 2) throw new Error('tam iki seçenek zorunlu')
  if (!Array.isArray(partnerler) || partnerler.length < 2) throw new Error('en az iki partner zorunlu')
  for (const p of partnerler) {
    if (!p.slug) throw new Error(`partner.slug zorunlu (partner: ${JSON.stringify(p)})`)
  }

  const now = new Date().toISOString()

  const kartlar = partnerler.map(p => {
    const kart = {
      // ── Zorunlu şema-v1 alanları ──
      id: `${karar_id}-${p.slug}`,
      tip: 'girdi-talebi',
      durum: baslangicDurum('girdi-talebi'),   // 'cevap-bekliyor'
      ozet: soru,
      detay: [
        soru,
        '',
        'Seçenekler:',
        ...secenekler.map(s => `- **${s.ad}:** ${s.optimize}`),
      ].join('\n'),
      partner_cevap: null,
      olusturma: now,
      guncelleme: now,
      // ── Opsiyonel metadata ──
      karar_id,
      kategori: 'karar',
      partner_slug: p.slug,
    }
    const hatalar = kartDogrula(kart)
    if (hatalar.length) throw new Error(`Şema hatası [${kart.id}]: ${hatalar.join('; ')}`)
    return kart
  })

  const kararYapi = {
    karar_id,
    proje,
    olusturma: now,
    fasilitasyon_durumu: null,
    kararNoktasi: {
      id: karar_id,
      baslik: kararMeta?.baslik ?? soru,
      ozet: kararMeta?.ozet ?? soru,
      olguTabani: kararMeta?.olguTabani ?? [],
      krux: kararMeta?.krux ?? { tur: 'deger', ayrisma: '(krux belirtilmedi)', olguBosluklari: [] },
      secenekler,
    },
    partnerler,
    kartlar,
    terminal_sinif: null,
    escalation_flag: false,
  }

  const outDir = join(projeDir(proje, _rootDir), 'karar-kartlar')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, `${karar_id}.json`), JSON.stringify(kararYapi, null, 2), 'utf8')

  return { kartlar, karar: kararYapi }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) kararTetikle (reconcile sonrası tetik)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * karar_id'nin TÜM kartları cevaplandıysa VE henüz fasilite edilmemişse → operatör-only taslak yazar.
 * Idempotent: fasilite edilmişse (fasilitasyon_durumu != null) atlar.
 * fail-closed: tarafsızlık ihlalinde taslak YAZILMAZ, hata döndürür.
 *
 * partner_cevap = JSON string { secenek, pozisyon, gerekce? }
 *
 * @returns {{ ok?, atlandı?, sebep?, sentezKart?, terminal_sinif?, taslakYol?, hata? }}
 */
export function kararTetikle({ karar_id, proje, _rootDir }) {
  const pdir = projeDir(proje, _rootDir)
  const kararPath = join(pdir, 'karar-kartlar', `${karar_id}.json`)

  if (!existsSync(kararPath)) throw new Error(`Karar dosyası bulunamadı: ${kararPath}`)
  const karar = JSON.parse(readFileSync(kararPath, 'utf8'))

  // Idempotent: zaten fasilite edilmişse atla
  if (karar.fasilitasyon_durumu) {
    return { atlandı: true, sebep: `zaten fasilite edildi (${karar.fasilitasyon_durumu})` }
  }

  // Tüm kartlar cevaplandı mı?
  const tumCevaplandi = karar.kartlar.every(k => k.durum === 'cevaplandi' && k.partner_cevap)
  if (!tumCevaplandi) {
    return { atlandı: true, sebep: 'henüz tüm kartlar cevaplanmadı' }
  }

  // Taraf objelerini kur (partner_cevap = JSON { secenek, pozisyon, gerekce? })
  let taraflar
  try {
    taraflar = karar.kartlar.map(k => {
      const parsed = JSON.parse(k.partner_cevap)
      if (!parsed.secenek || !parsed.pozisyon) {
        throw new Error(`partner_cevap eksik alan (kart: ${k.id}): secenek + pozisyon zorunlu`)
      }
      const partner = karar.partnerler.find(p => p.slug === k.partner_slug)
      return {
        ad: partner?.ad ?? k.partner_slug,
        secenek: parsed.secenek,
        pozisyon: parsed.pozisyon,
        gerekce: parsed.gerekce ?? [],
      }
    })
  } catch (e) {
    const hata = `partner_cevap parse hatası: ${e.message}`
    console.error(hata)
    return { ok: false, hata }
  }

  const [tarafA, tarafB] = taraflar

  // fasilitasyonRutini
  let sentezKart
  try {
    sentezKart = fasilitasyonRutini(karar.kararNoktasi, tarafA, tarafB)
  } catch (e) {
    const hata = `fasilitasyonRutini başarısız: ${e.message}`
    console.error(hata)
    return { ok: false, hata }
  }

  // tarafsizlikDenetimi — fail-closed: geçmezse TASLAK YAZILMAZ
  const denetim = tarafsizlikDenetimi(sentezKart)
  if (!denetim.temiz) {
    const hata = `tarafsızlık ihlali (taslak yazılmadı): ${denetim.bulgular.join(', ')}`
    console.error(hata)
    return { ok: false, hata }
  }

  // Terminal sınıfı otomatik belirle
  const yakinsadi = tarafA.secenek === tarafB.secenek
  const terminal_sinif = yakinsadi
    ? 'yakinsama'
    : (karar.kararNoktasi.krux.tur === 'olgu' ? 'olgu' : 'deger')

  const termCtx = yakinsadi
    ? { yon: tarafA.secenek }
    : terminal_sinif === 'olgu'
      ? { olguIsareti: karar.kararNoktasi.krux.ayrisma }
      : {
          eksen: [
            ...karar.kararNoktasi.krux.olguBosluklari ?? [],
            karar.kararNoktasi.krux.ayrisma,
          ].filter(Boolean).join(' | '),
        }

  // Operatör-only taslak yaz (projeler/<proje>/_fasilitasyon-taslak/<karar_id>.md)
  const taslakDir = join(pdir, '_fasilitasyon-taslak')
  mkdirSync(taslakDir, { recursive: true })

  const taslakMd = sentezKartiMarkdown(sentezKart)
  const taslakYol = join(taslakDir, `${karar_id}.md`)
  writeFileSync(taslakYol, taslakMd, 'utf8')

  // Metadata (yayınla adımı için sentezKart + terminal bilgisi)
  const taslakMeta = { karar_id, proje, sentezKart, terminal_sinif, termCtx }
  writeFileSync(join(taslakDir, `${karar_id}.json`), JSON.stringify(taslakMeta, null, 2), 'utf8')

  // Karar state güncelle (fasilitasyon_durumu: 'taslak-hazir'; partner sentez kartı HENÜZ OLUŞTURULMAZ)
  karar.fasilitasyon_durumu = 'taslak-hazir'
  karar.kartlar = karar.kartlar.map(k => ({ ...k, fasilitasyon_durumu: 'taslak-hazir' }))
  writeFileSync(kararPath, JSON.stringify(karar, null, 2), 'utf8')

  return { ok: true, sentezKart, terminal_sinif, taslakYol }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) fasilitasyonuYayinla
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Operatör onayından sonra: taslağı partner-görünür sentez-harita kartına dönüştürür.
 *   yakınsama  → sentez (ilerleme/bitti) + onay (girdi-talebi/cevap-bekliyor)
 *   deadlock/deger/olgu → yalnız sentez + escalation_flag:true; onay kartı YOK
 * Idempotent: yayınlandıysa atlar.
 *
 * @returns {{ ok?, atlandı?, sebep?, sentezKartlar?, escalation_flag?, terminal_sinif?, hata? }}
 */
export function fasilitasyonuYayinla({ karar_id, proje, _rootDir }) {
  const pdir = projeDir(proje, _rootDir)
  const kararPath = join(pdir, 'karar-kartlar', `${karar_id}.json`)

  if (!existsSync(kararPath)) throw new Error(`Karar dosyası bulunamadı: ${kararPath}`)
  const karar = JSON.parse(readFileSync(kararPath, 'utf8'))

  // Idempotent
  if (karar.fasilitasyon_durumu === 'yayinlandi') {
    return { atlandı: true, sebep: 'zaten yayınlandı' }
  }
  if (karar.fasilitasyon_durumu !== 'taslak-hazir') {
    return {
      ok: false,
      hata: `yayınlamak için taslak-hazir durumu gerekli (mevcut: ${karar.fasilitasyon_durumu ?? 'null'})`,
    }
  }

  // Taslak metadata oku
  const taslakMetaYol = join(pdir, '_fasilitasyon-taslak', `${karar_id}.json`)
  if (!existsSync(taslakMetaYol)) throw new Error(`Taslak metadata bulunamadı: ${taslakMetaYol}`)
  const taslakMeta = JSON.parse(readFileSync(taslakMetaYol, 'utf8'))

  const { sentezKart, terminal_sinif, termCtx } = taslakMeta
  const terminal = terminalCerceve(terminal_sinif, termCtx ?? {})

  const now = new Date().toISOString()

  // Build-bağlamı: karar kartları faz/task_id taşıyorsa sentez kartına aktar (opt-in)
  const ilkKart = karar.kartlar?.[0] ?? {}
  const buildMeta = ilkKart.faz
    ? { faz: ilkKart.faz, task_id: ilkKart.task_id ?? null, linked_karar_id: karar_id }
    : {}

  // Partner-görünür READ-ONLY sentez-harita kartı (tip:'ilerleme' = statik, düzenlenemez)
  const sentezHaritaKarti = {
    id: `${karar_id}-sentez`,
    tip: 'ilerleme',
    durum: 'bitti',
    ozet: `Karar-fasilitasyon sentezi — ${sentezKart.ozet}`,
    detay: [
      sentezKartiMarkdown(sentezKart),
      '',
      '---',
      `## ${terminal.baslik}`,
      '',
      terminal.metin,
      ...(terminal.taslak ? ['', `**Taslak yön:** ${terminal.taslak}`] : []),
    ].join('\n'),
    partner_cevap: null,
    olusturma: now,
    guncelleme: now,
    karar_id,
    kategori: 'karar-sentez',
    fasilitasyon_durumu: 'yayinlandi',
    ...buildMeta,
  }

  const sentezHatalari = kartDogrula(sentezHaritaKarti)
  if (sentezHatalari.length) throw new Error(`Sentez-harita kartı şema hatası: ${sentezHatalari.join('; ')}`)

  const sonucKartlar = [sentezHaritaKarti]
  let escalation_flag = false

  if (terminal_sinif === 'yakinsama') {
    // Onay kartı (re-engagement: yazılabilir girdi-talebi, mevcut desenle aynı)
    const onayKarti = {
      id: `${karar_id}-onay`,
      tip: 'girdi-talebi',
      durum: baslangicDurum('girdi-talebi'),  // 'cevap-bekliyor'
      ozet: 'Fasilitasyon yakınsadı — onaylıyor musun?',
      detay: terminal.taslak
        ? `Fasilitasyon şu yönde yakınsadı: **${terminal.taslak}**.\n\nBu taslağı onaylıyor musun? Değişiklik veya not varsa yaz.`
        : 'Fasilitasyon yakınsadı. Onay veya notunu yaz.',
      partner_cevap: null,
      olusturma: now,
      guncelleme: now,
      karar_id,
      kategori: 'karar-onay',
    }
    const onayHatalari = kartDogrula(onayKarti)
    if (onayHatalari.length) throw new Error(`Onay kartı şema hatası: ${onayHatalari.join('; ')}`)
    sonucKartlar.push(onayKarti)
  } else {
    // deadlock / değer-ayrışması / olgu-ayrışması → escalation, onay kartı YOK
    escalation_flag = true
  }

  // Sentez kartlarını kart deposuna yaz (projeler/<proje>/sentez-kartlar/<karar_id>.json)
  const sentezDir = join(pdir, 'sentez-kartlar')
  mkdirSync(sentezDir, { recursive: true })
  writeFileSync(
    join(sentezDir, `${karar_id}.json`),
    JSON.stringify({ kartlar: sonucKartlar, escalation_flag, terminal_sinif }, null, 2),
    'utf8'
  )

  // Karar state güncelle
  karar.fasilitasyon_durumu = 'yayinlandi'
  karar.kartlar = karar.kartlar.map(k => ({ ...k, fasilitasyon_durumu: 'yayinlandi' }))
  karar.terminal_sinif = terminal_sinif
  karar.escalation_flag = escalation_flag
  writeFileSync(kararPath, JSON.stringify(karar, null, 2), 'utf8')

  // Tek-kaynak event_blok değerlendirmesi
  // yakınsama: onay bekleniyor → ac:false | deadlock: escalation → ac:false
  buildTaskEventBlokDegerlendirAc({
    pdir,
    task_id: buildMeta.task_id ?? null,
    sentezDosya: { kartlar: sonucKartlar, escalation_flag, terminal_sinif },
  })

  return { ok: true, sentezKartlar: sonucKartlar, escalation_flag, terminal_sinif }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Build-task event_blok açma (tek-kaynak)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Build-task event_blok durumunu değerlendir ve uygunsa temizle.
 * TEK KAYNAK: hem karar hem yeni olay yolu bu fonksiyonu çağırır.
 *
 * Kural:
 *   escalation_flag:true           → SET kal (insan tie-break bekleniyor)
 *   yakınsama + onay cevap-bekliyor → SET kal (insan onayı bekleniyor)
 *   yakınsama + onay cevaplandi     → AÇ
 *   kapısız (araştırma/karar-destek/diğer, escalation yok) → AÇ
 *
 * @param {{ pdir: string, task_id: string|null, sentezDosya: object }} p
 * @returns {{ ac: boolean, sebep: string }}
 */
export function buildTaskEventBlokDegerlendirAc({ pdir, task_id, sentezDosya }) {
  if (!task_id) return { ac: false, sebep: 'task_id yok — event_blok kontrolü atlandı' }

  const taskYol = join(pdir, 'build-task', `${task_id}.json`)
  if (!existsSync(taskYol)) return { ac: false, sebep: `build-task bulunamadı: ${task_id}` }

  let task
  try { task = JSON.parse(readFileSync(taskYol, 'utf8')) } catch { return { ac: false, sebep: 'build-task okunamadı' } }

  if (task.event_blok == null) return { ac: false, sebep: 'event_blok zaten boş' }

  // Deadlock: her zaman SET kal
  if (sentezDosya?.escalation_flag) {
    return { ac: false, sebep: 'escalation_flag:true — insan tie-break bekleniyor' }
  }

  // Kapılı-yakınsama: onay kartı cevaplandi değilse SET kal
  if (sentezDosya?.terminal_sinif === 'yakinsama') {
    const onayKarti = (sentezDosya.kartlar ?? []).find(k => k.kategori === 'karar-onay')
    if (onayKarti && onayKarti.durum !== 'cevaplandi') {
      return { ac: false, sebep: `onay kartı henüz cevaplandi değil (durum: ${onayKarti.durum})` }
    }
  }

  // Kapısız veya onaylı-yakınsama: temizle
  task.event_blok = null
  task.guncelleme = new Date().toISOString()
  writeFileSync(taskYol, JSON.stringify(task, null, 2), 'utf8')

  return { ac: true, sebep: 'event_blok temizlendi', task_id }
}

/**
 * Onay kartını cevaplar → event_blok'u tek-kaynak üzerinden değerlendirir.
 * Kapılı-yakınsama olaylarda insan-onay adımıdır.
 *
 * @param {{ karar_id, proje, partner_cevap?, task_id?, _rootDir? }} p
 *   task_id: opsiyonel override — karar kartlarında build damgası yoksa kullan
 * @returns {{ ok?, atlandı?, sebep?, event_blok_acildi? }}
 */
export function onayKartinaCevap({ karar_id, proje, partner_cevap, task_id: overrideTaskId, _rootDir }) {
  const pdir = projeDir(proje, _rootDir)
  const sentezYol = join(pdir, 'sentez-kartlar', `${karar_id}.json`)

  if (!existsSync(sentezYol)) throw new Error(`Sentez dosyası bulunamadı: ${sentezYol}`)
  let sentezDosya = JSON.parse(readFileSync(sentezYol, 'utf8'))

  const onayIdx = sentezDosya.kartlar.findIndex(k => k.kategori === 'karar-onay')
  if (onayIdx < 0) return { ok: false, hata: 'onay kartı bulunamadı — yakınsama değil ya da onay kartı üretilmedi' }

  if (sentezDosya.kartlar[onayIdx].durum === 'cevaplandi') {
    return { atlandı: true, sebep: 'onay kartı zaten cevaplandi' }
  }

  // Onay kartını güncelle
  sentezDosya.kartlar[onayIdx] = {
    ...sentezDosya.kartlar[onayIdx],
    durum: 'cevaplandi',
    partner_cevap: partner_cevap ?? 'Onaylandı.',
    guncelleme: new Date().toISOString(),
  }
  writeFileSync(sentezYol, JSON.stringify(sentezDosya, null, 2), 'utf8')

  // task_id: override > sentez kartından > null
  const sentezKarti = sentezDosya.kartlar.find(k => k.kategori === 'karar-sentez')
  const task_id = overrideTaskId ?? sentezKarti?.task_id ?? null

  // Tek-kaynak event_blok değerlendirmesi
  const acResult = buildTaskEventBlokDegerlendirAc({ pdir, task_id, sentezDosya })

  return { ok: true, event_blok_acildi: acResult.ac, sebep: acResult.sebep }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) Ters-kanal meta-komut intake
//    meta-komut.md'de "YAYINLA <karar_id> <proje>" komutlarını işler.
//    KURAL: yalnız işlenmemiş ### KOMUT [damga] bloklarına bakar.
// ─────────────────────────────────────────────────────────────────────────────
export function metaKomutIsle() {
  const komutYol = join(META_DATA_ROOT, 'meta-komut.md')
  const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')
  if (!existsSync(komutYol)) return { islem: false, sebep: 'meta-komut.md bulunamadı' }

  const icerik = readFileSync(komutYol, 'utf8')
  const bloklar = [...icerik.matchAll(/^### KOMUT \[([^\]]+)\]([\s\S]*?)(?=^### KOMUT |\Z)/gm)]

  const sonuclar = []
  for (const blok of bloklar) {
    const damga = blok[1].trim()
    const govde = blok[2].trim()
    const yayinlaMatch = govde.match(/^YAYINLA\s+(\S+)\s+(\S+)/m)
    if (!yayinlaMatch) continue

    const [, karar_id, proje] = yayinlaMatch
    const sonuc = fasilitasyonuYayinla({ karar_id, proje })
    const not = sonuc.atlandı
      ? `[${damga}] YAYINLA ${karar_id}/${proje} → atlandı: ${sonuc.sebep}`
      : sonuc.ok
        ? `[${damga}] YAYINLA ${karar_id}/${proje} → yayınlandı (terminal: ${sonuc.terminal_sinif}, escalation: ${sonuc.escalation_flag})`
        : `[${damga}] YAYINLA ${karar_id}/${proje} → HATA: ${sonuc.hata}`

    appendFileSync(kanalYol, `\n${not}\n`, 'utf8')
    sonuclar.push({ damga, karar_id, proje, sonuc })
  }

  return { islem: true, sonuclar }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI main
// ─────────────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)

  if (args.includes('--komut')) {
    const r = metaKomutIsle()
    if (!r.islem) { console.log('Komut intake:', r.sebep) }
    else {
      console.log(`${r.sonuclar.length} YAYINLA komutu işlendi`)
      for (const s of r.sonuclar) console.log(' ', s.damga, s.karar_id, s.proje, s.sonuc.ok ? 'ok' : (s.sonuc.atlandı ? 'atlandı' : 'HATA'))
    }
  } else {
    const yIdx = args.indexOf('--yayinla')
    const pIdx = args.indexOf('--proje')
    if (yIdx >= 0 && pIdx >= 0) {
      const karar_id = args[yIdx + 1]
      const proje = args[pIdx + 1]
      if (!karar_id || !proje) { console.error('Kullanım: --yayinla <karar_id> --proje <proje>'); process.exit(1) }
      const r = fasilitasyonuYayinla({ karar_id, proje })
      if (r.atlandı) console.log('Atlandı:', r.sebep)
      else if (r.ok) {
        console.log(`Yayınlandı: ${karar_id} | terminal: ${r.terminal_sinif} | escalation: ${r.escalation_flag}`)
        console.log('Kartlar:', r.sentezKartlar.map(k => k.id).join(', '))
      } else {
        console.error('Hata:', r.hata)
        process.exit(1)
      }
    } else {
      console.log('Kullanım:')
      console.log('  node scripts/kararWire.mjs --yayinla <karar_id> --proje <proje>')
      console.log('  node scripts/kararWire.mjs --komut')
    }
  }
}
