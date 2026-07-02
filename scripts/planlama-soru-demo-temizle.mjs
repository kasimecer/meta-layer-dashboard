#!/usr/bin/env node
// SORU–YANIT demo temizleyicisi — AYRI, AÇIK komut (demo koşumunun parçası DEĞİL).
// Yalnız _demo-soru-* namespace dizin(ler)ini siler. Kanonik registry'ye ASLA DOKUNMAZ
// (byte-aynı kalır). Argümansız: mevcut tüm _demo-soru-* namespace'lerini listeler.
//
// Koşum:
//   node scripts/planlama-soru-demo-temizle.mjs               # listele (silme yok)
//   node scripts/planlama-soru-demo-temizle.mjs <id>          # tek demo namespace'i sil
//   node scripts/planlama-soru-demo-temizle.mjs --hepsi       # tüm _demo-soru-* sil

import { existsSync, rmSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'

const PROJELER = join(META_DATA_ROOT, 'projeler')
const ONEK = '_demo-soru-'

function demoNamespaceleri() {
  if (!existsSync(PROJELER)) return []
  return readdirSync(PROJELER)
    .filter(d => d.startsWith(ONEK) && statSync(join(PROJELER, d)).isDirectory())
    .sort()
}

function sil(id) {
  if (!id.startsWith(ONEK)) {
    console.error(`✗ REDDEDİLDİ: yalnız ${ONEK}* dizinleri silinebilir (istenen: ${id}).`)
    process.exit(1)
  }
  const yol = join(PROJELER, id)
  if (!existsSync(yol)) { console.error(`✗ Bulunamadı: ${yol}`); process.exit(1) }
  rmSync(yol, { recursive: true, force: true })
  console.log(`🗑  Silindi: ${yol}`)
}

const argv = process.argv.slice(2)
const mevcut = demoNamespaceleri()

if (argv.length === 0) {
  console.log(`${ONEK}* namespace'leri (${mevcut.length}):`)
  for (const d of mevcut) console.log(`  - ${d}`)
  console.log('\nSilmek için: node scripts/planlama-soru-demo-temizle.mjs <id>  |  --hepsi')
  console.log('Kanonik registry.json’a DOKUNULMAZ.')
} else if (argv[0] === '--hepsi') {
  if (mevcut.length === 0) { console.log('Silinecek demo namespace yok.'); process.exit(0) }
  for (const d of mevcut) sil(d)
  console.log(`\n${mevcut.length} demo namespace silindi. Kanonik registry değişmedi.`)
} else {
  sil(argv[0])
  console.log('Kanonik registry değişmedi.')
}
