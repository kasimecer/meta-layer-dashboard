// meta-layer-core — birimSorulariUretVeYaz (tools/planlamaBirimMotoru.mjs) ÜRETİM-KAYDI/
// TAŞIMA-DEFTERİ KALICI BAĞLAMA testleri (hermetik, MODELSİZ).
//
// KONTEKST: tools/planlamaUretimKaydi.mjs (commit 0b362d4) mekanizması kanıtlanmıştı ama
// yalnız manuel çağrılabiliyordu (bkz scripts/planlama-provenans-ek-sanctioned-regen.mjs,
// tek-seferlik). GERÇEK üretim yolu — birimKostur/elestiriPasi-kurtarma/planlamaBolumLoop-
// kurtarma+layer2/planlamaLoopV2-kurtarma — HEPSİ TEK bir fonksiyonu (birimSorulariUretVeYaz)
// paylaşıyordu ve o fonksiyon öncül paketin İÇERİĞİNİ hiç okumadan sorular.json'u DOĞRUDAN
// yazıyordu. Bu test-runner, o TEK fonksiyonun artık mekanizmadan GEÇTİĞİNİ kanıtlar.
//
// Kapsam:
//   A   ilk üretim (surum=1): uretim_kaydi damgalanır (onceki=null), taşıma-defteri YOK (mantıklı)
//   B   regenerasyon (surum=2): uretim_kaydi.onceki doğru + taşıma-defteri doğru sınıflandırma
//       (carried / carried_with_text_drift / unmatched_stamped — biri GERÇEK bir "karar_yetim_kaldi")
//   C   SERT-HATA: öncül (surum-1) paketi diskte yoksa (yapısal anomali) — fırlar, HİÇBİR ŞEY YAZILMAZ
//   D   SERT-HATA: öncül yanıt dosyası bozuksa — fırlar, HİÇBİR ŞEY YAZILMAZ
//   E   NEGATİF ÖZ-KONTROL — bu görev ÖNCESİ (d2eb0bd) content-blind kod GERÇEKTEN git tarihinden
//       çekilip çalıştırılır: uretim_kaydi YOK + taşıma-defteri YAZILMADI (gerçek başarısızlık) —
//       sonra GÜNCEL (kablolu) kod AYNI girdiye karşı: uretim_kaydi VAR + defter YAZILDI (temiz geçiş)
//   F   GERÇEK VERİ (fotball-podcast-2026-07-09, operasyon-plani v1→v2, tmp kopya) — frozen-set
//       md5 kanıtı: orijinal proje dizinine SIFIR yazma
//   G   grep KANITI — production kodda (tools/, src/) sorulariYaz( yalnız TEK dosyadan çağrılıyor
//
// VERİ KURALI: bu script'in HİÇBİR adımı $META_DATA_ROOT içine yazmaz; gerçek proje dizini
// yalnız OKUNUR, tmpdir'e KOPYALANIR. Koşum: node scripts/planlama-birim-motoru-uretim-kaydi-test-runner.mjs

import { existsSync, mkdtempSync, rmSync, cpSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { META_DATA_ROOT } from './config.js'
import {
  varsayilanSoruUretici, sorulariOku, yanitKaydet, atlaYaz, soruDosyaAdi, soruYenidenDerecele,
} from '../tools/planlamaSorular.mjs'
import { tasimaDefteriOku, tasimaDefteriDosyaAdi } from '../tools/planlamaUretimKaydi.mjs'
import { birimSorulariUretVeYaz } from '../tools/planlamaBirimMotoru.mjs'

const REPO_KOKU = new URL('..', import.meta.url).pathname

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
function md5(dosyaYolu) {
  return createHash('md5').update(readFileSync(dosyaYolu)).digest('hex')
}
function yeniNs() {
  return mkdtempSync(join(tmpdir(), 'birim-motoru-uretim-kaydi-test-'))
}

// ── Fikstür içerikleri (B/E ortak) — 3 iddia: biri SABİT, biri DRIFT edecek, biri KAYBOLACAK ──
const ICERIK_V1 =
  'Bu plan üç iddia içerir.\n' +
  'Birinci iddia [tahmin-doğrulanacak:kaynak-a] sabit kalacak.\n' +
  'İkinci iddia [tahmin-doğrulanacak:kaynak-b] sürümler arasında metni değişecek.\n' +
  'Üçüncü iddia [tahmin-doğrulanacak:kaynak-c] sonraki sürümde tamamen kaybolacak.\n'
const ICERIK_V2 =
  'Bu plan üç iddia içerir.\n' +
  'Birinci iddia [tahmin-doğrulanacak:kaynak-a] sabit kalacak.\n' +
  'İkinci iddia [tahmin-doğrulanacak:kaynak-b] artık tamamen FARKLI bir cümleyle ifade ediliyor.\n' +
  'Dördüncü iddia [tahmin-doğrulanacak:kaynak-d] yeni eklendi.\n'

// v1'i üret + operatör kararlarını (3 farklı tür: tahmin / veri / atla) yanıt dosyasına yaz.
// uretVeYazFn enjekte edilebilir — Bölüm E, ESKİ (content-blind) kodun v1'i de KENDİSİNİN
// ürettiği bir fikstüre karşı çalıştığını kanıtlamak için bunu KENDİ (eski) fonksiyonuyla çağırır.
function v1FikstiruKur(ns, birimId, projeId, uretVeYazFn = birimSorulariUretVeYaz) {
  const paketV1 = uretVeYazFn(ns, varsayilanSoruUretici, birimId, 1, ICERIK_V1, projeId)
  yanitKaydet(ns, paketV1, { anahtar: 'veri:kaynak-a', karar: 'tahmin' })
  yanitKaydet(ns, paketV1, { anahtar: 'veri:kaynak-b', karar: 'veri', deger: '42' })
  atlaYaz(ns, paketV1, 'veri:kaynak-c', 'artık geçersiz varsayım')
  return paketV1
}

// ══ A — İlk üretim (surum=1) ══════════════════════════════════════════════════════════════════
bolum('A) İlk üretim (surum=1) — uretim_kaydi damgalanır, taşıma-defteri YOK (öncül yok)')
{
  const ns = yeniNs()
  try {
    const paket = birimSorulariUretVeYaz(ns, varsayilanSoruUretici, 'test-birim', 1, ICERIK_V1, 'test-proje')
    ok('paket üretildi', paket != null)
    ok('uretim_kaydi VAR', paket.uretim_kaydi != null)
    ok('uretim_kaydi.onceki = null (ilk sürüm, taşınacak öncül yok)', paket.uretim_kaydi.onceki === null)
    ok('uretim_kaydi.kod_surumu bir git SHA gibi görünüyor (40 hex)', /^[0-9a-f]{40}$/.test(paket.uretim_kaydi.kod_surumu))
    ok('taşıma-defteri dosyası YAZILMADI (mantıklı — öncül yok)', !existsSync(join(ns, tasimaDefteriDosyaAdi('test-birim', 1))))
  } finally {
    rmSync(ns, { recursive: true, force: true })
  }
}

// ══ B — Regenerasyon (surum=2): tam sınıflandırma ═══════════════════════════════════════════════
bolum('B) Regenerasyon (surum=2) — uretim_kaydi.onceki + taşıma-defteri (carried/drift/unmatched)')
{
  const ns = yeniNs()
  try {
    v1FikstiruKur(ns, 'test-birim', 'test-proje')
    const paketV2 = birimSorulariUretVeYaz(ns, varsayilanSoruUretici, 'test-birim', 2, ICERIK_V2, 'test-proje')

    ok('uretim_kaydi VAR (v2)', paketV2.uretim_kaydi != null)
    ok('uretim_kaydi.onceki doğru dosya/sürümü adlandırıyor',
      paketV2.uretim_kaydi.onceki?.dosya === soruDosyaAdi('test-birim', 1) && paketV2.uretim_kaydi.onceki?.surum === 1)

    const defter = tasimaDefteriOku(ns, 'test-birim', 2)
    ok('taşıma-defteri dosyası YAZILDI', defter != null)
    ok('defter.onceki tutarlı', defter.onceki.dosya === soruDosyaAdi('test-birim', 1) && defter.onceki.surum === 1)

    const s = defter.siniflandirma
    const a = s.carried.find(c => c.anahtar === 'veri:kaynak-a')
    const b = s.carried_with_text_drift.find(c => c.anahtar === 'veri:kaynak-b')
    const c = s.unmatched_stamped.find(c => c.anahtar === 'veri:kaynak-c')

    ok('kaynak-a: carried (metin birebir aynı), kararı (tahmin) taşıyor',
      a != null && a.yanit_vardi === true && a.yanit.karar === 'tahmin')
    ok('kaynak-b: carried_with_text_drift (metin değişti), kararı (veri=42) taşıyor AMA drift işaretli',
      b != null && b.yanit_vardi === true && b.yanit.karar === 'veri' && b.eski_iddia !== b.yeni_iddia)
    ok('kaynak-c: unmatched_stamped (yeni sette hiç yok) — SKIP KARARI YETİM KALDI, sessizce yutulmadı',
      c != null && c.yanit_vardi === true && c.yanit.atlandi === true)

    ok('defter.ozet.karar_tasindi = 2 (a, b)', defter.ozet.karar_tasindi === 2)
    ok('defter.ozet.karar_yetim_kaldi = 1 (c) — YÜKSEK SESLE görünür, gizlenmedi', defter.ozet.karar_yetim_kaldi === 1)
    // öncül 5 kayıt taşır: onay (APPROVAL) + serbest:test-birim-baglam (FREE-TEXT) + 3 DATA-REQUEST
    // (a/b/c) — yalnız c kayboluyor, geri kalan 4'ü (onay+serbest+a carried, b drift) taşınıyor.
    ok('defter.ozet.toplam = öncül toplam kayıt sayısı (5) — sessiz kayıp YOK', defter.ozet.toplam === 5)
  } finally {
    rmSync(ns, { recursive: true, force: true })
  }
}

// ══ C — SERT-HATA: öncül paket diskte yok ═══════════════════════════════════════════════════════
bolum('C) SERT-HATA — surum≥2 ama öncül (surum-1) soru paketi diskte YOK')
{
  const ns = yeniNs()
  try {
    let firladi = false, mesaj = ''
    try {
      birimSorulariUretVeYaz(ns, varsayilanSoruUretici, 'yetim-birim', 2, ICERIK_V2, 'test-proje')
    } catch (e) { firladi = true; mesaj = e.message }
    ok('fırladı (sessiz bypass YOK)', firladi)
    ok('hata mesajı öncülün eksik olduğunu açıkça söylüyor', /öncül/.test(mesaj) && /v1/.test(mesaj))
    ok('v2 soru paketi YAZILMADI', !existsSync(join(ns, soruDosyaAdi('yetim-birim', 2))))
    ok('v2 taşıma-defteri YAZILMADI', !existsSync(join(ns, tasimaDefteriDosyaAdi('yetim-birim', 2))))
  } finally {
    rmSync(ns, { recursive: true, force: true })
  }
}

// ══ D — SERT-HATA: öncül yanıt dosyası bozuk ════════════════════════════════════════════════════
bolum('D) SERT-HATA — öncül (surum-1) yanıt dosyası bozuk (kurcalanmış/geçersiz format)')
{
  const ns = yeniNs()
  try {
    const paketV1 = birimSorulariUretVeYaz(ns, varsayilanSoruUretici, 'bozuk-birim', 1, ICERIK_V1, 'test-proje')
    // Kurcalama simülasyonu — geçerli bir yanıt dosyasının YERİNE bozuk JSON.
    writeFileSync(join(ns, 'bozuk-birim-yanitlar.json'), '{ "sema": 1, "yanitlar": NOT_VALID_JSON', 'utf8')

    let firladi = false, mesaj = ''
    try {
      birimSorulariUretVeYaz(ns, varsayilanSoruUretici, 'bozuk-birim', 2, ICERIK_V2, 'test-proje')
    } catch (e) { firladi = true; mesaj = e.message }
    ok('fırladı (bozuk öncül yanıt dosyası kararları sessizce sıfır SAYMADI)', firladi)
    ok('hata mesajı "bozuk" nedenini taşıyor', /bozuk/.test(mesaj))
    ok('v2 soru paketi YAZILMADI', !existsSync(join(ns, soruDosyaAdi('bozuk-birim', 2))))
    ok('v1 paketi hâlâ okunabilir (yalnız v2 engellendi, v1 bozulmadı)', sorulariOku(ns, 'bozuk-birim', 1) != null)
    void paketV1
  } finally {
    rmSync(ns, { recursive: true, force: true })
  }
}

// ══ E — NEGATİF ÖZ-KONTROL: d2eb0bd'deki (bu görev ÖNCESİ) GERÇEK content-blind kod ═══════════════
bolum('E) NEGATİF ÖZ-KONTROL — bu görev ÖNCESİ (commit d2eb0bd) GERÇEK kod çalıştırılır')
{
  const ESKI_REV = 'd2eb0bd'
  const eskiKaynak = execFileSync('git', ['show', `${ESKI_REV}:tools/planlamaBirimMotoru.mjs`], { cwd: REPO_KOKU, encoding: 'utf8' })
  ok(`git show ${ESKI_REV}:tools/planlamaBirimMotoru.mjs okunabildi (${eskiKaynak.length} byte)`, eskiKaynak.length > 1000)
  ok('ESKİ kaynak GERÇEKTEN content-blind — uretimKaydi import YOK (bu, doğru commit\'in çekildiğinin kanıtı)',
    !eskiKaynak.includes('planlamaUretimKaydi'))

  const probeYolu = join(REPO_KOKU, 'tools', `._negatif-kontrol-eski-probe-${process.pid}.mjs`)
  try {
    writeFileSync(probeYolu, eskiKaynak, 'utf8')
    const { birimSorulariUretVeYaz: eskiBirimSorulariUretVeYaz } = await import(pathToFileURL(probeYolu).href)

    const nsEski = yeniNs()
    try {
      v1FikstiruKur(nsEski, 'test-birim', 'test-proje', eskiBirimSorulariUretVeYaz)
      // ESKİ kod v1'i de KENDİSİ üretti — üretim-kaydı YOK (bu commit henüz mekanizmayı BİLMİYOR).
      const eskiPaketV1 = sorulariOku(nsEski, 'test-birim', 1)
      ok('GERÇEK BAŞARISIZLIK KANITI (v1): eski kod paketi uretim_kaydi OLMADAN yazdı', eskiPaketV1.uretim_kaydi === undefined)

      const eskiPaketV2 = eskiBirimSorulariUretVeYaz(nsEski, varsayilanSoruUretici, 'test-birim', 2, ICERIK_V2, 'test-proje')
      ok('GERÇEK BAŞARISIZLIK KANITI (v2/regen): eski kod content-blind — uretim_kaydi YOK', eskiPaketV2.uretim_kaydi === undefined)
      ok('GERÇEK BAŞARISIZLIK KANITI (v2/regen): taşıma-defteri HİÇ YAZILMADI — kaynak-c\'nin skip kararı SESSİZCE kayboldu',
        tasimaDefteriOku(nsEski, 'test-birim', 2) === null)
    } finally {
      rmSync(nsEski, { recursive: true, force: true })
    }
  } finally {
    rmSync(probeYolu, { force: true })
  }

  console.log('\n  (temiz-durum karşılaştırması) AYNI fikstüre karşı GÜNCEL (kablolu) kod:')
  const nsGuncel = yeniNs()
  try {
    v1FikstiruKur(nsGuncel, 'test-birim', 'test-proje')
    const guncelPaketV2 = birimSorulariUretVeYaz(nsGuncel, varsayilanSoruUretici, 'test-birim', 2, ICERIK_V2, 'test-proje')
    ok('TEMİZ GEÇİŞ: güncel kodda uretim_kaydi VAR', guncelPaketV2.uretim_kaydi != null)
    ok('TEMİZ GEÇİŞ: güncel kodda taşıma-defteri YAZILDI (kaynak-c\'nin skip kararı GÖRÜNÜR — bkz karar_yetim_kaldi)',
      tasimaDefteriOku(nsGuncel, 'test-birim', 2) !== null)
  } finally {
    rmSync(nsGuncel, { recursive: true, force: true })
  }
}

// ══ F — GERÇEK VERİ (salt-okunur kopya): fotball-podcast-2026-07-09, operasyon-plani v1→v2 ═══════
bolum('F) Gerçek veri — fotball-podcast-2026-07-09 operasyon-plani (tmp kopya, frozen-set)')
const GERCEK_ID = 'fotball-podcast-2026-07-09'
const gercekKaynak = join(META_DATA_ROOT, 'projeler', GERCEK_ID)
const ASAMA_GERCEK = 'operasyon-plani'

if (!existsSync(join(gercekKaynak, `${ASAMA_GERCEK}-sorular.json`))) {
  console.log(`atlandı — ${gercekKaynak} erişilemedi (Drive bağlı değil). Bu bölüm gerçek-veri gerektirir.`)
} else {
  const dondurulanDosyalar = [
    `${ASAMA_GERCEK}-sorular.json`, `${ASAMA_GERCEK}-yanitlar.json`, `master-plan--${ASAMA_GERCEK}.md`,
  ].filter(f => existsSync(join(gercekKaynak, f)))
  const md5Once = Object.fromEntries(dondurulanDosyalar.map(f => [f, md5(join(gercekKaynak, f))]))
  const mtimeOnce = Object.fromEntries(dondurulanDosyalar.map(f => [f, statSync(join(gercekKaynak, f)).mtimeMs]))

  ok(`v2 dosyası henüz GERÇEK dizinde yok (öngörülen test öncülü)`, !existsSync(join(gercekKaynak, `${ASAMA_GERCEK}-sorular-v2.json`)))

  const kopyaNs = mkdtempSync(join(tmpdir(), 'birim-motoru-gercek-veri-test-'))
  try {
    cpSync(gercekKaynak, kopyaNs, { recursive: true })

    const oncekiPaket = sorulariOku(kopyaNs, ASAMA_GERCEK, 1)
    ok('gerçek öncül (v1) paket okunabildi', oncekiPaket !== null)
    const oncekiToplam = oncekiPaket.sorular.length + (oncekiPaket.ertelenen?.length ?? 0)

    const kaynakIcerik = readFileSync(join(kopyaNs, `master-plan--${ASAMA_GERCEK}.md`), 'utf8')
    const paketV2 = birimSorulariUretVeYaz(kopyaNs, varsayilanSoruUretici, ASAMA_GERCEK, 2, kaynakIcerik, GERCEK_ID)

    ok('gerçek veri: uretim_kaydi VAR', paketV2.uretim_kaydi != null)
    ok('gerçek veri: uretim_kaydi.onceki doğru (v1)',
      paketV2.uretim_kaydi.onceki?.dosya === `${ASAMA_GERCEK}-sorular.json` && paketV2.uretim_kaydi.onceki?.surum === 1)

    const defter = tasimaDefteriOku(kopyaNs, ASAMA_GERCEK, 2)
    ok('gerçek veri: taşıma-defteri YAZILDI (yalnız tmp kopyaya)', defter != null)
    ok('gerçek veri: sınıflandırma toplamı öncül toplamla BİREBİR (sessiz kayıp YOK)', defter.ozet.toplam === oncekiToplam)
    console.log(`  (gözlem) carried=${defter.ozet.carried}, carried_with_text_drift=${defter.ozet.carried_with_text_drift}, unmatched_stamped=${defter.ozet.unmatched_stamped}, karar_tasindi=${defter.ozet.karar_tasindi}, karar_yetim_kaldi=${defter.ozet.karar_yetim_kaldi}`)
  } finally {
    rmSync(kopyaNs, { recursive: true, force: true })
  }

  console.log('\n  ── frozen-set doğrulaması (GERÇEK proje dizini) ──')
  let ihlalVarMi = false
  for (const f of dondurulanDosyalar) {
    const md5Sonra = md5(join(gercekKaynak, f))
    const mtimeSonra = statSync(join(gercekKaynak, f)).mtimeMs
    const ayni = md5Sonra === md5Once[f] && mtimeSonra === mtimeOnce[f]
    if (!ayni) ihlalVarMi = true
    console.log(`  ${f}: md5 ${ayni ? '(AYNI ✓)' : '(!!! DEĞİŞTİ !!!)'}`)
  }
  ok('frozen-set: GERÇEK proje dizinindeki HİÇBİR dosya (md5 + mtime) değişmedi', !ihlalVarMi)
  ok('frozen-set: v2 dosyası GERÇEK dizinde HÂLÂ yok (yalnız tmp kopyaya yazıldı)',
    !existsSync(join(gercekKaynak, `${ASAMA_GERCEK}-sorular-v2.json`)))
  ok('frozen-set: v2 taşıma-defteri GERÇEK dizinde HÂLÂ yok', !existsSync(join(gercekKaynak, tasimaDefteriDosyaAdi(ASAMA_GERCEK, 2))))
}

// ══ G — grep KANITI: production kodda REGENERASYON yazma yolu TEK ═══════════════════════════════
bolum('G) grep kanıtı — sorulariYaz( çağrıları TAM olarak beklenen 2 satırda (regen-yolu + 1 denetlenmiş istisna)')
{
  let cikti = ''
  try {
    // -a: metin olarak zorla — LANG/LC_ALL boşken BSD grep bazı UTF-8 (Türkçe) kaynak dosyalarını
    // (ör. planlamaSorular.mjs) yanlışlıkla "binary" sayıp içeriğini atlıyor; bu YANLIŞ-NEGATİF
    // riskini (gerçek bir ikinci çağrı satırı sessizce gözden kaçabilir) ortadan kaldırır.
    cikti = execFileSync('grep', ['-arn', 'sorulariYaz(', 'tools', 'src'], { cwd: REPO_KOKU, encoding: 'utf8' })
  } catch (e) {
    // grep exit=1 eşleşme yoksa fırlatır — burada beklenmez (en az birimSorulariUretVeYaz içindeki
    // çağrılar eşleşmeli); yine de savunmacı davran.
    cikti = e.stdout ?? ''
  }
  const satirlar = cikti.split('\n').filter(s => s.trim())
  const cagriSatirlari = satirlar.filter(s => {
    const govde = s.replace(/^[^:]+:\d+:/, '').trim() // "dosya:satır:" ön-ekini at
    if (govde.startsWith('//')) return false // yorum satırları (bu dosyanın kendi açıklama notları dahil)
    if (/^(export\s+)?(async\s+)?function\s+sorulariYaz\(/.test(govde)) return false // FONKSİYON TANIMI — bir ÇAĞRI değil
    return true
  })
  // Satır NUMARALARI yerine ÇEVRELEYEN FONKSİYON ADINA göre eşleştir — komşu bir yoruma/koda
  // eklenen bir satır (bu görevle ALAKASIZ, gelecekteki bir düzenleme) satır numaralarını
  // kaydırıp bu testi YANLIŞ-POZİTİF başarısız etmesin; asıl iddia zaten "HANGİ FONKSİYON
  // yazıyor", "KAÇINCI SATIRDA" değil.
  function enYakinFonksiyonAdi(dosyaGoreli, satirNo) {
    const satirlarTumu = readFileSync(join(REPO_KOKU, dosyaGoreli), 'utf8').split('\n')
    for (let i = satirNo - 1; i >= 0; i--) {
      const m = satirlarTumu[i].match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
      if (m) return m[1]
    }
    return null
  }
  const bulunanFonksiyonlar = new Set(cagriSatirlari.map(s => {
    const m = s.match(/^([^:]+):(\d+):/)
    return `${m[1]}:${enYakinFonksiyonAdi(m[1], Number(m[2]))}`
  }))
  // Beklenen: yalnız BU İKİ fonksiyon — biri mekanizma-yolunun kendisi (iki dalı da AYNI
  // fonksiyon içinde, tek girişte sayılır), diğeri denetlenmiş, regenerasyon-OLMAYAN istisna
  // (soruYenidenDerecele — aşağıda AYRICA pozitif kanıtla doğrulanıyor).
  const beklenenFonksiyonlar = new Set([
    'tools/planlamaBirimMotoru.mjs:birimSorulariUretVeYaz',
    'tools/planlamaSorular.mjs:soruYenidenDerecele',
  ])
  ok('gerçek çağrı sayısı tam 3 (mekanizma-yolunun 2 dalı + 1 denetlenmiş istisna)', cagriSatirlari.length === 3)
  ok('TÜM çağrılar YALNIZ bu iki fonksiyonun İÇİNDEN geliyor — beklenmeyen bir üçüncü yazıcı YOK',
    bulunanFonksiyonlar.size === beklenenFonksiyonlar.size && [...bulunanFonksiyonlar].every(f => beklenenFonksiyonlar.has(f)))
  console.log(`  (gözlem) ${cagriSatirlari.length} çağrı, çevreleyen fonksiyonlar: ${[...bulunanFonksiyonlar].join(', ')}`)

  // soruYenidenDerecele'nin GERÇEKTEN "regenerasyon değil" istisnası olduğunun POZİTİF kanıtı —
  // yalnız yorumla İDDİA ETMEK yerine: mevcut bir uretim_kaydi'li paketi tier-değiştirip yeniden
  // yazdığında damga SESSİZCE KAYBOLMUYOR mu?
  const ns = yeniNs()
  try {
    const paketV1 = birimSorulariUretVeYaz(ns, varsayilanSoruUretici, 'derece-birim', 1, ICERIK_V1, 'test-proje')
    ok('(ön-koşul) v1 paketi uretim_kaydi taşıyor', paketV1.uretim_kaydi != null)
    const oncekiDamga = JSON.stringify(paketV1.uretim_kaydi)
    soruYenidenDerecele(ns, paketV1, 'veri:kaynak-a', 'opsiyonel')
    const sonrakiPaket = sorulariOku(ns, 'derece-birim', 1)
    ok('soruYenidenDerecele SONRASI uretim_kaydi AYNEN korunuyor (istisna güvenli)',
      JSON.stringify(sonrakiPaket.uretim_kaydi) === oncekiDamga)
    ok('soruYenidenDerecele beklenen tier değişikliğini GERÇEKTEN uyguladı (istisna işlevsiz değil)',
      sonrakiPaket.sorular.find(s => s.anahtar === 'veri:kaynak-a').tier === 'opsiyonel')
  } finally {
    rmSync(ns, { recursive: true, force: true })
  }
}

bolum(`Özet: ${gecti + kaldi} test | ✓ ${gecti} geçti | ✗ ${kaldi} başarısız`)
process.exit(kaldi === 0 ? 0 : 1)
