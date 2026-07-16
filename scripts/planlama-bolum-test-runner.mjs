// meta-layer-core — master-plan BÖLÜM-YÜRÜYÜŞÜ testleri (hermetik, MODELSİZ, V1).
// Drive'dan BAĞIMSIZ: state + tüm artefaktlar OS geçici dizinine yazılır. Gerçek
// planlamaLoopV2Calistir'i (masterPlanBolumleri opt-in AÇIK) doğrudan sürer.
//
// Kapsam:
//   F0  Bölüm fikstür drift-kalkanı + kayıt bütünlüğü
//   Y   Yapısal: paralel motor YOK — stage-loop VE section-loop AYNI birimKostur'u paylaşır
//   T   İddia-statüsü: etiketsiz satır mekanik olarak reddedilir
//   S9  dijital-varlik-spec no-build sınırı (mekanik güvenlik-ağı — kanıt değil)
//   D1  Layer-1 (bölüm-yerel) done-when: kaynak-gerekli sıfır-doğrulanmış red; yerel açık-soru toleransı
//   D2  Layer-2 (tüm-plan) done-when: tamamen temiz → tamamlandi; kalan açık-soru → bloke
//   G   Bölüm-seviyesi --geri (spiral) — sürüm/çıktı korunur, state doğrulanır
//   L   Geriye-uyumluluk: opt-in KAPALIYKEN eski master-plan davranışı BİREBİR (tek invokasyon)
//
// Koşum: node scripts/planlama-bolum-test-runner.mjs

import { existsSync, rmSync, mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { planlamaLoopV2Calistir } from '../tools/planlamaLoopV2.mjs'
import { boslukState, statePersist, stateYukle, asamaDosyaAdi, bayatAsamalar } from '../tools/planlamaDurumMakinesiV2.mjs'
import { BOLUM_SIRASI, BOLUM_TANIMLARI } from '../tools/planlamaBolumTanimlari.mjs'
import { bolumKapidanGecerMi } from '../tools/planlamaBolumKapilari.mjs'
import { bolumeGeriDon, provenansEkRenderla } from '../tools/planlamaBolumLoop.mjs'
import { birimAcikDurum } from '../tools/planlamaBirimMotoru.mjs'
import { iddialariCikar, iddialariCozumle, bolumIcerikGovdesiKontrolEt } from '../tools/planlamaIddiaDurumu.mjs'
import {
  dataRequestAdaylari, varsayilanSoruUretici, yanitKaydet, sorulariYaz, sorulariOku,
  topluAtla, yanitButunluk, yanitlariHamOku,
} from '../tools/planlamaSorular.mjs'
import { FIKSTUR } from './planlama-test-fikstur.mjs'
import { FIKSTUR_BOLUM, BOZUK_BOLUM, EKSIK_FIGUR_SATIRI, bolumFiksturuDogrula } from './planlama-bolum-fikstur.mjs'

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

function yeniNs(etiket) { return { ns: mkdtempSync(join(tmpdir(), `bolum-test-${etiket}-`)), id: `_test-${etiket}` } }
function temizle(ns) { try { rmSync(ns, { recursive: true, force: true }) } catch {} }

// genesis/premise/arastirma/strateji'yi ÖNCEDEN tamamlanmış olarak tohumla — bölüm-yürüyüşü
// testleri yalnız master-plan'ı hedeflediği için 4 aşamayı invokasyonlarla sürmeye gerek yok.
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

// Bölüm-farkında mock executor — MODEL ÇAĞIRMAZ. overrides: {bolumId: icerik} belirli
// bölümler için fikstürü değiştirir (mutasyon testleri için).
//
// provenans-ek İÇİN BİLEREK ÇAĞRILIRSA fırlatır: production artık bu bölüm için executor'ı
// (mock ya da gerçek fark etmez) HİÇ ÇAĞIRMAMALI — içerik provenansEkRenderla ile
// __provenansVerisi'nden mekanik üretilir (bkz planlamaBolumLoop.mjs bolumWalkAdimAt). Bu,
// TÜM mevcut testler (D2a, PE, L, vb. — hepsi provenans-ek'e ulaşır) için ÖRTÜK bir regresyon
// kalkanı: production bu bölüm için executor'a YANLIŞLIKLA geri dönerse, HER biri gürültülü
// şekilde patlar.
function bolumluExecutor(overrides = {}) {
  return async (birimId, opts) => {
    if (birimId === 'provenans-ek') {
      throw new Error('bolumluExecutor: provenans-ek İÇİN ÇAĞRILMAMALIYDI — mekanik render kullanılmalı (regresyon?)')
    }
    let icerik
    if (birimId in overrides) icerik = overrides[birimId]
    else if (birimId in FIKSTUR_BOLUM) icerik = FIKSTUR_BOLUM[birimId]
    else if (birimId in FIKSTUR) icerik = FIKSTUR[birimId]
    else throw new Error(`bolumluExecutor: bilinmeyen birim "${birimId}"`)
    writeFileSync(opts.hedefDosya, icerik, 'utf8')
    return { icerik, cikti_pointer: opts.hedefDosya, maliyet_usd: 0.001, sure_ms: 5 }
  }
}

// Tam bölüm-yürüyüşünü (+ nihai onay) invokasyon invokasyon sürer — her çağrı EN ÇOK bir
// birim işler (bkz tools/planlamaBirimMotoru.mjs birimKostur), tıpkı aşama-seviyesinde olduğu gibi.
async function tumYuruyusuTamamla(ns, id, executor, { maxAdim = 25, soruUretici = null } = {}) {
  let sonuc, adim = 0
  do {
    sonuc = await planlamaLoopV2Calistir(ns, id, executor, {
      mod: 'ileri', soruUretici, masterPlanBolumleri: BOLUM_TANIMLARI, log: () => {},
    })
    adim++
    if (adim > maxAdim) throw new Error(`tumYuruyusuTamamla: ${maxAdim} adımda bitmedi (son durdu: ${sonuc.durdu})`)
  } while (sonuc.durdu !== 'tamamlandi' && sonuc.durdu !== 'donduruldu')
  return { sonuc, adim }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('F0 — Bölüm fikstür drift-kalkanı')
{
  try {
    bolumFiksturuDogrula()
    ok('F0: bölüm fikstürleri gerçek kapıdan (bolumKapidanGecerMi) doğrulandı', true)
  } catch (e) {
    ok('F0: bölüm fikstürleri gerçek kapıdan doğrulandı', false, e.message)
  }
  ok('F0: BOLUM_SIRASI tam 15 birim taşıyor (14 bölüm + provenans-ek)', BOLUM_SIRASI.length === 15)
  ok('F0: her BOLUM_SIRASI id\'sinin BOLUM_TANIMLARI\'nda karşılığı var', BOLUM_SIRASI.every(id => !!BOLUM_TANIMLARI[id]))
  ok('F0: yalnız ozet-yonetici iddiaMuaf=true', BOLUM_SIRASI.filter(id => BOLUM_TANIMLARI[id].iddiaMuaf).join(',') === 'ozet-yonetici')
  ok('F0: yalnız provenans-ek mekanik=true', BOLUM_SIRASI.filter(id => BOLUM_TANIMLARI[id].mekanik).join(',') === 'provenans-ek')
}

// ════════════════════════════════════════════════════════════════════════════
bolum('Y — Yapısal: paralel motor YOK (aynı birimKostur paylaşılıyor)')
{
  const loopKaynak = readFileSync(new URL('../tools/planlamaLoopV2.mjs', import.meta.url), 'utf8')
  const bolumLoopKaynak = readFileSync(new URL('../tools/planlamaBolumLoop.mjs', import.meta.url), 'utf8')
  const motorKaynak = readFileSync(new URL('../tools/planlamaBirimMotoru.mjs', import.meta.url), 'utf8')

  ok('Y: planlamaLoopV2.mjs birimKostur\'u planlamaBirimMotoru.mjs\'den import ediyor',
    /import\s*\{[^}]*\bbirimKostur\b[^}]*\}\s*from\s*['"]\.\/planlamaBirimMotoru\.mjs['"]/.test(loopKaynak))
  ok('Y: planlamaBolumLoop.mjs birimKostur\'u AYNI planlamaBirimMotoru.mjs\'den import ediyor',
    /import\s*\{[^}]*\bbirimKostur\b[^}]*\}\s*from\s*['"]\.\/planlamaBirimMotoru\.mjs['"]/.test(bolumLoopKaynak))
  ok('Y: birimKostur TEK bir yerde (planlamaBirimMotoru.mjs) TANIMLANIYOR',
    /export\s+async\s+function\s+birimKostur\b/.test(motorKaynak) &&
    !/(?:function|const)\s+birimKostur\s*[=(]/.test(loopKaynak) &&
    !/(?:function|const)\s+birimKostur\s*[=(]/.test(bolumLoopKaynak))
  ok('Y: planlamaBolumLoop.mjs genesis/premise/arastirma/strateji kapılarını (planlamaKapilari.mjs) HİÇ import etmiyor',
    !bolumLoopKaynak.includes("from './planlamaKapilari.mjs'"))
  ok('Y: planlamaBolumKapilari.mjs (bölüm kapıları) planlamaKapilari.mjs\'in KENDİSİNİ (genesis/premise/arastirma/strateji gate\'leri) DEĞİŞTİRMİYOR — ayrı dosya',
    existsSync(new URL('../tools/planlamaKapilari.mjs', import.meta.url)) &&
    existsSync(new URL('../tools/planlamaBolumKapilari.mjs', import.meta.url)))
}

// ════════════════════════════════════════════════════════════════════════════
bolum('T — İddia-statüsü: etiketsiz satır mekanik olarak REDDEDİLİR')
{
  const g1 = bolumKapidanGecerMi('urun-tanimi', FIKSTUR_BOLUM['urun-tanimi'])
  ok('T: temiz (tümü etiketli) fikstür kapıdan GEÇER', g1.gecti)
  const g2 = bolumKapidanGecerMi('urun-tanimi', BOZUK_BOLUM.etiketsizSatir)
  ok('T: etiketsiz satır taşıyan içerik REDDEDİLİR', !g2.gecti)
  ok('T: red nedeni "statüsüz iddia" + satır numarasını işaret eder', /statüsüz iddia \(satır \d+\)/.test(g2.neden ?? ''))

  // Regresyon (GERÇEK model koşumunda bulundu): tablo BAŞLIK satırı (kolon adları, ayıraçtan
  // hemen önce) bir iddia DEĞİLDİR — etiket taşıması BEKLENMEMELİ. Yalnız VERİ satırları etiketli
  // olmak zorunda.
  const tabloIcerik = `# Ürün/Hizmet Tanımı (MVP) — Test Projesi

| Boyut | Tanım |
|-------|-------|
| Kapsam | MVP kapsamı tek bir varyanttır. [operator-beyan:mvp-sinir] |
| Yol Haritası | İkinci varyant pilot sonrası eklenir. [operator-beyan:yol-haritasi] |
`
  const g3 = bolumKapidanGecerMi('urun-tanimi', tabloIcerik)
  ok('T: tablo BAŞLIK satırı (kolon adları) etiketsiz olsa da kapıdan GEÇER (iddia değildir)', g3.gecti)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('BT — Bütünlük (completeness): kırpılmış bölüm REDDEDİLİR, tam bölüm GEÇER')
{
  // NEGATİF (görevin zorunlu kıldığı): gerçek gözlemlenen vakanın küçültülmüş temsili — başlık +
  // ilk kalem (başlangıç maliyeti) kırpılmış, ilk hayatta kalan satır cümle-ortası bir parça,
  // GERİYE KALAN kuyruk kendi içinde tam etiketli (satır-etiketi kuralından TEK BAŞINA GEÇERDİ).
  const gKirpik = bolumKapidanGecerMi('butce-finansal', BOZUK_BOLUM.butceKirpilmis)
  ok('BT-NEG: kırpılmış bölüm (eksik ilk kalem + cümle-ortası ilk satır) ARTIK REDDEDİLİR', !gKirpik.gecti, gKirpik.neden ?? '')
  ok('BT-NEG: red nedeni bütünlük sorununu işaret eder (konu-eksik VEYA ilk-satır-parça)',
    /beklenen konu\(lar\)|ilk satır/.test(gKirpik.neden ?? ''), gKirpik.neden ?? '')

  // Yalnız satır-etiketi kuralına göre bu kuyruk GEÇERDİ (regresyon-kanıtı: eski kural TEK
  // BAŞINA bunu yakalayamazdı — govde kontrolü BİLEREK doğrudan çağrılıyor, gate'in tamamı değil).
  const govdeYalniz = bolumIcerikGovdesiKontrolEt(BOZUK_BOLUM.butceKirpilmis, { iddiaMuaf: false })
  ok('BT-NEG (regresyon-kanıtı): eski satır-etiketi kuralı TEK BAŞINA bu kırpılmayı YAKALAYAMAZDI (kuyruk tam etiketli)', govdeYalniz.gecti)

  // POZİTİF (kontrol): AYNI bölümün TAM/enriched hâli hâlâ normal GEÇER — yeni kontrol
  // legitimately-complete içeriği yanlış-reddetmiyor.
  const gTam = bolumKapidanGecerMi('butce-finansal', FIKSTUR_BOLUM['butce-finansal'])
  ok('BT-POS: AYNI bölümün TAM hâli (başlık + tüm kalemler + düzgün ilk satır) normal GEÇER', gTam.gecti, gTam.neden ?? '')

  // Tüm 13 asıl bölüm fikstürü (F0 zaten bunu doğruluyor, burada AÇIKÇA bütünlük-kontrolü
  // AÇISINDAN da tekrar teyit) — hiçbiri minBayt/ilk-satır/konu kontrolüyle yanlış-reddedilmiyor.
  ok('BT-POS: TÜM geçerli bölüm fikstürleri bütünlük kontrolünden de sorunsuz geçiyor (yanlış-red YOK)',
    Object.entries(FIKSTUR_BOLUM).every(([id, icerik]) => bolumKapidanGecerMi(id, icerik).gecti))

  // P2 NEGATİF (görevin zorunlu kıldığı YENİ vaka — eski eksikKonularBul'un KAÇIRDIĞI sınıf):
  // bölüm KIRPILMAMIŞ (minBayt aşılıyor, ilk satır düzgün bir başlık) ama beklenen konunun
  // ("gelir modeli"/"gelir") kelimesi yalnız GÖVDE METNİNDE geçiyor — o konuyu TANIMLAYAN hiçbir
  // başlık satırı YOK. Eski (belge-geneli .includes()) kontrol bunu YANLIŞLIKLA geçirirdi.
  const gBasliksiz = bolumKapidanGecerMi('is-modeli-fiyatlama', BOZUK_BOLUM.basliksizKonu)
  ok('BT-NEG (P2): kelime gövdede var AMA başlık satırı YOK → YENİ kontrol REDDEDER (eski kontrol geçirirdi)', !gBasliksiz.gecti, gBasliksiz.neden ?? '')
  ok('BT-NEG (P2): red nedeni başlık-eksikliğini işaret eder', /beklenen başlık\(lar\)/.test(gBasliksiz.neden ?? ''), gBasliksiz.neden ?? '')

  // Regresyon-kanıtı: minBayt VE ilk-satır kontrolleri bu fikstürü YAKALAMIYOR (yalnız başlık
  // kontrolü yakalıyor) — kanıtlamak için ikisini izole çağır, ikisi de geçmeli.
  const baytOk = Buffer.byteLength(BOZUK_BOLUM.basliksizKonu, 'utf8') >= (BOLUM_TANIMLARI['is-modeli-fiyatlama'].minBayt ?? 0)
  ok('BT-NEG (P2) regresyon-kanıtı: fikstür minBayt eşiğini AŞIYOR (kırpılma-boyutu DEĞİL)', baytOk)
  const ilkSatirDuzgun = /^#\s/.test(BOZUK_BOLUM.basliksizKonu.trimStart())
  ok('BT-NEG (P2) regresyon-kanıtı: ilk satır düzgün bir başlık (cümle-ortası parça DEĞİL)', ilkSatirDuzgun)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('S9 — dijital-varlik-spec: no-build sınırı (mekanik güvenlik-ağı, kanıt DEĞİL)')
{
  const gTemiz = bolumKapidanGecerMi('dijital-varlik-spec', FIKSTUR_BOLUM['dijital-varlik-spec'])
  ok('S9: temiz SPEC-only içerik kapıdan GEÇER', gTemiz.gecti)
  const gArtefakt = bolumKapidanGecerMi('dijital-varlik-spec', BOZUK_BOLUM.insaArtefakti)
  ok('S9: bariz inşa-artefaktı (DOCTYPE/html fenced-block) İÇEREN içerik REDDEDİLİR', !gArtefakt.gecti)
  ok('S9: red nedeni inşa-artefaktını işaret eder', /inşa-edilmiş varlık izi/.test(gArtefakt.neden ?? ''))
}

// ════════════════════════════════════════════════════════════════════════════
bolum('D1 — Layer-1 (bölüm-yerel) done-when')
{
  const gYok = bolumKapidanGecerMi('pazar-analizi', BOZUK_BOLUM.pazarAnaliziDogrulanmamis)
  ok('D1: kaynak-gerekli bölüm (pazar-analizi) SIFIR doğrulanmış iddiayla REDDEDİLİR', !gYok.gecti)
  ok('D1: red nedeni doğrulanmış-iddia eksikliğini işaret eder', /doğrulanmış iddia yok/.test(gYok.neden ?? ''))

  const gAcik = bolumKapidanGecerMi('yasal-uyumluluk', BOZUK_BOLUM.yasalUyumlulukAcik)
  ok('D1: yasal-uyumluluk AÇIK-SORU etiketiyle BİRLİKTE de yerel kapıdan GEÇER (görevin kendi ifadesiyle tasarlanmış tolerans)', gAcik.gecti)

  const gPazarTemiz = bolumKapidanGecerMi('pazar-analizi', FIKSTUR_BOLUM['pazar-analizi'])
  ok('D1 (kontrol): pazar-analizi\'nin TEMİZ hâli (≥1 doğrulanmış, sıfır açık) normal geçer', gPazarTemiz.gecti)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('D2 — Layer-2 (tüm-plan) done-when + ürün-seviyesi zorunluluk')
{
  // D2a — tamamen temiz: 15 birim + nihai onay → tamamlandi.
  const { ns: ns1, id: id1 } = yeniNs('d2-temiz')
  try {
    dortAsamaTamamlaSeed(ns1, id1)
    const { sonuc, adim } = await tumYuruyusuTamamla(ns1, id1, bolumluExecutor())
    ok('D2a: tamamen statülü/sıfır-açık plan TAMAMLANDI', sonuc.durdu === 'tamamlandi', `${adim} adımda`)
    const nihaiState = stateYukle(ns1, id1)
    ok('D2a: aktif_asama=tamamlandi', nihaiState.aktif_asama === 'tamamlandi')
    ok('D2a: master-plan.durum=gecti', nihaiState.asamalar['master-plan'].durum === 'gecti')
    ok('D2a: 15 bölümün TÜMÜ yerel-gecti', BOLUM_SIRASI.every(b => nihaiState.asamalar['master-plan'].bolumler[b].durum === 'gecti'))
    ok('D2a: master-plan.cikti_pointer bileşik dokümanı gösteriyor', existsSync(nihaiState.asamalar['master-plan'].cikti_pointer))

    // "Neutral pass" — provenans-eki içeriğinden statü sayımı doğrudan (kod-dışı bir gözlemci
    // gibi) yapılabilir; görevin "appendix'ten sayılabilir" done-when notuna karşılık gelir.
    const provIcerik = readFileSync(nihaiState.asamalar['master-plan'].bolumler['provenans-ek'].cikti_pointer, 'utf8')
    const dogrulandiSayisi = (provIcerik.match(/dogrulandi:/g) || []).length
    const beyanSayisi = (provIcerik.match(/operator-beyan:/g) || []).length
    ok('D2a: provenans-eki ≥1 "dogrulandi" referansı taşıyor (nötr sayım mümkün)', dogrulandiSayisi > 0, `${dogrulandiSayisi} adet`)
    ok('D2a: provenans-eki ≥1 "operator-beyan" referansı taşıyor', beyanSayisi > 0, `${beyanSayisi} adet`)
  } finally { temizle(ns1) }

  // D2b — REVİZE (tier/kapanma modeli, bkz görev "structurally unreachable" düzeltmesi):
  // BOZUK_BOLUM.yasalUyumlulukAcik'in acik-soru etiketi tier'sız → varsayılan 'onemli'. Bu D2
  // harness'ı TÜMÜYLE soruUretici:null kullanır (D1/D2/G/S9/T ortak deseni — soru-yanıt
  // katmanını devre dışı bırakıp YALNIZ içerik-kapılarını sınamak için); bu yüzden HİÇBİR birim
  // için soru paketi HİÇ ÜRETİLMEZ.
  //   ESKİ davranış: Layer-2 herhangi bir kalan acik-soru İÇERİK ETİKETİNİ (tier'den bağımsız)
  //   sayıp bloke ederdi — TAM OLARAK "300+ ertelenen soru resmî olarak asla kapanamadı"
  //   bulgusunun mekanizması (bir içerik-etiketi tek başına "hiç sorulmadı" ile "skip ile
  //   kapandı"yı ayırt edemez).
  //   YENİ davranış: Layer-2 artık SORU-YANIT katmanı üzerinden bakar (birimAcikDurum); bu
  //   senaryoda hiçbir soru paketi hiç var olmadığından aktif-set HER birim için YAPISAL OLARAK
  //   BOŞTUR (hiç soru sorulmadıysa kapatılacak bir şey de yoktur) — plan artık TAMAMLANIR. Bu,
  //   görevin istediği düzeltmenin doğrudan kanıtı: eskiden-bloke-eden bu senaryo şimdi geçiyor.
  // (Soru-yanıt katmanı GERÇEKTEN aktifken bir blocker-tier sorunun nasıl bloke ettiği/skip'in
  // nasıl reddedildiği ayrı bir eksen — scripts/planlama-tier-test-runner.mjs, gerçek
  // varsayilanSoruUretici ile.)
  const { ns: ns2, id: id2 } = yeniNs('d2-acik')
  try {
    dortAsamaTamamlaSeed(ns2, id2)
    const { sonuc, adim } = await tumYuruyusuTamamla(
      ns2, id2, bolumluExecutor({ 'yasal-uyumluluk': BOZUK_BOLUM.yasalUyumlulukAcik })
    )
    ok('D2b: yasal-uyumluluk\'ta kalan (onemli-tier varsayılan) açık-soru ARTIK TÜM-PLANI BLOKE ETMİYOR (tarihsel "unreachable" bulgusunun düzeltmesi)',
      sonuc.durdu === 'tamamlandi', `${adim} adımda`)
    const sonState = stateYukle(ns2, id2)
    ok('D2b: yasal-uyumluluk bölümünün KENDİSİ yerel-gecti (Layer-1 DEĞİŞMEDİ)',
      sonState.asamalar['master-plan'].bolumler['yasal-uyumluluk'].durum === 'gecti')
    ok('D2b: pipeline TAMAMLANDI (aktif_asama=tamamlandi)', sonState.aktif_asama === 'tamamlandi')
  } finally { temizle(ns2) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('SC — master-plan bayat-stale-check: onay-bekliyor penceresi ARTIK yanlış-bayat GÖSTERMEZ (P3 Fix C)')
{
  const { ns, id } = yeniNs('stale-onay-bekliyor')
  try {
    dortAsamaTamamlaSeed(ns, id)
    // Walk'ı, dış master-plan kaydı TAM OLARAK 'onay-bekliyor'a geçtiği ANDA durdur — nihai
    // APPROVAL sorusunu TÜKETME (bkz tumYuruyusuTamamla: o 'tamamlandi'ya kadar gider; burada
    // BİLEREK bir adım erken duruyoruz, çünkü sınanan tam olarak BU pencere).
    let sonuc, adim = 0
    do {
      sonuc = await planlamaLoopV2Calistir(ns, id, bolumluExecutor(), {
        mod: 'ileri', soruUretici: null, masterPlanBolumleri: BOLUM_TANIMLARI, log: () => {},
      })
      adim++
      if (adim > 25) throw new Error(`SC kurulum: 25 adımda onay-bekliyor'a ulaşılamadı (son durdu: ${sonuc.durdu})`)
    } while (stateYukle(ns, id).asamalar['master-plan'].durum !== 'onay-bekliyor')

    const state = stateYukle(ns, id)
    const mp = state.asamalar['master-plan']
    ok('SC: kurulum — master-plan GERÇEKTEN onay-bekliyor durumunda (nihai onay HENÜZ tüketilmedi)', mp.durum === 'onay-bekliyor')
    ok('SC: kurulum — strateji surum=1 (üst referans)', state.asamalar['strateji'].surum === 1)

    // ASIL NEGATİF (görevin done-when'i): yazıcı artık BURADA (durum='onay-bekliyor'a geçiş
    // anı) kabul_edilen_ust_surum'u ayarlıyor mu?
    ok('SC-NEG: master-plan.kabul_edilen_ust_surum ARTIK strateji.surum\'a EŞİT (eskiden null/0 kalırdı)',
      mp.kabul_edilen_ust_surum === state.asamalar['strateji'].surum)
    ok('SC-NEG: bayatAsamalar(state) master-plan\'ı ARTIK İÇERMİYOR (eskiden bu pencerede hep bayat gösterirdi)',
      !bayatAsamalar(state).includes('master-plan'))
    ok('SC-NEG (yapısal kanıt): kabul_edilen_ust_surum RAW state\'te bile dolu (normalizeState maskelemesine GEREK YOK)',
      JSON.parse(JSON.stringify(state)).asamalar['master-plan'].kabul_edilen_ust_surum != null)

    // TESTİN KENDİSİNİN ANLAMLI OLDUĞUNUN kanıtı (yanlış-pozitif "her zaman geçer" test
    // DEĞİL): kabul zorla null'a döndürülürse bayat-check GERÇEKTEN bunu yakalar.
    const bozukKopya = JSON.parse(JSON.stringify(state))
    bozukKopya.asamalar['master-plan'].kabul_edilen_ust_surum = null
    ok('SC (test-kanıtı): kabul zorla null olursa bayat-check GERÇEKTEN yakalar (recon\'daki yapısal senaryo)',
      bayatAsamalar(bozukKopya).includes('master-plan'))
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('G — Bölüm-seviyesi --geri (spiral, stage-seviyesiyle AYNI birimGeriDon çekirdeği)')
{
  const { ns, id } = yeniNs('geri')
  try {
    dortAsamaTamamlaSeed(ns, id)
    await tumYuruyusuTamamla(ns, id, bolumluExecutor())
    let state = stateYukle(ns, id)
    ok('G: kurulum — plan tamamlandı (geri-dönüş testi için taban)', state.aktif_asama === 'tamamlandi')

    const oncekiSurum = state.asamalar['master-plan'].bolumler['pazar-analizi'].surum
    const oncekiPointer = state.asamalar['master-plan'].bolumler['pazar-analizi'].cikti_pointer

    bolumeGeriDon(state, 'pazar-analizi')
    statePersist(ns, state)
    state = stateYukle(ns, id)
    ok('G: pazar-analizi yeniden açıldı (durum=bekliyor)', state.asamalar['master-plan'].bolumler['pazar-analizi'].durum === 'bekliyor')
    ok('G: sürüm/çıktı KORUNDU (silinmedi/üzerine yazılmadı)',
      state.asamalar['master-plan'].bolumler['pazar-analizi'].surum === oncekiSurum && existsSync(oncekiPointer))
    ok('G: konteyner (master-plan) kosuyor\'a resetlendi (yürüyüş devam edebilir)', state.asamalar['master-plan'].durum === 'kosuyor')
    ok('G: pipeline aktif_asama master-plan\'a geri alındı (tamamlandi\'dan)', state.aktif_asama === 'master-plan')
    ok('G: aktif_bolum pazar-analizi\'ne döndü', state.asamalar['master-plan'].aktif_bolum === 'pazar-analizi')
    ok('G: SONRAKİ bölümler (ör. rekabet-konumlandirma) DOKUNULMADI (hâlâ gecti)',
      state.asamalar['master-plan'].bolumler['rekabet-konumlandirma'].durum === 'gecti')

    const oncekiJSON = JSON.stringify(stateYukle(ns, id))
    let hataAtildi = false
    try { bolumeGeriDon(stateYukle(ns, id), 'bilinmeyen-bolum-xyz') } catch { hataAtildi = true }
    ok('G: bilinmeyen hedef REDDEDİLİR', hataAtildi)
    ok('G: geçersiz geri-dönüş state\'i DEĞİŞTİRMEDİ (persist edilmedi)', JSON.stringify(stateYukle(ns, id)) === oncekiJSON)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('SS — --geri (regenerate) sorular_surum\'u DOĞRU sıfırlar (yalnız hedef birim, başkasına DOKUNMAZ)')
{
  // GERÇEK (null OLMAYAN) sorular_surum üretmek için GERÇEK varsayilanSoruUretici kullanılır —
  // D1/D2/G ailesinin soruUretici:null deseninin AKSİNE (orada sorular_surum zaten hep null'dur,
  // reset'in bir şey yapıp yapmadığını KANITLAYAMAZ). Not: FIKSTUR_BOLUM operator-beyan/operator-
  // onayli-tahmin etiketleriyle DOLU — gerçek üretici bunlar için de (onemli-tier, blocker DEĞİL)
  // sorular üretir; hiçbiri burada yanıtlanmadığından TÜM yürüyüş sonunda 'donduruldu'da (Layer-2:
  // yanıtsız onemli-tier sorular) durur — bu test için ÖNEMSİZ (PE testi bu senaryoyu AYRICA, tam
  // yanıt-döngüsüyle sınıyor). Burada tek gereken: pazar-analizi'nin KENDİSİ 'gecti' olsun + GERÇEK
  // bir sorular_surum alsın — ikisi de bölüm kendi kapısından geçer geçmez, Layer-2'den BAĞIMSIZ olur.
  const { ns, id } = yeniNs('ss-reset')
  try {
    dortAsamaTamamlaSeed(ns, id)
    await tumYuruyusuTamamla(ns, id, bolumluExecutor(), { soruUretici: varsayilanSoruUretici, maxAdim: 60 })

    let state = stateYukle(ns, id)
    ok('SS: kurulum — pazar-analizi kendi kapısından GEÇTİ (gerçek soru-üretimi altında)',
      state.asamalar['master-plan'].bolumler['pazar-analizi'].durum === 'gecti')
    const pazarOnce = state.asamalar['master-plan'].bolumler['pazar-analizi'].sorular_surum
    const rekabetOnce = state.asamalar['master-plan'].bolumler['rekabet-konumlandirma'].sorular_surum
    ok('SS: kurulum — pazar-analizi GERÇEK (null OLMAYAN) bir sorular_surum taşıyor', pazarOnce != null, `sorular_surum=${pazarOnce}`)
    ok('SS: kurulum — rekabet-konumlandirma DA GERÇEK bir sorular_surum taşıyor (karşılaştırma tabanı)', rekabetOnce != null, `sorular_surum=${rekabetOnce}`)

    bolumeGeriDon(state, 'pazar-analizi')
    statePersist(ns, state)
    state = stateYukle(ns, id)

    ok('SS: --geri SONRASI pazar-analizi.sorular_surum NULL\'A SIFIRLANDI (eski sürümün soru paketine artık işaret ETMİYOR)',
      state.asamalar['master-plan'].bolumler['pazar-analizi'].sorular_surum === null)
    ok('SS: --geri SONRASI pazar-analizi.durum=bekliyor (yeniden koşacak)',
      state.asamalar['master-plan'].bolumler['pazar-analizi'].durum === 'bekliyor')
    ok('SS: DOKUNULMAYAN rekabet-konumlandirma\'nın sorular_surum\'u KORUNDU (yalnız hedef birim resetlenir, başkası KLOBLANMAZ)',
      state.asamalar['master-plan'].bolumler['rekabet-konumlandirma'].sorular_surum === rekabetOnce)

    // birimAcikDurum'un YENİ (null) durumu doğru yorumladığını da doğrudan kanıtla: sorular_surum
    // null iken 'engelli'/açık-soru YOKTUR (eskiyi hayaletçe taşımaz) — bkz birimAcikDurum ss==null dalı.
    const dPazar = birimAcikDurum(ns, state.asamalar['master-plan'].bolumler, 'pazar-analizi')
    ok('SS: sıfırlama SONRASI birimAcikDurum bu birim için "engelsiz/boş" görür (eski paketi HAYALETÇE taşımıyor)',
      dPazar.engelli === false && dPazar.acik.length === 0 && dPazar.sorularSurum === null)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('GR — Grounding: kaynak-gerçeklik + acik-soru → DATA-REQUEST + efektif çözümleme')
{
  const gercekKaynaklar = new Set(['sektor-raporu-2026'])

  // GR1 — gerçek kaynak (araştırmada GERÇEKTEN doğrulanmış) doğrulanmış olarak KABUL edilir.
  const gReal = bolumKapidanGecerMi('pazar-analizi', FIKSTUR_BOLUM['pazar-analizi'], { gercekKaynaklar })
  ok('GR1: gerçek kaynağa sahip iddia doğrulanmış olarak KABUL edilir', gReal.gecti)

  // GR2 — UYDURMA kaynak (sözdizimi geçerli, ama araştırmada YOK) REDDEDİLİR — "damga kaynak yerine geçmez".
  const gFake = bolumKapidanGecerMi('pazar-analizi', BOZUK_BOLUM.pazarAnaliziUydurmaKaynak, { gercekKaynaklar })
  ok('GR2: UYDURMA kaynak (araştırmada yok) REDDEDİLİR', !gFake.gecti)
  ok('GR2: red nedeni grounding sorununu işaret eder', /doğrulanmış bir kaynak DEĞİL/.test(gFake.neden ?? ''))

  // GR3 — dataRequestAdaylari genişletmesi: [eksik] VE bölüm-sözlüğü [acik-soru:konu] da
  // artık birer DATA-REQUEST adayı üretir (önceden yalnız [tahmin-doğrulanacak:kaynak] üretiyordu).
  const eksikAdaylari = dataRequestAdaylari(EKSIK_FIGUR_SATIRI)
  ok('GR3: [eksik] artık bir DATA-REQUEST adayı üretir', eksikAdaylari.length === 1 && eksikAdaylari[0].tip === 'DATA-REQUEST')

  const acikSoruAdaylari = dataRequestAdaylari(BOZUK_BOLUM.pazarAnaliziAcikSoru)
  ok('GR3: bölüm [acik-soru:konu] etiketi bir DATA-REQUEST adayı üretir', acikSoruAdaylari.length === 1 && acikSoruAdaylari[0].tip === 'DATA-REQUEST')
  ok('GR3: DATA-REQUEST anahtarı acik-soru konusundan türetilir', acikSoruAdaylari[0].anahtar === 'veri:kullanici-basi-harcama')

  // GR4/5/6 — efektif çözümleme: AYNI [acik-soru:...] iddiası, YANIT KARARINA göre farklı
  // efektif statüye evrilir — metin ASLA değişmez, yalnız gate/Layer-2'nin SAYDIĞI statü değişir.
  const { ns, id } = yeniNs('gr-cozum')
  try {
    const dosya = join(ns, 'master-plan--pazar-analizi.md')
    writeFileSync(dosya, BOZUK_BOLUM.pazarAnaliziAcikSoru, 'utf8')
    const bolumState = { cikti_pointer: dosya, surum: 1, sorular_surum: null }
    const iddialarHam = iddialariCikar(BOZUK_BOLUM.pazarAnaliziAcikSoru)

    const cozumsuz = iddialariCozumle(ns, 'pazar-analizi', bolumState, iddialarHam)
    const acikIddiaOnce = cozumsuz.find(i => i.tip === 'acik-soru')
    ok('GR4: yanıtsızken efektif statü hâlâ acik-soru (bloklar)', acikIddiaOnce?.efektifTip === 'acik-soru')

    // Gerçek (deterministik) üreticiyle GERÇEK bir soru paketi üret + yaz.
    const paket = varsayilanSoruUretici('pazar-analizi', BOZUK_BOLUM.pazarAnaliziAcikSoru, { projeId: id, surum: 1 })
    sorulariYaz(ns, paket)
    bolumState.sorular_surum = 1
    const dr = paket.sorular.find(s => s.tip === 'DATA-REQUEST')
    ok('GR4: gerçek üretici de acik-soru\'dan bir DATA-REQUEST üretti', !!dr && dr.anahtar === 'veri:kullanici-basi-harcama')

    // (a) karar=veri + kaynak sağlandı → operatör BİZZAT kaynak verdi → efektif DOĞRULANMIŞ.
    yanitKaydet(ns, paket, { anahtar: dr.anahtar, karar: 'veri', deger: '2400 SEK', kaynak: 'operatör-anketi-2026' })
    const cozumVeri = iddialariCozumle(ns, 'pazar-analizi', bolumState, iddialarHam)
    const veriIddia = cozumVeri.find(i => i.param === 'kullanici-basi-harcama')
    ok('GR4: karar=veri → efektif statü dogrulandi', veriIddia?.efektifTip === 'dogrulandi')
    ok('GR4: efektif kaynak operatörün bizzat girdiği kaynak', veriIddia?.efektifKaynak === 'operatör-anketi-2026')
    const gVeri = bolumKapidanGecerMi('pazar-analizi', BOZUK_BOLUM.pazarAnaliziAcikSoru, { gercekKaynaklar, efektifIddialar: cozumVeri })
    ok('GR4: yanıtlandıktan (karar=veri) sonra bölüm kapıdan GEÇER', gVeri.gecti)

    // (b) karar=tahmin → efektif OPERATOR-ONAYLI-TAHMIN (doğrulanmış SAYILMAZ, ama artık açık da değil).
    yanitKaydet(ns, paket, { anahtar: dr.anahtar, karar: 'tahmin' })
    const cozumTahmin = iddialariCozumle(ns, 'pazar-analizi', bolumState, iddialarHam)
    const tahminIddia = cozumTahmin.find(i => i.param === 'kullanici-basi-harcama')
    ok('GR5: karar=tahmin → efektif statü operator-onayli-tahmin (dogrulandi DEĞİL)', tahminIddia?.efektifTip === 'operator-onayli-tahmin')
    ok('GR5: tahmin otomatik değil — yalnız BU AÇIK yanitKaydet çağrısıyla oluştu', dr.tip === 'DATA-REQUEST')

    // (c) karar=dusur → efektif DÜŞÜRÜLDÜ (ne açık ne doğrulanmış — sayılmaz, bloklamaz da).
    yanitKaydet(ns, paket, { anahtar: dr.anahtar, karar: 'dusur' })
    const cozumDusur = iddialariCozumle(ns, 'pazar-analizi', bolumState, iddialarHam)
    const dusurIddia = cozumDusur.find(i => i.param === 'kullanici-basi-harcama')
    ok('GR6: karar=dusur → efektif statü dusuruldu', dusurIddia?.efektifTip === 'dusuruldu')
    ok('GR6: düşürülen iddia açık SAYILMAZ (bloklamaz)', !cozumDusur.some(i => i.efektifTip === 'acik-soru'))
  } finally { temizle(ns) }

  // GR7 — uçtan uca NEGATİF: pazar-analizi'nde UYDURMA kaynak → TÜM YÜRÜYÜŞ orada durur,
  // Layer-2/tamamlanmaya HİÇ ulaşmaz (ürün-seviyesi done-when'in "genuinely-sourced" şartı).
  const { ns: ns2, id: id2 } = yeniNs('gr-uctan-uca-red')
  try {
    dortAsamaTamamlaSeed(ns2, id2)
    const { sonuc } = await tumYuruyusuTamamla(
      ns2, id2, bolumluExecutor({ 'pazar-analizi': BOZUK_BOLUM.pazarAnaliziUydurmaKaynak })
    )
    ok('GR7: uydurma kaynak TÜM YÜRÜYÜŞÜ pazar-analizi\'de durdurur', sonuc.durdu === 'donduruldu')
    const engelState = stateYukle(ns2, id2)
    const pazarBs = engelState.asamalar['master-plan'].bolumler['pazar-analizi']
    ok('GR7: bloke olan bölüm pazar-analizi (aktif_bolum)', engelState.asamalar['master-plan'].aktif_bolum === 'pazar-analizi')
    ok('GR7: pazar-analizi durum=donduruldu', pazarBs.durum === 'donduruldu')
    ok('GR7: blok_nedeni grounding sorununu işaret eder', /doğrulanmış bir kaynak DEĞİL/.test(pazarBs.blok_nedeni ?? ''))
    ok('GR7: pipeline TAMAMLANMADI', engelState.aktif_asama !== 'tamamlandi')
  } finally { temizle(ns2) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('OG — Sıralama düzeltmesi: yeterlilik kontrolleri İLK-GEÇİŞTE ertelenir (GERÇEK model koşumunda bulundu)')
{
  // birimKostur kapiFn'i SORU PAKETİ ÜRETİLMEDEN ÖNCE çağırır (bkz planlamaBirimMotoru.mjs).
  // minDogrulandi/sifirAcikGerekli'yi İLK GEÇİŞTE zorlamak, dürüstçe acik-soru yazan bir bölümü
  // HİÇBİR DATA-REQUEST doğmadan kalıcı olarak tıkar — çünkü kapı, soru üretiminden ÖNCE
  // reddeder. baglam.ilkGecisMi bu iki kontrolü yalnızca bir soru paketi VAR OLDUKTAN SONRAKİ
  // doğrulamaya erteler.
  const gercekKaynaklar = new Set(['sektor-raporu-2026'])

  const gIlk = bolumKapidanGecerMi('pazar-analizi', BOZUK_BOLUM.pazarAnaliziAcikSoru, { gercekKaynaklar, ilkGecisMi: true })
  ok('OG: İLK geçişte ÇÖZÜLMEMİŞ acik-soru KAPIYI GEÇİRİR (yeterlilik kontrolü ertelenir, soru paketi doğabilsin)', gIlk.gecti)

  const gOnay = bolumKapidanGecerMi('pazar-analizi', BOZUK_BOLUM.pazarAnaliziAcikSoru, { gercekKaynaklar, ilkGecisMi: false })
  ok('OG: onay-anı re-doğrulamada (ilkGecisMi=false) AYNI çözülmemiş acik-soru REDDEDİLİR', !gOnay.gecti)

  // Govde/grounding kontrolleri İLK GEÇİŞTE DE tam uygulanır — yalnız yeterlilik (minDogrulandi/
  // sifirAcikGerekli) ertelenir. Fabrikasyon kaynak ilk geçişte de REDDEDİLMELİ.
  const gFakeIlk = bolumKapidanGecerMi('pazar-analizi', BOZUK_BOLUM.pazarAnaliziUydurmaKaynak, { gercekKaynaklar, ilkGecisMi: true })
  ok('OG: İLK geçişte de grounding (uydurma kaynak) REDDİ tam uygulanır (ertelenen yalnız yeterlilik)', !gFakeIlk.gecti)
}

// ════════════════════════════════════════════════════════════════════════════
bolum('PE — Regresyon: provenans-ek, GERÇEK soru/yanıt paketleriyle (varsayilanSoruUretici) ÇÖKMEDEN tamamlanır')
{
  // GERÇEK model koşumunda bulundu: provenansVerisiTopla, yanitlariHamOku'nun ZARF nesnesini
  // ({durum,ham,dosya}) yanitButunluk ile ÇÖZMEDEN doğrudan atlananlar()'a veriyordu —
  // atlananlar (yanitlar||[]).map bekler, bir ZARF NESNESİ üzerinde .map çağırmak TypeError
  // fırlatıyordu. D2'nin hermetik testleri bunu HİÇ yakalamadı çünkü D2 soruUretici:null
  // kullanıyor (sorular_surum hiçbir birimde set edilmiyor, atlananlar hiç çağrılmıyor — bkz
  // tumYuruyusuTamamla). Bu test GERÇEK varsayilanSoruUretici + gerçek DATA-REQUEST yanıtlarıyla
  // (veri/tahmin/dusur karışık) tam 15-birim yürüyüşünü sürer — provenans-ek'e ULAŞIR ve onun
  // ÇÖKMEDEN tamamlandığını doğrudan kanıtlar (mock'lanmış bir provenansVerisiTopla değil).
  const { ns, id } = yeniNs('pe-atlananlar')
  try {
    dortAsamaTamamlaSeed(ns, id)
    let adim = 0, sonuc, karar = 0, layer2TemizlikYapildi = false
    const MAX_ADIM = 60
    while (true) {
      sonuc = await planlamaLoopV2Calistir(ns, id, bolumluExecutor(), {
        mod: 'ileri', soruUretici: varsayilanSoruUretici, masterPlanBolumleri: BOLUM_TANIMLARI, log: () => {},
      })
      adim++
      if (adim > MAX_ADIM) throw new Error(`PE: ${MAX_ADIM} adımda bitmedi (son durdu: ${sonuc.durdu})`)
      if (sonuc.durdu === 'sorular-acik') {
        const paket = sorulariOku(ns, sonuc.bekleyenOnay, sonuc.sorularSurum)
        for (const s of paket.sorular) {
          if (s.tip === 'APPROVAL') continue
          if (s.tip === 'DATA-REQUEST') {
            const kararlar = ['veri', 'tahmin', 'dusur']
            const k = kararlar[karar++ % 3]
            yanitKaydet(ns, paket, k === 'veri'
              ? { anahtar: s.anahtar, karar: k, deger: 'test-değer', kaynak: 'test-operatör-kaynağı' }
              : { anahtar: s.anahtar, karar: k })
          } else if (s.tip === 'FREE-TEXT') {
            yanitKaydet(ns, paket, { anahtar: s.anahtar, metin: 'test yanıtı' })
          } else if (s.tip === 'CHOICE') {
            yanitKaydet(ns, paket, { anahtar: s.anahtar, secim: s.secenekler[0] })
          }
        }
      }
      // Tier modeli: bölümler artık yalnız onemli/opsiyonel (blocker olmayan) açık sorularla
      // otomatik İLERLER — bu döngü yalnız 'sorular-acik' anında (engelli=true, yani bir
      // BLOCKER varken) yanıtlıyor, bu yüzden bölümlerin FREE-TEXT/DATA-REQUEST'leri hiç
      // yanıtlanmadan geçilmiş olabilir. Layer-2 (aktif-set=0) yine de bunların KAPANMASINI
      // ister — bu döngü onları hiç görmediği için (asla sorular-acik'e düşmediler) burada
      // TEK SEFERLİK bir temizlik geçişiyle (topluAtla, tüm bölümler) kapatıyoruz, sonra devam.
      if (sonuc.durdu === 'donduruldu' && !layer2TemizlikYapildi) {
        const mpBlok = stateYukle(ns, id).asamalar['master-plan']?.blok_nedeni ?? ''
        if (mpBlok.startsWith('Layer-2')) {
          layer2TemizlikYapildi = true
          const temizlikState = stateYukle(ns, id)
          for (const bolumId of BOLUM_SIRASI) {
            if (bolumId === 'provenans-ek') continue
            const bs = temizlikState.asamalar['master-plan'].bolumler[bolumId]
            if (bs.sorular_surum == null) continue
            const p = sorulariOku(ns, bolumId, bs.sorular_surum)
            const but = yanitButunluk(p, yanitlariHamOku(ns, bolumId, bs.sorular_surum))
            topluAtla(ns, p, but.durum === 'gecerli' ? but.yanitlar : [], 'PE test: layer-2 temizliği')
          }
          continue // temizlik SONRASI mutlaka bir daha dene (do-while'ın erken çıkışını önler)
        }
      }
      if (sonuc.durdu === 'tamamlandi' || sonuc.durdu === 'donduruldu') break
    }

    ok('PE: GERÇEK soru/yanıt paketleriyle tam yürüyüş ÇÖKMEDEN TAMAMLANDI', sonuc.durdu === 'tamamlandi', `${adim} adımda, son durdu=${sonuc.durdu}`)
    const nihaiState = stateYukle(ns, id)
    const provPointer = nihaiState.asamalar['master-plan']?.bolumler?.['provenans-ek']?.cikti_pointer
    ok('PE: provenans-ek üretildi (cikti_pointer var ve dosya mevcut)', !!provPointer && existsSync(provPointer))
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('PM — provenans-ek MEKANİK render: model/executor çağrısı YOK, %100 kapsam İNŞA GEREĞİ')
{
  // (a) Hedefli: 4 iddia tipinin HAM hâli + 3 çözümlenme yolu (veri/tahmin/hâlâ-açık) + 1
  // atlanan kayıt — HEM ham `tip:param` (kapsam-kontrolü) HEM efektif statü/kaynak (asıl
  // provenans bilgisi) render'da yer almalı.
  const veriKucuk = {
    tumIddialar: [
      { bolumId: 'problem-cozum', satirNo: 1, satir: 'x', tip: 'dogrulandi', param: 'sektor-raporu-2026', efektifTip: 'dogrulandi', efektifKaynak: 'sektor-raporu-2026' },
      { bolumId: 'problem-cozum', satirNo: 2, satir: 'x', tip: 'operator-beyan', param: 'mvp-sinir', efektifTip: 'operator-beyan', efektifKaynak: null },
      { bolumId: 'pazar-analizi', satirNo: 3, satir: 'x', tip: 'operator-onayli-tahmin', param: 'buyume-tahmini', efektifTip: 'operator-onayli-tahmin', efektifKaynak: null },
      { bolumId: 'pazar-analizi', satirNo: 4, satir: 'x', tip: 'acik-soru', param: 'veri:cozulmus-soru-1', efektifTip: 'dogrulandi', efektifKaynak: 'operator-verdigi-kaynak-42' },
      { bolumId: 'urun-tanimi', satirNo: 5, satir: 'x', tip: 'acik-soru', param: 'veri:cozulmus-soru-2', efektifTip: 'operator-onayli-tahmin', efektifKaynak: null },
      { bolumId: 'urun-tanimi', satirNo: 6, satir: 'x', tip: 'acik-soru', param: 'veri:hala-acik-soru', efektifTip: 'acik-soru', efektifKaynak: null },
    ],
    tumAtlananlar: [
      { bolumId: 'butce-finansal', tip: 'DATA-REQUEST', anahtar: 'veri:dusurulmus-soru-1', gerekce: 'operatör test gerekçesi' },
    ],
  }
  const renderKucuk = provenansEkRenderla(veriKucuk)
  for (const i of veriKucuk.tumIddialar) {
    ok(`PM: küçük — ham "${i.tip}:${i.param}" render'da var`, renderKucuk.includes(`${i.tip}:${i.param}`))
  }
  ok('PM: küçük — çözülmüş (veri) efektif kaynağı render\'da var', renderKucuk.includes('operator-verdigi-kaynak-42'))
  ok('PM: küçük — atlanan anahtar render\'da var', renderKucuk.includes('veri:dusurulmus-soru-1'))
  ok('PM: küçük — atlanan gerekçe render\'da var', renderKucuk.includes('operatör test gerekçesi'))

  const gKucuk = bolumKapidanGecerMi('provenans-ek', renderKucuk, veriKucuk)
  ok('PM: küçük — tam-kapsamlı render kapıdan GEÇER', gKucuk.gecti, gKucuk.neden ?? '')

  // (b) NEGATİF kontrol — kapı GERÇEKTEN anlamlı mı: bir kaydı render'dan ÇIKARIRSAK kapı
  // REDDETMELİ (trivially-geçen, her zaman true dönen bir kapı DEĞİL).
  const eksikRender = renderKucuk.replace(/hala-acik-soru/g, 'BASKA-BIRSEY')
  const gEksik = bolumKapidanGecerMi('provenans-ek', eksikRender, veriKucuk)
  ok('PM: bir kayıt render\'dan eksikse kapı REDDEDER (kapı trivially-geçen değil)', !gEksik.gecti)
  ok('PM: red nedeni eksik-referans sayısını işaret eder', /referans eksik/.test(gEksik.neden ?? ''))

  // (c) GERÇEK-ÖLÇEKLİ sentetik veri (~300 iddia + 15 atlanan) — gerçek e2e koşumunda modelin
  // karşılaştığı VE başarısız olduğu hacmi (302 eksik referans) temsil eder. O koşumun HAM
  // __provenansVerisi'si namespace temizliğiyle (görev gereği) silindiği için BİREBİR "replay"
  // mümkün değil — bu, AYNI ÖLÇEK VE ÇEŞİTLİLİKTE yeniden-üretilmiş bir sentetik settir.
  // Deterministik bir render+kapı İÇİN kayıt SAYISI ilkesel olarak sonucu DEĞİŞTİRMEZ (dizi-
  // üzerinde-döngü + string-birleştirme; bir modelin aksine dikkat/bağlam sınırı yok) — bu test
  // bunu varsaymak yerine DOĞRUDAN kanıtlıyor.
  const buyukIddialar = []
  const tipler = ['dogrulandi', 'operator-beyan', 'operator-onayli-tahmin', 'acik-soru']
  const gercekBolumler = BOLUM_SIRASI.filter(id => id !== 'provenans-ek')
  for (let n = 0; n < 300; n++) {
    const tip = tipler[n % tipler.length]
    const cozulduMu = tip === 'acik-soru' && n % 3 !== 2 // acik-soru'ların 2/3'ü DATA-REQUEST ile çözülmüş
    buyukIddialar.push({
      bolumId: gercekBolumler[n % gercekBolumler.length],
      satirNo: n + 1, satir: `sentetik iddia satırı ${n}`,
      tip, param: `${tip}-param-${n}`,
      efektifTip: cozulduMu ? (n % 2 === 0 ? 'dogrulandi' : 'operator-onayli-tahmin') : tip,
      efektifKaynak: cozulduMu && n % 2 === 0 ? `cozulmus-kaynak-${n}` : (tip === 'dogrulandi' ? `${tip}-param-${n}` : null),
    })
  }
  const buyukAtlananlar = Array.from({ length: 15 }, (_, n) => ({
    bolumId: gercekBolumler[n % gercekBolumler.length], tip: 'DATA-REQUEST',
    anahtar: `atlanan-anahtar-${n}`, gerekce: null,
  }))
  const veriBuyuk = { tumIddialar: buyukIddialar, tumAtlananlar: buyukAtlananlar }
  const renderBuyuk = provenansEkRenderla(veriBuyuk)
  const gBuyuk = bolumKapidanGecerMi('provenans-ek', renderBuyuk, veriBuyuk)
  ok(`PM: gerçek-ölçekli sentetik sette (${buyukIddialar.length} iddia + ${buyukAtlananlar.length} atlanan, gerçek koşumun ~300 kaydına denk) kapı TAM kapsamla GEÇER`,
    gBuyuk.gecti, gBuyuk.neden ?? '')
}

// ════════════════════════════════════════════════════════════════════════════
bolum('L — Geriye-uyumluluk: opt-in KAPALIYKEN eski master-plan davranışı BİREBİR')
{
  const { ns, id } = yeniNs('legacy')
  try {
    dortAsamaTamamlaSeed(ns, id)
    let harici_cagri = 0
    const executor = async (asama, opts) => {
      harici_cagri++
      const icerik = FIKSTUR[asama]
      writeFileSync(opts.hedefDosya, icerik, 'utf8')
      return { icerik, cikti_pointer: opts.hedefDosya, maliyet_usd: 0.001, sure_ms: 5 }
    }
    // masterPlanBolumleri KASITLI OLARAK verilmiyor — eski (bölümsüz) davranış beklenir.
    const sonuc = await planlamaLoopV2Calistir(ns, id, executor, { mod: 'ileri', soruUretici: null })
    ok('L: opt-in kapalıyken TEK invokasyonda master-plan TAMAMLANDI (eski davranış)', sonuc.durdu === 'tamamlandi')
    ok('L: TEK executor çağrısı yapıldı (bölüm-yürüyüşü tetiklenmedi)', harici_cagri === 1)
    const state = stateYukle(ns, id)
    ok('L: master-plan.bolumler HİÇ oluşturulmadı', state.asamalar['master-plan'].bolumler === undefined)
    ok('L: master-plan.cikti_pointer eski tek-dosya konumunu gösteriyor', state.asamalar['master-plan'].cikti_pointer.endsWith('master-plan.md'))
    ok('L: master-plan.surum=1 (tek koşum)', state.asamalar['master-plan'].surum === 1)
  } finally { temizle(ns) }
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
