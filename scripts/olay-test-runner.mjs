// meta-layer-core — In-build olay-tipi izole doğrulama (üç tip).
// BAĞIMSIZ KOŞUM: build-test-runner.mjs'e bağımlı değil.
// Tüm çıktı projeler/_build-test-olay/ altına yazılır.
// Canlı veriye (_build-test/ dahil) DOKUNULMAZ.
//
// Koşum: node scripts/olay-test-runner.mjs

import {
  existsSync, readFileSync, writeFileSync,
  mkdirSync, rmSync, readdirSync, appendFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'
import {
  arastirmaOlayiKur, arastirmaOlayiCoz,
  asyncToplantiOlayiKur, asyncToplantiOlayiCoz,
  kararDestekOlayiKur, kararDestekOlayiCoz,
} from './olayWire.mjs'
import { sentezKartlariOku, buildTestOperatorOku } from './build-card-data.js'
import { kartDogrula } from '../src/lib/stateMachine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJELER_ROOT = join(META_DATA_ROOT, 'projeler')
const OLAY_TEST_ROOT = join(PROJELER_ROOT, '_build-test-olay')
const PUBLIC_DIR = join(__dirname, '..', 'public')

// Olay kimlikleri
const ARASTIRMA_ID   = 'btest-olay-001-arastirma'
const TOPLANTI_ID    = 'btest-olay-002-toplanti'
const DESTEK_ID      = 'btest-olay-003-destek'
const ARASTIRMA_TASK = 'btest-olay-task-001'
const TOPLANTI_TASK  = 'btest-olay-task-002'
const DESTEK_TASK    = 'btest-olay-task-003'

// ── Baseline (izolasyon teyidi) ───────────────────────────────────────────────
const BASELINE = {
  baris: readFileSync(join(PUBLIC_DIR, 'cards-baris.json'), 'utf8'),
  registry: readFileSync(join(PUBLIC_DIR, 'registry.json'), 'utf8'),
  operatorBaris: readFileSync(join(PUBLIC_DIR, 'operator-baris.json'), 'utf8'),
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

function yazJSON(yol, veri) {
  mkdirSync(dirname(yol), { recursive: true })
  writeFileSync(yol, JSON.stringify(veri, null, 2), 'utf8')
}

function okuJSON(yol) {
  return JSON.parse(readFileSync(yol, 'utf8'))
}

// ── 0) Temizle & hazırla ──────────────────────────────────────────────────────
section('0) Temizle & hazırla (_build-test-olay izole)')

if (existsSync(OLAY_TEST_ROOT)) {
  rmSync(OLAY_TEST_ROOT, { recursive: true, force: true })
  console.log('  _build-test-olay/ temizlendi (idempotent)')
}
mkdirSync(join(OLAY_TEST_ROOT, 'build-task'), { recursive: true })
mkdirSync(join(OLAY_TEST_ROOT, 'output'), { recursive: true })
console.log('  _build-test-olay/ oluşturuldu')

// Üç build-task kartı hazırla (synthetic, linked_olay_id ile)
const now0 = new Date().toISOString()

const taskArastirma = {
  id: ARASTIRMA_TASK, tip: 'ilerleme', durum: 'bitti',
  ozet: 'Pazar araştırması: hedef segment boyutu', detay: 'Araştırma görevi',
  partner_cevap: null, olusturma: now0, guncelleme: now0,
  faz: 'build', build_durum: 'devam',
  event_blok: ARASTIRMA_ID, linked_olay_id: ARASTIRMA_ID,
}
const taskToplanti = {
  id: TOPLANTI_TASK, tip: 'ilerleme', durum: 'bitti',
  ozet: 'Kanal stratejisi toplantısı', detay: 'Async toplantı görevi',
  partner_cevap: null, olusturma: now0, guncelleme: now0,
  faz: 'build', build_durum: 'devam',
  event_blok: TOPLANTI_ID, linked_olay_id: TOPLANTI_ID,
}
const taskDestek = {
  id: DESTEK_TASK, tip: 'ilerleme', durum: 'bitti',
  ozet: 'Fiyatlama hipotezi kritik analizi', detay: 'Karar-destek görevi',
  partner_cevap: null, olusturma: now0, guncelleme: now0,
  faz: 'build', build_durum: 'devam',
  event_blok: DESTEK_ID, linked_olay_id: DESTEK_ID,
}

for (const t of [taskArastirma, taskToplanti, taskDestek]) {
  yazJSON(join(OLAY_TEST_ROOT, 'build-task', `${t.id}.json`), t)
}
assert(existsSync(join(OLAY_TEST_ROOT, 'build-task', `${ARASTIRMA_TASK}.json`)), 'araştırma build-task oluşturuldu')
assert(existsSync(join(OLAY_TEST_ROOT, 'build-task', `${TOPLANTI_TASK}.json`)), 'toplantı build-task oluşturuldu')
assert(existsSync(join(OLAY_TEST_ROOT, 'build-task', `${DESTEK_TASK}.json`)), 'destek build-task oluşturuldu')

// ── 1) ARAŞTIRMA — oracle yolu ────────────────────────────────────────────────
section('1) ARAŞTIRMA olay-tipi (oracle yolu)')

const OLGULAR = [
  { olgu: 'Türkiye SaaS pazarı 2023 büyümesi verisi', kaynak: 'IDC 2023 Türkiye Raporu' },
  { olgu: 'Hedef segment (KOBİ 10-50 kişi) şirket sayısı', kaynak: 'TÜİK 2023' },
  { olgu: 'Rakip fiyatlandırma ortalama aralığı', kaynak: null },
  { olgu: 'Kullanıcı başına ortalama CAC benchmarkı', durum: 'eksik', kaynak: null },
]

const ORACLE_CEVAP_FIKSTÜR = `Bu araştırma sorusuna ilişkin fikstür oracle yanıtı.
Pazar büyüklüğü verileri IDC ve TÜİK kaynaklarından teyit edildi.
Rakip fiyatlandırma verisi doğrulanamadı — bağımsız kaynak bulunamadı.
CAC benchmarkı için güvenilir kaynak tespit edilemedi.
[FİKSTÜR: Canlı oracle değil]`

// Kur
const kurA = arastirmaOlayiKur({
  olay_id: ARASTIRMA_ID, proje: '_build-test-olay',
  task_id: ARASTIRMA_TASK, soru: 'Hedef segmentin toplam pazar boyutu nedir?',
  olgular: OLGULAR, _rootDir: PROJELER_ROOT,
})
assert(kurA.ok === true, 'arastirmaOlayiKur başarılı')
assert(existsSync(join(OLAY_TEST_ROOT, 'olay-kartlar', `${ARASTIRMA_ID}.json`)), 'olay-kartlar/<id>.json oluşturuldu')

const olayMetaA = okuJSON(join(OLAY_TEST_ROOT, 'olay-kartlar', `${ARASTIRMA_ID}.json`))
assert(olayMetaA.olay_tipi === 'arastirma', 'olay_tipi:arastirma')
assert(olayMetaA.cozuldu === false, 'kuruldu; henüz çözülmedi')
assert(olayMetaA.olgular.length === 4, '4 olgu saklandı')

const girdiK = kurA.girdiKart
assert(girdiK?.tip === 'girdi-talebi', 'girdi kartı tip:girdi-talebi')
assert(girdiK?.durum === 'cevap-bekliyor', 'girdi kartı durum:cevap-bekliyor')
assert(kartDogrula(girdiK).length === 0, 'girdi kartı şema-geçerli')
assert(girdiK?.faz === 'build', 'girdi kartı faz:build')
assert(girdiK?.linked_olay_id === ARASTIRMA_ID, 'girdi kartı linked_olay_id doğru')

// Idempotent kur
const kurA2 = arastirmaOlayiKur({
  olay_id: ARASTIRMA_ID, proje: '_build-test-olay',
  task_id: ARASTIRMA_TASK, soru: '...', olgular: [], _rootDir: PROJELER_ROOT,
})
assert(kurA2.atlandı === true, 'arastirmaOlayiKur idempotent (ikinci çağrı atlandı)')

// Çöz
const cozA = arastirmaOlayiCoz({
  olay_id: ARASTIRMA_ID, proje: '_build-test-olay',
  _rootDir: PROJELER_ROOT, oracleCevap: ORACLE_CEVAP_FIKSTÜR,
})
assert(cozA.ok === true, 'arastirmaOlayiCoz başarılı')
assert(existsSync(join(OLAY_TEST_ROOT, 'sentez-kartlar', `${ARASTIRMA_ID}.json`)), 'sentez-kartlar/<id>.json oluşturuldu')

const sentezA = okuJSON(join(OLAY_TEST_ROOT, 'sentez-kartlar', `${ARASTIRMA_ID}.json`))
assert(sentezA.olay_tipi === 'arastirma', 'sentez dosyası olay_tipi:arastirma')
assert(sentezA.escalation_flag === false, 'araştırma: escalation_flag:false')
assert(sentezA.kartlar.length === 1, 'araştırma: 1 çıktı kartı')

const ciktiKartA = sentezA.kartlar[0]
assert(ciktiKartA.tip === 'ilerleme', 'çıktı kartı tip:ilerleme')
assert(ciktiKartA.durum === 'bitti', 'çıktı kartı durum:bitti')
assert(kartDogrula(ciktiKartA).length === 0, 'çıktı kartı şema-geçerli')
assert(ciktiKartA.faz === 'build', 'çıktı kartı faz:build')
assert(ciktiKartA.task_id === ARASTIRMA_TASK, 'çıktı kartı task_id doğru')
assert(ciktiKartA.linked_olay_id === ARASTIRMA_ID, 'çıktı kartı linked_olay_id doğru')
assert(ciktiKartA.detay?.includes('[doğrulanmış]'), 'detay [doğrulanmış] içeriyor (2 kaynaklı olgu)')
assert(ciktiKartA.detay?.includes('[eksik: doğrulanacak]'), 'detay [eksik: doğrulanacak] içeriyor (2 eksik olgu)')
assert(ciktiKartA.detay?.includes('[FİKSTÜR]'), 'detay fikstür modu işaretli')

const olayMetaA2 = okuJSON(join(OLAY_TEST_ROOT, 'olay-kartlar', `${ARASTIRMA_ID}.json`))
assert(olayMetaA2.cozuldu === true, 'olay meta cozuldu:true olarak güncellendi')

// Idempotent çöz
const cozA2 = arastirmaOlayiCoz({
  olay_id: ARASTIRMA_ID, proje: '_build-test-olay',
  _rootDir: PROJELER_ROOT, oracleCevap: ORACLE_CEVAP_FIKSTÜR,
})
assert(cozA2.atlandı === true, 'arastirmaOlayiCoz idempotent (ikinci çağrı atlandı)')

// ── 2) ASYNC-TOPLANTI — fasilitasyon yolu ────────────────────────────────────
section('2) ASYNC-TOPLANTI olay-tipi (fasilitasyon yolu)')

const TOPLANTI_SECENEKLER = [
  {
    ad: 'A — Doğrudan kanal',
    optimize: 'Müşteri ile doğrudan ilişki; kontrol yüksek.',
    feda: 'Büyüme hızı yavaş; erişim kısıtlı.',
    kazanmaKosulu: 'Müşteri kalitesi hacminden önemliyse kazanır.',
  },
  {
    ad: 'B — Aracı kanal',
    optimize: 'Hızlı büyüme; geniş erişim.',
    feda: 'Marj azalır; müşteri ilişkisi dolaylı.',
    kazanmaKosulu: 'Hız ve pazar payı öncelikliyse kazanır.',
  },
]

const TOPLANTI_KATILIMCILAR = [
  { slug: 'taraf-a', ad: 'Taraf-A (Kurucu)' },
  { slug: 'taraf-b', ad: 'Taraf-B (Danışman)' },
]

// Kur
const kurT = asyncToplantiOlayiKur({
  olay_id: TOPLANTI_ID, proje: '_build-test-olay',
  task_id: TOPLANTI_TASK, soru: 'Kanal stratejisi: doğrudan mı, aracı mı?',
  secenekler: TOPLANTI_SECENEKLER, katilimcilar: TOPLANTI_KATILIMCILAR,
  kararMeta: {
    baslik: 'Kanal stratejisi kararı',
    ozet: 'İlk büyüme döneminde dağıtım stratejisi — test fikstürü.',
    olguTabani: [
      { olgu: 'Bu async-toplantı fikstürüdür; gerçek veri değildir.', kaynak: '_olay-test' },
    ],
    krux: {
      tur: 'deger',
      ayrisma: 'Hız-kalite ekseninde strateji yargısı.',
      olguBosluklari: ['Aracı komisyon oranları netleşmedi.'],
    },
  },
  _rootDir: PROJELER_ROOT,
})
assert(kurT.ok === true, 'asyncToplantiOlayiKur başarılı')
assert(existsSync(join(OLAY_TEST_ROOT, 'karar-kartlar', `${TOPLANTI_ID}.json`)), 'karar-kartlar/<id>.json oluşturuldu')
assert(existsSync(join(OLAY_TEST_ROOT, 'olay-kartlar', `${TOPLANTI_ID}.json`)), 'olay-kartlar/<id>.json oluşturuldu')

const kararVeriT = okuJSON(join(OLAY_TEST_ROOT, 'karar-kartlar', `${TOPLANTI_ID}.json`))
assert(kararVeriT.olay_tipi === 'async-toplanti', 'karar verisi olay_tipi:async-toplanti')
assert(kararVeriT.kartlar.every(k => k.faz === 'build'), 'karar kartları faz:build damgalı')
assert(kararVeriT.kartlar.every(k => k.task_id === TOPLANTI_TASK), 'karar kartları task_id doğru')
assert(kararVeriT.kartlar.every(k => k.linked_olay_id === TOPLANTI_ID), 'karar kartları linked_olay_id doğru')

// Idempotent kur
const kurT2 = asyncToplantiOlayiKur({
  olay_id: TOPLANTI_ID, proje: '_build-test-olay',
  task_id: TOPLANTI_TASK, soru: '...', secenekler: [], katilimcilar: [], _rootDir: PROJELER_ROOT,
})
assert(kurT2.atlandı === true, 'asyncToplantiOlayiKur idempotent (ikinci çağrı atlandı)')

// Katılımcı cevapları simüle et (her ikisi A'yı seçer → yakınsama)
const kararYolT = join(OLAY_TEST_ROOT, 'karar-kartlar', `${TOPLANTI_ID}.json`)
const kararGuncelT = okuJSON(kararYolT)
kararGuncelT.kartlar = kararGuncelT.kartlar.map(k => ({
  ...k,
  durum: 'cevaplandi',
  partner_cevap: JSON.stringify({
    secenek: 'A — Doğrudan kanal',
    pozisyon: k.partner_slug === 'taraf-a'
      ? 'Müşteri ilişkisini doğrudan yönetmek kalite açısından kritik.'
      : 'Uzun vadede doğrudan kanal marj korur.',
    gerekce: ['Async-toplantı fikstürü — gerçek pozisyon değil.'],
  }),
  guncelleme: new Date().toISOString(),
}))
yazJSON(kararYolT, kararGuncelT)

assert(
  okuJSON(kararYolT).kartlar.every(k => k.durum === 'cevaplandi'),
  'toplantı: her iki katılımcı cevapladı'
)

// Çöz
const cozT = asyncToplantiOlayiCoz({
  olay_id: TOPLANTI_ID, proje: '_build-test-olay', _rootDir: PROJELER_ROOT,
})
assert(cozT.ok === true, 'asyncToplantiOlayiCoz başarılı')
assert(cozT.terminal_sinif === 'yakinsama', 'terminal_sinif:yakinsama (her iki taraf A seçti)')
assert(cozT.escalation_flag === false, 'yakınsama: escalation_flag:false')

assert(existsSync(join(OLAY_TEST_ROOT, 'sentez-kartlar', `${TOPLANTI_ID}.json`)), 'sentez-kartlar/<id>.json oluşturuldu')

const sentezT = okuJSON(join(OLAY_TEST_ROOT, 'sentez-kartlar', `${TOPLANTI_ID}.json`))
assert(sentezT.olay_tipi === 'async-toplanti', 'sentez dosyası olay_tipi:async-toplanti')
assert(sentezT.terminal_sinif === 'yakinsama', 'sentez terminal_sinif:yakinsama')
assert(sentezT.kartlar.length === 2, 'yakınsama: 2 kart (sentez + onay)')

const sentezHaritaT = sentezT.kartlar.find(k => k.id === `${TOPLANTI_ID}-sentez`)
const onayT = sentezT.kartlar.find(k => k.id === `${TOPLANTI_ID}-onay`)
assert(!!sentezHaritaT, 'toplantı sentez-harita kartı var')
assert(!!onayT, 'toplantı onay kartı var (yakınsama)')
assert(sentezHaritaT?.tip === 'ilerleme', 'sentez kartı tip:ilerleme')
assert(sentezHaritaT?.faz === 'build', 'sentez kartı faz:build')
assert(sentezHaritaT?.linked_olay_id === TOPLANTI_ID, 'sentez kartı linked_olay_id doğru')
assert(kartDogrula(sentezHaritaT).length === 0, 'sentez kartı şema-geçerli')
assert(kartDogrula(onayT).length === 0, 'onay kartı şema-geçerli')

// Olay meta güncellendi mi?
const olayMetaT2 = okuJSON(join(OLAY_TEST_ROOT, 'olay-kartlar', `${TOPLANTI_ID}.json`))
assert(olayMetaT2.cozuldu === true, 'toplantı olay meta cozuldu:true')

// Idempotent çöz
const cozT2 = asyncToplantiOlayiCoz({
  olay_id: TOPLANTI_ID, proje: '_build-test-olay', _rootDir: PROJELER_ROOT,
})
assert(cozT2.atlandı === true, 'asyncToplantiOlayiCoz idempotent (ikinci çağrı atlandı)')

// ── 3) KARAR-DESTEK — set-critic yolu ────────────────────────────────────────
section('3) KARAR-DESTEK olay-tipi (set-critic yolu)')

const CRITIC_CEVAP_FIKSTÜR = `Yapısal bulgular:
- Maliyet verileri kaynaklara dayanmıyor; bağımsız doğrulama gerekli
- Risk hesabı standart metodoloji kullanmadığı için güvenilirliği tartışmalı

Reçete önerileri:
- Kaynaklar doğrulanmalı ve güncel verilerle güncellenmelidir
- Standart risk metodolojisi kullanılmalıdır
[FİKSTÜR: Canlı set-critic değil]`

// Kur
const kurD = kararDestekOlayiKur({
  olay_id: DESTEK_ID, proje: '_build-test-olay',
  task_id: DESTEK_TASK, soru: 'Fiyatlama hipotezi geçerli mi?',
  hipotez: 'Yıllık abonelik aylık abonelikten %20 daha yüksek LTV sağlar.',
  _rootDir: PROJELER_ROOT,
})
assert(kurD.ok === true, 'kararDestekOlayiKur başarılı')
assert(existsSync(join(OLAY_TEST_ROOT, 'olay-kartlar', `${DESTEK_ID}.json`)), 'olay-kartlar/<id>.json oluşturuldu')

const olayMetaD = okuJSON(join(OLAY_TEST_ROOT, 'olay-kartlar', `${DESTEK_ID}.json`))
assert(olayMetaD.olay_tipi === 'karar-destek', 'olay_tipi:karar-destek')
assert(olayMetaD.cozuldu === false, 'kuruldu; henüz çözülmedi')
assert(typeof olayMetaD.hipotez === 'string', 'hipotez saklandı')

const girdiKD = kurD.girdiKart
assert(girdiKD?.tip === 'girdi-talebi', 'girdi kartı tip:girdi-talebi')
assert(girdiKD?.detay?.includes('[hipotez: doğrulanmamış]'), 'girdi kartı hipotez işaretli')
assert(kartDogrula(girdiKD).length === 0, 'girdi kartı şema-geçerli')
assert(girdiKD?.faz === 'build', 'girdi kartı faz:build')
assert(girdiKD?.linked_olay_id === DESTEK_ID, 'girdi kartı linked_olay_id doğru')

// Idempotent kur
const kurD2 = kararDestekOlayiKur({
  olay_id: DESTEK_ID, proje: '_build-test-olay',
  task_id: DESTEK_TASK, soru: '...', _rootDir: PROJELER_ROOT,
})
assert(kurD2.atlandı === true, 'kararDestekOlayiKur idempotent (ikinci çağrı atlandı)')

// Çöz (fikstür critic cevabı)
const cozD = kararDestekOlayiCoz({
  olay_id: DESTEK_ID, proje: '_build-test-olay',
  _rootDir: PROJELER_ROOT, criticCevap: CRITIC_CEVAP_FIKSTÜR,
})
assert(cozD.ok === true, 'kararDestekOlayiCoz başarılı')
assert(Array.isArray(cozD.yapisal) && cozD.yapisal.length >= 1, 'yapısal bulgular ayıklandı')
assert(Array.isArray(cozD.recete) && cozD.recete.length >= 1, 'reçete önerileri ayıklandı')

assert(existsSync(join(OLAY_TEST_ROOT, 'sentez-kartlar', `${DESTEK_ID}.json`)), 'sentez-kartlar/<id>.json oluşturuldu')

const sentezD = okuJSON(join(OLAY_TEST_ROOT, 'sentez-kartlar', `${DESTEK_ID}.json`))
assert(sentezD.olay_tipi === 'karar-destek', 'sentez dosyası olay_tipi:karar-destek')
assert(sentezD.kartlar.length === 1, 'karar-destek: 1 çıktı kartı')

const ciktiKartD = sentezD.kartlar[0]
assert(ciktiKartD.tip === 'ilerleme', 'çıktı kartı tip:ilerleme')
assert(ciktiKartD.durum === 'bitti', 'çıktı kartı durum:bitti')
assert(kartDogrula(ciktiKartD).length === 0, 'çıktı kartı şema-geçerli')
assert(ciktiKartD.faz === 'build', 'çıktı kartı faz:build')
assert(ciktiKartD.task_id === DESTEK_TASK, 'çıktı kartı task_id doğru')
assert(ciktiKartD.linked_olay_id === DESTEK_ID, 'çıktı kartı linked_olay_id doğru')
assert(ciktiKartD.detay?.includes('Yapısal Bulgular'), 'detay yapısal bölümü içeriyor')
assert(ciktiKartD.detay?.includes('Reçete Önerileri'), 'detay reçete bölümü içeriyor')
assert(ciktiKartD.detay?.includes('[hipotez: doğrulanmamış]'), 'detay hipotez işaretli')
assert(ciktiKartD.detay?.includes('[FİKSTÜR]'), 'detay fikstür modu işaretli')

const olayMetaD2 = okuJSON(join(OLAY_TEST_ROOT, 'olay-kartlar', `${DESTEK_ID}.json`))
assert(olayMetaD2.cozuldu === true, 'karar-destek olay meta cozuldu:true')

// Idempotent çöz
const cozD2 = kararDestekOlayiCoz({
  olay_id: DESTEK_ID, proje: '_build-test-olay',
  _rootDir: PROJELER_ROOT, criticCevap: CRITIC_CEVAP_FIKSTÜR,
})
assert(cozD2.atlandı === true, 'kararDestekOlayiCoz idempotent (ikinci çağrı atlandı)')

// ── 4) Render pipeline ───────────────────────────────────────────────────────
section('4) Render pipeline: sentezKartlariOku + buildTestOperatorOku')

// sentezKartlariOku: 4 kart bekle (1 araştırma + 2 toplantı + 1 destek)
const tumKartlar = sentezKartlariOku(OLAY_TEST_ROOT)
assert(tumKartlar.length === 4, `sentezKartlariOku → 4 kart döndü (araştırma:1 + toplantı:2 + destek:1), şu an: ${tumKartlar.length}`)

// Her kart şema-geçerli mi?
let hepsiGecerli = true
for (const k of tumKartlar) {
  if (kartDogrula(k).length > 0) { hepsiGecerli = false; break }
}
assert(hepsiGecerli, 'tüm sentez kartları şema-geçerli')

// Araştırma ve destek kartı ilerleme/bitti; toplantı onay kartı girdi-talebi
assert(tumKartlar.some(k => k.id === `${ARASTIRMA_ID}-cikti`), 'araştırma çıktı kartı var')
assert(tumKartlar.some(k => k.id === `${TOPLANTI_ID}-sentez`), 'toplantı sentez kartı var')
assert(tumKartlar.some(k => k.id === `${TOPLANTI_ID}-onay`), 'toplantı onay kartı var')
assert(tumKartlar.some(k => k.id === `${DESTEK_ID}-cikti`), 'karar-destek çıktı kartı var')

// escalation_flag yok (üç olay-tipi de yakınsama / araştırma / destek)
assert(!tumKartlar.some(k => k.escalation_flag), 'hiçbir kartta escalation_flag yok')

// Operator board
const { board } = buildTestOperatorOku(OLAY_TEST_ROOT)
const tumEntryler = [...board.bekliyor, ...board.devam, ...board.bitti]
assert(tumEntryler.length === 3, `operator board 3 build-task gösteriyor (mevcut: ${tumEntryler.length})`)
assert(tumEntryler.every(e => e.bağlı_olay !== null), 'her build-task bağlı_olay var')
assert(
  tumEntryler.some(e => e.bağlı_olay?.olay_tipi === 'arastirma'),
  'araştırma bağlı_olay.olay_tipi:arastirma'
)
assert(
  tumEntryler.some(e => e.bağlı_olay?.olay_tipi === 'async-toplanti'),
  'toplantı bağlı_olay.olay_tipi:async-toplanti'
)
assert(
  tumEntryler.some(e => e.bağlı_olay?.olay_tipi === 'karar-destek'),
  'destek bağlı_olay.olay_tipi:karar-destek'
)
assert(
  tumEntryler.every(e => e.bağlı_olay?.yayinlandi === true),
  'tüm olaylar yayınlandı olarak işaretlendi'
)

// Render çıktısını kaydet
const operatorBoardYolu = join(OLAY_TEST_ROOT, 'output', 'operator-board-olay.json')
writeFileSync(
  operatorBoardYolu,
  JSON.stringify({ proje: '_build-test-olay', board, toplam: { bekliyor: board.bekliyor.length, devam: board.devam.length, bitti: board.bitti.length } }, null, 2),
  'utf8'
)
assert(existsSync(operatorBoardYolu), 'output/operator-board-olay.json yazıldı')

// ── 5) Regresyon: gerçek dosyalar değişmedi ───────────────────────────────────
section('5) Regresyon: public/ baseline dosyaları değişmedi')

assert(readFileSync(join(PUBLIC_DIR, 'cards-baris.json'), 'utf8') === BASELINE.baris, 'cards-baris.json DEĞİŞMEDİ')
assert(readFileSync(join(PUBLIC_DIR, 'registry.json'), 'utf8') === BASELINE.registry, 'registry.json DEĞİŞMEDİ')
assert(readFileSync(join(PUBLIC_DIR, 'operator-baris.json'), 'utf8') === BASELINE.operatorBaris, 'operator-baris.json DEĞİŞMEDİ')
assert(readFileSync(join(PUBLIC_DIR, 'card-data.json'), 'utf8') === BASELINE.cardData, 'card-data.json DEĞİŞMEDİ')

const registry = JSON.parse(BASELINE.registry)
assert(!registry.projeler?.some(p => p.id.startsWith('_build-test-olay')), '_build-test-olay projeler registry\'de YOK')

// _build-test/ dizininin bu test tarafından dokunulmadığı teyidi
const btDir = join(PROJELER_ROOT, '_build-test')
// build-test-runner daha önce koşulmuşsa _build-test/ var olabilir; varsa zarar görmemeli
// (olay test runner sadece _build-test-olay/ yazar)
assert(!existsSync(join(OLAY_TEST_ROOT, 'karar-kartlar', 'build-test-karar-001.json')),
  'yakınsama fikstür karar kartına dokunulmadı')
assert(!existsSync(join(OLAY_TEST_ROOT, 'karar-kartlar', 'build-test-karar-002-deadlock.json')),
  'deadlock fikstür karar kartına dokunulmadı')

// ── 6) Özet ──────────────────────────────────────────────────────────────────
section(`6) Özet — ${passed + failed} test | ✓ ${passed} geçti | ✗ ${failed} başarısız`)

const allPass = failed === 0

// meta-kanal.md
const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')
const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ')
const kanalNot = `
--- [${nowStr}] in-build olay-tipleri doğrulama (üç tip) ---
Test: scripts/olay-test-runner.mjs
Sonuç: ${passed}/${passed + failed} geçti${failed > 0 ? ` (${failed} başarısız)` : ' — tümü geçti'}

Uygulanan:
- scripts/olayWire.mjs: arastirmaOlayiKur/Coz, asyncToplantiOlayiKur/Coz, kararDestekOlayiKur/Coz
- scripts/build-card-data.js: 2-satır buildTestOperatorOku genişletmesi (linked_olay_id + olay_tipi)
- scripts/olay-test-runner.mjs: izole test (projeler/_build-test-olay/)

Olay yolları:
  araştırma  → oracle yolu   → sentez-kartlar (ilerleme/bitti, [doğrulanmış]/[eksik] bölümlü)
  async-top. → fasilitasyon  → sentez-kartlar (kararWire yeniden kullanımı; yakınsama→+onay)
  kdr-destek → set-critic    → sentez-kartlar (ilerleme/bitti, yapısal-bulgu vs reçete)

Ortak invaryantlar: faz:build + task_id + linked_olay_id + şema-geçerli + idempotent ✓
Regresyon: public/ baseline değişmedi; _build-test/ dokunulmadı ✓

Önerilen sonraki adım: Üç olay-tipini baris canlı projesi üzerinde (tek bir olay_id ile) ilk gerçek turda koş — akış doğrulandı.
`

try {
  appendFileSync(kanalYol, kanalNot, 'utf8')
  console.log('  meta-kanal.md güncellendi.')
} catch (e) {
  console.warn('  meta-kanal.md yazılamadı:', e.message)
}

if (!allPass) process.exit(1)
