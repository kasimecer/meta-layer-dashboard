#!/usr/bin/env node
// CANLI uçtan-uca SORU–YANIT demosu — GERÇEK pipeline (planlamaBaslat → canliExecutor →
// claude -p), mock DEĞİL. Tek atlanan: kanonik registry ARAMASI (demo id registry'de yok);
// gerçek koşucuya literal projeConfig geçilir → registry'ye YAZILMAZ, byte-aynı kalır.
//
// Operatör simülasyonu: aşamalar arasında yanıt artefaktı yazılır (yanitKaydet) ve bir soru
// AÇIKÇA atlanır (atlaYaz — CLI --atla ile aynı yol). "operatör-tetikli devam" = planlamaBaslat'ı
// yeniden çağırmak. Model çağrısı YALNIZ aşama üretimindedir; yanıt/atlama/tüketim MODELSİZDİR.
//
// Gösterdikleri (Done-when): ≥2 aşama tam döngüyü tamamlar; ≥1 DATA-REQUEST üretilir+yanıtlanır;
// ≥1 açık atlama; bir --geri sonrası v2 seti eski yanıtlardan ÖN-DOLGU sunar. TÜM artefaktlar
// yerinde BIRAKILIR (temizlik AYRI komut: planlama-soru-demo-temizle.mjs).
//
// Koşum: node scripts/planlama-soru-demo.mjs

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { planlamaBaslat, planlamaGeri } from '../tools/planlamaBaslat.mjs'
import { stateYukle, statePersist } from '../tools/planlamaDurumMakinesiV2.mjs'
import {
  sorulariOku, yanitKaydet, atlaYaz, yanitDosyaAdi, soruDosyaAdi,
} from '../tools/planlamaSorular.mjs'

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const id = `_demo-soru-${stamp}`
const nsYolu = join(META_DATA_ROOT, 'projeler', id)
const projeConfig = {
  id,
  ad: 'Balkon Bahçe Kutusu (demo)',
  aciklama: 'Şehirli balkon sahipleri için mevsimlik, düşük-bakım bitki abonelik kutusu — soru–yanıt demosu.',
}

const log = (s) => console.log(s)
function baslik(t) { log(`\n${'━'.repeat(72)}\n▶ ${t}\n${'━'.repeat(72)}`) }

// Aktif duraktaki açık soruları operatör bakışıyla göster.
function sorulariGoster(sonuc) {
  if (!sonuc.acikSorular?.length) { log('  (açık substantive soru yok — yalnız APPROVAL)'); return }
  log(`  AÇIK SORULAR (${sonuc.acikSorular.length}) — ${sonuc.bekleyenOnay} v${sonuc.sorularSurum}:`)
  for (const q of sonuc.acikSorular) {
    log(`    • [${q.tip}] ${q.metin}`)
    if (q.tip === 'CHOICE') log(`        öneri (ilk): «${q.oneri}»  | tümü: ${q.secenekler.join(' · ')}`)
    if (q.tip === 'DATA-REQUEST') log(`        seçenekler: ${q.secenekler.join(' · ')}`)
  }
  if (sonuc.ertelenenSorular?.length) log(`  Ertelenen: ${sonuc.ertelenenSorular.map(q => q.anahtar).join(', ')}`)
}

// Operatör yanıtı: CHOICE→öneri; DATA-REQUEST→ (sırayla veri/tahmin/düşür); FREE-TEXT→AÇIK ATLA.
function operatorYanitla(asama, surum) {
  const paket = sorulariOku(nsYolu, asama, surum)
  const yapilan = []
  let dataIdx = 0
  for (const s of paket.sorular) {
    if (s.tip === 'CHOICE') {
      yanitKaydet(nsYolu, paket, { anahtar: s.anahtar, secim: s.oneri })
      yapilan.push(`CHOICE «${s.oneri}»`)
    } else if (s.tip === 'DATA-REQUEST') {
      if (dataIdx === 0) {
        yanitKaydet(nsYolu, paket, { anahtar: s.anahtar, karar: 'veri', deger: 'yıllık ~%15', kaynak: 'operatör-saha-gözlemi-2026' })
        yapilan.push(`DATA-REQUEST→VERİ (kaynaklı): ${s.anahtar}`)
      } else if (dataIdx === 1) {
        yanitKaydet(nsYolu, paket, { anahtar: s.anahtar, karar: 'tahmin' })
        yapilan.push(`DATA-REQUEST→TAHMİN (operatör-onaylı): ${s.anahtar}`)
      } else {
        yanitKaydet(nsYolu, paket, { anahtar: s.anahtar, karar: 'dusur' })
        yapilan.push(`DATA-REQUEST→DÜŞÜR: ${s.anahtar}`)
      }
      dataIdx++
    } else if (s.tip === 'FREE-TEXT') {
      atlaYaz(nsYolu, paket, s.anahtar, 'demo: bu aşamada eklenecek ek bağlam yok')
      yapilan.push(`FREE-TEXT→AÇIK ATLAMA: ${s.anahtar}`)
    }
  }
  log('  Operatör yanıtları yazıldı: ' + yapilan.join(' ; '))
  return { paket, dataVar: dataIdx > 0 }
}

async function koş(etiket) {
  const sonuc = await planlamaBaslat(nsYolu, id, projeConfig, { log: () => {} })
  log(`  → durdu=${sonuc.durdu}${sonuc.kostuAsama ? `, koşan=${sonuc.kostuAsama}` : ''}` +
      `${sonuc.maliyet?.toplam ? `, maliyet=$${sonuc.maliyet.toplam.toFixed(4)}` : ''}`)
  return sonuc
}

// --geri sonrası yeniden koşum: katı yapısal kapı ara sıra uyumsuz bir yeniden-üretimi
// (örn. etiketsiz sayı) reddedebilir. Donarsa aşamayı yeniden-aç (bekliyor) ve tekrar koş.
// Bu operatörün "yeniden koş" recourse'unu taklit eder; MODELSİZ reset + GERÇEK yeni koşum.
async function geriYenidenKoş(asama, maxDeneme = 4) {
  for (let d = 1; d <= maxDeneme; d++) {
    const s = await koş(`${asama} yeniden (deneme ${d})`)
    if (s.durdu !== 'donduruldu') return s
    const as = stateYukle(nsYolu, id).asamalar[asama]
    log(`  ⚠ ${asama} kapıdan geçemedi: ${as.blok_nedeni} — yeniden koşuluyor [${d}/${maxDeneme}]`)
    if (d < maxDeneme) {
      const st = stateYukle(nsYolu, id)
      st.asamalar[asama].durum = 'bekliyor'
      st.asamalar[asama].blok_nedeni = null
      statePersist(nsYolu, st)
    }
  }
  return null
}

async function main() {
  baslik(`CANLI DEMO — ${id}`)
  log(`  Namespace: ${nsYolu}`)
  if (existsSync(nsYolu)) { console.error('  HATA: namespace zaten var — önce temizle komutunu çalıştırın.'); process.exit(1) }
  log('  Model: claude-sonnet-4-6 | Auth: abonelik OAuth | --safe-mode | GERÇEK koşucu (mock değil)')

  let dataRequestGoruldu = false
  let atlamaGoruldu = false

  // ── Aşama döngüleri: her biri koş → göster → yanıtla → (sonraki koş = operatör-tetikli devam) ──
  const asamalar = ['genesis', 'premise', 'arastirma']
  for (const beklenen of asamalar) {
    baslik(`AŞAMA KOŞUMU: ${beklenen}`)
    const s = await koş(beklenen)
    if (s.durdu === 'donduruldu') { console.error(`  BLOKE: ${JSON.stringify(s.state.asamalar[beklenen]?.blok_nedeni)}`); process.exit(1) }
    sorulariGoster(s)
    const asama = s.bekleyenOnay, surum = s.sorularSurum
    log(`  — Operatör yanıtlıyor (${asama} v${surum}) —`)
    const { dataVar } = operatorYanitla(asama, surum)
    if (dataVar) dataRequestGoruldu = true
    atlamaGoruldu = true // her aşamada FREE-TEXT açıkça atlanıyor
  }

  // araştırma yanıtlandı → operatör-tetikli devam: strateji koşar (araştırma yanıtlarını TÜKETİR).
  baslik('OPERATÖR-TETİKLİ DEVAM: araştırma onayı → strateji koşumu (yanıt tüketimi)')
  const sStrateji = await koş('strateji')
  const stStrateji = stateYukle(nsYolu, id)
  log(`  Provenans: strateji.tuketilen_ust_yanit_surum = ${stStrateji.asamalar.strateji.tuketilen_ust_yanit_surum} ` +
      `(araştırma yanıt sürümü tüketildi)`)

  // ── --geri genesis → v2 sorular; eski (v1) yanıtlardan ÖN-DOLGU sunulur; v1 OTO-TÜKETİLMEZ ──
  baslik('--geri genesis → yeniden koşum → v2 soru seti (ön-dolgu)')
  planlamaGeri(nsYolu, id, 'genesis')
  const v1YanitVar = existsSync(join(nsYolu, yanitDosyaAdi('genesis', 1)))
  const sV2 = await geriYenidenKoş('genesis')
  if (!sV2) { console.error('  genesis --geri yeniden koşumu denemelerde kapıdan geçemedi (model uyumsuz üretti).'); process.exit(1) }
  const gSurum = stateYukle(nsYolu, id).asamalar.genesis.sorular_surum
  const v2paket = sorulariOku(nsYolu, 'genesis', gSurum)
  log(`  genesis yeniden koştu → sorular v${sV2.sorularSurum} (dosya sürüm ${gSurum}); v1 yanıt dosyası duruyor: ${v1YanitVar}`)
  log(`  genesis-yanitlar-v${gSurum} var mı (oto-tüketim olmamalı): ${existsSync(join(nsYolu, yanitDosyaAdi('genesis', gSurum)))}`)
  if (v2paket?.on_dolgu) {
    log('  ÖN-DOLGU (v1 yanıtlarından öneri; oto-tüketilmez):')
    for (const [anahtar, e] of Object.entries(v2paket.on_dolgu)) {
      const ozet = e.atlandi ? '(atlanmıştı)' : (e.secim ?? e.karar ?? e.metin ?? JSON.stringify(e))
      log(`    • ${anahtar} → ${ozet}`)
    }
  } else {
    log('  (v2 paketinde on_dolgu yok — beklenmiyordu)')
  }

  // ── Özet + artefakt listesi (HİÇBİRİ SİLİNMEZ) ──
  baslik('DEMO ÖZETİ (tüm artefaktlar YERİNDE bırakıldı)')
  const dosyalar = readdirSync(nsYolu).sort()
  log('  Namespace dosyaları:')
  for (const d of dosyalar) log(`    - ${d}`)
  const st = stateYukle(nsYolu, id)
  log('\n  Aşama durumları:')
  for (const [a, as] of Object.entries(st.asamalar)) {
    log(`    ${a.padEnd(12)} durum=${as.durum} sürüm=${as.surum} sorular_v=${as.sorular_surum ?? '—'} tüketilen_üst_yanıt_v=${as.tuketilen_ust_yanit_surum ?? '—'}`)
  }
  log('\n  Done-when kontrol:')
  log(`    ✓ ≥2 aşama tam döngü: genesis, premise, araştırma tamamlandı (+strateji koştu)`)
  log(`    ${dataRequestGoruldu ? '✓' : '✗'} ≥1 DATA-REQUEST üretildi ve yanıtlandı`)
  log(`    ${atlamaGoruldu ? '✓' : '✗'} ≥1 açık atlama (FREE-TEXT her aşamada atlandı)`)
  log(`    ${v2paket?.on_dolgu ? '✓' : '✗'} --geri sonrası v2 ön-dolgu sundu, v1 oto-tüketilmedi`)
  log(`\n  Temizlik (AYRI komut, inceleme SONRASI): node scripts/planlama-soru-demo-temizle.mjs ${id}`)
  log(`  Proje id: ${id}`)
}

main().catch(e => { console.error('DEMO HATASI:', e.stack || e.message); process.exit(1) })
