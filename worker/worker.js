// meta-layer-write — TEK standalone Cloudflare Worker.
// Üç iş taşır: (1) yazma-yolu    POST /submit             (partner cevabı → GitHub inbox dosyası)
//              (2) intake-kuyruğu POST /intake-queue       (taslak → GitHub kuyruk dosyası; yerel
//                  izleyici (scripts/intake-queue-watch.mjs) bunu görüp materyalize+loop koşar)
//              (3) soru-yanıt-kuyruğu POST /soru-yanit-queue (planlama sorularına operatör yanıtı →
//                  GitHub kuyruk dosyası; yerel izleyici (scripts/soru-yanit-queue-watch.mjs) bunu
//                  görüp planlama SORU–YANIT artefaktına yazar — pipeline'ı BAŞLATMAZ/İLERLETMEZ)
//
// GH-Pages statik kalır (RE-HOST YOK). Statik site bu Worker'ı ayrı origin'den çağırır → CORS şart.
// Worker HİÇBİR ZAMAN `claude` çalıştırmaz / pipeline'a dokunmaz — yalnız git'e yazar. Abonelik-auth
// gerektiren tüm iş (materyalize + planlama pipeline) YEREL izleyicide, kullanıcının makinesinde kalır.
//
// Operatör okuma-yolu artık BURADA DEĞİL: meta-layer-operator.pages.dev (Direct-Upload, ayrı Pages
// projesi) + Cloudflare Access. Eski GET /operator (OPERATOR_TOKEN iskelet) kaldırıldı — bkz
// meta-kanal.md deploy-ayrımı görevi.
//
// Yapılandırma (wrangler [vars], HARDCODE YOK):
//   GH_OWNER, GH_REPO, GH_BRANCH, INBOX_PATH, INTAKE_QUEUE_PATH, SORU_YANIT_QUEUE_PATH,
//   ALLOWED_ORIGIN (virgülle çok-origin)
// Secret (wrangler secret put — repoya GİRMEZ):
//   GITHUB_TOKEN (server-side, GERÇEK) · SUBMIT_TOKEN (client'ta görünür, hafif kapı)

const GH_API = 'https://api.github.com'
const UA = 'meta-layer-write-worker'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''

    // --- CORS preflight ---
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
    }

    let resp
    try {
      if (url.pathname === '/health') {
        resp = json({ ok: true, service: 'meta-layer-write' }, 200, origin, env)
      } else if (url.pathname === '/submit' && request.method === 'POST') {
        resp = await handleSubmit(request, env, origin)
      } else if (url.pathname === '/intake-queue' && request.method === 'POST') {
        resp = await handleIntakeQueue(request, env, origin)
      } else if (url.pathname === '/soru-yanit-queue' && request.method === 'POST') {
        resp = await handleSoruYanitQueue(request, env, origin)
      } else if (url.pathname === '/failures' && request.method === 'GET') {
        resp = await handleFailures(request, env, origin)
      } else {
        resp = json({ ok: false, hata: 'bulunamadı' }, 404, origin, env)
      }
    } catch (e) {
      // Beklenmeyen → istemciye sızdırma; logla
      console.error('worker hata:', e && e.stack || e)
      resp = json({ ok: false, hata: 'sunucu hatası' }, 500, origin, env)
    }

    // 2026-07-18 (C — kalıcı hata izi): her BAŞARISIZ (4xx/5xx) yanıt, /health ve /failures
    // HARİÇ, KV'ye kalıcı bir kayıt bırakır — "hiç tıklanmadı" ile "tıklandı ama sessizce
    // başarısız oldu" belirsizliği (bkz meta-kanal 2026-07-18 P0 kesinleştirme raporu) bir
    // daha ele alınamaz olmasın diye. ctx.waitUntil ile yanıtı GECİKTİRMEZ; KV yazımı
    // başarısız olsa bile (logFailure kendi try/catch'i) asıl yanıt ETKİLENMEZ.
    if (resp.status >= 400 && url.pathname !== '/health' && url.pathname !== '/failures' && ctx?.waitUntil) {
      ctx.waitUntil(logFailure(env, { yol: url.pathname, status: resp.status, origin }))
    }

    return resp
  },
}

// ============================================================
// Kalıcı hata izi — KV (META_LOG binding). GitHub-as-datastore'dan BİLEREK BAĞIMSIZ: GitHub'a
// yazım BAŞARISIZ olduğunda bile (ör. GH kendisi erişilemez) bu iz hâlâ tutulabilir. Yazım
// başarısız olursa (env.META_LOG yoksa / KV hatası) SESSİZCE yutulur — asıl HTTP yanıtını asla
// etkilemez (bu yalnız TEŞHİS amaçlı ikincil bir iz, birincil işlevi bloklayamaz).
// ============================================================
async function logFailure(env, { yol, status, origin }) {
  if (!env.META_LOG) return
  try {
    const ts = new Date().toISOString()
    const anahtar = `fail:${ts}:${Math.random().toString(36).slice(2, 8)}`
    const kayit = { ts, yol, status, origin: origin || null }
    await env.META_LOG.put(anahtar, JSON.stringify(kayit), { expirationTtl: 60 * 60 * 24 * 30 })
  } catch (e) {
    console.error('logFailure hata (yutuldu):', e && e.stack || e)
  }
}

// ============================================================
// GET /failures — son N başarısız-istek kaydını listeler (teşhis amaçlı, token-gated).
// header x-submit-token VEYA ?token= — operatör/CC terminalden curl ile sorgular.
// ============================================================
async function handleFailures(request, env, origin) {
  const url = new URL(request.url)
  const token = request.headers.get('x-submit-token') || bearer(request) || url.searchParams.get('token')
  if (!env.SUBMIT_TOKEN || !safeEqual(token, env.SUBMIT_TOKEN)) {
    return json({ ok: false, hata: 'yetkisiz' }, 401, origin, env)
  }
  if (!env.META_LOG) return json({ ok: true, kayitlar: [], not: 'META_LOG binding yok' }, 200, origin, env)

  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200)
  const liste = await env.META_LOG.list({ prefix: 'fail:', limit })
  const kayitlar = []
  for (const k of liste.keys) {
    const deger = await env.META_LOG.get(k.name)
    if (deger) { try { kayitlar.push(JSON.parse(deger)) } catch { /* noop */ } }
  }
  // en-yeni-önce (anahtar ISO-zaman-damgalı → sözlüksel sıralama = kronolojik)
  kayitlar.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return json({ ok: true, kayitlar }, 200, origin, env)
}

// ============================================================
// POST /submit — yazma-yolu (çekirdek)
// body: { projeId, kartId, ozet, cevap } · header: x-submit-token
// SUBMIT_TOKEN doğrula → GITHUB_TOKEN ile inbox dosyasına satır APPEND et.
// ============================================================
async function handleSubmit(request, env, origin) {
  // (cheap-hardening) Origin allowlist — tarayıcı-kaynaklı casual abuse'u kısar.
  if (origin && !originAllowed(origin, env)) {
    return json({ ok: false, hata: 'origin reddedildi' }, 403, origin, env)
  }
  // SUBMIT_TOKEN — DÜRÜST SINIR: client JS'inde görünür, kararlı saldırgana karşı gerçek değil.
  const token = request.headers.get('x-submit-token') || bearer(request)
  if (!env.SUBMIT_TOKEN || !safeEqual(token, env.SUBMIT_TOKEN)) {
    return json({ ok: false, hata: 'yetkisiz' }, 401, origin, env)
  }

  let body
  try { body = await request.json() } catch { return json({ ok: false, hata: 'geçersiz json' }, 400, origin, env) }

  const projeId = String(body.projeId || '').trim()
  const kartId  = String(body.kartId || '').trim()
  const ozet    = String(body.ozet || '').trim()
  const cevap   = String(body.cevap || '').trim()
  if (!projeId || !kartId || !cevap) {
    return json({ ok: false, hata: 'eksik alan (projeId/kartId/cevap)' }, 400, origin, env)
  }
  // Hafif boyut/temizlik koruması (abuse / dev kazası)
  if (cevap.length > 4000) return json({ ok: false, hata: 'cevap çok uzun' }, 413, origin, env)

  const gh = ghConfig(env)
  if (!gh.token) return json({ ok: false, hata: 'GITHUB_TOKEN ayarlı değil' }, 500, origin, env)

  const satir = inboxSatiri({ projeId, kartId, ozet, cevap })
  const sonuc = await appendToInbox(gh, satir)
  if (!sonuc.ok) return json({ ok: false, hata: sonuc.hata }, sonuc.status || 502, origin, env)

  return json({ ok: true, commit: sonuc.commit, path: gh.path }, 200, origin, env)
}

// ============================================================
// POST /intake-queue — intake taslağını kuyruğa yazar (yerel izleyici okur)
// body: { taslak: { id, projeKaydi, cardsJson, intakeMd } } · header: x-submit-token
// Worker BURADA materyalize ETMEZ / claude ÇALIŞTIRMAZ — yalnız git'e commit eder.
// Abonelik-auth gerektiren gerçek iş scripts/intake-queue-watch.mjs'de, kullanıcının
// kendi makinesinde koşar (bkz worker.js dosya başı yorumu).
// ============================================================
async function handleIntakeQueue(request, env, origin) {
  if (origin && !originAllowed(origin, env)) {
    return json({ ok: false, hata: 'origin reddedildi' }, 403, origin, env)
  }
  const token = request.headers.get('x-submit-token') || bearer(request)
  if (!env.SUBMIT_TOKEN || !safeEqual(token, env.SUBMIT_TOKEN)) {
    return json({ ok: false, hata: 'yetkisiz' }, 401, origin, env)
  }

  let body
  try { body = await request.json() } catch { return json({ ok: false, hata: 'geçersiz json' }, 400, origin, env) }

  const taslak = body?.taslak
  const id = String(taslak?.id || '').trim()
  if (!id || !taslak?.projeKaydi || !taslak?.cardsJson) {
    return json({ ok: false, hata: 'geçersiz taslak (id/projeKaydi/cardsJson eksik)' }, 400, origin, env)
  }
  // Path-traversal koruması: id yalnız güvenli slug karakterleri taşımalı (harf/rakam/tire/
  // alt-çizgi). Baştaki `_` özellikle İZİNLİ — _demo-*/_test-* atılır-namespace konvansiyonu.
  if (!/^[a-z0-9_][a-z0-9_-]{0,80}$/.test(id)) {
    return json({ ok: false, hata: 'geçersiz id biçimi' }, 400, origin, env)
  }
  // Hafif boyut koruması (abuse / dev kazası)
  const boyut = JSON.stringify(taslak).length
  if (boyut > 200_000) return json({ ok: false, hata: 'taslak çok büyük' }, 413, origin, env)

  const gh = ghConfig(env)
  if (!gh.token) return json({ ok: false, hata: 'GITHUB_TOKEN ayarlı değil' }, 500, origin, env)

  const kuyrukDizin = String(env.INTAKE_QUEUE_PATH || 'intake-kuyruk').replace(/\/$/, '')
  const kuyrukYol = `${kuyrukDizin}/${id}.json`

  const sonuc = await putGithubJsonFile(gh, kuyrukYol, taslak, `intake-app: kuyruk (${id})`)
  if (!sonuc.ok) return json({ ok: false, hata: sonuc.hata }, sonuc.status || 502, origin, env)

  return json({ ok: true, commit: sonuc.commit, path: kuyrukYol }, 200, origin, env)
}

// ============================================================
// POST /soru-yanit-queue — planlama sorularına operatör yanıtını kuyruğa yazar
// body: { gonderim: { projeId, asama, surum, soruImza, yanitlar } } · header: x-submit-token
// Worker BURADA yanıt artefaktına YAZMAZ / kapı/bütünlük/bayatlık DEĞERLENDİRMEZ — yalnız
// git'e commit eder. Gerçek doğrulama (sürüm/imza tazeliği, tip-özgü yanıt şekli, tüm-ya-da-
// hiç uygulama) scripts/soru-yanit-queue-watch.mjs'de, kullanıcının kendi makinesinde koşar.
// Doğrulama burada BİLEREK sığ (varlık/tip/biçim) — derin anlam kontrolü izleyicinin işi
// (bkz worker.js dosya başı yorumu; "Worker = saf git-yazma rölesi").
//
// 2026-07-17 DÜZELTME: `asama` eskiden sabit 5-aşama whitelist'ine (GECERLI_ASAMALAR Set) karşı
// doğrulanıyordu — master-plan bölüm-yürüyüşü AKTİFKEN dashboard artık bölüm-seviyesi açık
// soruları da doğru gösteriyor (ör. "ozet-yonetici"), ve SoruYanitView bu bölüm id'sini AYNEN
// `asama` alanına koyup gönderiyor — ama bölüm id'leri bu whitelist'te HİÇ YOKTU → GERÇEK bir
// operatör gönderimi burada 400 ile REDDEDİLDİ (canlı-gözlemlenen vaka). Worker'ın KENDİSİ
// (yukarıdaki yorum) "derin anlam kontrolü izleyicinin işi" diyor — 15 bölüm id'sini BURADA
// AYRICA bir sabit listede TUTMAK (tools/planlamaBolumTanimlari.mjs'den BAĞIMSIZ, bu dosya hiçbir
// modül import ETMİYOR — tek-dosya Worker) iki listenin GELECEKTE birbirinden KAYMASI riskini
// taşırdı. Bunun yerine BİÇİM-bazlı bir sınır: her aşama/bölüm id'si ZATEN küçük-harf-Latin +
// rakam + tire bir slug'tır (5 aşama adı DA bu kalıba uyar) — GERÇEK varlık/tazelik kontrolü
// (bu asama GERÇEKTEN var mı, açık soru VAR mı) yine YALNIZ izleyicide yapılır, DEĞİŞMEDİ.
const ASAMA_BICIM_DESENI = /^[a-z][a-z0-9-]{0,60}$/

async function handleSoruYanitQueue(request, env, origin) {
  if (origin && !originAllowed(origin, env)) {
    return json({ ok: false, hata: 'origin reddedildi' }, 403, origin, env)
  }
  const token = request.headers.get('x-submit-token') || bearer(request)
  if (!env.SUBMIT_TOKEN || !safeEqual(token, env.SUBMIT_TOKEN)) {
    return json({ ok: false, hata: 'yetkisiz' }, 401, origin, env)
  }

  let body
  try { body = await request.json() } catch { return json({ ok: false, hata: 'geçersiz json' }, 400, origin, env) }

  const gonderim = body?.gonderim
  const projeId   = String(gonderim?.projeId || '').trim()
  const asama     = String(gonderim?.asama || '').trim()
  const surum     = gonderim?.surum
  const soruImza  = String(gonderim?.soruImza || '').trim()
  const yanitlar  = gonderim?.yanitlar

  if (!projeId || !asama || !soruImza || !Array.isArray(yanitlar) || yanitlar.length === 0) {
    return json({ ok: false, hata: 'eksik alan (projeId/asama/soruImza/yanitlar)' }, 400, origin, env)
  }
  // Path-traversal koruması: aynı slug kuralı intake-kuyruğu ile — _demo-*/_test-* izinli.
  if (!/^[a-z0-9_][a-z0-9_-]{0,80}$/.test(projeId)) {
    return json({ ok: false, hata: 'geçersiz projeId biçimi' }, 400, origin, env)
  }
  if (!ASAMA_BICIM_DESENI.test(asama)) {
    return json({ ok: false, hata: 'geçersiz asama' }, 400, origin, env)
  }
  if (!Number.isInteger(surum) || surum < 1) {
    return json({ ok: false, hata: 'geçersiz surum (pozitif tam sayı olmalı)' }, 400, origin, env)
  }
  // Hafif boyut/temizlik koruması (abuse / dev kazası) — intake-kuyruğu ile aynı sınır.
  const boyut = JSON.stringify(gonderim).length
  if (boyut > 200_000) return json({ ok: false, hata: 'gönderim çok büyük' }, 413, origin, env)

  const gh = ghConfig(env)
  if (!gh.token) return json({ ok: false, hata: 'GITHUB_TOKEN ayarlı değil' }, 500, origin, env)

  const kuyrukDizin = String(env.SORU_YANIT_QUEUE_PATH || 'soru-yanit-kuyruk').replace(/\/$/, '')
  const kuyrukYol = `${kuyrukDizin}/${projeId}--${asama}--v${surum}.json`

  const sonuc = await putGithubJsonFile(gh, kuyrukYol, gonderim, `soru-yanit-app: kuyruk (${projeId}/${asama} v${surum})`)
  if (!sonuc.ok) return json({ ok: false, hata: sonuc.hata }, sonuc.status || 502, origin, env)

  return json({ ok: true, commit: sonuc.commit, path: kuyrukYol }, 200, origin, env)
}

// ============================================================
// GitHub Contents API — oku→append→yaz (UTF-8 güvenli base64; Türkçe karakter şart)
// ============================================================
function ghConfig(env) {
  return {
    token: env.GITHUB_TOKEN,
    owner: env.GH_OWNER,
    repo: env.GH_REPO,
    branch: env.GH_BRANCH || 'main',
    path: env.INBOX_PATH || 'partner-inbox/baris.md',
  }
}

async function appendToInbox(gh, satir, retry = true) {
  const base = `${GH_API}/repos/${gh.owner}/${gh.repo}/contents/${encodePath(gh.path)}`
  const headers = {
    'Authorization': `Bearer ${gh.token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
  }

  // 1) Mevcut dosya (varsa) — sha + içerik
  let sha = null, mevcut = ''
  const getRes = await fetch(`${base}?ref=${encodeURIComponent(gh.branch)}`, { headers })
  if (getRes.status === 200) {
    const data = await getRes.json()
    sha = data.sha
    mevcut = b64decodeUtf8(data.content || '')
  } else if (getRes.status === 404) {
    mevcut = inboxBaslik()   // dosya yok → başlık ile başlat
  } else {
    return { ok: false, status: 502, hata: `github get ${getRes.status}` }
  }

  // 2) Append (sonda tek newline garantisi)
  const govde = mevcut.replace(/\s*$/, '') + '\n' + satir + '\n'

  // 3) PUT (create veya update)
  const putBody = {
    message: `partner-app: inbox cevap (${satir.slice(0, 72)})`,
    content: b64encodeUtf8(govde),
    branch: gh.branch,
  }
  if (sha) putBody.sha = sha

  const putRes = await fetch(base, { method: 'PUT', headers, body: JSON.stringify(putBody) })
  if (putRes.status === 200 || putRes.status === 201) {
    const data = await putRes.json()
    return { ok: true, commit: data.commit && data.commit.sha }
  }
  // 409 = sha çakışması (eşzamanlı yazım) → bir kez tekrar dene
  if (putRes.status === 409 && retry) {
    return appendToInbox(gh, satir, false)
  }
  let detay = ''
  try { detay = (await putRes.json()).message || '' } catch { /* noop */ }
  return { ok: false, status: 502, hata: `github put ${putRes.status}${detay ? ': ' + detay : ''}` }
}

// Yeni-dosya oluştur/güncelle (JSON, tam-değiştir) — intake-kuyruğu için.
// appendToInbox'tan FARKI: mevcut içeriğe eklemez, dosyayı doğrudan JSON olarak yazar
// (kuyruk dosyaları tek-taslak, satır-satır büyüyen bir log değil).
async function putGithubJsonFile(gh, path, obj, mesaj, retry = true) {
  const base = `${GH_API}/repos/${gh.owner}/${gh.repo}/contents/${encodePath(path)}`
  const headers = {
    'Authorization': `Bearer ${gh.token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
  }

  let sha = null
  const getRes = await fetch(`${base}?ref=${encodeURIComponent(gh.branch)}`, { headers })
  if (getRes.status === 200) {
    sha = (await getRes.json()).sha
  } else if (getRes.status !== 404) {
    return { ok: false, status: 502, hata: `github get ${getRes.status}` }
  }

  const putBody = {
    message: mesaj,
    content: b64encodeUtf8(JSON.stringify(obj, null, 2) + '\n'),
    branch: gh.branch,
  }
  if (sha) putBody.sha = sha

  const putRes = await fetch(base, { method: 'PUT', headers, body: JSON.stringify(putBody) })
  if (putRes.status === 200 || putRes.status === 201) {
    const data = await putRes.json()
    return { ok: true, commit: data.commit && data.commit.sha }
  }
  if (putRes.status === 409 && retry) {
    return putGithubJsonFile(gh, path, obj, mesaj, false)
  }
  let detay = ''
  try { detay = (await putRes.json()).message || '' } catch { /* noop */ }
  return { ok: false, status: 502, hata: `github put ${putRes.status}${detay ? ': ' + detay : ''}` }
}

// inbox dosyası ilk kez oluşturulurken başlık — seam'i dosyanın İÇİNDE açık eder.
function inboxBaslik() {
  return [
    '# Partner Inbox (partner-app yazma-yolu · yalnız-ekleme)',
    '',
    '> Bu dosyayı Cloudflare Worker (partner-app submit) yazar — İKİ-YAZAR KONTRATI: partner burada konuşur.',
    '> Loop okur → kanonik (projeler/<proje>/inbox.md + durum.md) ile uzlaştırır → buradan temizler.',
    '> Format: [tarih] partner-cevap · proje:<id> · kart:<id> (<özet>) → "<cevap>"',
    '',
  ].join('\n')
}

// Mevcut Drive inbox.md konvansiyonuna UYUMLU satır (tarih-önekli, alıntılı içerik) + loop'un
// uzlaştırması için yapısal alanlar (proje/kart). Yeni DOSYA şeması icat etmez.
function inboxSatiri({ projeId, kartId, ozet, cevap }) {
  const tarih = new Date().toISOString().slice(0, 10)
  const ozetKisa = ozet ? ` (${ozet})` : ''
  return `[${tarih}] partner-cevap · proje:${projeId} · kart:${kartId}${ozetKisa} → "${cevap}"`
}

// ============================================================
// Yardımcılar
// ============================================================
function encodePath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/')
}

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function b64decodeUtf8(b64) {
  const bin = atob(String(b64).replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function bearer(request) {
  const a = request.headers.get('Authorization') || ''
  const m = a.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : ''
}

// Sabit-zaman karşılaştırma (uzunluk sızdırır ama içerik sızdırmaz — token hijyeni)
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '')
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
}
// Girdi tam eşleşme VEYA "https://*.pages.dev" gibi tek-seviye alt-alan joker'i (Cloudflare Pages
// her deploy'da yeni bir hash-önekli önizleme alanı ürettiği için sabit liste bunu kapsayamaz —
// bkz worker/wrangler.toml ALLOWED_ORIGIN yorumu).
function originAllowed(origin, env) {
  const list = allowedOrigins(env)
  if (list.length === 0) return false
  return list.some(izinli => {
    const yildizIdx = izinli.indexOf('*.')
    if (yildizIdx === -1) return origin === izinli
    const onek = izinli.slice(0, yildizIdx)
    const sonek = izinli.slice(yildizIdx + 1)
    return origin.startsWith(onek) && origin.endsWith(sonek) && origin.length > onek.length + sonek.length
  })
}
function corsHeaders(origin, env) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-submit-token, authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
  if (origin && originAllowed(origin, env)) h['Access-Control-Allow-Origin'] = origin
  return h
}

function json(obj, status, origin, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin, env) },
  })
}
