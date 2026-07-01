#!/usr/bin/env node
// Genesis v2 pilot — yeni aday-seti + set-eleştirisi kapısını doğrula.
// YALNIZ genesis aşaması; loop çalıştırmaz.
// Namespace: _demo-genesis-v2 (taze, diğer namespace'lere dokunmaz).
// Çalıştırma: node scripts/canli-genesis-v2-pilot.mjs

import { join } from 'path'
import { appendFileSync } from 'fs'
import { META_DATA_ROOT } from './config.js'
import { scopeKontrol, ScopeLockHatasi } from '../tools/canliYurutucu.mjs'
import { canliExecutorOlustur } from '../tools/canliExecutor.mjs'
import { kapiGenesis, ciplakSayiVarMi } from '../tools/planlamaKapilari.mjs'

const DEMO_NS = join(META_DATA_ROOT, 'projeler', '_demo-genesis-v2')

const PROJE_CONFIG = {
  id: '_demo-genesis-v2',
  ad: 'Modüler Balkon Bahçesi Kiti',
  aciklama: 'Şehirde yaşayan yetişkinler için küçük balkonlara özel, mevsimlik bitki kutusu aboneliği.',
}

function yaz(s = '') { process.stdout.write(s + '\n') }

// ── Scope-lock izolasyon testi ───────────────────────────────────────────────
yaz('═══════════════════════════════════════════════════════════════')
yaz('Genesis v2 Pilot — Scope-lock')
yaz(`Namespace: ${DEMO_NS}`)
yaz('═══════════════════════════════════════════════════════════════')

const scopeTestler = [
  { ad: 'baris',           hedef: join(META_DATA_ROOT, 'projeler', 'baris',           'test.md'), bekle: 'REDDET' },
  { ad: '_demo-canli',     hedef: join(META_DATA_ROOT, 'projeler', '_demo-canli',     'test.md'), bekle: 'REDDET' },
  { ad: '_demo-entegre',   hedef: join(META_DATA_ROOT, 'projeler', '_demo-entegre',   'test.md'), bekle: 'REDDET' },
  { ad: '_demo-genesis-v2',hedef: join(DEMO_NS, 'test.md'),                                        bekle: 'İZİN'   },
]

let scopeHataVar = false
for (const t of scopeTestler) {
  try {
    scopeKontrol(t.hedef, DEMO_NS)
    yaz(`  ${t.bekle === 'İZİN' ? '✓' : '✗'} [${t.ad}]: ${t.bekle === 'İZİN' ? 'izin verildi (doğru)' : 'izin VERDİ — HATA'}`)
    if (t.bekle === 'REDDET') scopeHataVar = true
  } catch (e) {
    if (e instanceof ScopeLockHatasi) {
      yaz(`  ${t.bekle === 'REDDET' ? '✓' : '✗'} [${t.ad}]: ${t.bekle === 'REDDET' ? 'reddedildi (doğru)' : 'reddedildi — HATA'}`)
      if (t.bekle === 'İZİN') scopeHataVar = true
    } else throw e
  }
}

if (scopeHataVar) { yaz('HATA: Scope-lock testi başarısız.'); process.exit(1) }
yaz(`Scope-lock: ${scopeTestler.length}/${scopeTestler.length} ✓`)

// ── Genesis üretimi ──────────────────────────────────────────────────────────
yaz('')
yaz('═══════════════════════════════════════════════════════════════')
yaz('Genesis üretimi — aday-seti + set-eleştirisi semantiği')
yaz('Model: claude-sonnet-4-6 | Auth: abonelik OAuth | --safe-mode')
yaz('═══════════════════════════════════════════════════════════════')

const { executor } = canliExecutorOlustur(DEMO_NS, PROJE_CONFIG)

let sonuc
try {
  sonuc = await executor('genesis')
} catch (e) {
  yaz(`HATA: ${e.message}`)
  process.exit(1)
}

yaz(`Süre  : ${(sonuc.sure_ms / 1000).toFixed(1)}s`)
yaz(`Maliyet: $${sonuc.maliyet_usd?.toFixed(4) ?? '?'}`)
yaz(`Çıktı : ${sonuc.icerik.length} karakter`)

// ── Kapı kontrolü — her kontrol ayrı ayrı loglanır ──────────────────────────
yaz('')
yaz('═══════════════════════════════════════════════════════════════')
yaz('Kapı v2 — detaylı kontrol')
yaz('═══════════════════════════════════════════════════════════════')

const icerik = sonuc.icerik
const kontroller = [
  { ad: '§1 bölüm işareti',             ok: icerik.includes('§1') },
  { ad: '§1 aday-seti tablosu',          ok: /\|[^|\n]+\|[^|\n]+\|/.test(icerik) },
  { ad: '§2 bölüm işareti',             ok: icerik.includes('§2') },
  { ad: '§2 Soy 1 mercek',              ok: /soy\s*1/i.test(icerik) },
  { ad: '§2 Soy 2 mercek',              ok: /soy\s*2/i.test(icerik) },
  { ad: '§2 EKSİK TÜR çıktısı',         ok: icerik.includes('EKSİK TÜR') },
  { ad: '§2 PAYLAŞILAN KÖR NOKTA',       ok: icerik.includes('PAYLAŞILAN KÖR NOKTA') },
  { ad: '§2 VARLIK KALDIRACI',           ok: icerik.includes('VARLIK KALDIRACI') },
  { ad: '[yapısal-bulgu] işareti',       ok: icerik.includes('[yapısal-bulgu]') },
  { ad: '[reçete] işareti',             ok: icerik.includes('[reçete]') },
  { ad: '§3 bölüm işareti',             ok: icerik.includes('§3') },
  { ad: '§4 bölüm işareti',             ok: icerik.includes('§4') },
  { ad: '§4 birebir son satır',          ok: icerik.includes('Çıktı → Bir sonraki aşama: premise') },
  { ad: 'etiketsiz sayı YOK',           ok: !ciplakSayiVarMi(icerik) },
]

for (const k of kontroller) {
  yaz(`  ${k.ok ? '✓' : '✗'} ${k.ad}`)
}

const kapiSonuc = kapiGenesis(icerik)
const sayiVar   = ciplakSayiVarMi(icerik)
const formatGecti = kapiSonuc.gecti && !sayiVar

yaz('')
yaz(`kapiGenesis   : ${kapiSonuc.gecti ? '✓ GEÇTİ' : `✗ KALDI — ${kapiSonuc.neden}`}`)
yaz(`Etiketsiz sayı: ${sayiVar ? '✗ VAR (ihlal)' : '✓ YOK'}`)
yaz(`Genel sonuç   : ${formatGecti ? '✓ GEÇTİ' : '✗ KALDI'}`)

// ── Artefakt & rapor ─────────────────────────────────────────────────────────
yaz('')
yaz(`Dosya: ${sonuc.cikti_pointer}`)

if (!formatGecti) {
  yaz('')
  yaz('── Ham çıktı (ilk 2000 karakter) ──')
  yaz(icerik.slice(0, 2000))
  yaz('...')
}

await kanalYaz(formatGecti, sonuc, kapiSonuc, sayiVar)
yaz('')
yaz('meta-kanal.md güncellendi.')
yaz('Genesis v2 pilot tamamlandı.')

async function kanalYaz(basari, s, kapi, sayiV) {
  const damga   = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')

  const blok = [
    ``,
    `--- [${damga}] canli-genesis-v2-pilot — ${basari ? 'GEÇTİ' : 'KALDI'} ---`,
    ``,
    `## Değişen Semantik`,
    `- Önceki: rakip-analizi (Soy1/Soy2 + YAPISAL BULGU/REÇETE keywords)`,
    `- Yeni:   aday-seti + set-eleştirisi (§1 tablo · §2 EKSİK TÜR/KÖR NOKTA/VARLIK · §3 bulgular · §4 seçilen)`,
    ``,
    `## Auth + maliyet`,
    `- Model: ${s.model} | --safe-mode abonelik OAuth`,
    `- Süre: ${(s.sure_ms / 1000).toFixed(1)}s | Maliyet: $${s.maliyet_usd?.toFixed(4) ?? '?'}`,
    ``,
    `## Kapı v2 sonucu`,
    `- kapiGenesis: ${kapi.gecti ? 'GEÇTİ ✓' : `KALDI — ${kapi.neden}`}`,
    `- Etiketsiz sayı: ${sayiV ? 'VAR ✗' : 'YOK ✓'}`,
    ``,
    `## Artefakt`,
    `- ${s.cikti_pointer}`,
    ``,
    basari
      ? `Önerilen sonraki adım: premise prompt'unu genesis §4 seçilen adayı temel alacak şekilde güncelle; zincir tutarlılığını doğrula.`
      : `Önerilen sonraki adım: kapı hata mesajını incele, promtu düzelt, pilot'u yeniden çalıştır.`,
  ].join('\n')

  appendFileSync(kanalYol, blok, 'utf8')
}
