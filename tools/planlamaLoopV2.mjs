// Planlama orkestrasyon loop'u — async + parameterize.
// V1'den farkları:
//   - executor async: await executor(asama) → { icerik, cikti_pointer, maliyet_usd?, sure_ms? }
//   - namespace parameterize: nsYolu + projeId argümanı
//   - ciplakSayiVarMi TÜM aşamalarda ek kontrol (genesis/premise kapıları dahil)
//   - EXECUTE / GATE / SKIP logları executorCagriSayisi ile birlikte döner

import { ASAMA_SIRASI, stateYukle, statePersist, ilerlet } from './planlamaDurumMakinesiV2.mjs'
import { KAPILAR, ciplakSayiVarMi } from './planlamaKapilari.mjs'

/**
 * @param {string} nsYolu — namespace dizini (planlama-durum.json burada)
 * @param {string} projeId — state'e yazılacak proje kimliği
 * @param {function} executor — async (asama: string) => { icerik, cikti_pointer, maliyet_usd?, sure_ms? }
 * @param {{ log?: function }} opts
 * @returns {{ state, donduruldu, tamamlandi, maliyet, executorCagriSayisi }}
 */
export async function planlamaLoopV2Calistir(nsYolu, projeId, executor, {
  log = (s) => process.stdout.write(s + '\n'),
} = {}) {
  let state = stateYukle(nsYolu, projeId)
  const maliyet = { toplam: 0, asamalar: {} }
  let executorCagriSayisi = 0

  while (true) {
    if (state.aktif_asama === 'tamamlandi') {
      return { state, donduruldu: false, tamamlandi: true, maliyet, executorCagriSayisi }
    }

    const asama = state.aktif_asama
    const asamaState = state.asamalar[asama]

    // Idempotency: gecti → atla, ilerle
    if (asamaState.durum === 'gecti') {
      log(`SKIP ${asama} (zaten gecti — idempotency)`)
      ilerlet(state)
      statePersist(nsYolu, state)
      continue
    }

    // Dondurulmuş → dur
    if (asamaState.durum === 'donduruldu') {
      log(`BLOKE ${asama} — ${asamaState.blok_nedeni ?? '(neden bilinmiyor)'}`)
      return { state, donduruldu: true, tamamlandi: false, maliyet, executorCagriSayisi }
    }

    // Execute
    log(`EXECUTE ${asama}`)
    asamaState.durum = 'kosuyor'
    statePersist(nsYolu, state)

    let executorSonuc
    try {
      executorCagriSayisi++
      executorSonuc = await executor(asama)
    } catch (e) {
      log(`HATA ${asama}: ${e.message}`)
      asamaState.durum = 'donduruldu'
      asamaState.blok_nedeni = `executor hatası: ${e.message.slice(0, 200)}`
      statePersist(nsYolu, state)
      return { state, donduruldu: true, tamamlandi: false, maliyet, executorCagriSayisi }
    }

    const { icerik, cikti_pointer, maliyet_usd, sure_ms } = executorSonuc
    asamaState.cikti_pointer = cikti_pointer

    if (maliyet_usd != null) {
      maliyet.asamalar[asama] = maliyet_usd
      maliyet.toplam += maliyet_usd
    }

    // Kapı kontrolü (5 kapı)
    const kapi = KAPILAR[asama]
    if (!kapi) throw new Error(`Kapı tanımlı değil: ${asama}`)
    const kapiSonuc = kapi(icerik)

    // Ek kontrol: tüm aşamalarda etiketsiz sayı yok (genesis/premise kapıları bunu içermiyor)
    const sayiVar = ciplakSayiVarMi(icerik)
    const gecti = kapiSonuc.gecti && !sayiVar

    const sureStr   = sure_ms    != null ? ` ${(sure_ms / 1000).toFixed(1)}s`      : ''
    const maliyetStr = maliyet_usd != null ? ` $${maliyet_usd.toFixed(4)}`           : ''

    if (gecti) {
      log(`GATE ${asama} -> gecti${sureStr}${maliyetStr}`)
      asamaState.durum     = 'gecti'
      asamaState.kapi_sonuc = 'gecti'
      statePersist(nsYolu, state)
      ilerlet(state)
      statePersist(nsYolu, state)
    } else {
      const neden = !kapiSonuc.gecti ? kapiSonuc.neden : 'etiketsiz-sayi'
      log(`GATE ${asama} -> donduruldu (${neden})`)
      asamaState.durum      = 'donduruldu'
      asamaState.kapi_sonuc  = 'reddedildi'
      asamaState.blok_nedeni = neden
      statePersist(nsYolu, state)
      return { state, donduruldu: true, tamamlandi: false, maliyet, executorCagriSayisi }
    }
  }
}
