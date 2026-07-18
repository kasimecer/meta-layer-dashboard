// meta-layer-core — Planlama aşama kapıları.
// Her kapı: (aşama-çıktı-metni) → { gecti: bool, neden?: string }

// Yardımcı: metin içinde kaynak-etiketsiz çıplak sayı/figür var mı kontrol et.
// Çıplak sayı = ünite taşıyan rakam (%, milyon, ₺ vb.) veya ondalıklı/4+ haneli sayı.
const SAYI_DESENI = /\b\d[\d.,]*\s*(?:%|milyon|milyar|bin|₺|kr|ay|gün|saat|hafta)|\b\d{4,}\b|\b\d+[.,]\d+\b/
// operator-beyan 2026-07-18'de eklendi: tools/canliExecutor.mjs:yanitlarMetni artık operatör-
// onaylı (kaynaksız/deger'siz) cevapları BU etikete yönlendiriyor (bkz Priority 1b/1c raporu) —
// eskiden bu etiket burada TANINMIYORDU, yalnız AYNI birimde BAŞKA geçerli bir etiket varsa
// (tesadüfen) geçiyordu; artık kendi başına GEÇERLİ bir etikettir.
const ETIKET_DESENI = /\[(?:doğrulanmış|tahmin|eksik|ortak|canlı|metadata|operator-beyan)[^\]]*\]/
// Cümle sınırı — tools/planlamaSorular.mjs:CUMLE_SINIRI_DESENI ile AYNI basit ruh (kasıtlı-
// lenient; noktalı-virgül/kısaltma-farkındalığı YOK).
const CUMLE_SINIRI_DESENI_KAPI = /[.!?]\s+/

// 2026-07-18 (Priority 1b): bir SATIR (paragraf) birden çok iddia taşıyabilir — eskiden kontrol
// TÜM SATIRDA herhangi bir geçerli etiket var mı diye bakıyordu, yani bir iddianın çıplak sayısı
// SATIRDAKİ BAŞKA bir iddianın etiketiyle "kapanmış" sayılabiliyordu (canlı-vaka: arastirma.md'de
// [operator-beyan:...] etiketi kapıdan yalnız AYNI paragraftaki alakasız [tahmin-doğrulanacak:
// WTP-pilot-verisi] etiketi sayesinde geçmişti). Artık kontrol birimi SATIR değil, satırın alt-
// birimidir: tablo veri satırlarında HÜCRE, düz-yazı satırlarında CÜMLE — bir iddia yalnız KENDİ
// biriminde bir etiket varsa geçer.
function satirBirimleriCikar(satir) {
  if (/^\s*\|.*\|\s*$/.test(satir)) {
    return satir.trim().split('|').map(h => h.trim()).filter(h => h.length > 0)
  }
  return satir.split(CUMLE_SINIRI_DESENI_KAPI)
}

export function ciplakSayiVarMi(metin) {
  for (const satir of metin.split('\n')) {
    // Tablo ayırıcı satırı atla (|---|---|)
    if (/^\s*\|[\s\-|]+\|?\s*$/.test(satir)) continue
    for (const birim of satirBirimleriCikar(satir)) {
      if (!SAYI_DESENI.test(birim)) continue
      // Sayı var ama KENDİ biriminde (hücre/cümle) etiket yok → çıplak sayı
      if (!ETIKET_DESENI.test(birim)) return true
    }
  }
  return false
}

// Markdown tablo: ayraç satırını (|---|---|) kanıt olarak bul, ondan SONRAKİ
// ardışık tablo satırlarını say. Header-satırı kanıt sayılmaz — yalnız ayraçtan
// sonraki VERİ satırları sayılır. Ayraç yoksa (gerçek tablo yok) → 0.
function tabloVeriSatirSayisi(bolumMetni) {
  const satirlar = bolumMetni.split('\n')
  const tabloSatirIdx = []
  for (let i = 0; i < satirlar.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(satirlar[i])) tabloSatirIdx.push(i)
  }
  const ayiraciIdx = tabloSatirIdx.find(i => /^\s*\|[\s\-:|]+\|?\s*$/.test(satirlar[i]))
  if (ayiraciIdx === undefined) return 0
  let sayac = 0
  for (let i = ayiraciIdx + 1; i < satirlar.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(satirlar[i])) sayac++
    else break
  }
  return sayac
}

// Kapı 1 — Genesis (v3 — yapısal kontrat)
// Sıra zorunlu: §1 < §2 < §3 < §4.
//   §1 Aday Seti       — gerçek tablo (ayraç-satırı kanıtlı) + ≥2 VERİ satırı (boş/tek-aday reddedilir)
//   §2 Set Eleştirisi  — Soy 1 ve Soy 2, HER BİRİNİN KENDİ bloğunda: EKSİK TÜR + PAYLAŞILAN KÖR NOKTA +
//                        VARLIK KALDIRACI üç çıktısı, ayrıca ≥3 [yapısal-bulgu] + ≥3 [reçete] (bir mercek
//                        içinde başka merceğin etiketi sayılmaz — kapsam soy-bloğuyla sınırlı)
//   §3 Bulgular→Yansıma — gerçek tablo + ≥1 VERİ satırı
//   §4 Seçilen Aday     — anlamlı gövde içerik (≥15 anlamlı karakter) + birebir kapanış satırı
export function kapiGenesis(cikti) {
  const idx1 = cikti.indexOf('§1')
  const idx2 = cikti.indexOf('§2')
  const idx3 = cikti.indexOf('§3')
  const idx4 = cikti.indexOf('§4')
  if (idx1 === -1) return { gecti: false, neden: 'genesis: §1 Aday Seti bölümü eksik' }
  if (idx2 === -1) return { gecti: false, neden: 'genesis: §2 Set Eleştirisi bölümü eksik' }
  if (idx3 === -1) return { gecti: false, neden: 'genesis: §3 Bulgular → Sete Yansıma bölümü eksik' }
  if (idx4 === -1) return { gecti: false, neden: 'genesis: §4 Seçilen Aday bölümü eksik' }
  if (!(idx1 < idx2 && idx2 < idx3 && idx3 < idx4)) {
    return { gecti: false, neden: 'genesis: bölüm sırası bozuk — beklenen §1 → §2 → §3 → §4' }
  }

  const bolum1 = cikti.slice(idx1, idx2)
  const bolum2 = cikti.slice(idx2, idx3)
  const bolum3 = cikti.slice(idx3, idx4)
  const bolum4 = cikti.slice(idx4)

  // §1 — Aday Seti: ≥2 veri satırı (birden fazla aday; boş/tek-aday reddedilir)
  const adaySayisi = tabloVeriSatirSayisi(bolum1)
  if (adaySayisi < 2) {
    return { gecti: false, neden: `genesis: §1 Aday Seti tablosunda yeterli aday yok (bulunan: ${adaySayisi}, gereken: ≥2)` }
  }

  // §2 — Set Eleştirisi: Soy 1 ve Soy 2 SIRAYLA bulunmalı; her biri kendi bloğunda 3 çıktı türü taşımalı
  const soy1Idx = bolum2.search(/soy\s*1/i)
  const soy2Idx = bolum2.search(/soy\s*2/i)
  if (soy1Idx === -1) return { gecti: false, neden: 'genesis: §2 Soy 1 mercek eksik' }
  if (soy2Idx === -1) return { gecti: false, neden: 'genesis: §2 Soy 2 mercek eksik' }
  if (soy2Idx < soy1Idx) return { gecti: false, neden: 'genesis: §2 Soy 1/Soy 2 sırası bozuk' }

  const soy1Blok = bolum2.slice(soy1Idx, soy2Idx)
  const soy2Blok = bolum2.slice(soy2Idx)

  for (const [ad, blok] of [['Soy 1', soy1Blok], ['Soy 2', soy2Blok]]) {
    for (const marker of ['EKSİK TÜR', 'PAYLAŞILAN KÖR NOKTA', 'VARLIK KALDIRACI']) {
      if (!blok.includes(marker)) {
        return { gecti: false, neden: `genesis: §2 ${ad} bloğunda ${marker} çıktısı eksik` }
      }
    }
    const ybSayisi = (blok.match(/\[yapısal-bulgu\]/g) || []).length
    const rSayisi  = (blok.match(/\[reçete\]/g) || []).length
    if (ybSayisi < 3) {
      return { gecti: false, neden: `genesis: §2 ${ad} bloğunda [yapısal-bulgu] sayısı yetersiz (${ybSayisi}/3)` }
    }
    if (rSayisi < 3) {
      return { gecti: false, neden: `genesis: §2 ${ad} bloğunda [reçete] sayısı yetersiz (${rSayisi}/3)` }
    }
  }

  // §3 — Bulgular → Sete Yansıma: ≥1 veri satırı (boş tablo reddedilir)
  const bulguSayisi = tabloVeriSatirSayisi(bolum3)
  if (bulguSayisi < 1) {
    return { gecti: false, neden: 'genesis: §3 Bulgular → Sete Yansıma tablosu boş (0 satır)' }
  }

  // §4 — Seçilen Aday: anlamlı gövde içerik + birebir kapanış satırı
  if (!bolum4.includes('Çıktı → Bir sonraki aşama: premise')) {
    return { gecti: false, neden: 'genesis: §4 son satır "Çıktı → Bir sonraki aşama: premise" eksik' }
  }
  const govde4 = bolum4.replace('Çıktı → Bir sonraki aşama: premise', '')
  const anlamli4 = govde4.replace(/[*→✓#\s\-]/g, '').length
  if (anlamli4 < 15) {
    return { gecti: false, neden: 'genesis: §4 Seçilen Aday içeriği boş veya çok kısa' }
  }

  return { gecti: true }
}

// Kapı 2 — Premise
// Kriter: 4 checklist alanı (konu/tür · kitle · açı+kredibilite · transfer-vaadi) DOLU
export function kapiPremise(cikti) {
  const alanlar = [
    { ad: 'konu/tür', desen: /konu\s*\/\s*tür|kapı\s*1/i },
    { ad: 'kitle',    desen: /kitle|kapı\s*2/i },
    { ad: 'açı\+kredibilite', desen: /açı|kredibilite|kapı\s*3/i },
    { ad: 'transfer-vaadi',   desen: /transfer|vaat|kapı\s*4/i },
  ]
  // Her alan bölümünü bul; bölüm BOŞ mu kontrol et
  for (const alan of alanlar) {
    const eslesme = alan.desen.exec(cikti)
    if (!eslesme) return { gecti: false, neden: `premise eksik: ${alan.ad} bölümü bulunamadı` }
    // Bölüm başlığından sonraki içerik: bir sonraki ## / ### başlığına kadar
    const baslangic = eslesme.index + eslesme[0].length
    const sonrakiBaslik = cikti.indexOf('\n##', baslangic)
    const bolumIcerik = cikti.slice(baslangic, sonrakiBaslik > -1 ? sonrakiBaslik : undefined).trim()
    // İçerik sadece boşluk/yıldız/geçer işareti mi
    const anlamliIcerik = bolumIcerik.replace(/[*→✓#\s\-]/g, '').length
    if (anlamliIcerik < 15) {
      return { gecti: false, neden: `premise eksik: ${alan.ad} alanı boş veya çok kısa` }
    }
  }
  return { gecti: true }
}

// Kapı 3 — Araştırma
// Kriter: her sayı/figür kaynak-etiketi taşıyor ([doğrulanmış:*] / [eksik] / [tahmin*])
export function kapiArastirma(cikti) {
  if (ciplakSayiVarMi(cikti)) {
    return { gecti: false, neden: 'arastirma: etiketsiz çıplak sayı/figür tespit edildi; [doğrulanmış:kaynak] / [tahmin-doğrulanacak] / [eksik] gerekli' }
  }
  return { gecti: true }
}

// Kapı 4 — Strateji
// Kriter: araştırmada OLMAYAN yeni çıplak (kaynaksız) figür eklemiyor
export function kapiStrateji(cikti) {
  if (ciplakSayiVarMi(cikti)) {
    return { gecti: false, neden: 'strateji: araştırmada olmayan yeni kaynaksız figür/sayı eklendi' }
  }
  return { gecti: true }
}

// Kapı 5 — Master-plan
// Kriter: yeni kaynaksız figür eklemiyor
export function kapiMasterPlan(cikti) {
  if (ciplakSayiVarMi(cikti)) {
    return { gecti: false, neden: 'master-plan: yeni kaynaksız figür/sayı eklendi' }
  }
  return { gecti: true }
}

export const KAPILAR = {
  genesis:      kapiGenesis,
  premise:      kapiPremise,
  arastirma:    kapiArastirma,
  strateji:     kapiStrateji,
  'master-plan': kapiMasterPlan,
}

// Bir aşamanın EFEKTİF yapısal kapısı: aşamaya özgü kapı (KAPILAR) VE tüm-aşama
// etiketsiz-sayı kontrolü (ciplakSayiVarMi) BİRLİKTE. planlama loop'u koşum sırasında
// bu iki kontrolü uyguluyordu; artık TEK yer burası — hem ilk koşum-kapısı hem de
// onay anındaki YENİDEN-DOĞRULAMA aynı kriteri kullanır (kapı zayıflatılamaz).
// El-düzenlemesi sonrası dosya tekrar bu fonksiyondan geçirilir.
export function kapidanGecerMi(asama, icerik) {
  const kapi = KAPILAR[asama]
  if (!kapi) throw new Error(`Kapı tanımlı değil: ${asama}`)
  const kapiSonuc = kapi(icerik)
  if (!kapiSonuc.gecti) return { gecti: false, neden: kapiSonuc.neden }
  if (ciplakSayiVarMi(icerik)) {
    return { gecti: false, neden: `${asama}: etiketsiz çıplak sayı/figür tespit edildi` }
  }
  return { gecti: true }
}
