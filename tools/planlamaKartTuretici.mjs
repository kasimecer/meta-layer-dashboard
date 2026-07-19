// meta-layer-core — Planlama kart + doküman TÜRETİCİ (deterministik, salt-okuma, MODELSİZ).
//
// SÖZLEŞME: bu modül HİÇBİR pipeline durumunu/kapısını DEĞİŞTİRMEZ, hiçbir dosyaya YAZMAZ.
// Yalnız planlama-durum.json (zaten stateYukle ile okunmuş `state`) + gerçek aşama çıktı
// dosyalarından (cikti_pointer) + sorular/yanıtlar artefaktlarından operatör-görünür kart ve
// doküman-pointer listeleri TÜRETİR. Elle bakımlı signal.json/cards-<id>.json'ın yerini alır:
// "gerçek" = state.asamalar[X].durum === 'gecti' VE cikti_pointer diskte GERÇEKTEN var olan
// her şey; başka HİÇBİR şey (durmuş/bekleyen aşama için kart ÜRETİLMEZ — negatif-vaka kapısı).
//
// KART ŞEMASI: src/lib/stateMachine.js'teki v1 şemaya birebir uyar (tip/durum/AKIS) — yeni
// tip/durum İCAT EDİLMEZ. 'ilerleme' (aşama tamamlandı) + 'girdi-talebi'/cevaplandi (E'nin
// "karar:*" anahtarlı sorulara verdiği gerçek yanıt — bugün yalnız elestiri, ama JENERİK: hangi
// aşamada "karar:" önekli bir CHOICE sorusu + geçerli yanıtı varsa otomatik yakalanır).

import { existsSync, statSync, readFileSync } from 'fs'
import { basename } from 'path'
import { sorulariOku, yanitlariHamOku, tumAdaylar, yanitlandiMi } from './planlamaSorular.mjs'
import { GERCEK_ASAMALAR, birimStateOf } from './planlamaDurumMakinesiV2.mjs'

export const ASAMA_ETIKET = {
  genesis: 'Genesis',
  premise: 'Premise',
  arastirma: 'Araştırma',
  strateji: 'Strateji',
  'master-plan': 'Master-Plan',
  elestiri: 'Kritik Pasaj',
}

// Mutlak Drive yolunu tıklanabilir file:// URL'ye çevirir. Dosya diskte YOKSA null (kart/
// doküman-pointer bu sinyali "üretme" kararı için kullanır — kırık link ASLA yayınlanmaz).
export function dosyaHref(mutlakYol) {
  if (!mutlakYol || typeof mutlakYol !== 'string' || !existsSync(mutlakYol)) return null
  return 'file://' + encodeURI(mutlakYol)
}

function gercekZamanDamgasi(mutlakYol, yedek) {
  try { return statSync(mutlakYol).mtime.toISOString() } catch { return yedek }
}

// Dosya İÇERİĞİNİ build-time'da okur (deploy çıktısı .md TAŞIMAZ — yalnız META_DATA_ROOT'ta
// yaşarlar; bkz meta-kanal.md 2026-07-16 12:19/16:35 recon kayıtları). dosyaHref ile AYNI
// negatif-vaka disiplini: dosya yoksa/okunamazsa null (çökme YOK, kırık girdi YOK).
function dosyaIcerigiOku(mutlakYol) {
  if (!mutlakYol || typeof mutlakYol !== 'string' || !existsSync(mutlakYol)) return null
  try { return readFileSync(mutlakYol, 'utf8') } catch { return null }
}

// Bir aşamanın 'ilerleme' kartı — yalnız GERÇEKTEN geçmiş (durum:gecti) VE çıktı dosyası
// diskte GERÇEKTEN var olan aşamalar için. Aksi halde null (sahte kart YOK).
export function asamaKartiUret(projeId, asama, asamaState) {
  if (!asamaState || asamaState.durum !== 'gecti') return null
  const href = dosyaHref(asamaState.cikti_pointer)
  if (!href) return null // 'gecti' ama dosya diskte yok → üretme (bkz negatif-vaka)

  const dosyaAdi = basename(asamaState.cikti_pointer)
  const etiket = ASAMA_ETIKET[asama] ?? asama
  let detay = `[${dosyaAdi}](${href})`
  if ((asamaState.surum ?? 0) > 1) detay += `\n\nSürüm: v${asamaState.surum}`

  if (asama === 'master-plan' && asamaState.bolumler) {
    const satirlar = Object.entries(asamaState.bolumler)
      .filter(([, b]) => b?.durum === 'gecti' && dosyaHref(b.cikti_pointer))
      .map(([bolumId, b]) => `- [${bolumId}](${dosyaHref(b.cikti_pointer)})`)
    if (satirlar.length) detay += `\n\n**Bölümler:**\n${satirlar.join('\n')}`
  }

  const damga = gercekZamanDamgasi(asamaState.cikti_pointer, new Date().toISOString())
  return {
    id: `${projeId}-asama-${asama}`,
    tip: 'ilerleme',
    durum: 'bitti',
    ozet: `${etiket} tamamlandı — ${dosyaAdi}`,
    detay,
    partner_cevap: null,
    olusturma: damga,
    guncelleme: damga,
  }
}

// Bir aşamanın E-kararı kartı: o aşamanın sorular paketinde "karar:" önekli bir CHOICE
// sorusu VE gerçek/geçerli bir yanıtı varsa. JENERİK — "elestiri" hardcode edilmez; bugün
// yalnız elestiri böyle bir soru taşıdığı için pratikte oradan gelir, ama başka bir aşama
// yarın "karar:X" eklerse otomatik yakalanır. Yanıtsız/eksikse null (kart üretme).
export function kararKartiUret(projeId, nsYolu, asama, asamaState) {
  if (!asamaState || asamaState.durum !== 'gecti') return null
  const surum = asamaState.sorular_surum
  if (surum == null) return null

  let paket, yanit
  try {
    paket = sorulariOku(nsYolu, asama, surum)
    yanit = yanitlariHamOku(nsYolu, asama, surum)
  } catch { return null }
  if (!paket || yanit.durum !== 'var') return null

  const soru = tumAdaylar(paket).find(s => s.anahtar?.startsWith('karar:'))
  if (!soru || soru.tip !== 'CHOICE') return null

  const kayit = (yanit.ham?.yanitlar ?? []).find(e => e.anahtar === soru.anahtar)
  if (!yanitlandiMi(soru, kayit)) return null // yanıtsız/geçersiz → kart üretme

  const etiket = ASAMA_ETIKET[asama] ?? asama
  const detay = `**Soru:** ${soru.metin}\n\n**Öneri:** ${soru.oneri ?? '—'}\n\n**Seçilen:** ${kayit.secim}`
  const damga = kayit.damga ?? gercekZamanDamgasi(asamaState.cikti_pointer, new Date().toISOString())
  return {
    id: `${projeId}-karar-${asama}`,
    tip: 'girdi-talebi',
    durum: 'cevaplandi',
    ozet: `${etiket} kararı: ${kayit.secim}`,
    detay,
    partner_cevap: kayit.secim,
    olusturma: damga,
    guncelleme: damga,
  }
}

// Master-plan bölüm-yürüyüşü SÜRERKEN olası bir "karar:" sorusu aktif BÖLÜMÜN kendi soru
// paketinde olur — outer'ın (asamaState'in kendi) sorular_surum'u yalnız walk bitince (nihai
// onay sorusu) dolar; bkz tools/planlamaDurumOzeti.mjs acikSoruDurum/aktifBolumBilgisi (AYNI
// aktif_bolum/bolumler alanlarını AYNI koşulla okur). O fonksiyon (aktifBolumBilgisi) burada
// HÂLÂ import EDİLMEZ — planlamaBolumLoop.mjs'ten gelir ve döngüsel-import riski taşırdı (bkz
// meta-kanal.md 2026-07-16 16:35 recon kaydı). Ama bölüm-id'sinin state-nesnesini çözmek artık
// `mp.bolumler[mp.aktif_bolum]` ile KENDİ kopyasını almıyor — birimStateOf zaten aynı modülden
// (planlamaDurumMakinesiV2.mjs) GERCEK_ASAMALAR ile birlikte import ediliyor, yeni bir modül-
// kenarı EKLEMEDEN (döngü riski YOK) tek çözücüye bağlanır (bkz docs/
// PIPELINE_UNIT_STATE_CONSUMERS.md satır 26 — "görev: route it through the shared resolver").
function masterPlanKararBirimi(state, asama, asamaState) {
  const mp = asamaState
  if (mp?.bolumler && mp.aktif_bolum && mp.durum !== 'onay-bekliyor' && mp.durum !== 'gecti') {
    return { asama: mp.aktif_bolum, asamaState: birimStateOf(state, mp.aktif_bolum) }
  }
  return { asama, asamaState }
}

// Tüm proje için stage-kart akışı — GERÇEK_ASAMALAR sırasıyla (genesis→premise→arastirma→
// strateji→master-plan), her aşamanın ardından (varsa) o aşamanın karar-kartı; sonda elestiri
// (ASAMA_SIRASI'nın bilerek DIŞINDA — bkz planlamaDurumMakinesiV2.mjs) + kendi karar-kartı.
// `state` çağıran tarafından zaten yüklenmiş olmalı (stateYukle) — burada YENİDEN okunmaz.
// Birim-state artık birimStateOf ÜZERİNDEN çözülür (aynı nesne referansı — davranış DEĞİŞMEDİ).
export function projeKartlariniTuret(nsYolu, projeId, state) {
  const kartlar = []
  for (const asama of GERCEK_ASAMALAR) {
    const asamaState = birimStateOf(state, asama)
    const ak = asamaKartiUret(projeId, asama, asamaState)
    if (ak) kartlar.push(ak)
    const karaBirim = asama === 'master-plan' ? masterPlanKararBirimi(state, asama, asamaState) : { asama, asamaState }
    const kk = kararKartiUret(projeId, nsYolu, karaBirim.asama, karaBirim.asamaState)
    if (kk) kartlar.push(kk)
  }
  const es = birimStateOf(state, 'elestiri')
  const ea = asamaKartiUret(projeId, 'elestiri', es)
  if (ea) kartlar.push(ea)
  const ek = kararKartiUret(projeId, nsYolu, 'elestiri', es)
  if (ek) kartlar.push(ek)
  return { proje_id: projeId, kartlar }
}

// Operatör "dokümanlar" pointer listesi — AYNI state'ten, kart listesinden bağımsız tüketim
// için (operator-<id>.json → ProjectView "dokümanlar — Drive" bölümü). Master-plan bölümleri
// dahil, düz liste; her girdi gerçekten diskte var olan bir dosyaya işaret eder.
// `icerik` — dosyanın TAM metni, build-time'da GÖMÜLÜR (deploy çıktısı .md dosyalarını
// TAŞIMADIĞI için in-app görüntüleyici — #/dokuman/<proje>/<anahtar> — başka türlü içeriğe
// erişemezdi; bkz dosyaIcerigiOku). `href` (file://) GERİYE-UYUMLULUK için KORUNUYOR (mevcut
// tüketiciler/testler) ama artık SPA tarafından KULLANILMIYOR (DocRow #/dokuman'a yönlendirir).
export function projeDokumanlariniTuret(nsYolu, projeId, state) {
  const dokumanlar = []
  const ekle = (asama, cikti_pointer) => {
    const href = dosyaHref(cikti_pointer)
    if (!href) return
    dokumanlar.push({ ad: basename(cikti_pointer), asama, href, icerik: dosyaIcerigiOku(cikti_pointer) })
  }
  for (const asama of GERCEK_ASAMALAR) {
    const s = birimStateOf(state, asama)
    if (s?.durum !== 'gecti') continue
    ekle(asama, s.cikti_pointer)
    if (asama === 'master-plan' && s.bolumler) {
      for (const [bolumId, b] of Object.entries(s.bolumler)) {
        if (b?.durum === 'gecti') ekle(`master-plan/${bolumId}`, b.cikti_pointer)
      }
    }
  }
  const es = birimStateOf(state, 'elestiri')
  if (es?.durum === 'gecti') ekle('elestiri', es.cikti_pointer)
  return dokumanlar
}
