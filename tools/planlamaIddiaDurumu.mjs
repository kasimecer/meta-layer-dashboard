// Master-plan bölüm İDDİA-DURUMU — 4 açık statü etiketi. planlamaKapilari.mjs'nin
// ETIKET_DESENI (köşeli-parantez etiketleme) fikrini GENELLEŞTİRİR; o dosyaya DOKUNULMAZ,
// genesis/premise/arastirma/strateji/mevcut kapıdanGecerMi birebir kalır.
//
// GROUNDING (bu dosyanın ikinci yarısı): "[dogrulandi:kaynak]" yazmak TEK BAŞINA yeterli
// DEĞİL — kaynak, araştırma aşamasının GERÇEKTEN doğruladığı bir kaynak olmalı
// (gercekKaynaklariCikar). Bir bölümün KENDİ [acik-soru:...] etiketleri ise, altındaki
// DATA-REQUEST YANITLANMIŞSA "efektif" bir statüye çözümlenir (iddialariCozumle) — metnin
// KENDİSİ asla değişmez, yalnız gate/Layer-2'nin SAYDIĞI statü değişir.
//
// 4 statü:
//   [dogrulandi:<kaynak>]                — kaynak-destekli (arastirma aşamasının sourced figürleri)
//   [operator-beyan:<soru-anahtari>]     — operatörün kendi kararı (bir soru yanıtı üzerinden)
//   [operator-onayli-tahmin:<soru-anahtari>] — operatörün açıkça kabul ettiği tahmin (DATA-REQUEST)
//   [acik-soru:<soru-anahtari-veya-konu>]    — henüz çözülmemiş
//
// MEKANİK KURAL (ciplakSayiVarMi ile AYNI granülerlik — satır-bazlı, bulanık "bu bir iddia mı"
// yargısı YOK): boş/başlık/tablo-ayracı/salt-dekoratif olmayan HER satır 4 etiketten birini
// TAŞIMALI; taşımıyorsa REDDEDİLİR. Tablo VERİ satırları muaf DEĞİLDİR.

import { sorulariOku, yanitlariHamOku, yanitButunluk, slug } from './planlamaSorular.mjs'

export const IDDIA_TIPLERI = ['dogrulandi', 'operator-beyan', 'operator-onayli-tahmin', 'acik-soru']

const IDDIA_ETIKET_KAYNAK = '\\[(dogrulandi|operator-beyan|operator-onayli-tahmin|acik-soru):([^\\]]+)\\]'

// planlamaKapilari.mjs'deki tabloVeriSatirSayisi'nin ayraç-satırı deseniyle AYNI.
const TABLO_AYIRAC_DESENI = /^\s*\|[\s\-:|]+\|?\s*$/

// Bir içerikteki TÜM iddia etiketlerini çıkar: {satirNo, satir, tip, param}[]. Provenans-eki
// üretimi VE gate-check'in ORTAK tek kaynağı (iki tüketici de bunu çağırır — çatal yok).
export function iddialariCikar(icerik) {
  const satirlar = String(icerik ?? '').split('\n')
  const sonuc = []
  satirlar.forEach((satir, i) => {
    const desen = new RegExp(IDDIA_ETIKET_KAYNAK, 'g')
    let m
    while ((m = desen.exec(satir))) {
      sonuc.push({ satirNo: i + 1, satir: satir.trim(), tip: m[1], param: m[2].trim() })
    }
  })
  return sonuc
}

// İçerikte en az bir iddia-statü etiketi var mı (özet-yönetici'nin TERS kuralı için).
export function iddiaEtiketVarMi(icerik) {
  return new RegExp(IDDIA_ETIKET_KAYNAK).test(String(icerik ?? ''))
}

function anlamliMi(satir) {
  const temiz = satir.replace(/[*→✓#|\-\s]/g, '')
  return temiz.length >= 5
}

// İlk statüsüz (etiketsiz) içerik satırını bul — yoksa null. ciplakSayiVarMi'nin satır-bazlı
// tarama biçimiyle AYNI (boş/başlık/tablo-ayracı/salt-dekoratif atlanır; tablo VERİ satırı atlanmaz).
export function statususuzSatirBul(icerik) {
  const satirlar = String(icerik ?? '').split('\n')
  for (let i = 0; i < satirlar.length; i++) {
    const satir = satirlar[i]
    if (!satir.trim()) continue
    if (/^\s*#/.test(satir)) continue
    if (TABLO_AYIRAC_DESENI.test(satir)) continue
    if (!anlamliMi(satir)) continue
    if (!new RegExp(IDDIA_ETIKET_KAYNAK).test(satir)) return { satirNo: i + 1, satir: satir.trim() }
  }
  return null
}

// Bölüm gövdesi kontrolü — mekanik "her iddia statülü olmalı" kuralı. iddiaMuaf=true ise
// (yalnız 'ozet-yonetici') bu kontrol ATLANIR — o bölüm bolumKapilari.mjs'deki TERS kuralla
// çalışır (sıfır etiket + sıfır çıplak sayı gerekir, bkz orada).
export function bolumIcerikGovdesiKontrolEt(icerik, { iddiaMuaf = false } = {}) {
  if (iddiaMuaf) return { gecti: true }
  const bulunan = statususuzSatirBul(icerik)
  if (bulunan) {
    return {
      gecti: false,
      neden: `statüsüz iddia (satır ${bulunan.satirNo}): "${bulunan.satir.slice(0, 80)}" — ` +
             `[dogrulandi:kaynak] / [operator-beyan:soru-anahtari] / [operator-onayli-tahmin:soru-anahtari] / [acik-soru:soru-anahtari] gerekli`,
    }
  }
  return { gecti: true }
}

// ── GROUNDING ────────────────────────────────────────────────────────────────

// Araştırma aşamasının GERÇEKTEN doğruladığı kaynaklar — eski sözlük [doğrulanmış:kaynak]
// (planlamaKapilari.mjs'in ETIKET_DESENI'nden biri). Bir bölümün [dogrulandi:X] etiketi
// ANCAK X bu kümede varsa "gerçekten kaynaklı" sayılır — model'in KENDİ uydurduğu bir kaynak
// adı bu kontrolden GEÇEMEZ.
const GERCEK_KAYNAK_DESENI = /\[doğrulanmış:([^\]]+)\]/g

export function gercekKaynaklariCikar(icerik) {
  const set = new Set()
  const desen = new RegExp(GERCEK_KAYNAK_DESENI.source, 'g')
  let m
  while ((m = desen.exec(String(icerik ?? '')))) set.add(m[1].trim())
  return set
}

// Bir [dogrulandi:kaynak] iddiasının kaynağı GERÇEK mi (gercekKaynaklar kümesinde var mı)?
export function kaynakGercekMi(kaynak, gercekKaynaklar) {
  if (!gercekKaynaklar) return true // baglam sağlanmadıysa (ör. hermetik alt-test) kontrolsüz geç
  return gercekKaynaklar.has(String(kaynak ?? '').trim())
}

// ── EFEKTİF ÇÖZÜMLEME (acik-soru → yanıtlanmışsa efektif statü) ───────────────

// Bir bölümün iddialarını (iddialariCikar çıktısı) KENDİ soru/yanıt artefaktına karşı
// ÇÖZÜMLE. Metin ASLA değişmez — yalnız gate/Layer-2'nin SAYDIĞI "efektif" statü değişir:
//   acik-soru + yanıt karar='veri'   → efektifTip='dogrulandi', efektifKaynak=operatörün girdiği kaynak
//   acik-soru + yanıt karar='tahmin' → efektifTip='operator-onayli-tahmin'
//   acik-soru + yanıt karar='dusur'  → efektifTip='dusuruldu' (ne açık ne doğrulanmış; saymaz, bloklamaz)
//   acik-soru + yanıtsız/atlanmamış  → efektifTip='acik-soru' (DEĞİŞMEDİ — hâlâ açık, bloklar)
//   dogrulandi/operator-beyan/operator-onayli-tahmin (ham) → dokunulmadan geçer
export function iddialariCozumle(nsYolu, bolumId, bolumState, iddialar) {
  const ss = bolumState?.sorular_surum
  let yanitHaritasi = new Map()
  if (ss != null) {
    const paket = sorulariOku(nsYolu, bolumId, ss)
    if (paket) {
      const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, bolumId, ss))
      if (but.durum === 'gecerli') yanitHaritasi = new Map(but.yanitlar.map(e => [e.anahtar, e]))
    }
  }
  return iddialar.map(i => {
    if (i.tip !== 'acik-soru') {
      return { ...i, efektifTip: i.tip, efektifKaynak: i.tip === 'dogrulandi' ? i.param : null }
    }
    const anahtar = `veri:${slug(i.param)}`
    const yanit = yanitHaritasi.get(anahtar)
    if (!yanit || yanit.atlandi === true) return { ...i, efektifTip: 'acik-soru', efektifKaynak: null }
    if (yanit.karar === 'veri') {
      const kaynak = (yanit.kaynak && String(yanit.kaynak).trim()) || 'operatör-girdisi'
      return { ...i, efektifTip: 'dogrulandi', efektifKaynak: kaynak }
    }
    if (yanit.karar === 'tahmin') return { ...i, efektifTip: 'operator-onayli-tahmin', efektifKaynak: null }
    if (yanit.karar === 'dusur') return { ...i, efektifTip: 'dusuruldu', efektifKaynak: null }
    return { ...i, efektifTip: 'acik-soru', efektifKaynak: null }
  })
}
