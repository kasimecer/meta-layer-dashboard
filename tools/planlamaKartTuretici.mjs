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

import { existsSync, statSync } from 'fs'
import { basename } from 'path'
import { sorulariOku, yanitlariHamOku, tumAdaylar, yanitlandiMi } from './planlamaSorular.mjs'
import { GERCEK_ASAMALAR } from './planlamaDurumMakinesiV2.mjs'

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

// Tüm proje için stage-kart akışı — GERÇEK_ASAMALAR sırasıyla (genesis→premise→arastirma→
// strateji→master-plan), her aşamanın ardından (varsa) o aşamanın karar-kartı; sonda elestiri
// (ASAMA_SIRASI'nın bilerek DIŞINDA — bkz planlamaDurumMakinesiV2.mjs) + kendi karar-kartı.
// `state` çağıran tarafından zaten yüklenmiş olmalı (stateYukle) — burada YENİDEN okunmaz.
export function projeKartlariniTuret(nsYolu, projeId, state) {
  const kartlar = []
  for (const asama of GERCEK_ASAMALAR) {
    const ak = asamaKartiUret(projeId, asama, state.asamalar?.[asama])
    if (ak) kartlar.push(ak)
    const kk = kararKartiUret(projeId, nsYolu, asama, state.asamalar?.[asama])
    if (kk) kartlar.push(kk)
  }
  const ea = asamaKartiUret(projeId, 'elestiri', state.elestiri)
  if (ea) kartlar.push(ea)
  const ek = kararKartiUret(projeId, nsYolu, 'elestiri', state.elestiri)
  if (ek) kartlar.push(ek)
  return { proje_id: projeId, kartlar }
}

// Operatör "dokümanlar" pointer listesi — AYNI state'ten, kart listesinden bağımsız tüketim
// için (operator-<id>.json → ProjectView "dokümanlar — Drive" bölümü). Master-plan bölümleri
// dahil, düz liste; her girdi gerçekten diskte var olan bir dosyaya işaret eder.
export function projeDokumanlariniTuret(nsYolu, projeId, state) {
  const dokumanlar = []
  const ekle = (asama, cikti_pointer) => {
    const href = dosyaHref(cikti_pointer)
    if (!href) return
    dokumanlar.push({ ad: basename(cikti_pointer), asama, href })
  }
  for (const asama of GERCEK_ASAMALAR) {
    const s = state.asamalar?.[asama]
    if (s?.durum !== 'gecti') continue
    ekle(asama, s.cikti_pointer)
    if (asama === 'master-plan' && s.bolumler) {
      for (const [bolumId, b] of Object.entries(s.bolumler)) {
        if (b?.durum === 'gecti') ekle(`master-plan/${bolumId}`, b.cikti_pointer)
      }
    }
  }
  if (state.elestiri?.durum === 'gecti') ekle('elestiri', state.elestiri.cikti_pointer)
  return dokumanlar
}
