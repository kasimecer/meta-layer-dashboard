// worker/worker.js — POST /soru-yanit-queue handler testi.
// Gerçek Cloudflare/GitHub'a dokunmadan: global fetch mock'lanır (GitHub API çağrıları
// sahte yanıt döner), worker'ın .fetch(request, env) metodu doğrudan çağrılır.
// Koşum: node scripts/worker-soru-yanit-queue-test.mjs

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
  SORU_YANIT_QUEUE_PATH: 'soru-yanit-kuyruk',
  ALLOWED_ORIGIN: 'https://kasimecer.github.io,http://localhost:5173',
  GITHUB_TOKEN: 'sahte-gh-token', SUBMIT_TOKEN: 'sahte-submit-token',
}
const ORIGIN = 'https://kasimecer.github.io'

function istek(body, { token = ENV.SUBMIT_TOKEN, origin = ORIGIN } = {}) {
  return new Request('https://worker.test/soru-yanit-queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': origin, ...(token ? { 'x-submit-token': token } : {}) },
    body: JSON.stringify(body),
  })
}

const GECERLI_GONDERIM = {
  projeId: 'nevresim-sabitleyici-test-2026-07-01',
  asama: 'genesis',
  surum: 1,
  soruImza: 'abc123def456',
  yanitlar: [
    { anahtar: 'secim:aday', secim: 'Tarif-Önce Kutu' },
    { anahtar: 'serbest:genesis-baglam', atlandi: true, gerekce: 'yok' },
  ],
}

// ── T1 — origin/token doğrulama ─────────────────────────────────────────────
bolum('T1 — Yetkilendirme')

let r = await worker.fetch(istek({ gonderim: GECERLI_GONDERIM }, { token: '' }), ENV)
ok('token yokken 401', r.status === 401)

r = await worker.fetch(istek({ gonderim: GECERLI_GONDERIM }, { token: 'yanlis-token' }), ENV)
ok('yanlış token 401', r.status === 401)

r = await worker.fetch(istek({ gonderim: GECERLI_GONDERIM }, { origin: 'https://kotu-site.com' }), ENV)
ok('izinsiz origin 403', r.status === 403)

r = await worker.fetch(istek({ gonderim: GECERLI_GONDERIM }, { origin: 'http://localhost:5173' }), { ...ENV, GITHUB_TOKEN: undefined })
ok('localhost:5173 origin izinli (yalnız origin kontrolü — 403 DEĞİL)', r.status !== 403, `status: ${r.status}`)

// ── T2 — gövde doğrulama ─────────────────────────────────────────────────────
bolum('T2 — Gövde/alan doğrulama')

r = await worker.fetch(istek({ gonderim: { projeId: 'eksik-alanlar' } }), ENV)
ok('asama/soruImza/yanitlar eksikse 400', r.status === 400)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, projeId: '../../etc/passwd' } }), ENV)
ok('path-traversal projeId 400', r.status === 400)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, projeId: '_demo-alt-cizgi-izinli' } }, { origin: 'http://localhost:5173' }), { ...ENV, GITHUB_TOKEN: undefined })
ok('alt-çizgili id (mevcut _demo-* konvansiyonu) 400 DEĞİL', r.status !== 400, `status: ${r.status}`)

// 2026-07-17: asama artık whitelist DEĞİL, BİÇİM ile doğrulanıyor (bkz worker.js
// ASAMA_BICIM_DESENI notu — master-plan bölüm id'leri de GEÇERLİ asama'dır, gerçek varlık
// kontrolü izleyicide). "boyle-bir-asama-yok" BİÇİM olarak geçerli bir slug — artık 400 DEĞİL
// (varlık kontrolü izleyicinin işi); yalnız GERÇEKTEN BİÇİMSİZ değerler (boşluk, büyük harf,
// özel karakter, boş) 400 almalı.
r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, asama: 'boyle-bir-asama-yok' } }), ENV)
ok('biçimce geçerli ama VAROLMAYAN asama artık 400 DEĞİL (varlık kontrolü izleyiciye devredildi)', r.status !== 400, `status: ${r.status}`)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, asama: 'ozet-yonetici' } }), ENV)
ok('bölüm-id şeklinde asama (master-plan bölüm-yürüyüşü) artık KABUL EDİLİYOR (canlı-gözlemlenen 400 hatası düzeltmesi)', r.status !== 400, `status: ${r.status}`)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, asama: 'Büyük Harf Boşluklu' } }), ENV)
ok('gerçekten BİÇİMSİZ asama (boşluk/büyük harf/Türkçe karakter) hâlâ 400', r.status === 400)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, asama: '' } }), ENV)
ok('boş asama hâlâ 400 (eksik-alan kontrolünden geçer)', r.status === 400)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, asama: '../../etc/passwd' } }), ENV)
ok('path-traversal biçimli asama hâlâ 400', r.status === 400)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, surum: 0 } }), ENV)
ok('surum=0 (pozitif değil) 400', r.status === 400)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, surum: 1.5 } }), ENV)
ok('surum tam sayı değilse 400', r.status === 400)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, surum: '1' } }), ENV)
ok('surum string ise 400', r.status === 400)

r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, yanitlar: [] } }), ENV)
ok('boş yanitlar dizisi 400', r.status === 400)

const devasaYanit = { anahtar: 'x', metin: 'a'.repeat(250_000) }
r = await worker.fetch(istek({ gonderim: { ...GECERLI_GONDERIM, yanitlar: [devasaYanit] } }), ENV)
ok('aşırı büyük gönderim 413', r.status === 413)

r = await worker.fetch(new Request('https://worker.test/soru-yanit-queue', {
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
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
  }
  if (opts?.method === 'PUT') {
    return new Response(JSON.stringify({ commit: { sha: 'sahte-commit-sha' } }), { status: 201 })
  }
  return orijinalFetch(url, opts)
}

try {
  r = await worker.fetch(istek({ gonderim: GECERLI_GONDERIM }), ENV)
  const data = await r.json()
  const beklenenYol = `soru-yanit-kuyruk/${GECERLI_GONDERIM.projeId}--${GECERLI_GONDERIM.asama}--v${GECERLI_GONDERIM.surum}.json`
  ok('geçerli gönderim 200 döner', r.status === 200, `status: ${r.status}`)
  ok('yanıt ok:true taşıyor', data.ok === true, JSON.stringify(data))
  ok('yanıt doğru kuyruk yolunu taşıyor', data.path === beklenenYol, data.path)
  ok('yanıt commit sha taşıyor', data.commit === 'sahte-commit-sha', data.commit)
  ok('GitHub GET + PUT çağrıları yapıldı (2 istek)', cagrilar.length === 2, JSON.stringify(cagrilar.map(c => c.method)))
  ok('PUT gövdesi doğru path\'e gitti', cagrilar[1]?.url.includes(`contents/${beklenenYol}`), cagrilar[1]?.url)
  // Zero-pipeline-calls (Worker-katmanı yarısı): mocklanan fetch çağrı-listesi GitHub Contents
  // API DIŞINDA hiçbir URL'e dokunmadı — Worker'ın fs erişimi yok (Workers isolate), bu yüzden
  // pipeline'a dokunmak yapısal olarak imkânsız; burada ayrıca DAVRANIŞSAL olarak da doğrulanır.
  ok('çağrı listesi yalnız GitHub Contents API\'yi içeriyor (pipeline\'a dokunma YOK)',
     cagrilar.every(c => c.url.includes('api.github.com') && c.url.includes('/contents/')),
     JSON.stringify(cagrilar.map(c => c.url)))
} finally {
  globalThis.fetch = orijinalFetch
}

// ── T4 — GITHUB_TOKEN yokken 500 ────────────────────────────────────────────
bolum('T4 — GITHUB_TOKEN eksikse')
r = await worker.fetch(istek({ gonderim: GECERLI_GONDERIM }), { ...ENV, GITHUB_TOKEN: undefined })
ok('GITHUB_TOKEN yoksa 500', r.status === 500)

// ── Özet ────────────────────────────────────────────────────────────────────
bolum('SONUÇ')
console.log(`${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
