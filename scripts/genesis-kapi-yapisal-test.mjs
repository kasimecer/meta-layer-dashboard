// meta-layer-core — kapiGenesis (v3 yapısal kontrat) doğrulama paketi.
// Yalnız repo içinde çalışır: tüm fikstürler bu dosyada inline string olarak
// tanımlı. Drive'a (registry.json, projeler/*) okuma/yazma YOK; gerçek/canlı
// namespace'e dokunulmuyor.
// Koşum: node scripts/genesis-kapi-yapisal-test.mjs

import { kapiGenesis } from '../tools/planlamaKapilari.mjs'

// ── Test çerçevesi (scripts/planlama-test-runner.mjs ile aynı konvansiyon) ──
let gecti = 0, kaldi = 0

function ok(ad, kosul, ekBilgi = '') {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
}

function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

// ── İYİ-BİÇİMLİ TABAN FİKSTÜR ────────────────────────────────────────────────
// tools/canliExecutor.mjs genesis prompt iskeletinden türetildi: §1 tablo (3
// veri satırı) → §2 Soy1+Soy2 (her biri 3 çıktı türü + 3 bulgu/reçete çifti) →
// §3 tablo (2 veri satırı) → §4 + birebir kapanış satırı.
const IYI_METIN = `# Genesis — Test Ürünü

## §1 — Aday Seti

| # | Aday Adı | Yaklaşım Özeti | Kilit Varsayım |
|---|----------|----------------|-----------------|
| 1 | Aday A | Birinci yaklaşım açıklaması burada yer alır. | Kullanıcılar bunu ister. |
| 2 | Aday B | İkinci yaklaşım açıklaması burada yer alır. | Maliyet düşük kalır. |
| 3 | Aday C | Üçüncü yaklaşım açıklaması burada yer alır. | Pazar hazırdır. |

## §2 — Set Eleştirisi

### Soy 1: Operasyonel kısıt merceği

**EKSİK TÜR:** Sette hiç temsil edilmeyen bir yaklaşım türü.
[yapısal-bulgu] Bu tür neden sette yok, açıklama cümlesi.
[reçete] Bu boşluktan açılan fırsat cümlesi.

**PAYLAŞILAN KÖR NOKTA:** Tüm adaylarda ortak sorgulanmamış varsayım.
[yapısal-bulgu] Bu varsayımın seti nasıl kısıtladığı.
[reçete] Varsayımı kırmanın açtığı kapı.

**VARLIK KALDIRACI:** Eldeki varlık sete yansımıyor.
[yapısal-bulgu] Hangi varlık kullanılmıyor, açıklama.
[reçete] O varlığı devreye sokan adayın şekli.

### Soy 2: Kullanıcı davranışı merceği

**EKSİK TÜR:** İkinci mercekten sette eksik kalan tür.
[yapısal-bulgu] Bu türün neden eksik kaldığına dair cümle.
[reçete] Bu boşluğun açtığı fırsat cümlesi.

**PAYLAŞILAN KÖR NOKTA:** İkinci mercekten ortak varsayım.
[yapısal-bulgu] Bu varsayımın etkisi.
[reçete] Kırılırsa açılan kapı.

**VARLIK KALDIRACI:** İkinci mercekten varlık değerlendirmesi.
[yapısal-bulgu] Kullanılmayan varlık tespiti.
[reçete] Varlığı kullanan aday şekli.

## §3 — Bulgular → Sete Yansıma

| Bulgu | Tip | Sete Etki |
|-------|-----|-----------|
| Bulgu bir açıklaması | EKSİK TÜR | Yeni aday türü eklenmeli |
| Bulgu iki açıklaması | KÖR NOKTA | Varsayım sorgulanmalı |

## §4 — Seçilen Aday

Set eleştirisinden çıkan bulgular ışığında Aday B öne çıkıyor çünkü paylaşılan kör noktayı en az taşıyan seçenek bu.

Çıktı → Bir sonraki aşama: premise
`

// ── POZİTİF TEST ──────────────────────────────────────────────────────────────
bolum('POZİTİF — iyi-biçimli artefakt GEÇER')

const pozitifSonuc = kapiGenesis(IYI_METIN)
ok('iyi-biçimli genesis kapıdan geçer', pozitifSonuc.gecti === true, pozitifSonuc.neden ?? 'gecti')

// ── NEGATİF (a) — ilk bölüm (§1) tamamen silinmiş ──────────────────────────
bolum('NEGATİF (a) — §1 (ilk bölüm) tamamen silinmiş')

const aIlkBolumSilinmis = IYI_METIN.replace(/## §1[\s\S]*?(?=## §2)/, '')
const aSonuc = kapiGenesis(aIlkBolumSilinmis)
ok('§1 silinmiş çıktı REDDEDİLİR', aSonuc.gecti === false)
ok('blok_nedeni §1 eksikliğini işaret eder', /§1/.test(aSonuc.neden ?? ''), aSonuc.neden)

// ── NEGATİF (b1) — §3 bölümü boş (tablo header+ayraç var, 0 veri satırı) ──
bolum('NEGATİF (b1) — §3 bölümü boş (0 veri satırı)')

const b1BolumBos = IYI_METIN.replace(
  /\| Bulgu bir açıklaması \| EKSİK TÜR \| Yeni aday türü eklenmeli \|\n\| Bulgu iki açıklaması \| KÖR NOKTA \| Varsayım sorgulanmalı \|\n/,
  ''
)
const b1Sonuc = kapiGenesis(b1BolumBos)
ok('§3 veri satırları kaldırıldı (mutasyon doğrulaması)', !b1BolumBos.includes('Bulgu bir açıklaması'))
ok('§3 boş tablolu çıktı REDDEDİLİR', b1Sonuc.gecti === false)
ok('blok_nedeni §3 boşluğunu işaret eder', /§3/.test(b1Sonuc.neden ?? ''), b1Sonuc.neden)

// ── NEGATİF (b2) — §4 bölümü boş (yalnız kapanış satırı, gövde içerik yok) ──
bolum('NEGATİF (b2) — §4 bölümü boş (gövde içerik yok)')

const b2BolumBos = IYI_METIN.replace(
  'Set eleştirisinden çıkan bulgular ışığında Aday B öne çıkıyor çünkü paylaşılan kör noktayı en az taşıyan seçenek bu.\n\n',
  ''
)
const b2Sonuc = kapiGenesis(b2BolumBos)
ok('§4 gövde içeriği kaldırıldı (mutasyon doğrulaması)', !b2BolumBos.includes('Aday B öne çıkıyor'))
ok('§4 boş gövdeli çıktı REDDEDİLİR', b2Sonuc.gecti === false)
ok('blok_nedeni §4 boşluğunu işaret eder', /§4/.test(b2Sonuc.neden ?? ''), b2Sonuc.neden)

// ── NEGATİF (c1) — §1 sıfır aday (yalnız tablo başlığı + ayraç satırı) ─────
bolum('NEGATİF (c1) — §1 sıfır aday (header+ayraç var, veri satırı yok)')

const c1SifirAday = IYI_METIN.replace(
  /\| 1 \| Aday A[\s\S]*?Pazar hazırdır\. \|\n/,
  ''
)
const c1Sonuc = kapiGenesis(c1SifirAday)
ok('§1 veri satırları kaldırıldı (mutasyon doğrulaması)', !c1SifirAday.includes('Kullanıcılar bunu ister.'))
ok('§1 sıfır-aday çıktı REDDEDİLİR', c1Sonuc.gecti === false)
ok('blok_nedeni §1 aday sayısını işaret eder ("bulunan: 0")', (c1Sonuc.neden ?? '').includes('bulunan: 0'), c1Sonuc.neden)

// ── NEGATİF (c2) — §1 tek aday (boş değil ama "birden fazla" değil) ───────
bolum('NEGATİF (c2) — §1 tek aday (boş değil, tek-aday)')

const c2TekAday = IYI_METIN.replace(
  /\| 2 \| Aday B[\s\S]*?Pazar hazırdır\. \|\n/,
  ''
)
const c2Sonuc = kapiGenesis(c2TekAday)
ok('§1 ikinci+üçüncü aday kaldırıldı, biri kaldı (mutasyon doğrulaması)',
  c2TekAday.includes('Kullanıcılar bunu ister.') &&
  !c2TekAday.includes('Maliyet düşük kalır.') &&
  !c2TekAday.includes('Pazar hazırdır.'))
ok('§1 tek-aday çıktı REDDEDİLİR', c2Sonuc.gecti === false)
ok('blok_nedeni §1 aday sayısını işaret eder ("bulunan: 1")', (c2Sonuc.neden ?? '').includes('bulunan: 1'), c2Sonuc.neden)

// ── NEGATİF (d) — set-eleştirisi eksik (Soy 2'de VARLIK KALDIRACI yok) ─────
bolum('NEGATİF (d) — §2 set-eleştirisi eksik (Soy 2: VARLIK KALDIRACI silinmiş)')

const dElestiriEksik = IYI_METIN.replace(
  '**VARLIK KALDIRACI:** İkinci mercekten varlık değerlendirmesi.\n[yapısal-bulgu] Kullanılmayan varlık tespiti.\n[reçete] Varlığı kullanan aday şekli.\n\n',
  ''
)
const dSonuc = kapiGenesis(dElestiriEksik)
ok('Soy 2 VARLIK KALDIRACI bloğu kaldırıldı (mutasyon doğrulaması)',
  !dElestiriEksik.includes('Kullanılmayan varlık tespiti'))
ok('§2 eksik set-eleştirisi çıktı REDDEDİLİR', dSonuc.gecti === false)
ok('blok_nedeni Soy 2 + VARLIK KALDIRACI işaret eder',
  /Soy 2/.test(dSonuc.neden ?? '') && /VARLIK KALDIRACI/.test(dSonuc.neden ?? ''), dSonuc.neden)

// ── NEGATİF (e) — bölüm sırası bozuk (§4 §1'den önce) ──────────────────────
bolum('NEGATİF (e) — bölüm sırası bozuk (ek kontrol: sıra zorunluluğu)')

const eSiraBozuk = IYI_METIN.replace('## §4', '## §0-PRE').replace('## §1', '## §4').replace('## §0-PRE', '## §1')
const eSonuc = kapiGenesis(eSiraBozuk)
ok('§1/§4 başlıkları yer değiştirdi (mutasyon doğrulaması)', eSiraBozuk.indexOf('§4') < eSiraBozuk.indexOf('§1'))
ok('sırası bozuk çıktı REDDEDİLİR', eSonuc.gecti === false)
ok('blok_nedeni sıra bozukluğunu işaret eder', /sıra/.test(eSonuc.neden ?? ''), eSonuc.neden)

// ── Özet ────────────────────────────────────────────────────────────────────
bolum('SONUÇ')
console.log(`${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
