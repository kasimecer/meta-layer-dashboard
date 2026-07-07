// OpenRouter yürütücüsü — canliYurutucu.mjs'nin (claude -p / abonelik OAuth) KARDEŞİ, ama
// AYRI bir kimlik-doğrulama ve fatura yolu: $OPENROUTER_API_KEY (env'den; hiçbir dosyaya
// yazılmaz/loglanmaz — SIR-YASAGI). ANTHROPIC_API_KEY'e ASLA dokunmaz/gerektirmez.
//
// Bu dosya GENEL bir OpenRouter HTTP katmanıdır — hangi model çağrıldığını BİLMEZ (çağıran
// belirler). Kritik-pasaj-özgü kısıtlar (üretici-soy yasağı, sabit model, vb.) tools/
// elestiriPasi.mjs'dedir — burada değil (tek-sorumluluk).

export class OpenRouterHatasi extends Error {
  constructor(mesaj, { durum, gövde } = {}) {
    super(mesaj)
    this.name = 'OpenRouterHatasi'
    this.durum = durum ?? null
    this.govde = gövde ?? null
  }
}

/**
 * OpenRouter chat-completions — TEK deneme (retry sarmalayıcısı openRouterCalistirRetry'dedir).
 * usage:{include:true} → yanıt.usage.cost gerçek USD maliyeti taşır (OpenRouter'ın kendi
 * hesapladığı, upstream sağlayıcı faturasına dayalı rakam — tahmini DEĞİL).
 *
 * @param {string} sistemPrompt — system mesajı (boş bırakılabilir)
 * @param {string} kullaniciPrompt — user mesajı (asıl görev)
 * @param {{ model, reasoningEffort?, maxTokens?, sicaklik?, zaman_asimi_ms? }} opts
 * @returns {{ metin, akilYurutmeMetni, maliyet_usd, model, sure_ms, kullanim }}
 */
export async function openRouterCalistir(sistemPrompt, kullaniciPrompt, {
  model,
  reasoningEffort = null,
  maxTokens = 16000,
  sicaklik = 1,
  zaman_asimi_ms = 600_000,
} = {}) {
  if (!model) throw new Error('openRouterCalistir: model zorunlu')
  const anahtar = process.env.OPENROUTER_API_KEY
  if (!anahtar) throw new Error('openRouterCalistir: OPENROUTER_API_KEY env tanımsız')

  const basla = Date.now()
  const mesajlar = []
  if (sistemPrompt) mesajlar.push({ role: 'system', content: sistemPrompt })
  mesajlar.push({ role: 'user', content: kullaniciPrompt })

  const govde = {
    model,
    messages: mesajlar,
    max_tokens: maxTokens,
    temperature: sicaklik,
    usage: { include: true }, // gerçek USD maliyeti yanıtta iste
  }
  if (reasoningEffort) govde.reasoning = { effort: reasoningEffort }

  const denetleyici = new AbortController()
  const zamanAsimiId = setTimeout(() => denetleyici.abort(), zaman_asimi_ms)
  let yanit
  try {
    yanit = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anahtar}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(govde),
      signal: denetleyici.signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw new OpenRouterHatasi(`openRouterCalistir: zaman aşımı (${zaman_asimi_ms}ms)`)
    throw new OpenRouterHatasi(`openRouterCalistir: ağ hatası: ${e.message}`)
  } finally {
    clearTimeout(zamanAsimiId)
  }

  const hamMetin = await yanit.text()
  let ayrisik
  try {
    ayrisik = JSON.parse(hamMetin)
  } catch {
    throw new OpenRouterHatasi(`openRouterCalistir: JSON ayrıştırma hatası (HTTP ${yanit.status}). Gövde başı: ${hamMetin.slice(0, 300)}`, { durum: yanit.status, gövde: hamMetin })
  }

  if (!yanit.ok || ayrisik.error) {
    const mesaj = ayrisik.error?.message ?? ayrisik.error ?? `HTTP ${yanit.status}`
    throw new OpenRouterHatasi(`openRouterCalistir: ${model} reddetti — ${mesaj}`, { durum: yanit.status, gövde: ayrisik })
  }

  const secim = ayrisik.choices?.[0]
  const metin = secim?.message?.content ?? ''
  if (!metin.trim()) {
    throw new OpenRouterHatasi(`openRouterCalistir: ${model} boş içerik döndürdü (finish_reason: ${secim?.finish_reason ?? 'bilinmiyor'})`, { durum: yanit.status, gövde: ayrisik })
  }

  return {
    metin,
    akilYurutmeMetni: secim?.message?.reasoning ?? null,
    maliyet_usd: ayrisik.usage?.cost ?? null,
    model: ayrisik.model ?? model, // OpenRouter'ın ÇÖZDÜĞÜ gerçek (tarihli) slug — istenen alias DEĞİL
    sure_ms: Date.now() - basla,
    kullanim: ayrisik.usage ?? null,
  }
}

/**
 * openRouterCalistir + sınırlı-retry — claudeCalistirRetry (canliYurutucu.mjs) ile AYNI
 * felsefe: geçici hatalar (ağ/zaman-aşımı/boş-yanıt) artan beklemeyle yeniden denenir; kalıcı
 * bir hata (ör. model gerçekten yok/erişilemez) de üç denemeden sonra AÇIK bir hatayla durur —
 * hiçbir zaman SESSİZCE farklı bir modele düşmez (bu dosyanın sorumluluğu değil; hangi modelin
 * "kabul edilebilir" olduğuna çağıran — tools/elestiriPasi.mjs — karar verir).
 */
export async function openRouterCalistirRetry(sistemPrompt, kullaniciPrompt, {
  model,
  reasoningEffort = null,
  maxTokens = 16000,
  sicaklik = 1,
  zaman_asimi_ms = 600_000,
  maxDeneme = 3,
  bekleMs = 3_000,
  log = () => {},
  _openRouterCalistir = openRouterCalistir,
} = {}) {
  const denemeHatalari = []
  for (let deneme = 1; deneme <= maxDeneme; deneme++) {
    try {
      const sonuc = await _openRouterCalistir(sistemPrompt, kullaniciPrompt, { model, reasoningEffort, maxTokens, sicaklik, zaman_asimi_ms })
      if (deneme > 1) log(`openRouterCalistirRetry: deneme ${deneme}/${maxDeneme} BAŞARILI (önceki ${deneme - 1} deneme geçiciydi)`)
      return sonuc
    } catch (e) {
      denemeHatalari.push(`deneme ${deneme}/${maxDeneme}: ${e.message}`)
      log(`openRouterCalistirRetry: deneme ${deneme}/${maxDeneme} başarısız — ${e.message.slice(0, 200)}`)
      if (deneme < maxDeneme) await new Promise(r => setTimeout(r, bekleMs * deneme))
    }
  }
  throw new OpenRouterHatasi(`openRouterCalistir ${maxDeneme} denemede de başarısız:\n${denemeHatalari.join('\n')}`)
}
