// Planlama aşama durum makinesi — parameterize (namespace bağımsız).
// V1'den farkı: stateYukle/statePersist nsYolu alır; boslukState projeId alır.
// V1 fonksiyonları (ASAMA_SIRASI, DURUMLAR, ilerlet, ilerletHedefle) aynı davranışı taşır.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export const ASAMA_SIRASI = ['genesis', 'premise', 'arastirma', 'strateji', 'master-plan', 'tamamlandi']
export const DURUMLAR = ['bekliyor', 'kosuyor', 'kapi-bekliyor', 'gecti', 'donduruldu']

export function boslukState(projeId) {
  const asamalar = {}
  for (const asama of ASAMA_SIRASI.filter(a => a !== 'tamamlandi')) {
    asamalar[asama] = { durum: 'bekliyor', cikti_pointer: null, kapi_sonuc: null, blok_nedeni: null }
  }
  return { proje_id: projeId, aktif_asama: 'genesis', asamalar }
}

export function stateYukle(nsYolu, projeId) {
  const dosya = join(nsYolu, 'planlama-durum.json')
  if (!existsSync(dosya)) return boslukState(projeId)
  return JSON.parse(readFileSync(dosya, 'utf8'))
}

export function statePersist(nsYolu, state) {
  const dosya = join(nsYolu, 'planlama-durum.json')
  mkdirSync(dirname(dosya), { recursive: true })
  writeFileSync(dosya, JSON.stringify(state, null, 2), 'utf8')
}

// Sıralı ilerleme: aktif_asama → bir sonraki (atlama/geri dönme yasak).
export function ilerlet(state) {
  const idx = ASAMA_SIRASI.indexOf(state.aktif_asama)
  if (idx === -1) throw new Error(`Bilinmeyen aktif_asama: ${state.aktif_asama}`)
  if (idx + 1 >= ASAMA_SIRASI.length) throw new Error(`ilerlet: zaten tamamlandi`)
  state.aktif_asama = ASAMA_SIRASI[idx + 1]
  return state
}

// Hedef belirterek ilerleme — sadece bir sonraki adım geçerliyse kabul eder (geçiş koruması).
export function ilerletHedefle(state, hedef) {
  const mevcutIdx = ASAMA_SIRASI.indexOf(state.aktif_asama)
  const hedefIdx  = ASAMA_SIRASI.indexOf(hedef)
  if (mevcutIdx === -1) throw new Error(`Bilinmeyen aktif_asama: ${state.aktif_asama}`)
  if (hedefIdx  === -1) throw new Error(`Bilinmeyen hedef: ${hedef}`)
  if (hedefIdx !== mevcutIdx + 1) {
    throw new Error(
      `ilerlet reddedildi: ${state.aktif_asama} → ${hedef} (atlamak/geri gitmek yasak; ` +
      `beklenen: ${ASAMA_SIRASI[mevcutIdx + 1]})`
    )
  }
  state.aktif_asama = hedef
  return state
}
