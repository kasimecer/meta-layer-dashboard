// meta-layer-core — Kritik Pasaj (adversarial eleştiri geçişi) testleri (hermetik, MODELSİZ).
// Drive'dan BAĞIMSIZ: state + tüm artefaktlar OS geçici dizinine yazılır. GERÇEK OpenRouter
// çağrısı YOK — mock executor (elestiriAdimAt'ın opts.executor enjeksiyon noktası) kullanılır.
//
// Kapsam:
//   SOY     üretici-soy yasağı (farkliSoyMu) — producer CANNOT be the critic
//   GATE    elestiriKapidanGecerMi yapısal ayrıştırma — decision-format artifact'ın 4 parçası
//   STATE   boslukState/normalizeState state.elestiri init + geriye-uyum backfill
//   CHOICE  go/no-go/pivot CHOICE — tier=blocker varsayılanı, atlaYaz REDDİ (E-decision gate
//           SKİP EDİLEMEZ — negatif test)
//   WIRE    tam akış: mock executor'a giden baglamlar['master-plan'] TAM bileşik planı
//           (ledger + doğrulama-tablosu dahil) taşıyor mu; uçtan uca bekliyor→sorular-acik→
//           onay-bekliyor→elestiri-tamamlandi geçişi
//
// Koşum: node scripts/planlama-elestiri-test-runner.mjs

import { existsSync, rmSync, mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { boslukState, statePersist, stateYukle, asamaDosyaAdi } from '../tools/planlamaDurumMakinesiV2.mjs'
import { BOLUM_SIRASI, BOLUM_TANIMLARI } from '../tools/planlamaBolumTanimlari.mjs'
import { provenansEkRenderla } from '../tools/planlamaBolumLoop.mjs'
import {
  farkliSoyMu, KRITIK_MODEL, elestiriKapidanGecerMi, elestiriOnerisiCikar,
  elestiriExecutorOlustur, elestiriAdimAt,
} from '../tools/elestiriPasi.mjs'
import {
  varsayilanSoruUretici, choiceAdayi, sorulariOku, sorulariYaz, yanitlariHamOku, yanitButunluk,
  atlaYaz, yanitKaydet, topluAtla, acikBlokerler, tumAcikAdaylar,
} from '../tools/planlamaSorular.mjs'
import { FIKSTUR } from './planlama-test-fikstur.mjs'
import { FIKSTUR_BOLUM } from './planlama-bolum-fikstur.mjs'

let gecti = 0, kaldi = 0
function ok(ad, kosul, ekBilgi = '') {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
}
function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}
function yeniNs(etiket) { return { ns: mkdtempSync(join(tmpdir(), `elestiri-test-${etiket}-`)), id: `_test-${etiket}` } }
function temizle(ns) { try { rmSync(ns, { recursive: true, force: true }) } catch {} }

// ── Sentetik bileşik plan — layer2VeSonrasi'nin (planlamaBolumLoop.mjs) AYNI birleştirme
// desenini kullanır: 14 bölüm + provenans-ek, "## <etiket>\n\n<içerik>" bloklarının "---" ile
// ayrılması. provenans-ek GERÇEK provenansEkRenderla ile üretilir (mekanik render, model yok) —
// masabasi/birincil/icbilgi ÜÇÜNÜN de temsil edildiği bir iddia karışımıyla (görev: "engaged the
// ledger's birincil/icbilgi claims" doğrulanabilsin diye).
function sentetikBilesikPlanOlustur() {
  const veri = {
    tumIddialar: [
      { bolumId: 'pazar-analizi', satir: 'Pazar büyüklüğü sektör raporuyla kaynaklı.', tip: 'dogrulandi', param: 'sektor-raporu-2026', tier: 'onemli', efektifTip: 'dogrulandi', efektifKaynak: 'sektor-raporu-2026', closure: 'cevaplandi', claimType: 'masabasi', needsVerification: false },
      { bolumId: 'is-modeli-fiyatlama', satir: 'Hedef kitlenin ödeme istekliliği henüz saha verisiyle ölçülmedi.', tip: 'operator-onayli-tahmin', param: 'odeme-istekliligi', tier: 'blocker', efektifTip: 'operator-onayli-tahmin', efektifKaynak: null, closure: 'cevaplandi', claimType: 'birincil', needsVerification: true },
      { bolumId: 'operasyon-plani', satir: 'Tedarikçi şartlarımız yalnız operatörce bilinir.', tip: 'dogrulandi', param: 'tedarikci-teklifi-2026', tier: 'onemli', efektifTip: 'dogrulandi', efektifKaynak: 'tedarikci-teklifi-2026', closure: 'cevaplandi', claimType: 'icbilgi', needsVerification: false },
    ],
    tumAtlananlar: [],
  }
  const provenansIcerik = provenansEkRenderla(veri)
  const asilBolumler = BOLUM_SIRASI.filter(id => id !== 'provenans-ek')
    .map(id => `## ${BOLUM_TANIMLARI[id].etiket}\n\n${FIKSTUR_BOLUM[id]}`)
    .join('\n\n---\n\n')
  return asilBolumler + '\n\n---\n\n' + `## ${BOLUM_TANIMLARI['provenans-ek'].etiket}\n\n${provenansIcerik}`
}

// 5-aşama + bölüm-yürüyüşü TAMAMLANMIŞ bir state kur — aktif_asama='tamamlandi',
// master-plan.cikti_pointer sentetik bileşik plana işaret ediyor. elestiriAdimAt'ın çağrılabilir
// olması için gereken minimum ön-koşul (bkz tools/planlamaBaslat.mjs'deki yönlendirme).
function tamamlanmisStateKur(ns, id) {
  const state = boslukState(id)
  for (const asama of ['genesis', 'premise', 'arastirma', 'strateji']) {
    const dosya = join(ns, asamaDosyaAdi(asama, 1))
    writeFileSync(dosya, FIKSTUR[asama], 'utf8')
    state.asamalar[asama] = { durum: 'gecti', cikti_pointer: dosya, kapi_sonuc: 'gecti', blok_nedeni: null, surum: 1, kabul_edilen_ust_surum: null, sorular_surum: null, tuketilen_ust_yanit_surum: null }
  }
  const mpDosya = join(ns, asamaDosyaAdi('master-plan', 1))
  writeFileSync(mpDosya, sentetikBilesikPlanOlustur(), 'utf8')
  state.asamalar['master-plan'] = { durum: 'gecti', cikti_pointer: mpDosya, kapi_sonuc: 'gecti', blok_nedeni: null, surum: 1, kabul_edilen_ust_surum: 1, sorular_surum: null, tuketilen_ust_yanit_surum: null }
  state.aktif_asama = 'tamamlandi'
  statePersist(ns, state)
  return state
}

// Sabit, iyi-biçimli mock kritik-pasaj çıktısı — GERÇEK model çağrısı yok. resolvedModel
// KRITIK_MODEL'in KENDİSİ (üretici-soy DEĞİL) — WIRE testlerinde "gerçekten farklı-soy model
// kullanıldı" iddiasını taklit eder.
const MOCK_ELESTIRI_ICERIK = `# Kritik Pasaj — Test Projesi

## §1 — En Kırılgan 3

### Kırılgan Nokta 1: Ödeme istekliliği doğrulanmadı
[gerekce] Fiyatlama tamamen operatör-onaylı bir tahmine dayanıyor, saha verisi yok.
[bagimlilik] İş modeli ve fiyatlama bölümüne bağımlı.
[curutme-testi] 20 potansiyel müşteriyle fiyat-duyarlılık görüşmesi yap.

### Kırılgan Nokta 2: Tedarikçi tekliği tek kaynağa dayanıyor
[gerekce] Operasyon planı tek bir tedarikçi teklifine dayanıyor, yedek yok.
[bagimlilik] Bütçe ve operasyon planı bölümlerine bağımlı.
[curutme-testi] İkinci bir tedarikçi teklifi al ve karşılaştır.

### Kırılgan Nokta 3: Pazar büyüklüğü tahmini eski
[gerekce] Sektör raporu güncelliğini yitirmiş olabilir.
[bagimlilik] Pazar analizi bölümüne bağımlı.
[curutme-testi] Güncel bir pazar raporu satın al veya tara.

## §2 — Kill-Koşulları

Bu proje TERK EDİLMELİDİR eğer:
- Fiyat-duyarlılık testi hedef fiyatın %50'sinden fazlasını reddederse
- İkinci tedarikçi bulunamazsa ve mevcut tedarikçi fiyat/teslimat garantisi vermezse

## §3 — Öneri

Üç kırılgan nokta da birbirine bağımlı ve doğrulanabilir; hiçbiri tek başına ölümcül değil.

ÖNERİ: pivot

Çıktı → Bir sonraki adım: E kararı`

function mockExecutorKur(icerik = MOCK_ELESTIRI_ICERIK) {
  let sonBaglamlar = null
  const executor = async (birimId, opts) => {
    sonBaglamlar = opts.baglamlar
    writeFileSync(opts.hedefDosya, icerik, 'utf8')
    return { icerik, cikti_pointer: opts.hedefDosya, maliyet_usd: 0.002, sure_ms: 10, resolvedModel: KRITIK_MODEL }
  }
  return { executor, sonBaglamlarGetir: () => sonBaglamlar }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('SOY — Üretici-soy yasağı: producer CANNOT be the critic')
{
  ok('SOY: claude-sonnet-4-6 (üretici) FARKLI-SOY DEĞİL', farkliSoyMu('claude-sonnet-4-6') === false)
  ok('SOY: claude-opus-4-8 üretici-soy sayılır', farkliSoyMu('claude-opus-4-8') === false)
  ok('SOY: anthropic/claude-3.5-sonnet üretici-soy sayılır (vendor-prefixli slug)', farkliSoyMu('anthropic/claude-3.5-sonnet') === false)
  ok('SOY: boş/null model FARKLI-SOY sayılmaz (güvenli varsayılan — belirsizlik ret sayılır)', farkliSoyMu('') === false && farkliSoyMu(null) === false)
  ok('SOY: KRITIK_MODEL (deepseek/deepseek-v4-pro) FARKLI-SOY', farkliSoyMu(KRITIK_MODEL) === true)
  ok('SOY: KRITIK_MODEL literal "claude"/"anthropic"/"sonnet"/"opus"/"haiku" İÇERMİYOR', !/claude|anthropic|sonnet|opus|haiku/i.test(KRITIK_MODEL))

  // Construction-time guard AKTİF: KRITIK_MODEL doğru olduğu için THROW ETMEMELİ.
  const { ns } = yeniNs('soy-ok')
  try {
    let hataAtildi = false
    try { elestiriExecutorOlustur(ns, { id: 'x', ad: 'x', aciklama: 'x' }) } catch { hataAtildi = true }
    ok('SOY: elestiriExecutorOlustur KRITIK_MODEL (farklı-soy) İLE patlamaz', hataAtildi === false)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('GATE — elestiriKapidanGecerMi: decision-format artifact\'ın 4 zorunlu parçası')
{
  ok('GATE: iyi-biçimli mock içerik kapıdan GEÇER', elestiriKapidanGecerMi(MOCK_ELESTIRI_ICERIK).gecti === true)
  ok('GATE: öneri doğru ayrıştırılır (pivot)', elestiriOnerisiCikar(MOCK_ELESTIRI_ICERIK) === 'pivot')

  ok('GATE: §1 eksikse REDDEDİLİR', elestiriKapidanGecerMi('rastgele metin').gecti === false)

  const ikiKirilgan = MOCK_ELESTIRI_ICERIK.replace(/### Kırılgan Nokta 3:[\s\S]*?(?=## §2)/, '')
  const g2 = elestiriKapidanGecerMi(ikiKirilgan)
  ok('GATE: 3\'ten AZ kırılgan-nokta REDDEDİLİR', g2.gecti === false && g2.neden.includes('TAM OLARAK 3'))

  const etiketsizKirilgan = MOCK_ELESTIRI_ICERIK.replace('[curutme-testi] 20 potansiyel müşteriyle fiyat-duyarlılık görüşmesi yap.', '')
  ok('GATE: [curutme-testi] eksik bir kırılgan-nokta REDDEDİLİR', elestiriKapidanGecerMi(etiketsizKirilgan).gecti === false)

  const killsiz = MOCK_ELESTIRI_ICERIK.replace(/- Fiyat-duyarlılık.*\n- İkinci tedarikçi.*\n/, '')
  ok('GATE: §2 sıfır kill-koşulu REDDEDİLİR', elestiriKapidanGecerMi(killsiz).gecti === false)

  const gecersizOneri = MOCK_ELESTIRI_ICERIK.replace('ÖNERİ: pivot', 'ÖNERİ: belki-sonra')
  ok('GATE: geçersiz ÖNERİ değeri REDDEDİLİR', elestiriKapidanGecerMi(gecersizOneri).gecti === false)

  const kapanissiz = MOCK_ELESTIRI_ICERIK.replace('Çıktı → Bir sonraki adım: E kararı', 'Bitti.')
  ok('GATE: yanlış kapanış satırı REDDEDİLİR', elestiriKapidanGecerMi(kapanissiz).gecti === false)

  for (const oneri of ['go', 'no-go', 'pivot']) {
    const varyant = MOCK_ELESTIRI_ICERIK.replace('ÖNERİ: pivot', `ÖNERİ: ${oneri}`)
    ok(`GATE: ÖNERİ: ${oneri} GEÇERLİ değer olarak kabul edilir`, elestiriKapidanGecerMi(varyant).gecti === true)
  }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('STATE — boslukState/normalizeState: state.elestiri init + geriye-uyum backfill')
{
  const taze = boslukState('_x')
  ok('STATE: boslukState state.elestiri taşır', taze.elestiri != null)
  ok('STATE: taze elestiri durum=bekliyor', taze.elestiri.durum === 'bekliyor')
  ok('STATE: taze elestiri surum=0', taze.elestiri.surum === 0)

  const { ns, id } = yeniNs('state-backfill')
  try {
    // eski-şema state dosyası ELLE yaz — elestiri alanı HİÇ YOK (özellik-öncesi proje simülasyonu).
    const eskiState = { proje_id: id, semasurum: 2, aktif_asama: 'tamamlandi', asamalar: {} }
    for (const a of ['genesis', 'premise', 'arastirma', 'strateji', 'master-plan']) {
      eskiState.asamalar[a] = { durum: 'gecti', cikti_pointer: null, kapi_sonuc: 'gecti', blok_nedeni: null, surum: 1, kabul_edilen_ust_surum: 1, sorular_surum: null, tuketilen_ust_yanit_surum: null }
    }
    statePersist(ns, eskiState)
    const yuklenen = stateYukle(ns, id)
    ok('STATE: eski-şema (elestiri alanı YOK) dosya stateYukle ile ÇÖKMEDEN yüklenir', yuklenen != null)
    ok('STATE: normalizeState eksik elestiri alanını bosAsama() ile DOLDURUR', yuklenen.elestiri != null && yuklenen.elestiri.durum === 'bekliyor')
    ok('STATE: backfill diğer aşamaların anlamını DEĞİŞTİRMEZ', yuklenen.asamalar.genesis.durum === 'gecti')
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('CHOICE — go/no-go/pivot: tier=blocker varsayılanı, E-decision gate SKİP EDİLEMEZ (negatif test)')
{
  const paket = varsayilanSoruUretici('elestiri', MOCK_ELESTIRI_ICERIK, { projeId: '_x', surum: 1 })
  const secim = paket.sorular.find(s => s.anahtar === 'karar:elestiri')
  ok('CHOICE: choiceAdayi elestiri içeriğinden CHOICE üretir', secim != null)
  ok('CHOICE: tip=CHOICE', secim?.tip === 'CHOICE')
  ok('CHOICE: tier=blocker VARSAYILAN (soruCHOICE\'ın kendi varsayılanı)', secim?.tier === 'blocker')
  ok('CHOICE: öneri kritik-pasajın KENDİ önerisiyle eşleşir (pivot -> "Yönü değiştir (pivot)")', secim?.oneri === 'Yönü değiştir (pivot)')
  ok('CHOICE: 3 seçenek de mevcut (go/no-go/pivot)', secim?.secenekler.length === 3)
  ok('CHOICE: öneri seçeneklerin İLKİ', secim?.secenekler[0] === secim?.oneri)
  ok('CHOICE: ana sette PİNLİ (blocker -> asla ertelenen\'e düşmez)', paket.sorular.includes(secim))

  // NEGATİF TEST (görev: "the flow cannot skip the E-decision gate") — atlaYaz REDDEDİLMELİ.
  const { ns, id } = yeniNs('choice-skip')
  try {
    const yerelPaket = varsayilanSoruUretici('elestiri', MOCK_ELESTIRI_ICERIK, { projeId: id, surum: 1 })
    sorulariYaz(ns, yerelPaket)
    const yerelSecim = yerelPaket.sorular.find(s => s.anahtar === 'karar:elestiri')

    let atlaHatasi = false, atlaMesaji = ''
    try { atlaYaz(ns, yerelPaket, yerelSecim.anahtar) } catch (e) { atlaHatasi = true; atlaMesaji = e.message }
    ok('CHOICE-NEGATİF: atlaYaz go/no-go/pivot kararını REDDEDER (E-decision gate skip EDİLEMEZ)', atlaHatasi, atlaMesaji.slice(0, 60))

    // topluAtla da AYNI şekilde dokunMAMALI (blocker'lara hiç dokunmaz — mevcut sözleşme).
    const kapatilan = topluAtla(ns, yerelPaket, [], 'test')
    ok('CHOICE-NEGATİF: topluAtla go/no-go/pivot kararına DOKUNMAZ (yalnız FREE-TEXT\'i kapatır)',
      !kapatilan.some(k => k.anahtar === 'karar:elestiri'))
    const kalanBlocker = acikBlokerler(yerelPaket, [])
    ok('CHOICE-NEGATİF: karar HÂLÂ açık blocker (tek kapanma yolu: açıkça cevapla)',
      kalanBlocker.length === 1 && kalanBlocker[0].anahtar === 'karar:elestiri')

    // Pozitif kontrol: AÇIKÇA cevaplanırsa (yanitKaydet) kapanır — "skip edilemez" ≠ "asla kapanmaz".
    yanitKaydet(ns, yerelPaket, { anahtar: yerelSecim.anahtar, secim: yerelSecim.oneri })
    const but = yanitButunluk(yerelPaket, yanitlariHamOku(ns, 'elestiri', 1))
    const kalan = tumAcikAdaylar(yerelPaket, but.yanitlar).filter(s => s.tip !== 'FREE-TEXT')
    ok('CHOICE (kontrol): AÇIKÇA yanıtlanınca kapanır (skip değil, cevap)', kalan.length === 0)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('WIRE — uçtan uca: mock executor TAM bileşik planı (ledger+tablo dahil) alır; bekliyor→sorular-acik→onay-bekliyor→elestiri-tamamlandi')
{
  const { ns, id } = yeniNs('wire')
  try {
    const state = tamamlanmisStateKur(ns, id)
    const { executor, sonBaglamlarGetir } = mockExecutorKur()

    const sonuc1 = await elestiriAdimAt(ns, id, { id, ad: 'Test Projesi', aciklama: 'kısa açıklama' }, state, { log: () => {}, mod: 'ileri', soruUretici: varsayilanSoruUretici, executor })

    const alinanBaglam = sonBaglamlarGetir()
    ok('WIRE: mock executor\'a baglamlar[\'master-plan\'] iletildi', typeof alinanBaglam?.['master-plan'] === 'string' && alinanBaglam['master-plan'].length > 0)
    ok('WIRE: iletilen plan TÜM 14 bölümü içeriyor (ör. Problem ve Çözüm + Ölçümleme)',
      alinanBaglam['master-plan'].includes('Problem ve Çözüm Tanımı') && alinanBaglam['master-plan'].includes('Ölçümleme (KPI)'))
    ok('WIRE: iletilen plan Varsayım Defteri\'ni (ledger) içeriyor', alinanBaglam['master-plan'].includes('Varsayım Defteri'))
    ok('WIRE: iletilen plan Doğrulama Tablosu\'nu (verification table) içeriyor', alinanBaglam['master-plan'].includes('Doğrulama Tablosu'))
    ok('WIRE: iletilen plan birincil-tipli iddiayı içeriyor (ödeme istekliliği)', alinanBaglam['master-plan'].includes('ödeme istekliliği'))
    ok('WIRE: iletilen plan icbilgi-tipli iddiayı içeriyor (tedarikçi şartlarımız)', alinanBaglam['master-plan'].includes('Tedarikçi şartlarımız'))

    ok('WIRE: ilk koşum sonrası durdu=sorular-acik (CHOICE blocker, henüz yanıtsız)', sonuc1.durdu === 'sorular-acik')
    ok('WIRE: bekleyenOnay=elestiri', sonuc1.bekleyenOnay === 'elestiri')
    ok('WIRE: state.elestiri.durum=onay-bekliyor (birimKostur normal akış — onSonBirimTamamlandi YOK)', state.elestiri.durum === 'onay-bekliyor')
    ok('WIRE: state.elestiri.cikti_pointer yazıldı', existsSync(state.elestiri.cikti_pointer))
    ok('WIRE: maliyet doğru aktarıldı', sonuc1.maliyet.toplam === 0.002)

    // E kararı verir + FREE-TEXT'i topla-atla ile kapatır.
    const paket = sorulariOku(ns, 'elestiri', state.elestiri.sorular_surum)
    const secim = paket.sorular.find(s => s.anahtar === 'karar:elestiri')
    yanitKaydet(ns, paket, { anahtar: secim.anahtar, secim: secim.oneri })
    topluAtla(ns, paket, (yanitButunluk(paket, yanitlariHamOku(ns, 'elestiri', state.elestiri.sorular_surum))).yanitlar, 'wire-test')

    const sonuc2 = await elestiriAdimAt(ns, id, { id, ad: 'Test Projesi', aciklama: 'kısa açıklama' }, state, { log: () => {}, mod: 'ileri', soruUretici: varsayilanSoruUretici, executor })
    ok('WIRE: E kararından SONRA durdu=elestiri-tamamlandi (SELF-DECIDE YOK — E\'nin kararı okundu)', sonuc2.durdu === 'elestiri-tamamlandi')
    ok('WIRE: state.elestiri.durum=gecti', state.elestiri.durum === 'gecti')
    ok('WIRE: bu 2. çağrıda YENİ executor çağrısı OLMADI (yalnız onay — bir-koşum-bir-karar)', sonuc2.executorCagriSayisi === 0)

    // İdempotent 3. çağrı — tekrar koşmaz/onaylamaz.
    const sonuc3 = await elestiriAdimAt(ns, id, { id, ad: 'Test Projesi', aciklama: 'kısa açıklama' }, state, { log: () => {}, mod: 'ileri', soruUretici: varsayilanSoruUretici, executor })
    ok('WIRE: gecti sonrası yeniden-çağrı İDEMPOTENT (yine elestiri-tamamlandi, yeniden koşmaz)', sonuc3.durdu === 'elestiri-tamamlandi' && sonuc3.executorCagriSayisi === 0)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('WIRE-GATE — kapı reddi: mock kötü-biçimli çıktı üretirse elestiri donduruldu olur')
{
  const { ns, id } = yeniNs('wire-gate')
  try {
    const state = tamamlanmisStateKur(ns, id)
    const { executor } = mockExecutorKur('bu tamamen biçimsiz, hiçbir § işareti taşımayan bir metin')
    const sonuc = await elestiriAdimAt(ns, id, { id, ad: 'Test Projesi', aciklama: 'x' }, state, { log: () => {}, mod: 'ileri', soruUretici: varsayilanSoruUretici, executor })
    ok('WIRE-GATE: biçimsiz çıktı durdu=donduruldu üretir', sonuc.durdu === 'donduruldu')
    ok('WIRE-GATE: state.elestiri.durum=donduruldu', state.elestiri.durum === 'donduruldu')
    ok('WIRE-GATE: blok_nedeni açıklayıcı', (state.elestiri.blok_nedeni ?? '').includes('elestiri'))
  } finally { temizle(ns) }
}

// ══ Özet ═══════════════════════════════════════════════════════════════════════
console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
