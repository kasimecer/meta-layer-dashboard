#!/usr/bin/env node
// CLI giriş noktası — elle çağırma (yedek yol). Ortak mantık tools/intakeMateryalizeEt.mjs'de;
// scripts/intake-queue-watch.mjs (Worker-kuyruğu → yerel izleyici) da AYNI mantığı kullanır.
// Kullanım: node scripts/intake-materialize.mjs <taslak.json>
//
// Bu komut YALNIZ materyalize eder — planlama pipeline'ını BAŞLATMAZ (kasıtlı ayrım).
// Pipeline'ı başlatmak/devam ettirmek için: node scripts/planlama-baslat.mjs <id>

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { taslakiMateryalizeEt } from '../tools/intakeMateryalizeEt.mjs'

const args = process.argv.slice(2)
if (!args[0]) {
  console.error('Kullanım: node scripts/intake-materialize.mjs <taslak.json>')
  process.exit(1)
}

const taslakYol = resolve(args[0])
if (!existsSync(taslakYol)) {
  console.error(`Dosya bulunamadı: ${taslakYol}`)
  process.exit(1)
}

const taslak = JSON.parse(readFileSync(taslakYol, 'utf8'))

try {
  const sonuc = await taslakiMateryalizeEt(taslak)
  console.log(`\nMateryalizasyon tamamlandı: ${sonuc.id}`)
  console.log(`\nPlanlama pipeline'ını başlatmak için: node scripts/planlama-baslat.mjs ${sonuc.id}`)
} catch (e) {
  console.error(`HATA: ${e.message}`)
  process.exit(1)
}
