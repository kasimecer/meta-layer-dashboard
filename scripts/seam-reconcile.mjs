// meta-layer-core — SEAM RECONCILE CLI.
//
// MANUEL/OPERATÖR-TETİKLEMELİ — ASLA bir izleyici/daemon/başlangıç betiğinden ÇAĞRILMAZ.
// partner-inbox/ otomatik izlenmez; bu betik yalnız bir operatörün elle koşturduğu bir
// terminal komutudur (bkz tools/seamReconcile.mjs dosya başı yorumu).
//
// Koşum: node scripts/seam-reconcile.mjs <projeId>

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'
import { seamReconcileCalistir } from '../tools/seamReconcile.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

const projeId = process.argv[2]
if (!projeId) {
  console.error('Kullanım: node scripts/seam-reconcile.mjs <projeId>')
  process.exit(1)
}

const partnerInboxKokYolu = join(REPO_ROOT, 'partner-inbox')
const partnerInboxYol = join(partnerInboxKokYolu, `${projeId}.md`)
const kanonikKokYolu = join(META_DATA_ROOT, 'projeler', projeId)
const kanonikInboxYol = join(kanonikKokYolu, 'inbox.md')

console.log(`SEAM RECONCILE — proje: ${projeId}`)
console.log(`  git      : ${partnerInboxYol}`)
console.log(`  kanonik  : ${kanonikInboxYol}`)
console.log('')

const sonuc = seamReconcileCalistir({
  projeId, partnerInboxYol, partnerInboxKokYolu, kanonikInboxYol, kanonikKokYolu,
})

if (!sonuc.degisti) {
  console.log(`NO-OP: ${sonuc.neden}`)
  if (sonuc.atlananlar?.length) {
    console.log(`  (${sonuc.atlananlar.length} kart kanonikte zaten güncel/daha-yeni, atlandı: ${sonuc.atlananlar.map(a => a.kartId).join(', ')})`)
  }
  process.exit(0)
}

console.log(`BİRLEŞTİRİLDİ: ${sonuc.birlestirilenler.length} kart`)
for (const k of sonuc.birlestirilenler) {
  const kisaCevap = k.cevap.length > 60 ? `${k.cevap.slice(0, 60)}…` : k.cevap
  console.log(`  ✓ ${k.kartId} [${k.tarih}] → "${kisaCevap}"`)
}
if (sonuc.atlananlar.length > 0) {
  console.log(`ATLANDI (kanonik zaten güncel/daha-yeni, korundu): ${sonuc.atlananlar.map(a => a.kartId).join(', ')}`)
}
console.log(`\nKanonik güncellendi (doğrulandı): ${sonuc.kanonikInboxYol}`)
console.log(`Git temizlendi (yalnız birleştirilen kartlar): ${sonuc.partnerInboxYol}`)
