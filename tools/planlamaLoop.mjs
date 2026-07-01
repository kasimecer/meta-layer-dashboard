// meta-layer-core — Planlama orkestrasyon loop'u.
// Takılabilir executor: (asama) => { icerik, cikti_pointer }
// Bu dilim: fikstur-executor (fikstur/<asama>.md okur).

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from '../scripts/config.js'
import {
  ASAMA_SIRASI, stateYukle, statePersist, ilerlet, boslukState,
} from './planlamaDurumMakinesi.mjs'
import { KAPILAR } from './planlamaKapilari.mjs'

const FIKSTUR_DIR = join(META_DATA_ROOT, 'projeler', '_demo-pol', 'fikstur')

// Fikstur executor: fikstur/<asama>.md okur
export function fiksturExecutor(asama, fiksturDir = FIKSTUR_DIR) {
  const dosya = join(fiksturDir, `${asama}.md`)
  if (!existsSync(dosya)) throw new Error(`fikstur-executor: dosya bulunamadı: ${dosya}`)
  return { icerik: readFileSync(dosya, 'utf8'), cikti_pointer: dosya }
}

/**
 * Loop'u çalıştır.
 * @param {{ executor?, fiksturDir?, _callLog? }} opts
 *   executor: (asama) => { icerik, cikti_pointer } — varsayılan fiksturExecutor
 *   _callLog: { [asama]: sayı } — executor çağrı sayacı (idempotency testi için)
 * @returns {{ state, donduruldu: bool, tamamlandi: bool }}
 */
export async function planlamaLoopCalistir(opts = {}) {
  const { fiksturDir, _callLog } = opts
  const executor = opts.executor ?? ((asama) => fiksturExecutor(asama, fiksturDir ?? FIKSTUR_DIR))

  let state = stateYukle()

  while (true) {
    if (state.aktif_asama === 'tamamlandi') {
      return { state, donduruldu: false, tamamlandi: true }
    }

    const asama = state.aktif_asama
    const asamaState = state.asamalar[asama]

    // Idempotency: bu aşama zaten geçtiyse yeniden execute etme
    if (asamaState.durum === 'gecti') {
      ilerlet(state)
      statePersist(state)
      continue
    }

    // Dondurulmuşsa dur
    if (asamaState.durum === 'donduruldu') {
      return { state, donduruldu: true, tamamlandi: false }
    }

    // kosuyor
    asamaState.durum = 'kosuyor'
    statePersist(state)

    // Executor çağrı sayacı (idempotency doğrulaması için)
    if (_callLog) _callLog[asama] = (_callLog[asama] ?? 0) + 1

    process.stdout.write(`EXECUTE ${asama}\n`)
    const { icerik, cikti_pointer } = executor(asama)
    asamaState.cikti_pointer = cikti_pointer

    const kapi = KAPILAR[asama]
    if (!kapi) throw new Error(`Kapı tanımlı değil: ${asama}`)
    const sonuc = kapi(icerik)

    if (sonuc.gecti) {
      process.stdout.write(`GATE ${asama} -> gecti\n`)
      asamaState.durum = 'gecti'
      asamaState.kapi_sonuc = 'gecti'
      statePersist(state)
      ilerlet(state)
      statePersist(state)
    } else {
      process.stdout.write(`GATE ${asama} -> donduruldu(${sonuc.neden})\n`)
      asamaState.durum = 'donduruldu'
      asamaState.kapi_sonuc = 'reddedildi'
      asamaState.blok_nedeni = sonuc.neden
      statePersist(state)
      return { state, donduruldu: true, tamamlandi: false }
    }
  }
}
