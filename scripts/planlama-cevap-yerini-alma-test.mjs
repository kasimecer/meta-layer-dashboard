// Görev 2(c) — planlamaCevapYeriniAlma.mjs testleri (hermetik, MODELSİZ, gerçek proje verisine
// dokunmaz — izole tmp namespace kullanır). Mekanizmanın TEK amacı: orijinal soru/cevap dosyaları
// ASLA değişmesin, ek-sadece bir defter üzerinden "sunum kırpılmıştı" işareti + üstünleme akışı.
//
// Koşum: node scripts/planlama-cevap-yerini-alma-test.mjs

import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  sunumKirpilmisIsaretle, yeniSoruBagla, yeniYanitiUstunle, guncelYanitGetir,
  sunumKirpilmisKayitlariListele, yerinAlmaDosyaAdi,
} from '../tools/planlamaCevapYeriniAlma.mjs'
import { soruVeriIstek, soruPaketiKur, sorulariYaz, yanitPaketiYaz } from '../tools/planlamaSorular.mjs'

let gecti = 0, kaldi = 0
function ok(ad, kosul) {
  if (kosul) { gecti++; console.log(`  ✓ ${ad}`) }
  else { kaldi++; console.error(`  ✗ BAŞARISIZ: ${ad}`) }
}
function bolum(baslik) {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ${baslik}`)
  console.log(`══════════════════════════════════════════\n`)
}
function beklenenHataAt(fn, aranan) {
  try { fn(); return { fırlatmadı: true } }
  catch (e) { return { mesaj: e.message, icerir: aranan ? e.message.includes(aranan) : true } }
}

function ortamKur() {
  const ns = mkdtempSync(join(tmpdir(), 'yerini-alma-test-'))
  const asama = 'risk-varsayimlar'
  const surum = 1
  const cevapliSoru = soruVeriIstek({
    anahtar: 'veri:ornek-cevapli', metin: 'Bu iddia kaynakla desteklenemedi: X. Nasıl ilerleyelim?',
    iddia: 'X'.repeat(240), kaynak: 'ornek-kaynak', tier: 'onemli',
  })
  const cevapsizSoru = soruVeriIstek({
    anahtar: 'veri:ornek-cevapsiz', metin: 'Bu iddia kaynakla desteklenemedi: Y. Nasıl ilerleyelim?',
    iddia: 'Y'.repeat(240), kaynak: 'baska-kaynak', tier: 'onemli',
  })
  const paket = soruPaketiKur({ projeId: '_test-yerini-alma', asama, surum, sorular: [cevapliSoru, cevapsizSoru], ertelenen: [] })
  sorulariYaz(ns, paket)
  const yanitKaydi = { anahtar: cevapliSoru.anahtar, karar: 'veri', deger: 'operatör onaylı tahmin: 42', damga: new Date().toISOString() }
  const yanitPaketi = { sema: 1, proje_id: '_test-yerini-alma', asama, surum, soru_imza: paket.imza, yanitlar: [yanitKaydi] }
  yanitPaketiYaz(ns, paket, yanitPaketi)
  return { ns, asama, surum, paket, yanitlar: yanitPaketi.yanitlar }
}

// ══ 1 — Sunum-kırpılmış işaretleme: yalnız CEVAPLANMIŞ bir soru için ═══════════════════════════
bolum('sunumKirpilmisIsaretle: yalnız cevaplanmış soru işaretlenebilir (NEGATİF TEST dahil)')
{
  const { ns, asama, surum, paket, yanitlar } = ortamKur()

  const r1 = sunumKirpilmisIsaretle(ns, asama, surum, 'veri:ornek-cevapli', paket, yanitlar)
  ok('cevaplanmış soru başarıyla işaretlendi', r1.yeniMi === true && r1.kayit.durum === 'isaretlendi')
  ok('sunum_kirpilmis=true kaydedildi', r1.kayit.sunum_kirpilmis === true)

  // NEGATİF TEST: cevapsız bir soruyu işaretlemeye çalışmak REDDEDİLMELİ.
  const hataCevapsiz = beklenenHataAt(() => sunumKirpilmisIsaretle(ns, asama, surum, 'veri:ornek-cevapsiz', paket, yanitlar))
  ok('NEGATİF: cevaplanmamış soru işaretlenemez (fırlatır)', !hataCevapsiz.fırlatmadı)
  ok('NEGATİF: hata mesajı nedeni açıklıyor ("CEVAPLANMAMIŞ")', hataCevapsiz.mesaj?.includes('CEVAPLANMAMIŞ'))

  // NEGATİF TEST: var olmayan bir anahtarı işaretlemeye çalışmak REDDEDİLMELİ.
  const hataYok = beklenenHataAt(() => sunumKirpilmisIsaretle(ns, asama, surum, 'veri:hic-yok', paket, yanitlar))
  ok('NEGATİF: soru setinde olmayan anahtar reddedilir', !hataYok.fırlatmadı)

  // İDEMPOTENT: aynı anahtarı ikinci kez işaretlemek YENİ kayıt EKLEMEZ.
  const r2 = sunumKirpilmisIsaretle(ns, asama, surum, 'veri:ornek-cevapli', paket, yanitlar)
  ok('idempotent: ikinci çağrı yeniMi=false döner', r2.yeniMi === false)
  const tumKayitlar = sunumKirpilmisKayitlariListele(ns, asama, surum)
  ok('idempotent: defterde HÂLÂ yalnız 1 kayıt var (yinelenmedi)', tumKayitlar.length === 1)

  rmSync(ns, { recursive: true, force: true })
}

// ══ 2 — Sıra zorunluluğu: soru-bağla → yanıt-üstünle, ATLANAMAZ ═══════════════════════════════
bolum('yeniSoruBagla / yeniYanitiUstunle: sıra zorunlu (NEGATİF TEST dahil)')
{
  const { ns, asama, surum, paket, yanitlar } = ortamKur()

  // NEGATİF TEST: işaretlemeden ÖNCE soru-bağlamaya çalışmak REDDEDİLMELİ.
  const hataErkenBagla = beklenenHataAt(() => yeniSoruBagla(ns, asama, surum, 'veri:ornek-cevapli', 'veri:ornek-cevapli-v2'))
  ok('NEGATİF: işaretlenmeden önce yeniSoruBagla reddedilir', !hataErkenBagla.fırlatmadı)

  sunumKirpilmisIsaretle(ns, asama, surum, 'veri:ornek-cevapli', paket, yanitlar)

  // NEGATİF TEST: soru bağlanmadan ÖNCE cevap üstünlemeye çalışmak REDDEDİLMELİ.
  const hataErkenUstunle = beklenenHataAt(() => yeniYanitiUstunle(ns, asama, surum, 'veri:ornek-cevapli', { anahtar: 'x', karar: 'veri', deger: 'y' }))
  ok('NEGATİF: soru bağlanmadan önce yeniYanitiUstunle reddedilir', !hataErkenUstunle.fırlatmadı)

  const rBagla = yeniSoruBagla(ns, asama, surum, 'veri:ornek-cevapli', 'veri:ornek-cevapli-v2')
  ok('soru başarıyla bağlandı, durum güncellendi', rBagla.kayit.durum === 'yeni-soru-bagli' && rBagla.kayit.yeni_soru_anahtari === 'veri:ornek-cevapli-v2')

  const rUstunle = yeniYanitiUstunle(ns, asama, surum, 'veri:ornek-cevapli', { anahtar: 'veri:ornek-cevapli-v2', karar: 'veri', deger: '47 (tam metinle doğrulanmış)' })
  ok('cevap üstünlendi, durum güncellendi', rUstunle.kayit.durum === 'ustunlendi')
  ok('üstünleyen cevabın içeriği doğru kaydedildi', rUstunle.kayit.yeni_yanit.deger === '47 (tam metinle doğrulanmış)')

  rmSync(ns, { recursive: true, force: true })
}

// ══ 3 — GÜVENCE (kanıtlanan, varsayılmayan): orijinal sorular/yanıtlar dosyaları HİÇ değişmiyor ══
bolum('GÜVENCE: orijinal sorular.json + yanitlar.json bayt-bayt DEĞİŞMEDEN kalıyor')
{
  const { ns, asama, surum } = ortamKur()
  const soruYol = join(ns, `${asama}-sorular.json`)
  const yanitYol = join(ns, `${asama}-yanitlar.json`)
  const soruOncesi = readFileSync(soruYol, 'utf8')
  const yanitOncesi = readFileSync(yanitYol, 'utf8')

  const paket = JSON.parse(soruOncesi)
  const yanitlar = JSON.parse(yanitOncesi).yanitlar

  // TAM akışı çalıştır: işaretle → soru-bağla → cevap-üstünle.
  sunumKirpilmisIsaretle(ns, asama, surum, 'veri:ornek-cevapli', paket, yanitlar)
  yeniSoruBagla(ns, asama, surum, 'veri:ornek-cevapli', 'veri:ornek-cevapli-v2')
  yeniYanitiUstunle(ns, asama, surum, 'veri:ornek-cevapli', { anahtar: 'veri:ornek-cevapli-v2', karar: 'veri', deger: '47' })

  const soruSonrasi = readFileSync(soruYol, 'utf8')
  const yanitSonrasi = readFileSync(yanitYol, 'utf8')
  ok('sorular.json TAM akıştan SONRA bile bayt-bayt özdeş', soruOncesi === soruSonrasi)
  ok('yanitlar.json TAM akıştan SONRA bile bayt-bayt özdeş', yanitOncesi === yanitSonrasi)

  // Defter AYRI bir dosya olarak var — orijinal dosyaların YANINDA, İÇİNDE değil.
  ok('defter AYRI bir dosyada (orijinal dosya adlarından FARKLI)', existsSync(join(ns, yerinAlmaDosyaAdi(asama, surum))))

  rmSync(ns, { recursive: true, force: true })
}

// ══ 4 — guncelYanitGetir: okuma-tarafı doğru kaynağı seçiyor ══════════════════════════════════
bolum('guncelYanitGetir: üstünlenmemiş → orijinal, üstünlenmiş → yeni (eskisi hâlâ erişilebilir)')
{
  const { ns, asama, surum, paket, yanitlar } = ortamKur()

  const oncesi = guncelYanitGetir(ns, asama, surum, 'veri:ornek-cevapli', yanitlar)
  ok('üstünleme ÖNCESİ: kaynak=orijinal', oncesi.kaynak === 'orijinal')
  ok('üstünleme ÖNCESİ: orijinal cevap değeri doğru', oncesi.yanit?.deger === 'operatör onaylı tahmin: 42')
  ok('üstünleme ÖNCESİ: sunum_kirpilmis henüz false (işaretlenmedi)', oncesi.sunum_kirpilmis === false)

  sunumKirpilmisIsaretle(ns, asama, surum, 'veri:ornek-cevapli', paket, yanitlar)
  yeniSoruBagla(ns, asama, surum, 'veri:ornek-cevapli', 'veri:ornek-cevapli-v2')
  yeniYanitiUstunle(ns, asama, surum, 'veri:ornek-cevapli', { anahtar: 'veri:ornek-cevapli-v2', karar: 'veri', deger: '47 (tam metinle)' })

  const sonrasi = guncelYanitGetir(ns, asama, surum, 'veri:ornek-cevapli', yanitlar)
  ok('üstünleme SONRASI: kaynak=ustunlenmis', sonrasi.kaynak === 'ustunlenmis')
  ok('üstünleme SONRASI: GÜNCEL cevap yeni değeri taşıyor', sonrasi.yanit?.deger === '47 (tam metinle)')
  ok('üstünleme SONRASI: orijinal cevap HÂLÂ erişilebilir (görünür, silinmemiş)', sonrasi.orijinal?.deger === 'operatör onaylı tahmin: 42')
  ok('üstünleme SONRASI: sunum_kirpilmis=true', sonrasi.sunum_kirpilmis === true)

  // Hiç işaretlenmemiş, hiç dokunulmamış bir anahtar için: orijinale sessizce düşer, çökmez.
  const dokunulmamis = guncelYanitGetir(ns, asama, surum, 'veri:hic-dokunulmamis', yanitlar)
  ok('hiç dokunulmamış anahtar: çökmüyor, orijinal=null, sunum_kirpilmis=false', dokunulmamis.kaynak === 'orijinal' && dokunulmamis.yanit === null && dokunulmamis.sunum_kirpilmis === false)

  rmSync(ns, { recursive: true, force: true })
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
