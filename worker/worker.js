// meta-layer-write — TEK standalone Cloudflare Worker.
// İki iş taşır: (1) yazma-yolu  POST /submit  (partner cevabı → GitHub inbox dosyası)
//              (2) auth temeli  GET  /operator (OPERATOR_TOKEN kapısı — şimdilik iskelet)
//
// GH-Pages statik kalır (RE-HOST YOK). Statik site bu Worker'ı ayrı origin'den çağırır → CORS şart.
//
// Yapılandırma (wrangler [vars], HARDCODE YOK):
//   GH_OWNER, GH_REPO, GH_BRANCH, INBOX_PATH, ALLOWED_ORIGIN (virgülle çok-origin)
// Secret (wrangler secret put — repoya GİRMEZ):
//   GITHUB_TOKEN (server-side, GERÇEK) · SUBMIT_TOKEN (client'ta görünür, hafif kapı) · OPERATOR_TOKEN (server-side, GERÇEK)

const GH_API = 'https://api.github.com'
const UA = 'meta-layer-write-worker'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''

    // --- CORS preflight ---
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
    }

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'meta-layer-write' }, 200, origin, env)
      }
      if (url.pathname === '/submit' && request.method === 'POST') {
        return await handleSubmit(request, env, origin)
      }
      if (url.pathname === '/operator' && request.method === 'GET') {
        return await handleOperator(request, env, origin, url)
      }
      return json({ ok: false, hata: 'bulunamadı' }, 404, origin, env)
    } catch (e) {
      // Beklenmeyen → istemciye sızdırma; logla
      console.error('worker hata:', e && e.stack || e)
      return json({ ok: false, hata: 'sunucu hatası' }, 500, origin, env)
    }
  },
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
// GET /operator — auth temeli (İSKELET)
// Orkestratör kararı: operatör verisi HENÜZ TAŞINMAZ (düşük-hassasiyet survivor-pull +
// public repo'ya commit'lenen her şey zaten public → gerçek gate veri-taşıma projesi).
// Burada token kapısı UÇTAN-UCA kanıtlanır; sonraki slice veriyi ucuza arkasına alır.
// ============================================================
async function handleOperator(request, env, origin, url) {
  const token = request.headers.get('x-operator-token') || bearer(request)
  if (!env.OPERATOR_TOKEN || !safeEqual(token, env.OPERATOR_TOKEN)) {
    return json({ ok: false, hata: 'yetkisiz' }, 401, origin, env)
  }
  const proje = String(url.searchParams.get('proje') || '').trim()
  // İSKELET: gerçek operatör JSON'u henüz BURADAN servis edilmiyor (hâlâ statik public).
  return json({
    ok: true,
    gated: true,
    proje: proje || null,
    not: 'auth iskeleti çalışıyor — operatör verisi taşıma bekliyor (sonraki slice)',
  }, 200, origin, env)
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
function originAllowed(origin, env) {
  const list = allowedOrigins(env)
  return list.length === 0 ? false : list.includes(origin)
}
function corsHeaders(origin, env) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-submit-token, x-operator-token, authorization',
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
