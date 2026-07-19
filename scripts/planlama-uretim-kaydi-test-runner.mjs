// meta-layer-core — tools/planlamaUretimKaydi.mjs testleri.
//
// Kapsam: (a) üretim-kaydı şekli/doğrulama, (b) taşıma sınıflandırması (sentetik fikstürler —
// carried / carried-with-text-drift / unmatched-stamped[sonek-patlaması|belirsiz] / karar-yetim-
// kalma), (c) GERÇEK fotball-podcast-2026-07-09 verisinin salt-okunur bir tmp KOPYASI üzerinde
// uçtan-uca çalıştırma (623 kayıt toplamı doğrulanır), (d) NEGATİF ÖZ-KONTROL — mekanizma
// YOKMUŞ/BOZULMUŞ gibi davranan naif bir eşleyici + bilerek bozulmuş bir kopya AYNI veriye karşı
// koşulur ve GERÇEKTEN başarısız olduğu (yanlış taşıma / kaçırılmış yetim-karar) kanıtlanır —
// ardından temiz kopyaya karşı aynı kontrol geçtiği gösterilir (planlama-tamamlandi-korluk-
// test-runner.mjs'teki desenle AYNI disiplin: "ateşlenemeyen bir kontrol" YOK).
//
// VERİ KURALI: gerçek proje dizini yalnız OKUNUR, tmpdir'e KOPYALANIR; bu script'in HİÇBİR
// adımı orijinal $META_DATA_ROOT içine yazmaz. Koşum: node scripts/planlama-uretim-kaydi-test-runner.mjs

import { existsSync, mkdtempSync, rmSync, cpSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { META_DATA_ROOT } from './config.js'
import { varsayilanSoruUretici, sorulariOku, yanitlariHamOku, sorulariDogrula, imzaHesapla } from '../tools/planlamaSorular.mjs'
import {
  uretimKaydiOlustur, kodSurumuGuncelMi, tasimaSiniflandirmasiYap, tasimaDefteriKur,
  paketiUretimKaydiIleTamamlaVeTasi,
} from '../tools/planlamaUretimKaydi.mjs'

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

// ══ A — uretimKaydiOlustur / kodSurumuGuncelMi ═══════════════════════════════════════════════
bolum('A) uretimKaydiOlustur — şekil + doğrulama')
{
  const uk = uretimKaydiOlustur({ kodSurumu: 'deadbeef', paketSema: 1, onceki: { dosya: 'x-sorular-v2.json', surum: 2 } })
  ok('sema/kod_surumu/paket_sema/onceki alanları doğru', uk.sema === 1 && uk.kod_surumu === 'deadbeef' && uk.paket_sema === 1 && uk.onceki.dosya === 'x-sorular-v2.json' && uk.onceki.surum === 2)
  ok('kod_kirli varsayılan false', uk.kod_kirli === false)

  const ukIlk = uretimKaydiOlustur({ kodSurumu: 'deadbeef', paketSema: 1, onceki: null })
  ok('onceki=null (ilk sürüm) kabul edilir', ukIlk.onceki === null)

  let firladi = false
  try { uretimKaydiOlustur({ paketSema: 1 }) } catch { firladi = true }
  ok('kodSurumu eksikse fırlatır', firladi)

  firladi = false
  try { uretimKaydiOlustur({ kodSurumu: 'x', onceki: { dosya: 'y' } }) } catch { firladi = true }
  ok('onceki.surum eksikse fırlatır', firladi)

  const guncel = kodSurumuGuncelMi({ uretim_kaydi: uk }, 'deadbeef')
  ok('kodSurumuGuncelMi: eşleşince guncel=true', guncel.bilinir && guncel.guncel === true)
  const eski = kodSurumuGuncelMi({ uretim_kaydi: uk }, 'cafebabe')
  ok('kodSurumuGuncelMi: uyuşmayınca guncel=false', eski.bilinir && eski.guncel === false)
  const yok = kodSurumuGuncelMi({}, 'cafebabe')
  ok('kodSurumuGuncelMi: uretim_kaydi yoksa bilinir=false (mekanizma-öncesi paket)', yok.bilinir === false)
}

// ══ B — tasimaSiniflandirmasiYap: sentetik fikstürler ═══════════════════════════════════════
bolum('B) tasimaSiniflandirmasiYap — sentetik fikstürler')
{
  const onceki = [
    { anahtar: 'veri:a', tip: 'DATA-REQUEST', iddia: 'Sabit iddia A' },
    { anahtar: 'veri:b', tip: 'DATA-REQUEST', iddia: 'Eski metin B' },
    { anahtar: 'veri:c-2', tip: 'DATA-REQUEST', iddia: 'Patlama grubu, varyant 2' },
    { anahtar: 'veri:c-3', tip: 'DATA-REQUEST', iddia: 'Patlama grubu, varyant 3' },
    { anahtar: 'veri:d-2024', tip: 'DATA-REQUEST', iddia: 'Gerçek yıl-soneki, tek başına' },
    { anahtar: 'veri:e', tip: 'DATA-REQUEST', iddia: 'Tamamen kaybolan' },
  ]
  const yeni = [
    { anahtar: 'veri:a', tip: 'DATA-REQUEST', iddia: 'Sabit iddia A' },        // carried (birebir)
    { anahtar: 'veri:b', tip: 'DATA-REQUEST', iddia: 'Yeni metin B (drift)' }, // carried_with_text_drift
    { anahtar: 'veri:c', tip: 'DATA-REQUEST', iddia: 'Patlama grubu, tek kayıt' }, // c-2/c-3'ün KÖKÜ — sonek-patlaması
    // veri:d-2024 KÖKÜ (veri:d) yeni sette YOK — ve öncülde grup boyu 1 (tek başına) → belirsiz, sonek-patlaması SAYILMAMALI
    // veri:e hiç yok → belirsiz
  ]
  const yanitlar = [
    { anahtar: 'veri:a', karar: 'tahmin' },
    { anahtar: 'veri:b', karar: 'veri', deger: '42' },
    { anahtar: 'veri:e', atlandi: true, gerekce: 'artık geçersiz' }, // KARAR VAR ama hedefi kayboldu → yetim
  ]

  const s = tasimaSiniflandirmasiYap(onceki, yanitlar, yeni)
  ok('carried: tam 1 (veri:a)', s.carried.length === 1 && s.carried[0].anahtar === 'veri:a')
  ok('carried[0] kararı taşıyor (yanit_vardi)', s.carried[0].yanit_vardi === true && s.carried[0].yanit.karar === 'tahmin')

  ok('carried_with_text_drift: tam 1 (veri:b)', s.carried_with_text_drift.length === 1 && s.carried_with_text_drift[0].anahtar === 'veri:b')
  ok('drift kaydı eski/yeni iddiayı İKİSİNİ de tutuyor (sessizce üzerine yazmıyor)',
    s.carried_with_text_drift[0].eski_iddia === 'Eski metin B' && s.carried_with_text_drift[0].yeni_iddia === 'Yeni metin B (drift)')
  ok('drift kaydı da kararı taşıyor', s.carried_with_text_drift[0].yanit_vardi === true)

  ok('unmatched_stamped: tam 3 (veri:c-2, veri:c-3, veri:d-2024, veri:e → 4 aslında)', s.unmatched_stamped.length === 4)
  const cikanAnahtarlar = s.unmatched_stamped.map(u => u.anahtar).sort()
  ok('unmatched kümesi doğru anahtarları içeriyor', JSON.stringify(cikanAnahtarlar) === JSON.stringify(['veri:c-2', 'veri:c-3', 'veri:d-2024', 'veri:e']))

  const c2 = s.unmatched_stamped.find(u => u.anahtar === 'veri:c-2')
  const c3 = s.unmatched_stamped.find(u => u.anahtar === 'veri:c-3')
  ok('c-2/c-3: GERÇEK sonek-patlaması olarak etiketlendi (grup boyu>1, kök yeni sette var)',
    c2.neden === 'sonek-patlamasi-eski-hata' && c3.neden === 'sonek-patlamasi-eski-hata' && c2.belirsiz === false && c3.belirsiz === false)

  const d2024 = s.unmatched_stamped.find(u => u.anahtar === 'veri:d-2024')
  ok('REGRESYON KİLİDİ: "-2024" yıl-soneki YANLIŞLIKLA sonek-patlaması SAYILMADI (grup boyu 1, tek başına)',
    d2024.neden === null && d2024.belirsiz === true)

  const eKaydi = s.unmatched_stamped.find(u => u.anahtar === 'veri:e')
  ok('veri:e belirsiz olarak damgalandı (bilinen bir neden yok)', eKaydi.neden === null && eKaydi.belirsiz === true)
  ok('KRİTİK: veri:e bir KARAR TAŞIYORDU (atlandi:true) ve şimdi unmatched — yanit_vardi=true olarak YÜKSEK SESLE görünür',
    eKaydi.yanit_vardi === true && eKaydi.yanit?.atlandi === true)

  const defter = tasimaDefteriKur({ projeId: '_test', asama: 'x', surum: 2, onceki: { dosya: 'x-sorular.json', surum: 1 }, siniflandirma: s })
  ok('defter özeti toplam=6 (öncül kayıt sayısıyla birebir)', defter.ozet.toplam === 6)
  ok('defter özeti karar_tasindi=2 (a, b)', defter.ozet.karar_tasindi === 2)
  ok('defter özeti karar_yetim_kaldi=1 (e) — SESSİZCE SIFIRLANMADI', defter.ozet.karar_yetim_kaldi === 1)
}

// ══ C — NEGATİF ÖZ-KONTROL: naif (prefix/benzerlik) eşleyici GERÇEKTEN yanlış taşır mı? ═══════
bolum('C) NEGATİF ÖZ-KONTROL — mekanizma yokmuş gibi (naif prefix-eşleşme) davransaydı ne olurdu?')
{
  // "Mekanizma yok" senaryosunun BİREBİR simülasyonu: bir öncül kaydı, yeni sette TAM eşleşme
  // yoksa bile en yakın prefix'e göre "muhtemelen aynı" sayan naif bir fonksiyon — tam olarak
  // bu görevin YASAKLADIĞI şey ("Prefix or similarity matching is never identity").
  function naifPrefixEslesticiTasimaYAPARSAYDI(anahtar, yeniAnahtarlar) {
    return yeniAnahtarlar.find(a => a.startsWith(anahtar.replace(/-[0-9]+$/, '')) || anahtar.startsWith(a)) ?? null
  }
  const yeniAnahtarlar = ['veri:patreon-sports-pricing-2024']
  const naifSonuc = naifPrefixEslesticiTasimaYAPARSAYDI('veri:patreon-sports-pricing', yeniAnahtarlar)
  ok('ÖZ-KONTROL: naif prefix-eşleyici "veri:patreon-sports-pricing" için YANLIŞLIKLA bir eşleşme BULURDU (bug gerçekti, kontrol ateşlenebilir)',
    naifSonuc === 'veri:patreon-sports-pricing-2024')

  const gercekSonuc = tasimaSiniflandirmasiYap(
    [{ anahtar: 'veri:patreon-sports-pricing', tip: 'DATA-REQUEST', iddia: 'x' }],
    [],
    [{ anahtar: 'veri:patreon-sports-pricing-2024', tip: 'DATA-REQUEST', iddia: 'y' }],
  )
  ok('GERÇEK mekanizma (birebir anahtar): AYNI girdide doğru şekilde unmatched (belirsiz) verir — yanlış taşıma YOK',
    gercekSonuc.unmatched_stamped.length === 1 && gercekSonuc.carried.length === 0 && gercekSonuc.carried_with_text_drift.length === 0)
  console.log('  (kanıt) naif prefix-eşleyici bu girdide YANLIŞ bir kimlik iddia ederdi; gerçek mekanizma birebir dize eşitliğine sabit kaldığı için etmiyor.')
}

// ══ D — GERÇEK VERİ (salt-okunur kopya): fotball-podcast-2026-07-09, provenans-ek v2 ═════════
bolum('D) Gerçek veri — fotball-podcast-2026-07-09 provenans-ek v2 (tmp kopya)')
const GERCEK_ID = 'fotball-podcast-2026-07-09'
const gercekKaynak = join(META_DATA_ROOT, 'projeler', GERCEK_ID)

if (!existsSync(join(gercekKaynak, 'provenans-ek-sorular-v2.json'))) {
  console.log(`atlandı — ${gercekKaynak} erişilemedi (Drive bağlı değil). Bu bölüm gerçek-veri gerektirir.`)
} else {
  const oncekiMtime = statSync(join(gercekKaynak, 'provenans-ek-sorular-v2.json')).mtimeMs
  const kaynakMdMtime = statSync(join(gercekKaynak, 'master-plan--provenans-ek-v2.md')).mtimeMs

  const kopyaNs = mkdtempSync(join(tmpdir(), 'uretim-kaydi-test-'))
  try {
    cpSync(gercekKaynak, kopyaNs, { recursive: true })

    const oncekiPaket = sorulariOku(kopyaNs, 'provenans-ek', 2)
    ok('öncül (v2) paket okunabildi', oncekiPaket !== null)
    ok('öncül toplam = 623 (47 sorular + 576 ertelenen)', oncekiPaket.sorular.length + (oncekiPaket.ertelenen?.length ?? 0) === 623)

    const oncekiYanitHam = yanitlariHamOku(kopyaNs, 'provenans-ek', 2)
    ok('v2 için yanıt dosyası GERÇEKTEN yok (bu proje verisinin bilinen özelliği — operatör v2\'yi hiç yanıtlamadı)', oncekiYanitHam.durum === 'yok')

    const kaynakIcerik = readFileSync(join(kopyaNs, 'master-plan--provenans-ek-v2.md'), 'utf8')
    const yeniPaket = varsayilanSoruUretici('provenans-ek', kaynakIcerik, { projeId: GERCEK_ID, surum: 4 })
    ok('yeni paket üretildi (surum=4)', yeniPaket.surum === 4)
    ok('yeni paket kendi imzasıyla tutarlı (sorulariDogrula geçer)', (() => { try { return sorulariDogrula(yeniPaket) } catch { return false } })())

    const { paket, defter, siniflandirma } = paketiUretimKaydiIleTamamlaVeTasi({
      nsYolu: kopyaNs, projeId: GERCEK_ID, asama: 'provenans-ek',
      oncekiDosyaAdi: 'provenans-ek-sorular-v2.json', oncekiSurum: 2,
      oncekiPaket, oncekiYanitlar: [], // yok (yukarıda doğrulandı) — boş dizi geçerli girdi
      yeniPaket, kodSurumu: 'test-sha', kodKirli: false,
    })

    ok('sınıflandırma toplamı 623 (öncül kayıt sayısıyla BİREBİR — sessiz kayıp YOK)',
      siniflandirma.carried.length + siniflandirma.carried_with_text_drift.length + siniflandirma.unmatched_stamped.length === 623)
    ok('uretim_kaydi.onceki doğru dosyayı/sürümü adlandırıyor', paket.uretim_kaydi.onceki.dosya === 'provenans-ek-sorular-v2.json' && paket.uretim_kaydi.onceki.surum === 2)
    ok('uretim_kaydi EKLENDİKTEN SONRA da paket kendi imzasıyla tutarlı (imza kapsamı DEĞİŞMEDİ)',
      (() => { try { return sorulariDogrula(paket) } catch { return false } })())
    ok('imzaHesapla(paket.sorular) hâlâ yalnız soru_id||anahtar|tip okuyor (uretim_kaydi imzaya SIZMADI)',
      imzaHesapla(paket.asama, paket.surum, paket.sorular) === paket.imza)
    ok('bu gerçek veri kümesinde karar_yetim_kaldi = 0 (v2 hiç yanıtlanmadığı için — beklenen, gizlenmiyor)',
      defter.ozet.karar_yetim_kaldi === 0)
    console.log(`  (gözlem) carried=${defter.ozet.carried}, carried_with_text_drift=${defter.ozet.carried_with_text_drift}, unmatched_stamped=${defter.ozet.unmatched_stamped}, toplam=${defter.ozet.toplam}`)
    const sonekPatlamasi = siniflandirma.unmatched_stamped.filter(u => u.neden === 'sonek-patlamasi-eski-hata').length
    const belirsiz = siniflandirma.unmatched_stamped.filter(u => u.belirsiz).length
    console.log(`  (gözlem) unmatched_stamped içinde: sonek-patlamasi-eski-hata=${sonekPatlamasi}, belirsiz=${belirsiz}`)

    bolum('D2) NEGATİF ÖZ-KONTROL (gerçek veri) — kopyada bir karar BİLEREK bozulursa yetim-kaldı YAKALANIR mı?')
    // Bir öncül kaydın anahtarını (yalnız BELLEKTEKİ diziden okunan kopya nesnede) bozarak,
    // gerçekte var OLMAYAN bir "karar" iliştiriyoruz — mekanizmanın bunu SESSİZCE yutup
    // yutmadığını kanıtlamak için. Dosyaya YAZILMIYOR (yalnız bellekte, bu test bloğu içinde).
    const ilkOnemliliDataRequest = [...oncekiPaket.sorular, ...oncekiPaket.ertelenen].find(s => s.tip === 'DATA-REQUEST')
    const bozukYanitlar = [{ anahtar: ilkOnemliliDataRequest.anahtar, karar: 'tahmin' }]
    // Bu anahtarı yeni paketten SİLEREK (yeniPaket'in bir DERİN KOPYASINDA) "kaybolmuş bir karar" simüle ediyoruz.
    const yeniPaketBozukKopya = JSON.parse(JSON.stringify(yeniPaket))
    yeniPaketBozukKopya.sorular = yeniPaketBozukKopya.sorular.filter(s => s.anahtar !== ilkOnemliliDataRequest.anahtar)
    yeniPaketBozukKopya.ertelenen = yeniPaketBozukKopya.ertelenen.filter(s => s.anahtar !== ilkOnemliliDataRequest.anahtar)

    const bozukSiniflandirma = tasimaSiniflandirmasiYap(
      [...oncekiPaket.sorular, ...oncekiPaket.ertelenen], bozukYanitlar,
      [...yeniPaketBozukKopya.sorular, ...yeniPaketBozukKopya.ertelenen],
    )
    const bozukDefter = tasimaDefteriKur({ projeId: GERCEK_ID, asama: 'provenans-ek', surum: 4, onceki: { dosya: 'provenans-ek-sorular-v2.json', surum: 2 }, siniflandirma: bozukSiniflandirma })
    ok('GERÇEK BAŞARISIZLIK KANITI: bozuk kopyada karar_yetim_kaldi=1 (mekanizma YAKALADI, sessizce yutmadı)',
      bozukDefter.ozet.karar_yetim_kaldi === 1)
    // Done-when'in istediği "hard failure" — bu senaryoda gerçek bir CI kontrolü şöyle olurdu:
    let sertKontrolFirladi = false
    try {
      if (bozukDefter.ozet.karar_yetim_kaldi > 0) {
        throw new Error(`karar_yetim_kaldi=${bozukDefter.ozet.karar_yetim_kaldi} > 0 — operatör kararı taşıyan ${bozukDefter.ozet.karar_yetim_kaldi} kayıt yeni pakette YOK`)
      }
    } catch { sertKontrolFirladi = true }
    ok('sert-kontrol (bir CI/regresyon script\'inin yapacağı gibi) GERÇEKTEN fırlıyor — "ateşlenemeyen kontrol" DEĞİL', sertKontrolFirladi)

    console.log('  (temiz-durum karşılaştırması) AYNI kontrol, BOZULMAMIŞ (yukarıdaki D bölümü) veriye karşı: karar_yetim_kaldi=0 → geçer.')
    ok('TEMİZ KOPYAYA KARŞI: aynı sert-kontrol geçer (karar_yetim_kaldi=0)', defter.ozet.karar_yetim_kaldi === 0)

    // ── Frozen-set: bu test hiçbir gerçek dosyaya yazmadı ──────────────────────────────────
    const kopyaIcindeYeniDosyaYokMu = !existsSync(join(kopyaNs, 'provenans-ek-sorular-v4.json'))
    ok('bu test kopya içine bile v4 dosyası YAZMADI (yalnız bellekte hesaplandı — sanctioned run ayrı adımda)', kopyaIcindeYeniDosyaYokMu)
  } finally {
    rmSync(kopyaNs, { recursive: true, force: true })
  }

  const oncekiMtimeSonra = statSync(join(gercekKaynak, 'provenans-ek-sorular-v2.json')).mtimeMs
  const kaynakMdMtimeSonra = statSync(join(gercekKaynak, 'master-plan--provenans-ek-v2.md')).mtimeMs
  ok('frozen-set: gerçek provenans-ek-sorular-v2.json mtime DEĞİŞMEDİ', oncekiMtime === oncekiMtimeSonra)
  ok('frozen-set: gerçek master-plan--provenans-ek-v2.md mtime DEĞİŞMEDİ', kaynakMdMtime === kaynakMdMtimeSonra)
}

bolum(`Özet: ${gecti + kaldi} test | ✓ ${gecti} geçti | ✗ ${kaldi} başarısız`)
process.exit(kaldi === 0 ? 0 : 1)
