// Canlı planlama yürütücüsü — claude -p headless (abonelik OAuth) + scope-lock.
// --safe-mode: CLAUDE.md yüklenmez → düşük overhead, meta-protokol devreye girmez.
// Namespace dışına yazma → ScopeLockHatasi fırlatır.

import { spawn } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

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

export function guvenliYaz(dosyaYolu, icerik, nsKokYolu) {
  scopeKontrol(dosyaYolu, nsKokYolu)
  const mutlak = resolve(dosyaYolu)
  mkdirSync(dirname(mutlak), { recursive: true })
  writeFileSync(mutlak, icerik, 'utf8')
  return mutlak
}
