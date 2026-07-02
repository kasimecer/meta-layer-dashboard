// Planlama pipeline'ını BİR proje namespace'i için İLERLETİR (bir-koşum-bir-karar) veya
// SIHHATLİ GERİ-DÖNÜŞ yaptırır. Materyalizasyondan (tools/intakeMateryalizeEt.mjs) BİLEREK
// ayrı: bu modül yalnız "pipeline'ı bir adım işlet / geri döndür" işini bilir; dosya/registry
// yazımını bilmez.
//
// Onay-kapılı model: her invokasyon EN ÇOK bir aşama koşturur ve aşama sınırında DURUR
// (bkz tools/planlamaLoopV2.mjs). Çoklu-aşama oto-ilerleme YOKTUR.

import { canliExecutorOlustur } from './canliExecutor.mjs'
import { planlamaLoopV2Calistir } from './planlamaLoopV2.mjs'
import { stateYukle, statePersist, geriAsamaya } from './planlamaDurumMakinesiV2.mjs'

/**
 * Pipeline'ı bir adım işlet.
 * @param {string} nsYolu — proje namespace dizini ($META_DATA_ROOT/projeler/<id>)
 * @param {string} projeId
 * @param {{ ad: string, aciklama: string }} projeConfig — prompt üretimi için
 * @param {{ log?: (s:string)=>void, mod?: 'ileri'|'tut' }} opts
 * @returns {Promise<object>} — planlamaLoopV2Calistir sonucu
 */
export async function planlamaBaslat(nsYolu, projeId, projeConfig, opts = {}) {
  const { log = () => {}, mod = 'ileri' } = opts
  const { executor } = canliExecutorOlustur(nsYolu, projeConfig, { log })
  return planlamaLoopV2Calistir(nsYolu, projeId, executor, { log, mod })
}

/**
 * SIHHATLİ GERİ-DÖNÜŞ: hedef aşamayı yeniden-açar (LLM çağrısı YOK; çıktı SİLİNMEZ).
 * Geçersiz hedefte HATA fırlatır ve state DEĞİŞMEZ (persist edilmez).
 * @returns {object} — güncellenmiş state
 */
export function planlamaGeri(nsYolu, projeId, hedef) {
  const state = stateYukle(nsYolu, projeId)
  geriAsamaya(state, hedef) // geçersizse throw — aşağıdaki persist'e ULAŞILMAZ (state değişmez)
  statePersist(nsYolu, state)
  return state
}
