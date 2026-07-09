// Canlı planlama yürütücüsü — claude -p headless (abonelik OAuth) + scope-lock.
// --safe-mode: CLAUDE.md yüklenmez → düşük overhead, meta-protokol devreye girmez.
// Namespace dışına yazma → ScopeLockHatasi fırlatır.

import { spawn } from 'child_process'
import { writeFileSync, readFileSync, renameSync, unlinkSync, mkdirSync } from 'fs'
import { resolve, dirname, join, basename } from 'path'
import { randomBytes } from 'crypto'

export class ScopeLockHatasi extends Error {
  constructor(hedef, sinir) {
    super(`SCOPE-LOCK REDDETTİ\n  Hedef  : ${hedef}\n  Sınır  : ${sinir}`)
    this.name = 'ScopeLockHatasi'
    this.hedef = hedef
    this.sinir = sinir
  }
}

/**
 * Scope lock: hedef yol, izinli namespace kök yolunun altında mı?
 * @param {string} hedefYol — kontrol edilecek mutlak/göreli yol
 * @param {string} nsKokYolu — izin verilen namespace'in mutlak kök yolu
 */
export function scopeKontrol(hedefYol, nsKokYolu) {
  const hedef = resolve(hedefYol)
  const sinir = resolve(nsKokYolu)
  if (!hedef.startsWith(sinir + '/') && hedef !== sinir) {
    throw new ScopeLockHatasi(hedef, sinir)
  }
}

/**
 * claude -p headless — abonelik OAuth kullanır, ANTHROPIC_API_KEY gerekmez.
 * --safe-mode: CLAUDE.md + skill + MCP + hook yüklenmiyor → düşük maliyet.
 * --no-session-persistence: session diske yazılmaz.
 * --output-format json: { result, total_cost_usd } döner.
 *
 * @returns {{ metin, maliyet_usd, model, sure_ms }}
 */
export async function claudeCalistir(prompt, {
  model = 'claude-sonnet-4-6',
  zaman_asimi_ms = 180_000,
} = {}) {
  const basla = Date.now()

  // execFile input: option claude'a ulaşmıyor (stdin 3s bekleme hatası).
  // spawn ile doğrudan stdin pipe: proc.stdin.write(prompt) + end() → EOF sinyali.
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'claude',
      ['-p', '--model', model, '--output-format', 'json', '--safe-mode', '--no-session-persistence'],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )

    let stdoutData = ''
    let stderrData = ''

    proc.stdout.on('data', d => { stdoutData += d })
    proc.stderr.on('data', d => { stderrData += d })

    proc.stdin.write(prompt, 'utf8')
    proc.stdin.end()

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`claude -p zaman aşımı (${zaman_asimi_ms}ms)`))
    }, zaman_asimi_ms)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`claude -p çıkış kodu ${code}\nstderr: ${stderrData.slice(0, 800)}`))
        return
      }
      let parsed
      try {
        parsed = JSON.parse(stdoutData)
      } catch {
        reject(new Error(`JSON ayrıştırma hatası. stdout başı: ${stdoutData.slice(0, 400)}`))
        return
      }
      resolve({
        metin: parsed.result ?? parsed.content ?? '',
        maliyet_usd: parsed.total_cost_usd ?? null,
        model,
        sure_ms: Date.now() - basla,
      })
    })

    proc.on('error', e => { clearTimeout(timer); reject(new Error(`spawn hatası: ${e.message}`)) })
  })
}

/**
 * Scope-lock'lu güvenli yazma.
 * nsKokYolu dışına yazma girişimi → ScopeLockHatasi.
 */
/**
 * claudeCalistir + sınırlı-retry. Geçici hatalar (timeout/non-zero-exit/JSON-parse
 * glitch) zinciri ABORT etmesin diye her başarısız denemeden sonra artan beklemeyle
 * yeniden dener. Her deneme hatası log() ile yüzeye çıkar (sessiz yutma YOK). Tüm
 * denemeler tükenirse TÜM deneme hatalarını taşıyan tek bir toplu hata fırlatılır —
 * çağıran taraf (planlamaLoopV2) bunu görüp aşamayı net bir nedenle dondurur.
 *
 * @param {{ _claudeCalistir?: function }} opts — test için claudeCalistir enjeksiyon noktası
 * @returns {{ metin, maliyet_usd, model, sure_ms }}
 */
export async function claudeCalistirRetry(prompt, {
  model = 'claude-sonnet-4-6',
  zaman_asimi_ms = 360_000,
  maxDeneme = 3,
  bekleMs = 3_000,
  log = () => {},
  _claudeCalistir = claudeCalistir,
} = {}) {
  const denemeHatalari = []
  for (let deneme = 1; deneme <= maxDeneme; deneme++) {
    try {
      const sonuc = await _claudeCalistir(prompt, { model, zaman_asimi_ms })
      if (deneme > 1) {
        log(`claudeCalistirRetry: deneme ${deneme}/${maxDeneme} BAŞARILI (önceki ${deneme - 1} deneme geçiciydi)`)
      }
      return sonuc
    } catch (e) {
      denemeHatalari.push(`deneme ${deneme}/${maxDeneme}: ${e.message}`)
      log(`claudeCalistirRetry: deneme ${deneme}/${maxDeneme} başarısız — ${e.message.slice(0, 150)}`)
      if (deneme < maxDeneme) {
        await new Promise(r => setTimeout(r, bekleMs * deneme))
      }
    }
  }
  throw new Error(`claude -p ${maxDeneme} denemede de başarısız:\n${denemeHatalari.join('\n')}`)
}

/**
 * Scope-lock'lu GÜVENLİ yazma — yaz + doğrula + gerekirse yeniden-dene.
 *
 * İKİ katmanlı savunma (gözlemlenen gerçek vaka: üretilen bir bölüm, Drive-senkronlu bir mount'a
 * yazılırken kırpılmış hâliyle HEM yerelde HEM Drive'da göründü — yazımın senkronla YARIŞTIĞI
 * ile tutarlı):
 *   1. Geçici dosyaya (AYNI dizin, dolayısıyla AYNI dosya sistemi — atomik rename garantisi) yaz,
 *      SONRA hedefin ÜZERİNE atomik rename et. Bir senkron istemcisi (ör. Google Drive Desktop)
 *      hedef yolu izliyor olsa bile ASLA kısmi bir yazım GÖZLEMLEYEMEZ — rename ya ESKİ ya TAM
 *      YENİ içeriği gösterir, ikisi arası bir an YOKTUR. Bu birincil savunma.
 *   2. Rename SONRASI yerinden geri-oku + yazılanla HARFİYEN karşılaştır (senkron GECİKMESİNDEN
 *      bağımsız — Drive'ın buluta yüklemesini BEKLEMEZ, yalnız yerel diskten hemen geri-okur).
 *      Uyuşmazsa (temp-dosya/rename mekanizması dışında bir nedenle) sınırlı-yeniden-dene; tüm
 *      denemeler tükenirse SESSİZCE KABUL ETMEK YERİNE net bir hata fırlatır (fail loud).
 *
 * @param {{maxDeneme?, _writeFileSync?, _readFileSync?, _renameSync?, _unlinkSync?}} opts —
 *        son 4'ü yalnız test için fault-injection noktası (claudeCalistirRetry'nin _claudeCalistir
 *        deseniyle AYNI); verilmezse gerçek fs çağrıları kullanılır.
 */
export function guvenliYaz(dosyaYolu, icerik, nsKokYolu, opts = {}) {
  const {
    maxDeneme = 3,
    _writeFileSync = writeFileSync,
    _readFileSync = readFileSync,
    _renameSync = renameSync,
    _unlinkSync = unlinkSync,
  } = opts

  scopeKontrol(dosyaYolu, nsKokYolu)
  const mutlak = resolve(dosyaYolu)
  const dizin = dirname(mutlak)
  mkdirSync(dizin, { recursive: true })

  const denemeHatalari = []
  for (let deneme = 1; deneme <= maxDeneme; deneme++) {
    const geciciYol = join(dizin, `.${basename(mutlak)}.tmp-${randomBytes(6).toString('hex')}`)
    try {
      _writeFileSync(geciciYol, icerik, 'utf8')
      _renameSync(geciciYol, mutlak)
      const geriOkunan = _readFileSync(mutlak, 'utf8')
      if (geriOkunan !== icerik) {
        throw new Error(`geri-okuma uyuşmazlığı: yazılan ${icerik.length} karakter, okunan ${geriOkunan.length} karakter`)
      }
      return mutlak
    } catch (e) {
      denemeHatalari.push(`deneme ${deneme}/${maxDeneme}: ${e.message}`)
      try { _unlinkSync(geciciYol) } catch { /* zaten yok olabilir (rename başarılı olmuş olabilir) */ }
    }
  }
  throw new Error(
    `guvenliYaz: ${maxDeneme} denemede de DOĞRULANMIŞ yazım başarısız (${mutlak}) — kısmi/tutarsız ` +
    `yazım SESSİZCE kabul edilmedi:\n${denemeHatalari.join('\n')}`
  )
}
