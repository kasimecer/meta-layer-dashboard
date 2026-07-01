// meta-layer-core — Karar-fasilitasyon rutini (v0 + v1 çok-turlu uzantısı)
//
// v1 EKLER (v0 GENİŞLETİLDİ, yeniden yazılmadı): çok-turlu loop desteği —
//   metinTarafsizMi (düşük-seviye nötrlük; sentez + keskinleştirici-soru + terminal metnine uygulanır),
//   karistir (seed'li sıra-randomizasyonu), terminalCerceve (olgu/değer/yakınsama/boşluk),
//   sentezGovdeMarkdown + cokTurluTranskriptMarkdown. v0 imzaları (fasilitasyonRutini,
//   tarafsizlikDenetimi, sentezKartiMarkdown) KORUNDU.
//
// DAVRANIŞ-KONTRATI (KESİN SINIR): Bu rutin bir FASİLİTATÖR'dür, hâkim DEĞİL.
//   - Seçenekleri NÖTR haritalar + olgu-tabanını verir.
//   - ÖNERMEZ · oy VERMEZ · bir seçeneğe İTMEZ · "ben şunu seçerdim" demez. İnsan hükmeder.
//   - Olgu ile değer-yargısını AYIRIR; değer-ayrışmasını olgu gibi "çözmez".
//   - Kaynaksız sayı ÜRETMEZ; eksik olgu "[eksik: doğrulanacak]" diye İŞARETLENİR, UYDURULMAZ.
//
// KART-ŞEMA-v1 UYUMU (yeni primitive İCAT EDİLMEDİ):
//   Çıktı, mevcut durum-makinesi v1'in 'girdi-talebi' primitive'ini kullanır
//   (akış: cevap-bekliyor → cevaplandi = "insan hükmü bekliyor"). 'kategori: karar' damgası
//   eklenir. NOT: şema-v1 tip-kümesinde 'karar' YOK; eklemek KİLİTLİ durum-makinesini (KK-47/48)
//   değiştirmek = yeni primitive icat etmek olurdu → görev gereği YAPILMADI, mevcut primitive
//   yeniden kullanıldı. (Bkz. meta-kanal raporu.)

import { baslangicDurum, kartDogrula } from './stateMachine.js'

export const ROL = 'fasilitatör'

// --- 1) OLGU-TABANI: kaynaklı = doğrulandı; kaynaksız/eksik = [eksik: doğrulanacak]. Sayı uydurmaz.
function olguTabaniKur(olgular) {
  return (olgular ?? []).map(o => {
    if (!o || !o.olgu) throw new Error('Olgu metni zorunlu')
    const eksik = o.durum === 'eksik' || !o.kaynak
    return {
      olgu: o.olgu,
      kaynak: eksik ? null : o.kaynak,
      durum: eksik ? 'eksik' : 'doğrulandı',
      isaret: eksik ? '[eksik: doğrulanacak]' : null,
    }
  })
}

// --- 2) KRUX: ayrışma + ZORUNLU sınıflandırma {olgu | deger}. Fasilitatör fark/değeri ayırır.
function kruxKur(krux) {
  if (!krux || !krux.ayrisma) throw new Error('KRUX.ayrisma zorunlu')
  if (!['olgu', 'deger'].includes(krux.tur)) {
    throw new Error(`KRUX.tur ∈ {olgu, deger} olmalı (verildi: ${krux.tur})`)
  }
  const cozumYolu = krux.tur === 'olgu'
    ? 'ek-araştırma / oracle ile çözülebilir.'
    : 'olguyla çözülmez; insan-yargısı gerekir.'
  return {
    tur: krux.tur,
    ayrisma: krux.ayrisma,
    cozumYolu,
    // Değer-ayrışmasında bile yargıyı BİLGİLENDİREN (ama tek başına çözmeyen) olgu-boşlukları:
    olguBosluklari: krux.olguBosluklari ?? [],
  }
}

// --- 3) SEÇENEK-HARİTASI: her seçenek NÖTR + üç boyut ZORUNLU. Öneri/puan/tavsiye alanı YASAK.
function secenekHaritasiKur(secenekler) {
  if (!Array.isArray(secenekler) || secenekler.length !== 2) {
    throw new Error('v0: tam iki seçenek beklenir')
  }
  return secenekler.map(s => {
    for (const alan of ['ad', 'optimize', 'feda', 'kazanmaKosulu']) {
      if (!s[alan]) throw new Error(`Seçenek-haritası eksik zorunlu alan "${alan}": ${s.ad ?? '?'}`)
    }
    for (const yasak of ['oneri', 'puan', 'tavsiye', 'tercih', 'oy']) {
      if (yasak in s) throw new Error(`Tarafsızlık: seçenek-haritasında "${yasak}" alanı yasak (${s.ad})`)
    }
    return {
      ad: s.ad,
      optimize: s.optimize,           // neyi optimize eder
      feda: s.feda,                   // neyi feda eder
      kazanmaKosulu: s.kazanmaKosulu, // kazanması için neyin doğru olması gerekir
    }
  })
}

function normalizeTaraf(t) {
  if (!t || !t.secenek || !t.pozisyon) throw new Error('Taraf-girdisi {ad, secenek, pozisyon, gerekce} gerektirir')
  return { ad: t.ad, secenek: t.secenek, pozisyon: t.pozisyon, gerekce: t.gerekce ?? [] }
}

/**
 * Karar-noktası + iki taraf-girdisi → TEK sentez kartı (şema-v1; tip 'girdi-talebi'; cevap-bekliyor).
 * Sentez TAM şu sırada üretilir: 1) OLGU-TABANI · 2) KRUX · 3) SEÇENEK-HARİTASI · 4) hüküm insanda.
 * @param {{id,baslik,ozet,olguTabani,krux,secenekler}} kararNoktasi
 * @param {{ad,secenek,pozisyon,gerekce}} tarafA
 * @param {{ad,secenek,pozisyon,gerekce}} tarafB
 * @returns {Kart} schema-v1 kart (+ kategori:'karar', sentez{}, rol)
 */
export function fasilitasyonRutini(kararNoktasi, tarafA, tarafB) {
  if (!kararNoktasi?.id) throw new Error('kararNoktasi.id zorunlu')
  if (!kararNoktasi.ozet) throw new Error('kararNoktasi.ozet zorunlu')

  const sentez = {
    olguTabani: olguTabaniKur(kararNoktasi.olguTabani),       // 1
    krux: kruxKur(kararNoktasi.krux),                          // 2
    secenekHaritasi: secenekHaritasiKur(kararNoktasi.secenekler), // 3
    taraflar: [normalizeTaraf(tarafA), normalizeTaraf(tarafB)],
  }

  const now = new Date().toISOString()
  const kart = {
    id: kararNoktasi.id,
    tip: 'girdi-talebi',                       // mevcut primitive (yeni tip icat YOK)
    durum: baslangicDurum('girdi-talebi'),     // 'cevap-bekliyor' — 4) hüküm insanda
    kategori: 'karar',
    rol: ROL,
    ozet: kararNoktasi.ozet,
    detay: kararNoktasi.baslik ?? kararNoktasi.ozet,
    sentez,
    partner_cevap: null,
    olusturma: now,
    guncelleme: now,
  }

  // Kapı 1 — şema-v1 doğrulaması (mevcut primitive).
  const semaHatalari = kartDogrula(kart)
  if (semaHatalari.length) throw new Error('Şema-v1 doğrulaması başarısız: ' + semaHatalari.join('; '))

  // Kapı 2 — tarafsızlık (fasilitatör-üretimi metinde öneri/oy/itme dili olmamalı).
  const t = tarafsizlikDenetimi(kart)
  if (!t.temiz) throw new Error('Tarafsızlık ihlali (fasilitatör öneri/itme dili kullandı): ' + t.bulgular.join(', '))

  return kart
}

// Neutrality guard — fasilitatör-üretimi metinde öneri/oy/itme dili ARAR (taraf-gerekçeleri HARİÇ:
// onlar tarafların KENDİ sözü). Bulursa metin/kart kirli sayılır.
const ONERI_DESENLERI = [
  /öner(i|irim|iyorum|ilen|ir|elim)\b/i,
  /tavsiye/i,
  /\bseçerdim\b/i,
  /\bben\b[^.]{0,20}\bseç/i,
  /en\s+iyi\s+seçenek/i,
  /doğru\s+seçenek/i,
  /\boy\s+ver/i,
  /bence\b/i,
]

// Düşük-seviye: herhangi bir METNİ (string | string[]) öneri/oy/itme dili için tarar.
// v1: sentez kartı DIŞINDA keskinleştirici-sorular + terminal-çerçeve için de kullanılır (build-gate).
export function metinTarafsizMi(metin) {
  const birlesik = (Array.isArray(metin) ? metin : [metin]).filter(Boolean).join('\n')
  const bulgular = ONERI_DESENLERI.filter(re => re.test(birlesik)).map(re => re.source)
  return { temiz: bulgular.length === 0, bulgular }
}

// Sentez kartına özel sarmalayıcı (v0 imzası korunur).
export function tarafsizlikDenetimi(kart) {
  return metinTarafsizMi([
    kart.ozet,
    kart.detay,
    ...(kart.sentez?.olguTabani ?? []).map(o => o.olgu),
    kart.sentez?.krux?.ayrisma,
    kart.sentez?.krux?.cozumYolu,
    ...(kart.sentez?.krux?.olguBosluklari ?? []),
    ...(kart.sentez?.secenekHaritasi ?? []).flatMap(s => [s.ad, s.optimize, s.feda, s.kazanmaKosulu]),
  ])
}

// --- Sunum: TAM sentez kartı (H1 + meta + gövde). v0 çıktısı KORUNUR.
export function sentezKartiMarkdown(kart) {
  const L = []
  L.push(`# Karar-fasilitasyon — Sentez Kartı (v0)`)
  L.push('')
  L.push(`> **id:** \`${kart.id}\` · **tip:** \`${kart.tip}\` · **durum:** \`${kart.durum}\` · **kategori:** \`${kart.kategori}\` · **rol:** ${kart.rol}`)
  L.push(`> **üretim:** ${kart.olusturma}`)
  L.push('>')
  L.push(`> Bu kart bir FASİLİTATÖR çıktısıdır: öneri/oy/itme İÇERMEZ. Hüküm insanındır.`)
  L.push('')
  L.push(sentezGovdeMarkdown(kart))
  return L.join('\n')
}

// Sentez GÖVDESİ (H1/meta'sız): mandated sıra 1→4 + taraflar. Çok-turlu transkript bunu yeniden kullanır.
export function sentezGovdeMarkdown(kart) {
  const s = kart.sentez
  const L = []
  L.push(`## Karar-noktası`)
  L.push(kart.detay)
  L.push('')
  L.push(`## 1. OLGU-TABANI (doğrulanmış · kaynaklı; eksikler işaretli)`)
  for (const o of s.olguTabani) {
    if (o.durum === 'doğrulandı') L.push(`- ${o.olgu}  \n  _kaynak: ${o.kaynak}_`)
    else L.push(`- **${o.isaret}** ${o.olgu}`)
  }
  L.push('')
  L.push(`## 2. KRUX — iki pozisyon nerede + niçin ayrışıyor?`)
  const turEtiket = s.krux.tur === 'deger' ? 'DEĞER/STRATEJİ-ayrışması' : 'OLGU-ayrışması'
  L.push(`**Ayrışma türü:** ${turEtiket} — ${s.krux.cozumYolu}`)
  L.push('')
  L.push(s.krux.ayrisma)
  if (s.krux.olguBosluklari.length) {
    L.push('')
    L.push(`**Yargıyı bilgilendiren olgu-boşlukları** (doldurulursa kararı netleştirir; tek başına karar VERMEZ):`)
    for (const b of s.krux.olguBosluklari) L.push(`- ${b}`)
  }
  L.push('')
  L.push(`## 3. SEÇENEK-HARİTASI (nötr — her seçenek aynı üç eksende)`)
  for (const o of s.secenekHaritasi) {
    L.push(`### ${o.ad}`)
    L.push(`- **Optimize eder:** ${o.optimize}`)
    L.push(`- **Feda eder:** ${o.feda}`)
    L.push(`- **Kazanması için doğru olması gereken:** ${o.kazanmaKosulu}`)
    L.push('')
  }
  L.push(`## 4. Hüküm insanda`)
  L.push(`Bu kart bir seçeneğe işaret etmez. Seçim insana bırakılmıştır.`)
  L.push(`Durum: \`cevap-bekliyor\` → insan cevaplayınca \`cevaplandi\` (durum-makinesi v1, girdi-talebi).`)
  L.push('')
  L.push(`## Ek — Taraf-girdileri (şeffaflık; tarafların KENDİ sözü, fasilitatör yorumu değil)`)
  for (const t of s.taraflar) {
    L.push(`**${t.ad}** — seçenek **${t.secenek}** yanlısı. Pozisyon: ${t.pozisyon}`)
    for (const g of t.gerekce) L.push(`  - ${g}`)
    L.push('')
  }
  return L.join('\n')
}

// ============================================================
// v1 — ÇOK-TURLU LOOP YARDIMCILARI
// ============================================================

// Seed'li deterministik karıştırma (mulberry32 + Fisher-Yates). Sıra-randomizasyonu
// loglanabilir/yeniden-üretilebilir olsun diye seed dışarıdan verilir.
export function karistir(dizi, seed = 1) {
  let t = seed >>> 0
  const rng = () => {
    t = (t + 0x6D2B79F5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  const a = [...dizi]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Terminal-çerçeve. Fasilitatör taraf SEÇMEZ, uzlaşı ZORLAMAZ, berabereyi BOZMAZ (KK-33).
// Üretilen metin çağıran tarafından metinTarafsizMi ile denetlenir.
export function terminalCerceve(sinif, d = {}) {
  switch (sinif) {
    case 'olgu':
      return { sinif, baslik: 'TERMİNAL — OLGU-ayrışması',
        metin: `Ayrışma olgusaldır → ${d.olguIsareti ?? 'ilgili olgu oracle/araştırma ile doğrulanmalı'}. ` +
          `Doğrulanana dek seçenek-haritası açık kalır; bu bir değer-tercihi değildir. Fasilitatör taraf seçmez.` }
    case 'deger':
      return { sinif, baslik: 'TERMİNAL — DEĞER/STRATEJİ-ayrışması',
        metin: `Taraflar olgularda anlaştı; ayrışma altta-yatan değer-bahsinde (${d.eksen ?? 'risk-toleransı + zaman-ufku'}) ` +
          `sürdü ve YAKINSAMADI. Bu olguyla çözülmez. Seçenek-haritası insana sunulur; hüküm insanındır. ` +
          `Fasilitatör taraf seçmez, uzlaşı zorlamaz, berabereyi bozmaz (KK-33).` }
    case 'yakinsama':
      return { sinif, baslik: 'TERMİNAL — Yakınsama (insan-onayına taslak)',
        metin: `Taraflar şu yönde yakınsadı: ${d.yon ?? '(belirtilmedi)'}. Bu bir TASLAKTIR; yürürlük için ` +
          `insan-onayı gerekir. Fasilitatör kararı kesinleştirmez.`, taslak: d.yon ?? null }
    case 'bosluk':
      return { sinif, baslik: 'TERMİNAL — Boşluk (persona cevabı alınamadı)',
        metin: `Bu tur persona cevabı OpenRouter'dan alınamadı (${d.hata ?? 'bilinmeyen'}). ` +
          `Cevap UYDURULMADI; tur boşluk olarak işaretlendi, loop durduruldu.` }
    default:
      throw new Error(`bilinmeyen terminal sınıfı: ${sinif}`)
  }
}

// Çok-turlu transkripti Markdown'a döker (her tur: sıra-seed + sentez + sorular + persona-cevapları + terminal).
export function cokTurluTranskriptMarkdown(loop) {
  const L = []
  L.push(`# Karar-fasilitasyon — Çok-turlu Transkript (v1)`)
  L.push('')
  L.push(`> **karar-noktası:** \`${loop.id}\``)
  L.push(`> **fasilitatör modeli:** ${loop.modeller?.fasilitator ?? '(belirtilmedi)'}`)
  L.push(`> **personalar:** A=\`${loop.modeller?.personaA}\` · B=\`${loop.modeller?.personaB}\` (OpenRouter free; test-fikstürü, ürün değil)`)
  L.push(`> **tur sayısı:** ${loop.turlar.length} (≤3) · **üretim:** ${loop.uretim}`)
  L.push('>')
  L.push(`> Tüm FASİLİTATÖR-üretimi metin (sentez + sorular + terminal) nötrlük-gate'inden geçti. Persona cevapları OpenRouter'dan CANLI alındı (uydurma yok).`)
  L.push('')
  if (loop.notlar?.length) {
    L.push(`**Koşum notları:**`)
    for (const n of loop.notlar) L.push(`- ${n}`)
    L.push('')
  }
  L.push(`## Karar-noktası`)
  L.push(loop.baslik)
  L.push('')
  for (const tur of loop.turlar) {
    L.push('---')
    L.push('')
    L.push(`## Tur ${tur.no}`)
    L.push(`_sıra-randomizasyonu (seed ${tur.seed}): seçenekler → ${tur.sira.secenekler.join(' · ')} | taraflar → ${tur.sira.taraflar.join(' · ')}_`)
    L.push('')
    L.push(`### Sentez (tur ${tur.no})`)
    L.push(sentezGovdeMarkdown(tur.sentezKart))
    L.push('')
    L.push(`### Keskinleştirici sorular (nötr, simetrik — altta-yatan varsayımı görünür kılar)`)
    for (const q of tur.sorular) L.push(`- **${q.taraf}** (→ \`${q.model}\`): ${q.soru}`)
    L.push('')
    L.push(`### Persona cevapları (OpenRouter — canlı)`)
    for (const c of tur.cevaplar) {
      if (c.durum === 'ok') {
        L.push(`**${c.taraf}** (\`${c.model}\`):`)
        L.push('')
        L.push(String(c.cevap).split('\n').map(x => `> ${x}`).join('\n'))
      } else {
        L.push(`**${c.taraf}** (\`${c.model}\`): _[boşluk: cevap alınamadı — ${c.hata ?? 'bilinmeyen'}; UYDURULMADI]_`)
      }
      if (c.not) L.push(`_(${c.not})_`)
      L.push('')
    }
  }
  L.push('---')
  L.push('')
  L.push(`## ${loop.terminal.baslik}`)
  L.push(loop.terminal.metin)
  if (loop.terminal.taslak) {
    L.push('')
    L.push(`**İnsan-onayına taslak:** ${loop.terminal.taslak}`)
  }
  L.push('')
  return L.join('\n')
}
