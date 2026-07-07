// meta-layer-core — TIER + KAPANMA (closure) modeli testleri (hermetik, MODELSİZ).
// Drive'dan BAĞIMSIZ: state + tüm artefaktlar OS geçici dizinine yazılır. GERÇEK model/
// OpenRouter çağrısı YOK — mock executor'lar + gerçek varsayilanSoruUretici kullanılır.
//
// Kapsam:
//   F0  tier varsayılanları + co-located [tier:...] etiket ayrıştırma
//   U   soruSetiKur: blocker pinlenir (asla ertelenmez); sorulariDogrula tier'i doğrular
//   N1  active-set reachable: büyük ertelenen yığını topluAtla ile TAMAMEN kapanabiliyor
//   N2  blocker: skip/at reddedilir; açıkken engelli=true; cevaplanınca kapanır
//   N3  skip-kapatılmış claim: efektif statü acik-soru'da kalır, ledger'da görünür, minDogrulandi'yı etkilemez
//   N4  toplu-atla SESSİZ DEĞİL: kapattığı her soruyu döner; blocker'a dokunmaz
//   RT  yeniden-derecele: blocker→onemli, reddedilen skip/at'i açar, imza etkilenmez
//   LEDGER  provenansEkRenderla kapanma-sütunu + Varsayım Defteri; assumptionLedgerOlustur projeksiyonu
//   PROMPT  tier rubric bölüm prompt'una yansır; problem-cozum/urun-tanimi ALWAYS-blocker notu
//
// Koşum: node scripts/planlama-tier-test-runner.mjs

import { existsSync, rmSync, mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { planlamaLoopV2Calistir } from '../tools/planlamaLoopV2.mjs'
import { boslukState, statePersist, stateYukle, asamaDosyaAdi } from '../tools/planlamaDurumMakinesiV2.mjs'
import { BOLUM_SIRASI, BOLUM_TANIMLARI } from '../tools/planlamaBolumTanimlari.mjs'
import { provenansEkRenderla, assumptionLedgerOlustur } from '../tools/planlamaBolumLoop.mjs'
import { birimAcikDurum } from '../tools/planlamaBirimMotoru.mjs'
import { iddialariCikar, iddialariCozumle } from '../tools/planlamaIddiaDurumu.mjs'
import {
  varsayilanSoruUretici, soruSetiKur, soruOnay, soruCHOICE, soruSerbest, soruVeriIstek, soruPaketiKur,
  sorulariDogrula, sorulariOku, sorulariYaz, atlaYaz, yanitKaydet, yanitButunluk, yanitlariHamOku,
  tumAcikAdaylar, acikBlokerler, topluAtla, soruYenidenDerecele, dataRequestAdaylari,
} from '../tools/planlamaSorular.mjs'
import { promptUretBolum } from '../tools/canliExecutor.mjs'
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
function yeniNs(etiket) { return { ns: mkdtempSync(join(tmpdir(), `tier-test-${etiket}-`)), id: `_test-${etiket}` } }
function temizle(ns) { try { rmSync(ns, { recursive: true, force: true }) } catch {} }

// genesis/premise/arastirma/strateji'yi ÖNCEDEN tamamlanmış olarak tohumla (planlama-bolum-
// test-runner.mjs'deki dortAsamaTamamlaSeed ile AYNI desen — her test-runner kendi içinde
// bağımsız/self-contained, repo konvansiyonu).
function dortAsamaTamamlaSeed(ns, id) {
  const state = boslukState(id)
  let oncekiSurum = null
  for (const asama of ['genesis', 'premise', 'arastirma', 'strateji']) {
    const dosya = join(ns, asamaDosyaAdi(asama, 1))
    writeFileSync(dosya, FIKSTUR[asama], 'utf8')
    state.asamalar[asama] = {
      durum: 'gecti', cikti_pointer: dosya, kapi_sonuc: 'gecti', blok_nedeni: null,
      surum: 1, kabul_edilen_ust_surum: oncekiSurum, sorular_surum: null, tuketilen_ust_yanit_surum: null,
    }
    oncekiSurum = 1
  }
  state.aktif_asama = 'master-plan'
  statePersist(ns, state)
  return state
}

// Bölüm-farkında mock executor — MODEL ÇAĞIRMAZ. FIKSTUR_BOLUM'un TAMAMI zaten statülü/
// çözümlenmiş (dogrulandi/operator-beyan) içerik taşıdığı için gerçek varsayilanSoruUretici
// bunlardan yalnız {APPROVAL, FREE-TEXT} üretir — sıfır blocker. overrides ile belirli
// bölümlere (tier testleri için) özel içerik enjekte edilir.
function tierTestExecutor(overrides = {}) {
  return async (birimId, opts) => {
    if (birimId === 'provenans-ek') {
      throw new Error('tierTestExecutor: provenans-ek İÇİN ÇAĞRILMAMALIYDI — mekanik render kullanılmalı')
    }
    let icerik
    if (birimId in overrides) icerik = overrides[birimId]
    else if (birimId in FIKSTUR_BOLUM) icerik = FIKSTUR_BOLUM[birimId]
    else throw new Error(`tierTestExecutor: bilinmeyen birim "${birimId}"`)
    writeFileSync(opts.hedefDosya, icerik, 'utf8')
    return { icerik, cikti_pointer: opts.hedefDosya, maliyet_usd: 0.001, sure_ms: 5 }
  }
}

async function tumYuruyusuTamamla(ns, id, executor, { maxAdim = 60 } = {}) {
  let sonuc, adim = 0
  do {
    sonuc = await planlamaLoopV2Calistir(ns, id, executor, {
      mod: 'ileri', soruUretici: varsayilanSoruUretici, masterPlanBolumleri: BOLUM_TANIMLARI, log: () => {},
    })
    adim++
    if (adim > maxAdim) throw new Error(`tumYuruyusuTamamla: ${maxAdim} adımda bitmedi (son durdu: ${sonuc.durdu})`)
  } while (sonuc.durdu !== 'tamamlandi' && sonuc.durdu !== 'donduruldu')
  return { sonuc, adim }
}

function cokAcikSoruIcerikUret(n) {
  const satirlar = [`# Ölçümleme (KPI) — Tier Test Projesi`, '']
  for (let i = 1; i <= n; i++) {
    satirlar.push(`KPI hedefi ${i} henüz operatörce netleştirilmedi. [acik-soru:kpi-hedef-${i}]`, '')
  }
  return satirlar.join('\n')
}

// ════════════════════════════════════════════════════════════════════════════
bolum('F0 — Tier: varsayılanlar + co-located etiket ayrıştırma (temel sağlık kontrolü)')
{
  ok('F0: soruCHOICE varsayılan tier=blocker', soruCHOICE({ anahtar: 'x', metin: 'm', oneri: 'A' }).tier === 'blocker')
  ok('F0: soruSerbest varsayılan tier=opsiyonel', soruSerbest({ anahtar: 'y', metin: 'm' }).tier === 'opsiyonel')
  ok('F0: soruVeriIstek varsayılan tier=onemli (etiketsiz)', soruVeriIstek({ anahtar: 'z', metin: 'm' }).tier === 'onemli')
  ok('F0: soruVeriIstek açık tier override kabul eder', soruVeriIstek({ anahtar: 'z2', metin: 'm', tier: 'opsiyonel' }).tier === 'opsiyonel')

  const drBlocker = dataRequestAdaylari('Kritik karar henüz alınmadı. [acik-soru:kritik-karar] [tier:blocker]')
  ok('F0: dataRequestAdaylari co-located [tier:blocker] etiketini ayrıştırır', drBlocker[0]?.tier === 'blocker')
  const drVarsayilan = dataRequestAdaylari('Basit bir detay eksik. [eksik]')
  ok('F0: dataRequestAdaylari tier etiketsizse onemli varsayar', drVarsayilan[0]?.tier === 'onemli')
  const drOpsiyonel = dataRequestAdaylari('İnce bir ayrıntı. [tahmin-doğrulanacak:kaynak-x] [tier:opsiyonel]')
  ok('F0: dataRequestAdaylari [tier:opsiyonel] etiketini ayrıştırır', drOpsiyonel[0]?.tier === 'opsiyonel')

  const ic = iddialariCikar('Zaten doğrulanmış bir iddia. [dogrulandi:kaynak-y] [tier:blocker]')
  ok('F0: iddialariCikar co-located tier etiketini ayrıştırır', ic[0]?.tier === 'blocker')
  const ic2 = iddialariCikar('Etiketsiz tier ile iddia. [operator-beyan:soru-x]')
  ok('F0: iddialariCikar tier etiketsizse onemli varsayar', ic2[0]?.tier === 'onemli')
}

// ════════════════════════════════════════════════════════════════════════════
bolum('U — soruSetiKur: blocker pinlenir (asla ertelenmez); sorulariDogrula tier\'i doğrular')
{
  const adaylar = [soruOnay('test-tier')]
  for (let i = 0; i < 5; i++) adaylar.push(soruVeriIstek({ anahtar: `blocker:${i}`, metin: `b${i}`, tier: 'blocker' }))
  for (let i = 0; i < 5; i++) adaylar.push(soruVeriIstek({ anahtar: `onemli:${i}`, metin: `o${i}`, tier: 'onemli', onem: 50 - i }))
  const set = soruSetiKur(adaylar)
  ok('U: 5 blocker ana sette (hiçbiri ertelenmedi)', set.sorular.filter(s => s.tier === 'blocker').length === 5)
  ok('U: kalan slot (7-1-5=1) yalnız 1 onemli alabildi', set.sorular.filter(s => s.tier === 'onemli').length === 1)
  ok('U: 4 onemli ertelendi', set.ertelenen.length === 4)
  ok('U: blocker HİÇBİR ZAMAN ertelenen listesinde DEĞİL', !set.ertelenen.some(s => s.tier === 'blocker'))

  const paket = soruPaketiKur({ projeId: '_u', asama: 'test-tier', surum: 1, sorular: set.sorular, ertelenen: set.ertelenen })
  ok('U: 5-blocker+1-onemli paket sorulariDogrula\'dan GEÇER (kalanSlot mantığı doğru)', sorulariDogrula(paket) === true)

  const bozukPaket = { ...paket, sorular: paket.sorular.map(s => s.tier === 'onemli' ? { ...s, tier: 'gecersiz-tier' } : s) }
  let tierHatasi = false
  try { sorulariDogrula(bozukPaket) } catch { tierHatasi = true }
  ok('U: geçersiz tier değeri sorulariDogrula tarafından REDDEDİLİR', tierHatasi)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('N2 — Blocker: skip/at REDDEDİLİR; blocker açıkken engelli=true; cevaplanınca kapanır')
{
  const { ns, id } = yeniNs('n2')
  try {
    const icerik = `# Ürün/Hizmet Tanımı (MVP) — Tier Test

MVP kapsamının kesin sınırı henüz onaylanmadı. [acik-soru:mvp-sinir-karari] [tier:blocker]
`
    const paket = varsayilanSoruUretici('urun-tanimi', icerik, { projeId: id, surum: 1 })
    sorulariYaz(ns, paket)
    const dr = paket.sorular.find(s => s.tip === 'DATA-REQUEST')
    ok('N2: içerikteki [tier:blocker] etiketi DATA-REQUEST\'e taşındı', dr?.tier === 'blocker')
    ok('N2: blocker ana sette (pinli, ertelenen DEĞİL)', paket.sorular.includes(dr))

    let atlaHatasi = false
    try { atlaYaz(ns, paket, dr.anahtar) } catch { atlaHatasi = true }
    ok('N2: blocker-tier soru atlaYaz ile REDDEDİLİR (skip yasak)', atlaHatasi)

    let dusurHatasi = false
    try { yanitKaydet(ns, paket, { anahtar: dr.anahtar, karar: 'dusur' }) } catch { dusurHatasi = true }
    ok('N2: blocker-tier soru karar=dusur (at) ile REDDEDİLİR', dusurHatasi)

    const birimler = { 'urun-tanimi': { sorular_surum: 1 } }
    const d1 = birimAcikDurum(ns, birimler, 'urun-tanimi')
    ok('N2: blocker açıkken engelli=true (ilerlemeyi durdurur)', d1.engelli === true)
    ok('N2: acikBlokerler tam 1 taşıyor', d1.acikBlokerler.length === 1)

    yanitKaydet(ns, paket, { anahtar: dr.anahtar, karar: 'veri', deger: 'tek varyant', kaynak: 'operatör kararı' })
    const d2 = birimAcikDurum(ns, birimler, 'urun-tanimi')
    ok('N2: cevaplandıktan sonra engelli=false', d2.engelli === false)
    ok('N2: acikBlokerler artık 0', d2.acikBlokerler.length === 0)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('N3 — Skip-kapatılmış claim: efektif statü acik-soru\'da KALIR, ledger\'da görünür, minDogrulandi\'yı ETKİLEMEZ')
{
  const { ns, id } = yeniNs('n3')
  try {
    const icerik = `# Pazar Analizi — Tier Test

Toplam adreslenebilir pazar sektör raporuyla doğrulanmıştır. [dogrulandi:sektor-raporu-test]

Kullanıcı başına ortalama harcama henüz netleşmedi. [acik-soru:harcama-tahmini]
`
    const paket = varsayilanSoruUretici('pazar-analizi', icerik, { projeId: id, surum: 1 })
    sorulariYaz(ns, paket)
    const dr = paket.sorular.find(s => s.tip === 'DATA-REQUEST')
    ok('N3: acik-soru DATA-REQUEST\'i varsayılan tier=onemli (etiketsiz)', dr?.tier === 'onemli')

    atlaYaz(ns, paket, dr.anahtar, 'test: bootstrap tahmini kullanılıyor', '2400 SEK/yıl varsayıldı')

    // bolumId provenansVerisiTopla (planlamaBolumLoop.mjs) tarafından İDDİALİARİCÖZÜMLE'nin
    // SONRASINDA eklenir (o fonksiyonun kendi çıktısının parçası DEĞİLDİR) — burada AYNI sarmalamayı
    // elle yapıyoruz, tıpkı üretim kodunun yaptığı gibi.
    const bolumState = { sorular_surum: 1 }
    const cozum = iddialariCozumle(ns, 'pazar-analizi', bolumState, iddialariCikar(icerik))
      .map(i => ({ ...i, bolumId: 'pazar-analizi' }))
    const skipIddia = cozum.find(i => i.param === 'harcama-tahmini')
    ok('N3: skip sonrası efektifTip HÂLÂ acik-soru (asla dogrulandi\'ya yükselmez)', skipIddia?.efektifTip === 'acik-soru')
    ok('N3: closure=skip', skipIddia?.closure === 'skip')
    ok('N3: varsayılan değer korunur', skipIddia?.varsayilanDeger === '2400 SEK/yıl varsayıldı')

    const dogrulandiSayisi = cozum.filter(i => i.efektifTip === 'dogrulandi').length
    ok('N3: minDogrulandi sayımı skip-kapatılmış claim\'den ETKİLENMEDİ (hâlâ yalnız 1)', dogrulandiSayisi === 1)

    const ledger = assumptionLedgerOlustur({ tumIddialar: cozum })
    ok('N3: izlenen-varsayım defterinde tam 1 kayıt var', ledger.length === 1)
    ok('N3: ledger kaydı doğru tier/section/status taşıyor',
      ledger[0].tier === 'onemli' && ledger[0].section === 'pazar-analizi' && ledger[0].status === 'acik-soru')
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('N4 — Toplu-atla SESSİZ DEĞİL: kapattığı HER soruyu döner; blocker\'a dokunmaz')
{
  const { ns, id } = yeniNs('n4')
  try {
    const icerik = `# Ölçümleme (KPI) — Tier Test

KPI 1 hedefi netleşmedi. [acik-soru:kpi-n4-1]

KPI 2 hedefi netleşmedi. [acik-soru:kpi-n4-2] [tier:opsiyonel]

Kritik ölçüm kararı henüz alınmadı. [acik-soru:kpi-n4-kritik] [tier:blocker]
`
    const paket = varsayilanSoruUretici('olcumleme-kpi', icerik, { projeId: id, surum: 1 })
    sorulariYaz(ns, paket)
    const acikOnce = tumAcikAdaylar(paket, [])
    ok('N4: kurulum — 3 DATA-REQUEST + 1 FREE-TEXT = 4 açık aday var', acikOnce.length === 4, `${acikOnce.length}`)

    const kapatilan = topluAtla(ns, paket, [], 'N4 test gerekçesi')
    ok('N4: topluAtla TAM OLARAK blocker-olmayan 3 adayı kapattı (SESSİZ DEĞİL — döndürdü)', kapatilan.length === 3, `${kapatilan.length}`)
    ok('N4: dönen HER kayıt anahtar/tip/tier/metin taşıyor (silent değil, tam bilgi)',
      kapatilan.every(k => k.anahtar && k.tip && k.tier && k.metin))
    ok('N4: kapatılanlar arasında blocker YOK', !kapatilan.some(k => k.tier === 'blocker'))

    const but = yanitButunluk(paket, yanitlariHamOku(ns, 'olcumleme-kpi', 1))
    ok('N4: yanıt dosyasında 3 atlandi:true kaydı var', but.yanitlar.filter(e => e.atlandi === true).length === 3)

    const kalanBloker = acikBlokerler(paket, but.yanitlar)
    ok('N4: kritik blocker HÂLÂ açık (toplu-atla dokunmadı)', kalanBloker.length === 1 && kalanBloker[0].anahtar === 'veri:kpi-n4-kritik')
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('RT — Yeniden-derecele: blocker → onemli, önceden reddedilen skip/at\'i AÇAR; imza etkilenmez')
{
  const { ns, id } = yeniNs('rt')
  try {
    const icerik = `# Bütçe ve Finansallar — Tier Test

Başlangıç maliyeti tedarikçi teklifiyle doğrulanmıştır. [dogrulandi:tedarikci-test]

Kritik yatırım kararı henüz alınmadı. [acik-soru:yatirim-karari] [tier:blocker]
`
    const paket = varsayilanSoruUretici('butce-finansal', icerik, { projeId: id, surum: 1 })
    sorulariYaz(ns, paket)
    const dr = paket.sorular.find(s => s.tip === 'DATA-REQUEST')
    const imzaOnce = paket.imza

    let hataOnce = false
    try { atlaYaz(ns, paket, dr.anahtar) } catch { hataOnce = true }
    ok('RT: yeniden-derecele ÖNCESİ atla REDDEDİLİR (hâlâ blocker)', hataOnce)

    const guncelSoru = soruYenidenDerecele(ns, paket, dr.anahtar, 'onemli')
    ok('RT: soru objesi yeniden-derecelendi', guncelSoru.tier === 'onemli')

    const diskPaket = sorulariOku(ns, 'butce-finansal', 1)
    ok('RT: disk\'e YAZILDI (kalıcı)', diskPaket.sorular.find(s => s.anahtar === dr.anahtar)?.tier === 'onemli')
    ok('RT: imza DEĞİŞMEDİ (tier hash\'e girmez)', diskPaket.imza === imzaOnce)
    ok('RT: sorulariDogrula hâlâ geçer (imza tutarlı)', sorulariDogrula(diskPaket) === true)

    const yeniPaket = sorulariOku(ns, 'butce-finansal', 1)
    const yol = atlaYaz(ns, yeniPaket, dr.anahtar, 'test: artık kritik değil')
    ok('RT: yeniden-derecele SONRASI atla artık BAŞARILI', existsSync(yol))

    let apReddi = false
    try { soruYenidenDerecele(ns, yeniPaket, 'onay', 'opsiyonel') } catch { apReddi = true }
    ok('RT: APPROVAL yeniden-derecelendirilemez (reddedilir)', apReddi)

    let gecersizTierReddi = false
    try { soruYenidenDerecele(ns, yeniPaket, dr.anahtar, 'boyle-bir-tier-yok') } catch { gecersizTierReddi = true }
    ok('RT: geçersiz tier değeri REDDEDİLİR', gecersizTierReddi)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('LEDGER — provenansEkRenderla kapanma-sütunu + Varsayım Defteri; assumptionLedgerOlustur tek-kaynak projeksiyon')
{
  const veri = {
    tumIddialar: [
      { bolumId: 'pazar-analizi', satirNo: 1, satir: 'Pazar büyüklüğü doğrulandı.', tip: 'dogrulandi', param: 'kaynak-a', tier: 'blocker', efektifTip: 'dogrulandi', efektifKaynak: 'kaynak-a', closure: 'cevaplandi' },
      { bolumId: 'urun-tanimi', satirNo: 2, satir: 'MVP kapsamı henüz netleşmedi.', tip: 'acik-soru', param: 'mvp-sinir', tier: 'onemli', efektifTip: 'acik-soru', efektifKaynak: null, closure: 'skip', varsayilanDeger: 'tek varyant varsayıldı' },
      { bolumId: 'risk-varsayimlar', satirNo: 3, satir: 'İkinci bir varsayım.', tip: 'acik-soru', param: 'varsayim-2', tier: 'opsiyonel', efektifTip: 'acik-soru', efektifKaynak: null, closure: 'acik' },
    ],
    tumAtlananlar: [],
  }
  const render = provenansEkRenderla(veri)
  ok('LEDGER: render "Varsayım Defteri" başlığını taşıyor', render.includes('Varsayım Defteri'))
  ok('LEDGER: skip-kapatılmış claim (mvp-sinir) ledger metninde görünür', render.includes('MVP kapsamı henüz netleşmedi'))
  ok('LEDGER: varsayılan değer render\'da görünür', render.includes('tek varyant varsayıldı'))
  ok('LEDGER: her iddia satırı tier + kapanma sütunu taşır', render.includes('tier: blocker') && render.includes('kapanma: cevaplandi'))

  const ledger = assumptionLedgerOlustur(veri)
  ok('LEDGER: assumptionLedgerOlustur YALNIZ closure=skip olanları döner (tam 1)', ledger.length === 1)
  ok('LEDGER: açık (closure=acik) claim ledger\'da YOK', !ledger.some(k => k.section === 'risk-varsayimlar'))
  ok('LEDGER: dogrulandi (closure=cevaplandi) claim ledger\'da YOK', !ledger.some(k => k.section === 'pazar-analizi'))

  // Graceful varsayılan: tier/closure alanları OLMAYAN eski-tarz veri "undefined" basmaz.
  const eskiVeri = { tumIddialar: [{ bolumId: 'pazar-analizi', tip: 'dogrulandi', param: 'eski-kaynak', efektifTip: 'dogrulandi', efektifKaynak: 'eski-kaynak' }], tumAtlananlar: [] }
  const eskiRender = provenansEkRenderla(eskiVeri)
  ok('LEDGER: tier/closure alanı olmayan eski veri "undefined" BASMAZ', !eskiRender.includes('undefined'))
}

// ════════════════════════════════════════════════════════════════════════════
bolum('PROMPT — tier rubric bölüm prompt\'una yansır; problem-cozum/urun-tanimi ALWAYS-blocker notu yalnız o ikisinde')
{
  const proje = { ad: 'Test Projesi', aciklama: 'kısa açıklama' }
  const pazarPrompt = promptUretBolum('pazar-analizi', proje, {}, BOLUM_TANIMLARI['pazar-analizi'])
  ok('PROMPT: genel bölüm prompt\'u tier rubric\'ini içerir', pazarPrompt.includes('[tier:blocker|onemli|opsiyonel]'))
  ok('PROMPT: pazar-analizi ALWAYS-blocker notu İÇERMEZ (yalnız problem-cozum/urun-tanimi\'nde)', !pazarPrompt.includes('EK KURAL'))

  const problemPrompt = promptUretBolum('problem-cozum', proje, {}, BOLUM_TANIMLARI['problem-cozum'])
  ok('PROMPT: problem-cozum ALWAYS-blocker notu içerir', problemPrompt.includes('problem tanımının') && problemPrompt.includes('[tier:blocker]'))

  const urunPrompt = promptUretBolum('urun-tanimi', proje, {}, BOLUM_TANIMLARI['urun-tanimi'])
  ok('PROMPT: urun-tanimi ALWAYS-blocker notu içerir', urunPrompt.includes('MVP kapsam') && urunPrompt.includes('[tier:blocker]'))

  ok('PROMPT: risk-varsayimlar hedefAciklama Varsayım Defteri\'ne gönderme yapar',
    BOLUM_TANIMLARI['risk-varsayimlar'].hedefAciklama.includes('Varsayım Defteri'))
}

// ════════════════════════════════════════════════════════════════════════════
bolum('N1 — active-set reachable: büyük ertelenen yığını artık topluAtla ile TAMAMEN kapanabiliyor (tarihsel "300+ sorunun asla kapanamadığı" bulgunun düzeltmesi, tam 15-birim yürüyüşü)')
{
  // (a) Müdahalesiz: hiçbir blocker yokken bile — sırf açık onemli/opsiyonel'ler kapatılmadığı
  // için — Layer-2 BLOKE olur. Bu, "onemli/opsiyonel ilerlemeyi durdurmaz" ile "done-when
  // active-set=0 ister" ikisinin AYNI ANDA doğru olduğunu kanıtlar (ilerleme ≠ done).
  const { ns: nsA, id: idA } = yeniNs('n1a')
  try {
    dortAsamaTamamlaSeed(nsA, idA)
    const executorA = tierTestExecutor({ 'olcumleme-kpi': cokAcikSoruIcerikUret(12) })
    const { sonuc: ilkSonuc, adim: ilkAdim } = await tumYuruyusuTamamla(nsA, idA, executorA)
    ok('N1a: hiçbir blocker yokken bile Layer-2 kalan (onemli-tier varsayılan) açık-setler yüzünden BLOKE olur',
      ilkSonuc.durdu === 'donduruldu', `${ilkAdim} adımda`)
    const engelState = stateYukle(nsA, idA)
    ok('N1a: blok_nedeni Layer-2 kaynaklı', (engelState.asamalar['master-plan'].blok_nedeni ?? '').startsWith('Layer-2'))
  } finally { temizle(nsA) }

  // (b) "Kapat-gittikçe" (gerçekçi operatör kullanımı — bkz raporYaz'daki AYNI öneri): her
  // bölüm ÜRETİLDİĞİNDE açık onemli/opsiyonel'lerini HEMEN topluAtla ile kapat. Bu, provenans-
  // ekinin (yalnız BİR KEZ, tüm bölümler 'gecti' olduğunda render edilir) KAPANMIŞ durumu
  // DOĞRU yansıtmasını sağlar — tek seferlik bir toplu-temizlik provenans-ek zaten render
  // edildikten SONRA gelirdi ve render'ı bayat bırakırdı (bu, provenans-ek'in mekanik render
  // ZAMANLAMASININ bilinen bir özelliğidir, tier modeliyle ilgisi yoktur — bkz assumption-ledger
  // tasarım notu: tek kaynak, ama render an'ı hâlâ tek seferliktir).
  const { ns, id } = yeniNs('n1b')
  try {
    dortAsamaTamamlaSeed(ns, id)
    const executor = tierTestExecutor({ 'olcumleme-kpi': cokAcikSoruIcerikUret(12) })

    let toplamKapatilan = 0
    let sonuc, adim = 0
    const MAX_ADIM = 40
    do {
      sonuc = await planlamaLoopV2Calistir(ns, id, executor, {
        mod: 'ileri', soruUretici: varsayilanSoruUretici, masterPlanBolumleri: BOLUM_TANIMLARI, log: () => {},
      })
      adim++
      if (adim > MAX_ADIM) throw new Error(`N1b: ${MAX_ADIM} adımda bitmedi (son durdu: ${sonuc.durdu})`)
      if (sonuc.kostuAsama) {
        const st = stateYukle(ns, id)
        const bs = st.asamalar['master-plan']?.bolumler?.[sonuc.kostuAsama]
        if (bs?.sorular_surum != null) {
          const paket = sorulariOku(ns, sonuc.kostuAsama, bs.sorular_surum)
          const but = yanitButunluk(paket, yanitlariHamOku(ns, sonuc.kostuAsama, bs.sorular_surum))
          const kapatilan = topluAtla(ns, paket, but.durum === 'gecerli' ? but.yanitlar : [], 'N1b test: kapat-as-you-go')
          toplamKapatilan += kapatilan.length
        }
      }
    } while (sonuc.durdu !== 'tamamlandi' && sonuc.durdu !== 'donduruldu')

    ok('N1b: topluAtla yürüyüş boyunca onlarca soruyu kapattı (main+ertelenen dahil — eskiden ertelenen kapanamazdı)',
      toplamKapatilan >= 12, `${toplamKapatilan} kapatıldı`)
    ok('N1b: açık onemli/opsiyonel\'ler hiçbir zaman blocker olmadığından ilerlemeyi hiç DURDURMADI, plan TAMAMLANDI (tarihsel unreachable bulgusunun düzeltmesinin doğrudan kanıtı)',
      sonuc.durdu === 'tamamlandi', `${adim} adımda`)

    const sonState = stateYukle(ns, id)
    let kalanAcik = 0
    for (const bolumId of BOLUM_SIRASI) {
      if (bolumId === 'provenans-ek') continue
      const d = birimAcikDurum(ns, sonState.asamalar['master-plan'].bolumler, bolumId)
      kalanAcik += d.acik.length + d.acikErtelenen.length
    }
    ok('N1b: TÜM bölümlerde aktif-set = 0', kalanAcik === 0, `kalan: ${kalanAcik}`)

    // Ledger: provenans-ek'te kapatılan sorular izlenen-varsayım olarak görünmeli (render
    // ANI'nda hepsi ZATEN kapatılmıştı — "kapat-gittikçe" ile — bu yüzden burada TAZE/doğru).
    const provPointer = sonuc.state.asamalar['master-plan'].bolumler['provenans-ek'].cikti_pointer
    const provIcerik = readFileSync(provPointer, 'utf8')
    ok('N1b: provenans-ek "Varsayım Defteri" başlığını taşıyor', provIcerik.includes('Varsayım Defteri'))
    ok('N1b: provenans-ek kapatılan KPI sorularından birini izlenen-varsayım olarak listeliyor (kapanma: skip)',
      /kpi-hedef-1\b/.test(provIcerik) && provIcerik.includes('kapanma: skip'))
  } finally { temizle(ns) }
}

// ══ Özet ═══════════════════════════════════════════════════════════════════════
console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
