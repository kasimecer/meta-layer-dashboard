// meta-layer-core — planlamaKartTuretici.mjs doğrulama (hermetik, MODELSİZ).
// Kapsam:
//   A) tam-yay: genesis→premise→arastirma→strateji→master-plan(+bölüm)→elestiri hepsi kart
//      üretir; elestiri "karar:" kartı (pivot) doğru partner_cevap ile üretilir.
//   B) doküman-pointer'ları GERÇEK dosyaya çözülür (round-trip: href → decode → existsSync → içerik).
//   C) negatif-vaka: durum≠gecti / cikti_pointer yok / dosya diskte yok → kart ÜRETİLMEZ.
//   D) boş proje (state yok) → sıfır kart, sıfır doküman.
//   E) gerçek veri (Drive erişilebilirse): yerel-i-sletme-dijital-p-2026-07-08 projesinin
//      GERÇEK planlama-durum.json'undan tam-yay + PIVOT kararı türeyip türemediği.
//
// Koşum: node scripts/planlama-kart-turetici-test-runner.mjs

import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { META_DATA_ROOT } from './config.js'
import { kartDogrula } from '../src/lib/stateMachine.js'
import { stateYukle, GERCEK_ASAMALAR, boslukState } from '../tools/planlamaDurumMakinesiV2.mjs'
import { soruCHOICE, soruOnay, soruPaketiKur, sorulariYaz, yanitKaydet } from '../tools/planlamaSorular.mjs'
import { projeKartlariniTuret, projeDokumanlariniTuret, dosyaHref } from '../tools/planlamaKartTuretici.mjs'

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

function gectiAsama(cikti_pointer, surum = 1, extra = {}) {
  return {
    durum: 'gecti', cikti_pointer, kapi_sonuc: 'gecti', blok_nedeni: null,
    surum, kabul_edilen_ust_surum: 1, sorular_surum: null, tuketilen_ust_yanit_surum: 1,
    ...extra,
  }
}

// ── A+B) Tam-yay fikstürü ──────────────────────────────────────────────────
bolum('A+B) Tam-yay: genesis→…→elestiri + karar-kartı + doküman round-trip')

const ns = mkdtempSync(join(tmpdir(), 'kart-turetici-tamyay-'))
const projeId = '_test-tamyay'
try {
  const yaz = (ad, icerik) => { const p = join(ns, ad); writeFileSync(p, icerik, 'utf8'); return p }
  const genesisP = yaz('genesis.md', '# Genesis\niçerik')
  const premiseP = yaz('premise.md', '# Premise\niçerik')
  const arastirmaP = yaz('arastirma.md', '# Araştırma\niçerik')
  const stratejiP = yaz('strateji.md', '# Strateji\niçerik')
  const masterPlanP = yaz('master-plan.md', '# Master Plan\niçerik')
  const bolumAP = yaz('master-plan--bolum-a.md', '# Bölüm A\niçerik-a')
  const bolumBP = yaz('master-plan--bolum-b.md', '# Bölüm B\niçerik-b')
  const elestiriP = yaz('elestiri.md', '# Kritik Pasaj\n\nÖNERİ: pivot')

  const state = {
    proje_id: projeId, semasurum: 2, aktif_asama: 'tamamlandi',
    asamalar: {
      genesis: gectiAsama(genesisP),
      premise: gectiAsama(premiseP),
      arastirma: gectiAsama(arastirmaP),
      strateji: gectiAsama(stratejiP),
      'master-plan': gectiAsama(masterPlanP, 1, {
        bolumler: { 'bolum-a': gectiAsama(bolumAP), 'bolum-b': gectiAsama(bolumBP) },
      }),
    },
    elestiri: gectiAsama(elestiriP, 1, { sorular_surum: 1 }),
  }

  // elestiri sorular+yanıtlar — GERÇEK planlamaSorular.mjs üreticileriyle (fikstür kalitesi:
  // hand-rolled JSON değil, sözleşmenin kendi fonksiyonlarıyla üretilir).
  const soru = soruCHOICE({
    anahtar: 'karar:elestiri', metin: 'Kritik pasajın önerisini onaylıyor musunuz?',
    oneri: 'Yönü değiştir (pivot)', digerleri: ['Devam et (go)', 'İptal et (no-go)'],
  })
  const paket = soruPaketiKur({ projeId, asama: 'elestiri', surum: 1, sorular: [soruOnay('elestiri'), soru] })
  sorulariYaz(ns, paket)
  yanitKaydet(ns, paket, { anahtar: 'karar:elestiri', secim: 'Yönü değiştir (pivot)', damga: '2026-01-01T00:00:00.000Z' })

  const { kartlar } = projeKartlariniTuret(ns, projeId, state)

  ok('tam-yay: 7 kart üretildi (6 aşama + 1 karar)', kartlar.length === 7)
  const beklenenSira = ['genesis', 'premise', 'arastirma', 'strateji', 'master-plan', 'elestiri']
  for (const asama of beklenenSira) {
    ok(`aşama kartı var: ${asama}`, kartlar.some(k => k.id === `${projeId}-asama-${asama}`))
  }
  ok('karar kartı var: elestiri', kartlar.some(k => k.id === `${projeId}-karar-elestiri`))

  ok('sıra korunuyor (genesis…elestiri, karar en sonda)',
    kartlar.map(k => k.id).join(',') === beklenenSira.map(a => `${projeId}-asama-${a}`)
      .flatMap((id, i) => i === beklenenSira.length - 1 ? [id, `${projeId}-karar-elestiri`] : [id]).join(','))

  ok('tüm kartlar şema-geçerli (kartDogrula)', kartlar.every(k => kartDogrula(k).length === 0))
  ok('aşama kartları: tip:ilerleme / durum:bitti',
    kartlar.filter(k => k.id.includes('-asama-')).every(k => k.tip === 'ilerleme' && k.durum === 'bitti'))

  const kararK = kartlar.find(k => k.id === `${projeId}-karar-elestiri`)
  ok('karar kartı: tip:girdi-talebi / durum:cevaplandi', kararK?.tip === 'girdi-talebi' && kararK?.durum === 'cevaplandi')
  ok('karar kartı: partner_cevap = gerçek seçim (pivot)', kararK?.partner_cevap === 'Yönü değiştir (pivot)')
  ok('karar kartı: ozet gerçek seçimi yansıtıyor', kararK?.ozet?.includes('Yönü değiştir (pivot)'))
  ok('karar kartı: damga yanıtın gerçek damgasından geliyor', kararK?.olusturma === '2026-01-01T00:00:00.000Z')

  const masterPlanK = kartlar.find(k => k.id === `${projeId}-asama-master-plan`)
  ok('master-plan kartı: her iki bölüm linki detayda', masterPlanK?.detay?.includes('bolum-a') && masterPlanK?.detay?.includes('bolum-b'))

  // Doküman pointer'ları — round-trip: href → decode → existsSync → GERÇEK içerik
  const dokumanlar = projeDokumanlariniTuret(ns, projeId, state)
  ok('doküman sayısı: 5 aşama + 2 bölüm + 1 elestiri = 8', dokumanlar.length === 8)
  ok('tüm doküman href\'leri file:// ile başlıyor', dokumanlar.every(d => d.href.startsWith('file://')))

  const genesisDoc = dokumanlar.find(d => d.asama === 'genesis')
  const cozulenYol = decodeURI(genesisDoc.href.replace('file://', ''))
  ok('genesis doküman pointer\'ı GERÇEK dosyaya çözülüyor (existsSync)', existsSync(cozulenYol))
  ok('genesis doküman pointer\'ı DOĞRU dosyaya çözülüyor (aynı path)', cozulenYol === genesisP)
  ok('genesis doküman içeriği okunabilir ve gerçek (round-trip)', readFileSync(cozulenYol, 'utf8').includes('# Genesis'))

  const bolumDocs = dokumanlar.filter(d => d.asama?.startsWith('master-plan/'))
  ok('master-plan bölüm dokümanları da listede (2 adet)', bolumDocs.length === 2)
} finally {
  rmSync(ns, { recursive: true, force: true })
}

// ── C) Negatif-vaka: sahte kart ÜRETİLMEZ ────────────────────────────────────
bolum('C) Negatif-vaka: durum≠gecti / dosya yok → kart ÜRETİLMEZ')

const ns2 = mkdtempSync(join(tmpdir(), 'kart-turetici-negatif-'))
const projeId2 = '_test-negatif'
try {
  const genesisP = join(ns2, 'genesis.md')
  writeFileSync(genesisP, '# Genesis\niçerik', 'utf8')

  const state2 = {
    proje_id: projeId2, semasurum: 2, aktif_asama: 'strateji',
    asamalar: {
      genesis: gectiAsama(genesisP), // gerçek, geçti → kart BEKLENİR
      premise: { durum: 'bekliyor', cikti_pointer: null, kapi_sonuc: null, surum: 0, sorular_surum: null }, // hiç başlamamış
      arastirma: { durum: 'kosuyor', cikti_pointer: null, kapi_sonuc: null, surum: 0, sorular_surum: null }, // şu an çalışıyor (i-svec ile aynı senaryo)
      strateji: gectiAsama(join(ns2, 'strateji-YAZILMADI.md')), // 'gecti' DAMGALI ama dosya diskte YOK (bütünlük ihlali fikstürü)
      'master-plan': { durum: 'bekliyor', cikti_pointer: null, kapi_sonuc: null, surum: 0, sorular_surum: null },
    },
    elestiri: { durum: 'bekliyor', cikti_pointer: null, kapi_sonuc: null, surum: 0, sorular_surum: null }, // henüz sıra gelmedi
  }

  const { kartlar } = projeKartlariniTuret(ns2, projeId2, state2)
  ok('yalnız GERÇEKTEN geçmiş+dosyası-var aşama kart üretti (1 kart)', kartlar.length === 1)
  ok('üretilen tek kart genesis (gerçek dosyalı)', kartlar[0]?.id === `${projeId2}-asama-genesis`)
  ok('"kosuyor" aşama için kart YOK (arastirma)', !kartlar.some(k => k.id.includes('arastirma')))
  ok('"bekliyor" aşama için kart YOK (premise/master-plan)', !kartlar.some(k => k.id.includes('premise') || k.id.includes('master-plan')))
  ok('durum:gecti AMA dosya diskte yok → kart YOK (strateji, bütünlük ihlali sessizce yayılmadı)',
    !kartlar.some(k => k.id.includes('strateji')))
  ok('elestiri "bekliyor" → ne aşama ne karar kartı üretildi', !kartlar.some(k => k.id.includes('elestiri')))

  const dokumanlar2 = projeDokumanlariniTuret(ns2, projeId2, state2)
  ok('doküman listesi de yalnız gerçek dosyayı içeriyor (1 adet)', dokumanlar2.length === 1 && dokumanlar2[0].asama === 'genesis')

  ok('dosyasız cikti_pointer için dosyaHref null döner', dosyaHref(join(ns2, 'strateji-YAZILMADI.md')) === null)
  ok('null pointer için dosyaHref null döner', dosyaHref(null) === null)
} finally {
  rmSync(ns2, { recursive: true, force: true })
}

// ── D) Boş proje (planlama-durum.json hiç yok) ───────────────────────────────
bolum('D) Boş proje: state yok → sıfır kart, sıfır doküman')

const ns3 = mkdtempSync(join(tmpdir(), 'kart-turetici-bos-'))
try {
  const bosState = stateYukle(ns3, '_test-bos') // dosya yok → boslukState() otomatik
  ok('stateYukle boş projede boslukState döner', JSON.stringify(bosState) === JSON.stringify(boslukState('_test-bos')))
  const { kartlar } = projeKartlariniTuret(ns3, '_test-bos', bosState)
  ok('boş proje: 0 kart', kartlar.length === 0)
  const dokumanlar3 = projeDokumanlariniTuret(ns3, '_test-bos', bosState)
  ok('boş proje: 0 doküman', dokumanlar3.length === 0)
} finally {
  rmSync(ns3, { recursive: true, force: true })
}

// ── E) GERÇEK VERİ: yerel-i-sletme-dijital-p-2026-07-08 (varsa) ─────────────
bolum('E) Gerçek veri: yerel-i-sletme-dijital-p-2026-07-08 (Drive erişilebilirse)')

const GERCEK_ID = 'yerel-i-sletme-dijital-p-2026-07-08'
const gercekNs = join(META_DATA_ROOT, 'projeler', GERCEK_ID)
if (existsSync(join(gercekNs, 'planlama-durum.json'))) {
  const gercekState = stateYukle(gercekNs, GERCEK_ID)
  ok('gerçek proje: aktif_asama tamamlandi', gercekState.aktif_asama === 'tamamlandi')

  const { kartlar: gercekKartlar } = projeKartlariniTuret(gercekNs, GERCEK_ID, gercekState)
  for (const asama of [...GERCEK_ASAMALAR, 'elestiri']) {
    ok(`gerçek veri: ${asama} kartı üretildi`, gercekKartlar.some(k => k.id === `${GERCEK_ID}-asama-${asama}`))
  }
  const gercekKarar = gercekKartlar.find(k => k.id === `${GERCEK_ID}-karar-elestiri`)
  ok('gerçek veri: elestiri karar kartı üretildi (PIVOT)', gercekKarar?.partner_cevap === 'Yönü değiştir (pivot)')
  ok('gerçek veri: tüm kartlar şema-geçerli', gercekKartlar.every(k => kartDogrula(k).length === 0))
  ok('gerçek veri: toplam 7 kart (6 aşama + 1 karar)', gercekKartlar.length === 7)

  const gercekDokumanlar = projeDokumanlariniTuret(gercekNs, GERCEK_ID, gercekState)
  ok('gerçek veri: master-plan\'ın 15 bölümü de dokümanlarda', gercekDokumanlar.filter(d => d.asama?.startsWith('master-plan/')).length === 15)
  ok('gerçek veri: tüm doküman href\'leri gerçek dosyaya çözülüyor',
    gercekDokumanlar.every(d => existsSync(decodeURI(d.href.replace('file://', '')))))

  console.log(`\n  (bilgi) gerçek proje ${gercekKartlar.length} kart + ${gercekDokumanlar.length} doküman türetti.`)
} else {
  console.log(`  atlandı — ${gercekNs} erişilemedi (Drive bağlı değil ya da proje taşındı). Bu ortamda A–D hermetik testleri yeterli kanıt.`)
}

// ── Özet ──────────────────────────────────────────────────────────────────
bolum(`Özet: ${gecti + kaldi} test | ✓ ${gecti} geçti | ✗ ${kaldi} başarısız`)
process.exit(kaldi === 0 ? 0 : 1)
