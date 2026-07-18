// Görev 2 — pipelineDurumFazHesapla testleri (hermetik, MODELSİZ). Kapsam: (1) sentetik state
// nesneleriyle her dalın doğru durum/faz ürettiğinin kanıtı, (2) GERÇEK 6 projenin
// planlama-durum.json'una karşı (SALT-OKUNUR — hiçbir dosyaya yazılmaz) beklenen durumun
// doğrulanması — "build 6 projenin hepsi için doğru aşamayı üretiyor" ölçütünün kanıtı.
//
// Koşum: node scripts/registry-durum-faz-test.mjs

import { existsSync } from 'fs'
import { join } from 'path'
import { pipelineDurumFazHesapla, DURUM_YASAM, durumSira, PIPELINE_BILGISI_YOK } from '../src/lib/registry.js'
import { stateYukle } from '../tools/planlamaDurumMakinesiV2.mjs'

let gecti = 0, kaldi = 0
function ok(ad, kosul) {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}`) }
}
function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

// ══ 1 — HİÇ pipeline state YOK: dürüst "bilinmiyor", "fikir" DEĞİL ═══════════════════════════
bolum('pipeline state YOKSA (null): "bilinmiyor" döner — GERÇEK bilgi gibi görünen bir varsayılan DEĞİL')
{
  const r = pipelineDurumFazHesapla(null)
  ok('durum="bilinmiyor"', r.durum === PIPELINE_BILGISI_YOK)
  ok('faz="bilinmiyor" (durum="build" gibi YANILTICI bir değere DÜŞMEZ)', r.faz === PIPELINE_BILGISI_YOK)
  ok('"bilinmiyor" ile "fikir" AYNI DEĞİL (bilgi-yokluğu ile gerçek-erken-aşama KARIŞTIRILMIYOR)', r.durum !== 'fikir')
}

// ══ 2 — genesis hiç üretilmemiş: gerçekten "fikir" ═══════════════════════════════════════════
bolum('genesis HENÜZ üretilmemiş (bekliyor, taze state): "fikir"')
{
  const state = { aktif_asama: 'genesis', asamalar: { genesis: { durum: 'bekliyor', surum: 0 } } }
  const r = pipelineDurumFazHesapla(state)
  ok('durum="fikir"', r.durum === 'fikir')
  ok('faz="planlama"', r.faz === 'planlama')
}

// ══ 3 — genesis BAŞLAMIŞ (artık "fikir" değil, "genesis") ═════════════════════════════════════
bolum('genesis üretilmiş/çalışıyor: durum artık "fikir" DEĞİL, pipeline\'ın KENDİ adı')
{
  for (const genesisDurum of ['kosuyor', 'onay-bekliyor', 'donduruldu', 'gecti']) {
    const state = { aktif_asama: 'genesis', asamalar: { genesis: { durum: genesisDurum, surum: 1 } } }
    const r = pipelineDurumFazHesapla(state)
    ok(`genesis.durum="${genesisDurum}" → registry-durum="genesis" (tahmin değil, GERÇEK adı)`, r.durum === 'genesis')
  }
}

// ══ 4 — aktif aşama ADI doğrudan yansıtılır (premise/arastirma/strateji/master-plan) ══════════
bolum('aktif aşamanın adı OLDUĞU GİBİ yansıtılır — yorum/tahmin YOK')
{
  for (const asama of ['premise', 'arastirma', 'strateji', 'master-plan']) {
    const state = { aktif_asama: asama, asamalar: { [asama]: { durum: 'kosuyor', surum: 0 } } }
    const r = pipelineDurumFazHesapla(state)
    ok(`aktif_asama="${asama}" → durum="${asama}"`, r.durum === asama)
    ok(`  faz="planlama"`, r.faz === 'planlama')
  }
}

// ══ 5 — tamamlandi + elestiri durumuna göre AYRIM ═════════════════════════════════════════════
bolum('aktif_asama=tamamlandi: elestiri durumuna göre AYRIŞIR (canlı-vaka: fotball-podcast)')
{
  const gecti_ = pipelineDurumFazHesapla({ aktif_asama: 'tamamlandi', elestiri: { durum: 'gecti' } })
  ok('elestiri geçmiş → durum="tamamlandi" (tam anlamıyla bitti)', gecti_.durum === 'tamamlandi')

  const bekliyor = pipelineDurumFazHesapla({ aktif_asama: 'tamamlandi', elestiri: { durum: 'onay-bekliyor' } })
  ok('elestiri onay bekliyor → durum="tamamlandi-elestiri-bekliyor" (YANILTICI "tamamlandi" DEĞİL)', bekliyor.durum === 'tamamlandi-elestiri-bekliyor')

  const donduruldu = pipelineDurumFazHesapla({ aktif_asama: 'tamamlandi', elestiri: { durum: 'donduruldu' } })
  ok('elestiri donduruldu → durum="tamamlandi-elestiri-bekliyor"', donduruldu.durum === 'tamamlandi-elestiri-bekliyor')

  const yokElestiri = pipelineDurumFazHesapla({ aktif_asama: 'tamamlandi', elestiri: null })
  ok('elestiri HİÇ tetiklenmemiş (null) → durum="tamamlandi" (canlı-vaka: nevresim-sabitleyici)', yokElestiri.durum === 'tamamlandi')

  // normalizeState (tools/planlamaDurumMakinesiV2.mjs) elestiri:null'ı bosAsama()'ya çevirir —
  // ki bunun durum'u 'bekliyor'dur (RAW null DEĞİL). Bu, GERÇEK stateYukle çıktısında görülen
  // biçim — canlı-vakada (nevresim-sabitleyici) İLK denemede bu YAKALANMAMIŞTI (test 'bekliyor'u
  // 'onay-bekliyor' gibi ele alıp yanlışlıkla "tamamlandi-elestiri-bekliyor" üretiyordu).
  const bosAsamaBicimi = pipelineDurumFazHesapla({ aktif_asama: 'tamamlandi', elestiri: { durum: 'bekliyor' } })
  ok('elestiri.durum="bekliyor" (normalizeState\'in bosAsama() biçimi) → durum="tamamlandi" (BLOKE değil)', bosAsamaBicimi.durum === 'tamamlandi')
}

// ══ 6 — DURUM_YASAM/durumSira TUTARLILIĞI: her üretilebilir değer SIRALANABİLİR ═══════════════
bolum('pipelineDurumFazHesapla\'nın üretebileceği HER değer DURUM_YASAM içinde var (sıralama kırılmaz)')
{
  const tumSenaryolar = [
    pipelineDurumFazHesapla(null),
    pipelineDurumFazHesapla({ aktif_asama: 'genesis', asamalar: { genesis: { durum: 'bekliyor' } } }),
    pipelineDurumFazHesapla({ aktif_asama: 'genesis', asamalar: { genesis: { durum: 'kosuyor' } } }),
    pipelineDurumFazHesapla({ aktif_asama: 'premise', asamalar: {} }),
    pipelineDurumFazHesapla({ aktif_asama: 'arastirma', asamalar: {} }),
    pipelineDurumFazHesapla({ aktif_asama: 'strateji', asamalar: {} }),
    pipelineDurumFazHesapla({ aktif_asama: 'master-plan', asamalar: {} }),
    pipelineDurumFazHesapla({ aktif_asama: 'tamamlandi', elestiri: { durum: 'onay-bekliyor' } }),
    pipelineDurumFazHesapla({ aktif_asama: 'tamamlandi', elestiri: { durum: 'gecti' } }),
  ]
  for (const s of tumSenaryolar) {
    ok(`"${s.durum}" DURUM_YASAM içinde (durumSira ≠ -1, "duruma göre" sıralama bunu KAÇIRMAZ)`, durumSira(s.durum) !== -1)
  }
  ok('"bilinmiyor" EN DÜŞÜK sırada (en az "ileri" — asla en üstte görünmez)', durumSira('bilinmiyor') === 0)
}

// ══ 7 — BÜTÜNLEŞİK, GERÇEK VERİ: 6 gerçek projenin planlama-durum.json\'una karşı (SALT-OKUNUR) ══
bolum('GERÇEK VERİ (salt-okunur): 6 projenin TAMAMI için beklenen durum doğrulanıyor')
{
  const META = '/Users/kasimecer/Library/CloudStorage/GoogleDrive-kasimecer@gmail.com/My Drive/meta-layer'
  const projelerDir = join(META, 'projeler')
  if (!existsSync(projelerDir)) {
    ok('GERÇEK VERİ testi atlanamaz — Drive bağlı değil, bu BAŞARISIZLIK sayılır (sessiz atlama YOK)', false)
  } else {
    // Beklenen değerler önceden (bu turda) doğrudan planlama-durum.json dosyaları okunarak
    // TESPİT EDİLDİ (varsayılmadı) — bkz kanal raporu.
    const beklenenler = {
      'mustafa': PIPELINE_BILGISI_YOK,
      'yakup': PIPELINE_BILGISI_YOK,
      'noaval': PIPELINE_BILGISI_YOK,
      'nevresim-sabitleyici-2026-07-01': 'tamamlandi',
      'i-svec-te-reklam-ajansi-2026-07-04': 'master-plan',
      'fotball-podcast-2026-07-09': 'tamamlandi-elestiri-bekliyor',
    }
    // NOT: mustafa/yakup/noaval için `projeler/<id>/` NAMESPACE DİZİNİ dahi yok (yalnız
    // registry.json kaydı var — bu üçü, `projeler/<id>/` konvansiyonundan ÖNCEKİ/dışındaki eski
    // kayıtlar). `existsSync(join(pdir,'planlama-durum.json'))` dizin dahi yoksa GÜVENLE `false`
    // döner (çökmez) — bu TAM OLARAK "bilinmiyor" senaryosu, ayrıca test edilmeye değer.
    for (const [id, beklenenDurum] of Object.entries(beklenenler)) {
      const pdir = join(projelerDir, id)
      const durumDosyasiVarMi = existsSync(join(pdir, 'planlama-durum.json'))
      const state = durumDosyasiVarMi ? stateYukle(pdir, id) : null
      const { durum } = pipelineDurumFazHesapla(state)
      ok(`${id}: beklenen "${beklenenDurum}", ölçülen "${durum}"`, durum === beklenenDurum)
    }
  }
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
