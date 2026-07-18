// meta-layer-core — Görev 2(b)/(c): sunum-kırpılmış cevapların EK-SADECE ("append-only") yerini-
// alma mekanizması.
//
// SORUN: 201 iddia alanı operatöre 240 karakirde KIRPILMIŞ hâlde gösterildi ve operatör o hâliyle
// cevapladı. Metni ŞİMDİ düzeltmek KABUL EDİLEMEZ (operatör kırpılmış metne rıza gösterdi, o rıza
// o metne aittir — sessizce değiştirmek o rızayı GEÇERSİZ kılar). Metni OLDUĞU GİBİ bırakmak da
// KABUL EDİLEMEZ (kayıt sağlam görünür ama değildir — okuyan biri kırpıldığını bilemez).
//
// ÇÖZÜM: orijinal soru/cevap ASLA değiştirilmez/silinmez. Bu modül TAMAMEN AYRI, EK-SADECE bir
// defter tutar (`<asama>-yerini-alma-defteri[-vN].json`) — orijinal `<asama>-sorular*.json` ve
// `<asama>-yanitlar*.json` dosyalarına BU MODÜL HİÇ YAZMAZ (yalnız OKUR, doğrulama için). Defter:
//   1) hangi eski anahtarın SUNUM-KIRPILMIŞ olarak işaretlendiğini,
//   2) (varsa) o iddia için TAM metinli YENİ bir sorunun anahtarını,
//   3) (varsa) o yeni soruya verilen YENİ cevabı — eskisinin YERİNİ downstream-tüketim için alan,
//      ama eskisini SİLMEYEN/DEĞİŞTİRMEYEN —
// sırayla, EKLEMELİ kayıtlar hâlinde tutar. Eski kayıt HER ZAMAN görünür kalır.
//
// BU TURDA (Görev 2c): mekanizma + testleri var. Gerçek proje verisine karşı SIFIR çağrı yapıldı
// — hiçbir yeni soru üretilmedi/yayınlanmadı (bkz kanal raporu).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { yanitlandiMi } from './planlamaSorular.mjs'

export const YERINI_ALMA_SEMA = 1
export const YERINI_ALMA_DURUMLARI = Object.freeze(['isaretlendi', 'yeni-soru-bagli', 'ustunlendi'])

export function yerinAlmaDosyaAdi(asama, surum) {
  return (surum ?? 0) <= 1 ? `${asama}-yerini-alma-defteri.json` : `${asama}-yerini-alma-defteri-v${surum}.json`
}

function defterOku(nsYolu, asama, surum) {
  const yol = join(nsYolu, yerinAlmaDosyaAdi(asama, surum))
  if (!existsSync(yol)) {
    return { sema: YERINI_ALMA_SEMA, asama, surum, kayitlar: [] }
  }
  const d = JSON.parse(readFileSync(yol, 'utf8'))
  if (d.sema !== YERINI_ALMA_SEMA) throw new Error(`yerinAlma defteri şema uyuşmazlığı: ${yol}`)
  return d
}

function defterYaz(nsYolu, asama, surum, defter) {
  const yol = join(nsYolu, yerinAlmaDosyaAdi(asama, surum))
  mkdirSync(dirname(yol), { recursive: true })
  writeFileSync(yol, JSON.stringify(defter, null, 2) + '\n', 'utf8')
  return yol
}

function kayitBul(defter, eskiAnahtar) {
  return defter.kayitlar.find(k => k.eski_anahtar === eskiAnahtar) ?? null
}

// 1) SUNUM-KIRPILMIŞ işaretle — YALNIZ gerçekten CEVAPLANMIŞ bir soru için geçerli (task'ın
// kapsamı budur: "the operator consented to the text as it stood" — cevapsız bir soru için bu
// işaretin bir anlamı yok, o zaten normal onarım yoluyla düzeltilebilir, bkz Görev 2 önceki tur).
// Idempotent: aynı eskiAnahtar için ikinci çağrı YENİ bir kayıt EKLEMEZ, mevcut kaydı döner.
export function sunumKirpilmisIsaretle(nsYolu, asama, surum, eskiAnahtar, paket, yanitlar) {
  const soru = [...(paket.sorular ?? []), ...(paket.ertelenen ?? [])].find(s => s.anahtar === eskiAnahtar)
  if (!soru) throw new Error(`sunumKirpilmisIsaretle: "${eskiAnahtar}" bu soru setinde yok`)
  const yanit = (yanitlar ?? []).find(e => e.anahtar === eskiAnahtar)
  if (!yanitlandiMi(soru, yanit)) {
    throw new Error(`sunumKirpilmisIsaretle: "${eskiAnahtar}" CEVAPLANMAMIŞ — bu mekanizma yalnız zaten cevaplanmış, sunumu kırpılmış kayıtlar içindir (cevapsız bir kayıt normal onarım yoluyla düzeltilir, bu deftere girmez)`)
  }
  const defter = defterOku(nsYolu, asama, surum)
  const mevcut = kayitBul(defter, eskiAnahtar)
  if (mevcut) return { defter, kayit: mevcut, yeniMi: false }
  const kayit = {
    eski_anahtar: eskiAnahtar,
    sunum_kirpilmis: true,
    isaretleme_zamani: new Date().toISOString(),
    yeni_soru_anahtari: null,
    yeni_yanit: null,
    durum: 'isaretlendi',
  }
  defter.kayitlar.push(kayit)
  defterYaz(nsYolu, asama, surum, defter)
  return { defter, kayit, yeniMi: true }
}

// 2) Tam-metinli YENİ bir soru üretildiğinde (bu turda YAPILMADI — yalnız API), o sorunun
// anahtarını eski kayda BAĞLAR. Yeni soruyu ÜRETMEZ/YAYINLAMAZ — çağıranın SORUMLULUĞUNDADIR
// (kasıtlı ayrım: "Implement the mechanism... Do NOT generate or emit any new question yet").
export function yeniSoruBagla(nsYolu, asama, surum, eskiAnahtar, yeniSoruAnahtari) {
  if (!yeniSoruAnahtari || !String(yeniSoruAnahtari).trim()) {
    throw new Error('yeniSoruBagla: yeniSoruAnahtari zorunlu')
  }
  const defter = defterOku(nsYolu, asama, surum)
  const kayit = kayitBul(defter, eskiAnahtar)
  if (!kayit) throw new Error(`yeniSoruBagla: "${eskiAnahtar}" önce sunumKirpilmisIsaretle ile işaretlenmeli`)
  if (kayit.durum !== 'isaretlendi') {
    throw new Error(`yeniSoruBagla: "${eskiAnahtar}" beklenmeyen durumda ("${kayit.durum}", beklenen "isaretlendi") — sıra dışı çağrı`)
  }
  kayit.yeni_soru_anahtari = yeniSoruAnahtari
  kayit.durum = 'yeni-soru-bagli'
  kayit.baglama_zamani = new Date().toISOString()
  defterYaz(nsYolu, asama, surum, defter)
  return { defter, kayit }
}

// 3) YENİ cevap eskisinin YERİNİ ALIR (downstream-tüketim için) — eskisi SİLİNMEZ/DEĞİŞTİRİLMEZ,
// yalnız defterde AYRICA görünür kalır (bkz guncelYanitGetir).
export function yeniYanitiUstunle(nsYolu, asama, surum, eskiAnahtar, yeniYanitKaydi) {
  if (!yeniYanitKaydi || typeof yeniYanitKaydi !== 'object') {
    throw new Error('yeniYanitiUstunle: yeniYanitKaydi zorunlu (nesne)')
  }
  const defter = defterOku(nsYolu, asama, surum)
  const kayit = kayitBul(defter, eskiAnahtar)
  if (!kayit) throw new Error(`yeniYanitiUstunle: "${eskiAnahtar}" önce sunumKirpilmisIsaretle ile işaretlenmeli`)
  if (kayit.durum !== 'yeni-soru-bagli') {
    throw new Error(`yeniYanitiUstunle: "${eskiAnahtar}" beklenmeyen durumda ("${kayit.durum}", beklenen "yeni-soru-bagli") — önce yeniSoruBagla çağrılmalı`)
  }
  kayit.yeni_yanit = { ...yeniYanitKaydi, damga: yeniYanitKaydi.damga ?? new Date().toISOString() }
  kayit.durum = 'ustunlendi'
  kayit.ustunleme_zamani = new Date().toISOString()
  defterYaz(nsYolu, asama, surum, defter)
  return { defter, kayit }
}

// OKUMA-tarafı: bir anahtarın GÜNCEL (downstream-tüketime uygun) cevabını döner — defterde
// 'ustunlendi' durumunda bir kayıt varsa YENİ cevabı, yoksa orijinal `yanitlar.json`'daki cevabı
// (DEĞİŞMEDEN) döner. Orijinal cevap HİÇBİR ZAMAN silinmiş/değiştirilmiş SAYILMAZ — yalnız hangisi
// "güncel" kabul edileceği burada kararlaştırılır.
export function guncelYanitGetir(nsYolu, asama, surum, anahtar, orijinalYanitlar) {
  const orijinal = (orijinalYanitlar ?? []).find(e => e.anahtar === anahtar) ?? null
  const defter = defterOku(nsYolu, asama, surum)
  const kayit = kayitBul(defter, anahtar)
  if (kayit?.durum === 'ustunlendi') {
    return { kaynak: 'ustunlenmis', yanit: kayit.yeni_yanit, orijinal, sunum_kirpilmis: true }
  }
  return { kaynak: 'orijinal', yanit: orijinal, orijinal, sunum_kirpilmis: kayit?.sunum_kirpilmis ?? false }
}

// Bir asama/sürüm için TÜM sunum-kırpılmış kayıtları döner (raporlama/envanter için) — defter
// yoksa boş dizi (çökmez).
export function sunumKirpilmisKayitlariListele(nsYolu, asama, surum) {
  const defter = defterOku(nsYolu, asama, surum)
  return defter.kayitlar
}
