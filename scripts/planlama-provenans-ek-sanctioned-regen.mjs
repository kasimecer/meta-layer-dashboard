// meta-layer-core — TEK SEFERLİK, YETKİLİ (sanctioned) regenerasyon.
//
// Bu script GENEL pipeline döngüsünün (birimKostur/birimSorulariUretVeYaz) BİR PARÇASI DEĞİLDİR —
// bilerek ayrı ve dar kapsamlı tutuldu (tek proje, tek bölüm, tek çağrı). Amaç: tools/
// planlamaUretimKaydi.mjs mekanizmasını GERÇEK proje verisi üzerinde, TEK bir yeni sürüm
// üreterek kanıtlamak — fotball-podcast-2026-07-09'un provenans-ek bölümü için.
//
// ÖNCÜL: provenans-ek-sorular-v2.json (surum 2) — docs/OPERATOR_ARTIFACT_SURVEY.md §4'te
// ölçülen, 623 kayıtlı dosyanın TA KENDİSİ. Kaynak: master-plan--provenans-ek-v2.md (DEĞİŞMEDİ,
// v3.md ile byte-for-byte özdeş olduğu doğrulanmıştı).
// YENİ: provenans-ek-sorular-v4.json + provenans-ek-tasima-defteri-v4.json — v3'ün YANINA,
// ONU DEĞİŞTİRMEDEN. planlama-durum.json'daki CANLI işaretçi (sorular_surum=3, durum=gecti)
// BU SCRIPT TARAFINDAN DEĞİŞTİRİLMEZ — bu, pipeline'ı ilerletmeyen, mekanizmayı kanıtlayan
// bağımsız bir artefakt üretimidir.
//
// DONDURULMUŞ KÜME: predecessor (v2) dosyası + projedeki HER answer/skip/consent dosyası
// (provenans-ek-yanitlar.json [v1], provenans-ek-yanitlar-v3.json) md5 ÖNCESİ/SONRASI
// birebir aynı olmalı. Yalnız İKİ yeni dosya yazılır; başka HİÇBİR dosyaya dokunulmaz.
//
// İMZA: imzaHesapla BU SCRIPT TARAFINDAN DEĞİŞTİRİLMEZ/GENİŞLETİLMEZ. Yeni paketin kendi imzası
// kendi içeriğiyle tutarlı olmalı (sorulariDogrula) — DEĞİLSE script DURUR, hiçbir şey yazmaz.
//
// Koşum: node scripts/planlama-provenans-ek-sanctioned-regen.mjs

import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { META_DATA_ROOT } from './config.js'
import { varsayilanSoruUretici, sorulariOku, yanitlariHamOku, sorulariYaz, sorulariDogrula, imzaHesapla } from '../tools/planlamaSorular.mjs'
import { paketiUretimKaydiIleTamamlaVeTasi, tasimaDefteriYaz, tasimaDefteriDosyaAdi } from '../tools/planlamaUretimKaydi.mjs'

const GERCEK_ID = 'fotball-podcast-2026-07-09'
const ASAMA = 'provenans-ek'
const ONCEKI_SURUM = 2
const ONCEKI_DOSYA = 'provenans-ek-sorular-v2.json'
const KAYNAK_DOSYA = 'master-plan--provenans-ek-v2.md'
const HEDEF_SURUM = 4

const nsYolu = join(META_DATA_ROOT, 'projeler', GERCEK_ID)

function md5(dosyaYolu) {
  return createHash('md5').update(readFileSync(dosyaYolu)).digest('hex')
}

function log(s = '') { console.log(s) }

log(`═══ Yetkili regenerasyon — ${GERCEK_ID} / ${ASAMA} — öncül v${ONCEKI_SURUM} → yeni v${HEDEF_SURUM} ═══\n`)

// ── 0. Ön koşullar ──────────────────────────────────────────────────────────────────────────
const yeniDosyaYolu = join(nsYolu, `provenans-ek-sorular-v${HEDEF_SURUM}.json`)
const yeniDefterYolu = join(nsYolu, tasimaDefteriDosyaAdi(ASAMA, HEDEF_SURUM))
if (existsSync(yeniDosyaYolu)) {
  console.error(`DURDU: ${yeniDosyaYolu} zaten var — yetkili tek-koşum kuralı (üzerine yazılmaz).`)
  process.exit(1)
}
if (existsSync(yeniDefterYolu)) {
  console.error(`DURDU: ${yeniDefterYolu} zaten var.`)
  process.exit(1)
}

const kodSurumu = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }).trim()
const kirliCikti = execFileSync('git', ['status', '--porcelain'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }).trim()
const kodKirli = kirliCikti.length > 0
log(`kod_surumu = ${kodSurumu}${kodKirli ? '  (UYARI: çalışma ağacı kirli — commit HEAD tam olarak bu üretimi yansıtmayabilir)' : '  (temiz çalışma ağacı)'}`)

// ── 1. Dondurulacak dosyaların ÖNCESİ md5'i ────────────────────────────────────────────────
const dondurulanDosyalar = [
  ONCEKI_DOSYA, KAYNAK_DOSYA,
  'provenans-ek-yanitlar.json',       // v1 yanıtları
  'provenans-ek-yanitlar-v3.json',    // v3 yanıtları (GERÇEK operatör kararları — CANLI/güncel)
  'provenans-ek-sorular.json',        // v1 sorular
  'provenans-ek-sorular-v3.json',     // v3 sorular (CANLI işaretçinin gösterdiği paket)
  'planlama-durum.json',              // canlı işaretçi — DEĞİŞMEMELİ
].filter(f => existsSync(join(nsYolu, f)))

const md5Once = Object.fromEntries(dondurulanDosyalar.map(f => [f, md5(join(nsYolu, f))]))
log('\n── md5 ÖNCESİ (dondurulacak küme) ──')
for (const f of dondurulanDosyalar) log(`  ${f}: ${md5Once[f]}`)

// ── 2. Öncülü oku ───────────────────────────────────────────────────────────────────────────
const oncekiPaket = sorulariOku(nsYolu, ASAMA, ONCEKI_SURUM)
if (!oncekiPaket) { console.error('DURDU: öncül paket okunamadı.'); process.exit(1) }
const oncekiToplam = oncekiPaket.sorular.length + (oncekiPaket.ertelenen?.length ?? 0)
log(`\nöncül (v${ONCEKI_SURUM}) toplam kayıt: ${oncekiToplam}`)

const oncekiYanitHam = yanitlariHamOku(nsYolu, ASAMA, ONCEKI_SURUM)
const oncekiYanitlar = oncekiYanitHam.durum === 'gecerli' || oncekiYanitHam.durum === 'var' ? (oncekiYanitHam.ham?.yanitlar ?? []) : []
log(`öncül (v${ONCEKI_SURUM}) yanıt dosyası durumu: ${oncekiYanitHam.durum} (${oncekiYanitlar.length} kayıt)`)

// ── 3. Yeni paketi üret (MEVCUT, DEĞİŞTİRİLMEMİŞ dataRequestAdaylari/varsayilanSoruUretici) ──
const kaynakIcerik = readFileSync(join(nsYolu, KAYNAK_DOSYA), 'utf8')
const yeniPaketHam = varsayilanSoruUretici(ASAMA, kaynakIcerik, { projeId: GERCEK_ID, surum: HEDEF_SURUM })

// ── 4. İMZA GÜVENCESİ — genişletme/değişiklik YOK, yalnız kendi-tutarlılık ──────────────────
try {
  sorulariDogrula(yeniPaketHam)
} catch (e) {
  console.error(`DURDU: yeni paket kendi imzasıyla tutarsız (${e.message}) — hiçbir şey yazılmadı.`)
  process.exit(1)
}

// ── 5. Üretim kaydı + taşıma sınıflandırması ────────────────────────────────────────────────
const { paket: yeniPaket, defter, siniflandirma } = paketiUretimKaydiIleTamamlaVeTasi({
  nsYolu, projeId: GERCEK_ID, asama: ASAMA,
  oncekiDosyaAdi: ONCEKI_DOSYA, oncekiSurum: ONCEKI_SURUM,
  oncekiPaket, oncekiYanitlar,
  yeniPaket: yeniPaketHam, kodSurumu, kodKirli,
})

const siniflandirmaToplam = siniflandirma.carried.length + siniflandirma.carried_with_text_drift.length + siniflandirma.unmatched_stamped.length
if (siniflandirmaToplam !== oncekiToplam) {
  console.error(`DURDU: sınıflandırma toplamı (${siniflandirmaToplam}) öncül toplamla (${oncekiToplam}) EŞLEŞMİYOR — sessiz kayıp riski, hiçbir şey yazılmadı.`)
  process.exit(1)
}

// ── 6. İmza kapsamı SIZMADI mı — son kez doğrula (paket.uretim_kaydi eklendikten SONRA) ─────
if (imzaHesapla(yeniPaket.asama, yeniPaket.surum, yeniPaket.sorular) !== yeniPaket.imza) {
  console.error('DURDU: uretim_kaydi eklendikten sonra imza tutarsız hâle geldi (BEKLENMEZ) — hiçbir şey yazılmadı.')
  process.exit(1)
}
try {
  sorulariDogrula(yeniPaket)
} catch (e) {
  console.error(`DURDU: uretim_kaydi'li paket sorulariDogrula'dan geçmiyor (${e.message}) — hiçbir şey yazılmadı.`)
  process.exit(1)
}

log(`\n── Sınıflandırma (öncül ${oncekiToplam} kayıt → yeni v${HEDEF_SURUM}) ──`)
log(`  carried                 : ${siniflandirma.carried.length}`)
log(`  carried_with_text_drift : ${siniflandirma.carried_with_text_drift.length}`)
log(`  unmatched_stamped       : ${siniflandirma.unmatched_stamped.length}`)
const sonekPatlamasi = siniflandirma.unmatched_stamped.filter(u => u.neden === 'sonek-patlamasi-eski-hata').length
const belirsiz = siniflandirma.unmatched_stamped.filter(u => u.belirsiz).length
log(`    - sonek-patlamasi-eski-hata: ${sonekPatlamasi}`)
log(`    - belirsiz (bilinen neden yok): ${belirsiz}`)
log(`  TOPLAM: ${siniflandirmaToplam} (öncül ${oncekiToplam} ile birebir)`)
log(`  karar_tasindi: ${defter.ozet.karar_tasindi}  |  karar_yetim_kaldi: ${defter.ozet.karar_yetim_kaldi}`)
if (defter.ozet.karar_yetim_kaldi > 0) {
  log(`  ⚠ UYARI: ${defter.ozet.karar_yetim_kaldi} operatör kararı yetim kaldı — bu durum GİZLENMİYOR.`)
}

// ── 7. YAZ — yalnız iki YENİ dosya ───────────────────────────────────────────────────────────
const yazilanPaketYolu = sorulariYaz(nsYolu, yeniPaket)
const yazilanDefterYolu = tasimaDefteriYaz(nsYolu, defter)
log(`\nYAZILDI: ${yazilanPaketYolu}`)
log(`YAZILDI: ${yazilanDefterYolu}`)

// ── 8. md5 SONRASI — dondurulmuş küme birebir aynı mı ───────────────────────────────────────
log('\n── md5 SONRASI (dondurulmuş küme doğrulaması) ──')
let dondurulmusIhlalVarMi = false
for (const f of dondurulanDosyalar) {
  const sonra = md5(join(nsYolu, f))
  const ayni = sonra === md5Once[f]
  if (!ayni) dondurulmusIhlalVarMi = true
  log(`  ${f}: ${sonra} ${ayni ? '(AYNI ✓)' : '(!!! DEĞİŞTİ !!!)'}`)
}
if (dondurulmusIhlalVarMi) {
  console.error('\n✗✗✗ DONDURULMUŞ KÜME İHLAL EDİLDİ — bu ciddi bir hata, derhal rapor edin. ✗✗✗')
  process.exit(1)
}
log('\n✓ Dondurulmuş kümenin TAMAMI (öncül paket + KAYNAK .md + tüm yanıt dosyaları + planlama-durum.json) birebir aynı kaldı.')
log(`✓ Yalnız İKİ yeni dosya yazıldı: provenans-ek-sorular-v${HEDEF_SURUM}.json, ${tasimaDefteriDosyaAdi(ASAMA, HEDEF_SURUM)}`)
log(`✓ planlama-durum.json'daki canlı işaretçi (sorular_surum=3) DOKUNULMADI — bu üretim pipeline'ı İLERLETMEDİ, yalnız mekanizmayı kanıtladı.`)
