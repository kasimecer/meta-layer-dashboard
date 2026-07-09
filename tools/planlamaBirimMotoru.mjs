// Genel "birim" motoru — sıralı ilerleme/geri-dönüş/bayatlık/koşum mantığı, hem üst-seviye
// aşamalar (GERCEK_ASAMALAR + state.asamalar) HEM DE master-plan'ın bölümleri (BOLUM_SIRASI +
// bolumler) için AYNI fonksiyonlarla çalışır. Stage-seviyesi davranış planlamaDurumMakinesiV2.mjs/
// planlamaLoopV2.mjs'deki ince sarmalayıcılar üzerinden BİREBİR korunur — burada yeni bir kavram
// icat edilmiyor; var olan mantık (sıra dizisi + state-map parametreleştirilerek) tekrar kullanılıyor.
//
// SÖZLEŞME: her fonksiyon "sira" (sıralı id listesi) + "birimler" (id → {durum,surum,...} state-map)
// alır — hangi liste/map olduğunu bilmez, yalnız index aritmetiği ve alan okuma/yazma yapar.

import { join } from 'path'
import {
  sorulariOku, yanitButunluk, yanitlariHamOku, acikSorular,
  sorulariYaz, enSonYanitliOncekiSurum, oncekiYanitlariOku,
  tumAcikAdaylar,
} from './planlamaSorular.mjs'

// Üst (bir önceki) birim; sıradaki ilk eleman için null (kökün üstü yok).
export function birimUst(sira, birim) {
  const i = sira.indexOf(birim)
  if (i <= 0) return null
  return sira[i - 1]
}

// Sıralı ilerleme: ebeveyn[aktifAlan] → sıradaki bir sonraki. Atlama/geri yasak (yalnız +1).
export function birimIlerlet(sira, ebeveyn, aktifAlan) {
  const mevcut = ebeveyn[aktifAlan]
  const idx = sira.indexOf(mevcut)
  if (idx === -1) throw new Error(`Bilinmeyen ${aktifAlan}: ${mevcut}`)
  if (idx + 1 >= sira.length) throw new Error(`ilerlet: zaten tamamlandi`)
  ebeveyn[aktifAlan] = sira[idx + 1]
  return ebeveyn
}

// İLERİ geçiş koruması — yalnız bir sonraki adım geçerli. Sıhhatli geri-dönüş için birimGeriDon.
export function birimIlerletHedefle(sira, ebeveyn, aktifAlan, hedef) {
  const mevcut = ebeveyn[aktifAlan]
  const mevcutIdx = sira.indexOf(mevcut)
  const hedefIdx = sira.indexOf(hedef)
  if (mevcutIdx === -1) throw new Error(`Bilinmeyen ${aktifAlan}: ${mevcut}`)
  if (hedefIdx === -1) throw new Error(`Bilinmeyen hedef: ${hedef}`)
  if (hedefIdx !== mevcutIdx + 1) {
    throw new Error(
      `ilerlet reddedildi: ${mevcut} → ${hedef} (atlamak/ham geri gitmek yasak; ` +
      `beklenen: ${sira[mevcutIdx + 1]}; geri dönüş için birimGeriDon kullan)`
    )
  }
  ebeveyn[aktifAlan] = hedef
  return ebeveyn
}

// Bir birim BAYAT mı? — kabul ettiği üst sürüm, üstün güncel sürümünden eski mi?
// 'onay-bekliyor' DAHİL (yalnız 'gecti' DEĞİL): tier modelinde (onemli/opsiyonel artık
// engellemez) bir birim 'gecti' olmadan ÖNCE, 'onay-bekliyor'da otururken üstü --geri ile
// yeniden açılıp yeni sürüme geçebilir — bu ANDA henüz 'gecti' olmadığı için ESKİ (yalnız-
// gecti) kontrol bunu YAKALAYAMAZDI, üst değişmiş olsa bile bu birim sessizce (bayat kontrolü
// hiç TETİKLENMEDEN) onaylanıp ilerlerdi. Çağıranlar (bolumWalkAdimAt/ileriMod) zaten yalnız
// ilgili durumda (gecti veya onay-bekliyor) çağırır; bu fonksiyonun kendisi ikisini de kabul eder.
export function birimBayatMi(sira, birimler, birim) {
  const ust = birimUst(sira, birim)
  if (!ust) return false
  const s = birimler[birim]
  if (!s || (s.durum !== 'gecti' && s.durum !== 'onay-bekliyor') || (s.surum ?? 0) < 1) return false
  const kabul = s.kabul_edilen_ust_surum ?? 0
  const ustSurum = birimler[ust]?.surum ?? 0
  return kabul < ustSurum
}

// Tüm bayat birimlerin listesi.
export function birimlerBayat(sira, birimler) {
  return sira.filter(b => birimBayatMi(sira, birimler, b))
}

// SIHHATLİ GERİ-DÖNÜŞ (yaptırımlı) — yalnız DAHA ERKEN + TAMAMLANMIŞ çıktısı olan bir birime.
// `tamamlandiDegeri` verilirse ve ebeveyn[aktifAlan] o değere eşitse, "mevcut konum" sıranın
// SONU sayılır (ör. stage-seviyesinde 'tamamlandi'). Geçersiz hedef HATA fırlatır, hiçbir şeyi
// değiştirmez. Hedefi yeniden-açar (durum='bekliyor'); surum/cikti_pointer KORUNUR.
//
// sorular_surum BİLEREK null'a resetlenir (KORUNMAZ — surum/cikti_pointer'ın AKSİNE): bu alan
// ESKİ (yeniden-açılmadan ÖNCEKİ) sürümün soru/yanıt paketini işaret eder — birimKostur yeniden
// çalıştığında zaten YENİ bir paket üretip bu alanı doğru değere ayarlayacaktır (bkz
// birimSorulariUretVeYaz çağrısı), ama executor İLK denemede BAŞARISIZ olursa (hata fırlatırsa)
// birimKostur o satıra hiç ULAŞAMADAN erken döner — bu ARADA (ve executor tekrar başarılı oluncaya
// kadar) state, artık YOK OLMAK ÜZERE olan içeriğin ESKİ sorular_surum'unu taşımaya devam ederdi
// (gözlemlenen gerçek belirti: "regenerate path does not reset sorular_surum correctly"). BURADA
// SIFIRLAMAK, birimAcikDurum'un (ss==null → bos/engelsiz) bu geçiş penceresinde YANLIŞ biçimde
// eskiye-ait açık/blocker soru göstermesini yapısal olarak engeller. YALNIZ bu fonksiyon (regenerate
// yolu — hem geriAsamaya HEM bolumeGeriDon AYNI çekirdeği kullanır) sıfırlar; normal ilerleme
// (birimKostur) kendi sorular_surum'unu kendi tazeler, burada DOKUNULMAZ.
export function birimGeriDon(sira, birimler, ebeveyn, aktifAlan, hedef, tamamlandiDegeri = null) {
  const hedefIdx = sira.indexOf(hedef)
  if (hedefIdx === -1) {
    throw new Error(`geri reddedildi: bilinmeyen birim "${hedef}" (geçerli: ${sira.join(', ')})`)
  }
  const hedefState = birimler[hedef]
  if (!hedefState || hedefState.durum !== 'gecti' || (hedefState.surum ?? 0) < 1) {
    throw new Error(`geri reddedildi: "${hedef}" biriminin tamamlanmış çıktısı yok (yalnız tamamlanmış birime geri dönülür)`)
  }
  const mevcut = ebeveyn[aktifAlan]
  const mevcutIdx = (tamamlandiDegeri != null && mevcut === tamamlandiDegeri)
    ? sira.length
    : sira.indexOf(mevcut)
  if (hedefIdx >= mevcutIdx) {
    throw new Error(
      `geri reddedildi: "${hedef}" ileri/eşit konumda — yalnız DAHA ERKEN birime dönülür (mevcut: ${mevcut})`
    )
  }
  hedefState.durum = 'bekliyor'
  hedefState.kapi_sonuc = null
  hedefState.blok_nedeni = null
  hedefState.sorular_surum = null
  ebeveyn[aktifAlan] = hedef
  return ebeveyn
}

// Üst birimin GEÇERLİ yanıtlarını TÜKET (MODELSİZ, yalnız dosya okur).
export function birimUstYanitTuket(nsYolu, birimler, ust) {
  if (!ust) return { ust: null, surum: null, kayitlar: null, paket: null }
  const ss = birimler[ust]?.sorular_surum
  if (ss == null) return { ust, surum: null, kayitlar: null, paket: null }
  const paket = sorulariOku(nsYolu, ust, ss)
  if (!paket) return { ust, surum: null, kayitlar: null, paket: null }
  const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, ust, ss))
  if (but.durum !== 'gecerli') return { ust, surum: null, kayitlar: null, paket: null }
  return { ust, surum: ss, kayitlar: but.yanitlar, paket }
}

// Birim çıktısından sorular paketini üret + sürümlü yaz (MODELSİZ). surum≥2 ise bir önceki
// YANITI-OLAN sürümün yanıtları ön-dolgu olarak iliştirilir (öneri; asla oto-tüketilmez).
export function birimSorulariUretVeYaz(nsYolu, soruUretici, birimId, surum, icerik, projeId) {
  if (!soruUretici) return null
  const kaynakSurum = surum >= 2 ? enSonYanitliOncekiSurum(nsYolu, birimId, surum - 1) : null
  const oncekiYanitlar = kaynakSurum ? oncekiYanitlariOku(nsYolu, birimId, kaynakSurum) : null
  const paket = soruUretici(birimId, icerik, { projeId, surum, oncekiYanitlar })
  sorulariYaz(nsYolu, paket)
  return paket
}

// Bir birimin AÇIK-SORU durumu — hem koşum-sonrası ilk durakta HEM yeniden-çağırmada aynı kaynak.
// `engelli` (blok kararı) artık TIER-FARKINDA: yalnız açık BLOCKER varsa engeller — açık onemli/
// opsiyonel ilerlemeyi durdurmaz (bkz acikBlokerler). `acik` ana-set kapsamında KALIR (geriye-
// uyum — mevcut tüketiciler bunu "bu turun açık soruları" anlamında kullanır); `acikErtelenen`
// (ertelenen'deki açık adaylar) ve `acikBlokerler` (yalnız engelli kararının girdisi) EKLENEN
// alanlar. Bu tek fonksiyon HEM aşama-seviyesi (planlamaLoopV2.mjs) HEM bölüm-seviyesi
// (planlamaBolumLoop.mjs) ilerlemeyi besler — burada yapılan düzeltme HER İKİSİNE de otomatik
// yansır (paralel bir "engelli" hesaplaması yok).
export function birimAcikDurum(nsYolu, birimler, birimId) {
  const as = birimler[birimId]
  const ss = as.sorular_surum
  const bos = { engelli: false, acik: [], acikBlokerler: [], acikErtelenen: [], sorularSurum: ss ?? null, ertelenen: [], butunlukHatasi: null, paketVar: false }
  if (ss == null) return bos
  const paket = sorulariOku(nsYolu, birimId, ss)
  if (!paket) return bos
  const substantive = paket.sorular.filter(s => s.tip !== 'APPROVAL')
  const ertelenen = paket.ertelenen ?? []
  if (substantive.length === 0) {
    return { engelli: false, acik: [], acikBlokerler: [], acikErtelenen: [], sorularSurum: ss, ertelenen, butunlukHatasi: null, paketVar: true }
  }
  const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, birimId, ss))
  // 'yok' (henüz HİÇ yanıt dosyası yazılmadı) ARTIK 'bozuk' (kurcalanmış/geçersiz format) İLE
  // AYNI ŞEKİLDE ele alınmıyor: 'yok' durumunda substantive'in TAMAMI "açık" sayılır ve engelli
  // TIER'E göre belirlenir (blocker yoksa engellemez) — operatör, yalnız onemli/opsiyonel
  // soru üreten bir birimde HİÇBİR yanıt dosyası yazmadan da ilerleyebilmeli (bu olmadan tier
  // modeli anlamsız kalırdı — "cevapsız → koşulsuz blok" eski flat davranışın ta kendisi
  // olurdu). 'bozuk' (GERÇEK bir kurcalama/format hatası — imza/sürüm uyuşmazlığı, bozuk JSON,
  // yabancı anahtar) ise HÂLÂ koşulsuz engeller: veri bütünlüğü tier'den bağımsız bir eksendir.
  if (but.durum === 'gecerli' || but.durum === 'yok') {
    const yanitlar = but.durum === 'gecerli' ? but.yanitlar : []
    const acik = acikSorular(paket, yanitlar)
    const acikBlokerler = acik.filter(s => s.tier === 'blocker')
    const tumAcik = tumAcikAdaylar(paket, yanitlar)
    const acikErtelenen = tumAcik.filter(s => !acik.includes(s))
    return { engelli: acikBlokerler.length > 0, acik, acikBlokerler, acikErtelenen, sorularSurum: ss, ertelenen, butunlukHatasi: null, paketVar: true }
  }
  return {
    engelli: true, acik: substantive, acikBlokerler: substantive.filter(s => s.tier === 'blocker'), acikErtelenen: [], sorularSurum: ss, ertelenen,
    butunlukHatasi: but.neden ?? null, paketVar: true,
  }
}

/**
 * Bir birimi KOŞTUR: sürümlü yaz, defter tut, kapıla, soru üret. TEK executor çağrısı burada.
 * asamaKostur'un (planlamaLoopV2.mjs) BİREBİR aynı gövdesi — parametreleştirilmiş.
 *
 * @param {string} birimId
 * @param {object} ctx
 * @param {string[]} ctx.sira
 * @param {object} ctx.birimler — id → {durum,surum,...} state-map (mutasyona uğrar)
 * @param {string} ctx.nsYolu
 * @param {string} ctx.projeId
 * @param {(birimId:string, surum:number) => string} ctx.dosyaAdiFn
 * @param {(birimId:string, icerik:string) => {gecti:boolean, neden?:string}} ctx.kapiFn
 * @param {(birimId:string, opts:{hedefDosya,baglamlar,yanitlar}) => Promise<{icerik,cikti_pointer,maliyet_usd?,sure_ms?}>} ctx.executorFn
 * @param {function|null} ctx.soruUretici
 * @param {object} ctx.baglamlar — önceden kurulmuş prompt bağlamı
 * @param {(s:string)=>void} ctx.log
 * @param {{toplam:number, asamalar:object}} ctx.maliyet — mutasyona uğrar
 * @param {{n:number}} ctx.executorSayaci — mutasyona uğrar
 * @param {{birim:string|null}} [ctx.kostuTutucu] — mutasyona uğrar (bu invokasyonda koşan birim)
 * @param {()=>void} ctx.statePersistFn
 * @param {(opts)=>object} ctx.sonucDonFn — çağıranın standart sonuç-şekli oluşturucusu
 * @param {(info:{as,birimId,sureStr,maliyetStr,paket,statePersistFn,log})=>object} [ctx.onSonBirimTamamlandi]
 *        — sira'nın SON elemanı geçtiğinde çağrılır. Verilmezse normal onay-bekliyor akışı sürer.
 */
export async function birimKostur(birimId, ctx) {
  const {
    sira, birimler, nsYolu, projeId, dosyaAdiFn, kapiFn, executorFn, soruUretici, baglamlar,
    log, maliyet, executorSayaci, kostuTutucu, statePersistFn, sonucDonFn, onSonBirimTamamlandi,
  } = ctx

  const as = birimler[birimId]
  const yeniSurum = (as.surum ?? 0) + 1
  const hedefDosya = join(nsYolu, dosyaAdiFn(birimId, yeniSurum))
  const ust = birimUst(sira, birimId)

  const tuketim = birimUstYanitTuket(nsYolu, birimler, ust)
  as.tuketilen_ust_yanit_surum = tuketim.surum

  log(`EXECUTE ${birimId} (sürüm ${yeniSurum} → ${dosyaAdiFn(birimId, yeniSurum)})` +
      (tuketim.surum != null ? ` [üst yanıt v${tuketim.surum} tüketiliyor]` : ''))
  as.durum = 'kosuyor'
  statePersistFn()

  let sonuc
  try {
    executorSayaci.n++
    sonuc = await executorFn(birimId, { hedefDosya, baglamlar, yanitlar: tuketim })
  } catch (e) {
    log(`HATA ${birimId}: ${e.message}`)
    as.durum = 'donduruldu'
    as.blok_nedeni = `executor hatası: ${e.message.slice(0, 200)}`
    statePersistFn()
    return sonucDonFn({ durdu: 'donduruldu' })
  }
  if (kostuTutucu) kostuTutucu.birim = birimId

  as.surum = yeniSurum
  as.cikti_pointer = sonuc.cikti_pointer ?? hedefDosya
  as.kabul_edilen_ust_surum = ust ? (birimler[ust].surum ?? 0) : null

  if (sonuc.maliyet_usd != null) {
    maliyet.asamalar[birimId] = sonuc.maliyet_usd
    maliyet.toplam += sonuc.maliyet_usd
  }
  const sureStr    = sonuc.sure_ms    != null ? ` ${(sonuc.sure_ms / 1000).toFixed(1)}s` : ''
  const maliyetStr = sonuc.maliyet_usd != null ? ` $${sonuc.maliyet_usd.toFixed(4)}`      : ''

  const g = kapiFn(birimId, sonuc.icerik)
  if (!g.gecti) {
    log(`GATE ${birimId} -> donduruldu (${g.neden})`)
    as.durum = 'donduruldu'
    as.kapi_sonuc = 'reddedildi'
    as.blok_nedeni = g.neden
    statePersistFn()
    return sonucDonFn({ durdu: 'donduruldu' })
  }

  as.kapi_sonuc = 'gecti'
  as.blok_nedeni = null

  const paket = birimSorulariUretVeYaz(nsYolu, soruUretici, birimId, yeniSurum, sonuc.icerik, projeId)
  as.sorular_surum = paket ? yeniSurum : null

  if (sira[sira.length - 1] === birimId && onSonBirimTamamlandi) {
    return onSonBirimTamamlandi({ as, birimId, sureStr, maliyetStr, paket, statePersistFn, log })
  }

  as.durum = 'onay-bekliyor'
  statePersistFn()
  const d = birimAcikDurum(nsYolu, birimler, birimId)
  const soruStr = paket ? ` [${paket.sorular.length} soru${d.acik.length ? `, ${d.acik.length} açık` : ''}${paket.ertelenen?.length ? `, ${paket.ertelenen.length} ertelenen` : ''}]` : ''
  log(`GATE ${birimId} -> gecti; ${d.engelli ? 'SORULAR AÇIK' : 'ONAY BEKLİYOR'}${soruStr}${sureStr}${maliyetStr}`)
  return sonucDonFn({
    durdu: d.engelli ? 'sorular-acik' : 'onay-bekliyor',
    bekleyenOnay: birimId,
    acikSorularListesi: d.acik,
    sorularSurum: d.sorularSurum,
    ertelenenSorular: d.ertelenen,
    butunlukHatasi: d.butunlukHatasi,
  })
}
