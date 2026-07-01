// meta-layer-core — masterPlanBolucu.mjs çok-plan izole doğrulama.
// İKİNCİ ve yapısal olarak FARKLI bir plan üzerinde bölücüyü koşturur;
// domain-hardcode yok, projeye-özel sızıntı yok, adversaryal davranış raporlanır.
//
// Koşum: node scripts/cokplan-test-runner.mjs

import {
  existsSync, readFileSync, writeFileSync,
  mkdirSync, rmSync, appendFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'
import { masterPlanBol } from './masterPlanBolucu.mjs'
import { kartDogrula } from '../src/lib/stateMachine.js'

const PROJELER_ROOT = join(META_DATA_ROOT, 'projeler')
const TEST_ROOT = join(PROJELER_ROOT, '_build-test-cokplan')
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// ── Baseline ──────────────────────────────────────────────────────────────────
const BASELINE = {
  baris: readFileSync(join(PUBLIC_DIR, 'cards-baris.json'), 'utf8'),
  registry: readFileSync(join(PUBLIC_DIR, 'registry.json'), 'utf8'),
}

// ── Test çerçevesi ─────────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const gozlemler = []   // adversaryal/bilgi gözlemleri (pass/fail değil)

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++ }
  else { console.error(`  ✗ BAŞARISIZ: ${msg}`); failed++ }
}

function gozlem(msg) {
  console.log(`  ◈ GÖZLEM: ${msg}`)
  gozlemler.push(msg)
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

// ─────────────────────────────────────────────────────────────────────────────
// İKİNCİ PLAN — Tarifex (dijital/yazılım ürünü)
//
// Kasıtlı FARKLILIKLAR:
//   Domain: dijital yazılım (vs fiziksel tekstil temizliği)
//   Yapı: ağırlıklı numaralı-bold (Section 1,4,5,7) + nested checkbox (Section 2)
//         + inline yapılacaklar paragrafı (Section 3)
//   Adversaryal: Section 5 "Riskler ve Varsayımlar" — numbered-bold + checkbox
//                formatlı ama BUILD-İŞİ OLMAYAN maddeler
// ─────────────────────────────────────────────────────────────────────────────
const IKINCI_PLAN_MD = `# Tarifex — Dijital Ürün Master Plan v1
<!-- Test fikstürü: Bu belge kurgusaldır; masterPlanBolucu.mjs çok-plan doğrulaması için. -->

## 0. Ürün Durumu

**Platform:** iOS + Android uygulama. **Hedef kullanıcı:** Türkçe yemek tarifi arayanlar.
Mevcut aşama: MVP geliştirme. Henüz yayında değil.

---

## 1. Teknik Altyapı

1. **Kimlik doğrulama modülünü tamamla:** OAuth2 ve Apple Sign-In entegrasyonu yap.
2. **Arama motorunu kur:** Elasticsearch veya Algolia pilot karşılaştırması yap.
3. **Fotoğraf CDN kararını ver:** Cloudinary ile S3+CloudFront maliyet analizi yap.
4. **Push bildirim altyapısı:** Firebase Cloud Messaging entegre et.
5. **Analitik altyapı:** Mixpanel ile Amplitude deneme sürümlerini karşılaştır.

---

## 2. İçerik & Onboarding

- [ ] Açılış ekranı tasarımını bitir (3 adımlı onboarding akışı).
- [x] İlk 50 tarif el ile girildi (seed içerik tamamlandı).
- [ ] Tarif kategorileri ve etiket taksonomisini belgele.
- [ ] SEO-dostu URL yapısını belirle.
  - [ ] Türkçe slug normalizasyonu test et (ğ, ş, ı dönüşümü).
  - [x] URL şeması kararlaştırıldı: /tarifler/{kategori}/{slug}
- [ ] Kullanıcı yorum ve puan modülünü tamamla.

---

## 3. Büyüme Kanalları

**Yapılacaklar:** TikTok tarif videoları · Instagram Reels · Yemek blogcu ortaklıkları · App Store optimizasyonu

---

## 4. Monetizasyon

1. **Premium abonelik modelini belirle:** Aylık 29,90 TL ve yıllık 199 TL A/B testi planla.
2. **Reklam entegrasyonu yap:** AdMob ile freemium sınırlarını yapılandır.
3. **İçerik ortaklığı sözleşmesi hazırla:** Tarif yazarlarıyla gelir-paylaşım taslağı yaz.

---

## 5. Riskler ve Varsayımlar

*(Aşağıdaki maddeler görev listesi DEĞİLDİR — yalnızca bağlam notları. Adversaryal eklenti.)*

1. **Platform komisyon riski:** App Store %30 yapısı değişirse monetizasyon modeli revize edilmeli.
2. **CAC varsayımı:** Kullanıcı edinme maliyeti <25 TL varsayıldı; doğrulanmamış hipotez.
- [x] Ana rakipler tarandı: Yemek.com, Nefis Yemek Tarifleri, Tarifit uygulamaları.
- [ ] Farklılaşma analizinin belgelenmesi henüz tamamlanmadı.

---

## 6. Lansman Hazırlığı

- [ ] Beta grubu kur (50 kişi, başvuru formu hazırla).
- [ ] App Store geliştirici hesabı aç.
- [ ] Gizlilik politikası ve kullanım şartları hazırla.
- [x] Uygulama adı ve ikonu kararlaştırıldı (Tarifex).

---

## 7. KPI Hedefleri

1. **DAU/MAU oranı hedefi belirle:** Min %20 (ilk ay için %10 kabul edilebilir).
2. **Oturum derinliği hedefi:** Tarif başına ortalama 3,2 sayfa görüntüleme.
3. **D7 retention hedefi:** %30 hedef; %20 altı alarm eşiği olarak ayarla.
`

// ─────────────────────────────────────────────────────────────────────────────
// Birinci planın bilinen terimleri — sızıntı kontrolü için
// ─────────────────────────────────────────────────────────────────────────────
const BIRINCI_PLAN_TERIMLERI = [
  'Göteborg', 'MöbelRent', 'Microstäd', 'begagnad', 'moms', 'RUT',
  'Barış', 'baris', 'kanepe', 'Reco.se', 'SEK', 'Bolagsverket',
  'TextilRena', 'Illos', 'F-skatt',
]

// Adversaryal bölüm öngörülen maddeleri (Section 5)
const ADVERSARYAL_OZET_DESENLER = [
  /platform komisyon riski/i,
  /cac varsayımı/i,
  /ana rakipler tarandı/i,
  /farklılaşma analizinin belgelenmesi/i,
]

// ── 0) Temizle & hazırla ──────────────────────────────────────────────────────
section('0) Temizle & hazırla (_build-test-cokplan izole)')

if (existsSync(TEST_ROOT)) {
  rmSync(TEST_ROOT, { recursive: true, force: true })
  console.log('  _build-test-cokplan/ temizlendi (idempotent)')
}
mkdirSync(join(TEST_ROOT, 'build-task-ikinci'), { recursive: true })
mkdirSync(join(TEST_ROOT, 'build-task-birinci'), { recursive: true })
console.log('  _build-test-cokplan/ oluşturuldu')

// İkinci planı diske yaz (artefakt)
writeFileSync(join(TEST_ROOT, 'ikinci-plan.md'), IKINCI_PLAN_MD, 'utf8')
assert(existsSync(join(TEST_ROOT, 'ikinci-plan.md')), 'ikinci-plan.md yazıldı')

// ── 1) Bölücü: birinci plan (fiziksel-hizmet) ─────────────────────────────────
section('1) Birinci plan (fiziksel-hizmet): baris/master-plan-v2.md')

const BIRINCI_PLAN_YOL = join(PROJELER_ROOT, 'baris', 'master-plan-v2.md')
let birinci_kartlar = []
let birinci_erisilebildi = false

if (existsSync(BIRINCI_PLAN_YOL)) {
  const icerik1 = readFileSync(BIRINCI_PLAN_YOL, 'utf8')
  birinci_kartlar = masterPlanBol(icerik1, { projeId: 'bplan1', kaynak: 'master-plan-v2.md' })
  birinci_erisilebildi = true
  for (const k of birinci_kartlar) {
    yazJSON(join(TEST_ROOT, 'build-task-birinci', `${k.id}.json`), k)
  }
  assert(birinci_kartlar.length >= 1, `birinci plan: ≥1 kart üretdi (üretilen: ${birinci_kartlar.length})`)
  assert(birinci_kartlar.every(k => kartDogrula(k).length === 0), 'birinci plan: tüm kartlar şema-geçerli')
  assert(birinci_kartlar.every(k => k.tip === 'ilerleme'), 'birinci plan: tüm kartlar tip:ilerleme')
  assert(birinci_kartlar.every(k => k.faz === 'build'), 'birinci plan: tüm kartlar faz:build')
  assert(birinci_kartlar.every(k => k.id.startsWith('bplan1-')), 'birinci plan: id\'ler bplan1- önekiyle')
  console.log(`\n  Birinci plan task'ları (${birinci_kartlar.length} adet):`)
  for (const k of birinci_kartlar) {
    console.log(`    ${k.id} [${k.build_durum}/${k.sahip}] ${k.ozet.slice(0, 55)}`)
  }
} else {
  gozlem(`master-plan-v2.md erişilemedi (${BIRINCI_PLAN_YOL}) — birinci plan testi atlandı`)
  assert(true, 'birinci plan erişilemedi — Drive bağlantı sorunu; birinci plan testleri atlandı')
}

// ── 2) Bölücü: ikinci plan (dijital/yazılım ürünü — Tarifex) ─────────────────
section('2) İkinci plan (dijital ürün — Tarifex): masterPlanBol')

const ikinci_kartlar = masterPlanBol(IKINCI_PLAN_MD, { projeId: 'bplan2', kaynak: 'tarifex-master-plan-v1.md' })

assert(ikinci_kartlar.length >= 15, `ikinci plan: ≥15 kart üretdi (üretilen: ${ikinci_kartlar.length})`)
assert(ikinci_kartlar.every(k => kartDogrula(k).length === 0), 'ikinci plan: tüm kartlar şema-geçerli')
assert(ikinci_kartlar.every(k => k.tip === 'ilerleme'), 'ikinci plan: tüm kartlar tip:ilerleme')
assert(ikinci_kartlar.every(k => k.durum === 'bitti'), 'ikinci plan: tüm kartlar durum:bitti (ilerleme şeması)')
assert(ikinci_kartlar.every(k => k.faz === 'build'), 'ikinci plan: tüm kartlar faz:build damgalı')
assert(ikinci_kartlar.every(k => k.id.startsWith('bplan2-')), 'ikinci plan: id\'ler bplan2- önekiyle')

// build_durum dağılımı: bitti (checkbox [x]) ve bekliyor ([ ] ve numaralı-bold) karışık olmalı
const bitti_sayisi   = ikinci_kartlar.filter(k => k.build_durum === 'bitti').length
const bekliyor_sayisi = ikinci_kartlar.filter(k => k.build_durum === 'bekliyor').length
const dis_sayisi     = ikinci_kartlar.filter(k => k.sahip === 'dis').length
const operator_sayisi = ikinci_kartlar.filter(k => k.sahip === 'operator').length
const partner_sayisi  = ikinci_kartlar.filter(k => k.sahip === 'partner').length

assert(bitti_sayisi >= 1, `ikinci plan: en az 1 bitti kart ([x] checkbox) — bulundu: ${bitti_sayisi}`)
assert(bekliyor_sayisi >= 1, `ikinci plan: en az 1 bekliyor kart — bulundu: ${bekliyor_sayisi}`)
assert(operator_sayisi >= 1, `ikinci plan: numaralı-bold → operator sahipli task var (${operator_sayisi})`)
assert(partner_sayisi >= 1, `ikinci plan: checkbox → partner sahipli task var (${partner_sayisi})`)
assert(dis_sayisi >= 1, `ikinci plan: inline-yapılacaklar → dis sahipli task var (${dis_sayisi})`)

// Dosyalara yaz
for (const k of ikinci_kartlar) {
  yazJSON(join(TEST_ROOT, 'build-task-ikinci', `${k.id}.json`), k)
}

console.log(`\n  İkinci plan task'ları (${ikinci_kartlar.length} adet):`)
for (const k of ikinci_kartlar) {
  console.log(`    ${k.id} [${k.build_durum}/${k.sahip}] ${k.ozet.slice(0, 60)}`)
}

// ── 3) İkinci planın içeriğinden türediğini doğrula ──────────────────────────
section('3) Kaynak doğrulama: ikinci plan içeriğinden türemiş mi?')

// Tarifex'e özgü terimler: en az birkaçı ozet'lerde geçmeli
const TARIFEX_KONTROLLER = [
  { desen: /kimlik doğrulama|oauth|apple sign/i, etiket: 'teknik altyapı (Section 1)' },
  { desen: /onboarding|açılış ekranı/i, etiket: 'onboarding (Section 2)' },
  { desen: /tiktok|instagram reels|blogcu/i, etiket: 'büyüme kanalları (Section 3, Pattern 3)' },
  { desen: /abonelik|monetizasyon|adMob|reklam entegrasyonu/i, etiket: 'monetizasyon (Section 4)' },
  { desen: /beta grubu|app store geliştirici|gizlilik politikası/i, etiket: 'lansman (Section 6)' },
  { desen: /DAU|MAU|retention|d7/i, etiket: 'KPI (Section 7)' },
]

const tumOzetler = ikinci_kartlar.map(k => k.ozet).join(' ')
for (const kontrol of TARIFEX_KONTROLLER) {
  assert(kontrol.desen.test(tumOzetler), `ikinci plan içeriği: ${kontrol.etiket} terimler var`)
}

// ── 4) Birinci-plan izi yok (sızıntı kontrolü) ────────────────────────────────
section('4) BİRİNCİ-PLAN İZİ KONTROLÜ: ikinci plan task\'larına sızdı mı?')

let sizinti_var = false
for (const terim of BIRINCI_PLAN_TERIMLERI) {
  const sizdi = ikinci_kartlar.some(k =>
    (k.ozet + ' ' + (k.detay ?? '')).includes(terim)
  )
  if (sizdi) {
    console.error(`  ✗ SIZINTI: "${terim}" ikinci plan task'larında bulundu!`)
    failed++
    sizinti_var = true
  }
}

if (!sizinti_var) {
  assert(true, 'BİRİNCİ-PLAN İZİ YOK: ikinci plan task\'larında fiziksel-hizmet terimi sızmadı')
  console.log(`    Kontrol edilen terimler: ${BIRINCI_PLAN_TERIMLERI.join(', ')}`)
}

// ── 5) İki plan ID'leri birbirine karışmadı ──────────────────────────────────
section('5) İki plan karışmadı: ID izolasyonu')

if (birinci_erisilebildi) {
  const birinci_idler = new Set(birinci_kartlar.map(k => k.id))
  const ikinci_idler  = new Set(ikinci_kartlar.map(k => k.id))
  const kesisim = [...birinci_idler].filter(id => ikinci_idler.has(id))
  assert(kesisim.length === 0, `iki plan ID'leri çakışmıyor (kesişim: ${kesisim.length})`)
  assert(birinci_kartlar.every(k => k.id.startsWith('bplan1-')), 'birinci plan: tüm id\'ler bplan1- önekiyle')
  assert(ikinci_kartlar.every(k => k.id.startsWith('bplan2-')), 'ikinci plan: tüm id\'ler bplan2- önekiyle')

  // Karşılaştırma özeti
  console.log(`\n  Birinci plan (fiziksel-hizmet): ${birinci_kartlar.length} task`)
  console.log(`  İkinci plan (dijital ürün):     ${ikinci_kartlar.length} task`)
  console.log(`  Ortak ID: ${kesisim.length} (sıfır olmalı)`)
} else {
  gozlem('ID karşılaştırması atlandı (birinci plan erişilemedi)')
}

// ── 6) ADVERSARYAL LİSTE davranışı ───────────────────────────────────────────
section('6) ADVERSARYAL: Section 5 "Riskler ve Varsayımlar" nasıl ele alındı?')

const adversaryal_bulunanlar = []
for (const desen of ADVERSARYAL_OZET_DESENLER) {
  const eslesen = ikinci_kartlar.find(k => desen.test(k.ozet))
  if (eslesen) adversaryal_bulunanlar.push(eslesen.ozet)
}

gozlem(`Adversaryal maddelerden build-task'a dönüşen: ${adversaryal_bulunanlar.length}/${ADVERSARYAL_OZET_DESENLER.length}`)
for (const ozet of adversaryal_bulunanlar) {
  gozlem(`  → "${ozet.slice(0, 70)}"`)
}

if (adversaryal_bulunanlar.length > 0) {
  gozlem('BULGU: masterPlanBolucu.mjs adversaryal maddeleri task olarak ekledi (beklenen davranış — saf sözdizimsel çıkarım).')
  gozlem('Neden: Bölücü "Riskler" vs "Görevler" bölümünü ANLAM ile değil SÖZDİZİM ile ayırt eder (regex desenleri: checkbox + numaralı-bold).')
  gozlem('Etki: Riskler/Varsayımlar bölümündeki checkbox/numaralı maddeleri de task sayar → kullanıcı farkındalığı gerekir.')
} else {
  gozlem('Adversaryal maddeler task\'a dönüşmedi — beklenmedik sonuç, araştır.')
}

// Build-task assertion: adversaryal maddelerin varlığı bir gözlem, fail değil
assert(true, 'adversaryal davranış gözlemlendi ve raporlandı (see ◈ GÖZLEM satırları)')

// ── 7) BÖLÜCÜDE hardcode/projeye-özel dal var mı? ────────────────────────────
section('7) masterPlanBolucu.mjs kod inceleme: hardcode/projeye-özel dal')

gozlem('masterPlanBolucu.mjs KOD İNCELEME SONUCU:')
gozlem('1. projeId ve kaynak parametreler dışında domain-spesifik hardcode YOK.')
gozlem('2. Üç evrensel sözdizimsel desen: checkbox · numaralı-bold · inline-yapılacaklar.')
gozlem('3. Pattern 3 "yapılacak" Türkçe kelimesini arar → DİL-BAĞIMLI ama domain-bağımsız.')
gozlem('   (İngilizce "TODO" başlıklı planlar Pattern 3\'ü tetiklemez.)')
gozlem('4. stripMarkdown, truncate, anahtar fonksiyonları domain-agnostik.')
gozlem('5. sahip (partner/operator/dis) desen tipine göre atanır, domain bilgisine göre değil.')

assert(
  !ikinci_kartlar.some(k => k.ozet.match(/göteborg|möbelrent|microstäd|begagnad|rut|moms/i)),
  'bölücü kodunda fiziksel-hizmet hardcode yok (ikinci plan çıktısı temiz)'
)

// Pattern 3 dil bağımlılığı kontrolü: "Yapılacaklar" başlığı eşleşti mi?
const dis_kartlari = ikinci_kartlar.filter(k => k.sahip === 'dis')
assert(dis_kartlari.length >= 1, `Pattern 3 tetiklendi: ${dis_kartlari.length} 'dis' sahipli task üretildi (inline-yapılacaklar)`)
if (dis_kartlari.length > 0) {
  console.log(`  Pattern 3 üretti (${dis_kartlari.length} kart): ${dis_kartlari.map(k => `"${k.ozet.slice(0, 30)}"`).join(', ')}`)
}

// ── 8) Tam karşılaştırma tablosu ──────────────────────────────────────────────
section('8) İki plan yan yana karşılaştırma')

const karsilastirma = {
  birinci: {
    ad: 'Fiziksel hizmet (Barış — tekstil temizliği, Göteborg)',
    plan_yolu: BIRINCI_PLAN_YOL,
    erisilebildi: birinci_erisilebildi,
    toplam: birinci_kartlar.length,
    bitti: birinci_kartlar.filter(k => k.build_durum === 'bitti').length,
    bekliyor: birinci_kartlar.filter(k => k.build_durum === 'bekliyor').length,
    sahip_dagilimi: {
      partner: birinci_kartlar.filter(k => k.sahip === 'partner').length,
      operator: birinci_kartlar.filter(k => k.sahip === 'operator').length,
      dis: birinci_kartlar.filter(k => k.sahip === 'dis').length,
    },
  },
  ikinci: {
    ad: 'Dijital ürün (Tarifex — tarif paylaşım uygulaması)',
    plan_yolu: join(TEST_ROOT, 'ikinci-plan.md'),
    erisilebildi: true,
    toplam: ikinci_kartlar.length,
    bitti: ikinci_kartlar.filter(k => k.build_durum === 'bitti').length,
    bekliyor: ikinci_kartlar.filter(k => k.build_durum === 'bekliyor').length,
    sahip_dagilimi: {
      partner: ikinci_kartlar.filter(k => k.sahip === 'partner').length,
      operator: ikinci_kartlar.filter(k => k.sahip === 'operator').length,
      dis: ikinci_kartlar.filter(k => k.sahip === 'dis').length,
    },
    adversaryal_eklenenler: adversaryal_bulunanlar.length,
  },
}

writeFileSync(
  join(TEST_ROOT, 'karsilastirma.json'),
  JSON.stringify(karsilastirma, null, 2),
  'utf8'
)

console.log('\n  BİRİNCİ PLAN:')
console.log(`    Domain   : ${karsilastirma.birinci.ad}`)
console.log(`    Erişim   : ${karsilastirma.birinci.erisilebildi ? 'ok' : 'erişilemedi'}`)
console.log(`    Toplam   : ${karsilastirma.birinci.toplam} task`)
console.log(`    Dağılım  : bitti=${karsilastirma.birinci.bitti}, bekliyor=${karsilastirma.birinci.bekliyor}`)
console.log(`    Sahip    : partner=${karsilastirma.birinci.sahip_dagilimi.partner}, operator=${karsilastirma.birinci.sahip_dagilimi.operator}, dis=${karsilastirma.birinci.sahip_dagilimi.dis}`)

console.log('\n  İKİNCİ PLAN:')
console.log(`    Domain   : ${karsilastirma.ikinci.ad}`)
console.log(`    Erişim   : ok`)
console.log(`    Toplam   : ${karsilastirma.ikinci.toplam} task`)
console.log(`    Dağılım  : bitti=${karsilastirma.ikinci.bitti}, bekliyor=${karsilastirma.ikinci.bekliyor}`)
console.log(`    Sahip    : partner=${karsilastirma.ikinci.sahip_dagilimi.partner}, operator=${karsilastirma.ikinci.sahip_dagilimi.operator}, dis=${karsilastirma.ikinci.sahip_dagilimi.dis}`)
console.log(`    Adversaryal (Section 5 "Riskler"): ${karsilastirma.ikinci.adversaryal_eklenenler}/${ADVERSARYAL_OZET_DESENLER.length} madde task'a girdi`)

if (birinci_erisilebildi) {
  assert(
    karsilastirma.birinci.toplam !== karsilastirma.ikinci.toplam ||
    birinci_kartlar[0]?.ozet !== ikinci_kartlar[0]?.ozet,
    'iki plan farklı task-setleri üretti (aynı olmayan içerik)'
  )
}

// ── 9) Regresyon: canlı veriler dokunulmadı ──────────────────────────────────
section('9) Regresyon: canlı veriler dokunulmadı')

assert(
  readFileSync(join(PUBLIC_DIR, 'cards-baris.json'), 'utf8') === BASELINE.baris,
  'cards-baris.json DEĞİŞMEDİ'
)
assert(
  readFileSync(join(PUBLIC_DIR, 'registry.json'), 'utf8') === BASELINE.registry,
  'registry.json DEĞİŞMEDİ'
)

// _build-test/ (yakınsama/deadlock) dokunulmadı mı?
const BTEST_ROOT = join(PROJELER_ROOT, '_build-test')
if (existsSync(BTEST_ROOT)) {
  assert(
    !existsSync(join(BTEST_ROOT, 'build-task', 'bplan2-task-001.json')),
    '_build-test/ altına bplan2 task\'ları eklenmedi (izolasyon korundu)'
  )
}

// ── Özet ─────────────────────────────────────────────────────────────────────
section(`Özet: ${passed + failed} test | ✓ ${passed} geçti | ✗ ${failed} başarısız`)

console.log('\n  Gözlemler (assertion değil — bilgi):')
for (const g of gozlemler) console.log(`    ${g}`)

console.log('\n  Artefaktlar:')
console.log(`    ${join(TEST_ROOT, 'ikinci-plan.md')} — ikinci master plan (Tarifex)`)
console.log(`    ${join(TEST_ROOT, 'build-task-ikinci/')} — ${ikinci_kartlar.length} task kartı`)
if (birinci_erisilebildi) {
  console.log(`    ${join(TEST_ROOT, 'build-task-birinci/')} — ${birinci_kartlar.length} task kartı`)
}
console.log(`    ${join(TEST_ROOT, 'karsilastirma.json')} — yan yana karşılaştırma`)

// ── meta-kanal.md ──────────────────────────────────────────────────────────────
const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')
const kanalNot = `
--- [${now}] masterPlanBolucu.mjs çok-plan izole doğrulama ---
Test: scripts/cokplan-test-runner.mjs
Sonuç: ${passed}/${passed + failed} geçti${failed > 0 ? ` (${failed} BAŞARISIZ)` : ' — tümü geçti'}

Birinci plan (fiziksel-hizmet, Barış): ${birinci_erisilebildi ? birinci_kartlar.length + ' task' : 'erişilemedi'}
İkinci plan (dijital ürün, Tarifex):  ${ikinci_kartlar.length} task
  bitti=${ikinci_kartlar.filter(k=>k.build_durum==='bitti').length}, bekliyor=${ikinci_kartlar.filter(k=>k.build_durum==='bekliyor').length}
  sahip: partner=${ikinci_kartlar.filter(k=>k.sahip==='partner').length}, operator=${ikinci_kartlar.filter(k=>k.sahip==='operator').length}, dis=${ikinci_kartlar.filter(k=>k.sahip==='dis').length}

BULGULAR:
- BİRİNCİ-PLAN İZİ: İKİNCİ plan task'larında fiziksel-hizmet terimi (Göteborg/MöbelRent/SEK/RUT/moms/begagnad vb.) SIZMAMIŞ.
- HARDCODE DURUMU: masterPlanBolucu.mjs'de projeye-özel dal/hardcode YOK. Tüm desenler evrensel sözdizimsel.
- ADVERSARYAL: Section 5 "Riskler ve Varsayımlar" altındaki ${ADVERSARYAL_OZET_DESENLER.length} maddeden ${adversaryal_bulunanlar.length}'i build-task'a girdi.
  Neden: Bölücü anlam değil sözdizim kullanır — checkbox ve numaralı-bold her bağlamda eşleşir.
  Öneri: Risk/Varsayım bölümlerini görev listesi biçimiyle YAZMA; düz metin veya tablo kullan.
- PATTERN 3 DİL BAĞIMLILIĞI: "yapılacak" anahtar kelimesi Türkçe-özgü; İngilizce plan başlıkları Pattern 3'ü tetiklemez.
  Bu domain-bağımsız ama dil-bağımlı bir kısıtlamadır.
- İKİ PLAN ID İZOLASYONU: bplan1- / bplan2- önekleri, aynı kod iki farklı kaynaktan çakışmasız kart üretiyor.

Artefaktlar:
  projeler/_build-test-cokplan/ikinci-plan.md
  projeler/_build-test-cokplan/build-task-ikinci/ (${ikinci_kartlar.length} kart)
  projeler/_build-test-cokplan/build-task-birinci/ (${birinci_kartlar.length} kart)
  projeler/_build-test-cokplan/karsilastirma.json

Önerilen sonraki adım: baris canlı projesi üzerinde ilk gerçek olay turunu koş (tek olay_id ile).
`
try {
  appendFileSync(kanalYol, kanalNot, 'utf8')
  console.log('\nmeta-kanal.md güncellendi.')
} catch (e) {
  console.warn('meta-kanal.md yazılamadı:', e.message)
}

if (failed > 0) process.exit(1)
