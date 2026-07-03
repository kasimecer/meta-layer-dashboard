#!/usr/bin/env node
// SORU-YANIT tarayıcı demosu temizleyicisi — AYRI, AÇIK komut (demo koşumunun parçası DEĞİL).
// Yalnız _demo-soru-yanit-* namespace dizin(ler)ini + ilgili soru-yanit-kuyruk/** kalıntılarını
// + public/sorular-<id>.json anlık-görüntüsünü siler. Kanonik registry'ye ASLA DOKUNMAZ (byte-
// aynı kalır). Argümansız: mevcut tüm _demo-soru-yanit-* namespace'lerini + kuyruk kalıntılarını
// listeler (silme yok).
//
// Koşum:
//   node scripts/soru-yanit-demo-temizle.mjs               # listele (silme yok)
//   node scripts/soru-yanit-demo-temizle.mjs <id>          # tek demo namespace'i + kalıntıları sil
//   node scripts/soru-yanit-demo-temizle.mjs --hepsi       # tüm _demo-soru-yanit-* + kalıntılar

import { existsSync, rmSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const PROJELER = join(META_DATA_ROOT, 'projeler')
const KUYRUK_DIR = join(REPO_ROOT, 'soru-yanit-kuyruk')
const REDDEDILEN_DIR = join(KUYRUK_DIR, 'reddedilen')
const PUBLIC_DIR = join(REPO_ROOT, 'public')
const ONEK = '_demo-soru-yanit-'

function demoNamespaceleri() {
  if (!existsSync(PROJELER)) return []
  return readdirSync(PROJELER)
    .filter(d => d.startsWith(ONEK) && statSync(join(PROJELER, d)).isDirectory())
    .sort()
}

function kuyrukKalintilari(id) {
  const bul = (dir) => {
    if (!existsSync(dir)) return []
    return readdirSync(dir).filter(f => f.endsWith('.json') && f.startsWith(`${id}--`))
  }
  return { aktif: bul(KUYRUK_DIR), reddedilen: bul(REDDEDILEN_DIR) }
}

function sil(id) {
  if (!id.startsWith(ONEK)) {
    console.error(`✗ REDDEDİLDİ: yalnız ${ONEK}* dizinleri silinebilir (istenen: ${id}).`)
    process.exit(1)
  }
  const yol = join(PROJELER, id)
  if (existsSync(yol)) {
    rmSync(yol, { recursive: true, force: true })
    console.log(`🗑  Silindi: ${yol}`)
  } else {
    console.log(`  (namespace zaten yok: ${yol})`)
  }

  const { aktif, reddedilen } = kuyrukKalintilari(id)
  for (const f of aktif) {
    rmSync(join(KUYRUK_DIR, f))
    console.log(`🗑  Silindi (aktif kuyruk kalıntısı): soru-yanit-kuyruk/${f}`)
  }
  for (const f of reddedilen) {
    rmSync(join(REDDEDILEN_DIR, f))
    console.log(`🗑  Silindi (reddedilen kalıntısı): soru-yanit-kuyruk/reddedilen/${f}`)
  }

  const sorularYol = join(PUBLIC_DIR, `sorular-${id}.json`)
  if (existsSync(sorularYol)) {
    rmSync(sorularYol)
    console.log(`🗑  Silindi: public/sorular-${id}.json`)
  }
}

const argv = process.argv.slice(2)
const mevcut = demoNamespaceleri()

if (argv.length === 0) {
  console.log(`${ONEK}* namespace'leri (${mevcut.length}):`)
  for (const d of mevcut) {
    const { aktif, reddedilen } = kuyrukKalintilari(d)
    const kuyrukEk = (aktif.length || reddedilen.length) ? `  [kuyruk: aktif=${aktif.length}, reddedilen=${reddedilen.length}]` : ''
    console.log(`  - ${d}${kuyrukEk}`)
  }
  console.log('\nSilmek için: node scripts/soru-yanit-demo-temizle.mjs <id>  |  --hepsi')
  console.log('Kanonik registry.json’a DOKUNULMAZ.')
} else if (argv[0] === '--hepsi') {
  if (mevcut.length === 0) { console.log('Silinecek demo namespace yok.'); process.exit(0) }
  for (const d of mevcut) sil(d)
  console.log(`\n${mevcut.length} demo namespace (+ kuyruk kalıntıları) silindi. Kanonik registry değişmedi.`)
} else {
  sil(argv[0])
  console.log('Kanonik registry değişmedi.')
}
