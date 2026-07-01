#!/usr/bin/env node
// Yerel intake-kuyruğu izleyici.
//
// Akış: tarayıcı (IntakeView) -> Worker POST /intake-queue -> Worker GITHUB_TOKEN ile
// intake-kuyruk/<id>.json'ı repo'ya (main) commit eder -> BU SCRIPT periyodik `git pull`
// yapıp yeni dosyaları bulur -> tools/intakeMateryalizeEt.mjs ile YEREL materyalize+loop
// çalıştırır (abonelik-auth burada, bu makinede) -> işlenen kuyruk dosyasını `git rm` +
// commit + push ile temizler.
//
// NOT: Bu script yalnız BU MAKİNE + BU PROCESS çalışırken kuyruğu işler. Anlık/her-zaman-açık
// bir bulut-servisi DEĞİL — kapatılırsa kuyruk olduğu gibi bekler, sonraki çalıştırmada işlenir.
//
// Çalıştırma: node scripts/intake-queue-watch.mjs [--once] [--interval-sn=45]
//   --once            : tek tur çalışıp çıkar (test/cron için)
//   --interval-sn=N    : tur arası bekleme (varsayılan 45s)

import { readFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { execFileSync } from 'child_process'
import { taslakiMateryalizeEt } from '../tools/intakeMateryalizeEt.mjs'

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..')
const KUYRUK_DIR = join(REPO_ROOT, 'intake-kuyruk')

const args = process.argv.slice(2)
const tekSeferlik = args.includes('--once')
const loopAtla = args.includes('--no-loop')   // test/hata-ayıklama için — üretimde KULLANMA
const araliksnArg = args.find(a => a.startsWith('--interval-sn='))
const araliksn = araliksnArg ? Number(araliksnArg.split('=')[1]) : 45

function log(s = '') {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] ${s}`)
}

function git(...cmdArgs) {
  return execFileSync('git', cmdArgs, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
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
    log('intake-kuyruk/ yok — bekleyen kayıt yok.')
    return
  }
  const dosyalar = readdirSync(KUYRUK_DIR).filter(f => f.endsWith('.json'))
  if (dosyalar.length === 0) {
    log('kuyruk boş.')
    return
  }

  log(`kuyrukta ${dosyalar.length} kayıt bulundu: ${dosyalar.join(', ')}`)

  for (const f of dosyalar) {
    const yol = join(KUYRUK_DIR, f)
    log(`işleniyor: ${f}`)

    let taslak
    try {
      taslak = JSON.parse(readFileSync(yol, 'utf8'))
    } catch (e) {
      log(`  ✗ JSON ayrıştırma hatası, atlanıyor (dosya kuyrukta kalır): ${e.message}`)
      continue
    }

    let sonuc
    try {
      sonuc = await taslakiMateryalizeEt(taslak, { loopAtla, log: (s) => log(`  ${s}`) })
    } catch (e) {
      log(`  ✗ materyalize hatası: ${e.message} — kuyruk dosyası SİLİNMEDİ, sonraki turda tekrar denenecek.`)
      continue
    }

    if (sonuc.loopSonucu?.tamamlandi) {
      log(`  ✓ ${sonuc.id} materyalize edildi + planlama pipeline TAMAMLANDI`)
    } else if (sonuc.loopAtlandi) {
      log(`  ✓ ${sonuc.id} materyalize edildi (loop tetiklenmedi)`)
    } else {
      log(`  ⚠ ${sonuc.id} materyalize edildi ama pipeline DURDU/BLOKE (aktif_asama: ${sonuc.loopSonucu?.state?.aktif_asama}, neden: ${sonuc.loopSonucu?.state?.asamalar?.[sonuc.loopSonucu.state.aktif_asama]?.blok_nedeni ?? '?'})`)
    }

    // İşlendi (başarılı ya da bloke — ikisi de "kuyruktan çıkar", çünkü blok da insan
    // müdahalesi bekleyen bir SONUÇ, yeniden-kuyruklama değil) — dosyayı kaldır + push et.
    try {
      rmSync(yol)
      git('add', join('intake-kuyruk', f))
      git('commit', '-m', `chore: intake-kuyruk islendi (${f})`)
      git('push')
      log(`  kuyruktan kaldırıldı + push edildi: ${f}`)
    } catch (e) {
      log(`  ⚠ kuyruk temizleme/push başarısız (yerelde silindi, elle push gerekebilir): ${String(e.message).split('\n')[0]}`)
    }
  }
}

log(`intake-queue-watch başladı — ${tekSeferlik ? 'tek-seferlik (--once)' : `her ${araliksn}s'de bir tur`}`)
log('NOT: yalnız bu makine + bu process çalışırken kuyruğu işler; kapatılırsa kuyruk bekler.')

if (tekSeferlik) {
  await birTurCalistir()
} else {
  while (true) {
    await birTurCalistir()
    await new Promise(r => setTimeout(r, araliksn * 1000))
  }
}
