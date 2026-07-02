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
} = {}) {
  const state = stateYukle(nsYolu, projeId)
  const maliyet = { toplam: 0, asamalar: {} }
  let executorCagriSayisi = 0
  let onayVerildi = false
  let kostuAsama = null

  function sonucDon({ durdu, bekleyenOnay = null, bayatAsama = null, sonrakiAsama = null }) {
    return {
      state,
      donduruldu: durdu === 'donduruldu',
      tamamlandi: durdu === 'tamamlandi',
      maliyet,
      executorCagriSayisi,
      durdu,                 // 'tamamlandi'|'onay-bekliyor'|'donduruldu'|'bayat-karar'|'kosum-gerekli'
      bekleyenOnay,          // onay bekleyen aşama (durdu==='onay-bekliyor')
      bayatAsama,            // karar bekleyen bayat aşama (durdu==='bayat-karar')
      sonrakiAsama,          // koşuma hazır sıradaki aşama (durdu==='kosum-gerekli')
      kostuAsama,            // bu invokasyonda koşan aşama (varsa)
      mod,
    }
  }

  // Üst aşamaların GÜNCEL sürüm içeriklerini state'in cikti_pointer'larından topla.
  function baglamlarKur() {
    const b = {}
    for (const p of GERCEK_ASAMALAR) {
      const ps = state.asamalar[p]
      const icerik = icerikOku(ps?.cikti_pointer)
      if (icerik != null) b[p] = icerik
    }
    return b
  }

  // Bir aşamayı KOŞTUR: sürümlü yaz, defter tut, kapıla. TEK executor çağrısı burada.
  async function asamaKostur(asama) {
    const as = state.asamalar[asama]
    const yeniSurum = (as.surum ?? 0) + 1
    const hedefDosya = join(nsYolu, asamaDosyaAdi(asama, yeniSurum))
    const baglamlar = baglamlarKur()
    const ust = ustAsama(asama)

    log(`EXECUTE ${asama} (sürüm ${yeniSurum} → ${asamaDosyaAdi(asama, yeniSurum)})`)
    as.durum = 'kosuyor'
    statePersist(nsYolu, state)

    let sonuc
    try {
      executorCagriSayisi++
      sonuc = await executor(asama, { hedefDosya, baglamlar })
    } catch (e) {
      log(`HATA ${asama}: ${e.message}`)
      as.durum = 'donduruldu'
      as.blok_nedeni = `executor hatası: ${e.message.slice(0, 200)}`
      statePersist(nsYolu, state)
      return sonucDon({ durdu: 'donduruldu' })
    }
    kostuAsama = asama

    // Sürüm defteri — AÇIK (dizin listesinden değil, state'ten).
    as.surum = yeniSurum
    as.cikti_pointer = sonuc.cikti_pointer ?? hedefDosya
    as.kabul_edilen_ust_surum = ust ? (state.asamalar[ust].surum ?? 0) : null

    if (sonuc.maliyet_usd != null) {
      maliyet.asamalar[asama] = sonuc.maliyet_usd
      maliyet.toplam += sonuc.maliyet_usd
    }
    const sureStr    = sonuc.sure_ms    != null ? ` ${(sonuc.sure_ms / 1000).toFixed(1)}s` : ''
    const maliyetStr = sonuc.maliyet_usd != null ? ` $${sonuc.maliyet_usd.toFixed(4)}`      : ''

    // KAPI — çalıştırma-kapısı ve onay-yeniden-doğrulaması AYNI fonksiyon (zayıflatma yok).
    const g = kapidanGecerMi(asama, sonuc.icerik)
    if (!g.gecti) {
      log(`GATE ${asama} -> donduruldu (${g.neden})`)
      as.durum = 'donduruldu'
      as.kapi_sonuc = 'reddedildi'
      as.blok_nedeni = g.neden
      statePersist(nsYolu, state)
      return sonucDon({ durdu: 'donduruldu' })
    }

    as.kapi_sonuc = 'gecti'
    as.blok_nedeni = null
    if (asama === SON_ASAMA) {
      // Son aşama geçti → tamamla (son aşamadan SONRA onay kapısı YOK).
      as.durum = 'gecti'
      ilerlet(state) // → 'tamamlandi'
      statePersist(nsYolu, state)
      log(`GATE ${asama} -> gecti (SON AŞAMA)${sureStr}${maliyetStr}`)
      return sonucDon({ durdu: 'tamamlandi' })
    }
    as.durum = 'onay-bekliyor'
    statePersist(nsYolu, state)
    log(`GATE ${asama} -> gecti; ONAY BEKLİYOR${sureStr}${maliyetStr}`)
    return sonucDon({ durdu: 'onay-bekliyor', bekleyenOnay: asama })
  }

  // ── mod='tut' (OLDUĞU-GİBİ-KABUL) ────────────────────────────────────────────
  if (mod === 'tut') {
    const A = state.aktif_asama
    if (A === 'tamamlandi') {
      throw new Error('tut: pipeline tamamlanmış — tutulacak aktif aşama yok')
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
        return sonucDon({ durdu: 'onay-bekliyor', bekleyenOnay: A })
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
          statePersist(nsYolu, state)
          log(`KURTARMA ${A} -> yapısal kapı yeniden GEÇTİ; ONAY BEKLİYOR`)
          return sonucDon({ durdu: 'onay-bekliyor', bekleyenOnay: A })
        }
        As.blok_nedeni = g.neden
        statePersist(nsYolu, state)
        log(`BLOKE ${A} — ${g.neden}`)
        return sonucDon({ durdu: 'donduruldu' })
      }

      // Onay bekliyor → yeniden-doğrula; geçerse ONAY (ilerlet), değilse DONDUR.
      if (As.durum === 'onay-bekliyor') {
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
