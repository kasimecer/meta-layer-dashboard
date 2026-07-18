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
import { planlamaBaslat, planlamaGeri, planlamaBolumeGeri } from '../tools/planlamaBaslat.mjs'
import {
  ASAMA_SIRASI, GERCEK_ASAMALAR, stateYukle, bayatAsamalar, bayatMi, ustAsama,
} from '../tools/planlamaDurumMakinesiV2.mjs'
import {
  atlaYaz, yanitDosyaAdi, sorulariOku, yanitlariHamOku, yanitButunluk,
  topluAtla, soruYenidenDerecele, acikBlokerler, TIER_DEGERLERI,
} from '../tools/planlamaSorular.mjs'
import { acikSoruDurum } from '../tools/planlamaDurumOzeti.mjs'
import { BOLUM_SIRASI } from '../tools/planlamaBolumTanimlari.mjs'
import { aktifBolumBilgisi } from '../tools/planlamaBolumLoop.mjs'

// Bir birim-id'nin (aşama VEYA master-plan bölümü VEYA elestiri/Kritik Pasaj) state-nesnesini +
// üstünü çözer — sonuc.bekleyenOnay/bayatAsama artık ÜÇ granülerlikten biri olabilir. elestiri
// BİLEREK GERCEK_ASAMALAR/BOLUM_SIRASI'nın DIŞINDadır (bkz tools/elestiriPasi.mjs) — kendi
// state.elestiri alanını taşır, bu yüzden ayrıca kontrol edilmesi gerekir (aksi halde undefined
// döner ve çağıran s.surum gibi bir alana erişince patlar).
function birimStateOf(state, id) {
  if (id === 'elestiri') return state.elestiri
  return GERCEK_ASAMALAR.includes(id) ? state.asamalar[id] : state.asamalar['master-plan']?.bolumler?.[id]
}
function birimUstAdi(id) {
  if (id === 'elestiri') return 'master-plan'
  if (GERCEK_ASAMALAR.includes(id)) return ustAsama(id)
  const i = BOLUM_SIRASI.indexOf(id)
  return i > 0 ? BOLUM_SIRASI[i - 1] : null
}

// Herhangi bir birimin (aktif olsun olmasın — geçmişte kalmış bir bölümün lingering açık
// onemli/opsiyonel soruları da erişilebilir olmalı) GÜNCEL sorular paketini + geçerli yanıt
// dizisini çözer. --birim <id> ile aktif-olmayan bir hedefe toplu-atla/yeniden-derecele
// uygulanabilmesinin TEK yolu budur (aksi halde acikSoruDurum yalnız aktif birimi görür).
function birimPaketiVeYanitlarOf(nsYolu, state, id) {
  const bs = birimStateOf(state, id)
  if (!bs) throw new Error(`bilinmeyen birim: "${id}"`)
  const ss = bs.sorular_surum
  if (ss == null) throw new Error(`${id}: sorular artefaktı yok`)
  const paket = sorulariOku(nsYolu, id, ss)
  if (!paket) throw new Error(`${id}: sorular paketi okunamadı (sürüm ${ss})`)
  const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, id, ss))
  return { paket, yanitlar: but.durum === 'gecerli' ? but.yanitlar : [] }
}

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
    // 5-aşama + bölüm-yürüyüşü bitti — ama Kritik Pasaj (elestiri) AYRI, kendi durumunu taşıyan
    // bir birim (bkz tools/elestiriPasi.mjs); "tamamlandı" tek başına yanıltıcı olurdu.
    const es = state.elestiri
    if (es?.durum === 'donduruldu') {
      return { etiket: 'BLOKE (kritik pasaj)', detay: es.blok_nedeni ?? '(neden bilinmiyor)' }
    }
    if (es?.durum === 'onay-bekliyor') {
      return { etiket: 'KRİTİK PASAJ — KARAR BEKLİYOR', detay: 'go/no-go/pivot kararınızı verin' }
    }
    if (es?.durum === 'gecti') {
      return { etiket: 'tamamlandı', detay: 'kritik pasaj dahil TAM tamamlandı' }
    }
    return { etiket: 'tamamlandı', detay: (bayatEk.trim() ? `(bayat var: ${bayatlar.join(', ')}) ` : '') + '— kritik pasaj henüz başlamadı' }
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
    case 'elestiri-tamamlandi': {
      const es = state.elestiri
      console.log(`✓ KRİTİK PASAJ TAMAMLANDI — ${id}`)
      console.log(`    elestiri     sürüm ${es.surum}  → ${gorPath(es.cikti_pointer)}`)
      console.log(`  E kararı (go/no-go/pivot) kaydedildi — bkz ${gorPath(join(nsYoluOf(id), yanitDosyaAdi('elestiri', es.sorular_surum ?? 1)))}`)
      break
    }
    case 'onay-bekliyor': {
      const a = sonuc.bekleyenOnay
      const s = birimStateOf(state, a)
      const sonraki = a === 'elestiri'
        ? '(E kararı — nihai)'
        : GERCEK_ASAMALAR.includes(a)
          ? ASAMA_SIRASI[ASAMA_SIRASI.indexOf(a) + 1]
          : (BOLUM_SIRASI[BOLUM_SIRASI.indexOf(a) + 1] ?? '(nihai master-plan onayı)')
      const birimEtiket = a === 'elestiri' ? 'KRİTİK PASAJ' : (GERCEK_ASAMALAR.includes(a) ? 'AŞAMA' : 'BÖLÜM')
      console.log(`■ ${birimEtiket} BİTTİ, ONAY BEKLİYOR — ${a}  (proje: ${id})`)
      console.log(`  Yapısal kapı  : GEÇTİ`)
      console.log(`  Çıktı (sürüm ${s.surum}): ${gorPath(s.cikti_pointer)}`)
      console.log(`  Sıradaki aşama: ${sonraki}`)
      // "tüketildi" (yukarıdaki yapısal kapı) ≠ "uygulandı" — bu, onayı KAÇIRILAMAZ hale
      // getirmek için burada, kapıdan HEMEN sonra, ayrı ve göze çarpan biçimde basılır (bkz
      // duzeltmeTutarliligiKontrolEt / P2, 2026-07-18 kök-neden raporu). BLOKLAMAZ — onay
      // öncesi operatörün DİKKATİNE sunulur.
      if (s.duzeltme_uyarilari?.length) {
        console.log(`\n  ⚠⚠ DÜZELTME UYARISI — ${s.duzeltme_uyarilari.length} olası uygulanmamış operatör-düzeltmesi:`)
        for (const u of s.duzeltme_uyarilari) {
          console.log(`     • [${u.anahtar}] eski iddia hâlâ metinde: "${u.eskiIddiaOzeti}"`)
        }
        console.log(`     Bu, "tüketildi" (yanıt executor'a geçirildi) ile "uygulandı" (belgeye yansıdı)`)
        console.log(`     AYRI şeyler olduğu için var — belgeyi ONAYLAMADAN ÖNCE inceleyin.`)
      }
      // Convenience: blocker YOK (aksi halde durdu='sorular-acik' olurdu) ama onemli/opsiyonel
      // açık kalmış olabilir — engellemez (ilerleyebilirsiniz), ama sessizce birikmesin diye
      // burada YÜZEYE ÇIKARILIR (bkz görev: "advancing with open onemli/opsiyonel LISTS them").
      const asdOnay = acikSoruDurum(nsYoluOf(id), state)
      const acikToplam = (asdOnay?.acik?.length ?? 0) + (asdOnay?.acikErtelenen?.length ?? 0)
      if (asdOnay && acikToplam > 0) {
        console.log(`\n  ℹ ${acikToplam} açık onemli/opsiyonel soru var (bloklamaz, ilerleyebilirsiniz) — birikmesin diye şimdi kapatmak isterseniz:`)
        console.log(`    • Toplu kapat (skip → izlenen-varsayım, SESSİZ DEĞİL — hepsini yazdırır): ${KOMUT(id, ' --atla-hepsi')}`)
      }
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
      const blokerSayisi = sonuc.acikSorular.filter(q => q.tier === 'blocker').length
      console.log(`◧ AÇIK SORULAR — ${a}  (proje: ${id})  [${sonuc.acikSorular.length} açık, ${blokerSayisi} blocker — İLERLEMEYİ DURDURAN yalnız bunlar]`)
      {
        const sUyari = birimStateOf(state, a)?.duzeltme_uyarilari
        if (sUyari?.length) {
          console.log(`\n  ⚠⚠ DÜZELTME UYARISI — ${sUyari.length} olası uygulanmamış operatör-düzeltmesi:`)
          for (const u of sUyari) console.log(`     • [${u.anahtar}] eski iddia hâlâ metinde: "${u.eskiIddiaOzeti}"`)
        }
      }
      if (sonuc.butunlukHatasi) {
        console.log(`  ⚠ Yanıt artefaktı BOZUK: ${sonuc.butunlukHatasi}`)
        console.log(`    → Sorular yeniden yayınlandı; geçerli bir yanıt dosyası yazana dek İLERLENMEZ.`)
      }
      console.log(`  Yanıt dosyası (elle düzenleyin — sürüm ${ss}): ${gorPath(yanitYol)}`)
      console.log(`  Soru artefaktı: ${gorPath(join(nsYoluOf(id), `${a}${(ss ?? 1) <= 1 ? '' : '-v' + ss}-sorular.json`))}`)
      console.log(`\n  Yanıtlanacak sorular (Türkçe; APPROVAL = bu komutu tekrar çalıştırmak):`)
      for (const q of sonuc.acikSorular) {
        const tierDurumu = q.tier === 'blocker' ? 'BLOCKER — ilerlemeyi durduruyor' : `${q.tier ?? 'onemli'} — bloklamaz`
        console.log(`\n  • [${q.tip}/${tierDurumu}] ${q.metin}`)
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
        if (q.tier === 'blocker') {
          console.log(`      (blocker — atlanamaz/düşürülemez; cevapla, ya da önce derece düşür: ${KOMUT(id, ` --yeniden-derecele ${q.anahtar} onemli`)})`)
        } else {
          console.log(`      atla (açık komut): ${KOMUT(id, ` --atla ${q.anahtar}`)}`)
        }
      }
      if (sonuc.ertelenenSorular?.length) {
        console.log(`\n  Ertelenen (bloklamaz, görünür): ${sonuc.ertelenenSorular.map(q => `${q.tip}:${q.anahtar}`).join(', ')}`)
      }
      console.log(`\n  Yanıt dosyasını yazın, sonra onaylayıp ilerleyin: ${KOMUT(id)}`)
      console.log(`  Bir soruyu açıkça atlamak için         : ${KOMUT(id, ' --atla <anahtar> [--gerekce "…"]')}`)
      if (blokerSayisi < sonuc.acikSorular.length) {
        console.log(`  Açık onemli/opsiyonel'lerin HEPSİNİ kapat      : ${KOMUT(id, ' --atla-hepsi [--gerekce "…"]')}`)
      }
      break
    }
    case 'bayat-karar': {
      const a = sonuc.bayatAsama
      const s = birimStateOf(state, a)
      const ust = birimUstAdi(a)
      console.log(`◧ BAYAT ${GERCEK_ASAMALAR.includes(a) ? 'AŞAMA' : 'BÖLÜM'} — KARAR BEKLİYOR — ${a}  (proje: ${id})`)
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
      // Master-plan bölüm-yürüyüşünde blok üç şekilde olabilir: (a) tek bir bölümün KENDİ
      // kapısı reddetti (aktifBolumBilgisi onu bulur), (b) Layer-2 (tüm-plan) kontrolü
      // başarısız (konteynerin kendi blok_nedeni'nde durur, hiçbir bölüm bireysel bloke
      // DEĞİLDİR), (c) sıradan bir aşama bloke (eski davranış, state.aktif_asama zaten doğru).
      const mp = state.asamalar['master-plan']
      const bilgi = aktifBolumBilgisi(state)
      let a, blokNedeni, ciktiPointer
      if (state.aktif_asama === 'master-plan' && mp?.blok_nedeni && mp.blok_nedeni.startsWith('Layer-2')) {
        a = 'master-plan (tüm-plan Layer-2 kontrolü)'
        blokNedeni = mp.blok_nedeni
        ciktiPointer = null
      } else if (bilgi) {
        a = bilgi.bolumId
        blokNedeni = bilgi.bolumler[bilgi.bolumId]?.blok_nedeni
        ciktiPointer = bilgi.bolumler[bilgi.bolumId]?.cikti_pointer
      } else {
        a = state.aktif_asama
        blokNedeni = state.asamalar[a]?.blok_nedeni
        ciktiPointer = state.asamalar[a]?.cikti_pointer
      }
      console.log(`✗ BLOKE — ${a}  (proje: ${id})`)
      console.log(`  blok_nedeni: ${blokNedeni ?? '(yok)'}`)
      console.log(`  Çıktı      : ${gorPath(ciktiPointer)}`)
      console.log(`\n  Çıktıyı (.md) düzeltip tekrar çağırın; yapısal kapı yeniden denenir:`)
      console.log(`    • Yeniden dene: ${KOMUT(id)}`)
      console.log(`    • Geri dön    : ${KOMUT(id, ' --geri <asama-veya-bölüm-id>')}`)
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
  // hedef, master-plan'ın 14 bölümü + provenans-ekinden biriyse bölüm-seviyesi geri-dönüşe
  // (aynı birimGeriDon çekirdeği, ayrı sarmalayıcı) yönlendirilir; aksi halde eski aşama-yolu.
  const bolumHedefMi = BOLUM_SIRASI.includes(hedef)
  let state
  try {
    state = bolumHedefMi ? planlamaBolumeGeri(nsYolu, id, hedef) : planlamaGeri(nsYolu, id, hedef) // geçersizse throw → state DEĞİŞMEZ
  } catch (e) {
    console.error(`✗ GERİ-DÖNÜŞ REDDEDİLDİ: ${e.message}`)
    console.error('  (Hiçbir dosya/state değiştirilmedi.)')
    process.exit(1)
  }
  const s = bolumHedefMi ? state.asamalar['master-plan'].bolumler[hedef] : state.asamalar[hedef]
  const birimEtiket = bolumHedefMi ? `master-plan bölümü "${hedef}"` : hedef
  console.log(`↩ GERİ DÖNÜLDÜ — ${birimEtiket} yeniden açıldı  (proje: ${id})`)
  console.log(`  Mevcut çıktı KORUNDU (sürüm ${s.surum}): ${gorPath(s.cikti_pointer)}`)
  console.log(`  Not: sonraki koşum YENİ bir sürüm dosyası yazar (önceki sürümler silinmez).`)
  if (!bolumHedefMi) {
    console.log(`       ${hedef} yeniden koşup sürümü artınca alt aşamalar BAYAT olur; her biri`)
    console.log(`       için ayrı ayrı karar verirsiniz (yeniden-koş / --tut).`)
  }
  console.log(`\n  Şimdi ${hedef} ${bolumHedefMi ? 'bölümünü' : 'aşamasını'} yeniden koştur: ${KOMUT(id)}`)
}

// AÇIK ATLAMA — bir soruyu YALNIZ bu açık komutla (veya doğrudan yanıt dosyasında
// atlandi:true ile) atlarsınız; sessiz atlama YOK. İzlenebilir (yanıt dosyasına yazılır).
// blocker-tier bir soru için REDDEDİLİR (atlaYaz kendi kontrolü — bkz tools/planlamaSorular.mjs).
// birimIdOverride verilirse (--birim) aktif OLMAYAN bir birimin (ör. daha önce ilerlemiş bir
// bölümün lingering açık sorusu) yanıt dosyasına da erişilebilir.
function atlaYap(id, anahtar, gerekce, birimIdOverride = null) {
  projeConfigOf(id) // registry doğrulaması
  const nsYolu = nsYoluOf(id)
  const state = stateYukle(nsYolu, id)
  let paket, birimEtiket
  if (birimIdOverride) {
    try {
      ({ paket } = birimPaketiVeYanitlarOf(nsYolu, state, birimIdOverride))
    } catch (e) {
      console.error(`✗ ATLAMA REDDEDİLDİ: ${e.message}`)
      process.exit(1)
    }
    birimEtiket = birimIdOverride
  } else {
    const asd = acikSoruDurum(nsYolu, state)
    if (!asd) {
      console.error(`✗ ATLAMA REDDEDİLDİ: aktif aşamada sorular artefaktı yok (atlanacak soru yok). Geçmiş bir birimi hedeflemek için --birim <id> kullanın.`)
      process.exit(1)
    }
    paket = asd.paket
    birimEtiket = asd.asama
  }
  let yol
  try {
    yol = atlaYaz(nsYolu, paket, anahtar, gerekce) // geçersiz anahtar/blocker-tier → throw
  } catch (e) {
    console.error(`✗ ATLAMA REDDEDİLDİ: ${e.message}`)
    process.exit(1)
  }
  console.log(`⤼ ATLANDI — ${anahtar}  (birim: ${birimEtiket}, proje: ${id})`)
  if (gerekce) console.log(`  gerekçe: ${gerekce}`)
  console.log(`  Kaydedildi (izlenebilir, raporda görünür): ${gorPath(yol)}`)
  console.log(`\n  Devam (onayla + ilerle): ${KOMUT(id)}`)
}

// TOPLU-ATLA — bu birimin şu an açık olan TÜM blocker-olmayan (onemli/opsiyonel) sorularını
// tek seferde skip → izlenen-varsayım olarak kapatır. SESSİZ DEĞİL: kapattığı HER anahtarı
// YAZDIRIR (görev sözleşmesi — "batch conversion is not silent"). Blocker'lara HİÇ DOKUNMAZ.
function topluAtlaYap(id, gerekce, birimIdOverride = null) {
  projeConfigOf(id)
  const nsYolu = nsYoluOf(id)
  const state = stateYukle(nsYolu, id)
  let hedefId = birimIdOverride
  if (!hedefId) {
    const asd = acikSoruDurum(nsYolu, state)
    if (!asd) {
      console.error(`✗ TOPLU-ATLA REDDEDİLDİ: aktif aşamada sorular artefaktı yok. Geçmiş bir birimi hedeflemek için --birim <id> kullanın.`)
      process.exit(1)
    }
    hedefId = asd.bolum ?? asd.asama
  }
  let paket, yanitlar
  try {
    ({ paket, yanitlar } = birimPaketiVeYanitlarOf(nsYolu, state, hedefId))
  } catch (e) {
    console.error(`✗ TOPLU-ATLA REDDEDİLDİ: ${e.message}`)
    process.exit(1)
  }
  const kapatilan = topluAtla(nsYolu, paket, yanitlar, gerekce)
  console.log(`⤼⤼ TOPLU-ATLA — ${hedefId}  (proje: ${id})`)
  if (kapatilan.length === 0) {
    console.log(`  Kapatılacak açık onemli/opsiyonel soru yok.`)
  } else {
    console.log(`  ${kapatilan.length} soru skip → izlenen-varsayım olarak kapatıldı:`)
    for (const k of kapatilan) console.log(`    • [${k.tip}/${k.tier}] ${k.anahtar} — ${k.metin}`)
    if (gerekce) console.log(`  gerekçe (hepsi için): ${gerekce}`)
  }
  const { paket: guncelPaket, yanitlar: guncelYanitlar } = birimPaketiVeYanitlarOf(nsYolu, state, hedefId)
  const kalanBloker = acikBlokerler(guncelPaket, guncelYanitlar)
  if (kalanBloker.length) {
    console.log(`  ⚠ ${kalanBloker.length} blocker HÂLÂ açık (toplu-atla bunlara dokunmadı, dokunamaz) — önce cevapla:`)
    for (const b of kalanBloker) console.log(`      • ${b.anahtar} — ${b.metin}`)
  }
  console.log(`\n  Devam (onayla + ilerle): ${KOMUT(id)}`)
}

// YENİDEN-DERECELE — bir sorunun tier'ını sonradan değiştirir (tipik: blocker → onemli/
// opsiyonel), önceden reddedilen skip/at'i AÇAR. imza etkilenmez (bkz soruYenidenDerecele).
function yenidenDereceleYap(id, anahtar, yeniTier, birimIdOverride = null) {
  projeConfigOf(id)
  const nsYolu = nsYoluOf(id)
  const state = stateYukle(nsYolu, id)
  let hedefId = birimIdOverride
  if (!hedefId) {
    const asd = acikSoruDurum(nsYolu, state)
    if (!asd) {
      console.error(`✗ YENİDEN-DERECELE REDDEDİLDİ: aktif aşamada sorular artefaktı yok. Geçmiş bir birimi hedeflemek için --birim <id> kullanın.`)
      process.exit(1)
    }
    hedefId = asd.bolum ?? asd.asama
  }
  let paket
  try {
    ({ paket } = birimPaketiVeYanitlarOf(nsYolu, state, hedefId))
  } catch (e) {
    console.error(`✗ YENİDEN-DERECELE REDDEDİLDİ: ${e.message}`)
    process.exit(1)
  }
  let soru
  try {
    soru = soruYenidenDerecele(nsYolu, paket, anahtar, yeniTier)
  } catch (e) {
    console.error(`✗ YENİDEN-DERECELE REDDEDİLDİ: ${e.message}`)
    process.exit(1)
  }
  console.log(`⇄ YENİDEN-DERECELENDİ — ${anahtar} → tier: ${soru.tier}  (birim: ${hedefId}, proje: ${id})`)
  console.log(`\n  Devam (onayla + ilerle, ya da şimdi --atla/--atla-hepsi ile kapat): ${KOMUT(id)}`)
}

// ── Argüman ayrıştırma ────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
let id = null
let geriHedef = null
let tut = false
let atlaAnahtar = null
let gerekce = null
let atlaHepsi = false
let yenidenDereceleAnahtar = null
let yenidenDereceleTier = null
let birimHedef = null
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--geri') { geriHedef = argv[++i] ?? null }
  else if (a === '--tut') { tut = true }
  else if (a === '--atla') { atlaAnahtar = argv[++i] ?? null }
  else if (a === '--atla-hepsi') { atlaHepsi = true }
  else if (a === '--yeniden-derecele') { yenidenDereceleAnahtar = argv[++i] ?? null; yenidenDereceleTier = argv[++i] ?? null }
  else if (a === '--gerekce') { gerekce = argv[++i] ?? null }
  else if (a === '--birim') { birimHedef = argv[++i] ?? null }
  else if (!a.startsWith('--') && id === null) { id = a }
}

try {
  if (!id) {
    if (geriHedef || tut || atlaAnahtar || atlaHepsi || yenidenDereceleAnahtar) {
      console.error('HATA: --geri/--tut/--atla/--atla-hepsi/--yeniden-derecele için proje id gerekli. Kullanım: ' + KOMUT('<id>', ' --geri <asama> | --tut | --atla <anahtar> | --atla-hepsi | --yeniden-derecele <anahtar> <tier>'))
      process.exit(1)
    }
    listele()
  } else if (atlaAnahtar !== null) {
    if (geriHedef || tut) { console.error('HATA: --atla; --geri/--tut ile birlikte kullanılamaz.'); process.exit(1) }
    atlaYap(id, atlaAnahtar, gerekce, birimHedef)
  } else if (atlaHepsi) {
    if (geriHedef || tut) { console.error('HATA: --atla-hepsi; --geri/--tut ile birlikte kullanılamaz.'); process.exit(1) }
    topluAtlaYap(id, gerekce, birimHedef)
  } else if (yenidenDereceleAnahtar !== null) {
    if (geriHedef || tut) { console.error('HATA: --yeniden-derecele; --geri/--tut ile birlikte kullanılamaz.'); process.exit(1) }
    if (!yenidenDereceleTier || !TIER_DEGERLERI.includes(yenidenDereceleTier)) {
      console.error(`HATA: --yeniden-derecele <anahtar> <tier> — tier geçerli değerlerden biri olmalı: ${TIER_DEGERLERI.join(', ')}`)
      process.exit(1)
    }
    yenidenDereceleYap(id, yenidenDereceleAnahtar, yenidenDereceleTier, birimHedef)
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
