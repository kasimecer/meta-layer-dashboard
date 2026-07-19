// meta-layer-core — Açık-soru durum özeti (READ-ONLY, MODELSİZ).
//
// PAYLAŞILAN ÇEKİRDEK: scripts/planlama-baslat.mjs (CLI, Türkçe konsol biçimlendirmesi) VE
// scripts/build-card-data.js (tarayıcı için JSON anlık-görüntü) AYNI acikSoruDurum'u çağırır —
// "tarayıcı ve CLI aynı olguda hemfikir" garantisi buradan gelir (tek fonksiyon, iki çağıran).
// tools/ katmanında yaşar (scripts/*.mjs başka bir scripts/*.mjs'yi İTHAL ETMEZ — repo
// konvansiyonu); her iki çağıran da yalnız bu saf modülden okur.

import {
  sorulariOku, yanitlariHamOku, yanitButunluk, acikSorular, atlananlar,
  tumAcikAdaylar, acikBlokerler,
} from './planlamaSorular.mjs'
import { aktifBolumBilgisi } from './planlamaBolumLoop.mjs'
import { GERCEK_ASAMALAR, birimStateOf } from './planlamaDurumMakinesiV2.mjs'
import { BOLUM_SIRASI } from './planlamaBolumTanimlari.mjs'
import { birimAcikDurum } from './planlamaBirimMotoru.mjs'

// Genel çekirdek — bir BİRİMİN (aşama VEYA master-plan bölümü) sorular artefaktından açık-soru
// durumu. birimState = state.asamalar[birimId] VEYA bir bölümün kendi state-nesnesi (AYNI şekil:
// sorular_surum alanı olan herhangi bir birim). Dönüş: null veya
//   { asama, paket, acik, atlanan, butunluk: 'gecerli'|'yok'|'bozuk', neden? }
// acikBloker/acikErtelenen: SAF EKLEME (mevcut tüketiciler görmezden gelebilir) — CLI'nin
// toplu-atla/blocker raporlaması için (bkz scripts/planlama-baslat.mjs).
function acikSoruDurumJenerik(nsYolu, birimId, birimState) {
  const ss = birimState?.sorular_surum
  if (ss == null) return null
  const paket = sorulariOku(nsYolu, birimId, ss)
  if (!paket) return null
  const substantive = paket.sorular.filter(s => s.tip !== 'APPROVAL')
  if (substantive.length === 0) return { asama: birimId, paket, acik: [], acikBloker: [], acikErtelenen: [], atlanan: [], butunluk: 'gecerli' }
  const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, birimId, ss))
  if (but.durum === 'gecerli') {
    const acik = acikSorular(paket, but.yanitlar)
    const tumAcik = tumAcikAdaylar(paket, but.yanitlar)
    return {
      asama: birimId, paket, acik,
      acikBloker: acikBlokerler(paket, but.yanitlar),
      acikErtelenen: tumAcik.filter(s => !acik.includes(s)),
      atlanan: atlananlar(paket, but.yanitlar), butunluk: 'gecerli',
    }
  }
  return { asama: birimId, paket, acik: substantive, acikBloker: substantive.filter(s => s.tier === 'blocker'), acikErtelenen: [], atlanan: [], butunluk: but.durum, neden: but.neden }
}

// Aktif aşamanın sorular artefaktından açık-soru durumu — CLI (scripts/planlama-baslat.mjs) VE
// tarayıcı (scripts/build-card-data.js) AYNI fonksiyonu çağırır, "aynı olguda hemfikir" garantisi
// buradan gelir. Master-plan bölüm-yürüyüşü SÜRERKEN (aktifBolumBilgisi != null) aktif BÖLÜMÜN
// soru-durumuna DELEGE eder — aksi halde outer master-plan.sorular_surum (henüz null / walk
// bitmiş-nihai-onay) her zamanki gibi okunur. Dönüş şekli DEĞİŞMEDİ; yalnız EKLENEN `bolum`
// alanı (null = aşama-seviyesi, aksi halde bölüm id'si) hangi granülerlikte olduğumuzu gösterir —
// SAF EKLEME (mevcut tüketiciler bu alanı görmezden gelebilir).
//
// Birim-state ARTIK birimStateOf (tools/planlamaDurumMakinesiV2.mjs) ÜZERİNDEN okunuyor — eskiden
// bu fonksiyon `state.asamalar?.[A]`/`bilgi.bolumler[...]` ile kendi kopyasını tutuyordu (bkz
// docs/PIPELINE_UNIT_STATE_CONSUMERS.md satır 22); aynı nesne referansını döndürdüğü için davranış
// DEĞİŞMEDİ, yalnız tek bir çözücüye bağlandı.
//
// aktif_asama==='tamamlandi' YAPISAL KÖR NOKTA DÜZELTMESİ (2026-07-19, görev: "route the panel
// through the shared resolver + close the tamamlandi blind spot"): 5-aşama + bölüm-yürüyüşü
// bittiğinde eskiden KOŞULSUZ null dönülüyordu — ama Kritik Pasaj (elestiri) GERCEK_ASAMALAR'ın
// DIŞINDA kendi state.elestiri'sini taşıyan AYRI bir birimdir (bkz tools/elestiriPasi.mjs) ve
// onay-bekliyor/donduruldu durumdayken gerçek, cevapsız bir açık-soru (E'nin go/no-go/pivot
// kararı dahil) taşıyabilir — bu artık görünür. Koşul (`durum !== 'bekliyor' && durum !== 'gecti'`)
// src/lib/registry.js:pipelineDurumFazHesapla'nın ZATEN kullandığı AYNI üç-durumlu ayrımdır (yeni
// bir eşik İCAT EDİLMEDİ): elestiri hiç tetiklenmemişse (bekliyor) veya tamamen kapanmışsa (gecti,
// yani nihai APPROVAL zaten verildi) burası hâlâ null döner — "gerçekten hiçbir şey bekliyor
// değil" projeler SAHTE bir açık-soru ile DOLDURULMAZ (bkz görev: "genuinely finished projects
// must still show a truthful nothing pending").
export function acikSoruDurum(nsYolu, state) {
  const A = state.aktif_asama

  if (A === 'tamamlandi') {
    const es = birimStateOf(state, 'elestiri')
    if (!es || es.durum === 'bekliyor' || es.durum === 'gecti') return null
    const sonuc = acikSoruDurumJenerik(nsYolu, 'elestiri', es)
    return sonuc ? { ...sonuc, bolum: null } : null
  }

  if (A === 'master-plan') {
    const bilgi = aktifBolumBilgisi(state)
    if (bilgi) {
      const sonuc = acikSoruDurumJenerik(nsYolu, bilgi.bolumId, birimStateOf(state, bilgi.bolumId))
      return sonuc ? { ...sonuc, bolum: bilgi.bolumId } : null
    }
  }

  const sonuc = acikSoruDurumJenerik(nsYolu, A, birimStateOf(state, A))
  return sonuc ? { ...sonuc, bolum: null } : null
}

// ── Leftover/deferred-candidate visibility (READ-ONLY; walk/deferral üretim mantığına
//    dokunmaz) ──────────────────────────────────────────────────────────────────────────
//
// acikSoruDurum yukarıda YALNIZ aktif birimi (veya, tamamlandiysa, elestiri'yi) görür — proje
// boyunca ÜRETİLMİŞ diğer birimlerin (artık aktif olmayan aşamalar, tamamlanmış bölümler) kendi
// ertelenen (ana sete sığmayan, üretim-anında geciktirilmiş) adaylarından hâlâ AÇIK olanları
// GÖSTERMEZ — bunlar "leftover" (bkz görev: "candidates deferred during the walk are invisible
// on the panel even though they are resolvable from state"). Bu fonksiyon proje boyunca
// sorular_surum taşıyan HER birimi (5 aşama + elestiri + varsa 15 master-plan bölümü) tek tek
// tarar ve HER biri için birimAcikDurum'u (tools/planlamaBirimMotoru.mjs — walk'ın kendisinin
// kullandığı AYNI, zaten var olan fonksiyon) çağırıp yalnız `.acikErtelenen` alanını okur — yeni
// bir açık-soru/erteleme ALGORİTMASI İCAT EDİLMEZ, üretim/kapı kararlarına HİÇBİR ŞEKİLDE
// dokunulmaz (yalnız okuma). Bir birimin ertelenen adayları YOKSA veya hepsi zaten
// cevaplanmış/atlanmışsa (acikErtelenen boş) o birim sonuca hiç GİRMEZ — "leftover yok" projeler
// için de doğru/boş liste döner.
export function projeLeftoverOzetiCikar(nsYolu, state) {
  const birimIdleri = [...GERCEK_ASAMALAR, 'elestiri']
  const mp = birimStateOf(state, 'master-plan')
  if (mp?.bolumler) birimIdleri.push(...BOLUM_SIRASI)

  const sonuc = []
  for (const id of birimIdleri) {
    const bs = birimStateOf(state, id)
    if (!bs || bs.sorular_surum == null) continue
    let d
    try {
      d = birimAcikDurum(nsYolu, { [id]: bs }, id)
    } catch {
      continue // bozuk/okunamayan paket — leftover özetini ÇÖKERTMEZ, o birim atlanır
    }
    if (!d.paketVar || d.acikErtelenen.length === 0) continue
    sonuc.push({
      birimId: id,
      sayi: d.acikErtelenen.length,
      adaylar: d.acikErtelenen.map(s => ({
        anahtar: s.anahtar, tip: s.tip, tier: s.tier ?? 'onemli', metin: s.metin,
      })),
    })
  }
  return sonuc
}
