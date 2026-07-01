#!/usr/bin/env node
// Canlı planlama yürütücüsü — PILOT (tek aşama: genesis).
// Çalıştırma: node scripts/canli-genesis-pilot.mjs
//
// BÖLÜM A — Scope-lock izolasyon kanıtı (namespace-dışı yazma reddi)
// BÖLÜM B — Auth + genesis üretimi (claude -p --safe-mode abonelik OAuth)
// BÖLÜM C — Format doğrulama (kapiGenesis + kullanıcı format kontratı)
// BÖLÜM D — Güvenli yazma (format geçerse _demo-canli/genesis.md)
// BÖLÜM E — meta-kanal.md raporu

import { join, resolve } from 'path'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { META_DATA_ROOT } from './config.js'
import { scopeKontrol, claudeCalistir, guvenliYaz, ScopeLockHatasi } from '../tools/canliYurutucu.mjs'
import { kapiGenesis, ciplakSayiVarMi } from '../tools/planlamaKapilari.mjs'

// Demo namespace — sadece buraya yazılır
const DEMO_NS = join(META_DATA_ROOT, 'projeler', '_demo-canli')
const GENESIS_HEDEF = join(DEMO_NS, 'genesis.md')

// Rapor tamponu (konsol + kanal için)
const satirlar = []
function yaz(s = '') { satirlar.push(s); process.stdout.write(s + '\n') }

// ─────────────────────────────────────────────────────────────────────────────
// BÖLÜM A — Scope-lock izolasyon kanıtı
// ─────────────────────────────────────────────────────────────────────────────

yaz('═══════════════════════════════════════════════════════════════')
yaz('BÖLÜM A — Scope-lock izolasyon kanıtı')
yaz('İzinli namespace: ' + DEMO_NS)
yaz('═══════════════════════════════════════════════════════════════')

const testler = [
  {
    ad: 'CANLIDA — gerçek proje (baris)',
    hedef: join(META_DATA_ROOT, 'projeler', 'baris', 'genesis.md'),
    bekle: 'REDDET',
  },
  {
    ad: 'CANLIDA — başka demo (_demo-foya)',
    hedef: join(META_DATA_ROOT, 'projeler', '_demo-foya', 'genesis.md'),
    bekle: 'REDDET',
  },
  {
    ad: 'CANLIDA — başka demo (_demo-pol)',
    hedef: join(META_DATA_ROOT, 'projeler', '_demo-pol', 'genesis.md'),
    bekle: 'REDDET',
  },
  {
    ad: 'İZİNLİ — demo namespace (_demo-canli)',
    hedef: GENESIS_HEDEF,
    bekle: 'İZİN',
  },
]

let scopeHataVar = false
for (const t of testler) {
  try {
    scopeKontrol(t.hedef, DEMO_NS)
    if (t.bekle === 'REDDET') {
      yaz(`  ✗ BAŞARISIZ [${t.ad}]: İzin VERDİ ama REDDETMESI gerekiyordu`)
      scopeHataVar = true
    } else {
      yaz(`  ✓ DOĞRU: İzin verildi [${t.ad}]`)
    }
  } catch (e) {
    if (e instanceof ScopeLockHatasi) {
      if (t.bekle === 'REDDET') {
        yaz(`  ✓ DOĞRU: Reddedildi [${t.ad}]`)
      } else {
        yaz(`  ✗ BAŞARISIZ [${t.ad}]: REDDETMELIYDI ama reddetti`)
        scopeHataVar = true
      }
    } else {
      throw e
    }
  }
}

yaz('')
if (scopeHataVar) {
  yaz('HATA: Scope-lock izolasyon testi başarısız. Devam edilmiyor.')
  process.exit(1)
}
yaz('Scope-lock izolasyon kanıtlandı — 4/4 beklenen sonuç.')

// ─────────────────────────────────────────────────────────────────────────────
// BÖLÜM B — Genesis üretimi
// ─────────────────────────────────────────────────────────────────────────────

yaz('')
yaz('═══════════════════════════════════════════════════════════════')
yaz('BÖLÜM B — Genesis üretimi (claude -p --safe-mode)')
yaz('Model: claude-sonnet-4-6 | Auth: abonelik OAuth')
yaz('═══════════════════════════════════════════════════════════════')

const GENESIS_PROMPT = `\
Genesis aşaması — pedigree-kritik belgesi üret. Türkçe yaz.

PROJE: Modüler Balkon Bahçesi Kiti — şehirde yaşayan yetişkinler için küçük balkonlara özel, mevsimlik bitki kutusu aboneliği. Bitki + toprak + kap + bakım rehberi içerir.

GÖREV: Bu ürün fikrine en yakın 2 BAĞIMSIZ rakip veya emsal analiz et. Her biri için güçlü yanını, yapısal kırılganlığını ve bize açılan fırsatı yaz.

ÇIKTI İSKELETİ — başlıkları kelimesi kelimesine koru:

# Genesis — Balkon Bahçe Aboneliği

## Soy 1: [Birinci rakip ya da emsal — gerçek veya hipotetik ürün adı]

[2-3 cümle: ne yapıyor, kime hitap ediyor, nerede başarılı]

[2-3 cümle: yapısal kırılganlığı — bizim fırsatımızla ilişkili tarafı]

[YAPISAL BULGU] Tek cümle — somut yapısal zayıflık.
[REÇETE] Tek cümle — bu zayıflıktan bizim avantajımıza açılan kapı.

## Soy 2: [İkinci rakip ya da emsal — ilkinden farklı kategori veya yaklaşım]

[2-3 cümle analiz]

[2-3 cümle kırılganlık]

[YAPISAL BULGU] Tek cümle.
[REÇETE] Tek cümle.

## Sentez

[2-3 cümle: genesis kritikten çıkan ana stratejik yön]

ZORUNLU KURALLAR — kontrol edeceğim, uymayan reddetilir:
1. "Soy 1" ve "Soy 2" başlıklarını TAMAMEN AYNI ŞEKİLDE yaz (büyük-küçük, boşluk dahil).
2. [YAPISAL BULGU] ve [REÇETE] satırlarını TAM BU ŞEKİLDE yaz: köşeli parantez, büyük harf.
3. Herhangi bir sayı veya yüzde YAZMAK ZORUNDAYSAN yanına [tahmin-doğrulanacak:kaynak-adı] ekle. Kaynaksız sayı YAZMA.
4. Belgenin başına veya sonuna "İşte belge:", özet, açıklama EKLEME. Sadece belge içeriği.`

yaz(`Prompt gönderiliyor (${GENESIS_PROMPT.length} karakter)…`)

let sonuc
try {
  sonuc = await claudeCalistir(GENESIS_PROMPT, { model: 'claude-sonnet-4-6' })
} catch (e) {
  yaz(`HATA: ${e.message}`)
  process.exit(1)
}

yaz(`Süre  : ${(sonuc.sure_ms / 1000).toFixed(1)}s`)
yaz(`Maliyet: ${sonuc.maliyet_usd !== null ? `$${sonuc.maliyet_usd.toFixed(4)}` : '(bilinmiyor)'}`)
yaz(`Çıktı uzunluğu: ${sonuc.metin.length} karakter`)

// ─────────────────────────────────────────────────────────────────────────────
// BÖLÜM C — Format doğrulama
// ─────────────────────────────────────────────────────────────────────────────

yaz('')
yaz('═══════════════════════════════════════════════════════════════')
yaz('BÖLÜM C — Format doğrulama')
yaz('═══════════════════════════════════════════════════════════════')

// 1. Mevcut kapı
const kapiSonuc = kapiGenesis(sonuc.metin)
yaz(`kapiGenesis : ${kapiSonuc.gecti ? '✓ GEÇTİ' : `✗ KALDI — ${kapiSonuc.neden}`}`)

// 2. Kullanıcı format kontratı: kaynaksız sayı yok
const sayiVar = ciplakSayiVarMi(sonuc.metin)
yaz(`Kaynaksız sayı: ${sayiVar ? '✗ VAR (format kontratı ihlali)' : '✓ YOK'}`)

// 3. Soy başlıklarını logla
const soy1Var = /soy\s*1/i.test(sonuc.metin)
const soy2Var = /soy\s*2/i.test(sonuc.metin)
const yapBulgu = /yapisal[- ]?bulgu|YAPISAL BULGU/i.test(sonuc.metin)
const recete = /reçete|REÇETE/i.test(sonuc.metin)
yaz(`Soy 1 başlığı  : ${soy1Var ? '✓' : '✗'}`)
yaz(`Soy 2 başlığı  : ${soy2Var ? '✓' : '✗'}`)
yaz(`[YAPISAL BULGU]: ${yapBulgu ? '✓' : '✗'}`)
yaz(`[REÇETE]        : ${recete ? '✓' : '✗'}`)

const formatGecti = kapiSonuc.gecti && !sayiVar

yaz('')
if (!formatGecti) {
  yaz('FORMAT GEÇEMEDİ — görev durduruluyor (premise aşamasına geçilmiyor).')
  yaz('')
  yaz('Üretilen genesis (ham):')
  yaz('───────────────────────────────────────────────────────────')
  yaz(sonuc.metin)
  yaz('───────────────────────────────────────────────────────────')
  await kanalYaz(false, sonuc)
  process.exit(0)
}

yaz('FORMAT GEÇTİ — dosyaya yazılıyor.')

// ─────────────────────────────────────────────────────────────────────────────
// BÖLÜM D — Güvenli yazma
// ─────────────────────────────────────────────────────────────────────────────

yaz('')
yaz('═══════════════════════════════════════════════════════════════')
yaz('BÖLÜM D — Güvenli yazma')
yaz('═══════════════════════════════════════════════════════════════')

let yazmaYolu
try {
  yazmaYolu = guvenliYaz(GENESIS_HEDEF, sonuc.metin, DEMO_NS)
  yaz(`✓ Yazıldı: ${yazmaYolu}`)
} catch (e) {
  yaz(`SCOPE-LOCK YAKALANDI (beklenmez): ${e.message}`)
  process.exit(1)
}

yaz('')
yaz('Üretilen genesis içeriği:')
yaz('───────────────────────────────────────────────────────────')
yaz(sonuc.metin)
yaz('───────────────────────────────────────────────────────────')

// ─────────────────────────────────────────────────────────────────────────────
// BÖLÜM E — meta-kanal.md raporu
// ─────────────────────────────────────────────────────────────────────────────

await kanalYaz(true, sonuc, yazmaYolu)

async function kanalYaz(basari, s, dosyaYolu = null) {
  const damga = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')

  const blok = [
    ``,
    `--- [${damga}] canli-genesis-pilot — ${basari ? 'BAŞARILI' : 'FORMAT HATASI'} ---`,
    ``,
    `## Scope-lock izolasyon`,
    `- projeler/baris/genesis.md → REDDET ✓`,
    `- projeler/_demo-foya/genesis.md → REDDET ✓`,
    `- projeler/_demo-pol/genesis.md → REDDET ✓`,
    `- projeler/_demo-canli/genesis.md → İZİN ✓`,
    ``,
    `## Auth + maliyet`,
    `- Mod: claude -p --safe-mode (abonelik OAuth, ANTHROPIC_API_KEY kullanılmadı)`,
    `- Model: ${s.model}`,
    `- Süre: ${(s.sure_ms / 1000).toFixed(1)}s`,
    `- Maliyet: ${s.maliyet_usd !== null ? `$${s.maliyet_usd.toFixed(4)}` : '(bilinmiyor)'}`,
    ``,
    `## Format doğrulama`,
    `- kapiGenesis: ${kapiSonuc.gecti ? 'GEÇTİ' : `KALDI — ${kapiSonuc.neden}`}`,
    `- Kaynaksız sayı: ${sayiVar ? 'VAR (ihlal)' : 'YOK ✓'}`,
    `- Soy 1: ${soy1Var ? '✓' : '✗'} | Soy 2: ${soy2Var ? '✓' : '✗'} | [YAPISAL BULGU]: ${yapBulgu ? '✓' : '✗'} | [REÇETE]: ${recete ? '✓' : '✗'}`,
    ``,
    `## Artefakt`,
    dosyaYolu ? `- Genesis yolu: ${dosyaYolu}` : `- (dosya yazılmadı — format hatası)`,
    ``,
    basari
      ? `Önerilen sonraki adım: aynı yürütücüyü premise aşamasına genişlet; kapiPremise format kontratını prompt'a ekle.`
      : `Önerilen sonraki adım: format hatasını incele, prompts güncelle, genesis pilot'u yeniden çalıştır.`,
  ].join('\n')

  try {
    appendFileSync(kanalYol, blok, 'utf8')
    yaz('')
    yaz('meta-kanal.md güncellendi.')
  } catch (e) {
    yaz(`meta-kanal.md yazma hatası: ${e.message}`)
  }
}

yaz('')
yaz('Pilot tamamlandı.')
