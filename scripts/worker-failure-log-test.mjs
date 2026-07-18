// worker/worker.js — C) kalıcı hata izi (META_LOG/KV) + GET /failures testi.
// Gerçek Cloudflare/GitHub'a dokunmadan: sahte bir KV (Map tabanlı) + sahte bir
// ExecutionContext (waitUntil promise'lerini TOPLAYIP test sonunda await eder — gerçek
// Workers runtime'ının "yanıt dönse bile arka planda bitene kadar bekletir" davranışının
// hermetik eşleniği) kullanılır.
// Koşum: node scripts/worker-failure-log-test.mjs

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

function sahteKV() {
  const dosyalar = new Map()
  return {
    async put(anahtar, deger) { dosyalar.set(anahtar, deger) },
    async get(anahtar) { return dosyalar.get(anahtar) ?? null },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [...dosyalar.keys()].filter(k => k.startsWith(prefix)).slice(0, limit).map(name => ({ name }))
      return { keys }
    },
    _boyut: () => dosyalar.size,
  }
}

function sahteCtx() {
  const bekleyenler = []
  return {
    waitUntil(p) { bekleyenler.push(p) },
    async hepsiniBekle() { await Promise.all(bekleyenler) },
  }
}

const META_LOG = sahteKV()
const ENV = {
  GH_OWNER: 'kasimecer', GH_REPO: 'meta-layer-dashboard', GH_BRANCH: 'main',
  INTAKE_QUEUE_PATH: 'intake-kuyruk',
  ALLOWED_ORIGIN: 'https://kasimecer.github.io',
  GITHUB_TOKEN: 'sahte-gh-token', SUBMIT_TOKEN: 'sahte-submit-token',
  META_LOG,
}
const ORIGIN = 'https://kasimecer.github.io'

bolum('T1 — Başarısız istek KV\'ye kalıcı iz bırakıyor')
{
  const ctx = sahteCtx()
  const req = new Request('https://worker.test/intake-queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-submit-token': 'yanlis-token' },
    body: '{}',
  })
  const r = await worker.fetch(req, ENV, ctx)
  ok('401 döndü', r.status === 401)
  await ctx.hepsiniBekle()
  ok('KV\'ye TAM 1 kayıt yazıldı', META_LOG._boyut() === 1, `boyut: ${META_LOG._boyut()}`)
}

bolum('T2 — Başarılı istek + /health + /failures KV\'ye YAZMIYOR')
{
  const oncekiBoyut = META_LOG._boyut()
  const ctx = sahteCtx()
  const rHealth = await worker.fetch(new Request('https://worker.test/health'), ENV, ctx)
  ok('/health 200', rHealth.status === 200)
  await ctx.hepsiniBekle()
  ok('/health KV\'ye yazmadı', META_LOG._boyut() === oncekiBoyut)
}

bolum('T3 — ctx olmadan (eski/mock test harness uyumluluğu) ÇÖKMEZ')
{
  const req = new Request('https://worker.test/intake-queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-submit-token': 'yanlis-token' },
    body: '{}',
  })
  const r = await worker.fetch(req, ENV) // ctx YOK — worker-intake-queue-test.mjs'nin çağırdığı gibi
  ok('ctx olmadan da 401 döner, hata FIRLATMAZ', r.status === 401)
}

bolum('T4 — GET /failures yetkilendirme')
{
  let r = await worker.fetch(new Request('https://worker.test/failures'), ENV)
  ok('token yokken 401', r.status === 401)

  r = await worker.fetch(new Request('https://worker.test/failures', { headers: { 'x-submit-token': 'yanlis' } }), ENV)
  ok('yanlış token 401', r.status === 401)
}

bolum('T5 — GET /failures kaydı doğru döndürüyor')
{
  const r = await worker.fetch(new Request('https://worker.test/failures?limit=10', {
    headers: { 'x-submit-token': ENV.SUBMIT_TOKEN },
  }), ENV)
  ok('200 döndü', r.status === 200)
  const data = await r.json()
  ok('ok:true', data.ok === true)
  ok('en az 1 kayıt döndü', Array.isArray(data.kayitlar) && data.kayitlar.length >= 1, `${data.kayitlar?.length}`)
  const kayit = data.kayitlar.find(k => k.yol === '/intake-queue' && k.status === 401)
  ok('kayıt doğru yol/status/origin taşıyor', !!kayit && kayit.origin === ORIGIN, JSON.stringify(kayit))
}

bolum('T6 — META_LOG binding yokken (henüz provizyonlanmamış eski deploy) çökmez')
{
  const ENV_LOGSUZ = { ...ENV, META_LOG: undefined }
  const ctx = sahteCtx()
  const req = new Request('https://worker.test/intake-queue', {
    method: 'POST', headers: { origin: ORIGIN, 'x-submit-token': 'yanlis' }, body: '{}',
  })
  const r = await worker.fetch(req, ENV_LOGSUZ, ctx)
  ok('META_LOG yokken de 401 döner, çökmez', r.status === 401)
  await ctx.hepsiniBekle()

  const rFail = await worker.fetch(new Request('https://worker.test/failures', {
    headers: { 'x-submit-token': ENV.SUBMIT_TOKEN },
  }), ENV_LOGSUZ)
  const data = await rFail.json()
  ok('/failures META_LOG yokken boş liste + not döner (çökmez)', rFail.status === 200 && Array.isArray(data.kayitlar) && data.kayitlar.length === 0)
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
