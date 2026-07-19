import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { META_DATA_ROOT } from './config.js'
import { stateYukle, bayatAsamalar, birimStateOf } from '../tools/planlamaDurumMakinesiV2.mjs'
import { sorulariDogrula, VERI_KARARLARI } from '../tools/planlamaSorular.mjs'
import { acikSoruDurum, projeLeftoverOzetiCikar } from '../tools/planlamaDurumOzeti.mjs'
import { projeKartlariniTuret, projeDokumanlariniTuret, dosyaHref } from '../tools/planlamaKartTuretici.mjs'
import { pipelineDurumFazHesapla } from '../src/lib/registry.js'

// ── Karar-fasilitasyon eklentileri ──────────────────────────────────────────
// sentez-kartlar/<karar_id>.json → partner-görünür kartlar (render-hazır v1).
// escalation_flag=true ise her kart damgalanır (Card.jsx badge için).
export function sentezKartlariOku(pdir) {
  const sentezDir = join(pdir, 'sentez-kartlar')
  if (!existsSync(sentezDir)) return []
  const kartlar = []
  for (const f of readdirSync(sentezDir).filter(f => f.endsWith('.json')).sort()) {
    try {
      const d = JSON.parse(readFileSync(join(sentezDir, f), 'utf8'))
      for (const k of (d.kartlar ?? [])) {
        kartlar.push(d.escalation_flag ? { ...k, escalation_flag: true } : k)
      }
    } catch (e) {
      console.warn(`sentez-kartlar/${f} okunamadı:`, e.message)
    }
  }
  return kartlar
}

// build-task/*.json → operatör board verisi ({ board: {bekliyor,devam,bitti}, taslaklar }).
// Her giriş: { kart, event_blok, bağlı_olay } — bağlı_olay sentez veya taslak meta'dan.
export function buildTestOperatorOku(buildTestDir) {
  const board = { bekliyor: [], devam: [], bitti: [] }
  const taskDir = join(buildTestDir, 'build-task')
  if (!existsSync(taskDir)) return { board, taslaklar: [] }

  for (const f of readdirSync(taskDir).filter(f => f.endsWith('.json')).sort()) {
    let kart
    try { kart = JSON.parse(readFileSync(join(taskDir, f), 'utf8')) } catch { continue }
    const bd = kart.build_durum ?? 'bekliyor'

    let bağlıOlay = null
    const karar_id = kart.linked_karar_id ?? kart.linked_olay_id ?? null
    if (karar_id) {
      const sentezYol = join(buildTestDir, 'sentez-kartlar', `${karar_id}.json`)
      const taslakYol = join(buildTestDir, '_fasilitasyon-taslak', `${karar_id}.json`)
      if (existsSync(sentezYol)) {
        try {
          const s = JSON.parse(readFileSync(sentezYol, 'utf8'))
          bağlıOlay = { karar_id, terminal_sinif: s.terminal_sinif, yayinlandi: true, escalation: !!s.escalation_flag, olay_tipi: s.olay_tipi ?? 'karar' }
        } catch { /* noop */ }
      } else if (existsSync(taslakYol)) {
        try {
          const t = JSON.parse(readFileSync(taslakYol, 'utf8'))
          bağlıOlay = { karar_id, terminal_sinif: t.terminal_sinif, yayinlandi: false, escalation: false }
        } catch { /* noop */ }
      }
    }

    const entry = { kart, event_blok: kart.event_blok ?? null, bağlı_olay: bağlıOlay }
    if (bd === 'devam') board.devam.push(entry)
    else if (bd === 'bitti') board.bitti.push(entry)
    else board.bekliyor.push(entry)
  }

  const taslaklar = fasilitasyonTaslakMetalariOku(buildTestDir)
  return { board, taslaklar }
}

// _build-test/ partner kartları: sentez-kartlar/ → tip:ilerleme/girdi-talebi partner kartları.
export function buildTestPartnerOku(buildTestDir) {
  return { proje: '_build-test', kartlar: sentezKartlariOku(buildTestDir) }
}

// _fasilitasyon-taslak/<karar_id>.json → operatör-only özet (partner görmez).
export function fasilitasyonTaslakMetalariOku(pdir) {
  const taslakDir = join(pdir, '_fasilitasyon-taslak')
  if (!existsSync(taslakDir)) return []
  const meta = []
  for (const f of readdirSync(taslakDir).filter(f => f.endsWith('.json')).sort()) {
    try {
      const d = JSON.parse(readFileSync(join(taslakDir, f), 'utf8'))
      meta.push({
        karar_id: d.karar_id,
        terminal_sinif: d.terminal_sinif,
        olusturma: d.sentezKart?.olusturma ?? null,
        yayinla_cli: `node scripts/kararWire.mjs --yayinla ${d.karar_id} --proje ${d.proje}`,
      })
    } catch (e) {
      console.warn(`_fasilitasyon-taslak/${f} okunamadı:`, e.message)
    }
  }
  return meta
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const projelerDir = join(META_DATA_ROOT, 'projeler')   // Drive veri-kökü (repo Drive-dışında)
const outDir = join(__dirname, '..', 'public')          // repo-local çıktı (yeni konum içine)
const okJSON = p => JSON.parse(readFileSync(p, 'utf8'))

// ============================================================
// 1) PROJE REGISTRY (proje-seviyesi metadata) + operator-<id>.json
// ============================================================
const registryPath = join(projelerDir, 'registry.json')
if (existsSync(registryPath)) {
  const reg = okJSON(registryPath)
  // light-enrich: signal.json olan projede zaman_son_aktivite'yi tarihten türet (canlı)
  // + 2026-07-19 (Görev 2): durum/faz artık BURADA, GERÇEK pipeline durumundan (planlama-
  // durum.json) türetiliyor — kanonik registry.json'da bu alanlar taşınıyor olsa BİLE (eski
  // projeler, write-once yazılmış) burada TAMAMEN YOK SAYILIP ÜZERİNE YAZILIR (spread SONRASI
  // durum/faz set edilir) — "stored kopyasız" ilkesi budur: build ÇIKTISI hiçbir zaman stored
  // değeri YANSITMAZ, yalnız GERÇEK durumu. Pipeline state dosyası (planlama-durum.json) HİÇ
  // yoksa `stateYukle` SESSİZCE sentetik bir "taze genesis" state SENTEZLER (bkz o fonksiyonun
  // kendi notu) — BU dürüst-bilinmiyor ayrımını BOZAR, bu yüzden `existsSync` kontrolü BURADA,
  // `stateYukle`ÖNCESİNDE yapılır; dosya yoksa `pipelineDurumFazHesapla(null)` çağrılır.
  const projeler = (reg.projeler ?? []).map(p => {
    const pdir = join(projelerDir, p.id)
    const durumDosyasiVarMi = existsSync(join(pdir, 'planlama-durum.json'))
    const { durum, faz } = pipelineDurumFazHesapla(durumDosyasiVarMi ? stateYukle(pdir, p.id) : null)
    let sonuc = { ...p, durum, faz }
    const sp = join(pdir, 'signal.json')
    if (existsSync(sp)) {
      try { const s = okJSON(sp); if (s.tarih) sonuc = { ...sonuc, zaman_son_aktivite: s.tarih } } catch { /* noop */ }
    }
    return sonuc
  })
  writeFileSync(join(outDir, 'registry.json'), JSON.stringify({ projeler }, null, 2), 'utf8')
  console.log(`registry.json yazıldı (${projeler.length} proje)`)

  // operator-<id>.json — signal.json olan her proje için (operatör-ek: iç bayraklar + doküman pointer'ları)
  for (const p of projeler) {
    const pdir = join(projelerDir, p.id)
    const sp = join(pdir, 'signal.json')
    if (!existsSync(sp)) continue
    let s; try { s = okJSON(sp) } catch { continue }
    // href = tıklanabilir file:// URL (gerçekten diskte var olan dosyalar); önceki şema
    // (relative 'yol') hiçbir zaman servis edilmeyen bir yola işaret ediyordu (kırık link) —
    // bkz tools/planlamaKartTuretici.mjs dosyaHref (planlama-projeleri ile AYNI mekanizma).
    // icerik = dosyanın TAM metni, build-time'da GÖMÜLÜR — planlama-projeleri (projeDokumanlariniTuret)
    // ile AYNI gerekçe: deploy çıktısı .md TAŞIMAZ, in-app görüntüleyici (#/dokuman) başka türlü
    // içeriğe erişemezdi. Okuma başarısız olursa (nadiren — existsSync zaten dosyaHref'te
    // doğrulandı) icerik null kalır, girdi yine de (href ile) yayınlanır — çökme YOK.
    const dokumanlar = readdirSync(pdir)
      .filter(f => f.endsWith('.md')).sort()
      .map(f => {
        const mutlakYol = join(pdir, f)
        const href = dosyaHref(mutlakYol)
        if (!href) return null
        let icerik = null
        try { icerik = readFileSync(mutlakYol, 'utf8') } catch { /* noop — icerik null kalır */ }
        return { ad: f, asama: null, href, icerik }
      })
      .filter(Boolean)
    const taslaklar = fasilitasyonTaslakMetalariOku(pdir)
    const operator = {
      proje: p.id,
      momentum: s.momentum ?? null,
      son_ilerleme: s.son_ilerleme ?? null,
      sonraki_kritik_adim: s.sonraki_kritik_adim ?? null,
      bekleyen_insan_girdisi: s.bekleyen_insan_girdisi ?? null,
      acik_bayraklar: s.acik_bayraklar ?? [],
      dokumanlar,
      ...(taslaklar.length ? { fasilitasyon_taslaklar: taslaklar } : {}),
    }
    writeFileSync(join(outDir, `operator-${p.id}.json`), JSON.stringify(operator, null, 2), 'utf8')
    console.log(`operator-${p.id}.json yazıldı (${dokumanlar.length} doküman, ${operator.acik_bayraklar.length} bayrak)`)
  }
} else {
  console.log('projeler/registry.json bulunamadı — registry/operator atlandı')
}

// ============================================================
// 2) BARIŞ PARTNER ÇIKTILARI (partner-view DOLU) — slice-1, değişmedi
// ============================================================
function parseYolculuk(content) {
  const kartlar = []
  const blocks = content.split(/(?=^## KART \d)/m)
  for (const block of blocks) {
    const h = block.match(/^## KART (\d+)\s+[—–-]+\s+(.+?)\s+\|\s+tip:\s+([\w-]+)\s+\|\s+durum:\s+([\w-]+)/m)
    if (!h) continue
    const n = parseInt(h[1])
    const tip = h[3].trim()
    const durum = h[4].trim()
    const kisaM = block.match(/\*\*Kısa:\*\*\s*(.+)/)
    const kisa = kisaM ? kisaM[1].trim() : ''
    const barisM = block.match(/\*\*Barış \(aynen\):\*\*\s*"([\s\S]+?)"/)
    const baris_aynen = barisM ? barisM[1].trim() : null
    const detayM = block.match(/\*\*Detay:\*\*\s*([\s\S]*)/)
    const detay = detayM ? detayM[1].trim() : ''
    kartlar.push({ n, tip, durum, kisa, baris_aynen, detay })
  }
  return kartlar
}

function toSchemaV1(k, tarih) {
  const tip = k.tip === 'girdi-talebi' ? 'girdi-talebi' : 'ilerleme'
  const durum = tip === 'girdi-talebi' ? k.durum : 'bitti'
  return {
    id: `baris-k${k.n}`,
    tip,
    durum,
    ozet: k.kisa,
    detay: k.detay,
    partner_cevap: k.baris_aynen ?? null,
    olusturma: tarih,
    guncelleme: tarih,
  }
}

const baris = join(projelerDir, 'baris')
const barisSignalPath = join(baris, 'signal.json')

// existsSync guard: proje dizini (baris ya da ileride retire edilecek başka biri) yoksa
// bu bölüm sessizce atlanır — korumasız okuma TÜM build script'ini çökertiyordu (bkz
// meta-kanal.md 2026-07-10 baris-retirement-diagnosis-only bulgu #2).
if (existsSync(barisSignalPath)) {
  const signal = okJSON(barisSignalPath)

  let partnerOzet = null
  const kartPath = join(baris, 'kart.md')
  if (existsSync(kartPath)) partnerOzet = readFileSync(kartPath, 'utf8')

  let arsivLink = null
  const arsivPath = join(baris, 'arsiv')
  if (existsSync(arsivPath)) {
    const files = readdirSync(arsivPath).filter(f => !f.startsWith('.')).sort()
    if (files.length > 0) arsivLink = files[files.length - 1]
  }

  const cardData = {
    proje: signal.proje,
    tarih: signal.tarih,
    momentum: signal.momentum,
    son_ilerleme: signal.son_ilerleme,
    sonraki_kritik_adim: signal.sonraki_kritik_adim,
    bekleyen_insan_girdisi: signal.bekleyen_insan_girdisi ?? null,
    partner_ozet: partnerOzet,
    arsiv_link: arsivLink,
  }
  writeFileSync(join(outDir, 'card-data.json'), JSON.stringify(cardData, null, 2), 'utf8')
  console.log('card-data.json yazıldı')

  // yolculuk-partner.md → KART ŞEMASI v1 → cards-baris.json
  const yolculukPath = join(baris, 'yolculuk-partner.md')
  if (existsSync(yolculukPath)) {
    const raw = readFileSync(yolculukPath, 'utf8')
    const bazKartlar = parseYolculuk(raw).map(k => toSchemaV1(k, signal.tarih))
    const kartlar = [...bazKartlar, ...sentezKartlariOku(baris)]
    writeFileSync(join(outDir, 'cards-baris.json'), JSON.stringify({ proje: signal.proje, kartlar }, null, 2), 'utf8')
    console.log(`cards-baris.json yazıldı (${kartlar.length} kart, şema v1)`)
    const eski = join(outDir, 'journey-data.json')
    if (existsSync(eski)) { rmSync(eski); console.log('journey-data.json kaldırıldı') }
  } else {
    console.log('yolculuk-partner.md bulunamadı — cards-baris.json atlandı')
  }
} else {
  console.log('signal.json bulunamadı (projeler/baris) — §2 (baris partner çıktıları) atlandı')
}

// ============================================================
// 3) DEMO-FOYA — build-board operator + partner cards
//    Registry'ye dokunulmaz; signal.json varlığında çalışır.
// ============================================================
const demoFoyaDir = join(projelerDir, '_demo-foya')
const demoFoyaSignalPath = join(demoFoyaDir, 'signal.json')

if (existsSync(demoFoyaSignalPath)) {
  const dfSignal = okJSON(demoFoyaSignalPath)

  // Operator: build-board (buildTestOperatorOku aynı imzayla çalışır)
  const { board: dfBoard, taslaklar: dfTaslaklar } = buildTestOperatorOku(demoFoyaDir)

  const dfOperator = {
    proje_meta: {
      ad:    dfSignal.ad    ?? 'Balkon Bahçesi',
      durum: dfSignal.durum ?? 'build',
      rol:   dfSignal.rol   ?? null,
      efor:  dfSignal.efor  ?? null,
      deger: dfSignal.deger ?? null,
    },
    momentum:               dfSignal.momentum               ?? null,
    son_ilerleme:           dfSignal.son_ilerleme           ?? null,
    sonraki_kritik_adim:    dfSignal.sonraki_kritik_adim    ?? null,
    bekleyen_insan_girdisi: dfSignal.bekleyen_insan_girdisi ?? null,
    board:   dfBoard,
    taslaklar: dfTaslaklar,
  }
  writeFileSync(join(outDir, 'operator-demo-foya.json'), JSON.stringify(dfOperator, null, 2), 'utf8')
  console.log(`operator-demo-foya.json yazıldı (bekliyor:${dfBoard.bekliyor.length}, devam:${dfBoard.devam.length}, bitti:${dfBoard.bitti.length})`)

  // Partner cards: mevcut foya-k01..k03 korunur + build-task + sentez/onay eklenir
  const dfCardsPath = join(outDir, 'cards-demo-foya.json')
  const dfBase = existsSync(dfCardsPath)
    ? okJSON(dfCardsPath)
    : { proje: 'Balkon Bahçesi', proje_id: 'demo-foya', kartlar: [] }

  const baseIds = new Set((dfBase.kartlar ?? []).map(k => k.id))

  // Build-task kartları (tip:ilerleme, faz:build)
  const dfBuildTaskDir = join(demoFoyaDir, 'build-task')
  const dfBuildKartlar = existsSync(dfBuildTaskDir)
    ? readdirSync(dfBuildTaskDir).filter(f => f.endsWith('.json')).sort()
        .flatMap(f => { try { return [okJSON(join(dfBuildTaskDir, f))] } catch { return [] } })
    : []

  // Sentez/onay kartları
  const dfSentezKartlar = sentezKartlariOku(demoFoyaDir)

  const eklenecek = [
    ...dfBuildKartlar.filter(k => !baseIds.has(k.id)),
    ...dfSentezKartlar.filter(k => !baseIds.has(k.id)),
  ]

  dfBase.kartlar = [...(dfBase.kartlar ?? []), ...eklenecek]
  writeFileSync(dfCardsPath, JSON.stringify(dfBase, null, 2), 'utf8')
  console.log(`cards-demo-foya.json güncellendi (base:${baseIds.size} + eklenen:${eklenecek.length} = toplam:${dfBase.kartlar.length})`)
} else {
  console.log('_demo-foya/signal.json bulunamadı — demo-foya atlandı')
}

// ============================================================
// 4) PLANLAMA SORU–YANIT ANLIK-GÖRÜNTÜSÜ — public/sorular-<id>.json
//    Registry ÜYELİĞİNDEN BAĞIMSIZ: planlama-durum.json TAŞIYAN her proje dizini taranır
//    (_demo-*/_test-* dahil) — kanonik registry'ye YAZMADAN disposable projeler de tarayıcıda
//    görünür olur (_demo-entegre tam bu şekilde: planlama-durum.json var, registry'de YOK).
//    Her proje kendi try/catch'i içinde: biri bozuksa diğerleri etkilenmez (sentezKartlariOku
//    döngüsündeki desenle tutarlı). Açık-soru olguları acikSoruDurum() ÜZERİNDEN — CLI'nin
//    (scripts/planlama-baslat.mjs) kullandığı AYNI fonksiyon — böylece "tarayıcı ve CLI aynı
//    olguda hemfikir" tek-fonksiyon-iki-çağıran ile sağlanır (tools/planlamaDurumOzeti.mjs).
// ============================================================
const SORU_YANIT_REDDEDILEN_DIR = join(__dirname, '..', 'soru-yanit-kuyruk', 'reddedilen')

// DATA-REQUEST'in secenekler'i (bare string[]) tarayıcının bilemeyeceği bir sırayla VERI_KARARLARI
// koduna karşılık gelir (yalnız Node-only tools/planlamaSorular.mjs bu eşleşmeyi bilir) — burada
// açık {karar,etiket}[] çiftine dönüştürülür. Diğer tipler olduğu gibi geçer.
function soruyuTarayiciyaUyarla(soru) {
  if (soru.tip !== 'DATA-REQUEST') return soru
  const secenekler_kararli = soru.secenekler.map((etiket, i) => ({ karar: VERI_KARARLARI[i], etiket }))
  return { ...soru, secenekler_kararli }
}

// soru-yanit-kuyruk/reddedilen/ içindeki, bu projeId'ye ait reddedilmiş gönderimler — "sessizce
// atılmadı" görünürlüğünü tarayıcıya da taşır (yalnız operatör-görünür özet; ham gövde değil).
function reddedilenGonderimleriOku(projeId) {
  if (!existsSync(SORU_YANIT_REDDEDILEN_DIR)) return []
  const sonuc = []
  for (const f of readdirSync(SORU_YANIT_REDDEDILEN_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const g = okJSON(join(SORU_YANIT_REDDEDILEN_DIR, f))
      if (g.projeId === projeId) sonuc.push({ dosya: f, asama: g.asama ?? null, surum: g.surum ?? null })
    } catch { /* noop */ }
  }
  return sonuc
}

if (existsSync(projelerDir)) {
  const adaylar = readdirSync(projelerDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(id => existsSync(join(projelerDir, id, 'planlama-durum.json')))

  let sorularYazilanSayisi = 0
  let kartYazilanSayisi = 0
  let operatorYazilanSayisi = 0
  for (const id of adaylar) {
    try {
      const nsYolu = join(projelerDir, id)
      const state = stateYukle(nsYolu, id)
      const bayatlar = bayatAsamalar(state)

      // cards-<id>.json + operator-<id>.json — GERÇEK pipeline artefaktlarından türetilir
      // (elle bakımlı signal.json/cards-<id>.json YERİNE; bkz tools/planlamaKartTuretici.mjs).
      // Bu build her koşumda YENİDEN türetir → "backfill" ayrı bir araç DEĞİL, bu script'in
      // kendisi (npm run build-data): eski projeler için de tekrar koşmak yeter.
      const { kartlar } = projeKartlariniTuret(nsYolu, id, state)
      writeFileSync(join(outDir, `cards-${id}.json`), JSON.stringify({ proje_id: id, kartlar }, null, 2), 'utf8')
      kartYazilanSayisi++

      // operator-<id>.json: yalnız signal.json YOKSA (o projede zaten §1 yazdı — dokunma).
      if (!existsSync(join(nsYolu, 'signal.json'))) {
        const dokumanlar = projeDokumanlariniTuret(nsYolu, id, state)
        writeFileSync(join(outDir, `operator-${id}.json`), JSON.stringify({
          proje: id,
          momentum: null, son_ilerleme: null, sonraki_kritik_adim: null, bekleyen_insan_girdisi: null,
          acik_bayraklar: [],
          dokumanlar,
        }, null, 2), 'utf8')
        operatorYazilanSayisi++
      }

      const anlikGoruntu = {
        proje_id: id,
        aktif_asama: state.aktif_asama,
        tamamlandi: state.aktif_asama === 'tamamlandi',
        bayat_asamalar: bayatlar,
        durum_etiketi: null,          // aktif birimin (veya, tamamlandiysa, elestiri'nin) durum'u
        soru_turu: 'yok',             // 'yok' | 'gecerli' | 'defekt' — snapshot render edilebilir mi
        yanit_butunluk: null,         // acikSoruDurum().butunluk — 'gecerli'|'yok'|'bozuk'|null
        asama: null, surum: null, soru_imza: null,
        bolum: null,                  // master-plan bölüm-yürüyüşü sürüyorsa bölüm id'si, aksi null
        acik_sorular: [], ertelenen_sorular: [], atlanan_sorular: [],
        // Proje boyunca (aktif olmayan birimler dahil) hâlâ açık kalmış ertelenen adaylar — bkz
        // tools/planlamaDurumOzeti.mjs:projeLeftoverOzetiCikar. Boş dizi = gerçekten leftover yok.
        leftover_by_unit: [],
        reddedilen_gonderimler: reddedilenGonderimleriOku(id),
      }

      // durum_etiketi — birim-state artık birimStateOf ÜZERİNDEN okunur (bkz docs/
      // PIPELINE_UNIT_STATE_CONSUMERS.md satır 30). aktif_asama==='tamamlandi' iken artık null'da
      // BIRAKILMAZ: GERCEK_ASAMALAR'ın dışında yaşayan elestiri (Kritik Pasaj) biriminin GÜNCEL
      // durum'una düşer — elestiri hiç tetiklenmemişse (birimStateOf 'bekliyor' veya obje yoksa)
      // yine null (dürüst-boş; sahte bir durum İCAT EDİLMEZ).
      anlikGoruntu.durum_etiketi = state.aktif_asama === 'tamamlandi'
        ? (birimStateOf(state, 'elestiri')?.durum ?? null)
        : (birimStateOf(state, state.aktif_asama)?.durum ?? null)

      // AÇIK SORULAR — acikSoruDurum(nsYolu, state) KENDİSİ bölüm-farkında VE (2026-07-19 görevi:
      // "close the tamamlandi blind spot") artık tamamlandi-farkındadır: A==='master-plan' VE
      // bölüm-yürüyüşü SÜRÜYORSA (walk bitmemiş — aktifBolumBilgisi≠null) aktif BÖLÜMÜN kendi
      // soru paketine delege eder; A==='tamamlandi' VE elestiri hâlâ operatör kararı bekliyorsa
      // (onay-bekliyor/donduruldu) elestiri'nin paketine delege eder; aksi halde (diğer 4 aşama,
      // master-plan'ın walk'ı bitmiş nihai-onay anı, VEYA elestiri hiç başlamamış/zaten kapanmış)
      // doğru birime çözülmüş paketi (veya dürüst null'u) döner. Eskiden burada
      // `if (state.aktif_asama !== 'tamamlandi')` koşulu VARDI — bu koşul KALDIRILDI: elestiri'nin
      // gerçek açık sorusunu (ör. go/no-go/pivot E kararı) hiç GÖRMÜYORDU, "no open questions"
      // yanlış-negatifine sebep oluyordu (bkz docs/PIPELINE_UNIT_STATE_CONSUMERS.md "Bugs found
      // while mapping"). Diğer 4 aşama + bölüm-yürüyüşü davranışı BİREBİR KORUNUR (acikSoruDurum
      // kendisi zaten aynı A/bölüm ayrımını yapıyordu, yalnız çağrı koşulu genişledi).
      try {
        const asd = acikSoruDurum(nsYolu, state)
        if (asd) {
          const paket = asd.paket
          sorulariDogrula(paket) // defekt paket (ör. önerisiz CHOICE) ASLA normal render edilmez
          anlikGoruntu.soru_turu = 'gecerli'
          anlikGoruntu.yanit_butunluk = asd.butunluk ?? null
          anlikGoruntu.asama = asd.asama       // aşama/elestiri id'si VEYA (master-plan ise) bölüm id'si
          anlikGoruntu.bolum = asd.bolum ?? null // master-plan bölüm-yürüyüşü sürüyorsa bölüm id'si
          anlikGoruntu.surum = paket.surum
          anlikGoruntu.soru_imza = paket.imza
          anlikGoruntu.acik_sorular = (asd.acik ?? []).map(soruyuTarayiciyaUyarla)
          anlikGoruntu.ertelenen_sorular = (paket.ertelenen ?? []).map(soruyuTarayiciyaUyarla)
          anlikGoruntu.atlanan_sorular = asd.atlanan ?? []
        }
      } catch (e) {
        anlikGoruntu.soru_turu = 'defekt'
        anlikGoruntu.defekt_nedeni = e.message
      }

      // LEFTOVER — bkz görev: "candidates deferred during the walk are invisible on the panel
      // even though they are resolvable from state" + "the walk/deferral design is intentional
      // and must NOT change — only visibility of the leftovers is missing". Ayrı try/catch:
      // bozuk bir birimin paketi bu özetin tamamını ÇÖKERTMEZ, o proje için leftover_by_unit
      // boş kalır ama açık-soru anlık-görüntüsü (yukarıda zaten yazıldı) etkilenmez.
      try {
        anlikGoruntu.leftover_by_unit = projeLeftoverOzetiCikar(nsYolu, state)
      } catch (e) {
        anlikGoruntu.leftover_hatasi = e.message
      }

      writeFileSync(join(outDir, `sorular-${id}.json`), JSON.stringify(anlikGoruntu, null, 2), 'utf8')
      sorularYazilanSayisi++

      // TAŞIMA DEFTERLERİ — tools/planlamaUretimKaydi.mjs mekanizmasının çıktısı (bkz docs/
      // OPERATOR_ARTIFACT_SURVEY.md). Bir proje dizininde `<asama>-tasima-defteri-v<N>.json`
      // deseniyle eşleşen dosya(lar) VARSA, operatörün "carried / carried_with_text_drift /
      // unmatched_stamped" durumunu ve düzeltilmiş aday sayılarını görebilmesi için özetlerini
      // public/tasima-<id>.json'a yazar. YOKSA (mevcut projelerin BÜYÜK ÇOĞUNLUĞU) dosya hiç
      // YAZILMAZ — panelde sessizce hiçbir şey görünmez, boş bir bölüm İCAT EDİLMEZ.
      try {
        const tasimaDosyalari = readdirSync(nsYolu)
          .filter(f => /^(.+)-tasima-defteri-v(\d+)\.json$/.test(f))
          .sort()
        if (tasimaDosyalari.length) {
          const defterler = tasimaDosyalari.map(f => {
            const d = JSON.parse(readFileSync(join(nsYolu, f), 'utf8'))
            return {
              dosya: f, asama: d.asama, surum: d.surum, onceki: d.onceki,
              olusturma: d.olusturma, ozet: d.ozet,
            }
          })
          writeFileSync(join(outDir, `tasima-${id}.json`), JSON.stringify({ proje_id: id, defterler }, null, 2), 'utf8')
        }
      } catch (e) {
        console.warn(`tasima-${id}.json üretilemedi (proje atlandı, diğerleri etkilenmedi):`, e.message)
      }
    } catch (e) {
      console.warn(`sorular-${id}.json üretilemedi (proje atlandı, diğerleri etkilenmedi):`, e.message)
    }
  }
  if (sorularYazilanSayisi) console.log(`sorular-<id>.json yazıldı (${sorularYazilanSayisi} proje, registry-bağımsız)`)
  if (kartYazilanSayisi) console.log(`cards-<id>.json türetildi (${kartYazilanSayisi} proje, gerçek pipeline artefaktlarından)`)
  if (operatorYazilanSayisi) console.log(`operator-<id>.json türetildi (${operatorYazilanSayisi} proje, doküman pointer'ları)`)
} else {
  console.log('projeler/ dizini bulunamadı — soru anlık-görüntüsü atlandı')
}
