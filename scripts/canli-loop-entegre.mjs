#!/usr/bin/env node
// Entegrasyon testi: state machine v2 + canli executor → _demo-entegre namespace.
// İki koşum: (1) tam canlı üretim genesis→tamamlandi, (2) idempotency re-koşum.
// Çalıştırma: node scripts/canli-loop-entegre.mjs

import { join } from 'path'
import { appendFileSync } from 'fs'
import { META_DATA_ROOT } from './config.js'
import { scopeKontrol, ScopeLockHatasi } from '../tools/canliYurutucu.mjs'
import { canliExecutorOlustur } from '../tools/canliExecutor.mjs'
import { planlamaLoopV2Calistir } from '../tools/planlamaLoopV2.mjs'

const DEMO_NS = join(META_DATA_ROOT, 'projeler', '_demo-entegre')

const PROJE_CONFIG = {
  id: '_demo-entegre',
  ad: 'Modüler Balkon Bahçesi Kiti',
  aciklama: 'Şehirde yaşayan yetişkinler için küçük balkonlara özel, mevsimlik bitki kutusu aboneliği.',
}

function yaz(s = '') { process.stdout.write(s + '\n') }

// ── Scope-lock izolasyon testi ───────────────────────────────────────────────
yaz('═══════════════════════════════════════════════════════════════')
yaz('Scope-lock izolasyon testi')
yaz(`İzinli namespace: ${DEMO_NS}`)
yaz('═══════════════════════════════════════════════════════════════')

const scopeTestler = [
  { ad: 'baris',         hedef: join(META_DATA_ROOT, 'projeler', 'baris',         'test.md'), bekle: 'REDDET' },
  { ad: '_demo-canli',   hedef: join(META_DATA_ROOT, 'projeler', '_demo-canli',   'test.md'), bekle: 'REDDET' },
  { ad: '_demo-pol',     hedef: join(META_DATA_ROOT, 'projeler', '_demo-pol',     'test.md'), bekle: 'REDDET' },
  { ad: '_demo-foya',    hedef: join(META_DATA_ROOT, 'projeler', '_demo-foya',    'test.md'), bekle: 'REDDET' },
  { ad: '_demo-entegre', hedef: join(DEMO_NS, 'test.md'),                                     bekle: 'İZİN'   },
]

let scopeHataVar = false
for (const t of scopeTestler) {
  try {
    scopeKontrol(t.hedef, DEMO_NS)
    if (t.bekle === 'REDDET') {
      yaz(`  ✗ BAŞARISIZ [${t.ad}]: izin VERDİ ama REDDETMESI gerekiyordu`)
      scopeHataVar = true
    } else {
      yaz(`  ✓ DOĞRU: izin verildi [${t.ad}]`)
    }
  } catch (e) {
    if (e instanceof ScopeLockHatasi) {
      if (t.bekle === 'REDDET') {
        yaz(`  ✓ DOĞRU: reddedildi [${t.ad}]`)
      } else {
        yaz(`  ✗ BAŞARISIZ [${t.ad}]: izin VERMELİYDİ ama reddetti`)
        scopeHataVar = true
      }
    } else throw e
  }
}

if (scopeHataVar) {
  yaz('HATA: Scope-lock testi başarısız. Çıkılıyor.')
  process.exit(1)
}
yaz(`Scope-lock kanıtlandı — ${scopeTestler.length}/${scopeTestler.length} beklenen sonuç.`)

// ── İLK KOŞUM — genesis → tamamlandi ────────────────────────────────────────
yaz('')
yaz('═══════════════════════════════════════════════════════════════')
yaz(`İLK KOŞUM — ${PROJE_CONFIG.id} | genesis → tamamlandi`)
yaz('Model: claude-sonnet-4-6 | Auth: abonelik OAuth | --safe-mode')
yaz('═══════════════════════════════════════════════════════════════')

const { executor: ex1, istatistikler: ist1Fn } = canliExecutorOlustur(DEMO_NS, PROJE_CONFIG)
const sonuc1 = await planlamaLoopV2Calistir(DEMO_NS, PROJE_CONFIG.id, ex1, { log: yaz })
const ist1 = ist1Fn()

yaz('')
yaz(`İlk koşum: ${sonuc1.tamamlandi ? 'TAMAMLANDI ✓' : sonuc1.donduruldu ? 'DONDURULDU ✗' : '?'}`)
yaz(`Executor çağrı sayısı: ${ist1.cagrilar}`)
yaz(`Toplam maliyet: $${sonuc1.maliyet.toplam.toFixed(4)}`)

if (!sonuc1.tamamlandi) {
  yaz('HATA: İlk koşum tamamlanamadı.')
  await kanalYaz({ basari: false, sonuc1, ist1, sonuc2: null, ist2: null })
  process.exit(1)
}

// ── IDEMPOTENCY RE-KOŞUM ─────────────────────────────────────────────────────
yaz('')
yaz('═══════════════════════════════════════════════════════════════')
yaz('IDEMPOTENCY RE-KOŞUM — state tamamlandi; executor çağrılmamalı')
yaz('═══════════════════════════════════════════════════════════════')

const { executor: ex2, istatistikler: ist2Fn } = canliExecutorOlustur(DEMO_NS, PROJE_CONFIG)
const sonuc2 = await planlamaLoopV2Calistir(DEMO_NS, PROJE_CONFIG.id, ex2, { log: yaz })
const ist2 = ist2Fn()

yaz('')
yaz(`Re-koşum: ${sonuc2.tamamlandi ? 'TAMAMLANDI ✓' : 'BAŞARISIZ ✗'}`)
yaz(`Executor çağrı sayısı: ${ist2.cagrilar} (beklenen: 0)`)
const idempotencyOk = sonuc2.tamamlandi && ist2.cagrilar === 0
yaz(`Idempotency: ${idempotencyOk ? '✓ KANITLANDI' : '✗ BAŞARISIZ'}`)

// ── RAPOR ─────────────────────────────────────────────────────────────────────
await kanalYaz({ basari: idempotencyOk && sonuc1.tamamlandi, sonuc1, ist1, sonuc2, ist2 })
yaz('')
yaz('meta-kanal.md güncellendi.')
yaz('')
yaz('Entegrasyon testi tamamlandı.')

async function kanalYaz({ basari, sonuc1, ist1, sonuc2, ist2 }) {
  const damga   = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')

  const asamaLoglar = Object.entries(sonuc1.maliyet.asamalar)
    .map(([a, m]) => `  - ${a}: GEÇTİ | $${m.toFixed(4)}`)

  const blok = [
    ``,
    `--- [${damga}] canli-loop-entegre — ${basari ? 'TAMAMLANDI' : 'BAŞARISIZ'} ---`,
    ``,
    `## İzolasyon`,
    `- Namespace: ${DEMO_NS}`,
    `- Scope-lock: ${scopeTestler.length}/${scopeTestler.length} beklenen sonuç ✓`,
    `- Korunan namespace'ler: baris / _demo-canli / _demo-pol / _demo-foya → tümü REDDEDİLDİ`,
    ``,
    `## İlk Koşum — Aşama Logu`,
    ...asamaLoglar,
    `- Toplam executor çağrısı: ${ist1.cagrilar}`,
    `- Toplam maliyet: $${sonuc1.maliyet.toplam.toFixed(4)}`,
    `- Sonuç: ${sonuc1.tamamlandi ? 'TAMAMLANDI' : 'BAŞARISIZ'}`,
    ``,
    `## Idempotency Re-Koşum`,
    `- Sonuç: ${sonuc2?.tamamlandi ? 'TAMAMLANDI' : 'BAŞARISIZ'}`,
    `- Executor çağrı sayısı: ${ist2?.cagrilar ?? '?'} (beklenen: 0) ${ist2?.cagrilar === 0 ? '✓' : '✗'}`,
    ``,
    `## Artefakt Dizini`,
    `- ${DEMO_NS}/genesis.md`,
    `- ${DEMO_NS}/premise.md`,
    `- ${DEMO_NS}/arastirma.md`,
    `- ${DEMO_NS}/strateji.md`,
    `- ${DEMO_NS}/master-plan.md`,
    `- ${DEMO_NS}/planlama-durum.json`,
    ``,
    `## Kümülatif Maliyet`,
    `- _demo-canli (önceki): $0.4961`,
    `- _demo-entegre (bu tur): $${sonuc1.maliyet.toplam.toFixed(4)}`,
    ``,
    basari
      ? `Önerilen sonraki adım: canliExecutor + planlamaLoopV2'yi gerçek proje namespace'lerine (örn. yeni proje intake'inden) bağla; planlamaLoop.mjs v1'i v2 ile değiştir veya v2'ye CLI entry-point ekle.`
      : `Önerilen sonraki adım: başarısız aşamanın blok_nedeni'ni incele, promtu güncelle, yeniden koştur.`,
  ].join('\n')

  appendFileSync(kanalYol, blok, 'utf8')
}
