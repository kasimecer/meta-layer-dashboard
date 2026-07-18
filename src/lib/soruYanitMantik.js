// meta-layer-core — SoruYanitView.jsx'in saf/framework-bağımsız mantığı. Bileşen .jsx içinde
// (JSX sözdizimi taşıdığı için düz `node` ile import edilemez) kalır; test edilebilirlik için
// PUR mantık burada, düz .js'de yaşar — hem tarayıcı hem Node (hermetik test) import edebilir.
// 2026-07-18 (Priority 4d) — "hazır" sayacının payda hesabı burada, tek yerde.

// 2026-07-18 (kart-okunabilirlik turu) — dataRequestAdaylari'nin çıkardığı `iddia` metni, tag'in
// bulunduğu belge cümlesinden geldiği için İÇİNDE HÂLÂ o tag'i taşır (ör. "...dijital albüm
// seçeneğine [tahmin-doğrulanacak:operatör-onaylı] yükseltilebilir") — bu, BELGE için doğru
// (kaynak-provenansı orada anlamlı), ama OPERATÖR-YÜZÜ kartlar için gürültü/kafa karıştırıcı bir
// iç uygulama detayı. `\]?` KASITLI: bazı gerçek kayıtlarda tag, cümle/hücre sınırı tam kapanış
// parantezinden ÖNCE kesildiği için kapanmadan bitiyor (ör. "...[tahmin-doğrulanacak:saha-
// gözlemi" — kapanış "]" hiç yok); bu YARIM etiketler de temizlenmeli, yoksa operatöre çıplak
// bir "[tahmin-doğrulanacak:..." parçası görünür.
const IC_ETIKET_DESENI = /\[(?:doğrulanmış|tahmin-doğrulanacak|eksik|metadata|operator-beyan|dogrulandi|operator-onayli-tahmin|acik-soru|tier|tip|ortak|canlı)[^\]]*\]?/gi

// Operatöre gösterilecek herhangi bir metinden iç/belge-amaçlı etiketleri temizler — belgeler
// bunları TAŞIMAYA DEVAM EDER (bu fonksiyon yalnız GÖRÜNTÜLEME içindir, `soru.iddia`'nın
// KENDİSİNİ/kalıcı veriyi DEĞİŞTİRMEZ — dataRequestAdaylari'nin ürettiği ham alan model-tüketimi
// için tag'i taşımaya devam eder, bkz tools/canliExecutor.mjs:yanitlarMetni).
export function icEtiketleriTemizle(metin) {
  return String(metin ?? '')
    .replace(IC_ETIKET_DESENI, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
}

export function hazirMi(soru, deger) {
  if (!deger) return false
  if (deger.atlandi) return true
  if (soru.tip === 'CHOICE') return !!deger.secim
  if (soru.tip === 'DATA-REQUEST') {
    if (!deger.karar) return false
    if (deger.karar === 'veri') return !!(deger.deger && deger.deger.trim())
    return true
  }
  if (soru.tip === 'FREE-TEXT') return !!(deger.metin && deger.metin.trim())
  return false
}

export function yanitKaydiUret(soru, deger) {
  if (deger.atlandi) return { anahtar: soru.anahtar, atlandi: true, gerekce: deger.gerekce || null }
  if (soru.tip === 'CHOICE') return { anahtar: soru.anahtar, secim: deger.secim }
  if (soru.tip === 'DATA-REQUEST') {
    const e = { anahtar: soru.anahtar, karar: deger.karar }
    if (deger.karar === 'veri') {
      e.deger = deger.deger.trim()
      if (deger.kaynak?.trim()) e.kaynak = deger.kaynak.trim()
    }
    return e
  }
  return { anahtar: soru.anahtar, metin: deger.metin.trim() }
}

// 2026-07-18 (Priority 4d) — eskiden TEK bir sayaç vardı ve paydası TÜM açık soruları (blocker +
// onemli + opsiyonel karışık) içeriyordu; operatör tüm ZORUNLU (blocker) kartları yanıtlasa bile
// sayaç "tam" görünmüyordu (opsiyonel/önemli kartlar hâlâ payda'daydı). Bu fonksiyon zorunlu-
// tamlığı TOPLAM'dan AYRI, açıkça hesaplar.
export function hazirDurumuHesapla(acikSorular, taslaklar) {
  const liste = acikSorular ?? []
  const hazirSayisi = liste.filter(s => hazirMi(s, taslaklar[s.anahtar])).length
  const blockerSorular = liste.filter(s => s.tier === 'blocker')
  const blockerHazirSayisi = blockerSorular.filter(s => hazirMi(s, taslaklar[s.anahtar])).length
  const blockerTamam = blockerSorular.length === 0 || blockerHazirSayisi === blockerSorular.length
  return { hazirSayisi, toplam: liste.length, blockerHazirSayisi, blockerToplam: blockerSorular.length, blockerTamam }
}

// 2026-07-18 (Priority 4c) — blocker-tier bir kart ASLA atlanamaz (tools/planlamaSorular.mjs:
// atlaYaz + scripts/soru-yanit-queue-watch.mjs:gonderimiIsle ikisi de reddeder) — UI bu eylemi
// hiç SUNMAMALI.
export function atlanabilirMi(soru) {
  return soru.tip !== 'APPROVAL' && soru.tier !== 'blocker'
}
