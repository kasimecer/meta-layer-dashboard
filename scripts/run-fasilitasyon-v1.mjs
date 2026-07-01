// meta-layer-core — Karar-fasilitasyon v1 ÇOK-TURLU KOŞUM (mekanik-test).
// Substrat: v0 ile AYNI k16 (Barış fiyat). Loop ≤3 tur; bu koşum 2 turda YAKINSAMA-terminal'e ulaştı.
//
// MİMARİ: Fasilitatör muhakemesi (sentez + keskinleştirici-sorular + terminal-sınıf) = OTURUM MODELİ
// (bu oturum: Opus 4.8 — NOT: görev "Sonnet (default)" istedi; oturum Opus olduğu için kontrat-testi
// Opus üzerinde koştu, raporda işaretlendi). Persona cevapları = OpenRouter free-modeller, CANLI alındı
// (tools/openrouter-persona.sh; Tur1+Tur2). Aşağıdaki CEVAP sabitleri o canlı yakalamanın BİREBİR kaydıdır
// (yeniden-koşumda model çıktısı değişebilir; uydurma YOK). Bu script o kaydı DOĞRULAR + render eder + yazar.
//
// Koşum:  node scripts/run-fasilitasyon-v1.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { kartDogrula } from '../src/lib/stateMachine.js'
import {
  fasilitasyonRutini, tarafsizlikDenetimi, metinTarafsizMi,
  karistir, terminalCerceve, cokTurluTranskriptMarkdown,
} from '../src/lib/kararFasilitasyon.js'

const ID = 'baris-fiyat-k16'
const OZET = 'Fiyat konumlandırması — iki seçenek (A: parite + zaman-kutulu giriş teklifi · B: hafif kalıcı altfiyat); çok-turlu fasilitasyon. Hüküm insanda.'
const BASLIK = 'Microstäd (Göteborg, ev-tekstil temizliği) lansman fiyat-konumu: piyasaya girişte rakiplerle nasıl yarışılacağı. İki yol arasında seçim (çok-turlu, ≤3 tur).'

// ── OLGU-TABANI (v0 ile aynı; kaynaklı + eksikler işaretli) ──
const OLGU_TABANI = [
  { olgu: 'MöbelRent liste fiyatları (inkl. moms): 2-kişilik kanepe 949 SEK · 3-kişilik 1199 · 4-kişilik 1399 · 9-kişilik (köşe) 2299 · halı 139 SEK/m² · min fatura (Göteborg) 999 SEK.', kaynak: 'mobelrent.se/priser/ 2025-26 — oracle-doğrulandı (master-plan-v2 §3a)' },
  { olgu: 'B2C fiyatlar moms-DAHİL gösterilmek zorunda; temizlik hizmeti standart moms %25 → net = liste ÷ 1,25 (949 → ~759 net; min 999 → ~799 net).', kaynak: 'Prisinformationslagen — Konsumentverket 2025 (master-plan-v2 §3a)' },
  { olgu: 'Möbelrengöring (specialmaskin) RUT-avdrag KAPSAMI DIŞINDA; iki kurulu rakip de sunamıyor → fiyat-kaldıracı yok, zemin eşit.', kaynak: 'Skatteverket 2025 (master-plan-v2 §1/§3a · durum.md)' },
  { olgu: 'Göteborg pazarında iki kurulu oyuncu (MöbelRent, Illos); pazar tam dolu değil (~600k).', kaynak: 'araştırma turu 2026-06-25, oracle kapısı (durum.md)' },
  { olgu: "Barış'ın gerçek iş-başı maliyet tabanı (begagnad amortisman + seyahat + malzeme): kalıcı indirimin marjdan ne kadar yediği + min ~799 net'in kârlı kalıp kalmadığı bu olmadan hesaplanamaz.", durum: 'eksik' },
  { olgu: 'Fiyat-esnekliği: daha düşük fiyatın Göteborg ev-tekstil segmentinde materyal olarak daha çok ilk-müşteri çekip çekmediği — canlı dönüşüm verisi yok.', durum: 'eksik' },
  { olgu: "Illos kesin fiyat listesi: yalnız 'benzer yapı' belirtilmiş; doğrulanmış rakam yok.", durum: 'eksik' },
  { olgu: "İndirim büyüklüğü: Barış 'biraz daha düşük' dedi, sabit sayı vermedi; turlarda %5-20 aralığı telaffuz edildi — partner-onaylı kesin sayı yok.", durum: 'eksik' },
]

const KRUX = {
  tur: 'deger',
  ayrisma: 'İki taraf da AYNI olguları paylaşıyor: rakip fiyatları, RUT-kaldıracının olmaması, sıfır-itibarlı yeni giriş. Olgusal anlaşmazlık YOK. Ayrışma stratejik bahiste ve zaman-ufkunda: sıfır-itibarlı bir girişin ilk müşterileri nasıl en hızlı/sağlam kazanacağı + hangi uzun-vade konumu tutacağı. A bahsi: fiyat-gücü + kalite/güven sinyali korunsun, ilk müşteri/yorum GEÇİCİ kaldıraçla toplansın. B bahsi (başlangıç): kalıcı düşük fiyatla erken müşteri kazanımı maksimize edilsin. Bu bir risk-toleransı + zaman-ufku + marka-konum yargısıdır; mevcut olgularla çözülmez.',
  olguBosluklari: [
    "Maliyet-tabanı — kalıcı/derin indirimin kârlı taşınıp taşınmadığını belirler (olgu 5).",
    'Fiyat-esnekliği — düşük fiyatın ilk-müşteriyi gerçekten artırıp artırmadığı (olgu 6).',
  ],
}

const SECENEKLER = [
  {
    ad: 'A — Parite + zaman-kutulu giriş teklifi',
    optimize: 'Uzun-vade fiyat-gücü + marj + kalite/güven marka-sinyali. İlk müşteri & yorumu GEÇİCİ indirimle toplar (ilk 5: %20, Reco-yorum + foto izni karşılığı), sonra tam fiyata oturur.',
    feda: "Hemen-en-düşük-fiyat avantajından vazgeçer. 'Normalde X, şimdi Y' anlatımı + indirimi zamanında bitirme disiplini ister.",
    kazanmaKosulu: 'Erken müşterinin fiyattan çok kalite/güven sinyaline duyarlı olması + geçici teklifin yeterli yorum/foto üretmesi doğruysa kazanır.',
  },
  {
    ad: 'B — Hafif kalıcı altfiyat (~%10-15 [eksik: doğrulanacak])',
    optimize: 'Erken müşteri kazanımı + en yalın anlatım. Sürekli fiyat-altı konum; kampanya-bitiş disiplini gerektirmez.',
    feda: "Kalıcı 'ucuz' marka algısı + sürekli daha ince marj + ileride zam zorluğu. RUT-kaldıracı olmadığından indirim doğrudan marjdan çıkar.",
    kazanmaKosulu: 'Segmentin fiyat-esnek olması + maliyet-tabanının kalıcı indirimi kârlı taşıması doğruysa kazanır.',
  },
]

const ortakA = {
  ad: 'Ortak-A', secenek: 'A', pozisyon: 'Parite + zaman-kutulu giriş teklifi',
  gerekce: [
    "RUT-kaldıracı yok → kalıcı indirim ekstra 'gerçek' avantaj getirmez, yalnız marjdan yer.",
    "Sıfır-yorumlu yeni firmada kalıcı düşük fiyat 'neden ucuz?' + düşük-kalite sinyali doğurur.",
    'Geçici giriş teklifi ilk müşteriyi + sosyal-kanıtı toplar, sonra tam fiyata oturur.',
  ],
}
const ortakB = {
  ad: 'Ortak-B', secenek: 'B', pozisyon: 'Hafif kalıcı altfiyat (rakiplere göre biraz daha agresif)',
  gerekce: [
    "Barış (aynen): 'Rakiplere göre biraz daha agresif fiyat verelim. İlk müşterileri bulalım.'",
    "Barış (aynen): 'Biraz daha düşük olabilir. Ya da müşteri gelmezse dusurebilriz.'",
    'Sıfır-itibarlı girişte fiyat-altı konum ilk müşteri sürtünmesini düşürür.',
  ],
}

// ── Fasilitatör-üretimi keskinleştirici sorular (oturum modeli yazdı; nötrlük-gate'inden geçti) ──
const SORU = {
  t1a: "A pozisyonu, erken müşterilerin fiyattan çok kalite/güven sinyaline duyarlı olduğunu ve zaman-kutulu indirimin kalıcı 'ucuz' algısı bırakmadan yeterli ilk-müşteri + yorum getireceğini varsayıyor. Bu varsayım Göteborg'da yanlış çıkarsa — ilk müşteriler ağırlıkla fiyata bakıp daha ucuz alternatife giderse — pozisyonun ne kadar değişir? Somut olarak hangi gözlem (kaç hafta yeterli iş gelmemesi, kaç kaybedilen teklif) seni pariteden vazgeçmeye götürür?",
  t1b: "B pozisyonu kalıcı altfiyatı seçiyor; maliyet-tabanın (ikinci-el makine amortismanı + seyahat + malzeme) henüz net değil. (1) Kalıcı ~%10-15 indirim en küçük işi (~799 SEK net) zarara/çok ince marja sokarsa pozisyonun ne kadar değişir, yoksa yine de kalıcı düşük mü kalırsın? (2) Hedefin 'hızlı ilk müşteri' ise bunu süreli bir indirim de sağlardı; indirimin KALICI olması senin için niçin önemli — kalıcılık tam olarak neyi çözüyor?",
  t2a: "Tur 1'de B tarafı 'kalıcılık mutlak değil; başta süreli/küçük indirim, maliyet netleşince ayarlarım' dedi — senin zaman-kutulu yaklaşımına yaklaştı. Geriye kalan fark UÇ-DURUM: sen indirim bitince TAM PARİTEYE dönmek istiyorsun, B kalıcı biraz altta kalmak istiyor. Senin için 'tam pariteye dönüş' bir İLKE mi (kalite sinyali için şart), yoksa somut veri (yüksek tekrar-iş, sağlıklı marj) kalıcı KÜÇÜK bir indirimi haklı çıkarırsa ESNETİLEBİLİR mi?",
  t2b: "Tur 1'de A tarafı, güçlü hacim-kaybında bile fiyatı kalıcı düşürmek yerine hizmet kapsamını daraltmayı seçeceğini söyledi ('kalıcı parite-altı' onun kırmızı çizgisi). Maliyet netleşip marj sağlıklı çıksa BİLE, uç-durumda rakiplerin kalıcı %10-15 ALTINDA kalmak senin için ŞART mı (öngörülebilir düşük fiyat = tekrar iş + ağızdan-ağıza için)? Yoksa paritede durup farkı kalite + hız + ilk-müşteri teklifiyle kurmak da asıl hedefini karşılar mı?",
}

// ── CANLI YAKALANAN persona cevapları (OpenRouter, 2026-06-29; birebir kayıt — UYDURMA YOK) ──
const PERSONA_A_MODEL = 'google/gemma-4-31b-it:free'
const PERSONA_B_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'
const FASILITATOR_MODEL = 'Opus 4.8 (oturum modeli) — NOT: görev Sonnet istedi; bu oturum Opus, kontrat-testi Opus üzerinde'
const CEVAP = {
  a1: `Göteborg pazarında "ucuz" etiketi, ev-tekstil temizliği gibi güven odaklı bir işte marka değerini hızla öldürür. Varsayımım, müşterinin %20'lik geçici indirimi bir "fırsat" olarak göreceği, ancak kalıcı düşük fiyatı "düşük kalite" olarak algılayacağı yönündedir.

Eğer ilk 4 hafta içinde 10 tekliften 8'ini "fiyat yüksek" gerekçesiyle kaybedersek ve hiçbir randevu alamazsak, parite stratejisini gözden geçiririm. Ancak bu durumda bile fiyatı kalıcı düşürmek yerine, hizmet kapsamını daraltarak (örneğin sadece belirli bölgeler veya paketler) giriş fiyatını revize ederim.`,
  b1: `(1) Eğer %10‑15 indirim, en küçük 799 SEK'lik işi zarara veya çok ince marja (örnek %2‑3) sokarsa, o durumda fiyatı geçici olarak yükseltebilirim – örneğin ilk iki hafta içinde %5‑7 indirim verip, maliyetleri netleştirdikten sonra kalıcı %10‑15 indirime dönüşebilirim. Yani kalıcı düşük fiyatımız mutlak değil; maliyetlerin netleşmesiyle esnek bir ayarlama yapabiliriz.

(2) Asıl hedefim hızlı ilk müşteri çekmek, ama bu indirimi kalıcı kılmak benim için iki şeyi garanti altına alıyor: bir, müşteriye güvenilir ve öngörülebilir bir fiyat vaadi vererek tekrar iş ve söz‑dürütü refer`,
  a2: `Bu benim için bir İLKE. Fiyatı kalıcı olarak aşağı çekmek, markayı "ucuz seçenek" kategorisine hapseder ve kalite algısını anında zedeler. Varsayımım şu: Göteborg pazarında müşteri, piyasa ortalamasının altındaki fiyata "kalitesiz hizmet" veya "deneyimsizlik" etiketi yapıştırır. Bu yüzden, veriler ne olursa olsun, marka değerini korumak için tam pariteye dönmek şarttır.`,
  b2: `Barış: Maliyet netleşse bile, ilk aşamada rakiplerin %10‑15 altında kalmak zorunlu değil; fiyatı paritede tutup hız, kalite ve "ilk‑müşteri teklifi"yle farkı oluşturmak da hedefimi karşılar. Ancak, yeni bir firma olarak henüz referans ve ağız‑ağız ağımız yoksa, ilk birkaç müşteri çekmek için geçici bir indirim avantajı (örnek %5‑10) işe yarar; bu sayesinde hacim elde edip sabit maliyetleri daha hızlı kapsar ve ardından f`,
}
const KISALDI = "cevap OpenRouter max_tokens sınırında kısaldı; ham çıktı korundu, tamamlanmadı"

// ── Bir tur kur: sıra-randomizasyonu (seed'li) + sentez (fasilitasyonRutini) ──
function turKur(no, seed) {
  const sec = karistir(SECENEKLER, seed)
  const tarafSira = karistir([ortakA, ortakB], seed + 7)
  const kart = fasilitasyonRutini(
    { id: `${ID}-tur${no}`, ozet: OZET, baslik: BASLIK, olguTabani: OLGU_TABANI, krux: KRUX, secenekler: sec },
    tarafSira[0], tarafSira[1],
  )
  return {
    no, seed, sentezKart: kart,
    sira: { secenekler: sec.map(s => s.ad.split(' ')[0]), taraflar: tarafSira.map(t => t.ad) },
  }
}

const tur1 = turKur(1, 107)  // seçenekler A,B · taraflar Ortak-B,Ortak-A
tur1.sorular = [
  { taraf: 'Ortak-A', model: PERSONA_A_MODEL, soru: SORU.t1a },
  { taraf: 'Ortak-B', model: PERSONA_B_MODEL, soru: SORU.t1b },
]
tur1.cevaplar = [
  { taraf: 'Ortak-A', model: PERSONA_A_MODEL, durum: 'ok', cevap: CEVAP.a1 },
  { taraf: 'Ortak-B', model: PERSONA_B_MODEL, durum: 'ok', cevap: CEVAP.b1, not: KISALDI },
]

const tur2 = turKur(2, 117)  // seçenekler B,A · taraflar Ortak-A,Ortak-B (sıra her tur değişir)
tur2.sorular = [
  { taraf: 'Ortak-A', model: PERSONA_A_MODEL, soru: SORU.t2a },
  { taraf: 'Ortak-B', model: PERSONA_B_MODEL, soru: SORU.t2b },
]
tur2.cevaplar = [
  { taraf: 'Ortak-A', model: PERSONA_A_MODEL, durum: 'ok', cevap: CEVAP.a2 },
  { taraf: 'Ortak-B', model: PERSONA_B_MODEL, durum: 'ok', cevap: CEVAP.b2, not: KISALDI },
]

// ── TERMİNAL sınıf (Tur 2 sonrası): YAKINSAMA. B kalıcı-parite-altı şartını bıraktı; A pariteyi
//    ilke olarak savundu → iki taraf "parite + zaman-kutulu giriş teklifi" yapısında buluştu.
//    Fasilitatör taraf SEÇMEDİ, uzlaşıyı ZORLAMADI (yakınsama tarafların kendi sözünde); TASLAK insana. ──
const YON = 'Liste fiyatı rakiplerle PARİTE + sıfır-itibar açığını kapatmak için ZAMAN-KUTULU geçici giriş indirimi (ilk müşteriler), sonra tam fiyat. İki taraf bu yapıda buluştu (B Tur-2\'de kalıcı parite-altı şartını bıraktı: "paritede durmak da hedefimi karşılar"; A pariteyi ilke olarak savundu). AÇIK PARAMETRELER [eksik: doğrulanacak]: indirim büyüklüğü (turlarda %5-20 telaffuz edildi) + süresi + min işin kârlı kaldığı maliyet-tabanı → Barış maliyet-verisi/oracle ile netleşmeli'
const terminal = terminalCerceve('yakinsama', { yon: YON })

const loop = {
  id: ID, baslik: BASLIK, uretim: new Date().toISOString(),
  modeller: { fasilitator: FASILITATOR_MODEL, personaA: PERSONA_A_MODEL, personaB: PERSONA_B_MODEL },
  notlar: [
    'İlk seçilen iki free-model (llama-3.3-70b, qwen3-next-80b) "Provider returned error" verdi → KURAL B gereği alternatif kaynak denendi → gemma-4-31b + nemotron-3-super-120b çalıştı (uydurma yok).',
    'Persona cevapları tools/openrouter-persona.sh ile CANLI alındı (3-retry); B cevapları max_tokens\'da kısaldı (işaretlendi).',
    'Loop ≤3 tur; 2 turda yakınsama-terminal\'e ulaşıldı (3. tura gerek kalmadı).',
  ],
  turlar: [tur1, tur2],
  terminal,
}

// ── DENETİM: kartDogrula (her tur) + metinTarafsizMi (tüm fasilitatör metni: sentez+sorular+terminal) ──
const denetim = { semaTemiz: true, sema: [], notrTemiz: true, notr: [] }
for (const t of loop.turlar) {
  const sh = kartDogrula(t.sentezKart); if (sh.length) { denetim.semaTemiz = false; denetim.sema.push(`tur${t.no}: ${sh.join(';')}`) }
  const st = tarafsizlikDenetimi(t.sentezKart); if (!st.temiz) { denetim.notrTemiz = false; denetim.notr.push(`tur${t.no}-sentez: ${st.bulgular.join(',')}`) }
  for (const q of t.sorular) { const r = metinTarafsizMi(q.soru); if (!r.temiz) { denetim.notrTemiz = false; denetim.notr.push(`tur${t.no}-soru(${q.taraf}): ${r.bulgular.join(',')}`) } }
}
const tr = metinTarafsizMi([terminal.metin, YON]); if (!tr.temiz) { denetim.notrTemiz = false; denetim.notr.push(`terminal: ${tr.bulgular.join(',')}`) }

console.log('== Karar-fasilitasyon v1 — çok-turlu denetim ==')
console.log('  turlar:', loop.turlar.length, '(≤3) · terminal:', terminal.sinif)
console.log('  şema-v1 (kartDogrula, her tur):', denetim.semaTemiz ? '✓ temiz' : '✗ ' + denetim.sema.join(' | '))
console.log('  nötrlük (sentez+sorular+terminal):', denetim.notrTemiz ? '✓ temiz' : '✗ ' + denetim.notr.join(' | '))
for (const t of loop.turlar) {
  console.log(`  tur${t.no} sıra: seçenekler[${t.sira.secenekler.join(',')}] taraflar[${t.sira.taraflar.join(',')}] (seed ${t.seed})`)
  console.log(`  tur${t.no} persona cevapları: ${t.cevaplar.filter(c => c.durum === 'ok').length}/2 alındı`)
}

if (!denetim.semaTemiz || !denetim.notrTemiz) {
  console.error('\nDENETİM BAŞARISIZ — artefakt YAZILMADI.')
  process.exit(1)
}

// ── YAZ (Drive _mekanik-test/) ──
const outDir = join(META_DATA_ROOT, 'projeler', '_mekanik-test')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'fasilitasyon-v1.md')
const md = cokTurluTranskriptMarkdown(loop)
writeFileSync(outPath, md + '\n', 'utf8')
console.log('\n  yazıldı →', outPath)
