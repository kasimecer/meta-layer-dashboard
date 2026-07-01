#!/usr/bin/env node
// Kalan planlama aşamaları: araştırma → strateji → master-plan.
// _demo-canli namespace'inde çalışır; scope-lock aktif.
// Her aşama kapıdan geçmezse durur ve bildirir.
// Çalıştırma: node scripts/canli-kalan-asamalar.mjs

import { join } from 'path'
import { readFileSync, appendFileSync, existsSync } from 'fs'
import { META_DATA_ROOT } from './config.js'
import { claudeCalistir, guvenliYaz, ScopeLockHatasi } from '../tools/canliYurutucu.mjs'
import { kapiArastirma, kapiStrateji, kapiMasterPlan, ciplakSayiVarMi } from '../tools/planlamaKapilari.mjs'

const DEMO_NS = join(META_DATA_ROOT, 'projeler', '_demo-canli')

function oku(dosya) {
  const yol = join(DEMO_NS, dosya)
  if (!existsSync(yol)) throw new Error(`Önceki aşama bulunamadı: ${yol}`)
  return readFileSync(yol, 'utf8')
}
function yaz(s = '') { process.stdout.write(s + '\n') }

// ─── Sayı etiket kuralını açıklayan blok (tüm promtlarda kullanılır) ────────
const SAYI_KURALI = `\
SAYILAR İÇİN KRİTİK KURAL — ihlal → belge kapıdan geri döner:
Rakam içeren her satırda AYNI SATIRDA bir etiket OLMAK ZORUNDA.
Kapsam: %, milyon, milyar, bin, ₺, ay, gün, saat, hafta + ondalıklı sayılar + 4+ haneli sayılar (yıllar dahil).

Kabul edilen etiket biçimleri:
  [doğrulanmış:kaynak-adı]         — gerçek kaynağa dayalı veri
  [tahmin-doğrulanacak:kaynak-adı] — tahmini; doğrulama gerektirir
  [eksik]                          — veri bilinmiyor
  [metadata:2026-06]               — yıl / tarih meta bilgisi

Örnekler:
  ✓ Abonelik pazar büyüme oranı [tahmin-doğrulanacak:McKinsey-abonelik-2024] yıllık %18 civarındadır.
  ✓ Kutu başına hedef aylık gelir 350₺ [tahmin-doğrulanacak:rakip-fiyat-kıyaslaması].
  ✓ Pilot başlangıç tarihi [metadata:2026-09].
  ✓ Balkonlu konut verisi [eksik] — TÜİK araştırması gerekli.
  ✗ Pazar büyümesi yıllık %18'dir.         ← etiket yok
  ✗ Hedef: 2026 yılına kadar 1.500 abone. ← 2026 (4 hane) etiketsiz
  ✗ Kutu fiyatı 350₺.                     ← etiket yok

Tablo satırlarında da kural aynı; her hücredeki rakam etiketi aynı satırda taşımalı.`

// ─── Prompt üreticiler ────────────────────────────────────────────────────────

function arastirmaPromptUret(genesis, premise) {
  return `\
Araştırma aşaması — pazar ve rekabet araştırması belgesi üret. Türkçe yaz.

PROJE: Modüler Balkon Bahçesi Kiti — şehirde yaşayan yetişkinler için mevsimlik bitki kutusu aboneliği.

BAĞLAM — önceki aşamalar:
<genesis>
${genesis}
</genesis>
<premise>
${premise}
</premise>

GÖREV: Beş başlık altında araştırma belgesi üret. Her başlıkta elde edilen bulgular, tahminler ve eksik veri noktaları belirtilmeli.

ÇIKTI İSKELETİ — başlıkları TAMAMEN AYNI YAZIN:

# Araştırma — Balkon Bahçe Aboneliği

## 1. Pazar Büyüklüğü ve Trend

[Türkiye abonelik kutusu pazarı, bahçe/bitki e-ticareti trendi, büyüme oranları. 4-6 cümle.]

## 2. Rakip Ekosistemi

[Genesis'te tanımlanan ve diğer global/yerel rakipler. Fiyat + model karşılaştırması. 4-6 cümle.]

## 3. Hedef Kitle Araştırması

[Şehirli balkon sahibi yetişkin — segment büyüklüğü, davranış, satın alma motivasyonu. 4-6 cümle.]

## 4. Fiyatlama Kıyaslaması

[Abonelik kutularında kıyaslama. Müşteri ödeme istekliliği (WTP) tahminleri. 4-6 cümle.]

## 5. Tedarik ve Operasyonel Maliyet Tahmini

[Bitki tedariki, lojistik, ambalaj maliyeti tahminleri. 4-6 cümle.]

${SAYI_KURALI}

Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece belge içeriği.`
}

function stratejiPromptUret(arastirma) {
  return `\
Strateji aşaması — ürün ve iş modeli strateji belgesi üret. Türkçe yaz.

PROJE: Modüler Balkon Bahçesi Kiti — şehirde yaşayan yetişkinler için mevsimlik bitki kutusu aboneliği.

BAĞLAM — araştırma aşaması bulguları:
<arastirma>
${arastirma}
</arastirma>

GÖREV: Araştırma bulgularına dayanan strateji belgesi üret. Araştırmada çıkan verileri kullan; yeni kaynaksız figür EKLEME.

ÇIKTI İSKELETİ — başlıkları TAMAMEN AYNI YAZIN:

# Strateji — Balkon Bahçe Aboneliği

## 1. Konumlandırma

[Rakip boşluklarına göre farklılaşma pozisyonu. 3-5 cümle.]

## 2. Fiyatlama Stratejisi

[Fiyat kademesi, ilk teklif, yenileme mantığı. 3-5 cümle.]

## 3. Kanal ve Müşteri Edinme

[Birincil kanallar, organik vs. ücretli denge, edinme maliyeti hedefi. 3-5 cümle.]

## 4. Rekabet Savunması (Moat)

[Kopyalanmayı zorlaştıran operasyonel veya deneyim katmanı. 3-5 cümle.]

## 5. Temel Metrikler

[Abone büyümesi, churn hedefi, LTV/CAC hedefi. 3-5 cümle.]

${SAYI_KURALI}

Araştırma verisini referans al; araştırmada olmayan yeni kaynaksız sayı YAZMA.
Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece belge içeriği.`
}

function masterPlanPromptUret(strateji) {
  return `\
Master-plan aşaması — yürütme planı belgesi üret. Türkçe yaz.

PROJE: Modüler Balkon Bahçesi Kiti — şehirde yaşayan yetişkinler için mevsimlik bitki kutusu aboneliği.

BAĞLAM — strateji aşaması:
<strateji>
${strateji}
</strateji>

GÖREV: Stratejiye dayanan yürütme master-plan belgesi üret. Tarihleri [metadata:YYYY-AA] formatında yaz; yeni kaynaksız figür EKLEME.

ÇIKTI İSKELETİ — başlıkları TAMAMEN AYNI YAZIN:

# Master-Plan — Balkon Bahçe Aboneliği

## 1. Faz 1: Doğrulama ([metadata:2026-07] — [metadata:2026-09])

[İlk üç ay: ürün prototip, küçük pilot grup, öğrenme hedefleri. 3-5 cümle.]

## 2. Faz 2: Pilot Lansman ([metadata:2026-10] — [metadata:2026-12])

[İlk mevsimlik kutunun canlıya alınması. Başarı kriterleri. 3-5 cümle.]

## 3. Faz 3: Ölçeklendirme ([metadata:2027-01] — [metadata:2027-06])

[Büyüme hedefleri ve operasyonel genişleme. 3-5 cümle.]

## 4. Kaynak ve Bütçe Özeti

[Temel kalem kalemleri ve maliyet hedefleri. 3-5 cümle.]

## 5. Risk ve Kurtarma

[İki-üç kritik risk + kurtarma aksiyonu. 3-5 cümle.]

${SAYI_KURALI}

Tarihler için [metadata:YYYY-AA] kullan. Stratejide olmayan yeni kaynaksız sayı YAZMA.
Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece belge içeriği.`
}

// ─── Kapı + format kontrol ────────────────────────────────────────────────────

const KAPILAR_MAP = {
  arastirma: kapiArastirma,
  strateji:  kapiStrateji,
  'master-plan': kapiMasterPlan,
}

function formatKontrol(asama, metin) {
  const kapi = KAPILAR_MAP[asama](metin)
  const sayiVar = ciplakSayiVarMi(metin)
  return {
    gecti: kapi.gecti && !sayiVar,
    kapiGecti: kapi.gecti,
    kapiNeden: kapi.neden,
    sayiVar,
  }
}

// ─── Ana döngü ────────────────────────────────────────────────────────────────

const ASAMALAR = [
  { key: 'arastirma',   dosya: 'arastirma.md',   promptFn: (bg) => arastirmaPromptUret(bg.genesis, bg.premise) },
  { key: 'strateji',    dosya: 'strateji.md',     promptFn: (bg) => stratejiPromptUret(bg.arastirma) },
  { key: 'master-plan', dosya: 'master-plan.md',  promptFn: (bg) => masterPlanPromptUret(bg.strateji) },
]

// Önceki aşamaları oku
const baglamlar = {
  genesis: oku('genesis.md'),
  premise: oku('premise.md'),
}
yaz(`Genesis  : ${baglamlar.genesis.length} karakter`)
yaz(`Premise  : ${baglamlar.premise.length} karakter`)

// Kanal raporu için toplam maliyet
let toplamMaliyet = 0
const raporSatirlari = []

yaz('')
yaz('══════════════════════════════════════════════════════════════════')
yaz('Canlı planlama loop — araştırma → strateji → master-plan')
yaz('══════════════════════════════════════════════════════════════════')

for (const asama of ASAMALAR) {
  yaz('')
  yaz(`── AŞAMA: ${asama.key.toUpperCase()} ──────────────────────────────`)

  const prompt = asama.promptFn(baglamlar)
  yaz(`Prompt: ${prompt.length} karakter | Model: claude-sonnet-4-6`)

  let sonuc
  try {
    sonuc = await claudeCalistir(prompt, { model: 'claude-sonnet-4-6' })
  } catch (e) {
    yaz(`HATA: ${e.message}`)
    raporSatirlari.push(`- ${asama.key}: HATA — ${e.message.slice(0, 120)}`)
    break
  }

  const sure = (sonuc.sure_ms / 1000).toFixed(1)
  const maliyet = sonuc.maliyet_usd ?? 0
  toplamMaliyet += maliyet
  yaz(`Süre: ${sure}s | Maliyet: $${maliyet.toFixed(4)} | Çıktı: ${sonuc.metin.length} karakter`)

  // Format doğrulama
  const fmt = formatKontrol(asama.key, sonuc.metin)
  yaz(`kapiSonuc : ${fmt.kapiGecti ? '✓' : '✗'} | Kaynaksız sayı: ${fmt.sayiVar ? '✗ VAR' : '✓ YOK'} | Genel: ${fmt.gecti ? 'GEÇTİ' : 'KALDI'}`)
  if (!fmt.kapiGecti) yaz(`  Kapı nedeni: ${fmt.kapiNeden}`)

  if (!fmt.gecti) {
    yaz('')
    yaz(`FORMAT GEÇEMEDİ: ${asama.key} — loop durduruluyor.`)
    yaz('Üretilen içerik (ham):')
    yaz('────────────────────────────────────────────────────────────')
    yaz(sonuc.metin)
    yaz('────────────────────────────────────────────────────────────')
    raporSatirlari.push(`- ${asama.key}: KALDI — kapi:${fmt.kapiGecti ? 'OK' : fmt.kapiNeden} sayiVar:${fmt.sayiVar}`)
    await kanalYaz(false)
    process.exit(0)
  }

  // Güvenli yazma
  const dosyaYolu = join(DEMO_NS, asama.dosya)
  try {
    guvenliYaz(dosyaYolu, sonuc.metin, DEMO_NS)
    yaz(`✓ Yazıldı: ${dosyaYolu}`)
  } catch (e) {
    yaz(`SCOPE-LOCK (beklenmez): ${e.message}`)
    process.exit(1)
  }

  baglamlar[asama.key] = sonuc.metin
  raporSatirlari.push(`- ${asama.key}: GEÇTİ | ${sure}s | $${maliyet.toFixed(4)} | ${dosyaYolu}`)

  yaz('')
  yaz(`── ${asama.key} içeriği ──`)
  yaz(sonuc.metin)
  yaz('────────────────────────────────────────────────────────────')
}

yaz('')
yaz('══════════════════════════════════════════════════════════════════')
yaz(`Toplam maliyet: $${toplamMaliyet.toFixed(4)}`)
yaz('══════════════════════════════════════════════════════════════════')

await kanalYaz(true)
yaz('meta-kanal.md güncellendi.')

async function kanalYaz(basari) {
  const damga = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const kanalYol = join(META_DATA_ROOT, 'meta-kanal.md')
  const blok = [
    ``,
    `--- [${damga}] canli-kalan-asamalar — ${basari ? 'TAMAMLANDI' : 'YARIDA DURDU'} ---`,
    ``,
    `## Aşama Sonuçları`,
    ...raporSatirlari,
    ``,
    `## Toplam Maliyet`,
    `- genesis (önceki): $0.0877`,
    `- premise (önceki): $0.0644`,
    `- bu tur: $${toplamMaliyet.toFixed(4)}`,
    `- kümülatif toplam: $${(0.0877 + 0.0644 + toplamMaliyet).toFixed(4)}`,
    ``,
    `## Artefakt Dizini`,
    `- ${DEMO_NS}/genesis.md`,
    `- ${DEMO_NS}/premise.md`,
    ...(baglamlar.arastirma    ? [`- ${DEMO_NS}/arastirma.md`]    : []),
    ...(baglamlar.strateji     ? [`- ${DEMO_NS}/strateji.md`]     : []),
    ...(baglamlar['master-plan'] ? [`- ${DEMO_NS}/master-plan.md`] : []),
    ``,
    basari
      ? `Önerilen sonraki adım: _demo-canli namespace'indeki 5 aşamalı planlama tamamlandı; intake pipeline'ını gerçek bir proje için tetikle veya canlı yürütücüyü planlamaLoop.mjs state machine'e entegre et.`
      : `Önerilen sonraki adım: format hatasını gider, başarısız aşamayı yeniden çalıştır.`,
  ].join('\n')
  appendFileSync(kanalYol, blok, 'utf8')
}
