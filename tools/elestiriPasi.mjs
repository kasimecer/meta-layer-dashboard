// Kritik Pasaj — master-plan TAMAMEN bileşik hâle geldikten SONRA çalışan, FARKLI-SOY bir
// modelle yürütülen tekil adversarial geçiş. Bölüm-yürüyüşünün BİR PARÇASI DEĞİLDİR — bilerek
// GERCEK_ASAMALAR/ASAMA_SIRASI dizisine EKLENMEDİ: o dizideki "SON_ASAMA = bölüm-yürüyüşü
// tetikleyicisi" varsayımını (planlamaLoopV2.mjs) bozardı, ve "L — Geriye-uyumluluk" legacy
// testinin beklentilerini (opt-in KAPALIYKEN master-plan'ın TEK invokasyonda tamamlanması)
// kırardı. Bunun yerine kendi tekil-birim "sıra"sıyla (SIRA=['elestiri']) mevcut birimKostur/
// soru-yanıt makinesini AYNEN yeniden kullanır — "her aşama gibi" (onay-bekliyor, blocker-
// gated, E yeniden-çağırana kadar hiçbir şey ilerlemez) davranışını YENİ kod icat etmeden verir.
//
// SÖZLEŞME: yalnız BU dosyanın çağırdığı openRouterCalistir* model çağırır. Kapı (yapısal
// ayrıştırma), prompt inşası, dosya yazımı, E-karar noktası HEPSİ deterministik harness.

import { readFileSync } from 'fs'
import { join } from 'path'
import { openRouterCalistirRetry } from './openRouterYurutucu.mjs'
import { guvenliYaz } from './canliYurutucu.mjs'
import { asamaDosyaAdi, statePersist } from './planlamaDurumMakinesiV2.mjs'
import { birimKostur, birimAcikDurum, birimSorulariUretVeYaz } from './planlamaBirimMotoru.mjs'

// ── Üretici-soy yasağı (SAFETY-CRITICAL) ────────────────────────────────────────────────────
// Aynı-soy bir eleştirmen üreticinin KÖR NOKTALARINI miras alır — bu pasajın TÜM amacı bunu
// önlemek. Desen-listesi bilerek GENİŞ (marka adı + yaygın model-aile adları) — "farklı slug
// ama aynı aile" kaçamağını da yakalar.
const URETICI_SOY_DESENLERI = [/claude/i, /anthropic/i, /\bsonnet\b/i, /\bopus\b/i, /\bhaiku\b/i]

export function farkliSoyMu(modelSlug) {
  const s = String(modelSlug ?? '')
  if (!s.trim()) return false
  return !URETICI_SOY_DESENLERI.some(d => d.test(s))
}

// openrouter.ai/api/v1/models'ten 2026-07-07'de CANLI doğrulandı (deepseek/deepseek-v4-pro,
// context 1.05M, reasoning.supported_efforts=[xhigh,high]) — slug/erişilebilirlik zamanla
// KAYABİLİR; bu sabiti periyodik olarak canlı listeye karşı yeniden-doğrula, elle tahmin ETME.
export const KRITIK_MODEL = 'deepseek/deepseek-v4-pro'
export const KRITIK_REASONING_EFFORT = 'xhigh' // "max-effort" varyantı — supported_efforts'un en yükseği

const ELESTIRI_KAPANIS = 'Çıktı → Bir sonraki adım: E kararı'

// ── Prompt (NASIL — bu dosyanın sahipliğinde) ───────────────────────────────────────────────
const SISTEM_PROMPT = `\
Sen bağımsız, düşman-kürsüsü (adversarial) bir stratejik eleştirmensin. Sana verilen iş planını
SEN ÜRETMEDİN — görevin onu çürütmeye çalışmaktır. Amacın onay vermek değil, plan gerçekten
uygulanırsa NEREDE kırılacağını bulmaktır. Nazik olma; doğru ol.

KURAL 1 — gerçekleri değil MANTIĞI hedefle: plandaki kaynaklı ([dogrulandi:...]) iddialar zaten
yukarı akışta doğrulandı, onları yeniden sorgulama. Bunun yerine STRATEJİK/MANTIKSAL kırılganlığa
odaklan: fiyatlama örtük olarak pazarın destekleyemeyeceği bir müşteri sayısı mı gerektiriyor?
Pazara-giriş zaman çizelgesi yol haritasıyla çelişiyor mu? Yanlış çıkarsa TÜM tezi çökertecek
gizli bir varsayım var mı?

KURAL 2 — [tip:birincil] ve [tip:icbilgi] etiketli iddialara ÖZEL dikkat et: bunlar yapısal
olarak dış kaynakla ASLA doğrulanamaz (birincil = henüz toplanmamış saha verisi gerektirir,
icbilgi = yalnız operatörün bildiği bir şey). Plan bu iki tipteki iddialara ne kadar AĞIR
yaslanıyorsa, o kadar kırılgan demektir — bunlar dipnot değil, ilk bakılacak yerdir.

KURAL 3 — çıktıyı TAM OLARAK verilen iskeletle üret. Biçim bozulursa cevabın mekanik olarak
İŞLENEMEZ ve tamamı reddedilir — serbest yorum EKLEME, iskelet dışına ÇIKMA.`

function elestiriPromptUret(proje, composedIcerik) {
  const { ad, aciklama } = proje
  return `\
PROJE: ${ad} — ${aciklama}

TAM PLAN (14 bölüm + provenans eki — iddialar, varsayım-kütüğü, doğrulama-tablosu dahil):
<plan>
${composedIcerik}
</plan>

GÖREV: Yukarıdaki planı SALDIR. ÇIKTI İSKELETİ — §, etiketler ve son satırı TAMAMEN AYNI YAZ:

# Kritik Pasaj — ${ad}

## §1 — En Kırılgan 3

### Kırılgan Nokta 1: [kısa başlık]
[gerekce] Bu nokta NEDEN kırılgan — hangi varsayıma veya zincire dayanıyor.
[bagimlilik] Hangi başka iddiaya/karara/plan-bölümüne bağımlı; o yanlışsa ne çöker.
[curutme-testi] Bunu KESİN olarak doğrulayacak veya çürütecek somut bir test/soru/deney.

### Kırılgan Nokta 2: [kısa başlık]
[gerekce] ...
[bagimlilik] ...
[curutme-testi] ...

### Kırılgan Nokta 3: [kısa başlık]
[gerekce] ...
[bagimlilik] ...
[curutme-testi] ...

## §2 — Kill-Koşulları

Bu proje TERK EDİLMELİDİR eğer:
- [somut, ölçülebilir koşul 1]
- [somut, ölçülebilir koşul 2]
- [gerekirse daha fazla]

## §3 — Öneri

[2-4 cümle: yukarıdaki bulgulara dayanan gerekçe — neden bu üç kırılgan nokta, kill-koşullarıyla
birlikte, aşağıdaki öneriyi haklı çıkarıyor.]

ÖNERİ: go|no-go|pivot

${ELESTIRI_KAPANIS}

ZORUNLU KURALLAR:
1. §1, §2, §3 bölüm işaretlerini TAMAMEN AYNI YAZ, bu sırayla.
2. §1'de TAM OLARAK 3 "### Kırılgan Nokta N:" alt-başlığı olmalı — ne az ne çok.
3. Her kırılgan nokta [gerekce]/[bagimlilik]/[curutme-testi] üçünü de TAM OLARAK bu köşeli-
   parantez biçiminde taşımalı.
4. §2'de en az 1 madde (- ile başlayan satır) olmalı.
5. "ÖNERİ: " satırı TAM OLARAK "go", "no-go" veya "pivot" değerlerinden BİRİNİ taşımalı (başka
   kelime/açıklama EKLEME, yalnız o tek kelime).
6. Son satır birebir: ${ELESTIRI_KAPANIS}
7. Belgenin başına/sonuna açıklama veya yorum EKLEME. Sadece belge içeriği.`
}

// ── Yapısal kapı (deterministik ayrıştırma — model çağrısı YOK) ────────────────────────────
const KIRILGAN_BASLIK_DESENI = /### Kırılgan Nokta \d+:/g
const ONERI_DESENI = /ÖNERİ:\s*(go|no-go|pivot)\b/i

export function elestiriKapidanGecerMi(icerik) {
  const metin = String(icerik ?? '')
  const idx1 = metin.indexOf('§1')
  const idx2 = metin.indexOf('§2')
  const idx3 = metin.indexOf('§3')
  if (idx1 === -1) return { gecti: false, neden: 'elestiri: §1 En Kırılgan 3 bölümü eksik' }
  if (idx2 === -1) return { gecti: false, neden: 'elestiri: §2 Kill-Koşulları bölümü eksik' }
  if (idx3 === -1) return { gecti: false, neden: 'elestiri: §3 Öneri bölümü eksik' }
  if (!(idx1 < idx2 && idx2 < idx3)) {
    return { gecti: false, neden: 'elestiri: bölüm sırası bozuk — beklenen §1 → §2 → §3' }
  }

  const bolum1 = metin.slice(idx1, idx2)
  const bolum2 = metin.slice(idx2, idx3)
  const bolum3 = metin.slice(idx3)

  const kirilganSayisi = (bolum1.match(KIRILGAN_BASLIK_DESENI) || []).length
  if (kirilganSayisi !== 3) {
    return { gecti: false, neden: `elestiri: §1 TAM OLARAK 3 "Kırılgan Nokta" alt-başlığı taşımalı (bulunan: ${kirilganSayisi})` }
  }
  for (const etiket of ['[gerekce]', '[bagimlilik]', '[curutme-testi]']) {
    const sayim = bolum1.split(etiket).length - 1
    if (sayim < 3) {
      return { gecti: false, neden: `elestiri: §1'deki her kırılgan nokta ${etiket} taşımalı (bulunan: ${sayim}/3)` }
    }
  }

  if (!/^\s*-\s+\S/m.test(bolum2)) {
    return { gecti: false, neden: 'elestiri: §2 en az 1 kill-koşulu maddesi (- ile başlayan satır) taşımalı' }
  }

  const oneriEslesme = ONERI_DESENI.exec(bolum3)
  if (!oneriEslesme) {
    return { gecti: false, neden: 'elestiri: §3 "ÖNERİ: go|no-go|pivot" satırı eksik veya geçersiz değer taşıyor' }
  }

  if (!metin.trim().endsWith(ELESTIRI_KAPANIS)) {
    return { gecti: false, neden: `elestiri: kapanış satırı birebir eşleşmiyor (beklenen: "${ELESTIRI_KAPANIS}")` }
  }

  return { gecti: true }
}

// Kapı zaten TAM OLARAK bir "ÖNERİ: go|no-go|pivot" garantiliyor — bu, çağıranın (choiceAdayi,
// planlamaSorular.mjs) o değeri güvenle çıkarması için ayrı, isimli bir yardımcı.
export function elestiriOnerisiCikar(icerik) {
  const m = ONERI_DESENI.exec(String(icerik ?? ''))
  return m ? m[1].toLowerCase() : null
}

// ── Executor (TEK model çağrısı burada — OpenRouter, ÜRETİCİDEN FARKLI SOY) ────────────────
export function elestiriExecutorOlustur(nsYolu, projeConfig, opts = {}) {
  const { log = () => {}, zaman_asimi_ms = 600_000, maxDeneme = 3 } = opts
  if (!farkliSoyMu(KRITIK_MODEL)) {
    // Bu, ÇALIŞMA-ZAMANI bir güvenlik-ağı değil — KRITIK_MODEL sabiti YANLIŞLIKLA üretici-soy
    // bir değere değiştirilirse modül YÜKLENİR AMA HERHANGİ bir çağrıdan ÖNCE burada patlar.
    throw new Error(
      `elestiriExecutorOlustur: KRİTİK_MODEL "${KRITIK_MODEL}" üretici-soyuyla ÇAKIŞIYOR — ` +
      `kritik pasaj FARKLI SOY bir model gerektirir (aksi halde üretici kendi çıktısını eleştirir, ` +
      `bu pasajın tüm amacını geçersiz kılar). E'nin KASITLI bir kararıysa KRITIK_MODEL'i ve bu ` +
      `guard'ı bilerek gözden geçir — sessizce bypass EDİLEMEZ.`
    )
  }

  async function executor(birimId, execOpts) {
    const composedIcerik = execOpts.baglamlar?.['master-plan']
    if (!composedIcerik) {
      throw new Error(`elestiriExecutorOlustur: baglamlar['master-plan'] boş — bileşik plan bulunamadan kritik pasaj çalışamaz`)
    }
    const prompt = elestiriPromptUret(projeConfig, composedIcerik)
    const sonuc = await openRouterCalistirRetry(SISTEM_PROMPT, prompt, {
      model: KRITIK_MODEL, reasoningEffort: KRITIK_REASONING_EFFORT, maxTokens: 16000,
      zaman_asimi_ms, maxDeneme, log,
    })

    // Lineage-doğrulama İKİNCİ KEZ, GERÇEK yanıttaki (OpenRouter'ın çözdüğü, tarihli) model
    // adına karşı — inşa-zamanı kontrolü (yukarıda) YALNIZ sabiti kontrol eder; bu, OpenRouter'ın
    // fiilen NE ÇALIŞTIRDIĞINI (routing/alias çözümlemesi sonrası) doğrular.
    if (!farkliSoyMu(sonuc.model)) {
      throw new Error(`elestiriExecutorOlustur: OpenRouter'ın ÇÖZDÜĞÜ gerçek model "${sonuc.model}" üretici-soyuyla çakışıyor — durduruldu (sessiz bypass yok)`)
    }
    log(`ELESTIRI model=${sonuc.model} (farklı-soy doğrulandı) maliyet=$${(sonuc.maliyet_usd ?? 0).toFixed(4)}`)

    const yol = guvenliYaz(execOpts.hedefDosya, sonuc.metin, nsYolu)
    return { icerik: sonuc.metin, cikti_pointer: yol, maliyet_usd: sonuc.maliyet_usd, sure_ms: sonuc.sure_ms, resolvedModel: sonuc.model }
  }

  return { executor }
}

// ── Birim-döngüsü (tekil "sıra" — birimKostur'u AYNEN yeniden kullanır) ────────────────────
const SIRA = ['elestiri']
function elestiriDosyaAdi(id, surum) { return asamaDosyaAdi('elestiri', surum) }

function sonucDon({ durdu, bekleyenOnay = null, acikSorularListesi = [], sorularSurum = null, ertelenenSorular = [], butunlukHatasi = null, state, maliyet, executorSayaci, mod }) {
  return {
    state, durdu, bekleyenOnay,
    acikSorular: acikSorularListesi, sorularSurum, ertelenenSorular, butunlukHatasi,
    maliyet, executorCagriSayisi: executorSayaci.n, mod,
  }
}

/**
 * Kritik-pasaj birim-döngüsü — YALNIZ state.aktif_asama==='tamamlandi' iken (5-aşama +
 * bölüm-yürüyüşü BİTTİKTEN sonra) çağrılmalı (bkz tools/planlamaBaslat.mjs). Bir invokasyon
 * EN ÇOK 1 executor çağrısı yapar — "bir-koşum-bir-karar" sözleşmesi burada da AYNEN geçerli.
 * @param {object} opts
 * @param {function} [opts.executor] — TEST enjeksiyon noktası: verilirse elestiriExecutorOlustur
 *        (gerçek OpenRouter çağrısı, üretici-soy guard'ı dahil) YERİNE kullanılır — hermetik
 *        testler bunu bir mock ile doldurur (claudeCalistirRetry'nin _claudeCalistir'i ile AYNI
 *        desen). Verilmezse (gerçek kullanım) elestiriExecutorOlustur çağrılır — guard orada
 *        uygulanır.
 */
export async function elestiriAdimAt(nsYolu, projeId, projeConfig, state, opts = {}) {
  const { log = () => {}, soruUretici } = opts
  if (!state.elestiri) throw new Error('elestiriAdimAt: state.elestiri yok (eski state normalizeState\'ten geçmemiş olabilir)')
  const birimler = { elestiri: state.elestiri }
  const es = birimler.elestiri
  const maliyet = { toplam: 0, asamalar: {} }
  const executorSayaci = { n: 0 }

  const kapiFn = (id, icerik) => elestiriKapidanGecerMi(icerik)

  if (es.durum === 'donduruldu') {
    const yol = es.cikti_pointer
    const icerik = yol ? readFileSync(yol, 'utf8') : null
    const g = icerik == null ? { gecti: false, neden: `çıktı dosyası bulunamadı: ${yol ?? 'yok'}` } : kapiFn('elestiri', icerik)
    if (g.gecti) {
      es.durum = 'onay-bekliyor'; es.kapi_sonuc = 'gecti'; es.blok_nedeni = null
      const paket = birimSorulariUretVeYaz(nsYolu, soruUretici, 'elestiri', es.surum ?? 1, icerik, projeId)
      es.sorular_surum = paket ? (es.surum ?? 1) : null
      statePersist(nsYolu, state)
      const d = birimAcikDurum(nsYolu, birimler, 'elestiri')
      log(`KURTARMA elestiri -> yapısal kapı yeniden GEÇTİ; ${d.engelli ? 'SORULAR AÇIK' : 'ONAY BEKLİYOR'}`)
      return sonucDon({ durdu: d.engelli ? 'sorular-acik' : 'onay-bekliyor', bekleyenOnay: 'elestiri', acikSorularListesi: d.acik, sorularSurum: d.sorularSurum, ertelenenSorular: d.ertelenen, butunlukHatasi: d.butunlukHatasi, state, maliyet, executorSayaci, mod: opts.mod })
    }
    es.blok_nedeni = g.neden
    statePersist(nsYolu, state)
    log(`BLOKE elestiri — ${g.neden}`)
    return sonucDon({ durdu: 'donduruldu', state, maliyet, executorSayaci, mod: opts.mod })
  }

  if (es.durum === 'onay-bekliyor') {
    const d = birimAcikDurum(nsYolu, birimler, 'elestiri')
    if (d.engelli) {
      statePersist(nsYolu, state)
      log(`SORULAR AÇIK elestiri — ${d.acik.length} açık soru (E kararı dahil); ilerlenmedi`)
      return sonucDon({ durdu: 'sorular-acik', bekleyenOnay: 'elestiri', acikSorularListesi: d.acik, sorularSurum: d.sorularSurum, ertelenenSorular: d.ertelenen, butunlukHatasi: d.butunlukHatasi, state, maliyet, executorSayaci, mod: opts.mod })
    }
    // E kararı (go/no-go/pivot CHOICE'ı) YANITLANMIŞ — bu invokasyon = onay jesti. TERMİNAL:
    // elestiri'den SONRA başka bir birim YOK, doğrudan 'gecti' + kritik-pasaj-tamamlandı.
    es.durum = 'gecti'; es.kapi_sonuc = 'gecti'; es.blok_nedeni = null
    statePersist(nsYolu, state)
    log(`ONAY elestiri -> gecti (E KARARI KAYDEDİLDİ — kritik pasaj tamamlandı)`)
    return sonucDon({ durdu: 'elestiri-tamamlandi', state, maliyet, executorSayaci, mod: opts.mod })
  }

  if (es.durum === 'gecti') {
    // İdempotent yeniden-giriş — zaten tamamlanmış, tekrar koşmaz/onaylamaz.
    return sonucDon({ durdu: 'elestiri-tamamlandi', state, maliyet, executorSayaci, mod: opts.mod })
  }

  // bekliyor/kosuyor → TEK executor çağrısı (bekliyor/kosuyor 'donduruldu' değilse buraya düşer).
  const executor = opts.executor ?? elestiriExecutorOlustur(nsYolu, projeConfig, { log }).executor
  const masterPlanIcerik = readFileSync(state.asamalar['master-plan'].cikti_pointer, 'utf8')
  return birimKostur('elestiri', {
    sira: SIRA, birimler, nsYolu, projeId,
    dosyaAdiFn: elestiriDosyaAdi,
    kapiFn,
    executorFn: executor,
    soruUretici,
    baglamlar: { 'master-plan': masterPlanIcerik },
    log, maliyet, executorSayaci, kostuTutucu: { birim: null },
    statePersistFn: () => statePersist(nsYolu, state),
    sonucDonFn: (partial) => sonucDon({ ...partial, state, maliyet, executorSayaci, mod: opts.mod }),
    // onSonBirimTamamlandi KASITLI OLARAK verilmiyor — SIRA'nın (tek elemanlı) "son"u olsa da,
    // NORMAL onay-bekliyor akışını istiyoruz (E'nin go/no-go/pivot CHOICE'ını YANITLAMASI VE
    // sonra AYRI bir invokasyonla onaylaması gerekir) — auto-complete YOK, "nothing auto-fires".
  })
}
