#!/usr/bin/env node
// Planlama pipeline'ını (genesis→premise→arastirma→strateji→master-plan) İNSAN eliyle,
// açık komutlarla ADIM ADIM ilerleten tek yer. Materyalizasyondan (intake-materialize.mjs,
// intake-queue-watch.mjs) BİLEREK ayrı — hiçbir kod yolu bu scripti kendiliğinden çağırmaz.
//
// ONAY-KAPILI MODEL (bir-koşum-bir-karar): her çağrı EN ÇOK bir aşama koşturur, yapısal
// kapısını uygular, sonra aşama SINIRINDA DURUR ve kontrolü insana verir. İnsan çıktıyı
// (Drive'daki .md) inceler, gerekirse ELLE düzenler, sonra tekrar çağırarak ilerletir —
// ya da --geri ile daha erken bir aşamaya döner. Çoklu-aşama oto-ilerleme YOKTUR.
//
// Kullanım:
//   node scripts/planlama-baslat.mjs                    # projeleri + durumlarını listeler
//   node scripts/planlama-baslat.mjs <id>               # sıradaki tek aşamayı koştur / onayla-ilerle
//   node scripts/planlama-baslat.mjs <id> --geri <asama> # sıhhatli geri-dönüş (yeniden-açar)
//   node scripts/planlama-baslat.mjs <id> --tut          # bayat/yeniden-açık aşamayı olduğu-gibi kabul et

import { readFileSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { META_DATA_ROOT } from './config.js'
import { planlamaBaslat, planlamaGeri } from '../tools/planlamaBaslat.mjs'
import {
  ASAMA_SIRASI, GERCEK_ASAMALAR, stateYukle, bayatAsamalar, bayatMi, ustAsama,
} from '../tools/planlamaDurumMakinesiV2.mjs'
import { atlaYaz, yanitDosyaAdi } from '../tools/planlamaSorular.mjs'
import { acikSoruDurum } from '../tools/planlamaDurumOzeti.mjs'

const KANONIK_REGISTRY = join(META_DATA_ROOT, 'projeler', 'registry.json')
const PUBLIC_REGISTRY  = new URL('../public/registry.json', import.meta.url).pathname

function oku(yol) { return JSON.parse(readFileSync(yol, 'utf8')) }
function nsYoluOf(id) { return join(META_DATA_ROOT, 'projeler', id) }
function gorPath(yol) { return yol ? relative(process.cwd(), yol) : '(yok)' }
function KOMUT(id, ek = '') { return `node scripts/planlama-baslat.mjs ${id}${ek}` }

function projeleriOku() {
  // Kanonik (Drive) esastır; yoksa repo public kopyasına düş (yalnız görünürlük için).
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

// ── Listeleme: onay-bekliyor + bayat + AÇIK SORULAR bilgisini yüzeye çıkarır ──────
function durumOzetiCikar(id) {
  const nsYolu = nsYoluOf(id)
  const durumYolu = join(nsYolu, 'planlama-durum.json')
  if (!existsSync(durumYolu)) return { etiket: 'başlamadı', detay: '' }

  const state = stateYukle(nsYolu, id)
  const bayatlar = bayatAsamalar(state)
  const bayatEk = bayatlar.length ? `  ⟂ bayat: ${bayatlar.join(', ')}` : ''

  if (state.aktif_asama === 'tamamlandi') {
    return { etiket: 'tamamlandı', detay: bayatEk.trim() ? `(bayat var: ${bayatlar.join(', ')})` : '' }
  }

  const A = state.aktif_asama
  const As = state.asamalar[A]
  const gectiSayisi = GERCEK_ASAMALAR.filter(a => state.asamalar?.[a]?.durum === 'gecti').length

  if (As?.durum === 'donduruldu') {
    return { etiket: 'BLOKE', detay: `${A} — ${As.blok_nedeni ?? '(neden bilinmiyor)'}${bayatEk}` }
  }
  // AÇIK SORULAR — operatörü bekleyen terminal yapılacaklar (onay-bekliyor’un üstünde önceliklidir).
  const asd = acikSoruDurum(nsYolu, state)
  if (As?.durum === 'onay-bekliyor' && asd && (asd.acik.length > 0 || asd.butunluk !== 'gecerli')) {
    const bozukEk = asd.butunluk !== 'gecerli' ? ' (yanıt BOZUK — yeniden yayında)' : ''
    return { etiket: 'AÇIK SORULAR', detay: `${A} — ${asd.acik.length} açık soru bekliyor${bozukEk}${bayatEk}` }
  }
  if (As?.durum === 'onay-bekliyor') {
    const sonraki = ASAMA_SIRASI[ASAMA_SIRASI.indexOf(A) + 1]
    return { etiket: 'ONAY BEKLİYOR', detay: `${A} bitti — sıradaki: ${sonraki}${bayatEk}` }
  }
  if (As?.durum === 'gecti' && bayatMi(state, A)) {
    return { etiket: 'BAYAT KARAR', detay: `${A} (yeniden-koş: düz çağrı / olduğu-gibi: --tut)${bayatEk}` }
  }
  const yenidenAcik = (As?.surum ?? 0) >= 1 && As?.durum === 'bekliyor'
  const not = yenidenAcik ? ' (yeniden-açık — koşuma hazır)' : ''
  return { etiket: 'kısmi', detay: `${gectiSayisi}/${GERCEK_ASAMALAR.length} aşama geçti — sıradaki: ${A}${not}${bayatEk}` }
}

function listele() {
  const projeler = projeleriOku()
  if (projeler.length === 0) {
    console.log('Registry boş veya bulunamadı (ne kanonik ne public).')
    return
  }
  console.log(`${projeler.length} proje — planlama durumu:\n`)
  for (const p of projeler) {
    const { etiket, detay } = durumOzetiCikar(p.id)
    const satir = `  ${p.id.padEnd(30)} [${etiket}]`
    console.log(detay ? `${satir} ${detay}` : satir)
  }
  console.log('\nSıradaki tek aşamayı koştur / onayla-ilerle : ' + KOMUT('<id>'))
  console.log('Daha erken bir aşamaya geri dön            : ' + KOMUT('<id>', ' --geri <asama>'))
  console.log('Bayat aşamayı olduğu-gibi kabul et         : ' + KOMUT('<id>', ' --tut'))
}

// ── Durum raporu (her durakta net Türkçe + tam komutlar) ──────────────────────
function seceneklerYaz(id) {
  console.log('\n  Seçenekler:')
  console.log(`    • Devam (onayla + sıradakini koştur): ${KOMUT(id)}`)
  console.log(`    • Geri dön (daha erken aşama)        : ${KOMUT(id, ' --geri <asama>')}`)
  console.log(`      geçerli hedefler                   : ${GERCEK_ASAMALAR.join(' · ')}`)
}

function raporYaz(id, sonuc) {
  const state = sonuc.state
  console.log('')
  switch (sonuc.durdu) {
    case 'tamamlandi': {
      console.log(`✓ Planlama pipeline TAMAMLANDI — ${id}`)
      for (const a of GERCEK_ASAMALAR) {
        const s = state.asamalar[a]
        console.log(`    ${a.padEnd(12)} sürüm ${s.surum}  → ${gorPath(s.cikti_pointer)}`)
      }
      const bayatlar = bayatAsamalar(state)
      if (bayatlar.length) console.log(`  ⚠ bayat aşama(lar) var: ${bayatlar.join(', ')}`)
      break
    }
    case 'onay-bekliyor': {
      const a = sonuc.bekleyenOnay
      const s = state.asamalar[a]
      const sonraki = ASAMA_SIRASI[ASAMA_SIRASI.indexOf(a) + 1]
      console.log(`■ AŞAMA BİTTİ, ONAY BEKLİYOR — ${a}  (proje: ${id})`)
      console.log(`  Yapısal kapı  : GEÇTİ`)
      console.log(`  Çıktı (sürüm ${s.surum}): ${gorPath(s.cikti_pointer)}`)
      console.log(`  Sıradaki aşama: ${sonraki}`)
      console.log(`\n  İnceleyin (gerekirse .md'yi ELLE düzenleyin), sonra:`)
      console.log(`    • Onayla + ${sonraki} aşamasını koştur: ${KOMUT(id)}`)
      console.log(`      (yeniden çağırınca ${a} önce mevcut yapısal kapıdan YENİDEN geçirilir;`)
      console.log(`       el-düzenlemeniz kapıyı bozduysa ilerlemez, dondurur.)`)
      console.log(`    • Daha erken bir aşamaya geri dön     : ${KOMUT(id, ' --geri <asama>')}`)
      break
    }
    case 'sorular-acik': {
      const a = sonuc.bekleyenOnay
      const ss = sonuc.sorularSurum
      const yanitYol = join(nsYoluOf(id), yanitDosyaAdi(a, ss))
      console.log(`◧ AÇIK SORULAR — ${a}  (proje: ${id})  [${sonuc.acikSorular.length} açık]`)
      if (sonuc.butunlukHatasi) {
        console.log(`  ⚠ Yanıt artefaktı BOZUK: ${sonuc.butunlukHatasi}`)
        console.log(`    → Sorular yeniden yayınlandı; geçerli bir yanıt dosyası yazana dek İLERLENMEZ.`)
      }
      console.log(`  Yanıt dosyası (elle düzenleyin — sürüm ${ss}): ${gorPath(yanitYol)}`)
      console.log(`  Soru artefaktı: ${gorPath(join(nsYoluOf(id), `${a}${(ss ?? 1) <= 1 ? '' : '-v' + ss}-sorular.json`))}`)
      console.log(`\n  Yanıtlanacak sorular (Türkçe; APPROVAL = bu komutu tekrar çalıştırmak):`)
      for (const q of sonuc.acikSorular) {
        console.log(`\n  • [${q.tip}] ${q.metin}`)
        console.log(`      anahtar: ${q.anahtar}`)
        if (q.tip === 'CHOICE') {
          console.log(`      seçenekler (öneri İLK): ${q.secenekler.map((o, i) => (i === 0 ? `«${o}»` : o)).join('  |  ')}`)
          console.log(`      yanıt kaydı: { "anahtar": "${q.anahtar}", "secim": "<seçenek metni>" }`)
        } else if (q.tip === 'DATA-REQUEST') {
          console.log(`      seçenekler: ${q.secenekler.join('  |  ')}`)
          console.log(`      yanıt kaydı: { "anahtar": "${q.anahtar}", "karar": "veri|tahmin|dusur", "deger": "...", "kaynak": "..." }`)
        } else if (q.tip === 'FREE-TEXT') {
          console.log(`      yanıt kaydı: { "anahtar": "${q.anahtar}", "metin": "..." }`)
        }
        console.log(`      atla (açık komut): ${KOMUT(id, ` --atla ${q.anahtar}`)}`)
      }
      if (sonuc.ertelenenSorular?.length) {
        console.log(`\n  Ertelenen (bloklamaz, görünür): ${sonuc.ertelenenSorular.map(q => `${q.tip}:${q.anahtar}`).join(', ')}`)
      }
      console.log(`\n  Yanıt dosyasını yazın, sonra onaylayıp ilerleyin: ${KOMUT(id)}`)
      console.log(`  Bir soruyu açıkça atlamak için         : ${KOMUT(id, ' --atla <anahtar> [--gerekce "…"]')}`)
      break
    }
    case 'bayat-karar': {
      const a = sonuc.bayatAsama
      const s = state.asamalar[a]
      const ust = ustAsama(a)
      console.log(`◧ BAYAT AŞAMA — KARAR BEKLİYOR — ${a}  (proje: ${id})`)
      console.log(`  Neden bayat   : üst aşama (${ust}) yeni sürüme geçti; ${a} eski sürüme göre inşa edilmişti`)
      console.log(`  Mevcut çıktı (sürüm ${s.surum}, korunuyor): ${gorPath(s.cikti_pointer)}`)
      console.log(`\n  Bu aşama için SEÇİN (biri):`)
      console.log(`    • Yeniden koş (yeni sürüm üret)      : ${KOMUT(id)}`)
      console.log(`    • Olduğu gibi kabul et (LLM yok)     : ${KOMUT(id, ' --tut')}`)
      console.log(`    • Daha da geri dön                   : ${KOMUT(id, ' --geri <asama>')}`)
      break
    }
    case 'kosum-gerekli': {
      const a = sonuc.sonrakiAsama
      console.log(`▷ SIRADAKİ AŞAMA KOŞUMA HAZIR — ${a}  (proje: ${id})`)
      console.log(`    • Koştur: ${KOMUT(id)}`)
      break
    }
    case 'donduruldu':
    default: {
      const a = state.aktif_asama
      const s = state.asamalar[a]
      console.log(`✗ BLOKE — ${a}  (proje: ${id})`)
      console.log(`  blok_nedeni: ${s?.blok_nedeni ?? '(yok)'}`)
      console.log(`  Çıktı      : ${gorPath(s?.cikti_pointer)}`)
      console.log(`\n  Çıktıyı (.md) düzeltip tekrar çağırın; yapısal kapı yeniden denenir:`)
      console.log(`    • Yeniden dene: ${KOMUT(id)}`)
      console.log(`    • Geri dön    : ${KOMUT(id, ' --geri <asama>')}`)
      break
    }
  }
  console.log(`\n  Maliyet (bu çağrı): $${sonuc.maliyet.toplam.toFixed(4)} | executor çağrısı: ${sonuc.executorCagriSayisi}`)
}

// ── Eylemler ──────────────────────────────────────────────────────────────────
function projeConfigOf(id) {
  const projeler = projeleriOku()
  const kayit = projeler.find(p => p.id === id)
  if (!kayit) {
    console.error(`HATA: proje registry'de bulunamadı: ${id}`)
    console.error('Önce materyalize edilmeli: node scripts/intake-materialize.mjs <taslak.json>')
    process.exit(1)
  }
  return { id, ad: kayit.ad, aciklama: kayit.ozet }
}

async function baslat(id, mod) {
  const projeConfig = projeConfigOf(id)
  const nsYolu = nsYoluOf(id)
  const modEtiket = mod === 'tut' ? 'OLDUĞU-GİBİ-KABUL (--tut)' : 'ileri (bir aşama)'
  console.log(`▶ Planlama — ${id}  [${modEtiket}]`)
  console.log(`  Namespace: ${nsYolu}`)
  console.log(`  Model: claude-sonnet-4-6 | Auth: abonelik OAuth | --safe-mode\n`)

  const sonuc = await planlamaBaslat(nsYolu, id, projeConfig, { mod, log: (s) => console.log(s) })
  raporYaz(id, sonuc)
  // Bloke/karar-bekleyen durumda non-zero: otomasyon fark etsin (ama bu İNSAN akışı).
  if (sonuc.durdu === 'donduruldu') process.exit(1)
}

function geriYap(id, hedef) {
  projeConfigOf(id) // registry doğrulaması
  const nsYolu = nsYoluOf(id)
  let state
  try {
    state = planlamaGeri(nsYolu, id, hedef) // geçersizse throw → state DEĞİŞMEZ
  } catch (e) {
    console.error(`✗ GERİ-DÖNÜŞ REDDEDİLDİ: ${e.message}`)
    console.error('  (Hiçbir dosya/state değiştirilmedi.)')
    process.exit(1)
  }
  const s = state.asamalar[hedef]
  console.log(`↩ GERİ DÖNÜLDÜ — ${hedef} yeniden açıldı  (proje: ${id})`)
  console.log(`  Mevcut çıktı KORUNDU (sürüm ${s.surum}): ${gorPath(s.cikti_pointer)}`)
  console.log(`  Not: sonraki koşum YENİ bir sürüm dosyası yazar (önceki sürümler silinmez).`)
  console.log(`       ${hedef} yeniden koşup sürümü artınca alt aşamalar BAYAT olur; her biri`)
  console.log(`       için ayrı ayrı karar verirsiniz (yeniden-koş / --tut).`)
  console.log(`\n  Şimdi ${hedef} aşamasını yeniden koştur: ${KOMUT(id)}`)
}

// AÇIK ATLAMA — bir soruyu YALNIZ bu açık komutla (veya doğrudan yanıt dosyasında
// atlandi:true ile) atlarsınız; sessiz atlama YOK. İzlenebilir (yanıt dosyasına yazılır).
function atlaYap(id, anahtar, gerekce) {
  projeConfigOf(id) // registry doğrulaması
  const nsYolu = nsYoluOf(id)
  const asd = acikSoruDurum(nsYolu, stateYukle(nsYolu, id))
  if (!asd) {
    console.error(`✗ ATLAMA REDDEDİLDİ: aktif aşamada sorular artefaktı yok (atlanacak soru yok).`)
    process.exit(1)
  }
  let yol
  try {
    yol = atlaYaz(nsYolu, asd.paket, anahtar, gerekce) // geçersiz anahtar → throw
  } catch (e) {
    console.error(`✗ ATLAMA REDDEDİLDİ: ${e.message}`)
    process.exit(1)
  }
  console.log(`⤼ ATLANDI — ${anahtar}  (aşama: ${asd.asama}, proje: ${id})`)
  if (gerekce) console.log(`  gerekçe: ${gerekce}`)
  console.log(`  Kaydedildi (izlenebilir, raporda görünür): ${gorPath(yol)}`)
  const kalan = acikSoruDurum(nsYolu, stateYukle(nsYolu, id))
  console.log(`  Kalan açık soru: ${kalan?.acik.length ?? 0}`)
  console.log(`\n  Devam (onayla + ilerle): ${KOMUT(id)}`)
}

// ── Argüman ayrıştırma ────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
let id = null
let geriHedef = null
let tut = false
let atlaAnahtar = null
let gerekce = null
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--geri') { geriHedef = argv[++i] ?? null }
  else if (a === '--tut') { tut = true }
  else if (a === '--atla') { atlaAnahtar = argv[++i] ?? null }
  else if (a === '--gerekce') { gerekce = argv[++i] ?? null }
  else if (!a.startsWith('--') && id === null) { id = a }
}

try {
  if (!id) {
    if (geriHedef || tut || atlaAnahtar) {
      console.error('HATA: --geri/--tut/--atla için proje id gerekli. Kullanım: ' + KOMUT('<id>', ' --geri <asama> | --tut | --atla <anahtar>'))
      process.exit(1)
    }
    listele()
  } else if (atlaAnahtar !== null) {
    if (geriHedef || tut) { console.error('HATA: --atla; --geri/--tut ile birlikte kullanılamaz.'); process.exit(1) }
    atlaYap(id, atlaAnahtar, gerekce)
  } else if (geriHedef !== null) {
    if (tut) { console.error('HATA: --geri ve --tut aynı anda kullanılamaz.'); process.exit(1) }
    geriYap(id, geriHedef)
  } else {
    await baslat(id, tut ? 'tut' : 'ileri')
  }
} catch (e) {
  console.error(`HATA: ${e.message}`)
  process.exit(1)
}
