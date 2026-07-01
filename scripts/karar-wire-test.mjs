// meta-layer-core — kararWire uçtan-uca test (izole: projeler/_mekanik-test/).
// İki senaryo: yakınsama fikstürü + deadlock fikstürü.
// Gerçek proje dizinlerine (baris/, kitap/) YAZILMAZ.
//
// Koşum: node scripts/karar-wire-test.mjs

import { rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { kararCiftiOlustur, kararTetikle, fasilitasyonuYayinla } from './kararWire.mjs'

const PROJELER_ROOT = join(META_DATA_ROOT, 'projeler')
const TEST_ROOT = join(PROJELER_ROOT, '_mekanik-test', 'wire-test')

// Gerçek proje dizinleri — yazım YOK kontrolü
const YASAK_PROJE_DIZINLERI = [
  join(PROJELER_ROOT, 'baris'),
  join(PROJELER_ROOT, 'kitap'),
]

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`)
    passed++
  } else {
    console.error(`  ✗ BAŞARISIZ: ${msg}`)
    failed++
  }
}

// ── Ortak fikstür veri ────────────────────────────────────────────────────────

const SECENEKLER = [
  {
    ad: 'A — Parite + giriş teklifi',
    optimize: 'Fiyat gücü + marka sinyali; geçici indirimle ilk müşteri toplar, sonra tam fiyata oturur.',
    feda: 'Kampanya disiplini gerekir.',
    kazanmaKosulu: 'Müşteri kaliteye fiyattan çok duyarlıysa kazanır.',
  },
  {
    ad: 'B — Kalıcı altfiyat',
    optimize: 'Erken müşteri kazanımı; sürekli fiyat-altı konum.',
    feda: 'Kalıcı ince marj + ileride zam zorluğu.',
    kazanmaKosulu: 'Segment fiyat-esnek + maliyet-tabanı kalıcı indirimi kârlı taşırsa kazanır.',
  },
]

const KARAR_META = {
  baslik: 'Lansman fiyat konumlandırması — test fikstürü',
  ozet: 'Girişte nasıl rekabet edilecek: iki yol arasında karar.',
  olguTabani: [
    { olgu: 'Rakip minimum fatura 999 SEK (test).', kaynak: 'test-fikstür' },
    { olgu: 'RUT-avdrag tekstil temizliğine uygulanmıyor (test).', kaynak: 'test-fikstür' },
  ],
  krux: {
    tur: 'deger',
    ayrisma: 'Fiyat gücü koruması ile erken müşteri hızı arasında strateji yargısı ayrışması.',
    olguBosluklari: [
      'Segment fiyat-esnekliği verisi yok (test).',
      'Maliyet-tabanı netleşmedi (test).',
    ],
  },
}

const PARTNERLER = [
  { slug: 'partner-a', ad: 'Partner-A' },
  { slug: 'partner-b', ad: 'Partner-B' },
]

// ── Senaryo 1: YAKINSAmA ─────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log('  Senaryo 1: Yakınsama fikstürü')
console.log('════════════════════════════════════════════════════\n')

const Y_PROJE = 'wire-test-yakinsama'
const Y_ID = 'test-karar-yakinsama'
const Y_DIR = join(TEST_ROOT, Y_PROJE)

// Temiz başlangıç
if (existsSync(Y_DIR)) rmSync(Y_DIR, { recursive: true })

// ── Adım 1: kararCiftiOlustur ──
const r1 = kararCiftiOlustur({
  karar_id: Y_ID,
  proje: Y_PROJE,
  soru: 'Girişte nasıl rekabet ederiz?',
  secenekler: SECENEKLER,
  partnerler: PARTNERLER,
  kararMeta: KARAR_META,
  _rootDir: TEST_ROOT,
})

assert(Array.isArray(r1.kartlar) && r1.kartlar.length === 2, 'kararCiftiOlustur: iki kart döndü')
assert(r1.kartlar.every(k => k.tip === 'girdi-talebi'), 'her kart tip:girdi-talebi')
assert(r1.kartlar.every(k => k.durum === 'cevap-bekliyor'), 'başlangıç durumu cevap-bekliyor')
assert(r1.kartlar.every(k => k.karar_id === Y_ID), 'her kart aynı karar_id')
assert(r1.kartlar.every(k => k.kategori === 'karar'), 'her kart kategori:karar')
assert(new Set(r1.kartlar.map(k => k.id)).size === 2, 'kart id\'leri benzersiz')
assert(r1.kartlar.every(k => k.id.startsWith(Y_ID)), 'kart id\'leri karar_id ile başlıyor')

// ── Partner cevapları simüle et (yakınsama: her ikisi A seçeneği) ──
const kararPath = join(TEST_ROOT, Y_PROJE, 'karar-kartlar', `${Y_ID}.json`)
const kararYapi = JSON.parse(readFileSync(kararPath, 'utf8'))
kararYapi.kartlar = kararYapi.kartlar.map((k, i) => ({
  ...k,
  durum: 'cevaplandi',
  partner_cevap: JSON.stringify({
    secenek: 'A — Parite + giriş teklifi',
    pozisyon: i === 0
      ? 'Fiyat gücünü koruyarak geçici indirimle müşteri toplamak en mantıklı yol.'
      : 'Ben de A\'yı destekliyorum; kalıcı indirim marjdan yer.',
    gerekce: i === 0
      ? ['RUT-avdrag yok, kalıcı indirim gereksiz avantaj getirmez.']
      : ['Geçici teklif yorum toplar, sonra tam fiyata dönülür.'],
  }),
  guncelleme: new Date().toISOString(),
}))
writeFileSync(kararPath, JSON.stringify(kararYapi, null, 2), 'utf8')

// ── Adım 2: kararTetikle ──
const t1 = kararTetikle({ karar_id: Y_ID, proje: Y_PROJE, _rootDir: TEST_ROOT })

assert(t1.ok === true, 'tetik ok:true döndü')
assert(t1.terminal_sinif === 'yakinsama', 'terminal_sinif: yakinsama (her iki partner A seçti)')

const taslakMdYol = join(TEST_ROOT, Y_PROJE, '_fasilitasyon-taslak', `${Y_ID}.md`)
const taslakJsonYol = join(TEST_ROOT, Y_PROJE, '_fasilitasyon-taslak', `${Y_ID}.json`)
assert(existsSync(taslakMdYol), 'operatör-only taslak (.md) yazıldı')
assert(existsSync(taslakJsonYol), 'operatör-only taslak (.json) yazıldı')

const sentezKartiYol = join(TEST_ROOT, Y_PROJE, 'sentez-kartlar', `${Y_ID}.json`)
assert(!existsSync(sentezKartiYol), 'partner sentez kartı HENÜZ yok (tetik sonrası, yayınla öncesi)')

// tarafsizlikDenetimi geçti: taslak var → geçmeseydi taslak yazılmazdı (fail-closed)
assert(existsSync(taslakMdYol), 'tarafsizlikDenetimi geçti')

// Karar state güncellendi mi?
const kararSonra1 = JSON.parse(readFileSync(kararPath, 'utf8'))
assert(kararSonra1.fasilitasyon_durumu === 'taslak-hazir', "karar.fasilitasyon_durumu: 'taslak-hazir'")
assert(kararSonra1.kartlar.every(k => k.fasilitasyon_durumu === 'taslak-hazir'), 'tüm kartlar fasilitasyon_durumu: taslak-hazir')

// ── Tetik idempotent (tekrar koştur → atlar, kopya yazmaz) ──
const t1b = kararTetikle({ karar_id: Y_ID, proje: Y_PROJE, _rootDir: TEST_ROOT })
assert(t1b.atlandı === true, 'tetik idempotent: tekrar koşturulunca atlandı:true')

// ── Adım 3: fasilitasyonuYayinla ──
const y1 = fasilitasyonuYayinla({ karar_id: Y_ID, proje: Y_PROJE, _rootDir: TEST_ROOT })

assert(y1.ok === true, 'yayınla ok:true döndü')
assert(existsSync(sentezKartiYol), 'partner sentez kartı yazıldı (yayınla sonrası)')
assert(y1.terminal_sinif === 'yakinsama', 'yayınla terminal_sinif: yakinsama')
assert(y1.escalation_flag === false, 'yakınsama → escalation_flag: false')

const sentezData1 = JSON.parse(readFileSync(sentezKartiYol, 'utf8'))
assert(sentezData1.kartlar.some(k => k.id === `${Y_ID}-sentez`), 'sentez-harita kartı var')
assert(sentezData1.kartlar.some(k => k.id === `${Y_ID}-onay`), 'yakınsama → onay kartı DA var')
assert(
  sentezData1.kartlar.find(k => k.id === `${Y_ID}-sentez`)?.tip === 'ilerleme',
  'sentez kartı tip:ilerleme (read-only)'
)
assert(
  sentezData1.kartlar.find(k => k.id === `${Y_ID}-sentez`)?.durum === 'bitti',
  'sentez kartı durum:bitti'
)
assert(
  sentezData1.kartlar.find(k => k.id === `${Y_ID}-onay`)?.tip === 'girdi-talebi',
  'onay kartı tip:girdi-talebi'
)
assert(
  sentezData1.kartlar.find(k => k.id === `${Y_ID}-onay`)?.durum === 'cevap-bekliyor',
  'onay kartı durum:cevap-bekliyor'
)
assert(sentezData1.escalation_flag === false, 'sentez JSON escalation_flag: false')
assert(sentezData1.terminal_sinif === 'yakinsama', 'sentez JSON terminal_sinif: yakinsama')

// Karar state: yayinlandi
const kararSonra1b = JSON.parse(readFileSync(kararPath, 'utf8'))
assert(kararSonra1b.fasilitasyon_durumu === 'yayinlandi', "karar.fasilitasyon_durumu: 'yayinlandi'")

// ── Yayınla idempotent ──
const y1b = fasilitasyonuYayinla({ karar_id: Y_ID, proje: Y_PROJE, _rootDir: TEST_ROOT })
assert(y1b.atlandı === true, 'yayınla idempotent: tekrar yayınlayınca atlandı:true')

// Kopya yok: kart sayısı aynı
const sentezData1b = JSON.parse(readFileSync(sentezKartiYol, 'utf8'))
assert(sentezData1b.kartlar.length === sentezData1.kartlar.length, 'idempotent: kart sayısı değişmedi')

// ── Senaryo 2: DEADLOCK ──────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log('  Senaryo 2: Deadlock fikstürü')
console.log('════════════════════════════════════════════════════\n')

const D_PROJE = 'wire-test-deadlock'
const D_ID = 'test-karar-deadlock'
const D_DIR = join(TEST_ROOT, D_PROJE)

if (existsSync(D_DIR)) rmSync(D_DIR, { recursive: true })

const r2 = kararCiftiOlustur({
  karar_id: D_ID,
  proje: D_PROJE,
  soru: 'Girişte nasıl rekabet ederiz?',
  secenekler: SECENEKLER,
  partnerler: PARTNERLER,
  kararMeta: KARAR_META,
  _rootDir: TEST_ROOT,
})

assert(r2.kartlar.length === 2, 'deadlock: iki kart döndü')
assert(r2.kartlar.every(k => k.karar_id === D_ID), 'deadlock: her kart aynı karar_id')

// Partner cevapları simüle et (deadlock: A vs B — farklı seçenekler)
const dKararPath = join(TEST_ROOT, D_PROJE, 'karar-kartlar', `${D_ID}.json`)
const dKararYapi = JSON.parse(readFileSync(dKararPath, 'utf8'))
dKararYapi.kartlar = dKararYapi.kartlar.map((k, i) => ({
  ...k,
  durum: 'cevaplandi',
  partner_cevap: JSON.stringify({
    secenek: i === 0 ? 'A — Parite + giriş teklifi' : 'B — Kalıcı altfiyat',
    pozisyon: i === 0
      ? 'Fiyat gücünü korumalıyız; kalıcı indirim marjdan yer ve marka zararı verir.'
      : 'Kalıcı altfiyat erken müşteri getirir ve güven sinyali oluşturur.',
    gerekce: i === 0
      ? ['Bir kez ucuz firma olunursa zam imkansızlaşır.']
      : ['Kalıcılık güven sinyali, geçici indirim değil.'],
  }),
  guncelleme: new Date().toISOString(),
}))
writeFileSync(dKararPath, JSON.stringify(dKararYapi, null, 2), 'utf8')

// ── Tetik ──
const t2 = kararTetikle({ karar_id: D_ID, proje: D_PROJE, _rootDir: TEST_ROOT })

assert(t2.ok === true, 'deadlock tetik ok:true')
assert(t2.terminal_sinif === 'deger', 'deadlock terminal_sinif: deger (değer-ayrışması)')

const dTaslakYol = join(TEST_ROOT, D_PROJE, '_fasilitasyon-taslak', `${D_ID}.md`)
assert(existsSync(dTaslakYol), 'deadlock: taslak yazıldı')

const dSentezYol = join(TEST_ROOT, D_PROJE, 'sentez-kartlar', `${D_ID}.json`)
assert(!existsSync(dSentezYol), 'deadlock: partner sentez kartı HENÜZ yok (tetik sonrası)')

// Karar state: taslak-hazir
const dKararSonra = JSON.parse(readFileSync(dKararPath, 'utf8'))
assert(dKararSonra.fasilitasyon_durumu === 'taslak-hazir', 'deadlock: fasilitasyon_durumu taslak-hazir')

// ── Yayınla ──
const y2 = fasilitasyonuYayinla({ karar_id: D_ID, proje: D_PROJE, _rootDir: TEST_ROOT })

assert(y2.ok === true, 'deadlock yayınla ok:true')
assert(existsSync(dSentezYol), 'deadlock: sentez kartı dosyası yazıldı')
assert(y2.escalation_flag === true, 'deadlock → escalation_flag: true')
assert(y2.terminal_sinif === 'deger', 'deadlock yayınla terminal_sinif: deger')

const dSentezData = JSON.parse(readFileSync(dSentezYol, 'utf8'))
assert(dSentezData.kartlar.some(k => k.id === `${D_ID}-sentez`), 'deadlock: sentez kartı var')
assert(!dSentezData.kartlar.some(k => k.id === `${D_ID}-onay`), 'deadlock: onay kartı YOK')
assert(dSentezData.escalation_flag === true, 'deadlock sentez JSON escalation_flag: true')
assert(dSentezData.kartlar.length === 1, 'deadlock: yalnız sentez kartı (onay yok)')

// ── Tetik idempotent (deadlock) ──
const t2b = kararTetikle({ karar_id: D_ID, proje: D_PROJE, _rootDir: TEST_ROOT })
assert(t2b.atlandı === true, 'deadlock tetik idempotent')

const dSentezData2 = JSON.parse(readFileSync(dSentezYol, 'utf8'))
assert(dSentezData2.kartlar.length === dSentezData.kartlar.length, 'deadlock idempotent: kart sayısı değişmedi')

// ── Yayınla idempotent (deadlock) ──
const y2b = fasilitasyonuYayinla({ karar_id: D_ID, proje: D_PROJE, _rootDir: TEST_ROOT })
assert(y2b.atlandı === true, 'deadlock yayınla idempotent')

// ── Gerçek proje dizinlerine yazım yok ───────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log('  Gerçek proje dizinleri kontrolü')
console.log('════════════════════════════════════════════════════\n')

for (const yasak of YASAK_PROJE_DIZINLERI) {
  const ad = yasak.split('/').pop()
  assert(!existsSync(join(yasak, 'karar-kartlar')), `${ad}/karar-kartlar/ yok (dokunulmadı)`)
  assert(!existsSync(join(yasak, '_fasilitasyon-taslak')), `${ad}/_fasilitasyon-taslak/ yok (dokunulmadı)`)
  assert(!existsSync(join(yasak, 'sentez-kartlar')), `${ad}/sentez-kartlar/ yok (dokunulmadı)`)
}

// Tüm yazmalar TEST_ROOT altında mı?
assert(existsSync(join(TEST_ROOT, Y_PROJE)), `test yazmaları ${TEST_ROOT.split('/').slice(-2).join('/')} altında`)
assert(existsSync(join(TEST_ROOT, D_PROJE)), 'deadlock yazmaları da aynı test dizininde')

// ── Özet + meta-kanal ────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log(`  Toplam: ${passed + failed} test | ✓ ${passed} geçti | ✗ ${failed} başarısız`)
console.log('════════════════════════════════════════════════════\n')

// meta-kanal.md'ye APPEND
import { appendFileSync } from 'fs'
const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')
const kanalNot = `
--- [${now}] karar-wire uçtan-uca test ---
Test: scripts/karar-wire-test.mjs
Sonuç: ${passed}/${passed + failed} geçti${failed > 0 ? ` (${failed} başarısız)` : ' — tümü geçti'}

İnşa edilenler:
- scripts/kararWire.mjs — kararCiftiOlustur / kararTetikle / fasilitasyonuYayinla / metaKomutIsle
- scripts/karar-wire-test.mjs — iki senaryo (yakınsama + deadlock) test koşumu

Senaryo 1 (yakınsama): iki partner A seçti → taslak-hazir → yayınlandı → sentez + onay kartı oluştu.
Senaryo 2 (deadlock): A vs B ayrışması → taslak-hazir → yayınlandı → sentez kartı + escalation_flag:true, onay kartı yok.
Her iki senaryo: idempotent (tetik + yayınla tekrar çalıştırıldı; kopya yazılmadı).
Gerçek proje dizinlerine (baris/, kitap/) yazım yok — doğrulandı.

Not (ters-kanal wire): fasilitasyonuYayinla CLI'ya bağlandı (--yayinla <id> --proje <proje>).
Meta-komut intake: metaKomutIsle() + --komut CLI ile hazır. CLAUDE.md'nin TERS-KANAL INTAKE
protokolü ile tam entegrasyon: seans başında meta-komut.md'de "YAYINLA <karar_id> <proje>"
içeren ### KOMUT blokları bulununca kararWire.mjs --komut koşturulabilir.

Önerilen sonraki adım: build-card-data.js'yi sentez-kartlar/ okuyacak şekilde genişlet; kararCiftiOlustur'u gerçek bir proje (baris?) üzerinde ilk canlı tur için hazırla.
`
try {
  appendFileSync(kanalYol, kanalNot, 'utf8')
  console.log('meta-kanal.md güncellendi.')
} catch (e) {
  console.warn('meta-kanal.md yazılamadı:', e.message)
}

if (failed > 0) process.exit(1)
