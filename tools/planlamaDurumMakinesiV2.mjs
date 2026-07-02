// Planlama aşama durum makinesi — parameterize (namespace bağımsız) + sürüm-defteri.
//
// İŞLETİM MODELİ (v2 onay-kapılı): makine her aşama SINIRINDA durur, kontrolü insana
// verir. İnsan çıktıyı inceler (Drive'daki .md), gerekirse ELLE düzenler, sonra açıkça
// ilerletir — ya da daha erken bir aşamaya GERİ döner. Aşamalar-arası otonomi YOK.
//
// SÜRÜM DEFTERİ (açık, dizin-listesinden ÇIKARILMAZ): her aşama kendi `surum`unu (üretilen
// çıktı sürüm no) ve `kabul_edilen_ust_surum`unu (hangi üst-aşama sürümüne karşı inşa/kabul
// edildiği) state dosyasında taşır. Bir aşama BAYAT'tır ⟺ kabul ettiği üst sürüm, üstün
// GÜNCEL sürümünden eskidir. Geri-dönüş üst aşamayı yeniden koşturunca üst.surum artar →
// alt aşamalar bayatlar. Bayat çıktı SİLİNMEZ; işaretlenir; insan aşama-aşama karar verir
// (yeniden-koş veya --tut ile OLDUĞU-GİBİ-KABUL, LLM çağrısı olmadan).
//
// GERİYE-UYUMLULUK: eski şema (surum/kabul_edilen_ust_surum alanları YOK) dosyalar
// normalizeState ile BELLEKTE zenginleştirilir; tamamlanmış proje tamamlanmış kalır ve
// hiçbir eylem tetiklenmedikçe dosya diske YENİDEN YAZILMAZ (yıkıcı-olmayan uyum).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export const ASAMA_SIRASI = ['genesis', 'premise', 'arastirma', 'strateji', 'master-plan', 'tamamlandi']
export const GERCEK_ASAMALAR = ASAMA_SIRASI.filter(a => a !== 'tamamlandi')
export const DURUMLAR = ['bekliyor', 'kosuyor', 'onay-bekliyor', 'gecti', 'donduruldu']
export const SEMA_SURUM = 2

// Üst (bir önceki gerçek) aşama; genesis için null (kökün üstü yok).
export function ustAsama(asama) {
  const i = GERCEK_ASAMALAR.indexOf(asama)
  if (i <= 0) return null
  return GERCEK_ASAMALAR[i - 1]
}

// Bir aşama sürümü için çıktı dosya adı. İlk sürüm eski şemayla aynı ("genesis.md");
// yeniden-koşumlar sürüm ekiyle ("genesis-v2.md") — önceki sürümlerin üzerine YAZMAZ.
export function asamaDosyaAdi(asama, surum) {
  return (surum ?? 0) <= 1 ? `${asama}.md` : `${asama}-v${surum}.md`
}

function bosAsama() {
  return {
    durum: 'bekliyor',
    cikti_pointer: null,
    kapi_sonuc: null,
    blok_nedeni: null,
    surum: 0,                     // üretilen güncel çıktı sürümü (0 = hiç üretilmedi)
    kabul_edilen_ust_surum: null, // bu aşamanın inşa/kabul edildiği üst-aşama sürümü
    // SORU–YANIT katmanı (additive; eski dosyalar normalizeState ile null'lanır → geriye-uyumlu):
    sorular_surum: null,             // bu koşumun sorular artefaktı sürümü (soru yoksa null)
    tuketilen_ust_yanit_surum: null, // bu aşama son koştuğunda TÜKETTİĞİ üst-aşama yanıt sürümü (izlenebilirlik)
  }
}

export function boslukState(projeId) {
  const asamalar = {}
  for (const asama of GERCEK_ASAMALAR) asamalar[asama] = bosAsama()
  return { proje_id: projeId, semasurum: SEMA_SURUM, aktif_asama: 'genesis', asamalar }
}

// Eski-şema (veya kısmi) state'i BELLEKTE normalize et: eksik alanları güvenli
// varsayılanlarla doldur. Diske YAZMAZ (statePersist ayrı çağrılır). Tamamlanmış eski
// proje bu fonksiyondan geçse de anlamı DEĞİŞMEZ: gecti aşamalar surum=1 kabul edilir,
// kabul_edilen_ust_surum üstün surum'una eşitlenir → hiçbir aşama bayat GÖRÜNMEZ.
export function normalizeState(state) {
  if (!state || typeof state !== 'object') return state
  if (state.semasurum == null) state.semasurum = SEMA_SURUM
  state.asamalar = state.asamalar ?? {}
  // Sırayla işle: üstün surum'u alttan ÖNCE kesinleşsin (alt kabul varsayılanı için).
  for (const asama of GERCEK_ASAMALAR) {
    const varsayilan = bosAsama()
    const mevcut = state.asamalar[asama] ?? {}
    // Alan-alan doldur (mevcut değerler korunur).
    for (const k of Object.keys(varsayilan)) {
      if (mevcut[k] === undefined) mevcut[k] = varsayilan[k]
    }
    // surum eksikse durumdan türet: gecti → 1, aksi halde 0.
    if (mevcut.surum == null || mevcut.surum === 0) {
      mevcut.surum = mevcut.durum === 'gecti' ? 1 : (mevcut.surum ?? 0)
    }
    state.asamalar[asama] = mevcut
  }
  // kabul_edilen_ust_surum eksikse: bayat GÖRÜNMESİN diye üstün güncel surum'una eşitle.
  for (const asama of GERCEK_ASAMALAR) {
    const ust = ustAsama(asama)
    const s = state.asamalar[asama]
    if (ust && s.kabul_edilen_ust_surum == null && s.durum === 'gecti') {
      s.kabul_edilen_ust_surum = state.asamalar[ust].surum ?? 0
    }
  }
  return state
}

export function stateYukle(nsYolu, projeId) {
  const dosya = join(nsYolu, 'planlama-durum.json')
  if (!existsSync(dosya)) return boslukState(projeId)
  const ham = JSON.parse(readFileSync(dosya, 'utf8'))
  return normalizeState(ham)
}

export function statePersist(nsYolu, state) {
  const dosya = join(nsYolu, 'planlama-durum.json')
  mkdirSync(dirname(dosya), { recursive: true })
  writeFileSync(dosya, JSON.stringify(state, null, 2), 'utf8')
}

// Sıralı ilerleme: aktif_asama → bir sonraki. Atlama/geri-gitme yasak (yalnız +1).
export function ilerlet(state) {
  const idx = ASAMA_SIRASI.indexOf(state.aktif_asama)
  if (idx === -1) throw new Error(`Bilinmeyen aktif_asama: ${state.aktif_asama}`)
  if (idx + 1 >= ASAMA_SIRASI.length) throw new Error(`ilerlet: zaten tamamlandi`)
  state.aktif_asama = ASAMA_SIRASI[idx + 1]
  return state
}

// İLERİ geçiş koruması — yalnız bir sonraki adım geçerli. Atlama VE ham (yaptırımsız)
// geri-gitme REDDEDİLİR. Sıhhatli geri-dönüş için geriAsamaya() kullanılır (ayrı sınıf).
export function ilerletHedefle(state, hedef) {
  const mevcutIdx = ASAMA_SIRASI.indexOf(state.aktif_asama)
  const hedefIdx  = ASAMA_SIRASI.indexOf(hedef)
  if (mevcutIdx === -1) throw new Error(`Bilinmeyen aktif_asama: ${state.aktif_asama}`)
  if (hedefIdx  === -1) throw new Error(`Bilinmeyen hedef: ${hedef}`)
  if (hedefIdx !== mevcutIdx + 1) {
    throw new Error(
      `ilerlet reddedildi: ${state.aktif_asama} → ${hedef} (atlamak/ham geri gitmek yasak; ` +
      `beklenen: ${ASAMA_SIRASI[mevcutIdx + 1]}; geri dönüş için geriAsamaya kullan)`
    )
  }
  state.aktif_asama = hedef
  return state
}

// Bir aşama BAYAT mı? — kabul ettiği üst sürüm, üstün güncel sürümünden eski mi?
// Yalnız TAMAMLANMIŞ (gecti, surum≥1) aşamalar bayatlayabilir. genesis'in üstü yok.
export function bayatMi(state, asama) {
  const ust = ustAsama(asama)
  if (!ust) return false
  const s = state.asamalar[asama]
  if (!s || s.durum !== 'gecti' || (s.surum ?? 0) < 1) return false
  const kabul = s.kabul_edilen_ust_surum ?? 0
  const ustSurum = state.asamalar[ust]?.surum ?? 0
  return kabul < ustSurum
}

// Tüm bayat aşamaların listesi (durum/listeleme için).
export function bayatAsamalar(state) {
  return GERCEK_ASAMALAR.filter(a => bayatMi(state, a))
}

// SIHHATLİ GERİ-DÖNÜŞ (yaptırımlı) — yalnız DAHA ERKEN + TAMAMLANMIŞ çıktısı olan bir
// aşamaya. Zincirin herhangi bir yerinden (ör. master-plan → genesis) izinli. Geçersiz
// hedef HATA fırlatır ve state'i DEĞİŞTİRMEZ (çağıran hata durumunda persist etmemeli).
// Hedef aşamayı yeniden-açar (durum='bekliyor'); mevcut surum/cikti_pointer KORUNUR
// (çıktı SİLİNMEZ/ÜZERİNE-YAZILMAZ) — sonraki koşum yeni bir sürüm dosyası yazar. Alt
// aşamalara DOKUNULMAZ; hedef yeniden koşup surum'u artınca doğal olarak bayatlar.
export function geriAsamaya(state, hedef) {
  const hedefIdx = GERCEK_ASAMALAR.indexOf(hedef)
  if (hedefIdx === -1) {
    throw new Error(`geri reddedildi: bilinmeyen aşama "${hedef}" (geçerli: ${GERCEK_ASAMALAR.join(', ')})`)
  }
  const hedefState = state.asamalar[hedef]
  if (!hedefState || hedefState.durum !== 'gecti' || (hedefState.surum ?? 0) < 1) {
    throw new Error(`geri reddedildi: "${hedef}" aşamasının tamamlanmış çıktısı yok (yalnız tamamlanmış aşamaya geri dönülür)`)
  }
  // Mevcut konum: tamamlandi ise son gerçek aşamadan sonrası (hepsi geride).
  const mevcutIdx = state.aktif_asama === 'tamamlandi'
    ? GERCEK_ASAMALAR.length
    : GERCEK_ASAMALAR.indexOf(state.aktif_asama)
  if (hedefIdx >= mevcutIdx) {
    throw new Error(
      `geri reddedildi: "${hedef}" ileri/eşit konumda — yalnız DAHA ERKEN aşamaya dönülür ` +
      `(mevcut: ${state.aktif_asama})`
    )
  }
  // Yeniden-aç: sonraki koşum yeni sürüm yazacak. Çıktı/sürüm korunur.
  hedefState.durum = 'bekliyor'
  hedefState.kapi_sonuc = null
  hedefState.blok_nedeni = null
  state.aktif_asama = hedef
  return state
}
