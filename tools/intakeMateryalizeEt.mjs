// Intake taslağını dosya sistemine yazar + (istenmedikçe) planlama loop'unu tetikler.
// TEK ortak mantık — scripts/intake-materialize.mjs (elle CLI) ve
// scripts/intake-queue-watch.mjs (Worker-kuyruğundan yerel izleyici) bunu BİREBİR paylaşır.
// Buradaki davranış değişmez: registry/cards/intake.md → canliExecutor+planlamaLoopV2.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { META_DATA_ROOT } from '../scripts/config.js'
import { canliExecutorOlustur } from './canliExecutor.mjs'
import { planlamaLoopV2Calistir } from './planlamaLoopV2.mjs'

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..')

function oku(yol) { return JSON.parse(readFileSync(yol, 'utf8')) }
function yaz(yol, obj) { writeFileSync(yol, JSON.stringify(obj, null, 2) + '\n', 'utf8') }
function yazMetin(yol, metin) { writeFileSync(yol, metin, 'utf8') }

/**
 * @param {{id, projeKaydi, cardsJson, intakeMd}} taslak
 * @param {{ loopAtla?: boolean, log?: (s:string)=>void }} opts
 * @returns {{ id, materyalizeSonuclari: string[], loopAtlandi: boolean, loopSonucu?: object }}
 */
export async function taslakiMateryalizeEt(taslak, opts = {}) {
  const { loopAtla = false, log = (s) => console.log(s) } = opts
  const { id, projeKaydi, cardsJson, intakeMd } = taslak || {}

  if (!id || !projeKaydi || !cardsJson) {
    throw new Error('Geçersiz taslak: id, projeKaydi veya cardsJson eksik.')
  }
  // Path-traversal koruması: id yalnız güvenli slug karakterleri taşımalı (harf/rakam/tire/
  // alt-çizgi). Baştaki `_` özellikle İZİNLİ — _demo-*/_test-* atılır-namespace konvansiyonu.
  if (!/^[a-z0-9_][a-z0-9_-]{0,80}$/.test(id)) {
    throw new Error(`Geçersiz id biçimi: ${id}`)
  }

  const materyalizeSonuclari = []

  // 1. public/registry.json
  const registryYol = join(REPO_ROOT, 'public', 'registry.json')
  const registry = oku(registryYol)
  const projeler = registry.projeler ?? registry
  const mevcutIdx = projeler.findIndex(p => p.id === id)
  if (mevcutIdx >= 0) {
    materyalizeSonuclari.push(`registry.json'da zaten var: ${id} — atlandı.`)
  } else {
    projeler.push(projeKaydi)
    const yeniRegistry = Array.isArray(registry) ? projeler : { ...registry, projeler }
    yaz(registryYol, yeniRegistry)
    materyalizeSonuclari.push(`registry.json'a eklendi: ${id}`)
  }

  // 2. public/cards-<id>.json
  const cardsYol = join(REPO_ROOT, 'public', `cards-${id}.json`)
  if (existsSync(cardsYol)) {
    materyalizeSonuclari.push(`cards-${id}.json zaten var — atlandı.`)
  } else {
    yaz(cardsYol, cardsJson)
    materyalizeSonuclari.push(`cards-${id}.json oluşturuldu (${cardsJson.kartlar?.length ?? 0} kart)`)
  }

  // 3. $META_DATA_ROOT/projeler/<id>/intake.md
  const nsYolu = join(META_DATA_ROOT, 'projeler', id)
  if (intakeMd) {
    mkdirSync(nsYolu, { recursive: true })
    const intakeYol = join(nsYolu, 'intake.md')
    if (existsSync(intakeYol)) {
      materyalizeSonuclari.push(`intake.md zaten var: ${intakeYol} — atlandı.`)
    } else {
      yazMetin(intakeYol, intakeMd)
      materyalizeSonuclari.push(`intake.md oluşturuldu: ${intakeYol}`)
    }
  } else {
    materyalizeSonuclari.push('intakeMd alanı yok, intake.md atlandı.')
  }

  for (const s of materyalizeSonuclari) log(s)

  // 4. Planlama loop — istenmedikçe (loopAtla) her zaman tetiklenir.
  if (loopAtla) {
    log('loopAtla=true — planlama loop tetiklenmedi.')
    return { id, materyalizeSonuclari, loopAtlandi: true }
  }

  const projeConfig = { id, ad: projeKaydi.ad, aciklama: projeKaydi.ozet }
  log(`▶ Planlama loop tetikleniyor: ${nsYolu}`)
  const { executor } = canliExecutorOlustur(nsYolu, projeConfig, { log })
  const loopSonucu = await planlamaLoopV2Calistir(nsYolu, id, executor, { log })

  return { id, materyalizeSonuclari, loopAtlandi: false, loopSonucu }
}
