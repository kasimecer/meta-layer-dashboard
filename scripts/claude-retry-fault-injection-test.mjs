// meta-layer-core — claudeCalistirRetry hata-enjeksiyon kanıtı.
// Gerçek `claude` CLI'ya dokunmaz: _claudeCalistir enjeksiyon noktasıyla kontrollü
// sahte-hata senaryoları üretir. Amaç: geçici hatanın GERÇEKTEN kurtarıldığını,
// kalıcı hatanın net+toplu biçimde yüzeye çıktığını kanıtlamak.
// Koşum: node scripts/claude-retry-fault-injection-test.mjs

import { claudeCalistirRetry } from '../tools/canliYurutucu.mjs'

let gecti = 0, kaldi = 0
function ok(ad, kosul, ekBilgi = '') {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
}
function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

// ── SENARYO A — geçici hata: 2 başarısız deneme + 3. denemede kurtarma ─────
bolum('SENARYO A — geçici hata (timeout benzeri) 2x, 3. denemede KURTARMA')

let aCagriSayisi = 0
const aLog = []
async function aSahteCagri(prompt, opts) {
  aCagriSayisi++
  if (aCagriSayisi <= 2) {
    throw new Error(`claude -p zaman aşımı (${opts.zaman_asimi_ms}ms) — SAHTE geçici hata #${aCagriSayisi}`)
  }
  return { metin: 'kurtarılan içerik', maliyet_usd: 0.05, model: opts.model, sure_ms: 1234 }
}

const aBasla = Date.now()
const aSonuc = await claudeCalistirRetry('test prompt', {
  maxDeneme: 3, bekleMs: 20, log: (s) => aLog.push(s),
  _claudeCalistir: aSahteCagri,
})
const aSure = Date.now() - aBasla

ok('3 deneme yapıldı (2 sahte hata + 1 başarı)', aCagriSayisi === 3, `çağrı sayısı: ${aCagriSayisi}`)
ok('sonunda BAŞARILI içerik döndü', aSonuc.metin === 'kurtarılan içerik')
ok('her başarısız deneme log\'a düştü (sessiz yutma yok)',
  aLog.filter(s => s.includes('başarısız')).length === 2, `log: ${JSON.stringify(aLog.filter(s => s.includes('başarısız')))}`)
ok('başarı log\'u "önceki N deneme geçiciydi" diyor', aLog.some(s => s.includes('BAŞARILI') && s.includes('geçiciydi')), aLog.find(s => s.includes('BAŞARILI')))
ok('denemeler arası bekleme gerçekten oldu (artan backoff)', aSure >= 20 + 40, `geçen süre: ${aSure}ms (beklenen ≥60ms)`)

console.log(`  → log akışı: ${JSON.stringify(aLog, null, 2)}`)

// ── SENARYO B — kalıcı hata: TÜM denemeler başarısız → toplu+net hata ──────
bolum('SENARYO B — kalıcı hata: TÜM denemeler başarısız → ABORT + toplu hata mesajı')

let bCagriSayisi = 0
const bLog = []
async function bSahteCagri(prompt, opts) {
  bCagriSayisi++
  throw new Error(`çıkış kodu 1 — SAHTE KALICI hata #${bCagriSayisi}`)
}

let bHataYakalandi = null
try {
  await claudeCalistirRetry('test prompt', {
    maxDeneme: 3, bekleMs: 10, log: (s) => bLog.push(s),
    _claudeCalistir: bSahteCagri,
  })
} catch (e) {
  bHataYakalandi = e
}

ok('tam olarak maxDeneme (3) kez denendi, fazla değil', bCagriSayisi === 3, `çağrı sayısı: ${bCagriSayisi}`)
ok('sonunda hata fırlatıldı (sessizce yutulmadı)', bHataYakalandi !== null)
ok('hata mesajı "3 denemede de başarısız" diyor', bHataYakalandi?.message.includes('3 denemede de başarısız'))
ok('hata mesajı TÜM 3 deneme detayını içeriyor (yalnız sonuncusu değil)',
  bHataYakalandi?.message.includes('SAHTE KALICI hata #1') &&
  bHataYakalandi?.message.includes('SAHTE KALICI hata #2') &&
  bHataYakalandi?.message.includes('SAHTE KALICI hata #3'))
ok('her deneme log\'a düştü', bLog.filter(s => s.includes('başarısız')).length === 3)

console.log(`  → fırlatılan toplu hata:\n${bHataYakalandi?.message.split('\n').map(l => '    ' + l).join('\n')}`)

// ── SENARYO C — ilk denemede başarı: retry-overhead YOK ────────────────────
bolum('SENARYO C — ilk deneme başarılı: gereksiz retry/bekleme YOK')

let cCagriSayisi = 0
async function cSahteCagri(prompt, opts) {
  cCagriSayisi++
  return { metin: 'ilk seferde tamam', maliyet_usd: 0.02, model: opts.model, sure_ms: 500 }
}
const cBasla = Date.now()
const cSonuc = await claudeCalistirRetry('test prompt', {
  maxDeneme: 3, bekleMs: 5000, log: () => {},
  _claudeCalistir: cSahteCagri,
})
const cSure = Date.now() - cBasla

ok('tek çağrı yeterliydi', cCagriSayisi === 1)
ok('sonuç doğru döndü', cSonuc.metin === 'ilk seferde tamam')
ok('gecikme YOK (bekleMs=5000 olmasına rağmen hemen döndü)', cSure < 500, `geçen süre: ${cSure}ms`)

// ── Özet ────────────────────────────────────────────────────────────────────
bolum('SONUÇ')
console.log(`${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
