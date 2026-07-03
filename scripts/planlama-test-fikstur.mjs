// Hermetik planlama test fikstürleri — repo-içi, Drive'dan BAĞIMSIZ.
// Her fikstür GERÇEK yapısal kapıdan (kapidanGecerMi) geçecek şekilde tasarlandı; bu
// modül yüklenirken kendi kendini doğrular (drift olursa test-koşumu anında patlar).
// BOZUK_PREMISE bilerek premise kapısından KALIR (dondurma/onay-reddi testleri için).

import { kapidanGecerMi } from '../tools/planlamaKapilari.mjs'

const GENESIS = `# Genesis — Test Projesi

## §1 — Aday Seti

Tohuma yönelik farklı yaklaşımlar; mevcut şirket değil, fikir/biçim seçenekleri.

| # | Aday Adı | Yaklaşım Özeti | Kilit Varsayım |
|---|----------|----------------|----------------|
| bir | Pasif Form | Kullanıcı hiçbir şey yapmadan sonucu alır | Talep pasif çözüme açıktır |
| iki | Ritüel Form | Günlük alışkanlığa yaslanır | Kullanıcı ritüeli benimser |
| üç | Retrofit Form | Mevcut ürüne eklenir | Değiştirme direnci düşüktür |

## §2 — Set Eleştirisi

Her mercek seti bir bütün olarak sorgular.

### Soy 1: Kullanım Ritüeli — çabaya dayalı bakış

**EKSİK TÜR:** Hiçbir kurulum gerektirmeyen tamamen pasif çözüm türü sette yok.
[yapısal-bulgu] Tüm adaylar bir kurulum anı varsayıyor; asıl direnç tekrar kurulumdadır.
[reçete] Kurulumsuz kalıcı bir form kullanıcı direncini ortadan kaldırır.

**PAYLAŞILAN KÖR NOKTA:** Sorun kullanım anında oluşuyor ama çözüm hazırlık anında tasarlanıyor.
[yapısal-bulgu] Adaylar kullanıcıyı çözümün öznesi yapıyor; dinamik kullanım modellenmiyor.
[reçete] Kullanım anını başlangıç kısıtı alan tasarım kökü hedefler.

**VARLIK KALDIRACI:** Proje sahibinin alan deneyimi sete yansımıyor.
[yapısal-bulgu] Sahibin birinci elden deneyimi bir varlık ama kullanılmıyor.
[reçete] Bu deneyimi erken doğrulama kanalı yapmak en ucuz validasyondur.

### Soy 2: Malzeme-Sistem — entegrasyon yükü bakışı

**EKSİK TÜR:** Mevcut ürünü koruyan adaptör/ara-ürün formu sette yok.
[yapısal-bulgu] Adaylar mevcut ürünü değiştiriyor; koruyan retrofit katmanı yok.
[reçete] Bağımsız adaptör satın alma direncini düşürür.

**PAYLAŞILAN KÖR NOKTA:** Çözüm dar bir arayüze lokalize ediliyor; sistemin üçüncü aktörü ihmal ediliyor.
[yapısal-bulgu] İlişki yalnız ikili arayüzde kurgulanıyor; geniş sistem gözden kaçıyor.
[reçete] Sistemi genişleten form farklılaşmayı mümkün kılar.

**VARLIK KALDIRACI:** Sahibin günlük test kapasitesi kullanılmıyor.
[yapısal-bulgu] Erken prototip için ideal testçi olan sahip sete yansımıyor.
[reçete] Sahibin gözlemini veri olarak kullanmak validasyonu hızlandırır.

## §3 — Bulgular → Sete Yansıma

| Bulgu | Tip | Sete Etki |
|-------|-----|-----------|
| Kurulumsuz kalıcı form eksik | EKSİK TÜR | Pasif çözüm arayı boş kalıyor |
| Mevcut ürünü koruyan adaptör yok | EKSİK TÜR | Satın alma direnci yüksek kalıyor |

## §4 — Seçilen Aday

Set eleştirisinden çıkan revizyonla pasif-kalıcı form öne çıkıyor; kurulum direncini kaldırdığı ve sahibin deneyimini kaldıraç yaptığı için en güçlü aday budur.

Çıktı → Bir sonraki aşama: premise
`

const PREMISE = `# Premise — Test Projesi

## Kapı 1: Konu / Tür

Ürün, pasif ve kalıcı bir kullanım-kolaylığı çözümüdür; kategorisi ev-içi konfor ürünleri, türü kurulumsuz retrofit katmanıdır. Kullanıcı ek çaba harcamadan sonucu alır.

## Kapı 2: Kitle

Hedef kitle, gündelik hayatında küçük ama tekrar eden bir sürtünmeyle uğraşan şehirli yetişkinlerdir; pratik ve düşük-bakım çözümlere değer verirler.

## Kapı 3: Açı + Kredibilite

Benzersiz açı, sorunu hazırlık anında değil kullanım anında çözmesidir; kredibilite proje sahibinin birinci elden deneyimine dayanır.

## Kapı 4: Transfer Vaadi

Kullanıcı tekrarlayan bir zahmetten kurtulur; öncesinde her seferinde uğraşırken sonrasında hiç düşünmez. Somut kazanç kazanılan zaman ve azalan sinirdir.
`

const ARASTIRMA = `# Araştırma — Test Projesi

## 1. Pazar Büyüklüğü ve Trend

Pazar, düşük-bakım ev ürünlerine doğru genişleyen bir ilgiyle şekilleniyor [eksik]. Kesin büyüklük verisi doğrulanmalı; eğilim yukarı yönlü görünüyor.

## 2. Rakip Ekosistemi

Mevcut çözümler ya mevcut ürünü değiştiriyor ya da kurulum gerektiriyor; kurulumsuz kalıcı forma odaklanan güçlü bir rakip görünmüyor.

## 3. Hedef Kitle Araştırması

Şehirli yetişkin segmenti pratik çözümlere açık; satın alma motivasyonu zahmetten kurtulmak.

## 4. Fiyatlama Kıyaslaması

Benzer konfor ürünleri prim fiyatı taşıyabiliyor [eksik]; ödeme istekliliği doğrulanmalı.

## 5. Tedarik ve Operasyonel Maliyet Tahmini

Tedarik ve lojistik kalemleri standart; kalıcı form birim maliyeti erken prototipte netleşir [eksik].

## 6. Kaynaklanmış Referanslar (master-plan bölümlerinin dayandığı gerçek kaynaklar)

Pazar büyüklüğü ve segment verisi bağımsız bir sektör raporuyla teyit edilmiştir [doğrulanmış:sektor-raporu-2026].
Rakip fiyat/model taraması ayrı bir kıyaslama çalışmasıyla teyit edilmiştir [doğrulanmış:rakip-taramasi-2026].
Tedarikçi teklifi doğrudan yazılı bir teklif belgesiyle teyit edilmiştir [doğrulanmış:tedarikci-teklifi-2026].
Reklam kanalı maliyet kıyaslaması bağımsız bir pazarlama-ajansı raporuyla teyit edilmiştir [doğrulanmış:reklam-kiyaslama-2026].
Kuruluş/vergi adımları resmi ticaret odası rehberiyle teyit edilmiştir [doğrulanmış:ticaret-odasi-rehberi-2026].
`

const STRATEJI = `# Strateji — Test Projesi

## 1. Konumlandırma

Kurulumsuz kalıcı form olarak konumlanır; rakip boşluğu tam burada.

## 2. Fiyatlama Stratejisi

Prim konumuna uygun tek kademeli başlangıç; yenileme sade tutulur.

## 3. Kanal ve Müşteri Edinme

Birincil kanal organik anlatı; sahibin deneyimi güven inşa eder.

## 4. Rekabet Savunması (Moat)

Kullanım-anı tasarımı ve deneyim katmanı kopyalamayı zorlaştırır.

## 5. Temel Metrikler

Abone büyümesi, elde tutma ve birim ekonomisi izlenir [eksik].
`

const MASTER_PLAN = `# Master-Plan — Test Projesi

## 1. Faz: Doğrulama

Erken prototip ve küçük pilot grupla öğrenme; kullanım-anı varsayımı test edilir.

## 2. Faz: Pilot Lansman

İlk kalıcı form canlıya alınır; başarı kriteri tekrar kullanım oranıdır [eksik].

## 3. Faz: Ölçeklendirme

Talep doğrulanınca operasyon genişler; tedarik derinleşir.

## 4. Kaynak ve Bütçe Özeti

Temel kalemler tedarik, lojistik ve prototip; hedefler sade tutulur.

## 5. Risk ve Kurtarma

En kritik risk benimseme direnci; kurtarma dar segmentte derinleşmektir.
`

// Bilerek BOZUK: Kapı 4 (transfer-vaadi) yok → premise kapısı KALIR.
const BOZUK_PREMISE = `# Premise — Test Projesi (BOZUK)

## Kapı 1: Konu / Tür

Geçerli içerik burada yeterince uzun bir açıklama olarak yer alıyor.

## Kapı 2: Kitle

Hedef kitle tanımı burada yeterince uzun biçimde veriliyor.

## Kapı 3: Açı + Kredibilite

Açı ve kredibilite burada yeterince uzun biçimde anlatılıyor.
`

export const FIKSTUR = {
  genesis: GENESIS,
  premise: PREMISE,
  arastirma: ARASTIRMA,
  strateji: STRATEJI,
  'master-plan': MASTER_PLAN,
}

export const BOZUK = { premise: BOZUK_PREMISE }

// ── Kendi kendini doğrula: geçerli fikstürler kapıdan GEÇMELİ, bozuk KALMALI ──
export function fiksturuDogrula() {
  const hatalar = []
  for (const [asama, icerik] of Object.entries(FIKSTUR)) {
    const g = kapidanGecerMi(asama, icerik)
    if (!g.gecti) hatalar.push(`FIKSTUR.${asama} kapıdan GEÇMELİYDİ ama kaldı: ${g.neden}`)
  }
  const bg = kapidanGecerMi('premise', BOZUK.premise)
  if (bg.gecti) hatalar.push('BOZUK.premise kapıdan KALMALIYDI ama geçti')
  if (hatalar.length) throw new Error('Fikstür drift:\n  ' + hatalar.join('\n  '))
  return true
}
