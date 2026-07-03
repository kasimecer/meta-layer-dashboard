// Master-plan BÖLÜM KAPILARI. Sözleşme planlamaKapilari.mjs'deki kapidanGecerMi ile AYNI:
// (bolumId, icerik) => {gecti, neden?} — YALNIZ provenans-ek'in kapısı ek bir `baglam` parametresi
// alır (kapsam/coverage kontrolü için — bkz aşağı). Diğer 14 bölüm için `baglam` YOK SAYILIR.
//
// planlamaKapilari.mjs'e HİÇ DOKUNULMAZ — genesis/premise/arastirma/strateji'nin gerçek kapıları
// bu dosyadan tamamen bağımsız kalır.

import { ciplakSayiVarMi } from './planlamaKapilari.mjs'
import { BOLUM_TANIMLARI } from './planlamaBolumTanimlari.mjs'
import {
  bolumIcerikGovdesiKontrolEt, iddialariCikar, iddiaEtiketVarMi, kaynakGercekMi,
} from './planlamaIddiaDurumu.mjs'

// ── Bölüme-özgü ek kontroller (registry'de string-anahtarla referans edilir — döngüsel import yok) ──

// Bölüm 9 (dijital-varlik-spec) — no-build sınırı. DÜRÜST SINIR: bu mekanik bir güvenlik-ağıdır
// (bariz inşa-artefaktı imzalarını yakalar), İHLAL-İMKANSIZLIĞININ KANITI DEĞİLDİR. Asıl sınır
// prompt'un "SPEC ONLY" talimatı + bu bölümün kendi onay adımındaki insan incelemesidir.
const INSA_ARTEFAKTI_DESENLERI = [
  /<!DOCTYPE/i,
  /<html[\s>]/i,
  /<\/html>/i,
  /\bimport\s+[\w{},*\s]+\s+from\s+['"]/,
  /\bexport\s+default\s+function\b/,
  /```(?:html|jsx|tsx|json|css)\b[\s\S]*?```/i,
  /\bpackage\.json\b/i,
  /\bnpm (?:install|run)\b/i,
]

function dijitalVarlikInsaDenylist(bolumId, icerik) {
  for (const desen of INSA_ARTEFAKTI_DESENLERI) {
    if (desen.test(icerik)) {
      return {
        gecti: false,
        neden: `${bolumId}: inşa-edilmiş varlık izi tespit edildi (${desen}) — bu bölüm YALNIZ ` +
               `SPEC'tir, hiçbir şey İNŞA EDİLMEZ (mekanik güvenlik-ağı; tam kanıt değildir)`,
      }
    }
  }
  return { gecti: true }
}

const EK_KONTROLLER = { dijitalVarlikInsaDenylist }

// ── Provenans-eki kapısı (mekanik — kapsam/coverage kontrolü, satır-etiket kuralı DEĞİL) ──
// baglam.tumIddialar: {tip,param}[] (13 asıl bölümden iddialariCikar ile toplanmış)
// baglam.tumAtlananlar: {anahtar}[] (tüm soru paketlerinden atlananlar)
function provenansKapisi(icerik, baglam) {
  if (!baglam || !Array.isArray(baglam.tumIddialar)) {
    return (icerik && icerik.trim().length > 20)
      ? { gecti: true }
      : { gecti: false, neden: 'provenans-ek: içerik boş/çok kısa' }
  }
  const eksikler = []
  for (const iddia of baglam.tumIddialar) {
    if (iddia.param && !icerik.includes(iddia.param)) eksikler.push(`${iddia.tip}:${iddia.param}`)
  }
  for (const atlanan of (baglam.tumAtlananlar ?? [])) {
    const anahtar = atlanan.anahtar
    if (anahtar && !icerik.includes(anahtar)) eksikler.push(`atlanan:${anahtar}`)
  }
  if (eksikler.length > 0) {
    return { gecti: false, neden: `provenans-ek: ${eksikler.length} referans eksik (örn: ${eksikler.slice(0, 5).join(', ')})` }
  }
  return { gecti: true }
}

// ── Ana kapı fonksiyonu ──────────────────────────────────────────────────────
export function bolumKapidanGecerMi(bolumId, icerik, baglam = null) {
  const tanim = BOLUM_TANIMLARI[bolumId]
  if (!tanim) throw new Error(`Bölüm tanımı yok: ${bolumId}`)

  if (tanim.mekanik) return provenansKapisi(icerik, baglam)

  if (tanim.iddiaMuaf) {
    // TERS kural (yalnız ozet-yonetici): SIFIR yeni iddia-etiketi VE sıfır çıplak sayı.
    if (iddiaEtiketVarMi(icerik)) {
      return { gecti: false, neden: `${bolumId}: özet bölümü YENİ iddia etiketi taşıyamaz (yalnız sentez; kaynak yeniden-belirtilmez)` }
    }
    if (ciplakSayiVarMi(icerik)) {
      return { gecti: false, neden: `${bolumId}: özet bölümünde çıplak sayı — yeniden-ifade edilmiş figür bile YASAK, nitel sentez kullan` }
    }
    return { gecti: true }
  }

  const govde = bolumIcerikGovdesiKontrolEt(icerik, { iddiaMuaf: false })
  if (!govde.gecti) return govde

  // GROUNDING: HAM (metinde yazılı) her [dogrulandi:kaynak] iddiası — kaynak GERÇEKTEN
  // araştırma aşamasında doğrulanmış mı (baglam.gercekKaynaklar)? Bir kaynak ADI yazmak TEK
  // BAŞINA yeterli DEĞİL; uydurma/izlenemez kaynak burada REDDEDİLİR — "damga kaynak yerine
  // geçmez". baglam sağlanmadıysa (ör. baglamsız doğrudan-çağrı testleri) kontrolsüz geçilir
  // (bkz kaynakGercekMi). Sınıf farkı gözetmeden HER bölümde uygulanır — görev metni bunu
  // "kaynak-gerekli bölümlerde" istiyordu ama sahte bir "doğrulanmış" iddia hangi bölümde
  // olursa olsun sorunludur; kısıtlamak ek karmaşıklık getirirdi, genişletmek getirmedi.
  const iddialarHam = iddialariCikar(icerik)
  for (const i of iddialarHam) {
    if (i.tip === 'dogrulandi' && !kaynakGercekMi(i.param, baglam?.gercekKaynaklar)) {
      return {
        gecti: false,
        neden: `${bolumId}: "[dogrulandi:${i.param}]" (satır ${i.satirNo}) araştırma aşamasında ` +
               `doğrulanmış bir kaynak DEĞİL — uydurma/izlenemez kaynak kabul edilmez. Gerçek ` +
               `kaynağı araştırmaya [doğrulanmış:...] olarak ekleyin, ya da bu iddiayı ` +
               `[acik-soru:...] işaretleyip DATA-REQUEST üzerinden çözün.`,
      }
    }
  }

  // minDogrulandi/sifirAcikGerekli EFEKTİF statüyle sayılır (baglam.efektifIddialar
  // verilmişse) — yanıtlanmış bir acik-soru (karar=veri/tahmin) artık HAM etiket ne olursa
  // olsun doğrulanmış/tahmin sayılır; baglam yoksa (ör. doğrudan-çağrı testleri) HAM sayıma düşer.
  const iddialar = baglam?.efektifIddialar ?? iddialarHam
  const efektifTipOf = (i) => i.efektifTip ?? i.tip

  if (tanim.minDogrulandi > 0) {
    const n = iddialar.filter(i => efektifTipOf(i) === 'dogrulandi').length
    if (n < tanim.minDogrulandi) {
      return { gecti: false, neden: `${bolumId}: yeterli doğrulanmış iddia yok (bulunan: ${n}, gereken: ≥${tanim.minDogrulandi})` }
    }
  }

  if (tanim.sifirAcikGerekli) {
    const acikSayisi = iddialar.filter(i => efektifTipOf(i) === 'acik-soru').length
    if (acikSayisi > 0) {
      return { gecti: false, neden: `${bolumId}: bu bölüm yerel sıfır-açık şartı taşıyor ama ${acikSayisi} açık-soru etiketi var` }
    }
  }

  if (tanim.ekKontrol) {
    const fn = EK_KONTROLLER[tanim.ekKontrol]
    if (fn) {
      const ek = fn(bolumId, icerik)
      if (!ek.gecti) return ek
    }
  }

  return { gecti: true }
}

// API-simetrisi: planlamaKapilari.mjs'deki KAPILAR ile aynı şekil — bare (icerik,baglam)=>sonuç
// fonksiyonları, id'ye göre. bolumKapidanGecerMi ana giriş noktasıdır; bu, doğrudan bir bölümün
// kapısına referans vermek isteyen testler/tüketiciler için ince bir kolaylık.
export const BOLUM_KAPILARI = Object.fromEntries(
  Object.keys(BOLUM_TANIMLARI).map(id => [id, (icerik, baglam) => bolumKapidanGecerMi(id, icerik, baglam)])
)
