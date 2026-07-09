// meta-layer-core — claudeCalistirRetry hata-enjeksiyon kanıtı.
// Gerçek `claude` CLI'ya dokunmaz: _claudeCalistir enjeksiyon noktasıyla kontrollü
// sahte-hata senaryoları üretir. Amaç: geçici hatanın GERÇEKTEN kurtarıldığını,
// kalıcı hatanın net+toplu biçimde yüzeye çıktığını kanıtlamak.
// Koşum: node scripts/claude-retry-fault-injection-test.mjs

import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { claudeCalistirRetry, guvenliYaz, ScopeLockHatasi } from '../tools/canliYurutucu.mjs'

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

// ── SENARYO D — guvenliYaz: gerçek dizinde, injection YOK — uçtan-uca mekanik kanıt ────────
bolum('SENARYO D — guvenliYaz (gerçek fs, injection yok): yazım + geri-okuma doğrulaması + temp-artık YOK')

const dNs = mkdtempSync(join(tmpdir(), 'guvenli-yaz-test-'))
try {
  const dIcerik = '# Test Bölümü\n\nBu içerik gerçek dosya sistemine yazılacak. [operator-beyan:test]\n'
  const dHedef = join(dNs, 'alt-dizin', 'butce-finansal.md')
  const dYol = guvenliYaz(dHedef, dIcerik, dNs)

  ok('D: guvenliYaz hedef mutlak yolu döndürdü', dYol.endsWith('butce-finansal.md'))
  ok('D: dosya GERÇEKTEN diskte var', existsSync(dHedef))
  ok('D: diskteki içerik YAZILANLA harfiyen aynı', readFileSync(dHedef, 'utf8') === dIcerik)

  const dKalanlar = readdirSync(join(dNs, 'alt-dizin'))
  ok('D: geçici (.tmp-*) dosya ARTIĞI kalmadı (yalnız hedef dosya var)',
    dKalanlar.length === 1 && dKalanlar[0] === 'butce-finansal.md', `dizin: ${JSON.stringify(dKalanlar)}`)
} finally { rmSync(dNs, { recursive: true, force: true }) }

// ── SENARYO E — guvenliYaz: geçici geri-okuma uyuşmazlığı (2x) + 3. denemede KURTARMA ──────
bolum('SENARYO E — guvenliYaz: geçici geri-okuma uyuşmazlığı 2x, 3. denemede DOĞRULANMIŞ yazım')

const eNs = mkdtempSync(join(tmpdir(), 'guvenli-yaz-test-'))
try {
  const eIcerik = '# Bütçe ve Finansallar\n\nBaşlangıç maliyeti doğrulanmıştır. [dogrulandi:x] [tip:icbilgi]\n'
  const eHedef = join(eNs, 'butce-finansal.md')

  let eOkumaSayisi = 0
  const eSahteOku = (yol, enc) => {
    eOkumaSayisi++
    if (eOkumaSayisi <= 2) return eIcerik.slice(0, 10) // KIRPILMIŞ okuma — senkron-yarışı simülasyonu
    return readFileSync(yol, enc) // 3. denemede GERÇEK (doğru) okuma
  }

  const eYol = guvenliYaz(eHedef, eIcerik, eNs, { _readFileSync: eSahteOku })

  ok('E: 3 okuma denemesi yapıldı (2 sahte uyuşmazlık + 1 doğrulanmış)', eOkumaSayisi === 3, `okuma sayısı: ${eOkumaSayisi}`)
  ok('E: sonunda BAŞARILI (mutlak hedef yolu döndü)', eYol === eHedef, eYol)
  ok('E: dosya diskte DOĞRU (tam, kırpılmamış) içerikle duruyor', readFileSync(eHedef, 'utf8') === eIcerik)
} finally { rmSync(eNs, { recursive: true, force: true }) }

// ── SENARYO F — guvenliYaz: KALICI geri-okuma uyuşmazlığı → ABORT + net/toplu hata (fail loud) ──
bolum('SENARYO F — guvenliYaz: KALICI uyuşmazlık — TÜM denemeler başarısız → fail-loud (SESSİZCE KABUL YOK)')

const fNs = mkdtempSync(join(tmpdir(), 'guvenli-yaz-test-'))
try {
  const fIcerik = '# Riskler ve Varsayımlar\n\nEn kritik varsayım budur. [operator-beyan:x]\n'
  const fHedef = join(fNs, 'risk-varsayimlar.md')

  let fOkumaSayisi = 0
  const fSahteOku = () => { fOkumaSayisi++; return 'HER ZAMAN KIRPILMIŞ/YANLIŞ İÇERİK' }

  let fHataYakalandi = null
  try {
    guvenliYaz(fHedef, fIcerik, fNs, { maxDeneme: 3, _readFileSync: fSahteOku })
  } catch (e) { fHataYakalandi = e }

  ok('F: tam olarak maxDeneme (3) kez denendi', fOkumaSayisi === 3, `okuma sayısı: ${fOkumaSayisi}`)
  ok('F: sonunda hata fırlatıldı (SESSİZCE KABUL EDİLMEDİ)', fHataYakalandi !== null)
  ok('F: hata mesajı "DOĞRULANMIŞ yazım başarısız" diyor', fHataYakalandi?.message.includes('DOĞRULANMIŞ yazım başarısız'))
  ok('F: hata mesajı TÜM 3 deneme detayını içeriyor',
    fHataYakalandi?.message.includes('deneme 1/3') && fHataYakalandi?.message.includes('deneme 2/3') && fHataYakalandi?.message.includes('deneme 3/3'))
} finally { rmSync(fNs, { recursive: true, force: true }) }

// ── SENARYO G — guvenliYaz: scope-lock REGRESYON-KANITI (yeni retry-mantığı eski güvenliği BOZMADI) ──
bolum('SENARYO G — guvenliYaz: namespace-dışı yazım hâlâ ScopeLockHatasi fırlatıyor (regresyon-kanıtı)')

const gNs = mkdtempSync(join(tmpdir(), 'guvenli-yaz-test-'))
try {
  let gHataYakalandi = null
  try {
    guvenliYaz(join(tmpdir(), 'namespace-disi-dosya.md'), 'x', gNs)
  } catch (e) { gHataYakalandi = e }
  ok('G: namespace dışına yazma GERİ ÇEVRİLDİ', gHataYakalandi instanceof ScopeLockHatasi)
} finally { rmSync(gNs, { recursive: true, force: true }) }

// ── Özet ────────────────────────────────────────────────────────────────────
bolum('SONUÇ')
console.log(`${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
