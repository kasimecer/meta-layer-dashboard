// Canlı executor adapter — state machine loop v2 için.
// Her aşama için prompt üretir, claudeCalistir çağırır, scope-lock ile yazar.
// canliExecutorOlustur(nsYolu, projeConfig) → { executor, istatistikler }
//   executor: async (asama) => { icerik, cikti_pointer, maliyet_usd, sure_ms }

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { claudeCalistirRetry, guvenliYaz } from './canliYurutucu.mjs'
import { TUM_BOLUMLER_ISARETI } from './planlamaBolumTanimlari.mjs'
import { executorSarmalayicisiniTemizle } from './planlamaSarmalayiciTemizle.mjs'
import { slug } from './planlamaSorular.mjs'

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

[tahmin-doğrulanacak:...] / [eksik] İÇİN OPSİYONEL EK ETİKET — AYNI SATIRA, ayrı bir etiket
olarak [tier:blocker|onemli|opsiyonel] ekleyebilirsin (rubric IDDIA-STATÜSÜ kuralıyla AYNI
ruhta, ama bu aşamada DAHA SIKI uygulanır):
  [tier:blocker]   — YALNIZ tek, gerçekten plan-kırıcı bir olgu/karar: onsuz bu aşamanın
                     bulguları TEMELDEN geçersiz olur (ör. pazarın var olup olmadığını belirleyen
                     eşik, kategoriyi tanımlayan tek rakam). Bir bütçe/birim-ekonomi/fiyatlama
                     hesabına GİRDİ olması TEK BAŞINA blocker gerekçesi DEĞİLDİR.
  [tier:onemli]    — VARSAYILAN tier. Somut ama tek-başına plan-kırıcı OLMAYAN her rakam (büyüme
                     oranı, rakip fiyatı, maliyet kalemi, WTP tahmini) buraya düşer — tahminle
                     ilerlenir, sonradan doğrulanır.
  [tier:opsiyonel] — incelik/güzelleştirme; yokluğu planı neredeyse etkilemez.
Belirtmezsen 'onemli' varsayılır — emin değilsen 'onemli' kullan, 'blocker' DEĞİL: bu ölçüte
gerçekten uyan kalemler bir bölümde NADİRDİR (genellikle sıfır, en fazla bir-iki) — aşırı-kullanım
bu aşamanın tempo hedefini (turda ≤7 rahat soru) gereksiz bozar.

Örnekler:
  ✓ Abonelik pazar büyüme oranı [tahmin-doğrulanacak:McKinsey-abonelik-2024] yıllık %18 civarındadır.
  ✓ Kutu başına hedef gelir 350₺ [tahmin-doğrulanacak:rakip-fiyat-kıyaslaması] [tier:blocker].
  ✓ Pilot başlangıç tarihi [metadata:2026-09].
  ✓ Balkonlu konut verisi [eksik] — TÜİK araştırması gerekli.
  ✗ Pazar büyümesi yıllık %18'dir.         ← etiket yok
  ✗ Hedef: 2026 yılına kadar 1.500 abone. ← 2026 (4 hane) etiketsiz
  ✗ Kutu fiyatı 350₺.                     ← etiket yok`

// Bir önceki aşamada operatörün verdiği yanıtları BAĞLAYICI bağlam bloğuna çevir.
// tuketim: loop'un ustYanitlariTuket çıktısı — { ust, surum, kayitlar, paket } veya boş.
// Bu, "yanıtlar bir sonraki koşuma izlenebilir girdi olarak akar" (#4) yolunun metin ucudur.
export function yanitlarMetni(tuketim) {
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
      if (e.karar === 'veri') {
        // 'veri' iki farklı şeyi taşıyabilir: (a) araştırmanın GERÇEKTEN doğrulayabileceği dış
        // kaynak, (b) operatörün kendi stratejik kararı/beyanı (kaynak yok ya da "operatör
        // kararı" gibi). İkisini AYNI [dogrulandi:...] etiketiyle yönlendirmek (b) durumunda
        // sonraki bölümün gate'ini (gercekKaynaklariCikar karşılaştırması) yanlışlıkla
        // reddettirir — operatör beyanı hiçbir zaman arastirma.md'nin gerçek kaynak kümesinde
        // olmaz. Kaynak metninde "operatör/operator" geçiyorsa ya da kaynak hiç verilmemişse
        // KESİN olarak operator-beyan'a yönlendir; aksi halde modele iki olasılığı da göster.
        const kaynakStr = e.kaynak ? `; kaynak: ${e.kaynak}` : ''
        const operatorBeyaniMi = !e.kaynak || /operat[öo]r/i.test(e.kaynak)
        // KISA KONTROLLÜ ANAHTAR (2026-07-16 P3 Fix B): e.kaynak operatörün/soru-yanıt-app'in
        // SERBEST METNİdir — bir URL+açıklama gibi 90+ karakter olabilir (gerçek gözlemlenen
        // vaka, bkz recon). [dogrulandi:...] param'ına bu HAM metni YAZDIRMAK YERİNE, aynı
        // slug() ile (planlamaSorular.mjs'de veri:${slug(kaynak)} anahtarları İÇİN ZATEN
        // kullanılan, 48-karakter tavanlı, tek fonksiyon) türetilmiş KISA bir anahtar öneriyoruz
        // — modele HEM tam kaynak metni (kaynakStr, okunabilirlik için) HEM bu KISA anahtar
        // (tag'e YAZILACAK olan) gösterilir. Tam kaynak metni AYRICA provenans-ek'in "kaynak:"
        // listesine (efektifKaynak — planlamaIddiaDurumu.mjs, BU DEĞİŞİKLİKTEN ETKİLENMEDİ, o
        // hâlâ yanit.kaynak'ı HAM okur) akmaya devam eder — burada yalnız MODELE tag-içi
        // kullanım için önerilen değer kısaltılıyor.
        const kaynakAnahtari = operatorBeyaniMi ? null : `kaynak-${slug(e.kaynak)}`
        const rehber = operatorBeyaniMi
          ? `Bu bir DIŞ KAYNAK DEĞİL — operatörün kendi kararı/beyanı. [operator-beyan:...] etiketiyle kullan; ASLA [dogrulandi:...] ile KULLANMA (araştırmanın doğrulamadığı bir "kaynak" gate'i reddettirir).`
          : `Bu araştırma aşamasının GERÇEKTEN doğruladığı bir kaynaksa [dogrulandi:${kaynakAnahtari}] etiketiyle kullan — bu KISA ANAHTARI AYNEN kullan, yukarıdaki uzun kaynak metnini KÖŞELİ PARANTEZ İÇİNE YAZMA (tag param'ı kısa/kontrollü bir anahtar olmalı, tam cümle/URL DEĞİL); değilse (operatörün kendi kararıysa) [operator-beyan:...] kullan.`
        satirlar.push(`- VERİ: «${konu}» → değer: ${e.deger}${kaynakStr}. ${rehber}`)
      }
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

// master-plan bölümlerinin İDDİA-STATÜSÜ kuralı — planlamaIddiaDurumu.mjs'deki 4 etiketin
// prompt-metni karşılığı. 13 asıl bölüme (özet-yönetici + provenans-ek HARİÇ) uygulanır.
const IDDIA_KURALI = `\
İDDİA-STATÜSÜ İÇİN ZORUNLU KURAL — ihlal → bölüm kapıdan geri döner:
Başlık/tablo-ayracı/boş satır DIŞINDAKİ HER içerik satırı şu 4 etiketten TAM BİRİNİ taşımalı
(tablo VERİ satırları DAHİL — bir hücredeki iddia da aynı satırda etiket taşımalı):
  [dogrulandi:<kaynak-adı>]                    — kaynağa dayalı, doğrulanmış
  [operator-beyan:<soru-anahtari>]             — operatörün kendi kararı (bir soru yanıtından)
  [operator-onayli-tahmin:<soru-anahtari>]     — operatörün açıkça kabul ettiği tahmin
  [acik-soru:<soru-anahtari-veya-konu>]        — henüz çözülmemiş

[dogrulandi:X] İÇİN SIKI KURAL: X, araştırma belgesinin KENDİSİNDE zaten [doğrulanmış:X] olarak
geçen kaynak-adının BİREBİR AYNISI olmalı (harfi harfine kopyala — Türkçe/İsveççe özel karakterler
DAHİL). "araştırma-bölüm-2-rakip-ekosistemi" gibi bir BÖLÜM'e veya genel başlığa gönderme YAPMA —
bölüm/başlık adı bir kaynak DEĞİLDİR. Araştırmada o bilgi [tahmin-doğrulanacak:...] veya [eksik]
olarak geçiyorsa (yani araştırmanın kendisi de doğrulamamışsa), burada da [dogrulandi:...] YAZMA —
[operator-onayli-tahmin:<yeni-anahtar>] kullan. Emin değilsen [acik-soru:...] kullan.

TIER (öncelik-derecesi) — [acik-soru:...] VE [tahmin-doğrulanacak:...] etiketleri İÇİN AYRICA,
AYNI SATIRA, bağımsız bir [tier:blocker|onemli|opsiyonel] etiketi ekle (statü etiketinin PARAMINA
GÖMME — ayrı bir etiket):
  [tier:blocker]   — bu iddia yanıtlanmadan plan maddi biçimde YANLIŞ/YANILTICI olur: yük taşıyan
                     bir operatör kararı (MVP kapsamı, problem tanımı, gelir-modeli seçimi) YA DA
                     sonraki bir bölümün tamamlanma-kapısının BAĞLI OLDUĞU sert-kaynaklı iddia.
  [tier:onemli]    — planı gerçek biçimde iyileştirir; yokluğu yüzeye çıkmış (açık) bir
                     varsayımdır, plan yine de tutarlıdır (ör. aralık bilinirken somut rakam eksik).
  [tier:opsiyonel] — incelik/güzelleştirme; yokluğu planı neredeyse etkilemez.
Belirtmezsen 'onemli' varsayılır. Emin değilsen 'onemli' kullan — 'blocker' yalnız GERÇEKTEN
yük-taşıyan bir karar/sert-bağımlılık için, aşırı-kullanma plan ilerlemesini gereksiz durdurur.

ZİNCİR KURALI: bir hesap zincirinde (ör. COGS → katkı payı → başabaş → LTV/CAC) yalnız ZİNCİRİN
KÖKÜNDEKİ bağımsız/çözülmemiş girdi(ler) blocker olabilir. "X bilinmediği için Y hesaplanamaz"
biçimindeki HER sonraki adım köktEN türer — kendi başına AYRI bir blocker DEĞİLDİR, onemli kullan
(kök zaten blocker işaretliyken zincirdeki her türevi de blocker yapmak aynı sorunu N kez
saymaktır). Somut sinyal: bir bölümde blocker sayısı ~5'i geçiyorsa muhtemelen aynı kökün
türevlerini tekrar tekrar blocker işaretliyorsundur — dur, gerçek KÖK NEDENLERİ (genellikle 2-4)
ayır, geri kalan türevleri onemli'ye indir.

İDDİA-TİPİ (doğrulama-yolu) — [dogrulandi:...], [operator-onayli-tahmin:...] VE [acik-soru:...]
etiketleri İÇİN AYRICA, AYNI SATIRA, bağımsız bir [tip:masabasi|birincil|icbilgi] etiketi ekle
(tier gibi statü etiketinin PARAMINA GÖMME — ayrı bir etiket). Bu, iddianın NASIL ve KİM
TARAFINDAN doğrulanabileceğini sınıflar:
  [tip:masabasi]  — masa-başı doğrulanabilir: dış/kamu bir kaynağa karşı bir arama/araştırma
                    turuyla doğrulanabilir (pazar büyüklüğü, rakip fiyatı, yasal gereklilik).
  [tip:birincil]  — YENİ birincil veri toplamayı gerektirir (bu segment gerçekten öder mi,
                    dönüşüm oranımız ne). Hiçbir dış kaynak bunu doğrulamaz; saha çalışması gerekir.
  [tip:icbilgi]   — yalnız operatör/domain bilgisiyle doğrulanır (tedarikçi şartlarımız, iç
                    maliyet yapımız, elimizdeki bir ilişki). Hiçbir dış kaynak bunu doğrulamaz;
                    yalnız operatör verebilir.
[operator-beyan:...] İÇİN [tip:...] GEREKMEZ (saf operatör kararı — ampirik bir iddia değil).
Etiketsiz bırakma: her [dogrulandi:...]/[operator-onayli-tahmin:...]/[acik-soru:...] satırı
[tip:...] TAŞIMALI — taşımıyorsa bölüm kapıdan geri döner (statü etiketinin kendisi kadar zorunlu).

Etiketsiz satır BIRAKMA; statüsü belirsizse [acik-soru:...] kullan, SESSİZCE atlama.`

// Bölüm tanımının ustBaglamAnahtarlari'na göre bağlam-blokları kur (TUM_BOLUMLER_ISARETI ⟹
// o ana kadarki TÜM diğer bölümler/aşamalar — baglamlar objesinde ne varsa).
function bolumBaglamBlogu(bolumTanim, baglamlar) {
  const bloklar = []
  const eklenen = new Set()
  for (const anahtar of bolumTanim.ustBaglamAnahtarlari) {
    if (anahtar === TUM_BOLUMLER_ISARETI) {
      for (const [k, icerik] of Object.entries(baglamlar)) {
        if (icerik != null && !eklenen.has(k)) { bloklar.push(`<${k}>\n${icerik}\n</${k}>`); eklenen.add(k) }
      }
      continue
    }
    if (eklenen.has(anahtar)) continue
    const icerik = baglamlar[anahtar]
    if (icerik != null) { bloklar.push(`<${anahtar}>\n${icerik}\n</${anahtar}>`); eklenen.add(anahtar) }
  }
  return bloklar.join('\n')
}

// Bazı bölümlerde TEK bir karar/iddia rubric'in genel değerlendirmesinden BAĞIMSIZ olarak HER
// ZAMAN blocker'dır — bu, "problem-definition approval" / "MVP-scope approval" adlarıyla anılan
// operatör onayları: problem-cozum'un hedefAciklama'sı zaten "Problem ifadesi operatör onayına
// sunulmalı" der, urun-tanimi'nin ki "MVP sınırı operatör onayına sunulmalı" — bu İKİ karar
// modelin KENDİ rubric-yargısına bırakılamaz (mekanik olarak HANGİ iddianın "bu" karar olduğunu
// JS tarafı bilemez — bu yüzden burada bir PROMPT talimatı, deterministik bir kural DEĞİL).
const TIER_ZORUNLU_NOTLARI = {
  'problem-cozum': 'BU BÖLÜMDE EK KURAL: problem tanımının KENDİSİNİ operatör onayına sunan iddia/karar HER ZAMAN [tier:blocker] taşımalı (rubric\'in genel değerlendirmesi bu ikisi için geçerli değil — bu karar yapısı gereği yük taşıyandır).',
  'urun-tanimi': 'BU BÖLÜMDE EK KURAL: MVP kapsam sınırını operatör onayına sunan iddia/karar HER ZAMAN [tier:blocker] taşımalı (rubric\'in genel değerlendirmesi bu ikisi için geçerli değil — bu karar yapısı gereği yük taşıyandır).',
}

// Master-plan BÖLÜM prompt'u — promptUret'in KARDEŞİ (switch-case'e EKLENMEZ). 14 bölüm + ek
// için VERİDEN (BOLUM_TANIMLARI) üretilir; 14 kez elle yazılmaz. promptUret'in 5 case'i
// TAMAMEN DOKUNULMADAN kalır.
export function promptUretBolum(bolumId, proje, baglamlar, bolumTanim) {
  const { ad, aciklama } = proje
  const projeBaslik = `PROJE: ${ad} — ${aciklama}`
  const baglamBlogu = bolumBaglamBlogu(bolumTanim, baglamlar)

  // Kilitli-kararlar dijesti — YALNIZ üç sentez bölümünde (bolumBaglamlarKur bunu yalnız o üçü
  // için doldurur; planlamaBolumLoop.mjs/KILITLI_KARAR_BOLUMLERI) dolu gelir, diğer 12 bölümde
  // (provenans-ek dahil) daima boş kalır — dolayısıyla bolumId'ye göre dallanmaya GEREK YOK,
  // veri zaten yalnız ilgili bölümlere ULAŞIYOR (bkz __provenansVerisi ile AYNI desen).
  const kk = baglamlar.__kilitliKararlar
  const kilitliBlok = kk && (kk.kararlarMetni || kk.durumOzetiMetni)
    ? `\n\nOPERATÖRÜN KİLİTLİ KARARLARI (bağlayıcı — YUKARIDAKİ bölüm metinleri bazı kararları henüz` +
      ` yansıtmıyor olabilir çünkü o bölüm dosyası kararın KİLİTLENMESİNDEN ÖNCE üretildi ve o` +
      ` karardan sonra yeniden yazılmadı; aşağıdakiler GÜNCEL ve kaynak bölümün donmuş` +
      ` çerçevelemesinden ÖNCELİKLİDİR):\n` +
      (kk.kararlarMetni ? `\nKilitlenmiş kararlar:\n${kk.kararlarMetni}\n` : '') +
      (kk.durumOzetiMetni ? `\nPlan geneli güncel iddia statüsü (blocker/onemli tier):\n${kk.durumOzetiMetni}\n` : '')
    : ''

  if (bolumTanim.mekanik) {
    // Provenans-eki: mekanik biçimlendirme — veri planlamaBolumLoop.mjs tarafından
    // baglamlar.__provenansVerisi içine ÖNCEDEN yapılandırılmış olarak konur.
    const veri = baglamlar.__provenansVerisi ?? { tumIddialar: [], tumAtlananlar: [] }
    return `\
${bolumTanim.hedefAciklama} Türkçe yaz.

${projeBaslik}

TOPLANMIŞ İDDİALAR (kaynak/soru-referansı + statü) — JSON:
${JSON.stringify(veri.tumIddialar, null, 2)}

ATLANAN SORULAR — JSON:
${JSON.stringify(veri.tumAtlananlar, null, 2)}

GÖREV: Yukarıdaki veriyi "${bolumTanim.etiket}" başlığı altında okunaklı bir listeye çevir — her
iddia için kaynak/soru-referansı + statüsünü göster; her atlanan soruyu ayrı bir alt-listede
göster. YENİ İDDİA ÜRETME/UYDURMA — yalnız verilen veriyi sadakatle biçimlendir.
Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece belge içeriği.`
  }

  if (bolumTanim.iddiaMuaf) {
    return `\
${bolumTanim.hedefAciklama} Türkçe yaz.

${projeBaslik}

BAĞLAM — tüm diğer bölümler:
${baglamBlogu}
${kilitliBlok}
GÖREV: "${bolumTanim.etiket}" başlığı altında 4-6 paragraflık nitel bir sentez yaz. HİÇBİR
köşeli-parantez statü etiketi KULLANMA, HİÇBİR sayı/figür YAZMA (yeniden ifade edilmiş olsa
bile) — yalnız düz-yazı sentez. Yukarıdaki bölümlere GÖNDERME yap ama sayı/rakam TEKRARLAMA.
KİLİTLİ KARARLAR listelendiyse (yukarıda) bunları da düz-yazı içinde (tag'siz, sayısız) yansıt —
ilgili kaynak bölümün metni hâlâ eski/kararsız bir çerçeveleme taşıyorsa bile, sentezini KİLİTLİ
KARARA göre yaz, kaynak bölümün eski çerçevelemesine göre DEĞİL.
Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece belge içeriği.`
  }

  return `\
${bolumTanim.etiket} bölümü — master-plan'ın bir alt-bölümü. Türkçe yaz.

${projeBaslik}

BAĞLAM:
${baglamBlogu || '(bu bölüm için özel üst bağlam yok — proje geneline dayan)'}
${kilitliBlok}
GÖREV: ${bolumTanim.hedefAciklama}
${kilitliBlok ? '\nKİLİTLİ KARARLAR / GÜNCEL İDDİA STATÜSÜ listelendiyse (yukarıda), iddialarını buna göre statüle — kaynak bölümün donmuş metni hâlâ eski bir statü/çerçeveleme taşıyorsa bile, GÜNCEL efektif statüyü esas al.\n' : ''}
${IDDIA_KURALI}
${TIER_ZORUNLU_NOTLARI[bolumId] ? `\n${TIER_ZORUNLU_NOTLARI[bolumId]}\n` : ''}
Belgenin başına veya sonuna yorum/açıklama EKLEME. Sadece "${bolumTanim.etiket}" başlıklı bölüm içeriği.`
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
    // opts.bolumTanim verilmişse (master-plan bölüm-yürüyüşü) promptUretBolum'a dispatch et —
    // promptUret'in 5 case'i DOKUNULMADAN kalır.
    const prompt = opts.bolumTanim
      ? promptUretBolum(asama, projeConfig, kullanilanBaglamlar, opts.bolumTanim) + yanitlarMetni(opts.yanitlar)
      : promptUret(asama, projeConfig, kullanilanBaglamlar) + yanitlarMetni(opts.yanitlar)
    // Geçici hatalar (timeout/non-zero-exit/JSON-parse) sınırlı-retry ile kurtarılır;
    // zincir bir tekil-deneme hatasıyla ABORT olmaz. Tüm denemeler tükenirse net hata.
    const sonuc  = await claudeCalistirRetry(prompt, { model: 'claude-sonnet-4-6', zaman_asimi_ms, maxDeneme, log })

    ist.cagrilar++
    ist.toplamMaliyet              += sonuc.maliyet_usd ?? 0
    ist.asamaMaliyetleri[asama]    = sonuc.maliyet_usd

    // 2026-07-06: burada denenen bir otomatik "sohbet-sarmalayıcı" kırpma (ilk #-başlığından
    // öncesini silme) GERİ ALINDI — risk-varsayimlar'da içeriğin ORTASINDAN bir kelimeyi keserek
    // sessiz veri kaybına yol açtığı GÖZLEMLENDİ ("belgeyi bulmaca gibi kırp" heuristiği doğası
    // gereği güvensiz: yanlış-pozitif maliyeti çok daha yüksek). 2026-07-09: DAR kapsamlı bir
    // yeniden-deneme eklendi (executorSarmalayicisiniTemizle) — o hatadan YAPISAL OLARAK farklı:
    // yalnız BİLİNEN sabit desenleri ("Format confirmed" ön-eki, "kaydedildi/registry updated"
    // art-eki), YALNIZ metnin MUTLAK başında/sonunda arar (asla ortada bir "başlık" aramaz);
    // eşleşme yoksa içerik BİREBİR döner. Kapı yine de son savunma hattı (statüsüz-satır olarak
    // yakalar) — bu yalnız BİLİNEN gürültüyü kapıya varmadan temizler.
    const temizlik = executorSarmalayicisiniTemizle(sonuc.metin)
    if (temizlik.degisti) {
      log(`${asama}: executor çıktısından sarmalayıcı soyuldu` +
          (temizlik.onSoyuldu ? ` [ön: "${temizlik.onSoyuldu.trim().slice(0, 60)}"]` : '') +
          (temizlik.artSoyuldu ? ` [art: "${temizlik.artSoyuldu.trim().slice(0, 60)}"]` : ''))
    }
    const icerikTemiz = temizlik.temiz

    const dosyaYolu = opts.hedefDosya ?? join(nsYolu, ASAMA_DOSYALARI[asama])
    guvenliYaz(dosyaYolu, icerikTemiz, nsYolu)
    baglamlar[asama] = icerikTemiz

    return {
      icerik:       icerikTemiz,
      cikti_pointer: dosyaYolu,
      maliyet_usd:  sonuc.maliyet_usd,
      sure_ms:      sonuc.sure_ms,
    }
  }

  return { executor, istatistikler: () => ({ ...ist }) }
}
