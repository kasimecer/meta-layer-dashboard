// Canlı executor adapter — state machine loop v2 için.
// Her aşama için prompt üretir, claudeCalistir çağırır, scope-lock ile yazar.
// canliExecutorOlustur(nsYolu, projeConfig) → { executor, istatistikler }
//   executor: async (asama) => { icerik, cikti_pointer, maliyet_usd, sure_ms }

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { claudeCalistirRetry, guvenliYaz } from './canliYurutucu.mjs'

const ASAMA_DOSYALARI = {
  genesis:        'genesis.md',
  premise:        'premise.md',
  arastirma:      'arastirma.md',
  strateji:       'strateji.md',
  'master-plan':  'master-plan.md',
}

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
  ✓ Kutu başına hedef gelir 350₺ [tahmin-doğrulanacak:rakip-fiyat-kıyaslaması].
  ✓ Pilot başlangıç tarihi [metadata:2026-09].
  ✓ Balkonlu konut verisi [eksik] — TÜİK araştırması gerekli.
  ✗ Pazar büyümesi yıllık %18'dir.         ← etiket yok
  ✗ Hedef: 2026 yılına kadar 1.500 abone. ← 2026 (4 hane) etiketsiz
  ✗ Kutu fiyatı 350₺.                     ← etiket yok`

// Bir önceki aşamada operatörün verdiği yanıtları BAĞLAYICI bağlam bloğuna çevir.
// tuketim: loop'un ustYanitlariTuket çıktısı — { ust, surum, kayitlar, paket } veya boş.
// Bu, "yanıtlar bir sonraki koşuma izlenebilir girdi olarak akar" (#4) yolunun metin ucudur.
function yanitlarMetni(tuketim) {
  if (!tuketim || tuketim.surum == null || !tuketim.kayitlar || !tuketim.paket) return ''
  const soruHarita = new Map(tuketim.paket.sorular.map(s => [s.anahtar, s]))
  const satirlar = []
  for (const e of tuketim.kayitlar) {
    const s = soruHarita.get(e.anahtar)
    if (!s || s.tip === 'APPROVAL') continue
    const konu = s.iddia ?? s.metin
    if (e.atlandi === true) { satirlar.push(`- (ATLANDI, karar operatörce ertelendi) ${s.metin}${e.gerekce ? ` — gerekçe: ${e.gerekce}` : ''}`); continue }
    if (s.tip === 'CHOICE') satirlar.push(`- SEÇİM: ${s.metin} → operatör seçti: «${e.secim}»`)
    else if (s.tip === 'DATA-REQUEST') {
      if (e.karar === 'veri') satirlar.push(`- VERİ (kaynaklı): «${konu}» → değer: ${e.deger}${e.kaynak ? `; kaynak: ${e.kaynak}` : ''}. Bunu [doğrulanmış:${e.kaynak ?? 'operatör'}] etiketiyle kullan.`)
      else if (e.karar === 'tahmin') satirlar.push(`- TAHMİN (operatör-onaylı): «${konu}» → operatör tahmini onayladı. [tahmin-doğrulanacak:operatör-onaylı] etiketiyle kullan.`)
      else if (e.karar === 'dusur') satirlar.push(`- DÜŞÜR: «${konu}» → bu iddiayı ÇIKAR, bu aşamada KULLANMA.`)
    }
    else if (s.tip === 'FREE-TEXT') satirlar.push(`- BAĞLAM: ${e.metin}`)
  }
  if (!satirlar.length) return ''
  return `\n\nOPERATÖR YANITLARI (önceki aşamada verildi — BAĞLAYICI girdi; bu aşamada uygula):\n${satirlar.join('\n')}\n`
}

function promptUret(asama, proje, baglamlar) {
  const { ad, aciklama } = proje
  const projeBaslik = `PROJE: ${ad} — ${aciklama}`

  switch (asama) {
    case 'genesis': return `\
Genesis aşaması — tohumdan aday-seti üret ve seti eleştir. Türkçe yaz.

${projeBaslik}

İŞLEV: Bu aşamada mevcut şirketleri analiz etmiyoruz. Tohumdan FARKLI YAKLAŞIMLARLA 5-6 aday fikir/biçim üretip bu aday setini iki farklı mercekle eleştiriyoruz.

ÇIKTI İSKELETİ — §, etiketler ve son satırı TAMAMEN AYNI YAZ:

# Genesis — ${ad}

## §1 — Aday Seti

Tohuma yönelik 5-6 farklı yaklaşım. Mevcut şirket değil; fikir/biçim seçenekleri.

| # | Aday Adı | Yaklaşım Özeti | Kilit Varsayım |
|---|----------|----------------|----------------|
| 1 | ... | ... | ... |
| 2 | ... | ... | ... |
| 3 | ... | ... | ... |
| 4 | ... | ... | ... |
| 5 | ... | ... | ... |
| 6 | ... | ... | ... |

## §2 — Set Eleştirisi

Her mercek seti bir bütün olarak sorgular — belirli bir adayı değil, tüm seti.

### Soy 1: [Mercek adı — soyut bir bakış açısı, düşünce okulu veya kısıt]

**EKSİK TÜR:** [Sette hiç temsil edilmeyen aday türü veya yaklaşım]
[yapısal-bulgu] Tek cümle — neden bu tür eksik kaldı.
[reçete] Tek cümle — bu boşluktan açılan fırsat.

**PAYLAŞILAN KÖR NOKTA:** [Tüm adaylarda bulunan ortak ve sorgulanmamış varsayım]
[yapısal-bulgu] Tek cümle — bu varsayımın seti nasıl kısıtladığı.
[reçete] Tek cümle — varsayımı kırmak ne açar.

**VARLIK KALDIRACI:** [Proje sahibinin elindeki varlık/kaynak sete yansıyor mu?]
[yapısal-bulgu] Tek cümle — hangi varlık kullanılmıyor.
[reçete] Tek cümle — o varlığı devreye sokan adayın şekli.

### Soy 2: [Farklı perspektiften ikinci mercek]

**EKSİK TÜR:** [...]
[yapısal-bulgu] ...
[reçete] ...

**PAYLAŞILAN KÖR NOKTA:** [...]
[yapısal-bulgu] ...
[reçete] ...

**VARLIK KALDIRACI:** [...]
[yapısal-bulgu] ...
[reçete] ...

## §3 — Bulgular → Sete Yansıma

| Bulgu | Tip | Sete Etki |
|-------|-----|-----------|
| ... | EKSİK TÜR / KÖR NOKTA / VARLIK | ... |
| ... | ... | ... |
| ... | ... | ... |

## §4 — Seçilen Aday

[2-3 cümle: set eleştirisinden çıkan revizyonla hangi aday öne çıkıyor ve neden]

Çıktı → Bir sonraki aşama: premise

ZORUNLU KURALLAR:
1. §1, §2, §3, §4 bölüm işaretlerini TAMAMEN AYNI YAZ.
2. **EKSİK TÜR:**, **PAYLAŞILAN KÖR NOKTA:**, **VARLIK KALDIRACI:** etiketlerini TAMAMEN AYNI YAZ (bold, iki yıldız).
3. [yapısal-bulgu] ve [reçete] satırlarını TAMAMEN AYNI YAZ (köşeli parantez, küçük harf, tire).
4. Son satır birebir: Çıktı → Bir sonraki aşama: premise
5. Kaynaksız sayı YAZMA; zorunluysa [tahmin-doğrulanacak:kaynak] ekle.
6. Belgenin başına/sonuna açıklama veya yorum EKLEME. Sadece belge içeriği.`

    case 'premise': return `\
Premise aşaması — ürün premise belgesi üret. Türkçe yaz.

${projeBaslik}

GENESİS KRİTİĞİ (tamamlanan önceki aşama):
---
${baglamlar.genesis}
---

GÖREV: Yukarıdaki genesis kritikten elde edilen bulguları kullanarak ürünün premise'ini dört kapı alanı için tanımla.

ÇIKTI İSKELETİ — başlıkları TAMAMEN AYNI YAZIN:

# Premise — ${ad}

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
2. Her kapı bölümünde EN AZ 3 anlamlı cümle yaz.
3. Herhangi bir sayı yazmak zorundaysan yanına [tahmin-doğrulanacak:kaynak] ekle. Kaynaksız sayı YAZMA.
4. Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece belge içeriği.`

    case 'arastirma': return `\
Araştırma aşaması — pazar ve rekabet araştırması belgesi üret. Türkçe yaz.

${projeBaslik}

BAĞLAM — önceki aşamalar:
<genesis>
${baglamlar.genesis}
</genesis>
<premise>
${baglamlar.premise}
</premise>

GÖREV: Beş başlık altında araştırma belgesi üret. Her başlıkta bulgular, tahminler ve eksik veri noktaları belirtilmeli.

ÇIKTI İSKELETİ — başlıkları TAMAMEN AYNI YAZIN:

# Araştırma — ${ad}

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

    case 'strateji': return `\
Strateji aşaması — ürün ve iş modeli strateji belgesi üret. Türkçe yaz.

${projeBaslik}

BAĞLAM — araştırma aşaması bulguları:
<arastirma>
${baglamlar.arastirma}
</arastirma>

GÖREV: Araştırma bulgularına dayanan strateji belgesi üret. Araştırmada çıkan verileri kullan; yeni kaynaksız figür EKLEME.

ÇIKTI İSKELETİ — başlıkları TAMAMEN AYNI YAZIN:

# Strateji — ${ad}

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

    case 'master-plan': return `\
Master-plan aşaması — yürütme planı belgesi üret. Türkçe yaz.

${projeBaslik}

BAĞLAM — strateji aşaması:
<strateji>
${baglamlar.strateji}
</strateji>

GÖREV: Stratejiye dayanan yürütme master-plan belgesi üret. Tarihleri [metadata:YYYY-AA] formatında yaz; yeni kaynaksız figür EKLEME.

ÇIKTI İSKELETİ — başlıkları TAMAMEN AYNI YAZIN:

# Master-Plan — ${ad}

## 1. Faz 1: Doğrulama ([metadata:2026-07] — [metadata:2026-09])

[İlk üç ay: ürün prototip, küçük pilot grup, öğrenme hedefleri. 3-5 cümle.]

## 2. Faz 2: Pilot Lansman ([metadata:2026-10] — [metadata:2026-12])

[İlk mevsimlik kutunun canlıya alınması. Başarı kriterleri. 3-5 cümle.]

## 3. Faz 3: Ölçeklendirme ([metadata:2027-01] — [metadata:2027-06])

[Büyüme hedefleri ve operasyonel genişleme. 3-5 cümle.]

## 4. Kaynak ve Bütçe Özeti

[Temel maliyet kalemleri ve hedefleri. 3-5 cümle.]

## 5. Risk ve Kurtarma

[İki-üç kritik risk + kurtarma aksiyonu. 3-5 cümle.]

${SAYI_KURALI}

Tarihler için [metadata:YYYY-AA] kullan. Stratejide olmayan yeni kaynaksız sayı YAZMA.
Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece belge içeriği.`

    default:
      throw new Error(`canliExecutor: bilinmeyen aşama: ${asama}`)
  }
}

/**
 * @param {string} nsYolu — namespace dizini (scope-lock sınırı)
 * @param {{ id, ad, aciklama }} projeConfig
 * @param {{ maxDeneme?, zaman_asimi_ms?, log? }} opts — claudeCalistirRetry'e geçer
 * @returns {{ executor: AsyncFunction, istatistikler: Function }}
 */
export function canliExecutorOlustur(nsYolu, projeConfig, opts = {}) {
  const { maxDeneme = 3, zaman_asimi_ms = 360_000, log = () => {} } = opts

  // Önceki koşumdan kalan dosyaları önceden yükle (idempotency re-run bağlamı için).
  const baglamlar = {}
  for (const [asama, dosya] of Object.entries(ASAMA_DOSYALARI)) {
    const yol = join(nsYolu, dosya)
    if (existsSync(yol)) baglamlar[asama] = readFileSync(yol, 'utf8')
  }

  const ist = { cagrilar: 0, toplamMaliyet: 0, asamaMaliyetleri: {} }

  // @param {string} asama
  // @param {{ hedefDosya?: string, baglamlar?: object }} opts — loop sürüm-farkında yazım
  //   hedefDosya: bu koşumun yazılacağı (sürümlü) yol; verilmezse eski sabit ad kullanılır.
  //   baglamlar : üst aşamaların GÜNCEL sürüm içerikleri; verilirse önyüklenene tercih edilir
  //               (geri-dönüş sonrası üst yeni sürüme geçtiğinde doğru bağlam için kritik).
  async function executor(asama, opts = {}) {
    const kullanilanBaglamlar = opts.baglamlar ?? baglamlar
    // Operatör yanıtları (üst aşamadan tüketilen) prompt'a BAĞLAYICI bağlam olarak eklenir.
    const prompt = promptUret(asama, projeConfig, kullanilanBaglamlar) + yanitlarMetni(opts.yanitlar)
    // Geçici hatalar (timeout/non-zero-exit/JSON-parse) sınırlı-retry ile kurtarılır;
    // zincir bir tekil-deneme hatasıyla ABORT olmaz. Tüm denemeler tükenirse net hata.
    const sonuc  = await claudeCalistirRetry(prompt, { model: 'claude-sonnet-4-6', zaman_asimi_ms, maxDeneme, log })

    ist.cagrilar++
    ist.toplamMaliyet              += sonuc.maliyet_usd ?? 0
    ist.asamaMaliyetleri[asama]    = sonuc.maliyet_usd

    const dosyaYolu = opts.hedefDosya ?? join(nsYolu, ASAMA_DOSYALARI[asama])
    guvenliYaz(dosyaYolu, sonuc.metin, nsYolu)
    baglamlar[asama] = sonuc.metin

    return {
      icerik:       sonuc.metin,
      cikti_pointer: dosyaYolu,
      maliyet_usd:  sonuc.maliyet_usd,
      sure_ms:      sonuc.sure_ms,
    }
  }

  return { executor, istatistikler: () => ({ ...ist }) }
}
