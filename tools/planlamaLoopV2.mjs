// Planlama orkestrasyon motoru — ONAY-KAPILI, BİR-KOŞUM-BİR-KARAR.
//
// SÖZLEŞME (kutsal): tek bir invokasyon ASLA iki aşama koşturmaz (en çok bir executor
// çağrısı). Makine her aşama sınırında DURUR ve kontrolü insana verir. Aşamalar-arası
// otonomi YOKTUR ve çoklu-aşama oto-ilerleme geri getiren HİÇBİR bayrak eklenmez.
//
// Bir invokasyonun yaptığı (mod='ileri', düz `planlama-baslat <id>`):
//   • aktif aşama 'bekliyor'/'kosuyor'  → o aşamayı KOŞTUR (1 executor çağrısı), kapıla,
//       geçerse 'onay-bekliyor'a al ve DUR (son aşamaysa doğrudan tamamla).
//   • aktif aşama 'onay-bekliyor'        → mevcut çıktıyı YENİDEN-DOĞRULA (insan elle
//       düzenlemiş olabilir). Geçerse = insanın ONAYI: ilerlet + sıradaki aşamayı KOŞTUR,
//       sonra sınırda DUR. Geçmezse: kapı nedeniyle DONDUR, ilerLETME.
//   • aktif aşama 'donduruldu'           → yeniden-doğrula (elle düzeltme kurtarma yolu):
//       geçerse 'onay-bekliyor'a al ve DUR; geçmezse dondurulmuş kal.
//   • aktif aşama 'gecti' + BAYAT        → başlangıç aşamasıysa (açık hedef) YENİDEN-KOŞTUR;
//       onay ile içine yuvarlandıysak DUR (bayat aşama açık invokasyon olmadan koşmaz).
//   • aktif aşama 'gecti' + taze          → karar yok/çalıştırma yok, atla-ilerle.
//   • aktif 'tamamlandi'                 → tamamlandı bildir (yazma YOK — eski proje uyumu).
//
// mod='tut' (`--tut`): aktif BAYAT/yeniden-açık aşamayı OLDUĞU-GİBİ-KABUL et — LLM çağrısı
// YOK, yeni sürüm YOK; yalnız kabul_edilen_ust_surum güncellenir (bayatlık temizlenir).

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  GERCEK_ASAMALAR, stateYukle, statePersist, ilerlet, bayatMi, ustAsama, asamaDosyaAdi,
} from './planlamaDurumMakinesiV2.mjs'
import { kapidanGecerMi } from './planlamaKapilari.mjs'
import { birimKostur, birimUstYanitTuket, birimSorulariUretVeYaz, birimAcikDurum } from './planlamaBirimMotoru.mjs'
import { bolumLoopCalistir } from './planlamaBolumLoop.mjs'

const SON_ASAMA = GERCEK_ASAMALAR[GERCEK_ASAMALAR.length - 1] // 'master-plan'

function icerikOku(yol) {
  if (!yol || !existsSync(yol)) return null
  return readFileSync(yol, 'utf8')
}

/**
 * Bir planlama invokasyonu koştur — EN ÇOK bir aşama.
 * @param {string} nsYolu
 * @param {string} projeId
 * @param {function} executor — async (asama, { hedefDosya, baglamlar }) =>
 *                              { icerik, cikti_pointer, maliyet_usd?, sure_ms? }
 * @param {{ log?, mod?: 'ileri'|'tut' }} opts
 * @returns {{ state, donduruldu, tamamlandi, maliyet, executorCagriSayisi,
 *             durdu, bekleyenOnay, bayatAsama, kostuAsama, mod }}
 */
export async function planlamaLoopV2Calistir(nsYolu, projeId, executor, {
  log = (s) => process.stdout.write(s + '\n'),
  mod = 'ileri',
  // Soru üretici (deterministik, MODELSİZ). null → soru katmanı KAPALI: kapı birebir
  // eski davranış (geriye-uyum; eski projeler ve ham-loop testleri). planlamaBaslat bunu
  // varsayilanSoruUretici ile AÇAR. Bir aşama koşup yapısal kapıdan geçince çağrılır:
  //   soruUretici(asama, icerik, { projeId, surum, oncekiYanitlar }) → sorular paketi.
  soruUretici = null,
  // OPT-IN (varsayılan null = KAPALI): master-plan'ı 14 bölüm + provenans-eki olarak yürüten
  // bölüm-yürüyüşünü AÇAR. Yalnız planlamaBaslat.mjs (gerçek CLI) bunu BOLUM_TANIMLARI ile
  // verir — bu tamamen ELLE opt-in olduğu için hiçbir mevcut çağıran (planlama-test-runner.mjs,
  // planlama-soru-test-runner.mjs dahil) bunu geçirmez ve eski master-plan davranışı (tek-geçiş,
  // SON_ASAMA'da onay-kapısı OLMADAN doğrudan tamamlanma) BİREBİR korunur. Değer: bir waterlık
  // (yalnız varlığı önemli) — bkz tools/planlamaBolumLoop.mjs.
  masterPlanBolumleri = null,
} = {}) {
  const state = stateYukle(nsYolu, projeId)
  const maliyet = { toplam: 0, asamalar: {} }
  const executorSayaci = { n: 0 }
  const kostuTutucu = { birim: null }
  let onayVerildi = false

  function sonucDon({
    durdu, bekleyenOnay = null, bayatAsama = null, sonrakiAsama = null,
    acikSorularListesi = [], sorularSurum = null, ertelenenSorular = [], butunlukHatasi = null,
  }) {
    return {
      state,
      donduruldu: durdu === 'donduruldu',
      tamamlandi: durdu === 'tamamlandi',
      maliyet,
      executorCagriSayisi: executorSayaci.n,
      durdu,                 // 'tamamlandi'|'onay-bekliyor'|'sorular-acik'|'donduruldu'|'bayat-karar'|'kosum-gerekli'
      bekleyenOnay,          // onay bekleyen aşama (durdu==='onay-bekliyor' | 'sorular-acik')
      bayatAsama,            // karar bekleyen bayat aşama (durdu==='bayat-karar')
      sonrakiAsama,          // koşuma hazır sıradaki aşama (durdu==='kosum-gerekli')
      kostuAsama: kostuTutucu.birim, // bu invokasyonda koşan aşama/bölüm (varsa)
      // SORU–YANIT payload'u (durdu==='sorular-acik' veya 'onay-bekliyor'da doludur):
      acikSorular: acikSorularListesi, // operatörü bekleyen açık sorular (APPROVAL hariç)
      sorularSurum,                    // aktif aşamanın sorular artefaktı sürümü
      ertelenenSorular,                // ana sete sığmayan görünür ertelenen adaylar
      butunlukHatasi,                  // yanıt artefaktı bozuk/kurcalanmışsa neden (blok + yeniden-yayın)
      mod,
    }
  }

  // Üst aşamaların GÜNCEL sürüm içeriklerini state'in cikti_pointer'larından topla.
  function baglamlarKur() {
    const b = {}
    // KANONIK FİKİR KAYNAĞI (materyalize anında yazılan intake.md) — HER koşumda diskten TAZE
    // okunur (operatör sonradan elle düzeltirse bir sonraki koşumda otomatik yansır). Tüm
    // aşama prompt'larına (promptUret/promptUretBolum, tools/canliExecutor.mjs) enjekte edilir —
    // ozet (registry.json, 140-karakter kırpılmış) YALNIZ portföy-görüntüleme içindir, prompt
    // inşasında ARTIK KULLANILMAZ (bkz meta-kanal 2026-07-18 kök-neden raporu: kırpma + hiç-
    // okunmayan intake.md, düzeltmelerin pipeline'a hiç ulaşmamasının kök nedeniydi).
    const intake = icerikOku(join(nsYolu, 'intake.md'))
    if (intake != null) b.intake = intake
    for (const p of GERCEK_ASAMALAR) {
      const ps = state.asamalar[p]
      const icerik = icerikOku(ps?.cikti_pointer)
      if (icerik != null) b[p] = icerik
    }
    return b
  }

  // ── SORU–YANIT yardımcıları (hepsi MODELSİZ; yalnız dosya okur/yazar) ──────────

  // Bir aşamanın AÇIK-SORU durumu: bu ONAY-NOKTASI değerlendiricisidir ve HEM koşum
  // sonrası ilk durakta HEM de yeniden-çağırmada aynı kaynaktır (kapı tek; çatal YOK).
  //   engelli=true ⟺ paket var + substantive soru(lar) açık VEYA yanıt bütünlüğü bozuk.
  //   paket yoksa (soru katmanı kapalı / eski proje) → engelli=false → birebir eski kapı.
  // İnce sarmalayıcı — genel mantık tools/planlamaBirimMotoru.mjs'de (bölüm-seviyesi ile PAYLAŞILIR).
  function acikDurum(asama) {
    return birimAcikDurum(nsYolu, state.asamalar, asama)
  }

  // Onay-noktası durağı için standart sonuç (koşum-sonrası + yeniden-çağırma-blok ortak).
  function onayNoktasiDon(asama, d) {
    return sonucDon({
      durdu: d.engelli ? 'sorular-acik' : 'onay-bekliyor',
      bekleyenOnay: asama,
      acikSorularListesi: d.acik,
      sorularSurum: d.sorularSurum,
      ertelenenSorular: d.ertelenen,
      butunlukHatasi: d.butunlukHatasi,
    })
  }

  // Üst aşamanın (varsa) GEÇERLİ yanıtlarını TÜKET: sürüm + yanıt kayıtlarını döndür.
  // Yalnız üstün sorular artefaktı + bütünlüğü GEÇERLİ yanıtı varsa tüketilir (aksi null).
  // Loop üst onayı 0-açık-soruyla geçirmeden alta inmez → buraya gelindiğinde yanıt geçerli.
  // İnce sarmalayıcı — genel mantık tools/planlamaBirimMotoru.mjs'de.
  function ustYanitlariTuket(asama) {
    return birimUstYanitTuket(nsYolu, state.asamalar, ustAsama(asama))
  }

  // Aşama çıktısından sorular paketini üret + sürümlü yaz. surum≥2 (—geri v++) ise bir
  // önceki sürümün yanıtları ÖN-DOLGU olarak iliştirilir (öneri; asla oto-tüketilmez).
  // İnce sarmalayıcı — genel mantık tools/planlamaBirimMotoru.mjs'de.
  function sorulariUretVeYaz(asama, surum, icerik) {
    return birimSorulariUretVeYaz(nsYolu, soruUretici, asama, surum, icerik, projeId)
  }

  // Bir aşamayı KOŞTUR — birimKostur'un (tools/planlamaBirimMotoru.mjs) ince sarmalayıcısı.
  // Davranış BİREBİR korunur: SON_ASAMA (master-plan) geçince onay-kapısı OLMADAN doğrudan
  // tamamlanır — MEĞER Kİ masterPlanBolumleri opt-in AÇIK olsun (o zaman bu fonksiyona hiç
  // GİRİLMEZ, bkz ileriMod'daki bölüm-yürüyüşü dispatch'i).
  async function asamaKostur(asama) {
    return birimKostur(asama, {
      sira: GERCEK_ASAMALAR,
      birimler: state.asamalar,
      nsYolu, projeId,
      dosyaAdiFn: asamaDosyaAdi,
      kapiFn: kapidanGecerMi,
      executorFn: executor,
      soruUretici,
      baglamlar: baglamlarKur(),
      log, maliyet, executorSayaci, kostuTutucu,
      statePersistFn: () => statePersist(nsYolu, state),
      sonucDonFn: sonucDon,
      onSonBirimTamamlandi: ({ as, birimId, sureStr, maliyetStr }) => {
        // Eski davranış BİREBİR: son aşamadan SONRA onay kapısı YOK, doğrudan tamamla.
        as.durum = 'gecti'
        ilerlet(state) // → 'tamamlandi'
        statePersist(nsYolu, state)
        log(`GATE ${birimId} -> gecti (SON AŞAMA)${sureStr}${maliyetStr}`)
        return sonucDon({ durdu: 'tamamlandi' })
      },
    })
  }

  // ── mod='tut' (OLDUĞU-GİBİ-KABUL) ────────────────────────────────────────────
  if (mod === 'tut') {
    const A = state.aktif_asama
    if (A === 'tamamlandi') {
      throw new Error('tut: pipeline tamamlanmış — tutulacak aktif aşama yok')
    }
    if (A === SON_ASAMA && masterPlanBolumleri) {
      throw new Error(
        `tut: master-plan bölüm-yürüyüşünde desteklenmiyor (yeni 4-etiket sözlüğü eski kapıyla ` +
        `uyumsuz olurdu) — ilgili bölüme "--geri <bölüm-id>" ile dön, orada normal koşum veya ` +
        `bölüm-seviyesi onay uygula`
      )
    }
    const As = state.asamalar[A]
    const bayat = As.durum === 'gecti' && bayatMi(state, A)
    const yenidenAcikHedef = As.durum === 'bekliyor' && (As.surum ?? 0) >= 1
    if (!bayat && !yenidenAcikHedef) {
      throw new Error(
        `tut: aktif aşama "${A}" tutulabilir değil (durum: ${As.durum}) — ` +
        `--tut yalnız BAYAT bir aşamada veya --geri ile yeniden-açılmış hedefte geçerli`
      )
    }
    // Güvenlik: el-kırığı çıktıyı tutma — mevcut yapısal kapıdan geçir.
    const icerik = icerikOku(As.cikti_pointer)
    if (icerik == null) {
      throw new Error(`tut: "${A}" çıktı dosyası bulunamadı (${As.cikti_pointer ?? 'yok'})`)
    }
    const g = kapidanGecerMi(A, icerik)
    if (!g.gecti) {
      As.durum = 'donduruldu'
      As.kapi_sonuc = 'reddedildi'
      As.blok_nedeni = g.neden
      statePersist(nsYolu, state)
      log(`TUT ${A} -> REDDEDİLDİ (${g.neden}) — el-kırığı çıktı tutulamaz`)
      return sonucDon({ durdu: 'donduruldu' })
    }
    // KABUL: güncel üst sürüme karşı kabul et — LLM YOK, yeni sürüm YOK.
    const ust = ustAsama(A)
    As.kabul_edilen_ust_surum = ust ? (state.asamalar[ust].surum ?? 0) : null
    As.durum = 'gecti'
    As.kapi_sonuc = 'gecti'
    As.blok_nedeni = null
    ilerlet(state)
    statePersist(nsYolu, state)
    log(`TUT ${A} -> olduğu-gibi kabul edildi (sürüm ${As.surum}; üst sürüm ${As.kabul_edilen_ust_surum ?? '—'})`)
    // İleri yuvarla: yalnız TAZE-gecti aşamaları atla; koşturma/karar YAPMA.
    return ileriYuvarla()
  }

  // ── mod='ileri' (düz) ────────────────────────────────────────────────────────
  return ileriMod()

  // İleri yuvarlama: taze-gecti aşamaları atlayarak ilk "dikkat isteyen" noktaya kadar
  // git. HİÇBİR executor çağrısı yapmaz (tut sonrası kullanılır). Karar/koşum gereken
  // yerde durur ve bildirir.
  function ileriYuvarla() {
    while (true) {
      const A = state.aktif_asama
      if (A === 'tamamlandi') return sonucDon({ durdu: 'tamamlandi' })
      const As = state.asamalar[A]
      if (As.durum === 'gecti' && !bayatMi(state, A)) {
        ilerlet(state); statePersist(nsYolu, state); continue
      }
      if (As.durum === 'gecti' && bayatMi(state, A)) {
        return sonucDon({ durdu: 'bayat-karar', bayatAsama: A })
      }
      if (As.durum === 'onay-bekliyor') {
        return onayNoktasiDon(A, acikDurum(A))
      }
      if (As.durum === 'donduruldu') {
        return sonucDon({ durdu: 'donduruldu' })
      }
      // bekliyor/kosuyor: koşum gerekir ama tut modunda koşmayız → sınırda dur
      // (sıhhatli --geri/--tut akışında ulaşılmaz; savunmacı net durak).
      return sonucDon({ durdu: 'kosum-gerekli', sonrakiAsama: A })
    }
  }

  async function ileriMod() {
    while (true) {
      const A = state.aktif_asama
      if (A === 'tamamlandi') return sonucDon({ durdu: 'tamamlandi' })

      // Master-plan BÖLÜM-YÜRÜYÜŞÜ opt-in AÇIKKEN: bu birimin TÜM yaşam-döngüsü (bekliyor/
      // kosuyor/onay-bekliyor) planlamaBolumLoop.mjs'e devredilir — asla aşağıdaki genel
      // durum/kapı yoluna (yeni 4-etiket sözlüğü eskisiyle uyumsuz olurdu) düşmez. Opt-in
      // KAPALIYKEN bu blok hiç çalışmaz — aşağıdaki mevcut kod birebir eskisi gibi işler.
      if (A === SON_ASAMA && masterPlanBolumleri) {
        return await bolumLoopCalistir(nsYolu, projeId, state, {
          executor, log, maliyet, executorSayaci, kostuTutucu, soruUretici, sonucDonFn: sonucDon,
        })
      }

      const As = state.asamalar[A]

      // Dondurulmuş → yeniden-doğrula (elle düzeltme kurtarma yolu).
      if (As.durum === 'donduruldu') {
        const icerik = icerikOku(As.cikti_pointer)
        const g = icerik == null
          ? { gecti: false, neden: `çıktı dosyası bulunamadı: ${As.cikti_pointer ?? 'yok'}` }
          : kapidanGecerMi(A, icerik)
        if (g.gecti) {
          As.durum = 'onay-bekliyor'
          As.kapi_sonuc = 'gecti'
          As.blok_nedeni = null
          // Kurtarılan (elle düzeltilmiş) çıktı için de sorular üret (koşum değil ama aşama
          // yine bir onay-noktasına geldi). Mevcut sürüm; MODELSİZ.
          const paket = sorulariUretVeYaz(A, As.surum ?? 1, icerik)
          As.sorular_surum = paket ? (As.surum ?? 1) : null
          statePersist(nsYolu, state)
          const d = acikDurum(A)
          log(`KURTARMA ${A} -> yapısal kapı yeniden GEÇTİ; ${d.engelli ? 'SORULAR AÇIK' : 'ONAY BEKLİYOR'}`)
          return onayNoktasiDon(A, d)
        }
        As.blok_nedeni = g.neden
        statePersist(nsYolu, state)
        log(`BLOKE ${A} — ${g.neden}`)
        return sonucDon({ durdu: 'donduruldu' })
      }

      // Onay bekliyor → önce SORU KAPISI, sonra yapısal yeniden-doğrulama; ikisi de geçerse
      // ONAY (ilerlet). Bu invokasyon = APPROVAL jesti; ama substantive soru(lar) açıksa
      // (veya yanıt bütünlüğü bozuksa) İLERLEME — bloke et, executor'a DOKUNMA (MODELSİZ).
      if (As.durum === 'onay-bekliyor') {
        // Bayat kontrolü ÖNCE (tier modeli — onemli/opsiyonel artık engellemez): bu aşama
        // ÜRETİLDİKTEN SONRA (henüz 'gecti' olmadan) üstü --geri ile yeniden açılıp yeni
        // sürüme geçmiş olabilir. Eskiden bu ihtimal önemsizdi (herhangi bir açık soru zaten
        // engellerdi, operatör fark etmeden onaylanamazdı); şimdi ONAYLAMADAN önce AÇIKÇA
        // yakalanmalı — aksi halde bu aşama üstün ESKİ bir sürümüne göre sessizce onaylanır.
        if (bayatMi(state, A)) {
          log(`BAYAT ${A} — karar bekliyor (üst yeni sürüme geçti; yeniden-koş: düz çağrı / olduğu-gibi: --tut)`)
          return sonucDon({ durdu: 'bayat-karar', bayatAsama: A })
        }
        const d = acikDurum(A)
        if (d.engelli) {
          statePersist(nsYolu, state) // durum değişmedi; savunmacı persist
          const hataStr = d.butunlukHatasi ? ` (yanıt bütünlüğü BOZUK: ${d.butunlukHatasi} — sorular yeniden yayınlandı)` : ''
          log(`SORULAR AÇIK ${A} — ${d.acik.length} açık soru; ilerlenmedi${hataStr}`)
          return onayNoktasiDon(A, d)
        }
        const icerik = icerikOku(As.cikti_pointer)
        const g = icerik == null
          ? { gecti: false, neden: `çıktı dosyası bulunamadı: ${As.cikti_pointer ?? 'yok'}` }
          : kapidanGecerMi(A, icerik)
        if (!g.gecti) {
          As.durum = 'donduruldu'
          As.kapi_sonuc = 'reddedildi'
          As.blok_nedeni = g.neden
          statePersist(nsYolu, state)
          log(`ONAY REDDİ ${A} -> donduruldu (el-düzenlemesi kapıyı bozdu: ${g.neden})`)
          return sonucDon({ durdu: 'donduruldu' })
        }
        As.durum = 'gecti'
        As.kapi_sonuc = 'gecti'
        As.blok_nedeni = null
        ilerlet(state)
        statePersist(nsYolu, state)
        onayVerildi = true
        log(`ONAY ${A} -> gecti; ilerleniyor`)
        continue // ilerlediğimiz aşamayı ele al (koş/dur/atla)
      }

      // Tamamlanmış aşama.
      if (As.durum === 'gecti') {
        if (bayatMi(state, A)) {
          if (onayVerildi) {
            // Üst onaylandıktan sonra bayat aşamaya yuvarlandık — DUR (bayat aşama açık
            // invokasyon olmadan KOŞMAZ; kural (e)). İnsan: düz=yeniden-koş / --tut=tut.
            log(`BAYAT ${A} — karar bekliyor (yeniden-koş: düz çağrı / olduğu-gibi: --tut)`)
            return sonucDon({ durdu: 'bayat-karar', bayatAsama: A })
          }
          // Bu invokasyonun AÇIK hedefi bayat aşama → YENİDEN-KOŞTUR (bir aşama).
          return await asamaKostur(A)
        }
        // Taze-gecti → karar yok, koşum yok; atla-ilerle.
        ilerlet(state)
        statePersist(nsYolu, state)
        continue
      }

      // bekliyor / kosuyor → aşamayı KOŞTUR (taze ileri VEYA yeniden-açık geri-hedef).
      if (As.durum === 'bekliyor' || As.durum === 'kosuyor') {
        return await asamaKostur(A)
      }

      throw new Error(`planlamaLoopV2: bilinmeyen durum "${As.durum}" (aşama ${A})`)
    }
  }
}
