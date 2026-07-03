// Master-plan bölüm İDDİA-DURUMU — 4 açık statü etiketi. planlamaKapilari.mjs'nin
// ETIKET_DESENI (köşeli-parantez etiketleme) fikrini GENELLEŞTİRİR; o dosyaya DOKUNULMAZ,
// genesis/premise/arastirma/strateji/mevcut kapıdanGecerMi birebir kalır.
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
