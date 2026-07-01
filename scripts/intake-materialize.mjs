#!/usr/bin/env node
// Intake taslağını dosya sistemine yazar + planlama loop'unu tetikler.
// Kullanım: node scripts/intake-materialize.mjs <taslak.json> [--no-loop]
//   taslak.json: IntakeView'den kopyalanan artifakt (projeKaydi + cardsJson + intakeMd)
//   --no-loop:   yalnız materyalize et, canlı planlama loop'unu tetikleme (maliyetli/uzun
//                üretimi atlamak için — varsayılan davranış loop'u TETİKLER)
//
// Yaptıkları:
//   1. public/registry.json → projeKaydi ekler (id çakışırsa atlar)
//   2. public/cards-<id>.json → oluşturur
//   3. $META_DATA_ROOT/projeler/<id>/intake.md → oluşturur
//   4. canliExecutor + planlamaLoopV2 ile genesis→premise→araştırma→strateji→master-plan
//      KENDİ aksın (--no-loop verilmediyse). Idempotent: zaten tamamlanmış aşamalar
//      yeniden üretilmez (state dosyası planlama-durum.json üzerinden).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { META_DATA_ROOT } from './config.js'
import { canliExecutorOlustur } from '../tools/canliExecutor.mjs'
import { planlamaLoopV2Calistir } from '../tools/planlamaLoopV2.mjs'

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..')

function oku(yol) { return JSON.parse(readFileSync(yol, 'utf8')) }
function yaz(yol, obj) { writeFileSync(yol, JSON.stringify(obj, null, 2) + '\n', 'utf8') }
function yazMetin(yol, metin) { writeFileSync(yol, metin, 'utf8') }

const args = process.argv.slice(2).filter(a => a !== '--no-loop')
const loopAtla = process.argv.includes('--no-loop')
if (!args[0]) {
  console.error('Kullanım: node scripts/intake-materialize.mjs <taslak.json> [--no-loop]')
  process.exit(1)
}

const taslakYol = resolve(args[0])
if (!existsSync(taslakYol)) {
  console.error(`Dosya bulunamadı: ${taslakYol}`)
  process.exit(1)
}

const taslak = oku(taslakYol)
const { id, projeKaydi, cardsJson, intakeMd } = taslak

if (!id || !projeKaydi || !cardsJson) {
  console.error('Geçersiz taslak JSON: id, projeKaydi veya cardsJson eksik.')
  process.exit(1)
}

// 1. registry.json
const registryYol = join(REPO_ROOT, 'public', 'registry.json')
const registry = oku(registryYol)
const projeler = registry.projeler ?? registry
const mevcutIdx = projeler.findIndex(p => p.id === id)

if (mevcutIdx >= 0) {
  console.log(`⚠ registry.json'da zaten var: ${id} — atlandı.`)
} else {
  projeler.push(projeKaydi)
  const yeniRegistry = Array.isArray(registry) ? projeler : { ...registry, projeler }
  yaz(registryYol, yeniRegistry)
  console.log(`✓ registry.json'a eklendi: ${id}`)
}

// 2. public/cards-<id>.json
const cardsYol = join(REPO_ROOT, 'public', `cards-${id}.json`)
if (existsSync(cardsYol)) {
  console.log(`⚠ cards-${id}.json zaten var — atlandı.`)
} else {
  yaz(cardsYol, cardsJson)
  console.log(`✓ cards-${id}.json oluşturuldu (${cardsJson.kartlar?.length ?? 0} kart)`)
}

// 3. $META_DATA_ROOT/projeler/<id>/intake.md
if (intakeMd) {
  const projeDir = join(META_DATA_ROOT, 'projeler', id)
  mkdirSync(projeDir, { recursive: true })
  const intakeYol = join(projeDir, 'intake.md')
  if (existsSync(intakeYol)) {
    console.log(`⚠ intake.md zaten var: ${intakeYol} — atlandı.`)
  } else {
    yazMetin(intakeYol, intakeMd)
    console.log(`✓ intake.md oluşturuldu: ${intakeYol}`)
  }
} else {
  console.log('— intakeMd alanı yok, intake.md atlandı.')
}

console.log(`\nMateryalizasyon tamamlandı: ${id}`)

// 4. Planlama loop'unu tetikle — registry/cards/intake.md yazıldıktan sonra
//    canliExecutor + planlamaLoopV2 ile genesis→master-plan KENDİ aksın.
//    Bağlantı noktası: projeKaydi.ozet → projeConfig.aciklama (canliExecutor'ın
//    promptUret'i `aciklama` bekliyor; intake'in ürettiği proje kaydı `ozet` taşıyor).
if (loopAtla) {
  console.log('--no-loop verildi — planlama loop tetiklenmedi.')
} else {
  const projeConfig = { id, ad: projeKaydi.ad, aciklama: projeKaydi.ozet }
  const nsYolu = join(META_DATA_ROOT, 'projeler', id)

  console.log(`\n▶ Planlama loop tetikleniyor: ${nsYolu}`)
  console.log(`  proje: ${projeConfig.ad} — ${projeConfig.aciklama}`)

  const { executor, istatistikler } = canliExecutorOlustur(nsYolu, projeConfig, { log: console.log })
  const sonuc = await planlamaLoopV2Calistir(nsYolu, id, executor, { log: console.log })
  const ist = istatistikler()

  console.log('')
  if (sonuc.tamamlandi) {
    console.log(`✓ Planlama loop TAMAMLANDI — aktif_asama: ${sonuc.state.aktif_asama}`)
  } else {
    console.log(`✗ Planlama loop DURDU/BLOKE — aktif_asama: ${sonuc.state.aktif_asama}`)
    console.log(`  blok_nedeni: ${sonuc.state.asamalar[sonuc.state.aktif_asama]?.blok_nedeni ?? '(yok)'}`)
  }
  console.log(`  executor çağrı sayısı: ${ist.cagrilar}`)
  console.log(`  toplam maliyet: $${ist.toplamMaliyet.toFixed(4)}`)

  if (!sonuc.tamamlandi) process.exit(1)
}
