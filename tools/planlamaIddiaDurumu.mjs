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

// tier — AYRI/BAĞIMSIZ bir etiket, statü etiketiyle AYNI satırda birlikte durur (ör.
// "...[acik-soru:X] [tier:blocker]"). BİLEREK statü etiketinin param'ına GÖMÜLMEDİ: böylece
// provenansKapisi'nin (planlamaBolumKapilari.mjs) harfiyen `icerik.includes(iddia.param)`
// kapsam-kontrolü hiç ETKİLENMEZ — param dün neyse bugün de odur. Yok sayılırsa 'onemli'
// varsayılır (mevcut/eski içerik geriye dönük YENİ blocker icat ETMEZ).
const TIER_ETIKET_DESENI = /\[tier:(blocker|onemli|opsiyonel)\]/
const TIER_VARSAYILAN = 'onemli'

// claim-type — tier'in KARDEŞİ, AYNI co-located desende AMA BAĞIMSIZ bir eksen: statü
// "değer henüz güvenilir mi?" sorusuna, claim-type "hangi YOL onu güvenilir kılabilir, KİM
// yapabilir?" sorusuna cevap verir (ikisi asla karışmaz — bkz needsVerificationHesapla).
// Bracket adı BİLEREK "tip" (görev sözleşmesi) — mevcut İDDİA statü alanı da "tip" olarak
// adlandırıldığı için JS TARAFINDA çakışmayı önlemek için alan adı claimType (BİREBİR "tip"
// DEĞİL); metinde ne yazıyorsa (köşeli parantez) odur, yalnız iç temsildeki değişken adı farklı.
// tier'in AKSİNE sessizce varsayılan DEĞERE düşmez (null kalır) — yokluğu bilerek görünür
// bırakılır, çünkü gate (bolumIcerikGovdesiKontrolEt) tam bu yokluğu REDDETMEK için var;
// tier'in "geriye-dönük yeni blocker icat etme" gerekçesi burada uygulanmaz (bkz IDDIA_TURU_DEGERLERI).
export const IDDIA_TURU_DEGERLERI = ['masabasi', 'birincil', 'icbilgi']
const TIP_ETIKET_DESENI = /\[tip:(masabasi|birincil|icbilgi)\]/

// planlamaKapilari.mjs'deki tabloVeriSatirSayisi'nin ayraç-satırı deseniyle AYNI.
const TABLO_AYIRAC_DESENI = /^\s*\|[\s\-:|]+\|?\s*$/

// Bir içerikteki TÜM iddia etiketlerini çıkar: {satirNo, satir, tip, param, tier, claimType}[].
// Provenans-eki üretimi VE gate-check'in ORTAK tek kaynağı (iki tüketici de bunu çağırır — çatal
// yok). BÖLGE-FARKINDA eşleştirme: tier/claimType, statü etiketinin KENDİ bölgesinde aranır —
// bu bölge, o etiketin BİTİMİNDEN satırdaki BİR SONRAKİ statü etiketinin BAŞINA kadardır (yoksa
// satır sonu). Bu, "satırın İLK co-located etiketi TÜM satıra sızar" hatasını yapısal olarak
// engeller — gerçek-model çıktısında birden fazla iddia TEK fiziksel satıra (satır-sonu olmadan,
// art arda cümleler olarak) yazılabiliyor (2026-07-07 12:05 smoke'ta arastirma.md'de gözlemlendi:
// dataRequestAdaylari'nin AYNI sınıf hatası, orada satır-bazlı [eksik] anahtar-çakışmasına da yol
// açmıştı — bkz o tarihli meta-kanal.md kaydı); tek-statülü satırlarda davranış birebir ESKİSİYLE
// AYNI (bölge = satırın geri kalanı).
export function iddialariCikar(icerik) {
  const satirlar = String(icerik ?? '').split('\n')
  const sonuc = []
  satirlar.forEach((satir, i) => {
    const desen = new RegExp(IDDIA_ETIKET_KAYNAK, 'g')
    const eslesmeler = []
    let m
    while ((m = desen.exec(satir))) {
      eslesmeler.push({ baslangic: m.index, son: m.index + m[0].length, tip: m[1], param: m[2].trim() })
    }
    eslesmeler.forEach((e, idx) => {
      const bolgeBitis = idx + 1 < eslesmeler.length ? eslesmeler[idx + 1].baslangic : satir.length
      const bolge = satir.slice(e.son, bolgeBitis)
      const tierM = TIER_ETIKET_DESENI.exec(bolge)
      const tipM = TIP_ETIKET_DESENI.exec(bolge)
      sonuc.push({
        satirNo: i + 1, satir: satir.trim(), tip: e.tip, param: e.param,
        tier: tierM?.[1] ?? TIER_VARSAYILAN,
        claimType: tipM?.[1] ?? null,
      })
    })
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

// Bir satır tablo BAŞLIĞI mı (kolon adları)? Standart markdown tablo şekli: başlık satırı,
// hemen ardından ayıraç (|---|---|), sonra veri satırları. Ayıraçtan HEMEN ÖNCEKİ tablo-şekilli
// satır başlıktır — kolon adı bir iddia DEĞİLDİR, etiket taşıması BEKLENMEZ (tabloVeriSatirSayisi
// [planlamaKapilari.mjs] ile AYNI ilişkiyi ters yönden kullanır: o ayıraçtan SONRAsını "veri" sayar,
// bu ayıraçtan HEMEN ÖNCEsini "başlık" sayar).
function tabloBasligiMi(satirlar, i) {
  if (!/^\s*\|.*\|\s*$/.test(satirlar[i])) return false
  const sonraki = satirlar[i + 1]
  return sonraki != null && TABLO_AYIRAC_DESENI.test(sonraki)
}

// Bir satır SADECE kalın alt-başlık mı (ör. "**Sorun 1 — Koordinasyon Maliyeti**")? `#`
// kullanmayan ama satırın TAMAMI tek bir bold span'dan ibaret olan alt-başlıklar — genesis'in
// KENDİ prompt şablonunda da (canliExecutor.mjs "**EKSİK TÜR:**" vb) yerleşik bir konvansiyon.
// Satırda bold-etiketin YANINDA başka içerik varsa (ör. "**Sorun 1:** açıklama...") bu iddia
// SAYILIR — yalnız satırın TAMAMI salt başlıksa muaf.
function boldSadeceBasligiMi(satir) {
  return /^\*\*[^*]+\*\*$/.test(satir.trim())
}

// İlk statüsüz (etiketsiz) içerik satırını bul — yoksa null. ciplakSayiVarMi'nin satır-bazlı
// tarama biçimiyle AYNI (boş/başlık/tablo-ayracı/tablo-başlığı/bold-alt-başlık/salt-dekoratif
// atlanır; tablo VERİ satırı atlanmaz).
export function statususuzSatirBul(icerik) {
  const satirlar = String(icerik ?? '').split('\n')
  for (let i = 0; i < satirlar.length; i++) {
    const satir = satirlar[i]
    if (!satir.trim()) continue
    if (/^\s*#/.test(satir)) continue
    if (TABLO_AYIRAC_DESENI.test(satir)) continue
    if (tabloBasligiMi(satirlar, i)) continue
    if (boldSadeceBasligiMi(satir)) continue
    if (!anlamliMi(satir)) continue
    if (!new RegExp(IDDIA_ETIKET_KAYNAK).test(satir)) return { satirNo: i + 1, satir: satir.trim() }
  }
  return null
}

// [tip:...] gerekliliği — YALNIZ ampirik (doğrulama-yolu olan) statüler için: dogrulandi/
// operator-onayli-tahmin/acik-soru. operator-beyan MUAFTIR (saf operatör kararı — ampirik bir
// iddia değil, "doğrulanacak" bir şey yok). metadata da MUAFTIR ama bu KODLA UYGULANMAZ:
// IDDIA_ETIKET_KAYNAK'ın 4-statü sözlüğünde metadata YOK, bu yüzden metadata-etiketli satırlar
// iddialariCikar'ın çıktısına hiç GİRMEZ — yapı gereği muaf, ayrı bir istisna kodu gerekmez.
const TIP_GEREKLI_STATULER = new Set(['dogrulandi', 'operator-onayli-tahmin', 'acik-soru'])

// İlk tipsiz (co-located [tip:...] taşımayan) ampirik iddiayı bul — yoksa null. statususuzSatirBul
// ile AYNI "ilk ihlali bul" şekli, ama iddialariCikar'ın (bölge-farkında) çıktısına karşı çalışır.
export function tipsizIddiaBul(icerik) {
  const iddialar = iddialariCikar(icerik)
  return iddialar.find(i => TIP_GEREKLI_STATULER.has(i.tip) && !i.claimType) ?? null
}

// needs_verification — status'tan TÜRETİLİR (mekanik, LLM ASLA stampalamaz). true = iddia henüz
// doğrulanmamış VE doğrulanma yolu hâlâ açık. dogrulandi/operator-beyan "tartışmaya kapalı"
// sayılır (false). dusuruldu (bir acik-soru'nun karar=dusur ile geri çekilmesiyle oluşan efektif
// durum) de false — iddia geri çekildi, doğrulanacak bir şey kalmadı (bkz iddialariCozumle'deki
// "ne açık ne doğrulanmış; saymaz, bloklamaz" notu — aynı ruh burada da geçerli).
export function needsVerificationHesapla(efektifTip) {
  return efektifTip !== 'dogrulandi' && efektifTip !== 'operator-beyan' && efektifTip !== 'dusuruldu'
}

// Bölüm gövdesi kontrolü — mekanik "her iddia statülü olmalı" + "her ampirik iddia tipli olmalı"
// kuralları. iddiaMuaf=true ise (yalnız 'ozet-yonetici') bu kontrol ATLANIR — o bölüm
// bolumKapilari.mjs'deki TERS kuralla çalışır (sıfır etiket + sıfır çıplak sayı gerekir, bkz orada).
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
  const tipsiz = tipsizIddiaBul(icerik)
  if (tipsiz) {
    return {
      gecti: false,
      neden: `tipsiz iddia (satır ${tipsiz.satirNo}): "${tipsiz.satir.slice(0, 80)}" — ` +
             `[${tipsiz.tip}:${tipsiz.param}] ampirik bir iddia, AYNI satıra co-located ` +
             `[tip:masabasi|birincil|icbilgi] gerekli ([operator-beyan:...] muaf)`,
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
//
// `closure` — efektifTip'ten BAĞIMSIZ, ORTOGONAL bir eksen (tier/kapanma modeli): bir skip
// (atlandi=true) SONRASI da efektifTip 'acik-soru' KALIR (yukarıdaki gibi, kasıtlı — bir
// izlenen-varsayım hâlâ "doğrulanmış" DEĞİLDİR), ama closure='skip' olur; bu ayrım olmadan
// "hâlâ acik-soru" ile "hiç dokunulmamış açık" birbirinden ayırt edilemez (bkz layer2Kontrol).
//   yanıt yok           → closure='acik'
//   atlandi=true         → closure='skip'
//   karar='dusur'        → closure='atildi'
//   karar='veri'|'tahmin' → closure='cevaplandi'
//
// needsVerification HER dalda EFEKTİF statüden türetilir (needsVerificationHesapla) — bir
// acik-soru YANITLANDIĞINDA (efektifTip dogrulandi/operator-onayli-tahmin'e geçtiğinde)
// needsVerification de bunu YANSITIR (ör. karar='veri' sonrası false'a düşer); ham etikete
// göre DEĞİL, tıpkı efektifTip'in kendisi gibi.
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
  const cozum = (i, ek) => ({ ...i, ...ek, needsVerification: needsVerificationHesapla(ek.efektifTip) })
  return iddialar.map(i => {
    if (i.tip !== 'acik-soru') {
      return cozum(i, { efektifTip: i.tip, efektifKaynak: i.tip === 'dogrulandi' ? i.param : null, closure: 'cevaplandi' })
    }
    const anahtar = `veri:${slug(i.param)}`
    const yanit = yanitHaritasi.get(anahtar)
    if (!yanit) return cozum(i, { efektifTip: 'acik-soru', efektifKaynak: null, closure: 'acik' })
    if (yanit.atlandi === true) {
      return cozum(i, { efektifTip: 'acik-soru', efektifKaynak: null, closure: 'skip', varsayilanDeger: yanit.varsayilan_deger ?? null })
    }
    if (yanit.karar === 'veri') {
      const kaynak = (yanit.kaynak && String(yanit.kaynak).trim()) || 'operatör-girdisi'
      return cozum(i, { efektifTip: 'dogrulandi', efektifKaynak: kaynak, closure: 'cevaplandi' })
    }
    if (yanit.karar === 'tahmin') return cozum(i, { efektifTip: 'operator-onayli-tahmin', efektifKaynak: null, closure: 'cevaplandi' })
    if (yanit.karar === 'dusur') return cozum(i, { efektifTip: 'dusuruldu', efektifKaynak: null, closure: 'atildi' })
    return cozum(i, { efektifTip: 'acik-soru', efektifKaynak: null, closure: 'acik' })
  })
}
