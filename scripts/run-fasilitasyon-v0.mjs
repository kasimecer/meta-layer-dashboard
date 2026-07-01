// meta-layer-core — Karar-fasilitasyon v0 KOŞUM (mekanik-test).
// Substrat: $META_DATA_ROOT/projeler/baris/ (master-plan-v2.md §3 + inbox.md + k16 kartı).
// İki seçeneği iki tarafın pozisyonu olarak alır, rutini koşar, sentez kartını
// $META_DATA_ROOT/projeler/_mekanik-test/fasilitasyon-v0.md'ye yazar.
// Barış'ın inbox.md / master-plan-v2.md dosyalarına DOKUNMAZ (yalnız okumadan türetilmiş veri).
//
// Koşum:  node scripts/run-fasilitasyon-v0.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { kartDogrula } from '../src/lib/stateMachine.js'
import { fasilitasyonRutini, sentezKartiMarkdown, tarafsizlikDenetimi } from '../src/lib/kararFasilitasyon.js'

// ── Karar-noktası (Barış fiyat / k16) — olgular SUBSTRATTAN, kaynaklı; eksikler işaretli ──
const kararNoktasi = {
  id: 'baris-fiyat-k16',
  ozet: 'Fiyat konumlandırması — iki seçenek (A: parite + zaman-kutulu giriş teklifi · B: hafif kalıcı altfiyat); olgu-tabanı + krux + nötr harita. Hüküm insanda.',
  baslik: 'Microstäd (Göteborg, ev-tekstil temizliği) lansman fiyat-konumu: piyasaya girişte rakiplerle nasıl yarışılacağı. İki yol arasında seçim.',

  // 1) OLGU-TABANI — kaynaksız sayı YOK; eksik olgu işaretli
  olguTabani: [
    {
      olgu: 'MöbelRent liste fiyatları (inkl. moms): 2-kişilik kanepe 949 SEK · 3-kişilik 1199 · 4-kişilik 1399 · 9-kişilik (köşe) 2299 · halı 139 SEK/m² · min fatura (Göteborg) 999 SEK.',
      kaynak: 'mobelrent.se/priser/ 2025-26 — oracle-doğrulandı (master-plan-v2 §3a)',
    },
    {
      olgu: 'B2C fiyatlar moms-DAHİL gösterilmek zorunda; temizlik hizmeti standart moms %25 → net (exkl. moms) = liste ÷ 1,25 (949 → ~759 net; min fatura 999 → ~799 net).',
      kaynak: 'Prisinformationslagen — Konsumentverket 2025 (master-plan-v2 §3a)',
    },
    {
      olgu: 'Möbelrengöring (specialmaskin ile) RUT-avdrag KAPSAMI DIŞINDA; iki kurulu rakip de sunamıyor → fiyat-kaldıracı yok, müşteri brüt fiyat görür, zemin eşit.',
      kaynak: 'Skatteverket 2025 (master-plan-v2 §1/§3a · durum.md)',
    },
    {
      olgu: 'Göteborg pazarında iki kurulu oyuncu (MöbelRent, Illos Möbelrekond); pazar tam dolu değil (~600k nüfus, bölge paylaşımı).',
      kaynak: 'Araştırma turu 2026-06-25, oracle kapısı (durum.md · master-plan-v2 §1)',
    },
    {
      olgu: "Barış'ın gerçek iş-başı maliyet tabanı (begagnad makine amortismanı + seyahat + malzeme): B'nin kalıcı indiriminin marjdan ne kadar yediği + min ~799 SEK net'in kârlı kalıp kalmadığı bu olmadan hesaplanamaz.",
      durum: 'eksik',
    },
    {
      olgu: 'Fiyat-esnekliği: ~%10-15 daha düşük fiyatın Göteborg ev-tekstil segmentinde materyal olarak daha fazla ilk-müşteri çekip çekmediği — canlı dönüşüm verisi yok (yeni iş).',
      durum: 'eksik',
    },
    {
      olgu: "Illos Möbelrekond kesin fiyat listesi: yalnız 'benzer yapı, piyasa yakınsak' belirtilmiş; doğrulanmış rakam yok.",
      durum: 'eksik',
    },
    {
      olgu: "B seçeneğinin indirim büyüklüğü: Barış 'biraz daha düşük' dedi, sayı vermedi; '~%10-15' master-plan tahmini, partner-onaylı sayı değil.",
      durum: 'eksik',
    },
  ],

  // 2) KRUX — ayrışma + sınıflandırma (olgu mu, değer mi)
  krux: {
    tur: 'deger',
    ayrisma:
      'İki taraf da AYNI olguları paylaşıyor: rakip fiyatları, RUT-kaldıracının olmaması, sıfır-itibarlı yeni giriş. Olgusal anlaşmazlık YOK. Ayrışma stratejik bahiste ve zaman-ufkunda: sıfır-itibarlı yeni bir girişin ilk müşterileri nasıl en hızlı/sağlam kazanacağı + hangi uzun-vade konumu tutacağı. A bahsi: fiyat-gücü ve kalite/güven marka-sinyali korunsun, ilk müşteri/yorum GEÇİCİ bir kaldıraçla (giriş teklifi) toplansın. B bahsi: kalıcı düşük fiyatla erken müşteri kazanımı maksimize edilsin, giriş sürtünmesi düşürülsün. Bu bir risk-toleransı + zaman-ufku + marka-konum yargısıdır; mevcut olgularla çözülmez.',
    olguBosluklari: [
      "Maliyet-tabanı — B'nin kalıcı indirimi kârlı taşıyıp taşımadığını belirler (olgu 5). Doldurulursa B'nin alt sınırı netleşir, ama A/B değer-tercihini tek başına çözmez.",
      'Fiyat-esnekliği — düşük fiyatın ilk-müşteriyi gerçekten artırıp artırmadığı (olgu 6). Doldurulursa B lehine/aleyhine kanıt gelir, ama yine canlı veri gerektirir.',
    ],
  },

  // 3) SEÇENEK-HARİTASI — nötr, her seçenek aynı üç eksende
  secenekler: [
    {
      ad: 'A — Parite + zaman-kutulu giriş teklifi',
      optimize:
        'Uzun-vade fiyat-gücü + marj + kalite/güven marka-sinyali. İlk müşteri & yorumu GEÇİCİ indirimle toplar (ilk 5 müşteri %20, Reco-yorum + before/after foto izni karşılığı), sonra tam fiyata oturur.',
      feda:
        "Hemen-en-düşük-fiyat avantajından vazgeçer. 'Normalde X, şimdi Y' anlatımı gerektirir + indirimi zamanında bitirme disiplini ister.",
      kazanmaKosulu:
        'Erken müşterinin fiyattan çok kalite/güven sinyaline duyarlı olması + geçici teklifin yeterli yorum/foto stoğu üretmesi doğruysa kazanır.',
    },
    {
      ad: 'B — Hafif kalıcı altfiyat (~%10-15 [eksik: doğrulanacak])',
      optimize:
        'Erken müşteri kazanımı + en yalın anlatım. Kurulu oyunculara karşı sürekli fiyat-altı konum; kampanya-bitiş disiplini gerektirmez.',
      feda:
        "Kalıcı 'ucuz' marka algısı + sürekli daha ince marj + ileride zam zorluğu. RUT-kaldıracı olmadığından indirim doğrudan marjdan çıkar.",
      kazanmaKosulu:
        'Segmentin fiyat-esnek olması (düşük fiyatın materyal olarak daha çok ilk-müşteri çekmesi) + maliyet-tabanının kalıcı indirimi kârlı taşıması doğruysa kazanır.',
    },
  ],
}

// ── İki taraf-girdisi: substrattaki İKİ SEÇENEĞİ iki tarafın pozisyonu olarak al ──
const ortakA = {
  ad: 'Ortak-A',
  secenek: 'A',
  pozisyon: 'Parite + zaman-kutulu giriş teklifi',
  gerekce: [
    "RUT-kaldıracı yok → fiyat brüt ve rakiplerle eşit zeminde; kalıcı indirim ekstra 'gerçek' avantaj getirmez, yalnız marjdan yer.",
    "Sıfır-yorumlu yeni firmada kalıcı düşük fiyat 'neden ucuz?' + düşük-kalite sinyali doğurur.",
    "MöbelRent'in ölçek avantajı var; kalıcı fiyat savaşı uzun vadede kazanılamaz.",
    'Geçici giriş teklifi ilk müşteriyi + sosyal-kanıtı (Reco-yorum, foto) toplar, sonra tam fiyata oturur — fiyat gücü yanmaz.',
  ],
}
const ortakB = {
  ad: 'Ortak-B',
  secenek: 'B',
  pozisyon: 'Hafif kalıcı altfiyat (rakiplere göre biraz daha agresif)',
  gerekce: [
    "Barış (aynen): 'Rakiplere göre biraz daha agresif fiyat verelim. İlk müşterileri bulalım. İse giriş için fiyat strateji önerilerine açığım.'",
    "Barış (aynen): 'Biraz daha düşük olabilir. Ya da müşteri gelmezse dusurebilriz.'",
    'Kurulu oyunculara karşı sıfır-itibarlı girişte sürekli fiyat-altı konum, ilk müşteri sürtünmesini düşürür.',
    'Anlatması en yalın: kampanya/indirim-bitiş disiplini gerektirmez.',
  ],
}

// ── KOŞ ──
const kart = fasilitasyonRutini(kararNoktasi, ortakA, ortakB)

// ── DENETİM ──
const semaHatalari = kartDogrula(kart)
const tarafsizlik = tarafsizlikDenetimi(kart)
console.log('== Karar-fasilitasyon v0 — denetim ==')
console.log('  şema-v1 (kartDogrula):', semaHatalari.length ? '✗ ' + semaHatalari.join('; ') : '✓ temiz')
console.log('  tarafsızlık:', tarafsizlik.temiz ? '✓ temiz (öneri/oy/itme dili yok)' : '✗ ' + tarafsizlik.bulgular.join(', '))
console.log('  kart:', `tip=${kart.tip} durum=${kart.durum} kategori=${kart.kategori}`)
const eksikSayisi = kart.sentez.olguTabani.filter(o => o.durum === 'eksik').length
console.log('  olgu-tabanı:', `${kart.sentez.olguTabani.length - eksikSayisi} doğrulanmış + ${eksikSayisi} eksik(işaretli)`)
console.log('  krux türü:', kart.sentez.krux.tur)

// ── YAZ (Drive, _mekanik-test/) ──
const outDir = join(META_DATA_ROOT, 'projeler', '_mekanik-test')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'fasilitasyon-v0.md')
const md = sentezKartiMarkdown(kart)
writeFileSync(outPath, md + '\n', 'utf8')
console.log('\n  yazıldı →', outPath)

// ── Tam metni stdout'a (rapor için) ──
console.log('\n===BEGIN-SENTEZ-KARTI===')
console.log(md)
console.log('===END-SENTEZ-KARTI===')
