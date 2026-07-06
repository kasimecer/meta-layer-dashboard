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
import { varsayilanSoruUretici } from './planlamaSorular.mjs'
import { BOLUM_TANIMLARI } from './planlamaBolumTanimlari.mjs'
import { bolumeGeriDon } from './planlamaBolumLoop.mjs'

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
  // Varsayılan (360sn) master-plan bölümlerinin biriken bağlamıyla yetersiz kaldı (arastirma
  // 2/3, pazar-analizi 6/6 zaman aşımına uğradı — 2026-07-05); 900sn'ye çıkarıldı. "synthesis"
  // sınıfı bölümler (risk-varsayimlar, ozet-yonetici) TUM_BOLUMLER_ISARETI ile TÜM aşama+bölüm
  // çıktılarını bağlam alıyor — risk-varsayimlar 900sn'de de 3/3 zaman aşımına uğradı
  // (2026-07-06), 1800sn'ye çıkarıldı.
  const { executor } = canliExecutorOlustur(nsYolu, projeConfig, { log, zaman_asimi_ms: 1_800_000 })
  // Canlı akışta SORU–YANIT katmanı AÇIK (deterministik üretici). Ham loop'ta varsayılan
  // KAPALI'dır (geriye-uyum); burada açıkça enjekte ediyoruz. Aynı şekilde master-plan
  // BÖLÜM-YÜRÜYÜŞÜ de yalnız GERÇEK CLI'da (burada) açılır — BOLUM_TANIMLARI'nın varlığı
  // opt-in'in kendisidir (bkz tools/planlamaLoopV2.mjs'deki masterPlanBolumleri).
  return planlamaLoopV2Calistir(nsYolu, projeId, executor, {
    log, mod, soruUretici: varsayilanSoruUretici, masterPlanBolumleri: BOLUM_TANIMLARI,
  })
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

/**
 * SIHHATLİ BÖLÜM GERİ-DÖNÜŞÜ: master-plan'ın 14 bölümü + provenans-eki İÇİNDE bir bölüme geri
 * döner (planlamaGeri'nin bölüm-seviyesi eşi — aynı birimGeriDon çekirdeğini kullanır).
 * Geçersiz hedefte veya walk henüz başlamadıysa HATA fırlatır, state DEĞİŞMEZ.
 * @returns {object} — güncellenmiş state
 */
export function planlamaBolumeGeri(nsYolu, projeId, hedefBolumId) {
  const state = stateYukle(nsYolu, projeId)
  bolumeGeriDon(state, hedefBolumId) // geçersizse throw — persist'e ULAŞILMAZ
  statePersist(nsYolu, state)
  return state
}
