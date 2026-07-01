#!/usr/bin/env node
// CLI giriş noktası — elle çağırma (yedek yol). Ortak mantık tools/intakeMateryalizeEt.mjs'de;
// scripts/intake-queue-watch.mjs (Worker-kuyruğu → yerel izleyici) da AYNI mantığı kullanır.
// Kullanım: node scripts/intake-materialize.mjs <taslak.json> [--no-loop]
//   --no-loop: yalnız materyalize et, canlı planlama loop'unu tetikleme.

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { taslakiMateryalizeEt } from '../tools/intakeMateryalizeEt.mjs'

const args = process.argv.slice(2).filter(a => a !== '--no-loop')
const loopAtla = process.argv.includes('--no-loop')
if (!args[0]) {
  console.error('Kullanım: node scripts/intake-materialize.mjs <taslak.json> [--no-loop]')
  process.exit(1)
}

const taslakYol = resolve(args[0])
if (!existsSync(taslakYol)) {
  console.error(`Dosya bulunamadı: ${taslakYol}`)
  process.exit(1)
}

const taslak = JSON.parse(readFileSync(taslakYol, 'utf8'))

try {
  const sonuc = await taslakiMateryalizeEt(taslak, { loopAtla })
  console.log(`\nMateryalizasyon tamamlandı: ${sonuc.id}`)

  if (!sonuc.loopAtlandi) {
    const { loopSonucu } = sonuc
    console.log('')
    if (loopSonucu.tamamlandi) {
      console.log(`✓ Planlama loop TAMAMLANDI — aktif_asama: ${loopSonucu.state.aktif_asama}`)
    } else {
      console.log(`✗ Planlama loop DURDU/BLOKE — aktif_asama: ${loopSonucu.state.aktif_asama}`)
      console.log(`  blok_nedeni: ${loopSonucu.state.asamalar[loopSonucu.state.aktif_asama]?.blok_nedeni ?? '(yok)'}`)
    }
    console.log(`  executor çağrı sayısı: ${loopSonucu.executorCagriSayisi}`)
    console.log(`  toplam maliyet: $${loopSonucu.maliyet.toplam.toFixed(4)}`)
    if (!loopSonucu.tamamlandi) process.exit(1)
  }
} catch (e) {
  console.error(`HATA: ${e.message}`)
  process.exit(1)
}
