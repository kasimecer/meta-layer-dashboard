// meta-layer-core — Jenerik master-plan bölücü (proje-agnostik).
// Herhangi bir markdown master-plan dokümanından somut yapılacak-işleri çıkarır.
// Barış'a özel hardcode YOK — evrensel markdown desenleri kullanılır.
//
// Çıktı: tip:ilerleme / durum:bitti kartları (şema v1) + opsiyonel build metadata.
// Opsiyonel metadata: faz, build_durum, sahip, cikti_pointer, event_blok
// (şema dışı; mevcut kartDogrula kurallarını değiştirmez).
//
// Koşum: node scripts/masterPlanBolucu.mjs <md-yol> <çıktı-dizin> [proje-id]

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { kartDogrula } from '../src/lib/stateMachine.js'

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function stripMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[✅⏳⚑⚠⚡·↔→←—]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text, max = 120) {
  // Parantez/em-dash açıklamalarını kes; özeti kısa tut.
  const t = stripMarkdown(text)
    .replace(/\s*—\s*.+$/, '')
    .replace(/\s*\([^)]{30,}\)\s*$/, '')
    .trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function kartOlustur({ id, ozet, build_durum, sahip, kaynak, now }) {
  const kart = {
    // ── Zorunlu şema-v1 alanları ──
    id,
    tip: 'ilerleme',
    durum: 'bitti',        // AKIS['ilerleme'] = ['bitti'] — tek geçerli durum
    ozet: truncate(ozet),
    detay: `Kaynak: ${kaynak}`,
    partner_cevap: null,
    olusturma: now,
    guncelleme: now,
    // ── Opsiyonel build metadata (şema dışı; eski kart uyumunu kırmaz) ──
    faz: 'build',
    build_durum,           // 'bekliyor' | 'devam' | 'bitti' (görev ilerlemesi)
    sahip,                 // 'partner' | 'operator' | 'cc' | 'dis' | null
    cikti_pointer: null,   // url | yol | bos
    event_blok: null,      // blok: '<olay-id>' | temizlenmiş: null
  }
  const hatalar = kartDogrula(kart)
  if (hatalar.length) throw new Error(`Kart şema hatası [${id}]: ${hatalar.join('; ')}`)
  return kart
}

// ── Ana export ────────────────────────────────────────────────────────────────

/**
 * Markdown master-plan içeriğinden somut yapılacak-işleri çıkarır.
 *
 * Çıkarım desenleri (öncelik sırası):
 *   1. Checkbox: `- [x]` / `- [ ]`  → en güvenilir, evrensel
 *   2. Numaralı bold başlıklar: `N. **metin**`
 *   3. Inline yapılacaklar listesi: `**...yapılacak...**: A · B · C`
 *
 * @param {string} content  Markdown doküman içeriği
 * @param {{ projeId?: string, kaynak?: string }} opts
 * @returns {Object[]}  Şema-v1 tip:ilerleme kartları
 */
export function masterPlanBol(content, { projeId = 'proje', kaynak = 'master-plan' } = {}) {
  const now = new Date().toISOString()
  const kartlar = []
  const gorulmus = new Set()
  let seq = 1

  function anahtar(metin) {
    return stripMarkdown(metin).toLowerCase().replace(/\s+/g, '').slice(0, 28)
  }

  function ekle(ozet, build_durum, sahip) {
    const k = anahtar(ozet)
    if (!k || k.length < 3 || gorulmus.has(k)) return
    gorulmus.add(k)
    const id = `${projeId}-task-${String(seq++).padStart(3, '0')}`
    kartlar.push(kartOlustur({ id, ozet, build_durum, sahip, kaynak, now }))
  }

  // 1. Checkbox: - [x] / - [ ]
  for (const m of content.matchAll(/^[ \t]*-\s*\[([ xX✓])\]\s*(.+)$/gm)) {
    const bitti = m[1].trim() !== ''
    ekle(m[2].trim(), bitti ? 'bitti' : 'bekliyor', 'partner')
  }

  // 2. Numaralı bold başlıklar: N. **metin** veya N. **metin:** (kolon sona dahil olabilir)
  for (const m of content.matchAll(/^\d+\.\s+\*\*([^*\n]+?)\*\*/gm)) {
    // Format sıklıkla **başlık:** olur; sondaki kolonu at
    ekle(m[1].replace(/:$/, '').trim(), 'bekliyor', 'operator')
  }

  // 3. Inline yapılacaklar listesi: **...yapılacak...**: öğe · öğe · …
  // [^*\n] satır sınırını aşmasını önler; [ \t]* (değil \s*) newline'ı yutmaz.
  for (const m of content.matchAll(/\*\*[^*\n]*yapılacak[^*\n]*\*\*:?[ \t]*([^\n]+)/gi)) {
    const oğeler = m[1]
      .split(/\s*·\s*|\s*•\s*/)
      .map(s => s.replace(/\.$/, '').trim())
      .filter(s => stripMarkdown(s).length > 4)
    for (const oge of oğeler) ekle(oge, 'bekliyor', 'dis')
  }

  return kartlar
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,, mdYol, ciktiDizin, projeId = 'proje'] = process.argv
  if (!mdYol || !ciktiDizin) {
    console.error('Kullanım: node masterPlanBolucu.mjs <md-yol> <çıktı-dizin> [proje-id]')
    process.exit(1)
  }
  const icerik = readFileSync(mdYol, 'utf8')
  const kartlar = masterPlanBol(icerik, { projeId, kaynak: mdYol })
  mkdirSync(ciktiDizin, { recursive: true })
  for (const k of kartlar) {
    writeFileSync(join(ciktiDizin, `${k.id}.json`), JSON.stringify(k, null, 2), 'utf8')
  }
  console.log(`${kartlar.length} kart → ${ciktiDizin}`)
  for (const k of kartlar)
    console.log(`  ${k.id} [${k.build_durum}/${k.sahip}] ${k.ozet}`)
}
