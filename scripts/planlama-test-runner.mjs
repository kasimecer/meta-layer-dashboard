// meta-layer-core — Planlama orkestrasyon motoru testleri.
// T1: temiz akış + idempotency | T2: dondurma | T3: geçiş-koruması
// Koşum: node scripts/planlama-test-runner.mjs

import { existsSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { stateYukle, statePersist, boslukState, ilerletHedefle, ASAMA_SIRASI } from '../tools/planlamaDurumMakinesi.mjs'
import { planlamaLoopCalistir } from '../tools/planlamaLoop.mjs'

const DEMO_POL_DIR = join(META_DATA_ROOT, 'projeler', '_demo-pol')
const DURUM_DOSYASI = join(DEMO_POL_DIR, 'planlama-durum.json')
const FIKSTUR_DIR = join(DEMO_POL_DIR, 'fikstur')
const FIKSTUR_BOZUK_DIR = join(DEMO_POL_DIR, 'fikstur-bozuk')

// ── Test çerçevesi ───────────────────────────────────────────────────────────
let gecti = 0, kaldi = 0
const log = []

function ok(ad, kosul) {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}`); log.push(`✓ ${ad}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}`); log.push(`✗ ${ad}`) }
}

function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

// state dosyasını sıfırla
function stateTemizle() {
  if (existsSync(DURUM_DOSYASI)) rmSync(DURUM_DOSYASI)
}

// ── T1: Temiz akış + idempotency ────────────────────────────────────────────
bolum('T1 — Temiz akış + idempotency')

stateTemizle()
const callLog1 = {}
const r1 = await planlamaLoopCalistir({ fiksturDir: FIKSTUR_DIR, _callLog: callLog1 })

ok('T1: tamamlandi=true', r1.tamamlandi === true)
ok('T1: donduruldu=false', r1.donduruldu === false)
ok('T1: aktif_asama=tamamlandi', r1.state.aktif_asama === 'tamamlandi')

const asamalar1 = ASAMA_SIRASI.filter(a => a !== 'tamamlandi')
for (const asama of asamalar1) {
  ok(`T1: ${asama}.durum=gecti`, r1.state.asamalar[asama]?.durum === 'gecti')
  ok(`T1: ${asama}.kapi_sonuc=gecti`, r1.state.asamalar[asama]?.kapi_sonuc === 'gecti')
  ok(`T1: ${asama}.cikti_pointer dolu`, !!r1.state.asamalar[asama]?.cikti_pointer)
}

// Idempotency: aynı state üzerinde tekrar koş → değişmemeli, executor yeniden çağrılmamalı
const callLog1b = {}
const r1b = await planlamaLoopCalistir({ fiksturDir: FIKSTUR_DIR, _callLog: callLog1b })
ok('T1 idempotency: tamamlandi hala true', r1b.tamamlandi === true)
ok('T1 idempotency: executor hiç çağrılmadı (tüm aşamalar zaten gecti)', Object.keys(callLog1b).length === 0)

// ── T2: Dondurma (bozuk premise) ────────────────────────────────────────────
bolum('T2 — Dondurma: premise-eksik')

stateTemizle()

// Özel executor: genesis için normal, premise için bozuk fikstür, diğerleri normal
import { readFileSync } from 'fs'
function bozukExecutor(asama) {
  const dir = asama === 'premise' ? FIKSTUR_BOZUK_DIR : FIKSTUR_DIR
  const dosya = join(dir, asama === 'premise' ? 'premise-eksik.md' : `${asama}.md`)
  return { icerik: readFileSync(dosya, 'utf8'), cikti_pointer: dosya }
}

const callLog2 = {}
const r2 = await planlamaLoopCalistir({ executor: bozukExecutor, _callLog: callLog2 })

ok('T2: tamamlandi=false', r2.tamamlandi === false)
ok('T2: donduruldu=true', r2.donduruldu === true)
ok('T2: aktif_asama=premise', r2.state.aktif_asama === 'premise')
ok('T2: premise.durum=donduruldu', r2.state.asamalar['premise']?.durum === 'donduruldu')
ok('T2: premise.blok_nedeni dolu', !!r2.state.asamalar['premise']?.blok_nedeni)
ok('T2: arastirma hiç kosuyor/gecti olmadi',
  r2.state.asamalar['arastirma']?.durum === 'bekliyor')
ok('T2: strateji hiç kosuyor/gecti olmadi',
  r2.state.asamalar['strateji']?.durum === 'bekliyor')
ok('T2: master-plan hiç kosuyor/gecti olmadi',
  r2.state.asamalar['master-plan']?.durum === 'bekliyor')

console.log(`  → blok_nedeni: ${r2.state.asamalar['premise']?.blok_nedeni}`)

// ── T3: Geçiş koruması ──────────────────────────────────────────────────────
bolum('T3 — Geçiş koruması: atlama reddedilir')

stateTemizle()
let state3 = boslukState()

// genesis → strateji (atlama) → REDDET
let t3Atti = false
let t3HataMetni = ''
try {
  ilerletHedefle(state3, 'strateji')
} catch (e) {
  t3Atti = true
  t3HataMetni = e.message
}
ok('T3: genesis→strateji atlaması hata fırlatır', t3Atti)
ok('T3: state değişmedi (aktif_asama hala genesis)', state3.aktif_asama === 'genesis')
console.log(`  → hata: ${t3HataMetni}`)

// master-plan → arastirma (geri gitme) → REDDET
let state3b = { ...boslukState(), aktif_asama: 'master-plan' }
let t3bAtti = false
try {
  ilerletHedefle(state3b, 'arastirma')
} catch (e) {
  t3bAtti = true
}
ok('T3b: master-plan→arastirma geri gitme reddedilir', t3bAtti)
ok('T3b: state değişmedi (aktif_asama hala master-plan)', state3b.aktif_asama === 'master-plan')

// ── Özet ────────────────────────────────────────────────────────────────────
console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
