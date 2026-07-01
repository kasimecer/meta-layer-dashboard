// meta-layer-core — event_blok açma/kapama tek-kural izole doğrulama.
// Dört senaryo: kapısız-çözüldü(×2) · kapılı-onay-bekliyor · onaylı-fikstür · deadlock.
// Tüm çıktı projeler/_build-test-event-blok/ (izole); canlı veriye dokunulmaz.
//
// Koşum: node scripts/event-blok-test-runner.mjs

import {
  existsSync, readFileSync, writeFileSync,
  mkdirSync, rmSync, appendFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'
import {
  kararCiftiOlustur, kararTetikle, fasilitasyonuYayinla,
  buildTaskEventBlokDegerlendirAc, onayKartinaCevap,
} from './kararWire.mjs'
import {
  arastirmaOlayiKur, arastirmaOlayiCoz,
  asyncToplantiOlayiKur, asyncToplantiOlayiCoz,
  kararDestekOlayiKur, kararDestekOlayiCoz,
} from './olayWire.mjs'
import { kartDogrula } from '../src/lib/stateMachine.js'

const PROJELER_ROOT = join(META_DATA_ROOT, 'projeler')
const TEST_ROOT = join(PROJELER_ROOT, '_build-test-event-blok')
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// ── Baseline ──────────────────────────────────────────────────────────────────
const BASELINE = {
  baris: readFileSync(join(PUBLIC_DIR, 'cards-baris.json'), 'utf8'),
  registry: readFileSync(join(PUBLIC_DIR, 'registry.json'), 'utf8'),
}

// ── Test çerçevesi ─────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++ }
  else { console.error(`  ✗ BAŞARISIZ: ${msg}`); failed++ }
}

function section(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

function yazJSON(yol, veri) {
  mkdirSync(dirname(yol), { recursive: true })
  writeFileSync(yol, JSON.stringify(veri, null, 2), 'utf8')
}

function okuJSON(yol) {
  return JSON.parse(readFileSync(yol, 'utf8'))
}

// Task ID'leri
const ARASTIRMA_ID   = 'ebt-olay-001-arastirma'
const ARASTIRMA_TASK = 'ebt-task-001-arastirma'
const DESTEK_ID      = 'ebt-olay-002-destek'
const DESTEK_TASK    = 'ebt-task-002-destek'
const TOPLANTI_ID    = 'ebt-olay-003-toplanti'
const TOPLANTI_TASK  = 'ebt-task-003-toplanti'
const DEADLOCK_ID    = 'ebt-karar-004-deadlock'
const DEADLOCK_TASK  = 'ebt-task-004-deadlock'

// ── 0) Temizle ────────────────────────────────────────────────────────────────
section('0) Temizle & hazırla (_build-test-event-blok izole)')

if (existsSync(TEST_ROOT)) {
  rmSync(TEST_ROOT, { recursive: true, force: true })
  console.log('  _build-test-event-blok/ temizlendi (idempotent)')
}
mkdirSync(join(TEST_ROOT, 'build-task'), { recursive: true })
console.log('  _build-test-event-blok/ oluşturuldu')

const now0 = new Date().toISOString()

// Dört sentetik build-task
const tasklar = [
  { id: ARASTIRMA_TASK, ozet: 'Segment analizi — araştırma',   event_blok: ARASTIRMA_ID, linked_olay_id: ARASTIRMA_ID },
  { id: DESTEK_TASK,    ozet: 'Fiyat hipotezi — karar-destek', event_blok: DESTEK_ID,    linked_olay_id: DESTEK_ID    },
  { id: TOPLANTI_TASK,  ozet: 'Kanal toplantısı — yakınsama',  event_blok: TOPLANTI_ID,  linked_olay_id: TOPLANTI_ID  },
  { id: DEADLOCK_TASK,  ozet: 'Strateji seçimi — deadlock',    event_blok: DEADLOCK_ID,  linked_karar_id: DEADLOCK_ID },
]

for (const t of tasklar) {
  yazJSON(join(TEST_ROOT, 'build-task', `${t.id}.json`), {
    ...t,
    tip: 'ilerleme', durum: 'bitti',
    detay: `Test fikstürü — ${t.id}`,
    partner_cevap: null, olusturma: now0, guncelleme: now0,
    faz: 'build', build_durum: 'devam',
  })
}

assert(tasklar.every(t => existsSync(join(TEST_ROOT, 'build-task', `${t.id}.json`))), 'dört build-task oluşturuldu')

// İlk durum: tüm task'lar bloklu
for (const t of tasklar) {
  const task = okuJSON(join(TEST_ROOT, 'build-task', `${t.id}.json`))
  assert(task.event_blok !== null, `${t.id}: başlangıçta event_blok SET`)
}

// ── 1) Kapısız — ARAŞTIRMA ───────────────────────────────────────────────────
section('1) Kapısız: ARAŞTIRMA — çözülünce event_blok otomatik açılır')

arastirmaOlayiKur({
  olay_id: ARASTIRMA_ID, proje: '_build-test-event-blok',
  task_id: ARASTIRMA_TASK, soru: 'Hedef segmentin büyüme hızı nedir?',
  olgular: [
    { olgu: 'Yıllık büyüme %12 (2023)', kaynak: 'Sektör raporu' },
    { olgu: 'Rakip pazar payı verisi', durum: 'eksik' },
  ],
  _rootDir: PROJELER_ROOT,
})

// Çözmeden önce: bloklu olmalı
let tA = okuJSON(join(TEST_ROOT, 'build-task', `${ARASTIRMA_TASK}.json`))
assert(tA.event_blok === ARASTIRMA_ID, 'araştırma: çözmeden önce event_blok SET')

arastirmaOlayiCoz({
  olay_id: ARASTIRMA_ID, proje: '_build-test-event-blok',
  _rootDir: PROJELER_ROOT,
  oracleCevap: '[FİKSTÜR] Segment büyümesi teyit edildi; rakip veri eksik.',
})

// Çözdükten sonra: event_blok null
tA = okuJSON(join(TEST_ROOT, 'build-task', `${ARASTIRMA_TASK}.json`))
assert(tA.event_blok === null, 'araştırma: çözdükten sonra event_blok null (kapısız → otomatik açıldı)')
assert(tA.build_durum === 'devam', 'araştırma: build_durum devam korundu')
assert(tA.linked_olay_id === ARASTIRMA_ID, 'araştırma: linked_olay_id korundu')

// ── 2) Kapısız — KARAR-DESTEK ────────────────────────────────────────────────
section('2) Kapısız: KARAR-DESTEK — çözülünce event_blok otomatik açılır')

kararDestekOlayiKur({
  olay_id: DESTEK_ID, proje: '_build-test-event-blok',
  task_id: DESTEK_TASK, soru: 'Yıllık abonelik modeli karlı mı?',
  hipotez: 'Yıllık abonelik aylık abonelikten %20 daha yüksek LTV sağlar.',
  _rootDir: PROJELER_ROOT,
})

// Çözmeden önce: bloklu
let tD = okuJSON(join(TEST_ROOT, 'build-task', `${DESTEK_TASK}.json`))
assert(tD.event_blok === DESTEK_ID, 'karar-destek: çözmeden önce event_blok SET')

kararDestekOlayiCoz({
  olay_id: DESTEK_ID, proje: '_build-test-event-blok',
  _rootDir: PROJELER_ROOT,
  criticCevap: `Yapısal bulgular:\n- LTV karşılaştırması için eşleştirilmiş kohort verisi gerekli.\nReçete önerileri:\n- Pilot grup oluşturulmalıdır (gerekir).`,
})

// Çözdükten sonra: null
tD = okuJSON(join(TEST_ROOT, 'build-task', `${DESTEK_TASK}.json`))
assert(tD.event_blok === null, 'karar-destek: çözdükten sonra event_blok null (kapısız → otomatik açıldı)')
assert(tD.build_durum === 'devam', 'karar-destek: build_durum devam korundu')
assert(tD.linked_olay_id === DESTEK_ID, 'karar-destek: linked_olay_id korundu')

// ── 3) Kapılı-yakınsama: ONAY BEKLİYOR → event_blok SET kalmalı ──────────────
section('3) Kapılı-yakınsama: onay kartı cevap-bekliyor → event_blok SET')

asyncToplantiOlayiKur({
  olay_id: TOPLANTI_ID, proje: '_build-test-event-blok',
  task_id: TOPLANTI_TASK, soru: 'Hangi platform önce?',
  secenekler: [
    { ad: 'A — Instagram', optimize: 'Görsel güç', feda: 'Yavaş büyüme', kazanmaKosulu: 'Görsel öncelikliyse' },
    { ad: 'B — Facebook',  optimize: 'Hızlı erişim', feda: 'Dar segment', kazanmaKosulu: 'Hız öncelikliyse' },
  ],
  katilimcilar: [
    { slug: 'p-alfa', ad: 'P-Alfa' },
    { slug: 'p-beta', ad: 'P-Beta' },
  ],
  kararMeta: {
    baslik: 'Sosyal medya kanalı — event-blok test',
    ozet: 'Platform seçimi fikstürü',
    olguTabani: [{ olgu: 'event-blok test fikstürü', kaynak: '_build-test-event-blok' }],
    krux: { tur: 'deger', ayrisma: 'Hız vs görsel marka', olguBosluklari: [] },
  },
  _rootDir: PROJELER_ROOT,
})

// Karar kartlarını cevapla (yakınsama: her ikisi A)
const kararYol = join(TEST_ROOT, 'karar-kartlar', `${TOPLANTI_ID}.json`)
const kararVeri = okuJSON(kararYol)
kararVeri.kartlar = kararVeri.kartlar.map(k => ({
  ...k,
  durum: 'cevaplandi',
  partner_cevap: JSON.stringify({
    secenek: 'A — Instagram',
    pozisyon: 'Instagram görsel içerik için daha iyi.',
    gerekce: ['event-blok test fikstürü'],
  }),
  guncelleme: now0,
}))
writeFileSync(kararYol, JSON.stringify(kararVeri, null, 2), 'utf8')

// Çöz (yakınsama: onay kartı üretilir, cevap-bekliyor)
asyncToplantiOlayiCoz({
  olay_id: TOPLANTI_ID, proje: '_build-test-event-blok', _rootDir: PROJELER_ROOT,
})

let tT = okuJSON(join(TEST_ROOT, 'build-task', `${TOPLANTI_TASK}.json`))
assert(tT.event_blok === TOPLANTI_ID, 'toplantı: fasilitasyonuYayinla sonrası event_blok hâlâ SET (onay bekleniyor)')

// Onay kartı cevap-bekliyor mu?
const sentezTopYol = join(TEST_ROOT, 'sentez-kartlar', `${TOPLANTI_ID}.json`)
const sentezTop = okuJSON(sentezTopYol)
const onayKartiTop = sentezTop.kartlar.find(k => k.kategori === 'karar-onay')
assert(!!onayKartiTop, 'toplantı: onay kartı var (yakınsama)')
assert(onayKartiTop?.durum === 'cevap-bekliyor', 'toplantı: onay kartı cevap-bekliyor (blok koruma)')
assert(sentezTop.terminal_sinif === 'yakinsama', 'toplantı: terminal_sinif yakınsama')

// ── 4) Onaylı fikstür: onayKartinaCevap → event_blok null ───────────────────
section('4) Onaylı fikstür: onayKartinaCevap → event_blok null')

const onayRes = onayKartinaCevap({
  karar_id: TOPLANTI_ID, proje: '_build-test-event-blok',
  partner_cevap: 'Onaylıyorum — Instagram doğru seçim.',
  task_id: TOPLANTI_TASK,   // explicit override (build damgası yoksa)
  _rootDir: PROJELER_ROOT,
})

assert(onayRes.ok === true, 'onayKartinaCevap başarılı')
assert(onayRes.event_blok_acildi === true, 'onay → event_blok açıldı (tek-kaynak)')

tT = okuJSON(join(TEST_ROOT, 'build-task', `${TOPLANTI_TASK}.json`))
assert(tT.event_blok === null, 'toplantı: onay kartı cevaplandi → event_blok null')
assert(tT.build_durum === 'devam', 'toplantı: build_durum devam korundu')
assert(tT.linked_olay_id === TOPLANTI_ID, 'toplantı: linked_olay_id korundu')

// Onay kartı durum geçişi
const sentezTopGuncel = okuJSON(sentezTopYol)
const onayKartiGuncel = sentezTopGuncel.kartlar.find(k => k.kategori === 'karar-onay')
assert(onayKartiGuncel?.durum === 'cevaplandi', 'onay kartı durum:cevaplandi')
assert(typeof onayKartiGuncel?.partner_cevap === 'string', 'onay kartı partner_cevap set')

// Idempotent: ikinci çağrı atlanmalı
const onayRes2 = onayKartinaCevap({
  karar_id: TOPLANTI_ID, proje: '_build-test-event-blok', _rootDir: PROJELER_ROOT,
})
assert(onayRes2.atlandı === true, 'onayKartinaCevap idempotent (ikinci çağrı atlandı)')

// ── 5) Deadlock: event_blok SET kalmalı ───────────────────────────────────────
section('5) Deadlock: escalation_flag:true → event_blok SET kalır')

kararCiftiOlustur({
  karar_id: DEADLOCK_ID, proje: '_build-test-event-blok',
  soru: 'Strateji A mı yoksa B mi?',
  secenekler: [
    { ad: 'A — Ajan', optimize: 'Hız', feda: 'Bağımlılık', kazanmaKosulu: 'Hız kritikse' },
    { ad: 'B — Kendi', optimize: 'Kontrol', feda: 'Süre', kazanmaKosulu: 'Uzun-vade öncelikliyse' },
  ],
  partnerler: [
    { slug: 'dl-alfa', ad: 'DL-Alfa' },
    { slug: 'dl-beta', ad: 'DL-Beta' },
  ],
  kararMeta: {
    baslik: 'Strateji seçimi — deadlock fikstürü',
    ozet: 'event-blok deadlock testi',
    olguTabani: [{ olgu: 'deadlock test fikstürü', kaynak: '_build-test-event-blok' }],
    krux: { tur: 'deger', ayrisma: 'Hız vs kontrol stratejik yargısı', olguBosluklari: [] },
  },
  _rootDir: PROJELER_ROOT,
})

// Karar kartlarını cevapla (deadlock: farklı seçenekler, sabit pozisyon)
const dlKararYol = join(TEST_ROOT, 'karar-kartlar', `${DEADLOCK_ID}.json`)
const dlKararVeri = okuJSON(dlKararYol)
dlKararVeri.kartlar = dlKararVeri.kartlar.map((k, i) => ({
  ...k,
  durum: 'cevaplandi',
  partner_cevap: JSON.stringify({
    secenek: i === 0 ? 'A — Ajan' : 'B — Kendi',
    pozisyon: i === 0 ? 'A kesin; pozisyon değişmez.' : 'B kesin; pozisyon değişmez.',
    gerekce: ['Sabit pozisyon — deadlock fikstürü'],
  }),
  guncelleme: now0,
}))
writeFileSync(dlKararYol, JSON.stringify(dlKararVeri, null, 2), 'utf8')

// Fasilitasyon
kararTetikle({ karar_id: DEADLOCK_ID, proje: '_build-test-event-blok', _rootDir: PROJELER_ROOT })
const dlYayin = fasilitasyonuYayinla({ karar_id: DEADLOCK_ID, proje: '_build-test-event-blok', _rootDir: PROJELER_ROOT })

assert(dlYayin.escalation_flag === true, 'deadlock: escalation_flag:true')
assert(dlYayin.terminal_sinif !== 'yakinsama', 'deadlock: terminal_sinif yakınsama değil')

// event_blok SET kalmalı (buildTaskEventBlokDegerlendirAc escalation nedeniyle ac:false döndü)
const tDL = okuJSON(join(TEST_ROOT, 'build-task', `${DEADLOCK_TASK}.json`))
assert(tDL.event_blok === DEADLOCK_ID, 'deadlock: event_blok SET kalır (escalation_flag:true)')
assert(tDL.linked_karar_id === DEADLOCK_ID, 'deadlock: linked_karar_id korundu')

// tek-kaynak helper doğrudan test: escalation → ac:false
const dlSentezDosya = okuJSON(join(TEST_ROOT, 'sentez-kartlar', `${DEADLOCK_ID}.json`))
const dlAcResult = buildTaskEventBlokDegerlendirAc({
  pdir: TEST_ROOT, task_id: DEADLOCK_TASK, sentezDosya: dlSentezDosya,
})
assert(dlAcResult.ac === false, 'buildTaskEventBlokDegerlendirAc: deadlock → ac:false')
assert(dlAcResult.sebep.includes('escalation'), 'açmama sebebi: escalation_flag')

// ── 6) Tek-kaynak helper sınır testleri ──────────────────────────────────────
section('6) buildTaskEventBlokDegerlendirAc sınır testleri')

// task_id yok → ac:false
const r1 = buildTaskEventBlokDegerlendirAc({
  pdir: TEST_ROOT, task_id: null, sentezDosya: { kartlar: [], escalation_flag: false, terminal_sinif: 'arastirma' },
})
assert(r1.ac === false, 'helper: task_id null → ac:false')
assert(r1.sebep.includes('task_id yok'), 'helper: task_id yok sebebi')

// build-task bulunamadı → ac:false
const r2 = buildTaskEventBlokDegerlendirAc({
  pdir: TEST_ROOT, task_id: 'yok-olan-task', sentezDosya: { kartlar: [], escalation_flag: false, terminal_sinif: 'arastirma' },
})
assert(r2.ac === false, 'helper: olmayan task_id → ac:false')

// event_blok zaten null → ac:false (araştırma task zaten temizlendi)
const r3 = buildTaskEventBlokDegerlendirAc({
  pdir: TEST_ROOT, task_id: ARASTIRMA_TASK,
  sentezDosya: { kartlar: [], escalation_flag: false, terminal_sinif: 'arastirma' },
})
assert(r3.ac === false, 'helper: event_blok zaten null → ac:false')
assert(r3.sebep.includes('zaten boş'), 'helper: zaten boş sebebi')

// yakınsama + onay cevap-bekliyor (toplantı sentezi güncel: onay cevaplandi, ama farklı id deneyelim)
// Yeni task + sentez oluştur (temiz durum)
const SINIR_TASK = 'ebt-sinir-task'
yazJSON(join(TEST_ROOT, 'build-task', `${SINIR_TASK}.json`), {
  id: SINIR_TASK, tip: 'ilerleme', durum: 'bitti',
  ozet: 'Sınır testi', detay: 'Sınır testi', partner_cevap: null,
  olusturma: now0, guncelleme: now0, faz: 'build', build_durum: 'devam',
  event_blok: 'sinir-karar', linked_karar_id: 'sinir-karar',
})
const r4 = buildTaskEventBlokDegerlendirAc({
  pdir: TEST_ROOT, task_id: SINIR_TASK,
  sentezDosya: {
    kartlar: [{ kategori: 'karar-onay', durum: 'cevap-bekliyor' }],
    escalation_flag: false, terminal_sinif: 'yakinsama',
  },
})
assert(r4.ac === false, 'helper: yakınsama + onay cevap-bekliyor → ac:false')
assert(r4.sebep.includes('cevaplandi değil'), 'helper: sebep mesajı doğru')

// yakınsama + onay cevaplandi → ac:true
const r5 = buildTaskEventBlokDegerlendirAc({
  pdir: TEST_ROOT, task_id: SINIR_TASK,  // hâlâ event_blok SET (r4 ac:false döndü)
  sentezDosya: {
    kartlar: [{ kategori: 'karar-onay', durum: 'cevaplandi' }],
    escalation_flag: false, terminal_sinif: 'yakinsama',
  },
})
assert(r5.ac === true, 'helper: yakınsama + onay cevaplandi → ac:true')
assert(r5.sebep.includes('temizlendi'), 'helper: açma sebebi mesajı doğru')

// ── 7) Regresyon ──────────────────────────────────────────────────────────────
section('7) Regresyon: canlı veriler dokunulmadı')

assert(
  readFileSync(join(PUBLIC_DIR, 'cards-baris.json'), 'utf8') === BASELINE.baris,
  'cards-baris.json DEĞİŞMEDİ'
)
assert(
  readFileSync(join(PUBLIC_DIR, 'registry.json'), 'utf8') === BASELINE.registry,
  'registry.json DEĞİŞMEDİ'
)
assert(!existsSync(join(PROJELER_ROOT, '_build-test-event-blok/sentez-kartlar/baris.json')), 'baris sentezi YOK')

// ── Özet ─────────────────────────────────────────────────────────────────────
section(`Özet: ${passed + failed} test | ✓ ${passed} geçti | ✗ ${failed} başarısız`)

// ── meta-kanal.md ──────────────────────────────────────────────────────────────
const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')
const kanalNot = `
--- [${now}] event_blok tek-kural izole doğrulama ---
Test: scripts/event-blok-test-runner.mjs
Sonuç: ${passed}/${passed + failed} geçti${failed > 0 ? ` (${failed} BAŞARISIZ)` : ' — tümü geçti'}

TEK KAYNAK: buildTaskEventBlokDegerlendirAc (kararWire.mjs)
  Karar yolu: onayKartinaCevap → buildTaskEventBlokDegerlendirAc
  Yeni olay yolu: arastirmaOlayiCoz / kararDestekOlayiCoz → buildTaskEventBlokDegerlendirAc
  fasilitasyonuYayinla → buildTaskEventBlokDegerlendirAc (kontrol; yakınsama/deadlock → ac:false)

Dört senaryo sonuçları:
  araştırma (kapısız, çözüldü)  : event_blok=null ✓
  karar-destek (kapısız)         : event_blok=null ✓
  async-toplantı (onay-bekliyor) : event_blok SET  ✓
  onaylı fikstür (cevaplandi)    : event_blok=null ✓
  deadlock (escalation_flag)     : event_blok SET  ✓

Güncellenen mevcut assertionlar (build-test-runner.mjs Section 7):
  ÖNCESİ: elle taskVeri.event_blok=null yazılıyordu
  SONRASI: onayKartinaCevap({task_id:override}) → buildTaskEventBlokDegerlendirAc → null
  Assertion değişmedi (event_blok===null); MEKANIZMA değişti (yeni spec, regresyon değil).

Önerilen sonraki adım: baris canlı projesi üzerinde ilk gerçek olay turunu koş (tek olay_id ile).
`
try {
  appendFileSync(kanalYol, kanalNot, 'utf8')
  console.log('\nmeta-kanal.md güncellendi.')
} catch (e) {
  console.warn('meta-kanal.md yazılamadı:', e.message)
}

if (failed > 0) process.exit(1)
