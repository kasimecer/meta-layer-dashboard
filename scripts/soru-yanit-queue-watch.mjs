#!/usr/bin/env node
// Yerel soru-yanıt-kuyruğu izleyici.
//
// Akış: tarayıcı (SoruYanitView, #/sorular/<id>) -> Worker POST /soru-yanit-queue -> Worker
// GITHUB_TOKEN ile soru-yanit-kuyruk/<projeId>--<asama>--v<surum>.json'ı repo'ya (main) commit
// eder -> BU SCRIPT periyodik `git pull` yapıp yeni dosyaları bulur -> GERÇEK GÜNCEL soru
// sürümüyle (planlama-durum.json'dan; gönderimdeki değeri KÖRÜ KÖRÜNE GÜVENMEDEN) karşılaştırır
// -> eşleşirse tools/planlamaSorular.mjs'in KENDİ yanitKaydet/atlaYaz fonksiyonlarıyla YEREL
// yanıt artefaktına yazar -> işlenen kuyruk dosyasını kaldırır (`git rm` + commit + push).
//
// BİLEREK planlama pipeline'ını BAŞLATMAZ/İLERLETMEZ. Yanıt artefaktına yazmak (kaydı diskte var
// etmek) ile planlama pipeline'ını ilerletmek kasıtlı olarak ayrı iki iştir — bu izleyici yalnız
// ilkini yapar. Bunun YAPISAL kanıtı: bu dosya SADECE tools/planlamaSorular.mjs +
// tools/planlamaDurumMakinesiV2.mjs'ten import eder — tools/planlamaBaslat.mjs,
// tools/planlamaLoopV2.mjs, tools/canliExecutor.mjs hiçbir yerde YOKTUR; dolayısıyla model
// çağrısına veya aşama geçişine giden hiçbir kod yolu YOKTUR. Pipeline'ı ilerletmek insan
// tarafından açıkça, ayrı bir terminal komutuyla yapılır: node scripts/planlama-baslat.mjs <id>
//
// BAYAT/KURCALANMIŞ/DEFEKT gönderim SESSİZCE ATILMAZ ve SESSİZCE GÜNCEL SAYILMAZ: görünür bir
// karantina dizinine (soru-yanit-kuyruk/reddedilen/) taşınır + yüksek sesle loglanır. Bayat bir
// sürüme karşı sonsuz yeniden-deneme anlamsızdır (o sürüm asla yeniden güncel olmaz) — bu yüzden
// intake-kuyruğunun "başarısızsa kuyrukta kalır" davranışından BİLEREK farklıdır.
//
// Çalıştırma: node scripts/soru-yanit-queue-watch.mjs [--once] [--interval-sn=45]
//   --once            : tek tur çalışıp çıkar (test/cron için)
//   --interval-sn=N    : tur arası bekleme (varsayılan 45s)

import { readFileSync, readdirSync, existsSync, rmSync, renameSync, mkdirSync } from 'fs'
import { join, resolve, relative } from 'path'
import { execFileSync } from 'child_process'
import { META_DATA_ROOT } from './config.js'
import {
  sorulariOku, sorulariDogrula, yanitKaydet, atlaYaz, yanitlandiMi,
} from '../tools/planlamaSorular.mjs'
import { stateYukle, birimStateOf } from '../tools/planlamaDurumMakinesiV2.mjs'

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..')
const KUYRUK_DIR = join(REPO_ROOT, 'soru-yanit-kuyruk')
const REDDEDILEN_DIR = join(KUYRUK_DIR, 'reddedilen')

const args = process.argv.slice(2)
const tekSeferlik = args.includes('--once')
const araliksnArg = args.find(a => a.startsWith('--interval-sn='))
const araliksn = araliksnArg ? Number(araliksnArg.split('=')[1]) : 45

function log(s = '') {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] ${s}`)
}

function git(...cmdArgs) {
  return execFileSync('git', cmdArgs, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

// ── Çekirdek: BİR gönderimi işle (MODELSİZ, saf fs okuma/yazma) ────────────────
// Dönüş: { sonuc: 'uygulandi', asama, surum, projeId, kayitSayisi }
//      | { sonuc: 'reddedildi', neden: string }
// projelerRoot enjekte edilebilir (varsayılan META_DATA_ROOT — canlı/CLI çağrısı budur; testler
// tmpdir kökü geçirir) — tools/planlamaSorular.mjs'in KENDİ fonksiyonlarının hepsi nsYolu'yu
// AÇIKÇA parametre alır (asla içeride sabitlemez); bu fonksiyon da AYNI deseni izler.
export function gonderimiIsle(gonderim, { log = () => {}, projelerRoot = META_DATA_ROOT } = {}) {
  const projeId  = gonderim?.projeId
  const asama    = gonderim?.asama
  const surum    = gonderim?.surum
  const soruImza = gonderim?.soruImza
  const yanitlar = gonderim?.yanitlar

  if (typeof projeId !== 'string' || !projeId ||
      typeof asama !== 'string' || !asama ||
      !Number.isInteger(surum) || surum < 1 ||
      typeof soruImza !== 'string' || !soruImza ||
      !Array.isArray(yanitlar) || yanitlar.length === 0) {
    return { sonuc: 'reddedildi', neden: 'gönderim şekli geçersiz (eksik/hatalı alan)' }
  }

  const nsYolu = join(projelerRoot, 'projeler', projeId)
  let state
  try {
    state = stateYukle(nsYolu, projeId)
  } catch (e) {
    return { sonuc: 'reddedildi', neden: `proje state okunamadı: ${e.message}` }
  }

  // "asama" ÜÇ ŞEYDEN biri olabilir: (a) üst-seviye bir aşama (genesis/premise/arastirma/
  // strateji/master-plan), (b) master-plan bölüm-yürüyüşü AKTİFKEN bir BÖLÜM id'si (ör.
  // "ozet-yonetici"), YA DA (c) elestiri/Kritik Pasaj — kendi state.elestiri alanını taşır,
  // GERCEK_ASAMALAR/bölümlerin DIŞINDA (bkz tools/elestiriPasi.mjs). Üçü de tools/
  // planlamaDurumMakinesiV2.mjs:birimStateOf ile TEK bir yerden çözülür — CLI (scripts/
  // planlama-baslat.mjs) da AYNI fonksiyonu kullanır, burada AYRI bir özel-durum YOK (2026-07-19
  // düzeltme: elestiri dalı burada hiç yoktu, gönderim "aktif soru turu yok" ile reddediliyordu —
  // bkz kanal). sorulariOku/yanitKaydet/atlaYaz ZATEN `asama` parametresini yalnız dosya-adı
  // öneki olarak kullanıyor (bkz tools/planlamaSorular.mjs soruDosyaAdi) — elestiri için de AYNEN
  // doğru dosyalara işaret eder, o fonksiyonlarda hiçbir değişiklik gerekmedi.
  const birimState = birimStateOf(state, asama)

  // GERÇEK GÜNCEL sürüm — gönderimdeki surum'a ASLA güvenilmez, yalnız KARŞILAŞTIRMA için kullanılır.
  const guncelSurum = birimState?.sorular_surum
  if (guncelSurum == null) {
    return { sonuc: 'reddedildi', neden: `"${asama}" için aktif soru turu yok (proje ilerlemiş ya da hiç üretilmemiş olabilir)` }
  }
  if (guncelSurum !== surum) {
    return { sonuc: 'reddedildi', neden: `BAYAT gönderim: v${surum}'a karşı yanıtlanmış, güncel sürüm v${guncelSurum} (--geri/yeniden-koşum aradan geçmiş olabilir)` }
  }

  const guncelPaket = sorulariOku(nsYolu, asama, guncelSurum)
  if (!guncelPaket) {
    return { sonuc: 'reddedildi', neden: `soru dosyası bulunamadı (${asama} v${guncelSurum})` }
  }
  // Savunma-derinliği: yazmadan önce güncel paketin kendisi hâlâ geçerli mi (defekt asla yazılmaz).
  try {
    sorulariDogrula(guncelPaket)
  } catch (e) {
    return { sonuc: 'reddedildi', neden: `defekt soru paketi (yazılmadı): ${e.message}` }
  }
  if (guncelPaket.imza !== soruImza) {
    return { sonuc: 'reddedildi', neden: `İMZA UYUŞMAZLIĞI (kurcalama veya sürüm çakışması olası) — beklenen ${guncelPaket.imza}, gelen ${soruImza}` }
  }

  // TÜM-YA-DA-HİÇ ön-doğrulama: her kayıt geçerli bir anahtara VE (atlama değilse) tip-özgü
  // geçerli bir şekle sahip olmalı — hiçbir şey yazılmadan ÖNCE tüm batch kontrol edilir, böylece
  // parti içindeki bir kötü kayıt, önceki iyi kayıtların yazılmasından SONRA asla keşfedilmez.
  const soruHarita = new Map(guncelPaket.sorular.filter(s => s.tip !== 'APPROVAL').map(s => [s.anahtar, s]))
  for (const e of yanitlar) {
    if (!e || typeof e !== 'object' || typeof e.anahtar !== 'string') {
      return { sonuc: 'reddedildi', neden: 'yanıt kaydı anahtarsız/geçersiz' }
    }
    const soru = soruHarita.get(e.anahtar)
    if (!soru) {
      return { sonuc: 'reddedildi', neden: `yabancı/APPROVAL anahtar (bu soru setinde yok veya onaydır): ${e.anahtar}` }
    }
    if (e.atlandi === true) {
      // 2026-07-18 (Priority 4c) — eskiden burada tier hiç kontrol edilmiyordu: bir blocker-tier
      // atlama bu ön-doğrulamayı GEÇİYOR, sonra APPLY döngüsünde atlaYaz() fırlatıyordu — "TÜM-
      // YA-DA-HİÇ" garantisini BOZUYORDU (aynı partideki ÖNCEKİ kayıtlar zaten YAZILMIŞ oluyordu,
      // atlaYaz'ın fırlattığı hata da "REDDEDİLDİ" değil "beklenmeyen hata" olarak loglanıyordu).
      // Panel tarafında (SoruYanitView.jsx) blocker kartlarda Atla düğmesi artık HİÇ
      // gösterilmiyor, ama Worker/izleyici kendi başına da AYNI kuralı GEÇERLİ KILMALI — CLI'nin
      // atlaYaz() zaten reddettiği şeyi burada da (yazmadan ÖNCE) reddetmek gerekir.
      if (soru.tier === 'blocker') {
        return { sonuc: 'reddedildi', neden: `"${e.anahtar}" blocker-tier — atlanamaz (tek kapanma yolu: cevapla)` }
      }
      continue // atlama (blocker DIŞINDA) her zaman geçerli (APPROVAL hariç — yukarıda elendi)
    }
    if (!yanitlandiMi(soru, e)) {
      return { sonuc: 'reddedildi', neden: `"${e.anahtar}" (${soru.tip}) için yanıt şekli geçersiz/eksik` }
    }
  }

  // Uygula — artık tüm kayıtlar doğrulandı, GÜVENLE yaz.
  for (const e of yanitlar) {
    if (e.atlandi === true) atlaYaz(nsYolu, guncelPaket, e.anahtar, e.gerekce ?? null)
    else yanitKaydet(nsYolu, guncelPaket, e)
  }

  log(`  ✓ uygulandı: ${projeId}/${asama} v${surum} (${yanitlar.length} kayıt)`)
  return { sonuc: 'uygulandi', asama, surum, projeId, kayitSayisi: yanitlar.length }
}

// ── Kuyruk taraması + git orkestrasyonu (yalnız çalıştırıldığında; testte drive edilmez) ──
function reddedilenYolUret(dosyaAdi) {
  mkdirSync(REDDEDILEN_DIR, { recursive: true })
  let hedef = join(REDDEDILEN_DIR, dosyaAdi)
  if (!existsSync(hedef)) return hedef
  const damga = new Date().toISOString().replace(/[:.]/g, '-')
  return join(REDDEDILEN_DIR, `${damga}--${dosyaAdi}`)
}

async function birTurCalistir() {
  log('git pull...')
  try {
    git('pull', '--ff-only')
  } catch (e) {
    log(`git pull başarısız, bu tur atlanıyor: ${String(e.message).split('\n')[0]}`)
    return
  }

  if (!existsSync(KUYRUK_DIR)) {
    log('soru-yanit-kuyruk/ yok — bekleyen gönderim yok.')
    return
  }
  // Yalnız üst-düzey *.json (reddedilen/ dizinine ASLA inmez — readdirSync recursive değil).
  const dosyalar = readdirSync(KUYRUK_DIR).filter(f => f.endsWith('.json'))
  if (dosyalar.length === 0) {
    log('kuyruk boş.')
    return
  }

  log(`kuyrukta ${dosyalar.length} gönderim bulundu: ${dosyalar.join(', ')}`)

  for (const f of dosyalar) {
    const yol = join(KUYRUK_DIR, f)
    log(`işleniyor: ${f}`)

    let gonderim
    try {
      gonderim = JSON.parse(readFileSync(yol, 'utf8'))
    } catch (e) {
      log(`  ✗ JSON ayrıştırma hatası, atlanıyor (dosya kuyrukta kalır): ${e.message}`)
      continue
    }

    let sonuc
    try {
      sonuc = gonderimiIsle(gonderim, { log })
    } catch (e) {
      log(`  ✗ beklenmeyen hata: ${e.message} — kuyruk dosyası SİLİNMEDİ, sonraki turda tekrar denenecek.`)
      continue
    }

    if (sonuc.sonuc === 'uygulandi') {
      try {
        rmSync(yol)
        git('add', join('soru-yanit-kuyruk', f))
        git('commit', '-m', `chore: soru-yanit-kuyruk işlendi (${f})`)
        git('push')
        log(`  kuyruktan kaldırıldı + push edildi: ${f}`)
      } catch (e) {
        log(`  ⚠ kuyruk temizleme/push başarısız (yerelde silindi, elle push gerekebilir): ${String(e.message).split('\n')[0]}`)
      }
    } else {
      // REDDEDİLDİ — sessizce atılmaz, sessizce güncel de sayılmaz: görünür karantinaya taşınır.
      log(`  ✗ REDDEDİLDİ (${f}): ${sonuc.neden}`)
      try {
        const hedefYol = reddedilenYolUret(f)
        renameSync(yol, hedefYol)
        git('add', join('soru-yanit-kuyruk', f))
        git('add', relative(REPO_ROOT, hedefYol))
        git('commit', '-m', `chore: soru-yanit-kuyruk reddedildi (${f}) — ${sonuc.neden.slice(0, 100)}`)
        git('push')
        log(`  karantinaya taşındı + push edildi: soru-yanit-kuyruk/reddedilen/`)
      } catch (e) {
        log(`  ⚠ karantina taşıma/push başarısız (elle müdahale gerekebilir): ${String(e.message).split('\n')[0]}`)
      }
    }
  }
}

// Yalnız doğrudan çalıştırıldığında (import edilince ÇALIŞMAZ — testte gonderimiIsle izole sürülür).
if (import.meta.url === `file://${process.argv[1]}`) {
  log(`soru-yanit-queue-watch başladı — ${tekSeferlik ? 'tek-seferlik (--once)' : `her ${araliksn}s'de bir tur`}`)
  log('NOT: yalnız yanıt artefaktına yazar; planlama pipeline\'ını BAŞLATMAZ/İLERLETMEZ.')
  log('NOT: yalnız bu makine + bu process çalışırken kuyruğu işler; kapatılırsa kuyruk bekler.')

  if (tekSeferlik) {
    await birTurCalistir()
  } else {
    while (true) {
      await birTurCalistir()
      await new Promise(r => setTimeout(r, araliksn * 1000))
    }
  }
}
