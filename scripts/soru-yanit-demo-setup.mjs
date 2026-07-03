#!/usr/bin/env node
// CANLI KURULUM — soru-yanıt tarayıcı demosunun ÖN-ADIMI.
//
// GERÇEK pipeline'ı (planlamaBaslat → canliExecutor → claude -p) çalıştırarak
// _demo-soru-yanit-<damga> projesini genesis'in sorular turuna kadar götürür. Kanonik
// registry'ye DOKUNMAZ: tools/planlamaBaslat.mjs'in planlamaBaslat() fonksiyonu literal bir
// projeConfig ile DOĞRUDAN çağrılır — scripts/planlama-baslat.mjs CLI'sinin registry-arama
// sarmalayıcısı (projeConfigOf) bilerek bypass edilir. Bu, ÖNCEKİ soru-yanıt backend demosuyla
// (scripts/planlama-soru-demo.mjs) BİREBİR AYNI emsal — bkz o dosyanın başlık yorumu.
//
// Bu script SADECE kuruluş yapar. Tarayıcıdan yanıtlama + izleyici drenajı + pipeline'ı
// ilerletme AYRI, insan-tetikli adımlardır — aşağıdaki çıktıda listelenir. Bu ayrım kasıtlı:
// materyalizasyon/yanıtlama ile pipeline'ı ilerletmek arasındaki sınır bu görev boyunca hiç
// bozulmaz.
//
// Koşum: node scripts/soru-yanit-demo-setup.mjs

import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { planlamaBaslat } from '../tools/planlamaBaslat.mjs'
import { stateYukle, statePersist } from '../tools/planlamaDurumMakinesiV2.mjs'

// KÜÇÜK HARF ZORUNLU: worker/worker.js'in projeId doğrulaması (/^[a-z0-9_][a-z0-9_-]{0,80}$/)
// yalnız küçük harf kabul eder — ISO damganın "T"si küçültülmeden id Worker'dan HER ZAMAN
// 400 döner (bu, önceki soru-yanıt backend demosunda hiç ortaya çıkmadı çünkü o demo Worker'a
// hiç dokunmuyordu — yalnız burada, gerçek /soru-yanit-queue yolunda görünür).
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).toLowerCase()
const id = `_demo-soru-yanit-${stamp}`
const nsYolu = join(META_DATA_ROOT, 'projeler', id)
const projeConfig = {
  id,
  ad: 'Ofis Bitki Kiralama (demo)',
  aciklama: 'Küçük ofisler için aylık bitki kiralama + bakım aboneliği — soru-yanıt tarayıcı demosu.',
}

console.log(`▶ KURULUM — ${id}`)
console.log(`  Namespace: ${nsYolu}`)
console.log(`  Model: claude-sonnet-4-6 | Auth: abonelik OAuth | --safe-mode | GERÇEK koşucu (mock değil)\n`)

// Katı evrensel sayı-kapısı ara sıra bir yeniden-üretimi reddedebilir (bilinen, önceki soru–yanıt
// backend demosunda da görülen davranış — kapı doğru çalışıyor). Aşamayı yeniden-aç + tekrar dene.
async function koşYenidenDeneyerek(maxDeneme = 4) {
  for (let d = 1; d <= maxDeneme; d++) {
    const sonuc = await planlamaBaslat(nsYolu, id, projeConfig, { log: (s) => console.log(s) })
    if (sonuc.durdu !== 'donduruldu') return sonuc
    console.log(`\n⚠ genesis kapıdan geçemedi (deneme ${d}/${maxDeneme}): ${sonuc.state.asamalar.genesis.blok_nedeni}`)
    if (d < maxDeneme) {
      const st = stateYukle(nsYolu, id)
      st.asamalar.genesis.durum = 'bekliyor'
      st.asamalar.genesis.blok_nedeni = null
      statePersist(nsYolu, st)
      console.log('  yeniden koşuluyor...')
    }
  }
  return null
}

const sonuc = await koşYenidenDeneyerek()
if (!sonuc) {
  console.error('\n✗ genesis, denemelerde kapıdan geçemedi (model uyumsuz üretti).')
  process.exit(1)
}
console.log(`\n→ durdu=${sonuc.durdu}${sonuc.maliyet?.toplam ? `, maliyet=$${sonuc.maliyet.toplam.toFixed(4)}` : ''}`)

if (sonuc.durdu !== 'sorular-acik') {
  console.error(`\n✗ Beklenmeyen durak (sorular-acik bekleniyordu): ${sonuc.durdu}`)
  process.exit(1)
}

console.log(`\n✓ genesis sorular turu hazır: ${sonuc.acikSorular.length} açık soru, ${sonuc.ertelenenSorular?.length ?? 0} ertelenen.`)
for (const q of sonuc.acikSorular) console.log(`    • [${q.tip}] ${q.anahtar}`)

console.log(`\nSıradaki adımlar (insan-tetikli, ayrı):`)
console.log(`  1. node scripts/build-card-data.js                 # public/sorular-${id}.json üret`)
console.log(`  2. npm run dev                                     # local dev server`)
console.log(`  3. Tarayıcıda aç: #/sorular/${id}                  # yanıtla + gönder`)
console.log(`  4. node scripts/soru-yanit-queue-watch.mjs --once   # kuyruğu drene et (gönderimden sonra)`)
console.log(`  5. Pipeline'ı ilerlet (bu KURULUMUN AYNI bypass deseniyle, ayrı elle çağrı) —`)
console.log(`     bu, "gönderim pipeline'ı tetiklemez" ispatının insan-tetikli yarısıdır.`)
console.log(`\nProje id: ${id}`)
