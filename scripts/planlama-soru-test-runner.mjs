// meta-layer-core — SORU–YANIT katmanı testleri (hermetik, MODELSİZ, V2).
// Ham loop'u varsayilanSoruUretici ile (katman AÇIK) sürer; state + tüm artefaktlar OS
// geçici dizinine yazılır (Drive'a DOKUNULMAZ). Mock executor model ÇAĞIRMAZ → tüm koşum
// zaten modelsiz; ayrıca her BLOK yolunda executor çağrı sayacının 0 olduğu doğrulanır.
//
// Kapsam (sözleşmenin negatif vakaları dâhil):
//   F0  fikstür + üretici drift kalkanı
//   U   birim: overflow>7→ertelenen · CHOICE önerisiz→defekt · DATA-REQUEST 3-seçenek · bütünlük
//   N1  yanıtsız → BLOK (executor çağrılmaz, sonraki aşama koşmaz)
//   N2  atlama YALNIZ açık atlandi ile; boş/eksik kayıt AÇIK kalır
//   N3  kurcalanmış/geçersiz/yanlış-sürüm yanıt → BLOK + soruları yeniden-yayınla
//   N5  --geri sonrası v2 seti v1 yanıtını OTO-TÜKETMEZ; eşleşenlere ÖN-DOLGU sunar
//   N7  {yalnız-APPROVAL} set → yeniden-çağırmada eski kapı gibi ilerler (geriye-uyum)
//   N8  provenans: tüketilen üst-yanıt sürümü state'e yazılır
//
// Koşum: node scripts/planlama-soru-test-runner.mjs

import { existsSync, rmSync, mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { stateYukle, GERCEK_ASAMALAR } from '../tools/planlamaDurumMakinesiV2.mjs'
import { planlamaLoopV2Calistir } from '../tools/planlamaLoopV2.mjs'
import { planlamaGeri } from '../tools/planlamaBaslat.mjs'
import {
  varsayilanSoruUretici, soruPaketiKur, soruOnay, soruCHOICE, soruSerbest, soruSetiKur,
  sorulariDogrula, sorulariOku, yanitDosyaAdi, atlaYaz, yanitKaydet, yanitButunluk,
  yanitlariHamOku, acikSorular, MAX_SORU,
} from '../tools/planlamaSorular.mjs'
import { SORULU, soruFiksturuDogrula } from './planlama-soru-fikstur.mjs'

// ── Test çerçevesi ───────────────────────────────────────────────────────────
let gecti = 0, kaldi = 0
function ok(ad, kosul) {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}`) }
}
function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}
function yeniNs(etiket) { return { ns: mkdtempSync(join(tmpdir(), `soru-test-${etiket}-`)), id: `_test-${etiket}` } }
function temizle(ns) { try { rmSync(ns, { recursive: true, force: true }) } catch {} }

// ── Bağımsız executor çağrı sayacı (SUT'a güvenmez) ──────────────────────────
let harici_cagri = 0
function soruluExecutor(overrides = {}) {
  return async (asama, { hedefDosya } = {}) => {
    harici_cagri++
    const icerik = overrides[asama] ?? SORULU[asama]
    writeFileSync(hedefDosya, icerik, 'utf8')
    return { icerik, cikti_pointer: hedefDosya, maliyet_usd: 0, sure_ms: 1 }
  }
}
async function inv(ns, id, executor, opts = {}) {
  harici_cagri = 0
  const sonuc = await planlamaLoopV2Calistir(ns, id, executor, {
    log: () => {}, soruUretici: varsayilanSoruUretici, ...opts,
  })
  ok(`inv: harici sayaç == SUT sayacı (${harici_cagri})`, harici_cagri === sonuc.executorCagriSayisi)
  return sonuc
}

// Operatör yanıtı simülasyonu (dosya-düzenleme yeterli — "herhangi bir yolla").
function genesisYanitla(ns, surum, { serbestAtla = true } = {}) {
  const paket = sorulariOku(ns, 'genesis', surum)
  for (const s of paket.sorular) {
    if (s.tip === 'CHOICE') yanitKaydet(ns, paket, { anahtar: s.anahtar, secim: s.oneri })
    else if (s.tip === 'DATA-REQUEST') yanitKaydet(ns, paket, { anahtar: s.anahtar, karar: 'veri', deger: 'yıllık %18', kaynak: 'test-pazar-2024' })
    else if (s.tip === 'FREE-TEXT') {
      if (serbestAtla) atlaYaz(ns, paket, s.anahtar, 'test: eklenecek bağlam yok')
      else yanitKaydet(ns, paket, { anahtar: s.anahtar, metin: 'test bağlamı' })
    }
  }
  return paket
}
function serbestiAtla(ns, asama, surum) {
  const paket = sorulariOku(ns, asama, surum)
  const fr = paket.sorular.find(s => s.tip === 'FREE-TEXT')
  if (fr) atlaYaz(ns, paket, fr.anahtar, 'test: yok')
  return paket
}
// Ham yanıt yaz (kurcalama testleri için — dosya adı gerçek sürüm, içerik istenildiği gibi).
function hamYanitYaz(ns, asama, dosyaSurum, govde) {
  writeFileSync(join(ns, yanitDosyaAdi(asama, dosyaSurum)), JSON.stringify(govde, null, 2), 'utf8')
}

// ══ F0 — Fikstür + üretici drift kalkanı ═══════════════════════════════════════
bolum('F0 — Soru fikstürü + üretici drift kalkanı')
let f0 = false
try { f0 = soruFiksturuDogrula() } catch (e) { console.error('  ' + e.message) }
ok('F0: fikstürler kapı + üreticiden geçti', f0 === true)

// ══ U — Birim: cap/overflow · CHOICE önerisi · DATA-REQUEST · bütünlük ═════════════
bolum('U — Birim değişmezleri')
{
  // Overflow: 1 APPROVAL + 9 FREE-TEXT → ana ≤7, 8.+ ertelenen'de, ana sette DEĞİL.
  const adaylar = [soruOnay('t')]
  for (let i = 0; i < 9; i++) adaylar.push(soruSerbest({ anahtar: `serbest:${i}`, metin: `q${i}`, onem: 50 - i }))
  const set = soruSetiKur(adaylar)
  ok('U(overflow): ana set ≤ 7', set.sorular.length <= MAX_SORU)
  ok('U(overflow): ana set = 7 (1 APPROVAL + 6)', set.sorular.length === 7)
  ok('U(overflow): 3 aday ertelendi', set.ertelenen.length === 3)
  ok('U(overflow): en düşük önem (serbest:8) ertelenen’de', set.ertelenen.some(s => s.anahtar === 'serbest:8'))
  ok('U(overflow): 8.+ aday ana sette GÖRÜNMEZ', !set.sorular.some(s => s.anahtar === 'serbest:8'))

  // CHOICE önerisiz → defekt (builder fırlatır).
  let throwsBuilder = false
  try { soruCHOICE({ anahtar: 'x', metin: 'm', oneri: '' }) } catch { throwsBuilder = true }
  ok('U(CHOICE): önerisiz CHOICE builder fırlatır', throwsBuilder)

  // sorulariDogrula: elle kurulmuş önerisiz/öneri-ilk-değil CHOICE reddedilir.
  const bozukChoice = {
    sema: 1, proje_id: '_u', asama: 'genesis', surum: 1, olusturma: 'x',
    sorular: [soruOnay('genesis'), { anahtar: 'c', tip: 'CHOICE', onem: 90, metin: 'm', oneri: 'A', secenekler: ['B', 'A'] }],
    ertelenen: [],
  }
  bozukChoice.imza = 'x'
  let dogrulaReddetti = false
  try { sorulariDogrula(bozukChoice) } catch { dogrulaReddetti = true }
  ok('U(CHOICE): öneri ilk-sırada değil → sorulariDogrula reddeder', dogrulaReddetti)

  // DATA-REQUEST tam 3 seçenek + geçerli üretim imzası.
  const pg = varsayilanSoruUretici('genesis', SORULU.genesis, { projeId: '_u', surum: 1 })
  ok('U: üretilen paket doğrulamadan geçer', sorulariDogrula(pg) === true)
  ok('U(DATA-REQUEST): tam 3 seçenek', pg.sorular.find(s => s.tip === 'DATA-REQUEST')?.secenekler.length === 3)
  ok('U(CHOICE): öneri == secenekler[0]', (() => { const c = pg.sorular.find(s => s.tip === 'CHOICE'); return c.oneri === c.secenekler[0] })())
}

// ══ N1 — Yanıtsız → BLOK (modelsiz) ════════════════════════════════════════════
bolum('N1 — Yanıtsız → BLOK')
{
  const { ns, id } = yeniNs('n1')
  try {
    const s1 = await inv(ns, id, soruluExecutor())
    ok('N1: inv1 genesis koştu, durdu=sorular-acik', s1.durdu === 'sorular-acik' && s1.kostuAsama === 'genesis')
    ok('N1: inv1 açık sorular var (CHOICE+DATA+FREE = 3)', s1.acikSorular.length === 3)
    ok('N1: inv1 APPROVAL açık listede DEĞİL', !s1.acikSorular.some(q => q.tip === 'APPROVAL'))
    ok('N1: genesis.sorular_surum=1', s1.state.asamalar.genesis.sorular_surum === 1)

    // Yanıt YAZMADAN yeniden çağır → hâlâ BLOK, executor ÇAĞRILMAZ, premise koşmaz.
    const s2 = await inv(ns, id, soruluExecutor())
    ok('N1: inv2 (yanıtsız) durdu=sorular-acik', s2.durdu === 'sorular-acik')
    ok('N1: inv2 executor ÇAĞRILMADI (modelsiz blok)', s2.executorCagriSayisi === 0)
    ok('N1: inv2 premise HÂLÂ bekliyor (ilerlemedi)', s2.state.asamalar.premise.durum === 'bekliyor')
  } finally { temizle(ns) }
}

// ══ N2 — Atlama YALNIZ açık atlandi ile ════════════════════════════════════════
bolum('N2 — Skip yalnız açık komutla; boş/eksik kayıt AÇIK kalır')
{
  const { ns, id } = yeniNs('n2')
  try {
    await inv(ns, id, soruluExecutor()) // genesis → sorular-acik
    const paket = sorulariOku(ns, 'genesis', 1)
    const frAnahtar = paket.sorular.find(s => s.tip === 'FREE-TEXT').anahtar

    // (a) FREE-TEXT'i BOŞ kayıtla "atlamaya" çalış → hâlâ AÇIK (sessiz atlama yok).
    hamYanitYaz(ns, 'genesis', 1, {
      sema: 1, proje_id: id, asama: 'genesis', surum: 1, soru_imza: paket.imza,
      yanitlar: [{ anahtar: frAnahtar, metin: '' }],
    })
    const acikA = acikSorular(paket, [{ anahtar: frAnahtar, metin: '' }])
    ok('N2a: boş FREE-TEXT kaydı AÇIK kalır', acikA.some(q => q.anahtar === frAnahtar))
    const sA = await inv(ns, id, soruluExecutor())
    ok('N2a: boş kayıtla yine BLOK', sA.durdu === 'sorular-acik' && sA.executorCagriSayisi === 0)

    // (b) Açıkça atla (atlandi:true) + diğerlerini yanıtla → ilerler.
    genesisYanitla(ns, 1, { serbestAtla: true })
    const yb = yanitlariHamOku(ns, 'genesis', 1).ham.yanitlar
    ok('N2b: atlanan FREE-TEXT açık listede DEĞİL', acikSorular(paket, yb).length === 0)
    const sB = await inv(ns, id, soruluExecutor())
    ok('N2b: açık-atlama + yanıtlar → ilerledi, premise koştu', sB.kostuAsama === 'premise')
    ok('N2b: atlama izlenebilir (yanıt dosyasında atlandi:true kayıt var)',
       yb.some(e => e.anahtar === frAnahtar && e.atlandi === true))
  } finally { temizle(ns) }
}

// ══ N3 — Kurcalanmış/geçersiz yanıt → BLOK + yeniden-yayın ══════════════════════
bolum('N3 — Kurcalanmış/geçersiz/yanlış-sürüm yanıt → BLOK + yeniden-yayın')
{
  const { ns, id } = yeniNs('n3')
  try {
    await inv(ns, id, soruluExecutor())
    const paket = sorulariOku(ns, 'genesis', 1)
    // Geçerli tam yanıt gövdesi (referans).
    genesisYanitla(ns, 1, { serbestAtla: true })
    const iyi = yanitlariHamOku(ns, 'genesis', 1).ham

    // (i) imza kurcalama.
    hamYanitYaz(ns, 'genesis', 1, { ...iyi, soru_imza: 'DEADBEEFDEADBEEF' })
    const s1 = await inv(ns, id, soruluExecutor())
    ok('N3i: kurcalı imza → durdu=sorular-acik', s1.durdu === 'sorular-acik')
    ok('N3i: bütünlük hatası raporlandı', !!s1.butunlukHatasi)
    ok('N3i: executor ÇAĞRILMADI', s1.executorCagriSayisi === 0)
    ok('N3i: premise koşmadı', s1.state.asamalar.premise.durum === 'bekliyor')

    // (ii) yanlış sürüm.
    hamYanitYaz(ns, 'genesis', 1, { ...iyi, surum: 2 })
    const s2 = await inv(ns, id, soruluExecutor())
    ok('N3ii: yanlış sürüm → BLOK', s2.durdu === 'sorular-acik' && !!s2.butunlukHatasi && s2.executorCagriSayisi === 0)

    // (iii) bozuk JSON.
    writeFileSync(join(ns, yanitDosyaAdi('genesis', 1)), '{ bozuk json', 'utf8')
    const s3 = await inv(ns, id, soruluExecutor())
    ok('N3iii: bozuk JSON → BLOK', s3.durdu === 'sorular-acik' && !!s3.butunlukHatasi && s3.executorCagriSayisi === 0)

    // (iv) yabancı anahtar (soru setinde olmayan).
    hamYanitYaz(ns, 'genesis', 1, { ...iyi, yanitlar: [...iyi.yanitlar, { anahtar: 'yok:boyle', metin: 'x' }] })
    const s4 = await inv(ns, id, soruluExecutor())
    ok('N3iv: yabancı anahtar → BLOK', s4.durdu === 'sorular-acik' && !!s4.butunlukHatasi)

    // Onarım: iyi gövdeyi geri yaz → ilerler (yeniden-yayın sonrası kurtarma).
    hamYanitYaz(ns, 'genesis', 1, iyi)
    const s5 = await inv(ns, id, soruluExecutor())
    ok('N3: iyi yanıt geri yazılınca ilerler (premise koştu)', s5.kostuAsama === 'premise')
  } finally { temizle(ns) }
}

// ══ N5 — --geri sonrası v2 v1'i oto-tüketmez + ön-dolgu ═════════════════════════
bolum('N5 — --geri: v2 seti v1 yanıtını oto-tüketmez; ön-dolgu sunar')
{
  const { ns, id } = yeniNs('n5')
  try {
    // genesis döngüsünü tamamla → premise koşsun (genesis gecti).
    await inv(ns, id, soruluExecutor())           // genesis → sorular-acik (v1)
    genesisYanitla(ns, 1, { serbestAtla: true })
    const sP = await inv(ns, id, soruluExecutor()) // onayla genesis + koş premise
    ok('N5: kurulum — premise koştu, genesis gecti', sP.kostuAsama === 'premise' && sP.state.asamalar.genesis.durum === 'gecti')

    // --geri genesis (sıhhatli).
    planlamaGeri(ns, id, 'genesis')
    const st = stateYukle(ns, id)
    ok('N5: --geri genesis → aktif=genesis, bekliyor', st.aktif_asama === 'genesis' && st.asamalar.genesis.durum === 'bekliyor')

    // v1 yanıt dosyası içeriğini kilitle (oto-tüketilmediğini kanıtla).
    const v1YanitOnce = readFileSync(join(ns, yanitDosyaAdi('genesis', 1)), 'utf8')

    // genesis'i yeniden koş → v2 sorular.
    const s2 = await inv(ns, id, soruluExecutor())
    ok('N5: genesis yeniden koştu → durdu=sorular-acik (v2)', s2.durdu === 'sorular-acik' && s2.kostuAsama === 'genesis')
    ok('N5: genesis.sorular_surum=2', s2.state.asamalar.genesis.sorular_surum === 2)
    ok('N5: genesis-yanitlar-v2 HENÜZ yok (v1 oto-tüketilmedi)', !existsSync(join(ns, yanitDosyaAdi('genesis', 2))))
    ok('N5: v1 yanıt dosyası DEĞİŞMEDİ', readFileSync(join(ns, yanitDosyaAdi('genesis', 1)), 'utf8') === v1YanitOnce)

    // v2 BLOK: v1 yanıtları var olsa da v2 açık (oto-tüketim YOK).
    const s3 = await inv(ns, id, soruluExecutor())
    ok('N5: v2 hâlâ BLOK (v1 yanıtı v2 için sayılmaz)', s3.durdu === 'sorular-acik' && s3.executorCagriSayisi === 0)

    // Ön-dolgu: v2 paketi eşleşen sorulara v1 yanıtını ÖNERİ olarak taşır.
    const v2paket = sorulariOku(ns, 'genesis', 2)
    ok('N5: v2 paketinde on_dolgu var', !!v2paket.on_dolgu)
    ok('N5: on_dolgu CHOICE (secim:aday) v1 seçimini taşır', v2paket.on_dolgu?.['secim:aday']?.secim != null)
    ok('N5: on_dolgu DATA-REQUEST (veri:test-pazar-2024) v1 kararını taşır', v2paket.on_dolgu?.['veri:test-pazar-2024']?.karar === 'veri')

    // v2'yi KENDİ yanıtıyla yanıtla → genesis v2 ONAYLANIR ve loop genesis'ten iler.
    // (premise ilk koşumdan beri onay-bekliyor + kendi açık sorusu var → orada durur; bu
    //  doğru sarmal davranışı: genesis v2 tüketimi premise yeniden-koşumunda gerçekleşir.)
    genesisYanitla(ns, 2, { serbestAtla: true })
    const s4 = await inv(ns, id, soruluExecutor())
    ok('N5: v2 yanıtlanınca genesis v2 ONAYLANDI (gecti)', s4.state.asamalar.genesis.durum === 'gecti')
    ok('N5: loop genesis’ten ilerledi (aktif != genesis)', s4.state.aktif_asama !== 'genesis')
    ok('N5: v2 onayında executor genesis’i YENİDEN koşmadı (0 çağrı)', s4.executorCagriSayisi === 0)
  } finally { temizle(ns) }
}

// ══ N7 — {yalnız-APPROVAL} → yeniden-çağırmada eski kapı gibi (geriye-uyum) ════════
bolum('N7 — Yalnız-APPROVAL seti eski kapı gibi ilerler (geriye-uyum)')
{
  const { ns, id } = yeniNs('n7')
  // Yalnız-APPROVAL üreten üretici (substantive soru YOK) → eski onay davranışı birebir.
  const onayUretici = (asama, icerik, ctx) =>
    soruPaketiKur({ projeId: ctx.projeId, asama, surum: ctx.surum, sorular: [soruOnay(asama)], ertelenen: [] })
  try {
    const s1 = await inv(ns, id, soruluExecutor(), { soruUretici: onayUretici })
    ok('N7: inv1 genesis → durdu=onay-bekliyor (substantive yok)', s1.durdu === 'onay-bekliyor')
    ok('N7: inv1 açık soru YOK', s1.acikSorular.length === 0)
    // Yeniden çağır → yanıt DOSYASI olmadan ilerler (APPROVAL = yeniden-çağırma jesti).
    const s2 = await inv(ns, id, soruluExecutor(), { soruUretici: onayUretici })
    ok('N7: inv2 ilerledi, premise koştu (eski kapı gibi)', s2.kostuAsama === 'premise')
    ok('N7: genesis gecti', s2.state.asamalar.genesis.durum === 'gecti')
  } finally { temizle(ns) }
}

// ══ N8 — Provenans: tüketilen üst-yanıt sürümü state'e yazılır ═══════════════════
bolum('N8 — Provenans (tuketilen_ust_yanit_surum)')
{
  const { ns, id } = yeniNs('n8')
  try {
    await inv(ns, id, soruluExecutor())            // genesis → sorular-acik
    genesisYanitla(ns, 1, { serbestAtla: true })
    const s = await inv(ns, id, soruluExecutor())   // onayla genesis + koş premise
    ok('N8: premise koştu', s.kostuAsama === 'premise')
    ok('N8: premise.tuketilen_ust_yanit_surum=1 (genesis yanıt v1 tüketildi)',
       s.state.asamalar.premise.tuketilen_ust_yanit_surum === 1)
    ok('N8: genesis (kök) tuketilen_ust_yanit_surum=null (üstü yok)',
       s.state.asamalar.genesis.tuketilen_ust_yanit_surum === null)
  } finally { temizle(ns) }
}

// ══ Özet ═══════════════════════════════════════════════════════════════════════
console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
