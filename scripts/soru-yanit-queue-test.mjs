// meta-layer-core — SORU–YANIT KUYRUĞU İZLEYİCİ testleri (hermetik, MODELSİZ, V1).
// Drive'dan BAĞIMSIZ: state + tüm artefaktlar OS geçici dizinine yazılır. gonderimiIsle()'ı
// (git orkestrasyonu OLMADAN) doğrudan sürer — scripts/soru-yanit-queue-watch.mjs'in "yalnız
// doğrudan çalıştırıldığında" korumasıyla import-güvenli olmasına dayanır. gonderimiIsle,
// tools/planlamaSorular.mjs'in KENDİ fonksiyonlarıyla AYNI deseni izler: nsYolu'yu içeride
// SABİTLEMEZ, projelerRoot enjekte edilebilir (varsayılan META_DATA_ROOT — canlı çağrı budur;
// burada her testin kendi tmpdir kökü geçirilir).
//
// Kapsam:
//   T1  Mutlu yol: CHOICE + DATA-REQUEST'in üç modu da (veri/tahmin/dusur) + FREE-TEXT atlama
//   T2  BAYAT sürüm → reddedilir, hiçbir şey yazılmaz (sessizce güncel SAYILMAZ)
//   T3  İmza kurcalama (eşleşen sürümde) → reddedilir
//   T4  Yabancı/APPROVAL anahtar → reddedilir, TÜM-YA-DA-HİÇ (geçerli kayıt bile yazılmaz)
//   T5  Defekt paket (öneri ilk sırada değil, builder atlanarak elle bozulmuş) → reddedilir
//   T6  (kod-incelemesiyle doğrulanır — bkz alt not) bozuk JSON → dosya kuyrukta kalır
//   T7  Zero-pipeline-calls: state byte-aynı kalır + izleyici kaynak metninde yasaklı import yok
//
// Koşum: node scripts/soru-yanit-queue-test.mjs

import { existsSync, rmSync, mkdtempSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  boslukState, statePersist, stateYukle,
} from '../tools/planlamaDurumMakinesiV2.mjs'
import {
  soruOnay, soruCHOICE, soruVeriIstek, soruSerbest, soruPaketiKur, sorulariYaz,
  yanitlariHamOku, imzaHesapla,
} from '../tools/planlamaSorular.mjs'
import { gonderimiIsle } from './soru-yanit-queue-watch.mjs'

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

// gonderimiIsle nsYolu'yu join(projelerRoot,'projeler',id) olarak kurar — test kökü bu şekli
// taklit eder: <tmpKok>/projeler/<id>. isle() yardımcısı testin kendi root'unu otomatik bağlar.
function yeniNs(etiket) {
  const root = mkdtempSync(join(tmpdir(), `soru-yanit-kuyruk-test-${etiket}-`))
  const id = `_test-${etiket}`
  const ns = join(root, 'projeler', id)
  const isle = (gonderim, opts = {}) => gonderimiIsle(gonderim, { log: () => {}, projelerRoot: root, ...opts })
  return { root, ns, id, isle }
}
function temizle(root) { try { rmSync(root, { recursive: true, force: true }) } catch {} }

// Bir aşama için 6-soru standart bir tur kur: APPROVAL + CHOICE + 3×DATA-REQUEST + FREE-TEXT.
// aktif_asama='onay-bekliyor', sorular_surum=surum olacak şekilde state de yazılır.
function kurulum(etiket, { asama = 'genesis', surum = 1 } = {}) {
  const { root, ns, id, isle } = yeniNs(etiket)
  const sorular = [
    soruOnay(asama),
    soruCHOICE({ anahtar: 'secim:x', metin: 'Hangisi?', oneri: 'A', digerleri: ['B', 'C'] }),
    soruVeriIstek({ anahtar: 'veri:kaynak1', metin: 'İddia 1?', iddia: 'iddia1', kaynak: 'kaynak1' }),
    soruVeriIstek({ anahtar: 'veri:kaynak2', metin: 'İddia 2?', iddia: 'iddia2', kaynak: 'kaynak2' }),
    soruVeriIstek({ anahtar: 'veri:kaynak3', metin: 'İddia 3?', iddia: 'iddia3', kaynak: 'kaynak3' }),
    soruSerbest({ anahtar: 'serbest:x', metin: 'Ek bağlam?' }),
  ]
  const paket = soruPaketiKur({ projeId: id, asama, surum, sorular })
  sorulariYaz(ns, paket)

  const state = boslukState(id)
  state.aktif_asama = asama
  state.asamalar[asama].durum = 'onay-bekliyor'
  state.asamalar[asama].surum = 1
  state.asamalar[asama].sorular_surum = surum
  statePersist(ns, state)

  return { root, ns, id, paket, isle }
}

// ══ T1 — Mutlu yol: CHOICE + DATA-REQUEST'in üç modu + FREE-TEXT atlama ═════════
bolum('T1 — Mutlu yol: CHOICE + veri/tahmin/dusur + FREE-TEXT atlama')
{
  const { root, ns, id, paket, isle } = kurulum('t1')
  try {
    const gonderim = {
      projeId: id, asama: 'genesis', surum: 1, soruImza: paket.imza,
      yanitlar: [
        { anahtar: 'secim:x', secim: 'A' },
        { anahtar: 'veri:kaynak1', karar: 'veri', deger: 'yıllık %20', kaynak: 'kaynak1-dogrulandi' },
        { anahtar: 'veri:kaynak2', karar: 'tahmin' },
        { anahtar: 'veri:kaynak3', karar: 'dusur' },
        { anahtar: 'serbest:x', atlandi: true, gerekce: 'test: eklenecek yok' },
      ],
    }
    const sonuc = isle(gonderim)
    ok('T1: uygulandı', sonuc.sonuc === 'uygulandi')
    ok('T1: 5 kayıt uygulandı', sonuc.kayitSayisi === 5)

    const yb = yanitlariHamOku(ns, 'genesis', 1)
    ok('T1: yanıt dosyası oluştu', yb.durum === 'var')
    const h = Object.fromEntries(yb.ham.yanitlar.map(e => [e.anahtar, e]))
    ok('T1: CHOICE doğru kaydedildi', h['secim:x']?.secim === 'A')
    ok('T1: DATA-REQUEST→VERİ doğru etiketli (kaynaklı)', h['veri:kaynak1']?.karar === 'veri' && h['veri:kaynak1']?.deger === 'yıllık %20')
    ok('T1: DATA-REQUEST→TAHMİN doğru etiketli (operatör-onaylı)', h['veri:kaynak2']?.karar === 'tahmin')
    ok('T1: DATA-REQUEST→DÜŞÜR doğru etiketli', h['veri:kaynak3']?.karar === 'dusur')
    ok('T1: FREE-TEXT açıkça atlandı (atlandi:true, izlenebilir gerekçeyle)', h['serbest:x']?.atlandi === true && h['serbest:x']?.gerekce === 'test: eklenecek yok')
    ok('T1: yanıt dosyası doğru sürüme/imzaya bağlı', yb.ham.surum === 1 && yb.ham.soru_imza === paket.imza)
  } finally { temizle(root) }
}

// ══ T2 — BAYAT sürüm → reddedilir, sessizce güncel SAYILMAZ ═════════════════════
bolum('T2 — BAYAT sürüme karşı gönderim reddedilir (silinmez, güncel de sayılmaz)')
{
  const { root, ns, id, paket: paketV1, isle } = kurulum('t2', { surum: 1 })
  try {
    // v2'ye "geç" — --geri sonrası yeniden-koşum simülasyonu: yeni paket yaz + state'i ilerlet.
    const paketV2 = soruPaketiKur({
      projeId: id, asama: 'genesis', surum: 2,
      sorular: [soruOnay('genesis'), soruSerbest({ anahtar: 'serbest:v2', metin: 'v2 sorusu' })],
    })
    sorulariYaz(ns, paketV2)
    const state = stateYukle(ns, id)
    state.asamalar.genesis.sorular_surum = 2
    statePersist(ns, state)

    // v1'e karşı (artık bayat) bir gönderim — operatörün eski (build-snapshot'tan) sayfası.
    const gonderim = { projeId: id, asama: 'genesis', surum: 1, soruImza: paketV1.imza, yanitlar: [{ anahtar: 'secim:x', secim: 'A' }] }
    const sonuc = isle(gonderim)
    ok('T2: reddedildi', sonuc.sonuc === 'reddedildi')
    ok('T2: neden BAYAT olarak işaretli', /BAYAT/.test(sonuc.neden))

    ok('T2: v1 yanıt dosyası YAZILMADI', yanitlariHamOku(ns, 'genesis', 1).durum === 'yok')
    ok('T2: v2 yanıt dosyası da YAZILMADI (yalnız açıkça v2\'ye karşı gönderim yazılır)', yanitlariHamOku(ns, 'genesis', 2).durum === 'yok')
  } finally { temizle(root) }
}

// ══ T3 — İmza kurcalama (eşleşen sürümde) → reddedilir ══════════════════════════
bolum('T3 — İmza uyuşmazlığı (kurcalama) → reddedilir')
{
  const { root, ns, paket, isle } = kurulum('t3')
  try {
    const gonderim = { projeId: paket.proje_id, asama: 'genesis', surum: 1, soruImza: 'DEADBEEFDEADBEEF', yanitlar: [{ anahtar: 'secim:x', secim: 'A' }] }
    const sonuc = isle(gonderim)
    ok('T3: reddedildi', sonuc.sonuc === 'reddedildi')
    ok('T3: neden İMZA olarak işaretli', /İMZA/.test(sonuc.neden))
    ok('T3: hiçbir şey yazılmadı', yanitlariHamOku(ns, 'genesis', 1).durum === 'yok')
    ok('T3: gerçek paket.imza bozulmadı (referans hâlâ geçerli)', paket.imza !== 'DEADBEEFDEADBEEF')
  } finally { temizle(root) }
}

// ══ T4 — Yabancı/APPROVAL anahtar → TÜM-YA-DA-HİÇ ══════════════════════════════
bolum('T4 — Yabancı/APPROVAL anahtar reddedilir; geçerli kayıt bile TÜM-YA-DA-HİÇ yazılmaz')
{
  const { root, ns, id, paket, isle } = kurulum('t4')
  try {
    // (a) APPROVAL anahtarı hedeflemeye çalışmak
    const gA = { projeId: id, asama: 'genesis', surum: 1, soruImza: paket.imza, yanitlar: [
      { anahtar: 'secim:x', secim: 'A' },   // geçerli
      { anahtar: 'onay', secim: 'Onayla' }, // APPROVAL — reddedilmeli
    ] }
    const sA = isle(gA)
    ok('T4a: reddedildi (APPROVAL anahtar)', sA.sonuc === 'reddedildi')
    ok('T4a: TÜM-YA-DA-HİÇ — geçerli secim:x kaydı bile yazılmadı', yanitlariHamOku(ns, 'genesis', 1).durum === 'yok')

    // (b) tümüyle yabancı (soru setinde olmayan) anahtar
    const gB = { projeId: id, asama: 'genesis', surum: 1, soruImza: paket.imza, yanitlar: [
      { anahtar: 'secim:x', secim: 'A' },
      { anahtar: 'yok:boyle-bir-soru', metin: 'x' },
    ] }
    const sB = isle(gB)
    ok('T4b: reddedildi (yabancı anahtar)', sB.sonuc === 'reddedildi')
    ok('T4b: hâlâ hiçbir şey yazılmadı', yanitlariHamOku(ns, 'genesis', 1).durum === 'yok')

    // (c) kontrol: TÜMÜ geçerli olan aynı batch normalde uygulanır
    const gC = { projeId: id, asama: 'genesis', surum: 1, soruImza: paket.imza, yanitlar: [{ anahtar: 'secim:x', secim: 'A' }] }
    const sC = isle(gC)
    ok('T4c (kontrol): geçerli-yalnız batch uygulanır', sC.sonuc === 'uygulandi')
  } finally { temizle(root) }
}

// ══ T5 — Defekt paket (builder atlanarak elle bozulmuş) → reddedilir ════════════
bolum('T5 — Defekt soru paketi (öneri ilk sırada değil) → savunma-derinliği reddi')
{
  const { root, ns, id, isle } = yeniNs('t5')
  try {
    const sorular = [
      soruOnay('genesis'),
      { anahtar: 'c', tip: 'CHOICE', onem: 90, metin: 'm', oneri: 'A', secenekler: ['B', 'A'] }, // öneri İLK DEĞİL — defekt
    ]
    const bozukPaket = {
      sema: 1, proje_id: id, asama: 'genesis', surum: 1, olusturma: new Date().toISOString(),
      sorular, ertelenen: [],
    }
    bozukPaket.imza = imzaHesapla('genesis', 1, sorular)
    sorulariYaz(ns, bozukPaket)

    const state = boslukState(id)
    state.aktif_asama = 'genesis'
    state.asamalar.genesis.durum = 'onay-bekliyor'
    state.asamalar.genesis.surum = 1
    state.asamalar.genesis.sorular_surum = 1
    statePersist(ns, state)

    const gonderim = { projeId: id, asama: 'genesis', surum: 1, soruImza: bozukPaket.imza, yanitlar: [{ anahtar: 'c', secim: 'A' }] }
    const sonuc = isle(gonderim)
    ok('T5: reddedildi', sonuc.sonuc === 'reddedildi')
    ok('T5: neden defekt-paket olarak işaretli', /defekt/.test(sonuc.neden))
    ok('T5: hiçbir şey yazılmadı (defekt asla yazılmaz)', yanitlariHamOku(ns, 'genesis', 1).durum === 'yok')
  } finally { temizle(root) }
}

// ══ T6 — Bozuk JSON (kod-incelemesi ile doğrulanır) ═════════════════════════════
bolum('T6 — Bozuk JSON kuyruk dosyası (not)')
console.log('  ℹ scripts/soru-yanit-queue-watch.mjs\'in birTurCalistir() döngüsü JSON.parse\'ı')
console.log('    try/catch içine alır; ayrıştırma hatasında gonderimiIsle() HİÇ ÇAĞRILMAZ ve')
console.log('    dosya continue ile ATLANIR (rmSync/git-add koduna hiç ulaşılmaz) — dosya kuyrukta')
console.log('    kalır, silinmez. intake-queue-watch.mjs ile AYNI desen; git-orkestrasyon katmanı')
console.log('    bu repoda (worker-intake-queue-test.mjs emsaliyle) hermetik birim-testli değil,')
console.log('    kod-incelemesiyle doğrulanıyor. Bu davranış kasıtlı: bozuk-JSON silinmemeli.')

// ══ T7 — Zero-pipeline-calls: state byte-aynı + import listesi temiz ═══════════
bolum('T7 — Sıfır pipeline-çağrısı: state değişmez + izleyici yasaklı import taşımaz')
{
  const { root, ns, id, paket, isle } = kurulum('t7')
  try {
    const stateOnce = JSON.stringify(stateYukle(ns, id))
    const gonderim = { projeId: id, asama: 'genesis', surum: 1, soruImza: paket.imza, yanitlar: [{ anahtar: 'secim:x', secim: 'A' }] }
    isle(gonderim)
    const stateSonra = JSON.stringify(stateYukle(ns, id))
    ok('T7a: state (aktif_asama + tüm aşama durum/sürüm alanları) BYTE-AYNI', stateOnce === stateSonra)
  } finally { temizle(root) }

  // Yapısal kanıt: izleyicinin GERÇEK import satırlarında pipeline-ilerletme modülü YOK.
  // (Bare substring değil — dosya başı yorumu bu isimleri "YOKTUR" derken zaten METİN olarak
  // taşıyor; yalnız gerçek `import ... from '...'` satırlarını topluyoruz.)
  const kaynak = readFileSync(new URL('./soru-yanit-queue-watch.mjs', import.meta.url), 'utf8')
  const importSatirlari = [...kaynak.matchAll(/^import\s+.*?from\s+'([^']+)'/gms)].map(m => m[1])
  const yasakli = ['planlamaBaslat.mjs', 'planlamaLoopV2.mjs', 'canliExecutor.mjs']
  for (const y of yasakli) {
    ok(`T7b: izleyici GERÇEK import satırlarında "${y}" YOK`, !importSatirlari.some(spec => spec.includes(y)))
  }
  ok('T7c: izleyici yalnız planlamaSorular.mjs + planlamaDurumMakinesiV2.mjs\'ten import ediyor',
     importSatirlari.some(s => s.includes('planlamaSorular.mjs')) && importSatirlari.some(s => s.includes('planlamaDurumMakinesiV2.mjs')))
}

// ══ T8 — master-plan BÖLÜM-yürüyüşü: asama bir bölüm id'si olabilir (2026-07-17 düzeltme) ══
bolum('T8 — asama bir master-plan BÖLÜM id\'si olduğunda doğru birime çözümlenir')
{
  // Canlı-gözlemlenen vaka: dashboard (P1 fix) bölüm-seviyesi açık soruları doğru gösterip
  // `asama: "ozet-yonetici"` gönderdiğinde, gonderimiIsle eskiden yalnız state.asamalar['ozet-
  // yonetici']'ye (hiç yok) bakardı ve "aktif soru turu yok" ile reddederdi — Worker'ın 400'ü
  // düzeltilse BİLE burada İKİNCİ bir ret oluşurdu.
  const { root, ns, id, isle } = yeniNs('t8')
  try {
    const bolumSorular = [
      soruOnay('ozet-yonetici'),
      soruSerbest({ anahtar: 'serbest:ozet-yonetici-baglam', metin: 'Ek bağlam?' }),
    ]
    const bolumPaket = soruPaketiKur({ projeId: id, asama: 'ozet-yonetici', surum: 2, sorular: bolumSorular })
    sorulariYaz(ns, bolumPaket)

    const state = boslukState(id)
    state.aktif_asama = 'master-plan'
    state.asamalar['master-plan'].durum = 'kosuyor'
    state.asamalar['master-plan'].aktif_bolum = 'ozet-yonetici'
    state.asamalar['master-plan'].bolumler = {
      'ozet-yonetici': { durum: 'onay-bekliyor', cikti_pointer: null, kapi_sonuc: 'gecti', blok_nedeni: null, surum: 2, kabul_edilen_ust_surum: 1, sorular_surum: 2, tuketilen_ust_yanit_surum: 1 },
    }
    statePersist(ns, state)

    const gonderim = { projeId: id, asama: 'ozet-yonetici', surum: 2, soruImza: bolumPaket.imza, yanitlar: [
      { anahtar: 'serbest:ozet-yonetici-baglam', metin: 'Özet anlaşılır, doğru. Projeyi bu hal ile tamamla.' },
    ] }
    const sonuc = isle(gonderim)
    ok('T8a: bölüm-seviyesi gönderim UYGULANDI (artık reddedilmiyor)', sonuc.sonuc === 'uygulandi', sonuc.neden ?? '')

    const yb = yanitlariHamOku(ns, 'ozet-yonetici', 2)
    ok('T8a: yanıt DOĞRU dosyaya (ozet-yonetici-yanitlar-v2) yazıldı', yb.durum === 'var')
    const h = Object.fromEntries((yb.ham?.yanitlar ?? []).map(e => [e.anahtar, e]))
    ok('T8a: FREE-TEXT içeriği doğru kaydedildi', h['serbest:ozet-yonetici-baglam']?.metin === 'Özet anlaşılır, doğru. Projeyi bu hal ile tamamla.')

    // Kontrol: BAYAT bölüm-sürümüne karşı gönderim hâlâ reddedilir (aynı bölüm-çözümleme
    // yolunda tazelik kontrolü de doğru çalışıyor — yalnız "bulundu" değil, "GÜNCEL mi" de).
    const bayatGonderim = { projeId: id, asama: 'ozet-yonetici', surum: 1, soruImza: 'eskiimza', yanitlar: [{ anahtar: 'serbest:ozet-yonetici-baglam', metin: 'x' }] }
    const bayatSonuc = isle(bayatGonderim)
    ok('T8b: bölüm-seviyesinde de BAYAT sürüm reddedilir', bayatSonuc.sonuc === 'reddedildi' && /BAYAT/.test(bayatSonuc.neden))
  } finally { temizle(root) }

  // Kontrol: üst-seviye aşama çözümlemesi (state.asamalar[asama]) DEĞİŞMEDİ — bölüm-yolu SAF
  // EKLEME, mevcut önceliği (üst-seviye ÖNCE denenir) BOZMADI.
  const { root: root2, ns: ns2, id: id2, paket, isle: isle2 } = kurulum('t8-ust-seviye-kontrol')
  try {
    const gonderim = { projeId: id2, asama: 'genesis', surum: 1, soruImza: paket.imza, yanitlar: [{ anahtar: 'secim:x', secim: 'A' }] }
    const sonuc = isle2(gonderim)
    ok('T8c (regresyon): üst-seviye aşama (genesis) hâlâ normal ÇALIŞIYOR (bölüm-yolu önceliği bozmadı)', sonuc.sonuc === 'uygulandi')
  } finally { temizle(root2) }
}

// ══ Özet ═══════════════════════════════════════════════════════════════════════
console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
