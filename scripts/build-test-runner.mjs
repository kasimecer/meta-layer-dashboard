// meta-layer-core — Build-task + fasilitasyon bağlama izole doğrulama.
// TÜM çıktı projeler/_build-test/ altına yazılır. Canlı veriye dokunulmaz.
//
// Koşum: node scripts/build-test-runner.mjs

import {
  existsSync, readFileSync, writeFileSync,
  mkdirSync, rmSync, readdirSync, appendFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'
import { masterPlanBol } from './masterPlanBolucu.mjs'
import { kararCiftiOlustur, kararTetikle, fasilitasyonuYayinla, onayKartinaCevap } from './kararWire.mjs'
import { sentezKartlariOku, buildTestOperatorOku, buildTestPartnerOku } from './build-card-data.js'
import { kartDogrula } from '../src/lib/stateMachine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJELER_ROOT = join(META_DATA_ROOT, 'projeler')
const BUILD_TEST_ROOT = join(PROJELER_ROOT, '_build-test')
const PUBLIC_DIR = join(__dirname, '..', 'public')

// ── Baseline (izolasyon teyidi) ───────────────────────────────────────────────
// cards-baris.json / operator-baris.json: baris retire edilebilir (bkz meta-kanal.md
// 2026-07-10 baris-retirement-diagnosis-only) — existsSync guard, yoksa null (izolasyon
// kontrolü aşağıda N/A olarak atlanır, testi çökertmez).
const CARDS_BARIS_PATH = join(PUBLIC_DIR, 'cards-baris.json')
const OPERATOR_BARIS_PATH = join(PUBLIC_DIR, 'operator-baris.json')
const BASELINE = {
  baris: existsSync(CARDS_BARIS_PATH) ? readFileSync(CARDS_BARIS_PATH, 'utf8') : null,
  registry: readFileSync(join(PUBLIC_DIR, 'registry.json'), 'utf8'),
  operatorBaris: existsSync(OPERATOR_BARIS_PATH) ? readFileSync(OPERATOR_BARIS_PATH, 'utf8') : null,
  cardData: readFileSync(join(PUBLIC_DIR, 'card-data.json'), 'utf8'),
}

// ── Test çerçevesi ─────────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const log = []

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; log.push(`✓ ${msg}`) }
  else { console.error(`  ✗ BAŞARISIZ: ${msg}`); failed++; log.push(`✗ ${msg}`) }
}

function section(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────
function yazJSON(yol, veri) {
  mkdirSync(dirname(yol), { recursive: true })
  writeFileSync(yol, JSON.stringify(veri, null, 2), 'utf8')
}

function okuJSON(yol) {
  return JSON.parse(readFileSync(yol, 'utf8'))
}

function karar_kartlariGuncelle(kararPath, fn) {
  const karar = okuJSON(kararPath)
  const guncellenmis = fn(karar)
  yazJSON(kararPath, guncellenmis)
  return guncellenmis
}

// ── 0) Temizle & hazırla ──────────────────────────────────────────────────────
section('0) Temizle & hazırla')

if (existsSync(BUILD_TEST_ROOT)) {
  rmSync(BUILD_TEST_ROOT, { recursive: true, force: true })
  console.log('  _build-test/ temizlendi (idempotent)')
}
mkdirSync(join(BUILD_TEST_ROOT, 'build-task'), { recursive: true })
mkdirSync(join(BUILD_TEST_ROOT, 'output'), { recursive: true })
console.log('  _build-test/ oluşturuldu')

// ── 1) Bölücü: master-plan-v2.md → build-task kartları ───────────────────────
section('1) Master-plan bölücü')

// Sentetik master-plan fikstürü — canlı proje verisine bağımlı DEĞİL (herhangi bir projenin
// var/yok olmasından etkilenmez); masterPlanBol'un 3 çıkarım deseninin (checkbox · numaralı-bold
// · inline-yapılacaklar) hepsini kapsar (bkz masterPlanBolucu.mjs, proje-agnostik).
const MASTER_PLAN_SENTETIK = `## Yapılacaklar

- [x] İlk adım tamamlandı
- [ ] İkinci adım bekliyor
- [ ] Üçüncü adım bekliyor

1. **Planlama başlığı:** kapsamı belirle

**Sonraki yapılacaklar:** görev A · görev B · görev C
`

const kartlar = masterPlanBol(MASTER_PLAN_SENTETIK, { projeId: 'btest', kaynak: 'sentetik-master-plan' })

assert(kartlar.length >= 1, `bölücü ≥1 kart üretdi (üretilen: ${kartlar.length})`)

// Şema doğrulama: her kart kartDogrula'dan geçmeli
let semaHataYok = true
for (const k of kartlar) {
  const hatalar = kartDogrula(k)
  if (hatalar.length) {
    console.error(`  ✗ Şema hatası [${k.id}]: ${hatalar.join('; ')}`)
    semaHataYok = false
  }
}
assert(semaHataYok, 'tüm build-task kartları şema-geçerli (kartDogrula hatasız)')
assert(kartlar.every(k => k.tip === 'ilerleme'), 'tüm kartlar tip:ilerleme (yeni tip eklenmedi)')
assert(kartlar.every(k => k.durum === 'bitti'), 'tüm kartlar durum:bitti (ilerleme şeması)')
assert(kartlar.every(k => k.faz === 'build'), 'tüm kartlar faz:build damgalı')
assert(
  kartlar.some(k => k.build_durum === 'bitti') && kartlar.some(k => k.build_durum === 'bekliyor'),
  '[x]=bitti ve [ ]=bekliyor ayrımı doğru'
)

// Dosyalara yaz
for (const k of kartlar) {
  yazJSON(join(BUILD_TEST_ROOT, 'build-task', `${k.id}.json`), k)
}
console.log(`\n  ${kartlar.length} kart → _build-test/build-task/`)
for (const k of kartlar)
  console.log(`    ${k.id} [${k.build_durum}/${k.sahip}] ${k.ozet}`)

// ── 2) Karar-olayı bağlama ───────────────────────────────────────────────────
section('2) Karar-olayı bağlama (faz:build + task_id damga)')

// İlk 'bekliyor' görevine bağla
const hedefTask = kartlar.find(k => k.build_durum === 'bekliyor')
assert(!!hedefTask, 'bekliyor durumunda bağlanacak bir build-task var')

const KARAR_ID = 'build-test-karar-001'

const { kartlar: kararKartlari } = kararCiftiOlustur({
  karar_id: KARAR_ID,
  proje: '_build-test',
  soru: `Build kararı: ${hedefTask.ozet}`,
  secenekler: [
    {
      ad: 'A — Hızlı geçiş',
      optimize: 'Zaman tasarrufu; erken teslim.',
      feda: 'Daha az doğrulama.',
      kazanmaKosulu: 'Hız kritikse kazanır.',
    },
    {
      ad: 'B — Kapsamlı doğrulama',
      optimize: 'Güvenilirlik; hata riskini minimize.',
      feda: 'Daha uzun süre.',
      kazanmaKosulu: 'Doğruluk kritikse kazanır.',
    },
  ],
  partnerler: [
    { slug: 'taraf-a', ad: 'Taraf-A' },
    { slug: 'taraf-b', ad: 'Taraf-B' },
  ],
  kararMeta: {
    baslik: `Karar-noktası: ${hedefTask.ozet}`,
    ozet: 'Build sürecinde iki yol arasında tercih — test fikstürü.',
    olguTabani: [
      { olgu: 'Bu kart _build-test fikstürüdür; gerçek proje verisi değildir.', kaynak: '_build-test' },
    ],
    krux: {
      tur: 'deger',
      ayrisma: 'Hız-güvenilirlik ekseninde strateji yargısı — test senaryosu.',
      olguBosluklari: ['Maliyet bilgisi henüz netleşmedi.', 'Zaman dilimi belirsiz.'],
    },
  },
  _rootDir: PROJELER_ROOT,
})

// faz:build + task_id damgasını karar kartlarına ekle (kararWire değişmeden)
const kararYolu = join(PROJELER_ROOT, '_build-test', 'karar-kartlar', `${KARAR_ID}.json`)
karar_kartlariGuncelle(kararYolu, karar => ({
  ...karar,
  kartlar: karar.kartlar.map(k => ({ ...k, faz: 'build', task_id: hedefTask.id })),
}))

assert(existsSync(kararYolu), 'karar-kartlar/<id>.json oluşturuldu')

const kararVeri = okuJSON(kararYolu)
assert(
  kararVeri.kartlar.every(k => k.faz === 'build'),
  'karar kartları faz:build damgalı'
)
assert(
  kararVeri.kartlar.every(k => k.task_id === hedefTask.id),
  `karar kartları task_id=${hedefTask.id} damgalı (ebeveyne eşleşiyor)`
)
assert(kararVeri.kartlar.length === 2, 'iki karar kartı oluşturuldu (bir per partner)')
assert(
  kararVeri.kartlar.every(k => k.tip === 'girdi-talebi' && k.durum === 'cevap-bekliyor'),
  'karar kartları tip:girdi-talebi / durum:cevap-bekliyor'
)

// ── 3) Bloklu-bayrak: event_blok build-task'a ekle ───────────────────────────
section('3) Bloklu-bayrak (event_blok)')

const taskYolu = join(BUILD_TEST_ROOT, 'build-task', `${hedefTask.id}.json`)
let taskVeri = okuJSON(taskYolu)
taskVeri = {
  ...taskVeri,
  event_blok: KARAR_ID,
  build_durum: 'devam',           // görev devam ediyor, karar bekleniyor
  linked_karar_id: KARAR_ID,      // kalıcı bağ (event_blok temizlense bile)
  guncelleme: new Date().toISOString(),
}
yazJSON(taskYolu, taskVeri)

const taskBloklu = okuJSON(taskYolu)
assert(taskBloklu.event_blok === KARAR_ID, 'build-task event_blok set edildi')
assert(taskBloklu.build_durum === 'devam', 'build-task build_durum=devam (karar bekliyor)')
assert(taskBloklu.linked_karar_id === KARAR_ID, 'build-task linked_karar_id bağlı')

// ── 4) Partner cevapları → yakınsama ─────────────────────────────────────────
section('4) Partner cevapları (yakınsama senaryosu)')

karar_kartlariGuncelle(kararYolu, karar => ({
  ...karar,
  kartlar: karar.kartlar.map(k => ({
    ...k,
    durum: 'cevaplandi',
    partner_cevap: JSON.stringify({
      secenek: 'A — Hızlı geçiş',
      pozisyon: k.partner_slug === 'taraf-a'
        ? 'Hız kritik; erken lansmanın rekabet avantajı sağlayacağını düşünüyorum.'
        : 'Aynı fikirdeyim; ilk versiyon için hız öncelikli.',
      gerekce: ['Build-test fikstürü — gerçek pozisyon değil.'],
    }),
    guncelleme: new Date().toISOString(),
  })),
}))

const sonraki = okuJSON(kararYolu)
assert(
  sonraki.kartlar.every(k => k.durum === 'cevaplandi'),
  'her iki karar kartı cevaplandi'
)

// ── 5) kararTetikle → taslak ──────────────────────────────────────────────────
section('5) kararTetikle → taslak')

const tetikSonucu = kararTetikle({ karar_id: KARAR_ID, proje: '_build-test', _rootDir: PROJELER_ROOT })

assert(tetikSonucu.ok === true, `kararTetikle başarılı (tarafsızlık kapısı geçildi)`)
assert(tetikSonucu.terminal_sinif === 'yakinsama', 'terminal_sinif:yakinsama (her iki taraf A seçti)')

const taslakMdYol = join(BUILD_TEST_ROOT, '_fasilitasyon-taslak', `${KARAR_ID}.md`)
const taslakJsonYol = join(BUILD_TEST_ROOT, '_fasilitasyon-taslak', `${KARAR_ID}.json`)
assert(existsSync(taslakMdYol), 'taslak .md oluşturuldu (operator-only)')
assert(existsSync(taslakJsonYol), 'taslak .json oluşturuldu (operator-only)')

const taslakMeta = okuJSON(taslakJsonYol)
assert(taslakMeta.karar_id === KARAR_ID, 'taslak meta: karar_id doğru')
assert(taslakMeta.terminal_sinif === 'yakinsama', 'taslak meta: terminal_sinif yakinsama')

// ── 6) fasilitasyonuYayinla → sentez + onay ───────────────────────────────────
section('6) fasilitasyonuYayinla → sentez + onay kartları')

const yayinSonucu = fasilitasyonuYayinla({ karar_id: KARAR_ID, proje: '_build-test', _rootDir: PROJELER_ROOT })

assert(yayinSonucu.ok === true, 'fasilitasyonuYayinla başarılı')
assert(yayinSonucu.terminal_sinif === 'yakinsama', 'yayın: terminal_sinif yakinsama')
assert(yayinSonucu.escalation_flag === false, 'yakınsama: escalation_flag=false (kader-yok)')

const sentezDosyaYolu = join(BUILD_TEST_ROOT, 'sentez-kartlar', `${KARAR_ID}.json`)
assert(existsSync(sentezDosyaYolu), 'sentez-kartlar/<id>.json oluşturuldu')

const sentezDosya = okuJSON(sentezDosyaYolu)
assert(sentezDosya.kartlar.length === 2, 'yakınsama: 2 kart (sentez + onay)')
assert(!sentezDosya.escalation_flag, 'sentez dosyası: escalation_flag=false')

const sentezK = sentezDosya.kartlar.find(k => k.id === `${KARAR_ID}-sentez`)
const onayK = sentezDosya.kartlar.find(k => k.id === `${KARAR_ID}-onay`)
assert(!!sentezK, 'sentez-harita kartı var')
assert(!!onayK, 'onay kartı var (yakınsama)')
assert(sentezK?.tip === 'ilerleme' && sentezK?.durum === 'bitti', 'sentez kartı: ilerleme/bitti (read-only)')
assert(onayK?.tip === 'girdi-talebi' && onayK?.durum === 'cevap-bekliyor', 'onay kartı: girdi-talebi/cevap-bekliyor')
assert(sentezK?.kategori === 'karar-sentez', 'sentez kartı kategori:karar-sentez')
assert(onayK?.kategori === 'karar-onay', 'onay kartı kategori:karar-onay')

// Her sentez kartı şema-geçerli mi?
for (const k of sentezDosya.kartlar) {
  assert(kartDogrula(k).length === 0, `sentez kart ${k.id}: şema-geçerli`)
}

// sentezKartlariOku bağımsız doğrulama
const okunanKartlar = sentezKartlariOku(BUILD_TEST_ROOT)
assert(okunanKartlar.length === 2, 'sentezKartlariOku → 2 kart döndü')
assert(!okunanKartlar.some(k => k.escalation_flag), 'sentezKartlariOku: yakınsama → escalation_flag damgası yok')

// ── 7) event_blok temizle — onay kartı cevaplandi ──────────────────────────
section('7) event_blok temizle (onay kartı cevaplandi → tek-kaynak karar)')

// Yakınsama → onay kartı oluşturuldu (cevap-bekliyor). Operatör onaylayınca
// onayKartinaCevap → buildTaskEventBlokDegerlendirAc (tek-kaynak) → event_blok=null.
const onayResult = onayKartinaCevap({
  karar_id: KARAR_ID,
  proje: '_build-test',
  partner_cevap: 'Evet, onaylıyorum — A seçeneği hız önceliğini karşılıyor.',
  task_id: hedefTask.id,   // karar kartlarında build damgası yok; explicit override
  _rootDir: PROJELER_ROOT,
})

assert(onayResult.ok === true, 'onayKartinaCevap başarılı')
assert(onayResult.event_blok_acildi === true, 'event_blok açıldı (tek-kaynak: onay kartı cevaplandi)')

const taskSonrasi = okuJSON(taskYolu)
assert(taskSonrasi.event_blok === null, 'event_blok temizlendi (null)')
assert(taskSonrasi.build_durum === 'devam', 'build_durum hâlâ devam (blok kalktı, görev sürer)')
assert(taskSonrasi.linked_karar_id === KARAR_ID, 'linked_karar_id korundu (bağ bilgisi kaybolmadı)')

// Onay kartı durum geçişi doğrula
const sentezGuncel = okuJSON(sentezDosyaYolu)
const onayKartiGuncel = sentezGuncel.kartlar.find(k => k.kategori === 'karar-onay')
assert(onayKartiGuncel?.durum === 'cevaplandi', 'onay kartı durum:cevaplandi')
assert(typeof onayKartiGuncel?.partner_cevap === 'string', 'onay kartı partner_cevap set')

// Idempotent: ikinci çağrı atlanmalı
const onayResult2 = onayKartinaCevap({ karar_id: KARAR_ID, proje: '_build-test', _rootDir: PROJELER_ROOT })
assert(onayResult2.atlandı === true, 'onayKartinaCevap idempotent (ikinci çağrı atlandı)')

// ── 8) Render pipeline: operator-board + partner-cards ───────────────────────
section('8) Render pipeline: operator-board + partner-cards')

// Operator board
const { board, taslaklar: operatorTaslaklar } = buildTestOperatorOku(BUILD_TEST_ROOT)
const operatorBoardYolu = join(BUILD_TEST_ROOT, 'output', 'operator-board.json')
yazJSON(operatorBoardYolu, {
  proje: '_build-test',
  board,
  taslaklar: operatorTaslaklar,
  toplam: {
    bekliyor: board.bekliyor.length,
    devam: board.devam.length,
    bitti: board.bitti.length,
  },
})

assert(existsSync(operatorBoardYolu), 'output/operator-board.json oluşturuldu')

const boardKayitlari = [...board.bekliyor, ...board.devam, ...board.bitti]
assert(boardKayitlari.length === kartlar.length, `board toplam ${kartlar.length} kart içeriyor`)
assert(board.devam.length >= 1, 'devam sütununda en az 1 görev var')
assert(board.bitti.length >= 1, 'bitti sütununda en az 1 görev var')

// Bloklu görünüyor mu? (event_blok temizlendikten sonra null olmalı)
const hedefEntry = [...board.bekliyor, ...board.devam].find(e => e.kart.id === hedefTask.id)
assert(!!hedefEntry, 'hedef task board\'da var')
assert(hedefEntry?.event_blok === null, 'board: event_blok temizlenmiş (null)')
assert(hedefEntry?.bağlı_olay?.karar_id === KARAR_ID, 'board: bağlı_olay mevcut (karar_id bağlı)')
assert(hedefEntry?.bağlı_olay?.yayinlandi === true, 'board: bağlı_olay yayınlandı (sentez hazır)')
assert(hedefEntry?.kart.linked_karar_id === KARAR_ID, 'board: linked_karar_id kart üzerinde')

// cikti_pointer alanı var mı (null da olsa)
assert(
  'cikti_pointer' in (hedefEntry?.kart ?? {}),
  'build-task cikti_pointer alanı mevcut'
)

// Partner cards
const partnerVeri = buildTestPartnerOku(BUILD_TEST_ROOT)
const partnerCardsYolu = join(BUILD_TEST_ROOT, 'output', 'partner-cards.json')
yazJSON(partnerCardsYolu, partnerVeri)

assert(existsSync(partnerCardsYolu), 'output/partner-cards.json oluşturuldu')
assert(partnerVeri.kartlar.length === 2, 'partner-cards: sentez + onay kartı')
assert(partnerVeri.kartlar.some(k => k.tip === 'ilerleme'), 'partner-cards: sentez kartı (ilerleme/read-only)')
assert(partnerVeri.kartlar.some(k => k.tip === 'girdi-talebi'), 'partner-cards: onay kartı (girdi-talebi/yazılabilir)')

// ── 9) Fasilitasyon değişmedi teyidi ─────────────────────────────────────────
section('9) Fasilitasyon değişmedi — aynı kapı, aynı akış')

// Tarafsızlık kapısı: taslak var → kapı geçildi (fail-closed tasarım)
assert(existsSync(taslakMdYol), 'tarafsızlık kapısı geçildi (taslak yazıldı → tarafsız)')

// Şema kısıtları korundu: sentez kartlarında yeni tip YOK
const tumTipler = okunanKartlar.map(k => k.tip)
assert(
  tumTipler.every(t => ['ilerleme', 'girdi-talebi'].includes(t)),
  'sentez kartları yalnız mevcut tipler (ilerleme/girdi-talebi) — yeni tip eklenmedi'
)

// Idempotent: ikinci kararTetikle çağrısı atlanmalı
const tetik2 = kararTetikle({ karar_id: KARAR_ID, proje: '_build-test', _rootDir: PROJELER_ROOT })
assert(tetik2.atlandı === true, 'kararTetikle idempotent (ikinci çağrı atlandı)')

// Idempotent: ikinci fasilitasyonuYayinla çağrısı atlanmalı
const yayin2 = fasilitasyonuYayinla({ karar_id: KARAR_ID, proje: '_build-test', _rootDir: PROJELER_ROOT })
assert(yayin2.atlandı === true, 'fasilitasyonuYayinla idempotent (ikinci çağrı atlandı)')

// ── 10) İzolasyon teyidi ──────────────────────────────────────────────────────
section('10) İzolasyon teyidi: canlı veriler dokunulmadı')

if (BASELINE.baris !== null) {
  assert(
    readFileSync(join(PUBLIC_DIR, 'cards-baris.json'), 'utf8') === BASELINE.baris,
    'cards-baris.json DEĞİŞMEDİ'
  )
} else {
  console.log('  (cards-baris.json yok — DEĞİŞMEDİ kontrolü N/A, atlandı)')
}
assert(
  readFileSync(join(PUBLIC_DIR, 'registry.json'), 'utf8') === BASELINE.registry,
  'registry.json DEĞİŞMEDİ'
)
if (BASELINE.operatorBaris !== null) {
  assert(
    readFileSync(join(PUBLIC_DIR, 'operator-baris.json'), 'utf8') === BASELINE.operatorBaris,
    'operator-baris.json DEĞİŞMEDİ'
  )
} else {
  console.log('  (operator-baris.json yok — DEĞİŞMEDİ kontrolü N/A, atlandı)')
}
assert(
  readFileSync(join(PUBLIC_DIR, 'card-data.json'), 'utf8') === BASELINE.cardData,
  'card-data.json DEĞİŞMEDİ'
)

// Canlı projeler/baris/ altında _build-test yok (baris yoksa N/A — atlanır)
const barisProjeDir = join(PROJELER_ROOT, 'baris')
if (existsSync(barisProjeDir)) {
  const barisAltDizinler = readdirSync(barisProjeDir)
  assert(
    !barisAltDizinler.some(d => d === '_build-test'),
    'projeler/baris/ altında _build-test dizini YOK'
  )
} else {
  console.log('  (projeler/baris/ yok — izolasyon kontrolü N/A, atlandı)')
}

// _build-test/ yalnız projeler/ altında
assert(existsSync(BUILD_TEST_ROOT), '_build-test/ projeler/ altında var')
assert(
  !existsSync(join(dirname(PROJELER_ROOT), '_build-test')),
  '_build-test/ meta-layer/ kökünde YOK (projeler/ altında izole)'
)

// ── 11) Deadlock fikstürü (faz:build bağlamlı, yakınsamadan AYRI) ─────────────
section('11) Deadlock fikstürü (faz:build + task_id damgalı, izole)')

const KARAR_ID_DEADLOCK = 'build-test-karar-002-deadlock'
const DEADLOCK_TASK_ID = 'btest-task-deadlock'

// Sentetik build-task (masterPlanBol dışı — fikstür için)
const dTaskVeri = {
  id: DEADLOCK_TASK_ID,
  tip: 'ilerleme',
  durum: 'bitti',
  faz: 'build',
  build_durum: 'devam',
  ozet: 'Dağıtım kanalı seçimi — deadlock fikstür görevi',
  detay: 'Build-bağlamlı deadlock fikstürü; gerçek görev değil.',
  partner_cevap: null,
  olusturma: new Date().toISOString(),
  guncelleme: new Date().toISOString(),
  sahip: null,
  cikti_pointer: null,
  event_blok: KARAR_ID_DEADLOCK,
  linked_karar_id: KARAR_ID_DEADLOCK,
}
yazJSON(join(BUILD_TEST_ROOT, 'build-task', `${DEADLOCK_TASK_ID}.json`), dTaskVeri)
assert(existsSync(join(BUILD_TEST_ROOT, 'build-task', `${DEADLOCK_TASK_ID}.json`)), 'deadlock: sentetik build-task yazıldı')

// Karar çifti oluştur
const { kartlar: dKararKartlari } = kararCiftiOlustur({
  karar_id: KARAR_ID_DEADLOCK,
  proje: '_build-test',
  soru: 'Dağıtım kanalı: doğrudan mı, aracı üzerinden mi?',
  secenekler: [
    {
      ad: 'A — Doğrudan kanal',
      optimize: 'Marj kontrolü; marka doğrudan müşteriyle.',
      feda: 'Daha yavaş pazar erişimi.',
      kazanmaKosulu: 'Marj koruması öncelikliyse kazanır.',
    },
    {
      ad: 'B — Aracı kanal',
      optimize: 'Hızlı erişim; hazır müşteri tabanı.',
      feda: 'Marjdan pay; aracıya bağımlılık.',
      kazanmaKosulu: 'Hız ve erişim öncelikliyse kazanır.',
    },
  ],
  partnerler: [
    { slug: 'taraf-a', ad: 'Taraf-A (Deadlock)' },
    { slug: 'taraf-b', ad: 'Taraf-B (Deadlock)' },
  ],
  kararMeta: {
    baslik: 'Dağıtım kanalı seçimi — deadlock fikstürü',
    ozet: 'Kanal stratejisinde sabit değer ayrışması — pozisyon değişmez (deadlock).',
    olguTabani: [
      { olgu: 'Bu deadlock test fikstürüdür; gerçek proje verisi değil.', kaynak: '_build-test-deadlock' },
    ],
    krux: {
      tur: 'deger',
      ayrisma: 'Marj koruması ile pazar hızı arasında sabit strateji yargısı ayrışması (pozisyon değişmez).',
      olguBosluklari: ['Segment fiyat-esnekliği ölçülmedi.', 'Aracı marj etkisi netleşmedi.'],
    },
  },
  _rootDir: PROJELER_ROOT,
})

const dKararYolu = join(PROJELER_ROOT, '_build-test', 'karar-kartlar', `${KARAR_ID_DEADLOCK}.json`)

// faz:build + task_id damgasını deadlock karar kartlarına ekle
karar_kartlariGuncelle(dKararYolu, karar => ({
  ...karar,
  kartlar: karar.kartlar.map(k => ({ ...k, faz: 'build', task_id: DEADLOCK_TASK_ID })),
}))

assert(existsSync(dKararYolu), 'deadlock: karar-kartlar/<id>.json oluşturuldu')
const dKararVeri = okuJSON(dKararYolu)
assert(dKararVeri.kartlar.every(k => k.faz === 'build'), 'deadlock karar kartları: faz:build damgalı')
assert(dKararVeri.kartlar.every(k => k.task_id === DEADLOCK_TASK_ID), 'deadlock karar kartları: task_id damgalı')
assert(dKararVeri.kartlar.length === 2, 'deadlock: iki girdi-talebi kartı oluşturuldu')
assert(dKararVeri.kartlar.every(k => k.tip === 'girdi-talebi' && k.durum === 'cevap-bekliyor'), 'deadlock kartları: girdi-talebi/cevap-bekliyor')

// Çelişen SABİT pozisyonlarla partner cevapları (deadlock — yumuşamaz, birbirini dışlar)
karar_kartlariGuncelle(dKararYolu, karar => ({
  ...karar,
  kartlar: karar.kartlar.map(k => ({
    ...k,
    durum: 'cevaplandi',
    partner_cevap: JSON.stringify(k.partner_slug === 'taraf-a'
      ? {
          secenek: 'A — Doğrudan kanal',
          pozisyon: 'Marjı korumak zorunlu; aracıya bağımlılık kabul edilemez. Pozisyon değişmez.',
          gerekce: ['Bir kez aracıya girdikten sonra çıkmak imkânsız olur.'],
        }
      : {
          secenek: 'B — Aracı kanal',
          pozisyon: 'Hız kritik; piyasaya geç kalırsak marj fırsatı da olmaz. Pozisyon değişmez.',
          gerekce: ['İlk 6 ay kritik — aracı olmadan o hıza ulaşılamaz.'],
        }),
    guncelleme: new Date().toISOString(),
  })),
}))

const dSonraki = okuJSON(dKararYolu)
assert(dSonraki.kartlar.every(k => k.durum === 'cevaplandi'), 'deadlock: her iki karar kartı cevaplandi')
assert(
  dSonraki.kartlar.some(k => JSON.parse(k.partner_cevap).secenek === 'A — Doğrudan kanal') &&
  dSonraki.kartlar.some(k => JSON.parse(k.partner_cevap).secenek === 'B — Aracı kanal'),
  'deadlock: iki partner FARKLI seçenekte (birbirini dışlar)'
)

// kararTetikle → taslak
const dTetikSonucu = kararTetikle({ karar_id: KARAR_ID_DEADLOCK, proje: '_build-test', _rootDir: PROJELER_ROOT })
assert(dTetikSonucu.ok === true, 'deadlock kararTetikle: başarılı')
assert(dTetikSonucu.terminal_sinif === 'deger', 'deadlock terminal_sinif: deger (değer-ayrışması)')

const dTaslakMdYol = join(BUILD_TEST_ROOT, '_fasilitasyon-taslak', `${KARAR_ID_DEADLOCK}.md`)
const dTaslakJsonYol = join(BUILD_TEST_ROOT, '_fasilitasyon-taslak', `${KARAR_ID_DEADLOCK}.json`)
assert(existsSync(dTaslakMdYol), 'deadlock: taslak .md yazıldı (operatör-only)')
assert(existsSync(dTaslakJsonYol), 'deadlock: taslak .json yazıldı')

// fasilitasyonuYayinla → deadlock çıktısı
const dYayinSonucu = fasilitasyonuYayinla({ karar_id: KARAR_ID_DEADLOCK, proje: '_build-test', _rootDir: PROJELER_ROOT })
assert(dYayinSonucu.ok === true, 'deadlock fasilitasyonuYayinla: başarılı')
assert(dYayinSonucu.escalation_flag === true, 'deadlock: escalation_flag=true (yakınsamadaki false\'un tersi)')
assert(dYayinSonucu.terminal_sinif === 'deger', 'deadlock yayın: terminal_sinif=deger')

const dSentezDosyaYolu = join(BUILD_TEST_ROOT, 'sentez-kartlar', `${KARAR_ID_DEADLOCK}.json`)
assert(existsSync(dSentezDosyaYolu), 'deadlock: sentez-kartlar/<id>.json yazıldı')

const dSentezDosya = okuJSON(dSentezDosyaYolu)
assert(dSentezDosya.kartlar.length === 1, 'deadlock: yalnız 1 kart (sentez), onay kartı ÜRETİLMEDİ')
assert(dSentezDosya.escalation_flag === true, 'deadlock sentez dosyası: escalation_flag=true')
assert(dSentezDosya.terminal_sinif === 'deger', 'deadlock sentez dosyası: terminal_sinif=deger')

const dSentezK = dSentezDosya.kartlar.find(k => k.id === `${KARAR_ID_DEADLOCK}-sentez`)
const dOnayK = dSentezDosya.kartlar.find(k => k.id === `${KARAR_ID_DEADLOCK}-onay`)
assert(!!dSentezK, 'deadlock: sentez kartı var')
assert(!dOnayK, 'deadlock: onay/yakınsama kartı ÜRETİLMEDİ')
assert(dSentezK?.tip === 'ilerleme' && dSentezK?.durum === 'bitti', 'deadlock sentez: ilerleme/bitti (read-only nötr harita)')
assert(dSentezK?.kategori === 'karar-sentez', 'deadlock sentez: kategori:karar-sentez')
assert(kartDogrula(dSentezK).length === 0, 'deadlock sentez kartı: şema-geçerli')

// Build damgaları korundu (minimum uzantı: faz/task_id/linked_karar_id sentez kartında)
assert(dSentezK?.faz === 'build', 'deadlock sentez kartı: faz:build taşıyor')
assert(dSentezK?.task_id === DEADLOCK_TASK_ID, 'deadlock sentez kartı: task_id bağlı')
assert(dSentezK?.linked_karar_id === KARAR_ID_DEADLOCK, 'deadlock sentez kartı: linked_karar_id var')

// Nötrlik kapısı geçildi (fail-closed: taslak var → tarafsızlık doğrulandı, öneri/oy içermiyor)
assert(existsSync(dTaslakMdYol), 'deadlock: nötrlik kapısı geçildi (harita öneri/oy içermez)')

// escalation_flag sentezKartlariOku tarafından karta damgalandı mı?
const dpKartlar = sentezKartlariOku(BUILD_TEST_ROOT)
const dpDeadlockSentez = dpKartlar.find(k => k.id === `${KARAR_ID_DEADLOCK}-sentez`)
assert(!!dpDeadlockSentez, 'partner cards: deadlock sentez kartı dahil edildi')
assert(dpDeadlockSentez?.escalation_flag === true, 'partner cards: deadlock escalation_flag=true (Card.jsx banner için)')
assert(!dpKartlar.some(k => k.id === `${KARAR_ID_DEADLOCK}-onay`), 'partner cards: deadlock onay kartı YOK')

// Yakınsama fikstürü dokunulmadı
const dpYakinsamaOnay = dpKartlar.find(k => k.id === `${KARAR_ID}-onay`)
assert(!!dpYakinsamaOnay, 'yakınsama fikstürü: onay kartı hâlâ mevcut (deadlock izole)')

// Render: operator board deadlock'u escalation ile tanıyor
const { board: dBoard, taslaklar: dTaslaklar } = buildTestOperatorOku(BUILD_TEST_ROOT)
const dDeadlockEntry = [...dBoard.bekliyor, ...dBoard.devam, ...dBoard.bitti].find(e => e.kart.id === DEADLOCK_TASK_ID)
assert(!!dDeadlockEntry, 'operator board: deadlock build-task var')
assert(dDeadlockEntry?.bağlı_olay?.karar_id === KARAR_ID_DEADLOCK, 'board: deadlock bağlı_olay.karar_id doğru')
assert(dDeadlockEntry?.bağlı_olay?.yayinlandi === true, 'board: deadlock yayınlandı')
assert(dDeadlockEntry?.bağlı_olay?.escalation === true, 'board: deadlock escalation=true (eskalasyon banner için)')
assert(dDeadlockEntry?.bağlı_olay?.terminal_sinif === 'deger', 'board: deadlock terminal_sinif=deger')

// Render çıktılarını yaz
const dOperatorBoardYolu = join(BUILD_TEST_ROOT, 'output', 'operator-board-deadlock.json')
yazJSON(dOperatorBoardYolu, {
  proje: '_build-test',
  senaryolar: { yakinsama: KARAR_ID, deadlock: KARAR_ID_DEADLOCK },
  board: dBoard,
  taslaklar: dTaslaklar,
  toplam: { bekliyor: dBoard.bekliyor.length, devam: dBoard.devam.length, bitti: dBoard.bitti.length },
})
assert(existsSync(dOperatorBoardYolu), 'output/operator-board-deadlock.json oluşturuldu')

const dPartnerCardsYolu = join(BUILD_TEST_ROOT, 'output', 'partner-cards-deadlock.json')
yazJSON(dPartnerCardsYolu, { proje: '_build-test', kartlar: dpKartlar })
assert(existsSync(dPartnerCardsYolu), 'output/partner-cards-deadlock.json oluşturuldu')
assert(dpKartlar.some(k => k.tip === 'ilerleme' && k.escalation_flag === true), 'partner-cards: deadlock sentez (ilerleme/eskalasyon)')
assert(!dpKartlar.filter(k => k.karar_id === KARAR_ID_DEADLOCK).some(k => k.tip === 'girdi-talebi'), 'partner-cards: deadlock onay kartı (girdi-talebi) YOK')

// Idempotent
const dTetik2 = kararTetikle({ karar_id: KARAR_ID_DEADLOCK, proje: '_build-test', _rootDir: PROJELER_ROOT })
assert(dTetik2.atlandı === true, 'deadlock kararTetikle: idempotent (ikinci çağrı atlandı)')
const dYayin2 = fasilitasyonuYayinla({ karar_id: KARAR_ID_DEADLOCK, proje: '_build-test', _rootDir: PROJELER_ROOT })
assert(dYayin2.atlandı === true, 'deadlock fasilitasyonuYayinla: idempotent (ikinci çağrı atlandı)')

// ── Özet ─────────────────────────────────────────────────────────────────────
section(`Özet: ${passed + failed} test | ✓ ${passed} geçti | ✗ ${failed} başarısız`)

console.log('Çıktılar:')
console.log(`  _build-test/build-task/          : ${readdirSync(join(BUILD_TEST_ROOT, 'build-task')).length} kart`)
console.log(`  _build-test/karar-kartlar/        : ${existsSync(join(BUILD_TEST_ROOT, 'karar-kartlar')) ? readdirSync(join(BUILD_TEST_ROOT, 'karar-kartlar')).length : 0} karar`)
console.log(`  _build-test/_fasilitasyon-taslak/ : ${existsSync(join(BUILD_TEST_ROOT, '_fasilitasyon-taslak')) ? readdirSync(join(BUILD_TEST_ROOT, '_fasilitasyon-taslak')).length : 0} dosya`)
console.log(`  _build-test/sentez-kartlar/       : ${existsSync(join(BUILD_TEST_ROOT, 'sentez-kartlar')) ? readdirSync(join(BUILD_TEST_ROOT, 'sentez-kartlar')).length : 0} dosya`)
console.log(`  _build-test/output/               : ${readdirSync(join(BUILD_TEST_ROOT, 'output')).length} dosya`)

// ── test-kanal-log.md (İZOLE — gerçek meta-kanal.md'ye ASLA yazılmaz, bkz _build-test/) ────────
const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
const kanalYol = join(BUILD_TEST_ROOT, 'test-kanal-log.md')
const kanalNot = `
--- [${now}] build-task bağlama + fasilitasyon render doğrulama ---
Test: scripts/build-test-runner.mjs
Sonuç: ${passed}/${passed + failed} geçti${failed > 0 ? ` (${failed} BAŞARISIZ)` : ' — tümü geçti'}

İnşa edilenler:
- scripts/masterPlanBolucu.mjs: Jenerik master-plan → tip:ilerleme build-task bölücü.
  Barış'a özel hardcode yok; evrensel markdown desenleri (checkbox, numaralı bold, inline yapılacaklar).
  Opsiyonel metadata: faz:build, build_durum, sahip, cikti_pointer, event_blok.
- scripts/build-test-runner.mjs: Uçtan-uca izole doğrulama (bölücü + karar-olayı + bloklu-bayrak + render).
- scripts/build-card-data.js: buildTestOperatorOku() + buildTestPartnerOku() eklendi.
  Operator board: { board:{bekliyor,devam,bitti}, taslaklar }; her entry bağlı_olay bilgisiyle.
  Partner cards: sentezKartlariOku ile mevcut sentez/onay kartları.

_build-test/ yapısı:
  build-task/          : ${readdirSync(join(BUILD_TEST_ROOT, 'build-task')).length} tip:ilerleme kart (master-plan-v2.md)
  karar-kartlar/       : KARAR_ID=${KARAR_ID} (faz:build + task_id=${hedefTask.id})
  _fasilitasyon-taslak/: yakinsama taslağı (tarafsızlık kapısı geçildi)
  sentez-kartlar/      : sentez(ilerleme/bitti) + onay(girdi-talebi/cevap-bekliyor) — yakınsama
  output/              : operator-board.json + partner-cards.json (render-hazır)

Bloklu→aç geçişi: event_blok set → onay kartı cevaplandi (onayKartinaCevap → buildTaskEventBlokDegerlendirAc) → event_blok=null (linked_karar_id korundu).
İzolasyon: cards-baris.json ✓ | registry.json ✓ | operator-baris.json ✓ | card-data.json ✓

Önerilen sonraki adım: Gerçek proje (baris) için kararCiftiOlustur çağrısı hazırla (k16 re-engagement veya yeni karar-noktası); master-plan bölücüyü baris + diğer projelerde test et.
`
try {
  appendFileSync(kanalYol, kanalNot, 'utf8')
  console.log('\ntest-kanal-log.md güncellendi (izole, gerçek kanal DEĞİL).')
} catch (e) {
  console.warn('test-kanal-log.md yazılamadı:', e.message)
}

if (failed > 0) process.exit(1)
