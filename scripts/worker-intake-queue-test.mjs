// worker/worker.js — POST /intake-queue handler testi.
// Gerçek Cloudflare/GitHub'a dokunmadan: global fetch mock'lanır (GitHub API çağrıları
// sahte yanıt döner), worker'ın .fetch(request, env) metodu doğrudan çağrılır.
// Koşum: node scripts/worker-intake-queue-test.mjs

import worker from '../worker/worker.js'

let gecti = 0, kaldi = 0
function ok(ad, kosul, ekBilgi = '') {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}${ekBilgi ? ` (${ekBilgi})` : ''}`) }
}
function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}

const ENV = {
  GH_OWNER: 'kasimecer', GH_REPO: 'meta-layer-dashboard', GH_BRANCH: 'main',
  INTAKE_QUEUE_PATH: 'intake-kuyruk',
  ALLOWED_ORIGIN: 'https://kasimecer.github.io',
  GITHUB_TOKEN: 'sahte-gh-token', SUBMIT_TOKEN: 'sahte-submit-token',
}
const ORIGIN = 'https://kasimecer.github.io'

function istek(body, { token = ENV.SUBMIT_TOKEN, origin = ORIGIN } = {}) {
  return new Request('https://worker.test/intake-queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': origin, ...(token ? { 'x-submit-token': token } : {}) },
    body: JSON.stringify(body),
  })
}

const GECERLI_TASLAK = {
  id: 'nevresim-sabitleyici-test-2026-07-01',
  projeKaydi: { id: 'nevresim-sabitleyici-test-2026-07-01', ad: 'Test', ozet: 'test özeti' },
  cardsJson: { kartlar: [{ id: 'k01', tip: 'girdi-talebi', durum: 'cevap-bekliyor', ozet: 'x', detay: '', partner_cevap: null, olusturma: '', guncelleme: '' }] },
  intakeMd: '# Test',
}

// ── T1 — origin/token doğrulama ─────────────────────────────────────────────
bolum('T1 — Yetkilendirme')

let r = await worker.fetch(istek(GECERLI_TASLAK, { token: '' }), ENV)
ok('token yokken 401', r.status === 401)

r = await worker.fetch(istek(GECERLI_TASLAK, { token: 'yanlis-token' }), ENV)
ok('yanlış token 401', r.status === 401)

r = await worker.fetch(istek(GECERLI_TASLAK, { origin: 'https://kotu-site.com' }), ENV)
ok('izinsiz origin 403', r.status === 403)

// ── T2 — gövde doğrulama ─────────────────────────────────────────────────────
bolum('T2 — Gövde/alan doğrulama')

r = await worker.fetch(istek({ taslak: { id: 'eksik-alanlar' } }), ENV)
ok('projeKaydi/cardsJson eksikse 400', r.status === 400)

r = await worker.fetch(istek({ taslak: { ...GECERLI_TASLAK, id: '../../etc/passwd' } }), ENV)
ok('path-traversal id 400', r.status === 400)

r = await worker.fetch(istek({ taslak: { ...GECERLI_TASLAK, id: '_demo-alt-cizgi-izinli' } }), ENV)
ok('alt-çizgili id (mevcut _demo-* konvansiyonu) 400 DEĞİL', r.status !== 400, `status: ${r.status}`)

r = await worker.fetch(new Request('https://worker.test/intake-queue', {
  method: 'POST', headers: { 'x-submit-token': ENV.SUBMIT_TOKEN, origin: ORIGIN }, body: 'gecersiz-json{',
}), ENV)
ok('geçersiz JSON gövdesi 400', r.status === 400)

// ── T3 — başarılı yol (GitHub API mock) ─────────────────────────────────────
bolum('T3 — Başarılı yol (GitHub API mock)')

const orijinalFetch = globalThis.fetch
const cagrilar = []
globalThis.fetch = async (url, opts) => {
  cagrilar.push({ url: String(url), method: opts?.method || 'GET' })
  if (String(url).includes('/contents/') && (!opts || opts.method === undefined)) {
    // GET (mevcut dosya kontrolü) → 404 (dosya yok)
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
  }
  if (opts?.method === 'PUT') {
    return new Response(JSON.stringify({ commit: { sha: 'sahte-commit-sha' } }), { status: 201 })
  }
  return orijinalFetch(url, opts)
}

try {
  r = await worker.fetch(istek({ taslak: GECERLI_TASLAK }), ENV)
  const data = await r.json()
  ok('geçerli taslak 200 döner', r.status === 200, `status: ${r.status}`)
  ok('yanıt ok:true taşıyor', data.ok === true, JSON.stringify(data))
  ok('yanıt doğru kuyruk yolunu taşıyor', data.path === `intake-kuyruk/${GECERLI_TASLAK.id}.json`, data.path)
  ok('yanıt commit sha taşıyor', data.commit === 'sahte-commit-sha', data.commit)
  ok('GitHub GET + PUT çağrıları yapıldı (2 istek)', cagrilar.length === 2, JSON.stringify(cagrilar.map(c => c.method)))
  ok('PUT gövdesi doğru path\'e gitti', cagrilar[1]?.url.includes(`contents/intake-kuyruk/${GECERLI_TASLAK.id}.json`), cagrilar[1]?.url)
} finally {
  globalThis.fetch = orijinalFetch
}

// ── T4 — GITHUB_TOKEN yokken 500 ────────────────────────────────────────────
bolum('T4 — GITHUB_TOKEN eksikse')
r = await worker.fetch(istek({ taslak: GECERLI_TASLAK }), { ...ENV, GITHUB_TOKEN: undefined })
ok('GITHUB_TOKEN yoksa 500', r.status === 500)

// ── Özet ────────────────────────────────────────────────────────────────────
bolum('SONUÇ')
console.log(`${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
