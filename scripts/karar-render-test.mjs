// meta-layer-core — Karar-fasilitasyon render-yolu izole doğrulama.
// Wire-test fikstürleri üzerinde build-card-data mantığını koşturur; gerçek proje
// dosyaları (cards-baris.json, registry.json) DEĞİŞMEZ. public/'e yazılmaz.
//
// Koşum: node scripts/karar-render-test.mjs

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { META_DATA_ROOT } from './config.js'
import { sentezKartlariOku, fasilitasyonTaslakMetalariOku } from './build-card-data.js'

const PROJELER_ROOT = join(META_DATA_ROOT, 'projeler')
const TEST_ROOT = join(PROJELER_ROOT, '_mekanik-test', 'wire-test')
const SCRATCHPAD = '/private/tmp/claude-501/-Users-kasimecer-dev-meta-layer-dashboard/b6b16cb2-3ffd-4ca2-9be2-6ec3adba8009/scratchpad/render-test'

mkdirSync(SCRATCHPAD, { recursive: true })

const PUBLIC_DIR = join(import.meta.dirname ?? new URL('.', import.meta.url).pathname.replace(/\/$/, ''), '..', 'public')
const CARDS_BARIS_YOL = join(PUBLIC_DIR, 'cards-baris.json')
const REGISTRY_YOL = join(PUBLIC_DIR, 'registry.json')

let passed = 0
let failed = 0

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++ }
  else { console.error(`  ✗ BAŞARISIZ: ${msg}`); failed++ }
}

// Baseline checksumları
const barisOnceki = readFileSync(CARDS_BARIS_YOL, 'utf8')
const registryOnceki = readFileSync(REGISTRY_YOL, 'utf8')

// ── Senaryo 1: Yakınsama fikstürü ─────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log('  Render-yolu: Yakınsama fikstürü')
console.log('════════════════════════════════════════════════════\n')

const Y_PROJE_DIR = join(TEST_ROOT, 'wire-test-yakinsama')
const Y_ID = 'test-karar-yakinsama'

assert(existsSync(Y_PROJE_DIR), 'wire-test-yakinsama dizini var (önceki test koşumu)')
assert(existsSync(join(Y_PROJE_DIR, 'sentez-kartlar')), 'sentez-kartlar/ dizini var')

const yKartlar = sentezKartlariOku(Y_PROJE_DIR)

assert(yKartlar.length === 2, 'yakınsama: sentezKartlariOku → 2 kart döndü')
assert(yKartlar.some(k => k.id === `${Y_ID}-sentez`), 'sentez-harita kartı var')
assert(yKartlar.some(k => k.id === `${Y_ID}-onay`), 'yakınsama: onay kartı VAR')

const ySentezKarti = yKartlar.find(k => k.id === `${Y_ID}-sentez`)
const yOnayKarti = yKartlar.find(k => k.id === `${Y_ID}-onay`)

assert(ySentezKarti?.tip === 'ilerleme', 'sentez kartı tip:ilerleme (read-only)')
assert(ySentezKarti?.durum === 'bitti', 'sentez kartı durum:bitti')
assert(ySentezKarti?.kategori === 'karar-sentez', 'sentez kartı kategori:karar-sentez')
assert(!ySentezKarti?.escalation_flag, 'yakınsama: sentez kartında escalation_flag YOK')

assert(yOnayKarti?.tip === 'girdi-talebi', 'onay kartı tip:girdi-talebi (yazılabilir)')
assert(yOnayKarti?.durum === 'cevap-bekliyor', 'onay kartı durum:cevap-bekliyor')
assert(yOnayKarti?.kategori === 'karar-onay', 'onay kartı kategori:karar-onay')

// Render-hazır: Card.jsx gereken alanlar
for (const k of yKartlar) {
  assert(k.id && k.tip && k.durum && k.ozet != null, `kart ${k.id}: zorunlu şema alanları tam`)
}

// Operator taslak (yakınsama için henüz yayınlandı — taslak-hazir geçildi)
// _fasilitasyon-taslak/ hâlâ var (wire-test tarafından yazıldı)
const yTaslaklar = fasilitasyonTaslakMetalariOku(Y_PROJE_DIR)
// Taslak dir var mı?
if (existsSync(join(Y_PROJE_DIR, '_fasilitasyon-taslak'))) {
  assert(Array.isArray(yTaslaklar), 'fasilitasyonTaslakMetalariOku dizi döndürüyor')
  if (yTaslaklar.length > 0) {
    assert(yTaslaklar[0].karar_id === Y_ID, 'taslak meta: karar_id doğru')
    assert(yTaslaklar[0].terminal_sinif === 'yakinsama', 'taslak meta: terminal_sinif yakinsama')
    assert(typeof yTaslaklar[0].yayinla_cli === 'string' && yTaslaklar[0].yayinla_cli.includes('--yayinla'), 'taslak meta: CLI komutu var')
  }
}

// Scratchpad'e yakınsama kartlarını yaz (render-data snapshot)
writeFileSync(
  join(SCRATCHPAD, 'cards-wire-test-yakinsama.json'),
  JSON.stringify({ proje: 'wire-test-yakinsama', kartlar: yKartlar }, null, 2),
  'utf8'
)
console.log(`  → scratchpad: ${join(SCRATCHPAD, 'cards-wire-test-yakinsama.json')}`)

// ── Senaryo 2: Deadlock fikstürü ──────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log('  Render-yolu: Deadlock fikstürü')
console.log('════════════════════════════════════════════════════\n')

const D_PROJE_DIR = join(TEST_ROOT, 'wire-test-deadlock')
const D_ID = 'test-karar-deadlock'

assert(existsSync(D_PROJE_DIR), 'wire-test-deadlock dizini var')
assert(existsSync(join(D_PROJE_DIR, 'sentez-kartlar')), 'deadlock: sentez-kartlar/ var')

const dKartlar = sentezKartlariOku(D_PROJE_DIR)

assert(dKartlar.length === 1, 'deadlock: sentezKartlariOku → 1 kart (sentez, onay YOK)')
assert(dKartlar.some(k => k.id === `${D_ID}-sentez`), 'deadlock: sentez kartı var')
assert(!dKartlar.some(k => k.id === `${D_ID}-onay`), 'deadlock: onay kartı YOK')

const dSentezKarti = dKartlar.find(k => k.id === `${D_ID}-sentez`)

assert(dSentezKarti?.tip === 'ilerleme', 'deadlock sentez tip:ilerleme (read-only)')
assert(dSentezKarti?.durum === 'bitti', 'deadlock sentez durum:bitti')
// escalation_flag damgalandı mı? (sentez-kartlar/<id>.json'daki escalation_flag:true → kart'a taşındı)
assert(dSentezKarti?.escalation_flag === true, 'deadlock: sentez kartında escalation_flag:true (Card.jsx badge için)')
assert(dSentezKarti?.kategori === 'karar-sentez', 'deadlock sentez kategori:karar-sentez')

// Operator taslak (deadlock)
const dTaslaklar = fasilitasyonTaslakMetalariOku(D_PROJE_DIR)
if (existsSync(join(D_PROJE_DIR, '_fasilitasyon-taslak'))) {
  if (dTaslaklar.length > 0) {
    assert(dTaslaklar[0].terminal_sinif === 'deger', 'deadlock taslak meta: terminal_sinif deger')
  }
}

// Scratchpad
writeFileSync(
  join(SCRATCHPAD, 'cards-wire-test-deadlock.json'),
  JSON.stringify({ proje: 'wire-test-deadlock', kartlar: dKartlar }, null, 2),
  'utf8'
)

// ── Render-data kontrolü ──────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log('  Render-data: Card.jsx davranış kontrolleri')
console.log('════════════════════════════════════════════════════\n')

// sentez kartı: onCevap YOK olursa read-only (Card.jsx: isGirdi=false → CevapKutusu çizilmez)
assert(ySentezKarti?.tip !== 'girdi-talebi', 'sentez kartı girdi-talebi DEĞİL → CevapKutusu çizilmez')

// onay kartı: onCevap geçilirse yazılabilir (tip:girdi-talebi + cevap-bekliyor → CevapKutusu çizilir)
assert(yOnayKarti?.tip === 'girdi-talebi' && yOnayKarti?.durum === 'cevap-bekliyor',
  'onay kartı: tip+durum doğru → submitPartnerInput ile cevaplanabilir')

// deadlock escalation: kart.escalation_flag=true → Card.jsx banner gösterir
assert(dSentezKarti?.escalation_flag === true,
  'deadlock escalation_flag → Card.jsx "⚠ Taraflar uzlaşmadı — karar sizde" banner\'ı gösterir')

// ── Gerçek dosyalar DEĞİŞMEDİ ────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log('  Gerçek dosya değişmedi kontrolleri')
console.log('════════════════════════════════════════════════════\n')

const barisSonraki = readFileSync(CARDS_BARIS_YOL, 'utf8')
const registrySonraki = readFileSync(REGISTRY_YOL, 'utf8')

assert(barisSonraki === barisOnceki, 'cards-baris.json DEĞİŞMEDİ')
assert(registrySonraki === registryOnceki, 'registry.json DEĞİŞMEDİ')

const registry = JSON.parse(registrySonraki)
const projeBilgileri = registry.projeler ?? []
// Sayı-agnostik: portföy canlı olarak büyür (yeni proje eklendikçe) — sabit bir rakama SAPLANMAK
// (ör. "tam 4") her yeni projede kaçınılmaz olarak bozulur ve bu testle İLGİSİZ bir başarısızlık
// üretir. Asıl kanıtlanmak istenen zaten satır 159'da BİREBİR string-eşitlikle var: bu test
// registry.json'ı DEĞİŞTİRMEDİ. Burada onu PARSE edilmiş düzeyde de teyit ediyoruz — proje SAYISI
// testin KENDİ öncesi anlık-görüntüsüyle (registryOnceki) uyuşuyor mu (yalnız bu testin dosyayı
// büyütüp/küçültmediğinin bağımsız bir kanıtı, gerçek portföy büyüklüğü hakkında bir iddia DEĞİL).
const projeBilgileriOnceki = (JSON.parse(registryOnceki).projeler ?? [])
assert(projeBilgileri.length === projeBilgileriOnceki.length,
  `portföy büyüklüğü test öncesiyle uyuşuyor (${projeBilgileri.length} proje, sabit bir sayıya kilitlenmedi)`)
assert(!projeBilgileri.some(p => p.id.startsWith('wire-test')), 'registry\'de wire-test-* YOK')
const beklenenler = ['baris', 'mustafa', 'yakup', 'noaval']
assert(beklenenler.every(id => projeBilgileri.some(p => p.id === id)),
  'portföyde baris/mustafa/yakup/noaval var')

// Sentez kartlar baris cards listesinde YOK (baris'in sentez-kartlar/ dizini yok)
const barisVeri = JSON.parse(barisSonraki)
assert(!barisVeri.kartlar.some(k => k.kategori === 'karar-sentez'),
  'cards-baris.json\'a test sentez kartı eklenmedi')

// ── verify-slice1 hâlâ 19/19 ─────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log('  verify-slice1 (19/19 kontrolü)')
console.log('════════════════════════════════════════════════════\n')

let sliceOk = false
try {
  const cikti = execSync('node scripts/verify-slice1.mjs 2>&1', {
    cwd: join(import.meta.dirname ?? new URL('.', import.meta.url).pathname.replace(/\/$/, ''), '..'),
    encoding: 'utf8',
  })
  const sonucSatiri = cikti.split('\n').find(l => l.includes('SONUÇ:'))
  sliceOk = sonucSatiri?.includes('19 geçti') && sonucSatiri?.includes('0 kaldı')
  console.log(' ', sonucSatiri?.trim())
} catch (e) {
  console.error('  verify-slice1 koşturulamadı:', e.message)
}
assert(sliceOk, 'verify-slice1: 19/19 geçti')

// ── Özet ─────────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════')
console.log(`  Toplam: ${passed + failed} | ✓ ${passed} geçti | ✗ ${failed} başarısız`)
console.log('════════════════════════════════════════════════════\n')

// Render nerede görülebilir?
console.log('Render görüntüleme (dev):')
console.log('  1. npm run dev  (veya vite)')
console.log('  2. public/ altına test JSON\'larını geçici koy:')
console.log('     cp', join(SCRATCHPAD, 'cards-wire-test-yakinsama.json'), join(PUBLIC_DIR, 'cards-wire-test-yakinsama.json'))
console.log('     cp', join(SCRATCHPAD, 'cards-wire-test-deadlock.json'), join(PUBLIC_DIR, 'cards-wire-test-deadlock.json'))
console.log('  3. #/partner/wire-test-yakinsama → sentez(read-only) + onay(input)')
console.log('  4. #/partner/wire-test-deadlock  → sentez(read-only) + ⚠ escalation banner')
console.log('  (test JSON\'larını commit\'leme; baris kartları etkilenmez)')

// test-kanal-log.md (İZOLE — gerçek meta-kanal.md'ye ASLA yazılmaz, bkz _mekanik-test/wire-test/)
import { appendFileSync } from 'fs'
const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
const kanalYol = join(TEST_ROOT, 'test-kanal-log.md')
const kanalNot = `
--- [${now}] karar-render-yolu doğrulama ---
Test: scripts/karar-render-test.mjs
Sonuç: ${passed}/${passed + failed} geçti${failed > 0 ? ` (${failed} başarısız)` : ' — tümü geçti'}
verify-slice1: ${sliceOk ? '19/19 ✓' : 'KONTROL EDİLEMEDİ'}

İnşa edilenler:
- scripts/build-card-data.js: sentezKartlariOku() + fasilitasyonTaslakMetalariOku() eklendi.
  Baris akışı: sentez kartları append edilir (baris'te henüz yok → dosya değişmez).
  Operator akışı: fasilitasyon_taslaklar varsa operator-<proje>.json'a eklenir.
- src/components/Card.jsx: escalation_flag=true → "⚠ Taraflar uzlaşmadı — karar sizde" banner.
- src/views/ProjectView.jsx: TaslakRow + "fasilitasyon taslakları" section (operatör, partner görmez).

Render görüntüleme (dev — canlıya commit/deploy etme):
  cp <scratchpad>/cards-wire-test-yakinsama.json public/
  cp <scratchpad>/cards-wire-test-deadlock.json public/
  → #/partner/wire-test-yakinsama: sentez(read-only) + onay(input lu girdi-talebi)
  → #/partner/wire-test-deadlock : sentez(read-only) + ⚠ escalation banner

Değişmeyenler: cards-baris.json ✓ | registry.json ✓ | portföy büyüklüğü test-öncesiyle aynı (${projeBilgileri.length} proje) ✓ | wire-test-* registry'de yok ✓

Önerilen sonraki adım: Gerçek proje (baris) için kararCiftiOlustur çağrısı hazırla (k16 veya yeni bir karar-noktası); kararWire.mjs'i drive/projeler/baris üzerinde ilk canlı turda test et.
`
try {
  appendFileSync(kanalYol, kanalNot, 'utf8')
  console.log('test-kanal-log.md güncellendi (izole, gerçek kanal DEĞİL).')
} catch (e) {
  console.warn('test-kanal-log.md yazılamadı:', e.message)
}

if (failed > 0) process.exit(1)
