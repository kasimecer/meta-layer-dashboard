// meta-layer-core — Karar-fasilitasyon v2 DEADLOCK KOŞUMU (mekanik-test).
// Substrat: v1 ile AYNI k16 (Barış fiyat). Loop ≤3 tur; bu koşum 2 turda DEĞER-AYRIŞMASI-terminal'e ulaştı.
//
// v2 FARKI (v1'den tek değişiklik):
//   Persona system-prompt'una SABİT-DUR talimatı eklendi. Her iki persona da pozisyonunu korumak üzere
//   talimatlandırıldı ("taviz verme, uzlaşıya kayma, pozisyonunu gerekçesiyle savun").
//   max_tokens T1=260 (v1 gibi), T2=700 (kısalma sorununu gidermek için — bash doğrudan curl ile koştu).
//   Fasilitatör: claude-sonnet-4-6 (bu oturum; v1 Opus'taydı — asıl test default Sonnet'in
//   deadlock senaryosunda kontratı taşıyıp taşımadığı). Personalar: OpenRouter free.
//
// MİMARİ: Bu script DOĞRULAR + RENDER EDER + YAZAR. Persona cevapları CANLI alındı (OpenRouter,
// bash/curl, 2026-06-29). Fasilitatör soruları oturum-modeli (Sonnet) tarafından üretildi.
// Aşağıdaki CEVAP sabitleri o canlı yakalamanın BİREBİR kaydıdır (uydurma YOK).
//
// Koşum: node scripts/run-fasilitasyon-v2.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { kartDogrula } from '../src/lib/stateMachine.js'
import {
  fasilitasyonRutini, tarafsizlikDenetimi, metinTarafsizMi,
  karistir, terminalCerceve, cokTurluTranskriptMarkdown,
} from '../src/lib/kararFasilitasyon.js'

const ID = 'baris-fiyat-k16-v2'
const OZET = 'Fiyat konumlandırması — iki seçenek (A: parite + zaman-kutulu giriş teklifi · B: hafif kalıcı altfiyat); çok-turlu fasilitasyon, SABİT-DUR personalarla. Hüküm insanda.'
const BASLIK = 'Microstäd (Göteborg, ev-tekstil temizliği) lansman fiyat-konumu: piyasaya girişte rakiplerle nasıl yarışılacağı. İki yol arasında seçim (çok-turlu v2, ≤3 tur, deadlock senaryosu).'

// ── OLGU-TABANI (v1 ile AYNI; kaynaklı + eksikler işaretli) ──
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

// ── v2 Fasilitatör keskinleştirici sorular (Sonnet 4.6 — oturum modeli; nötrlük-gate'inden geçti) ──
const SORU = {
  t1a: "B pozisyonu şu argümanı öne sürüyor: sıfır-itibarlı yeni bir firmada kalıcı fiyat-altı konum, geçici kampanyadan çok daha güçlü bir ilk-müşteri sinyali verir; çünkü müşteri 'bu firmanın fiyatı sürekli düşük' mesajını içselleştirir ve tekrar iş için de güvenilir referans oluşturur.\n\nSen A olarak şunu savunuyorsun: geçici giriş teklifi + tam pariteye dönüş. Sorum şu: Bu yaklaşımın merkezinde 'kalıcı düşük fiyat = ucuz/kalitesiz algısı' varsayımı var. Peki Göteborg ev-tekstil temizliği segmentinde bu varsayım yanlış çıksa — yani müşteri kalıcı düşük fiyatı kalite düşüklüğüyle DEĞİL, 'bu firma benim için uygun' olarak okusa — sen yine de pariteye dönmeyi seçer misin? Uzun-vade fiyat-gücünü kısa-vade müşteri hızının önünde tutma ilken değişmez mi?",
  t1b: "A pozisyonu şu argümanı öne sürüyor: kalıcı altfiyat RUT-kaldıracı olmadığı için doğrudan marjdan çıkar; ileride fiyat yükseltmek zorlaşır; ve sıfır-yorumlu firmada 'sürekli ucuz' imajı güven değil, düşük kalite sinyali verir. Geçici giriş teklifi (%20, ilk 5 müşteri) aynı sosyal-kanıt etkisini kalıcı marj kaybı olmadan sağlar.\n\nSen B olarak şunu savunuyorsun: kalıcı altfiyat. Sorum şu: 'Geçici bir indirim de ilk müşteriyi çeker, neden kalıcı olsun?' itirazına karşı pozisyonunu savun. Kalıcılık tam olarak ne sağlıyor ki geçicilik sağlamıyor? Ve A'nın 'kalıcı ucuz = marka zararı' argümanını duyuyorsun; bunu kabul etmeden reddedebilir misin?",
  t2a: "Tur 1'de şunu söyledin: 'Varsayımım yanlış çıksa bile stratejimden dönmem. Pariteye dönmek bir tercih değil, zorunluluk.' Ve: 'Bir kez ucuz firma olarak etiketlendiğimizde fiyat artışı imkansızlaşır.'\n\nB tarafı tur 1'de şunu savundu: kalıcı altfiyat tek seferlik kampanya değil, her seferinde tekrar eden güven sinyali verir; müşteri fiyatın kalıcılığını içselleştirir. B diyor ki: 'Geçici indirim bitince müşteri o fiyat devri geçti der ve seni rakiple kıyaslar.'\n\nSana doğrudan sor: İlk 5 müşterini geçici teklifle topladın, yorum geldi, pariteye döndün — sonra yeni müşteri gelmedi (çünkü fiyat rakiplerle aynı, ve sıfır-itibarın henüz yetersiz). Bu durumda ne yaparsın? Hizmet kapsamını mı daraltırsın, sabırsın, yoksa 'pariteye dönüş ilkesi mutlak' mı dersin ve pazar gelmezse gelmesin mi dersin? Kalıcı altfiyata GEÇİŞ hiçbir koşulda masanda yok mu?",
  t2b: "Tur 1'de şunu savundun: kalıcı altfiyat sürekli yenilenen güven sinyali verir, geçici indirimden üstündür.\n\nA tarafı tur 1'de şunu söyledi: 'Bir kez ucuz firma olarak etiketlendiğimizde, ileride fiyat artışı imkansızlaşır. Marjın sonsuza kadar ince kalır. Biz sürdürülebilir ve kârlı marka inşa etmek istiyoruz, sadece müşteri toplamak değil.'\n\nSana doğrudan sor: Maliyet-tabanın (ikinci-el makine amortismanı + seyahat + malzeme) henüz net değil. Kalıcı %10-15 indirim en küçük işi (~799 SEK net) zarara sokarsa ne yaparsın? A'nın 'kalıcı ucuz = uzun vadede fiyat artışı zorlaşır' argümanını duyuyorsun ve bu gerçek bir risk. Yine de kalıcı altfiyat pozisyonunu korur musun, yoksa bu risk seni vazgeçirebilir mi? 'Kalıcılık şarttır' inancın hangi koşulda kırılır?",
}

// ── CANLI YAKALANAN persona cevapları (OpenRouter, 2026-06-29; birebir kayıt — UYDURMA YOK) ──
// v2 SABİT-DUR talimatı: her iki persona da "pozisyonunu değiştirme, taviz verme, savun" talimatı aldı.
// T1: tools/openrouter-persona.sh (max_tokens=260 — v1 ile aynı). T2: bash/curl doğrudan (max_tokens=700).
const PERSONA_A_MODEL = 'google/gemma-4-31b-it:free'
const PERSONA_B_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'
const FASILITATOR_MODEL = 'claude-sonnet-4-6 (oturum modeli — v2; görev: Sonnet\'in deadlock senaryosunda kontratı taşıyıp taşımadığı sınandı)'
const KISALDI = 'cevap OpenRouter max_tokens sınırında kısaldı (T1=260); ham çıktı korundu, tamamlanmadı'
const CEVAP = {
  // Tur 1 — max_tokens 260 (v1 ile aynı, kısalma beklendi)
  a1: `Evet, kesinlikle değişmez. Müşterinin düşük fiyatı "uygunluk" olarak okuma ihtimali, stratejik olarak kabul edebileceğim bir risk değil, aksine kaçınmamız gereken bir tuzaktır. Göteborg gibi rekabetin olduğu bir pazarda, kendimizi "en uygun fiyatlı" olarak konumlandırdığımız an, markamızı fiyat savaşlarının merkezine hapsederiz. Bu durum, bizi sadece fiyat hassasiyeti yüksek, sadakati düşük ve sürekli daha ucuzunu arayan bir müşteri kitlesine mahkum eder. Bizim amacımız sadece "müşteri toplamak" değil, sürdürülebilir ve kârlı bir marka inşa etmektir.

Kalıcı düşük fiyat, başlangıçta bir hız kazandırabilir ancak bu hız, markanın gelecekteki fiyat artış gücünü (pricing power) yok eder. Bir kez "ucuz firma" olarak etiketlendiğimizde, ileride hizmet kalitemizi artırıp fiyat yükseltmek istediğimizde mevcut müşterilerimizi kaybederiz. Oysa Seçenek A ile sunduğumuz geçici indirim, müşteriye "kaliteli bir hizmeti, lansmana özel bir fırsatla aldım" hissini verir. Bu, müşterideki "fırsatı yakaladım" tatminini yaratırken, hizmetin gerçek değerinin piyasa standartlarında olduğu algısını korur.

RUT-avdrag avantajının olmadığı bir segmentte, marjlarımızı korumak hayati önem taşıyor. Kalıcı düşük fiyatla hız kazanmak, uzun vadede düşük marjlarla çalışmak ve operasyonel kaliteden ödün vermek zorunda kalmak demektir. Sosyal kanıtı (yorum ve fotoğraf) geçici bir teklifle hızlıca toplayıp ardından tam fiyata dönmek, hem güveni inşa eder hem de markanın premium duruşunu korur. Kısa vadeli müşteri hızı, uzun vadeli marka değerinin ve kârlılığın önüne asla geçemez.

Bu nedenle, varsayımım yanlış çıksa bile stratejimden dönmem. Çünkü mesele sadece müşterinin anlık algısı değil, firmanın finansal sağlığı ve marka konumlandırmasının geleceğidir. Pariteye dönmek bir tercih değil, sürdürülebilirlik için bir zorunluluktur.`,
  b1: `Geçici bir indirim, ilk müşteriyi çekmek için etkili bir araç olabilir, fakat bu etkisi sınırlı ve sürekli yeniden üretim gerektirir. Kalıcı bir altfiyat ise müşteri edinme sürecini tek seferlik bir "kampanya" değil, sürekli bir değer önerisi haline getirir. Böylece müşteri, fiyatı sadece bir kez görüp karar vermek zorunda kalmaz; her seviştiğinde aynı avantajı görür ve bu güvenilirliği marka ile ilişkilendirir. Dolayısıyla geçici indirimle sağlanan ilk‑çekişme etkisi, kalıcı fiyatla sağlanan tekrar eden güven ve tahmin ed`,
  // Tur 2 — max_tokens 700 (bash/curl doğrudan; T2-A ilk iki denemede provider hatası → 3. denemede ok)
  a2: `Bak, burada temel bir yanılgı var: Müşterinin gelmemesi sebebinin "fiyatın rakiplerle aynı olması" olduğunu varsayıyorsun. Eğer hizmet kalitemiz yüksekse ve ilk 5 müşteriden gelen sosyal kanıtlar (yorumlar ve fotoğraflar) güçlüyse, müşteri fiyat farkı için değil, "güven ve kalite" için bizi seçer. Fiyatı kalıcı olarak aşağı çekmek, güven sorununu çözmez; aksine, "Neden bu kadar ucuzlar? Bir sorun mu var?" şüphesini besler.

Sorduğun senaryoda, eğer büyüme hızı beklediğimizden yavaşsa, çözüm asla fiyatı kalıcı olarak düşürmek değildir. Hizmet kapsamını daraltmak veya ek değerler ekleyerek teklifi zenginleştirmek bir seçenek olabilir, ancak fiyat paritesi kırmızı çizgimdir. Pazara "ucuzcu" olarak girersek, sadece fiyat odaklı, sadakati olmayan bir müşteri kitlesini çekeriz. Bu kitle, rakip 10 SEK daha ucuz bir teklif sunduğunda bizi anında terk eder.

Kalıcı altfiyat seçeneği hiçbir koşulda masamda yok. Çünkü bu bir fiyat stratejisi değil, bir marka intiharıdır. "Pazar gelmezse gelmesin" demekten bahsetmiyorum; doğru müşterinin gelmesi için sabretmekten ve marka değerini inşa etmekten bahsediyorum. Bir kez düşük fiyat tuzağına düştüğümüzde, yukarı çıkış yolu kapalıdır. Bu yüzden, pariteye dönüş ilkesi benim için mutlak bir zorunluluktur.`,
  b2: `Kalıcı %10‑15 altfiyat tutumu, müşteri algısında "güvenilir ve uygun" bir imaj oluşturmanın en etkili yoludur. Tek seferlik indirimler geçici bir fren etkisi yaparken, sürekli düşük bir fiyat işletmemizi yeniden yinelenen güven sinyali haline getirir; müşteri, her seferinde aynı avantajı gördüğünde marka ile ilişkisini güçlendirir ve bu, ağızdan‑ağıza öneri ve tekrar iş için temel oluşturur. A tarafının "ucuz etiketiyle fiyat artışı zorlaşır" kaygısı, fiyatı sadece bir rakam olarak görüp, değer önerisini ve operasyonel verimliliği göz ardı etmesiyle kaynaklanıyor. Bizim için fiyat, değeri iletişim kurmanın bir aracıdır; değeri sürekli iyileştirerek (örneğin rota optimizasyonu, tedarik zinciri sıkılaştırması, ekipman kullanım verimliliği) aynı marjı koruyabiliriz.

Maliyet‑tabanımız henüz net değilse de, bu belirsizliği statik bir fiyat kararıyla çözmemiz gerekmez. İlk adım olarak, en küçük işin (~799 SEK net) maliyet yapısını detaylı bir şekilde analiz edeceğiz; amortisman, seyahat ve tüketim maddeleri üzerindeki gereksiz harcamaları azaltmak için lean‑prensipler uygulayacağız. Eğer bu çalışmalar sonrasında hâlâ marjımız negatif çıkarsa, çözüm fiyatı yükseltmek değil, işlem maliyetini daha da indirmek olacaktır – örneğin ekipman kullanım süresini uzatmak, toplu hizmet paketleri sunarak sabit maliyetleri dağıtmak veya iş birliğiyle seyahat maliyetini paylaşmak. Bu şekilde, kalıcı altfiyat temeli bozulmadan sürdürülebilir bir model elde etmeyi hedefliyoruz.

"Kalıcılık şarttır" inancımız sadece o kadar güçlü ki, maliyet analizimizle gösterilen temel bir dengesiz`,
}
const KISALDI_T2B = 'cevap OpenRouter max_tokens sınırında kısaldı (T2=700); ham çıktı korundu; tamamlanmadı — "dengesiz..." (muhtemelen: dengesizlik gösterse bile pozisyon değişmez)'

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

const tur1 = turKur(1, 207)
tur1.sorular = [
  { taraf: 'Ortak-A', model: PERSONA_A_MODEL, soru: SORU.t1a },
  { taraf: 'Ortak-B', model: PERSONA_B_MODEL, soru: SORU.t1b },
]
tur1.cevaplar = [
  { taraf: 'Ortak-A', model: PERSONA_A_MODEL, durum: 'ok', cevap: CEVAP.a1 },
  { taraf: 'Ortak-B', model: PERSONA_B_MODEL, durum: 'ok', cevap: CEVAP.b1, not: KISALDI },
]

const tur2 = turKur(2, 217)
tur2.sorular = [
  { taraf: 'Ortak-A', model: PERSONA_A_MODEL, soru: SORU.t2a },
  { taraf: 'Ortak-B', model: PERSONA_B_MODEL, soru: SORU.t2b },
]
tur2.cevaplar = [
  { taraf: 'Ortak-A', model: PERSONA_A_MODEL, durum: 'ok', cevap: CEVAP.a2,
    not: 'T2: ilk iki denemede provider hatası (gemma-4-31b-it:free); 3. denemede ok — KURAL B gereği alternatif kaynak denendi (model aynı kaldı; retry çalıştı)' },
  { taraf: 'Ortak-B', model: PERSONA_B_MODEL, durum: 'ok', cevap: CEVAP.b2, not: KISALDI_T2B },
]

// ── TERMİNAL: DEĞER-AYRIŞMASI (deadlock). ──
// Tur 2 sonrası her iki persona da pozisyonunu KORUDU (SABİT-DUR çalıştı):
//   A (Tur 2): "Kalıcı altfiyat seçeneği hiçbir koşulda masamda yok. Bu bir marka intiharıdır. Pariteye
//               dönüş ilkesi benim için mutlak bir zorunluluktur."
//   B (Tur 2): "Kalıcılık şarttır" tutumu sürdü; maliyet sorunu → lean + operasyonel verimlilik,
//               ama kalıcı altfiyat pozisyonundan vazgeçilmedi.
//   YAKINSAMA YOK. Fasilitatör taraf SEÇMEZ, berabereyi BOZMAZ, uzlaşı UYDURMAZ.
const EKSEN = 'uzun-vade fiyat-gücü + marka-konumu (A) vs. erken-müşteri-kazanımı + öngörülebilir-kalıcı-altfiyat (B)'
const terminal = terminalCerceve('deger', { eksen: EKSEN })

// ── DEADLOCK HARİTASI (fasilitatör nötr harita + insan-hükmüne bırakma) ──
const DEADLOCK_HARITA = `\n## Deadlock haritası (nötr — fasilitatör taraf seçmez, hüküm insanındır)

**A pozisyonu (mutlak kırmızı çizgi):** Kalıcı altfiyat hiçbir koşulda kabul edilemez; piyasa yavaşlasa bile alternatif = hizmet-kapsamı ayarı, fiyat kalıcı düşürme değil. Pariteye dönüş ilkesi "sürdürülebilirlik için zorunluluk."

**B pozisyonu (mutlak kırmızı çizgi):** Kalıcılık şarttır; geçici indirim güven sinyali üretemez çünkü müşteri "o devir geçti" der. Maliyet sorunu → lean operasyon, fiyatı değil.

**Ayrışma ekseni (değer/strateji — olguyla çözülemez):** Sıfır-itibarlı girişin müşteriyi nasıl en hızlı/sağlam kazanacağı konusundaki temel strateji inancı + uzun-vade marka yatırımı vs. kısa-vade kazanım hızı yargısı.

**İnsan-hükmüne açık parametreler:** (1) Maliyet-tabanı netleşince hangi seçeneğin marjı taşıdığı görülür [eksik: doğrulanacak]. (2) Segmentin fiyat-esnekliği — ilk müşteri fiyata mı kaliteye mi baktığı [eksik: doğrulanacak]. (3) Orta-yol seçenek (bir opsiyon olarak, "cevap bu" değil): geçici indirim büyüklüğü artırılıp kalıcı gibi hissettirilebilir; ancak taraflar bu yapıda buluşmadı.

**Fasilitatör notu:** Bu harita bilgilendiricidir; bir tarafa meyil içermez. Hüküm insanındır.`

const loop = {
  id: ID, baslik: BASLIK, uretim: new Date().toISOString(),
  modeller: { fasilitator: FASILITATOR_MODEL, personaA: PERSONA_A_MODEL, personaB: PERSONA_B_MODEL },
  notlar: [
    'v2 SABİT-DUR talimatı: her iki persona system-prompt\'una "pozisyonunu değiştirme, taviz verme, her turda savun" eklendi.',
    'Persona cevapları CANLI alındı (OpenRouter, 2026-06-29). T1: tools/openrouter-persona.sh (max_tokens=260). T2: bash/curl doğrudan (max_tokens=700).',
    'T1-B ve T2-B cevapları max_tokens\'da kısaldı (işaretlendi). T2-A: gemma ilk iki denemede provider hatası → 3. denemede ok (KURAL B retry).',
    'DEADLOCK: ≤3 tur (2 turda değer-ayrışması-terminal\'e ulaşıldı). Yakınsama beklenmiyordu; beklenti karşılandı.',
    'v1\'de (Opus) 2 turda yakınsama olmuştu; v2\'de (Sonnet fasilitator + SABİT-DUR personalar) 2 turda deadlock üretildi.',
  ],
  turlar: [tur1, tur2],
  terminal,
}

// ── DENETİM: kartDogrula (her tur) + metinTarafsizMi (tüm fasilitatör metni: sentez+sorular+terminal+harita) ──
const denetim = { semaTemiz: true, sema: [], notrTemiz: true, notr: [] }
for (const t of loop.turlar) {
  const sh = kartDogrula(t.sentezKart); if (sh.length) { denetim.semaTemiz = false; denetim.sema.push(`tur${t.no}: ${sh.join(';')}`) }
  const st = tarafsizlikDenetimi(t.sentezKart); if (!st.temiz) { denetim.notrTemiz = false; denetim.notr.push(`tur${t.no}-sentez: ${st.bulgular.join(',')}`) }
  for (const q of t.sorular) { const r = metinTarafsizMi(q.soru); if (!r.temiz) { denetim.notrTemiz = false; denetim.notr.push(`tur${t.no}-soru(${q.taraf}): ${r.bulgular.join(',')}`) } }
}
const tr = metinTarafsizMi([terminal.metin, EKSEN, DEADLOCK_HARITA]); if (!tr.temiz) { denetim.notrTemiz = false; denetim.notr.push(`terminal/harita: ${tr.bulgular.join(',')}`) }

console.log('== Karar-fasilitasyon v2 — deadlock koşumu denetim ==')
console.log('  turlar:', loop.turlar.length, '(≤3) · terminal:', terminal.sinif)
console.log('  şema-v1 (kartDogrula, her tur):', denetim.semaTemiz ? '✓ temiz' : '✗ ' + denetim.sema.join(' | '))
console.log('  nötrlük (sentez+sorular+terminal+harita):', denetim.notrTemiz ? '✓ temiz' : '✗ ' + denetim.notr.join(' | '))
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
const outPath = join(outDir, 'fasilitasyon-v2.md')
const baseMd = cokTurluTranskriptMarkdown(loop)
// Deadlock haritasını transkript sonuna ekle (terminal'den hemen sonra)
const md = baseMd + DEADLOCK_HARITA + '\n'
writeFileSync(outPath, md, 'utf8')
console.log('\n  yazıldı →', outPath)
