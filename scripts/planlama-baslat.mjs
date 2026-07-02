#!/usr/bin/env node
// Planlama pipeline'ını (genesis→premise→arastirma→strateji→master-plan) İNSAN eliyle,
// açık bir komutla başlatan/devam ettiren tek yer. Materyalizasyondan (intake-materialize.mjs,
// intake-queue-watch.mjs) BİLEREK ayrı — hiçbir kod yolu bu scripti kendiliğinden çağırmaz.
//
// planlamaLoopV2Calistir idempotenttir (zaten "gecti" aşamaları atlar), bu yüzden AYNI komut
// hem ilk-başlatma hem yarıda-kalanı-devam-ettirme için kullanılır: proje daha önce hiç
// başlamadıysa genesis'ten başlar; bir aşama BLOKE ise olduğu yerde durur (kapıyı geçmesi için
// önce prompt/kapı düzeltmesi gerekir); tamamlanmışsa 0 executor çağrısıyla anında biter.
//
// Kullanım:
//   node scripts/planlama-baslat.mjs                 # bekleyen/kısmi/bloke projeleri listeler
//   node scripts/planlama-baslat.mjs <id>             # o proje için pipeline'ı başlat/devam ettir

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { planlamaBaslat } from '../tools/planlamaBaslat.mjs'
import { ASAMA_SIRASI } from '../tools/planlamaDurumMakinesiV2.mjs'

const KANONIK_REGISTRY = join(META_DATA_ROOT, 'projeler', 'registry.json')
const PUBLIC_REGISTRY  = new URL('../public/registry.json', import.meta.url).pathname

function oku(yol) { return JSON.parse(readFileSync(yol, 'utf8')) }

function projeleriOku() {
  // Kanonik (Drive) esastır; yoksa repo public kopyasına düş (yalnız görünürlük için, bkz
  // tools/intakeMateryalizeEt.mjs'deki aynı düşme mantığı).
  if (existsSync(KANONIK_REGISTRY)) {
    const r = oku(KANONIK_REGISTRY)
    return r.projeler ?? []
  }
  if (existsSync(PUBLIC_REGISTRY)) {
    const r = oku(PUBLIC_REGISTRY)
    return r.projeler ?? r
  }
  return []
}

function durumOzetiCikar(nsYolu) {
  const durumYolu = join(nsYolu, 'planlama-durum.json')
  if (!existsSync(durumYolu)) return { etiket: 'başlamadı', detay: '' }

  const state = oku(durumYolu)
  if (state.aktif_asama === 'tamamlandi') return { etiket: 'tamamlandı', detay: '' }

  const gectiSayisi = ASAMA_SIRASI
    .filter(a => a !== 'tamamlandi')
    .filter(a => state.asamalar?.[a]?.durum === 'gecti').length

  const asamaState = state.asamalar?.[state.aktif_asama]
  if (asamaState?.durum === 'donduruldu') {
    return { etiket: 'BLOKE', detay: `${state.aktif_asama} — ${asamaState.blok_nedeni ?? '(neden bilinmiyor)'}` }
  }
  return { etiket: 'kısmi', detay: `${gectiSayisi}/${ASAMA_SIRASI.length - 1} aşama geçti — sıradaki: ${state.aktif_asama}` }
}

function listele() {
  const projeler = projeleriOku()
  if (projeler.length === 0) {
    console.log('Registry boş veya bulunamadı (ne kanonik ne public).')
    return
  }
  console.log(`${projeler.length} proje — planlama durumu:\n`)
  for (const p of projeler) {
    const nsYolu = join(META_DATA_ROOT, 'projeler', p.id)
    const { etiket, detay } = durumOzetiCikar(nsYolu)
    const satir = `  ${p.id.padEnd(28)} [${etiket}]`
    console.log(detay ? `${satir} ${detay}` : satir)
  }
  console.log('\nBaşlatmak/devam ettirmek için: node scripts/planlama-baslat.mjs <id>')
}

async function baslat(id) {
  const projeler = projeleriOku()
  const projeKaydi = projeler.find(p => p.id === id)
  if (!projeKaydi) {
    console.error(`HATA: proje registry'de bulunamadı: ${id}`)
    console.error('Önce materyalize edilmeli: node scripts/intake-materialize.mjs <taslak.json>')
    process.exit(1)
  }

  const nsYolu = join(META_DATA_ROOT, 'projeler', id)
  const projeConfig = { id, ad: projeKaydi.ad, aciklama: projeKaydi.ozet }

  console.log(`▶ Planlama pipeline'ı başlatılıyor/devam ettiriliyor: ${id}`)
  console.log(`  Namespace: ${nsYolu}`)
  console.log(`  Model: claude-sonnet-4-6 | Auth: abonelik OAuth | --safe-mode\n`)

  const sonuc = await planlamaBaslat(nsYolu, id, projeConfig, { log: (s) => console.log(s) })

  console.log('')
  if (sonuc.tamamlandi) {
    console.log(`✓ Planlama pipeline TAMAMLANDI — aktif_asama: ${sonuc.state.aktif_asama}`)
  } else {
    const asama = sonuc.state.aktif_asama
    console.log(`✗ Planlama pipeline DURDU/BLOKE — aktif_asama: ${asama}`)
    console.log(`  blok_nedeni: ${sonuc.state.asamalar[asama]?.blok_nedeni ?? '(yok)'}`)
  }
  console.log(`  executor çağrı sayısı: ${sonuc.executorCagriSayisi}`)
  console.log(`  toplam maliyet: $${sonuc.maliyet.toplam.toFixed(4)}`)
  if (!sonuc.tamamlandi) process.exit(1)
}

const [id] = process.argv.slice(2)

try {
  if (!id) {
    listele()
  } else {
    await baslat(id)
  }
} catch (e) {
  console.error(`HATA: ${e.message}`)
  process.exit(1)
}
