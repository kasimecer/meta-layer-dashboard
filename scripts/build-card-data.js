import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..', 'projeler', 'baris')
const outPath = join(__dirname, '..', 'public', 'card-data.json')

// signal.json — zorunlu
const signal = JSON.parse(readFileSync(join(root, 'signal.json'), 'utf8'))

// kart.md — isteğe bağlı
let partnerOzet = null
const kartPath = join(root, 'kart.md')
if (existsSync(kartPath)) {
  partnerOzet = readFileSync(kartPath, 'utf8')
}

// arsiv/ — en güncel dosya (ada göre son)
let arsivLink = null
const arsivPath = join(root, 'arsiv')
if (existsSync(arsivPath)) {
  const files = readdirSync(arsivPath).filter(f => !f.startsWith('.')).sort()
  if (files.length > 0) {
    arsivLink = files[files.length - 1]
  }
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

writeFileSync(outPath, JSON.stringify(cardData, null, 2), 'utf8')
console.log('card-data.json yazıldı →', outPath)
