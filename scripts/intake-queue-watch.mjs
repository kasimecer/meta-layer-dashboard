#!/usr/bin/env node
// Yerel intake-kuyruğu izleyici.
//
// Akış: tarayıcı (IntakeView) -> Worker POST /intake-queue -> Worker GITHUB_TOKEN ile
// intake-kuyruk/<id>.json'ı repo'ya (main) commit eder -> BU SCRIPT periyodik `git pull`
// yapıp yeni dosyaları bulur -> tools/intakeMateryalizeEt.mjs ile YEREL materyalize eder ->
// işlenen kuyruk dosyasını `git rm` + commit + push ile temizler.
//
// BİLEREK planlama pipeline'ını BAŞLATMAZ. Materyalize etmek (kaydı diskte/registry'de var
// etmek) ile planlama koşumunu başlatmak kasıtlı olarak ayrı iki iştir — bu izleyici yalnız
// ilkini yapar. Pipeline'ı başlatmak/devam ettirmek insan tarafından açıkça, ayrı bir
// terminal komutuyla yapılır: node scripts/planlama-baslat.mjs <id>
//
// Kuyruk-temizleme kuralı: bir öğe kuyruktan YALNIZ materyalizasyon BAŞARILI olduğunda
// kaldırılır. Planlama pipeline'ının başlamış/tamamlanmış/bloke olmuş olmasıyla HİÇBİR
// ilişkisi yoktur (pipeline artık burada hiç çalışmıyor). Materyalizasyon başarısızsa
// (ör. bozuk JSON, path-traversal reddi, dosya-sistemi hatası) öğe kuyrukta kalır, bir
// sonraki turda tekrar denenir.
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
      sonuc = await taslakiMateryalizeEt(taslak, { log: (s) => log(`  ${s}`) })
    } catch (e) {
      log(`  ✗ materyalize hatası: ${e.message} — kuyruk dosyası SİLİNMEDİ, sonraki turda tekrar denenecek.`)
      continue
    }

    log(`  ✓ ${sonuc.id} materyalize edildi (planlama pipeline'ı BAŞLATILMADI — bkz: node scripts/planlama-baslat.mjs ${sonuc.id})`)

    // Materyalizasyon başarılı → kuyruktan kaldır + push et. (Pipeline burada hiç
    // çalışmadığı için "bloke" gibi bir ara durum yok — başarı tek çıktı.)
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
log('NOT: yalnız materyalize eder; planlama pipeline\'ını BAŞLATMAZ. Başlatmak için: node scripts/planlama-baslat.mjs <id>')
log('NOT: yalnız bu makine + bu process çalışırken kuyruğu işler; kapatılırsa kuyruk bekler.')

if (tekSeferlik) {
  await birTurCalistir()
} else {
  while (true) {
    await birTurCalistir()
    await new Promise(r => setTimeout(r, araliksn * 1000))
  }
}
