// Partner-inbox ↔ kanonik-inbox SEAM RECONCILE — İKİ-YAZAR KONTRATININ birleştirme yarısı.
// Partner cevapları git'e (partner-inbox/<projeId>.md) yazılır (bkz worker/worker.js
// inboxSatiri()); bu modül onları kanonik Drive inbox'una (projeler/<projeId>/inbox.md)
// PER-KART latest-wins ile birleştirir.
//
// KESİNLİKLE MANUEL/OPERATÖR-TETİKLEMELİ: bu modül HİÇBİR izleyici/daemon/başlangıç yoluna
// bağlanmaz — yalnız scripts/seam-reconcile.mjs CLI'sinden elle çağrılır. partner-inbox/
// ASLA otomatik izlenmez (bkz görev: "must NEVER be wired into a watcher or auto-run").
//
// Saf ayrıştırma/birleştirme mantığı (seamReconcileHesapla) I/O'dan TAMAMEN AYRI — dizeyle
// test edilebilir. I/O orkestrasyonu (seamReconcileCalistir) guvenliYaz'ın (canliYurutucu.mjs)
// yaz-doğrula-yeniden-dene güvenliğini YENİDEN KULLANIR: kanonik yazım DOĞRULANMADAN git
// ASLA temizlenmez (bkz görev: "no partner input lost" — yazım başarısız/kısmi olursa git
// dokunulmadan kalır).

import { readFileSync, existsSync } from 'fs'
import { guvenliYaz } from './canliYurutucu.mjs'

// worker/worker.js'nin inboxSatiri()'sinin ÜRETTİĞİ AYNI biçim (bkz worker.js `·`/`→` karakterleri
// BİREBİR bu ikisi — farklı bir orta-nokta/ok karakteri KULLANILMAZ):
//   [tarih] partner-cevap · proje:<id> · kart:<id> (<özet>)? → "<cevap>"
const GIT_SATIR_DESENI = /^\[(\d{4}-\d{2}-\d{2})\] partner-cevap · proje:([^\s·]+) · kart:([^\s(]+)(?:\s+\(([^)]*)\))?\s*→\s*"([\s\S]*)"\s*$/

// Kanonik dosyada HERHANGİ bir satırda `[tarih] ... kart:<id> ...` görülürse o kart için bir
// kayıt VAR sayılır — kanonik dosyanın geri kalanı (insan notları, E-kararları, ✓İŞLENDİ
// işaretleri vb.) BİLEREK ayrıştırılmaz/dokunulmaz, yalnız "bu kart için en son tarih ne"
// sorusuna cevap aranır (bkz gerçek projeler/baris/inbox.md — zengin serbest-metin notlar taşır).
const KANONIK_KART_TARIH_DESENI = /^\[(\d{4}-\d{2}-\d{2})\].*?\bkart:([a-zA-Z0-9_-]+)\b/

export function gitSatirlariAyristir(icerik) {
  const satirlar = String(icerik ?? '').split('\n')
  const sonuc = []
  satirlar.forEach((satir, i) => {
    const m = GIT_SATIR_DESENI.exec(satir)
    if (!m) return
    sonuc.push({
      satirNo: i, hamSatir: satir,
      tarih: m[1], projeId: m[2], kartId: m[3], ozet: m[4] ?? '', cevap: m[5],
    })
  })
  return sonuc
}

export function kanonikKartTarihleriCikar(icerik) {
  const harita = new Map()
  for (const satir of String(icerik ?? '').split('\n')) {
    const m = KANONIK_KART_TARIH_DESENI.exec(satir)
    if (!m) continue
    const [, tarih, kartId] = m
    const mevcut = harita.get(kartId)
    if (!mevcut || tarih > mevcut) harita.set(kartId, tarih)
  }
  return harita
}

function kanonikSatirUret({ tarih, kartId, ozet, cevap }) {
  const ozetKisa = ozet ? ` (${ozet})` : ''
  return `[${tarih}] partner-cevap · kart:${kartId}${ozetKisa} → "${cevap}"`
}

/**
 * SAF birleştirme hesabı — hiçbir dosyaya dokunmaz, yalnız iki içerik dizesi alır.
 * Latest-wins PER-KART (tüm dosya değil): her kart için git'teki EN SON (max-tarih) satır,
 * kanonikteki o kart için bilinen EN SON tarihle kıyaslanır.
 *   - git tarihi kanonikten KESİNLİKLE daha yeniyse (>) → birleştirilir (kanoniğe eklenir,
 *     git'ten o kartın TÜM satırları temizlenir — aynı kartın eski git-içi tekrarları dahil).
 *   - EŞİTSE veya kanonik daha yeniyse/kanonikte hiç yoksa DEĞİLSE (yani git ≤ kanonik) →
 *     ATLANIR (kanonik KORUNUR, git'teki o kartın satırlarına DOKUNULMAZ). EŞİTLİK BİLEREK
 *     kanoniğe düşer: "hangisi daha yeni" belirsizse, operatörün kanonikte olabilecek elle
 *     düzenlemesini asla ezmemek güvenli varsayılandır (bkz görev: "a manual operator edit
 *     of the canonical inbox must win").
 */
export function seamReconcileHesapla({ gitIcerik, kanonikIcerik, calistirmaZamaniIso }) {
  const gitSatirlari = gitSatirlariAyristir(gitIcerik)
  const kanonikTarihler = kanonikKartTarihleriCikar(kanonikIcerik)

  // Her kart için git'in KENDİ en-son (max-tarih) satırı.
  const gitEnSon = new Map()
  for (const s of gitSatirlari) {
    const mevcut = gitEnSon.get(s.kartId)
    if (!mevcut || s.tarih > mevcut.tarih) gitEnSon.set(s.kartId, s)
  }

  const birlestirilecekler = []
  const atlananlar = []
  for (const [kartId, gitKaydi] of gitEnSon) {
    const kanonikTarih = kanonikTarihler.get(kartId)
    if (!kanonikTarih || gitKaydi.tarih > kanonikTarih) {
      birlestirilecekler.push(gitKaydi)
    } else {
      atlananlar.push({ kartId, gitTarih: gitKaydi.tarih, kanonikTarih })
    }
  }

  const birlesecekKartIdSeti = new Set(birlestirilecekler.map(k => k.kartId))
  const yeniGitIcerik = String(gitIcerik ?? '').split('\n')
    .filter((_, i) => {
      const eslesme = gitSatirlari.find(s => s.satirNo === i)
      return !eslesme || !birlesecekKartIdSeti.has(eslesme.kartId)
    })
    .join('\n')

  let kanonikEkMetni = null
  if (birlestirilecekler.length > 0) {
    const damga = calistirmaZamaniIso ?? new Date().toISOString().slice(0, 16).replace('T', ' ')
    const satirlar = [`<!-- SEAM-RECONCILE (otomatik) — ${damga} — partner-inbox/'ten birleştirildi -->`]
    for (const k of birlestirilecekler.sort((a, b) => a.kartId.localeCompare(b.kartId))) {
      satirlar.push(kanonikSatirUret(k))
    }
    kanonikEkMetni = satirlar.join('\n') + '\n'
  }

  return {
    degisiklikVar: birlestirilecekler.length > 0,
    birlestirilecekler,
    atlananlar,
    yeniGitIcerik,
    kanonikEkMetni,
  }
}

function kanonikBaslikUret(projeId) {
  return [
    `# ${projeId} — Inbox`,
    '',
    '> Format: [tarih] partner-cevap · kart:<id> (<özet>) → "<cevap>"',
    '> scripts/seam-reconcile.mjs bu dosyayı partner-inbox/<proje>.md ile otomatik birleştirir.',
    '',
  ].join('\n')
}

/**
 * I/O orkestrasyonu — GERÇEK dosyalarla (veya test'te geçici dizinlerle) çalışır.
 * Sıra KESİN: (1) oku, (2) hesapla, (3) değişiklik yoksa NO-OP dön, (4) kanoniğe YAZ+DOĞRULA
 * (guvenliYaz — başarısız/kısmi olursa BURADA fırlatır, ADIM 5'E ASLA ULAŞILMAZ), (5) YALNIZ
 * kanonik yazım doğrulandıktan SONRA git'i (filtrelenmiş hâliyle) yaz.
 *
 * @param {{
 *   projeId: string,
 *   partnerInboxYol: string, partnerInboxKokYolu: string,
 *   kanonikInboxYol: string, kanonikKokYolu: string,
 *   guvenliYazOpts?: object, // test fault-injection (_writeFileSync/_readFileSync/vb.) için
 *   calistirmaZamaniIso?: string,
 * }} args
 */
export function seamReconcileCalistir({
  projeId, partnerInboxYol, partnerInboxKokYolu, kanonikInboxYol, kanonikKokYolu,
  guvenliYazOpts = {}, calistirmaZamaniIso,
}) {
  if (!existsSync(partnerInboxYol)) {
    return { degisti: false, neden: `partner-inbox bulunamadı: ${partnerInboxYol}`, birlestirilenler: [], atlananlar: [] }
  }
  // Proje dizini GERÇEKTEN var olmalı — guvenliYaz mkdirSync(...,{recursive:true}) yapar, bu
  // kontrol OLMASA bir yazım-hatası projeId'si Drive'da SESSİZCE yeni/sahte bir proje dizini
  // oluştururdu (yalnız bir inbox.md ile). Var-olan bir projeye YALNIZ birleştirme yapılır.
  if (!existsSync(kanonikKokYolu)) {
    return {
      degisti: false,
      neden: `proje dizini bulunamadı: ${kanonikKokYolu} (yazım hatası olabilir — yeni proje dizini burada OLUŞTURULMAZ)`,
      birlestirilenler: [], atlananlar: [],
    }
  }
  const gitIcerik = readFileSync(partnerInboxYol, 'utf8')
  const kanonikIcerik = existsSync(kanonikInboxYol) ? readFileSync(kanonikInboxYol, 'utf8') : null

  const hesap = seamReconcileHesapla({
    gitIcerik, kanonikIcerik: kanonikIcerik ?? '', calistirmaZamaniIso,
  })

  if (!hesap.degisiklikVar) {
    return {
      degisti: false, neden: 'birleştirilecek yeni/daha-yeni cevap yok (idempotent no-op)',
      birlestirilenler: [], atlananlar: hesap.atlananlar,
    }
  }

  const kanonikTemelIcerik = kanonikIcerik ?? kanonikBaslikUret(projeId)
  const yeniKanonikIcerik = kanonikTemelIcerik.replace(/\s*$/, '') + '\n\n' + hesap.kanonikEkMetni

  // (4) Kanonik YAZ + DOĞRULA — guvenliYaz tüm denemeler tükenirse FIRLATIR; bu durumda
  // fonksiyon burada SONA ERER, git'e HİÇ dokunulmaz (bkz görev: "no partner input lost").
  guvenliYaz(kanonikInboxYol, yeniKanonikIcerik, kanonikKokYolu, guvenliYazOpts)

  // (5) Kanonik yazım DOĞRULANDIKTAN SONRA git'i (birleştirilenler temizlenmiş hâliyle) yaz.
  guvenliYaz(partnerInboxYol, hesap.yeniGitIcerik, partnerInboxKokYolu, guvenliYazOpts)

  return {
    degisti: true,
    birlestirilenler: hesap.birlestirilecekler.map(k => ({ kartId: k.kartId, tarih: k.tarih, cevap: k.cevap })),
    atlananlar: hesap.atlananlar,
    kanonikInboxYol, partnerInboxYol,
  }
}
