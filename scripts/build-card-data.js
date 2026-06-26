import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projelerDir = join(META_DATA_ROOT, 'projeler')   // Drive veri-kökü (repo Drive-dışında)
const outDir = join(__dirname, '..', 'public')          // repo-local çıktı (yeni konum içine)
const okJSON = p => JSON.parse(readFileSync(p, 'utf8'))

// ============================================================
// 1) PROJE REGISTRY (proje-seviyesi metadata) + operator-<id>.json
// ============================================================
const registryPath = join(projelerDir, 'registry.json')
if (existsSync(registryPath)) {
  const reg = okJSON(registryPath)
  // light-enrich: signal.json olan projede zaman_son_aktivite'yi tarihten türet (canlı)
  const projeler = (reg.projeler ?? []).map(p => {
    const sp = join(projelerDir, p.id, 'signal.json')
    if (existsSync(sp)) {
      try { const s = okJSON(sp); if (s.tarih) return { ...p, zaman_son_aktivite: s.tarih } } catch { /* noop */ }
    }
    return p
  })
  writeFileSync(join(outDir, 'registry.json'), JSON.stringify({ projeler }, null, 2), 'utf8')
  console.log(`registry.json yazıldı (${projeler.length} proje)`)

  // operator-<id>.json — signal.json olan her proje için (operatör-ek: iç bayraklar + doküman pointer'ları)
  for (const p of projeler) {
    const pdir = join(projelerDir, p.id)
    const sp = join(pdir, 'signal.json')
    if (!existsSync(sp)) continue
    let s; try { s = okJSON(sp) } catch { continue }
    const dokumanlar = readdirSync(pdir)
      .filter(f => f.endsWith('.md')).sort()
      .map(f => ({ ad: f, yol: `projeler/${p.id}/${f}` }))
    const operator = {
      proje: p.id,
      momentum: s.momentum ?? null,
      son_ilerleme: s.son_ilerleme ?? null,
      sonraki_kritik_adim: s.sonraki_kritik_adim ?? null,
      bekleyen_insan_girdisi: s.bekleyen_insan_girdisi ?? null,
      acik_bayraklar: s.acik_bayraklar ?? [],
      dokumanlar,
    }
    writeFileSync(join(outDir, `operator-${p.id}.json`), JSON.stringify(operator, null, 2), 'utf8')
    console.log(`operator-${p.id}.json yazıldı (${dokumanlar.length} doküman, ${operator.acik_bayraklar.length} bayrak)`)
  }
} else {
  console.log('projeler/registry.json bulunamadı — registry/operator atlandı')
}

// ============================================================
// 2) BARIŞ PARTNER ÇIKTILARI (partner-view DOLU) — slice-1, değişmedi
// ============================================================
const baris = join(projelerDir, 'baris')
const signal = okJSON(join(baris, 'signal.json'))

let partnerOzet = null
const kartPath = join(baris, 'kart.md')
if (existsSync(kartPath)) partnerOzet = readFileSync(kartPath, 'utf8')

let arsivLink = null
const arsivPath = join(baris, 'arsiv')
if (existsSync(arsivPath)) {
  const files = readdirSync(arsivPath).filter(f => !f.startsWith('.')).sort()
  if (files.length > 0) arsivLink = files[files.length - 1]
}

const cardData = {
  proje: signal.proje,
  tarih: signal.tarih,
  momentum: signal.momentum,
  son_ilerleme: signal.son_ilerleme,
  sonraki_kritik_adim: signal.sonraki_kritik_adim,
  bekleyen_insan_girdisi: signal.bekleyen_insan_girdisi ?? null,
  partner_ozet: partnerOzet,
  arsiv_link: arsivLink,
}
writeFileSync(join(outDir, 'card-data.json'), JSON.stringify(cardData, null, 2), 'utf8')
console.log('card-data.json yazıldı')

// yolculuk-partner.md → KART ŞEMASI v1 → cards-baris.json
function parseYolculuk(content) {
  const kartlar = []
  const blocks = content.split(/(?=^## KART \d)/m)
  for (const block of blocks) {
    const h = block.match(/^## KART (\d+)\s+[—–-]+\s+(.+?)\s+\|\s+tip:\s+([\w-]+)\s+\|\s+durum:\s+([\w-]+)/m)
    if (!h) continue
    const n = parseInt(h[1])
    const tip = h[3].trim()
    const durum = h[4].trim()
    const kisaM = block.match(/\*\*Kısa:\*\*\s*(.+)/)
    const kisa = kisaM ? kisaM[1].trim() : ''
    const barisM = block.match(/\*\*Barış \(aynen\):\*\*\s*"([\s\S]+?)"/)
    const baris_aynen = barisM ? barisM[1].trim() : null
    const detayM = block.match(/\*\*Detay:\*\*\s*([\s\S]+?)(?=^## KART|\s*$)/m)
    const detay = detayM ? detayM[1].trim() : ''
    kartlar.push({ n, tip, durum, kisa, baris_aynen, detay })
  }
  return kartlar
}

function toSchemaV1(k, tarih) {
  const tip = k.tip === 'girdi-talebi' ? 'girdi-talebi' : 'ilerleme'
  const durum = tip === 'girdi-talebi' ? k.durum : 'bitti'
  return {
    id: `baris-k${k.n}`,
    tip,
    durum,
    ozet: k.kisa,
    detay: k.detay,
    partner_cevap: k.baris_aynen ?? null,
    olusturma: tarih,
    guncelleme: tarih,
  }
}

const yolculukPath = join(baris, 'yolculuk-partner.md')
if (existsSync(yolculukPath)) {
  const raw = readFileSync(yolculukPath, 'utf8')
  const kartlar = parseYolculuk(raw).map(k => toSchemaV1(k, signal.tarih))
  writeFileSync(join(outDir, 'cards-baris.json'), JSON.stringify({ proje: signal.proje, kartlar }, null, 2), 'utf8')
  console.log(`cards-baris.json yazıldı (${kartlar.length} kart, şema v1)`)
  const eski = join(outDir, 'journey-data.json')
  if (existsSync(eski)) { rmSync(eski); console.log('journey-data.json kaldırıldı') }
} else {
  console.log('yolculuk-partner.md bulunamadı — cards-baris.json atlandı')
}
