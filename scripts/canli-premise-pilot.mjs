#!/usr/bin/env node
// Premise pilot — _demo-canli/genesis.md'yi okur, premise üretir, kapiPremise ile doğrular.
// Genesis pilot başarıyla tamamlanmışsa (genesis.md mevcut) bu scripti çalıştır.
// Çalıştırma: node scripts/canli-premise-pilot.mjs

import { join, resolve } from 'path'
import { readFileSync, appendFileSync, existsSync } from 'fs'
import { META_DATA_ROOT } from './config.js'
import { claudeCalistir, guvenliYaz, ScopeLockHatasi } from '../tools/canliYurutucu.mjs'
import { kapiPremise, ciplakSayiVarMi } from '../tools/planlamaKapilari.mjs'

const DEMO_NS   = join(META_DATA_ROOT, 'projeler', '_demo-canli')
const GENESIS_D = join(DEMO_NS, 'genesis.md')
const PREMISE_D = join(DEMO_NS, 'premise.md')

function yaz(s = '') { process.stdout.write(s + '\n') }

// ─────────────────────────────────────────────────────────────────────────────
// Ön koşul: genesis.md mevcut mu?
// ─────────────────────────────────────────────────────────────────────────────

if (!existsSync(GENESIS_D)) {
  yaz('HATA: genesis.md bulunamadı. Önce canli-genesis-pilot.mjs çalıştır.')
  process.exit(1)
}
const genesisIcerik = readFileSync(GENESIS_D, 'utf8')
yaz(`Genesis okundu (${genesisIcerik.length} karakter): ${GENESIS_D}`)

// ─────────────────────────────────────────────────────────────────────────────
// BÖLÜM B — Premise üretimi
// ─────────────────────────────────────────────────────────────────────────────

yaz('')
yaz('═══════════════════════════════════════════════════════════════')
yaz('BÖLÜM B — Premise üretimi (claude -p --safe-mode)')
yaz('Model: claude-sonnet-4-6 | Auth: abonelik OAuth')
yaz('═══════════════════════════════════════════════════════════════')

const PREMISE_PROMPT = `\
Premise aşaması — ürün premise belgesi üret. Türkçe yaz.

PROJE: Modüler Balkon Bahçesi Kiti — şehirde yaşayan yetişkinler için küçük balkonlara özel, mevsimlik bitki kutusu aboneliği.

GENESİS KRİTİĞİ (tamamlanan önceki aşama):
---
${genesisIcerik}
---

GÖREV: Yukarıdaki genesis kritikten elde edilen stratejik bulguları kullanarak, ürünün premise'ini dört kapı alanı için tanımla.

ÇIKTI İSKELETİ — başlıkları TAMAMEN AYNI YAZIN:

# Premise — Balkon Bahçe Aboneliği

## Kapı 1: Konu / Tür

[Ürün ne? Kategorisi ve türü net biçimde tanımla. 3-5 cümle.]

## Kapı 2: Kitle

[Hedef kitle kim? Yaşı, yaşam biçimi, motivasyonu, segmentin büyüklüğü. 3-5 cümle.]

## Kapı 3: Açı + Kredibilite

[Ürünün benzersiz açısı ve neden güvenilir? Rakiplerden farkı. 3-5 cümle.]

## Kapı 4: Transfer Vaadi

[Kullanıcı bu üründen ne kazanır? Somut transfer — öncesi/sonrası durum. 3-5 cümle.]

ZORUNLU KURALLAR:
1. Başlıkları TAM BU ŞEKİLDE yaz: "Kapı 1: Konu / Tür", "Kapı 2: Kitle", "Kapı 3: Açı + Kredibilite", "Kapı 4: Transfer Vaadi".
2. Her kapı bölümünde EN AZ 3 anlamlı cümle yaz. Boş bırakma.
3. Herhangi bir sayı yazmak zorundaysan yanına [tahmin-doğrulanacak:kaynak] ekle. Kaynaksız sayı YAZMA.
4. Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece belge içeriği.`

yaz(`Prompt gönderiliyor (${PREMISE_PROMPT.length} karakter)…`)

let sonuc
try {
  sonuc = await claudeCalistir(PREMISE_PROMPT, { model: 'claude-sonnet-4-6' })
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
yaz('BÖLÜM C — Format doğrulama (kapiPremise)')
yaz('═══════════════════════════════════════════════════════════════')

const kapiSonuc  = kapiPremise(sonuc.metin)
const sayiVar    = ciplakSayiVarMi(sonuc.metin)
const k1 = /konu\s*\/\s*tür|kapı\s*1/i.test(sonuc.metin)
const k2 = /kitle|kapı\s*2/i.test(sonuc.metin)
const k3 = /açı|kredibilite|kapı\s*3/i.test(sonuc.metin)
const k4 = /transfer|vaat|kapı\s*4/i.test(sonuc.metin)

yaz(`kapiPremise    : ${kapiSonuc.gecti ? '✓ GEÇTİ' : `✗ KALDI — ${kapiSonuc.neden}`}`)
yaz(`Kaynaksız sayı : ${sayiVar ? '✗ VAR (format kontratı ihlali)' : '✓ YOK'}`)
yaz(`Kapı 1 (konu)  : ${k1 ? '✓' : '✗'}`)
yaz(`Kapı 2 (kitle) : ${k2 ? '✓' : '✗'}`)
yaz(`Kapı 3 (açı)   : ${k3 ? '✓' : '✗'}`)
yaz(`Kapı 4 (vaat)  : ${k4 ? '✓' : '✗'}`)

const formatGecti = kapiSonuc.gecti && !sayiVar

yaz('')
if (!formatGecti) {
  yaz('FORMAT GEÇEMEDİ — premise aşaması başarısız.')
  yaz('')
  yaz('Üretilen premise (ham):')
  yaz('───────────────────────────────────────────────────────────')
  yaz(sonuc.metin)
  yaz('───────────────────────────────────────────────────────────')
  await kanalYaz(false, sonuc, kapiSonuc, sayiVar)
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
  yazmaYolu = guvenliYaz(PREMISE_D, sonuc.metin, DEMO_NS)
  yaz(`✓ Yazıldı: ${yazmaYolu}`)
} catch (e) {
  yaz(`SCOPE-LOCK HATASI (beklenmez): ${e.message}`)
  process.exit(1)
}

yaz('')
yaz('Üretilen premise:')
yaz('───────────────────────────────────────────────────────────')
yaz(sonuc.metin)
yaz('───────────────────────────────────────────────────────────')

await kanalYaz(true, sonuc, kapiSonuc, sayiVar, yazmaYolu)
yaz('')
yaz('Premise pilot tamamlandı.')

async function kanalYaz(basari, s, kapi, sayiV, dosyaYolu = null) {
  const damga = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')

  const blok = [
    ``,
    `--- [${damga}] canli-premise-pilot — ${basari ? 'BAŞARILI' : 'FORMAT HATASI'} ---`,
    ``,
    `## Auth + maliyet`,
    `- Model: ${s.model} | --safe-mode abonelik OAuth`,
    `- Süre: ${(s.sure_ms / 1000).toFixed(1)}s`,
    `- Maliyet: ${s.maliyet_usd !== null ? `$${s.maliyet_usd.toFixed(4)}` : '(bilinmiyor)'}`,
    ``,
    `## Format doğrulama`,
    `- kapiPremise: ${kapi.gecti ? 'GEÇTİ' : `KALDI — ${kapi.neden}`}`,
    `- Kaynaksız sayı: ${sayiV ? 'VAR (ihlal)' : 'YOK ✓'}`,
    ``,
    `## Artefakt`,
    dosyaYolu ? `- Premise yolu: ${dosyaYolu}` : `- (dosya yazılmadı — format hatası)`,
    ``,
    basari
      ? `Önerilen sonraki adım: araştırma aşamasını ekle; kapiArastirma tüm sayıları [doğrulanmış]/[tahmin]/[eksik] ile etiketleme kuralını prompt'a ekle.`
      : `Önerilen sonraki adım: premise prompt'unu format hatasına göre güncelle, pilot'u yeniden çalıştır.`,
  ].join('\n')

  try {
    appendFileSync(kanalYol, blok, 'utf8')
    yaz('meta-kanal.md güncellendi.')
  } catch (e) {
    yaz(`meta-kanal.md yazma hatası: ${e.message}`)
  }
}
