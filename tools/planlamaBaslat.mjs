// Planlama pipeline'ını BİR proje namespace'i için başlatır/devam ettirir.
// Materyalizasyondan (tools/intakeMateryalizeEt.mjs) BİLEREK ayrı: bu modül yalnız
// "pipeline'ı çalıştır" işini bilir, dosya/registry yazma işini bilmez.
// planlamaLoopV2Calistir zaten idempotent (gecti aşamaları atlar) — bu yüzden aynı
// çağrı hem "ilk başlatma" hem "yarıda kalanı devam ettirme" için kullanılır.

import { canliExecutorOlustur } from './canliExecutor.mjs'
import { planlamaLoopV2Calistir } from './planlamaLoopV2.mjs'

/**
 * @param {string} nsYolu — proje namespace dizini (ör. $META_DATA_ROOT/projeler/<id>)
 * @param {string} projeId
 * @param {{ ad: string, aciklama: string }} projeConfig — prompt üretimi için
 * @param {{ log?: (s:string)=>void }} opts
 * @returns {Promise<{ state, donduruldu, tamamlandi, maliyet, executorCagriSayisi }>}
 */
export async function planlamaBaslat(nsYolu, projeId, projeConfig, opts = {}) {
  const { log = () => {} } = opts
  const { executor } = canliExecutorOlustur(nsYolu, projeConfig, { log })
  return planlamaLoopV2Calistir(nsYolu, projeId, executor, { log })
}
