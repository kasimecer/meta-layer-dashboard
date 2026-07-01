// meta-layer-core — Planlama aşama durum makinesi.
// Tek-yön sıralı: genesis → premise → arastirma → strateji → master-plan → tamamlandi
// State: projeler/_demo-pol/planlama-durum.json

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from '../scripts/config.js'

export const ASAMA_SIRASI = ['genesis', 'premise', 'arastirma', 'strateji', 'master-plan', 'tamamlandi']
export const DURUMLAR = ['bekliyor', 'kosuyor', 'kapi-bekliyor', 'gecti', 'donduruldu']

const DURUM_DOSYASI = join(META_DATA_ROOT, 'projeler', '_demo-pol', 'planlama-durum.json')

export function boslukState() {
  const asamalar = {}
  for (const asama of ASAMA_SIRASI.filter(a => a !== 'tamamlandi')) {
    asamalar[asama] = { durum: 'bekliyor', cikti_pointer: null, kapi_sonuc: null, blok_nedeni: null }
  }
  return { proje_id: '_demo-pol', aktif_asama: 'genesis', asamalar }
}

export function stateYukle() {
  if (!existsSync(DURUM_DOSYASI)) return boslukState()
  return JSON.parse(readFileSync(DURUM_DOSYASI, 'utf8'))
}

export function statePersist(state) {
  writeFileSync(DURUM_DOSYASI, JSON.stringify(state, null, 2), 'utf8')
}

export function ilerlet(state) {
  const mevcutIdx = ASAMA_SIRASI.indexOf(state.aktif_asama)
  if (mevcutIdx === -1) throw new Error(`Bilinmeyen aktif_asama: ${state.aktif_asama}`)
  const sonrakiIdx = mevcutIdx + 1
  if (sonrakiIdx >= ASAMA_SIRASI.length) throw new Error(`ilerlet: zaten tamamlandi`)
  const sonraki = ASAMA_SIRASI[sonrakiIdx]
  // Beklenen sonraki sıra değil mi → reddet
  const beklenenSonraki = ASAMA_SIRASI[mevcutIdx + 1]
  if (sonraki !== beklenenSonraki) throw new Error(`ilerlet: geçersiz hedef ${sonraki}, beklenen ${beklenenSonraki}`)
  state.aktif_asama = sonraki
  return state
}

// Doğrudan hedef belirterek ilerletme — sadece sıradaki adım geçerliyse kabul eder
export function ilerletHedefle(state, hedef) {
  const mevcutIdx = ASAMA_SIRASI.indexOf(state.aktif_asama)
  const hedefIdx = ASAMA_SIRASI.indexOf(hedef)
  if (mevcutIdx === -1) throw new Error(`Bilinmeyen aktif_asama: ${state.aktif_asama}`)
  if (hedefIdx === -1) throw new Error(`Bilinmeyen hedef: ${hedef}`)
  if (hedefIdx !== mevcutIdx + 1) {
    throw new Error(
      `ilerlet reddedildi: ${state.aktif_asama} → ${hedef} atlamak/geri gitmek yasak; ` +
      `beklenen: ${ASAMA_SIRASI[mevcutIdx + 1]}`
    )
  }
  state.aktif_asama = hedef
  return state
}
