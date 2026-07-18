// Görev 1 — tools/planlamaSoruKimligi.mjs testleri (hermetik, MODELSİZ, gerçek proje verisine
// dokunmaz). Kapsam: kimlikli/kimliksiz atama, ekstraksiyon-değişikliğine karşı KİMLİK korunumu
// (hermetik simülasyon — gerçek mutasyon kanıtı AYRICA, gerçek dosya kopyası üzerinde, kanal
// raporunda anlatılan interaktif adımlarla yapıldı), konum-kayması, ve defter/dosya UYUŞMAZLIĞININ
// sert biçimde başarısız olduğu (taraf SEÇİLMEDİĞİ) negatif testler.
//
// Koşum: node scripts/planlama-soru-kimligi-test.mjs

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  kimlikliSoruId, soruIdleriAta, kimlikTutarliligiDogrula, defterOku, defterYaz, bosDefter, hamPencereHash,
} from '../tools/planlamaSoruKimligi.mjs'
import { dataRequestAdaylari } from '../tools/planlamaSorular.mjs'

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
function beklenenHata(fn) {
  try { fn(); return { fırlatmadı: true } } catch (e) { return { fırlatmadı: false, mesaj: e.message } }
}

// ══ 1 — kimlikliSoruId: deterministik, kararlı ═════════════════════════════════════════════════
bolum('kimlikliSoruId: aynı (asama, anahtar) HER ZAMAN aynı id — deterministik')
{
  const a = kimlikliSoruId('arastirma', 'veri:kaynak-x')
  const b = kimlikliSoruId('arastirma', 'veri:kaynak-x')
  ok('iki ayrı çağrı AYNI id döner', a === b)
  const c = kimlikliSoruId('arastirma', 'veri:kaynak-y')
  ok('farklı anahtar FARKLI id döner', a !== c)
  const d = kimlikliSoruId('premise', 'veri:kaynak-x')
  ok('aynı anahtar farklı asama FARKLI id döner (namespace izolasyonu)', a !== d)
}

// ══ 2 — soruIdleriAta: kimlikli tip ════════════════════════════════════════════════════════════
bolum('soruIdleriAta: kimlikli tip deftere DOKUNMADAN deterministik id alır')
{
  const adaylar = [{ anahtar: 'veri:x', tip: 'DATA-REQUEST', kaynak: 'kaynak-x', iddia: 'bir iddia' }]
  const defterOnce = bosDefter('arastirma', 1)
  const { adaylar: sonuc, defter: defterSonra, ozet } = soruIdleriAta('arastirma', adaylar, defterOnce)
  ok('kimlikli aday soru_id aldı', sonuc[0].soru_id === kimlikliSoruId('arastirma', 'veri:x'))
  ok('defter DEĞİŞMEDİ (kimlikli tip deftere yazmaz)', defterSonra.kayitlar.length === 0)
  ok('girdi defteri MUTASYONA UĞRAMADI (saf fonksiyon)', defterOnce.kayitlar.length === 0)
  ok('özet.kimlikli listesinde görünüyor', ozet.kimlikli.includes('veri:x'))
}

// ══ 3 — soruIdleriAta: kimliksiz tip, İLK atama ════════════════════════════════════════════════
bolum('soruIdleriAta: kimliksiz tip İLK kez görüldüğünde yeni id basar + deftere EKLER')
{
  const konum = { satirIdx: 5, gecisNo: 1, hamPencere: 'Fiyat [eksik] henüz netleşmedi.' }
  const adaylar = [{ anahtar: 'veri:eksik-fiyat', tip: 'DATA-REQUEST', kaynak: null, iddia: 'Fiyat henüz netleşmedi.', konum }]
  const { adaylar: sonuc, defter, ozet } = soruIdleriAta('risk-varsayimlar', adaylar, bosDefter('risk-varsayimlar', 1))
  ok('yeni soru_id atandı (sk_ önekli)', sonuc[0].soru_id?.startsWith('sk_'))
  ok('defterde 1 kayıt oluştu', defter.kayitlar.length === 1)
  ok('kayıt aktif=true', defter.kayitlar[0].aktif === true)
  ok('konum_gecmisi 1 girdi taşıyor ("ilk-atama")', defter.kayitlar[0].konum_gecmisi.length === 1 && defter.kayitlar[0].konum_gecmisi[0].not === 'ilk-atama')
  ok('özet.yeni listesinde görünüyor', ozet.yeni.some(x => x.anahtar === 'veri:eksik-fiyat'))
}

// ══ 4 — ÇEKİRDEK ÖZELLİK: extraction DEĞİŞSE bile AYNI konum → AYNI soru_id ════════════════════
bolum('ÇEKİRDEK: iddia METNİ değişse bile (extraction kuralı değişmiş gibi) AYNI konum AYNI soru_id verir')
{
  // "ÖNCESİ" — mevcut (varsayımsal eski) extraction'ın ürettiği iddia.
  const konum = { satirIdx: 12, gecisNo: 2, hamPencere: '...önceki cümle. Maliyet [eksik] burada.' }
  const oncekiAday = { anahtar: 'veri:eksik-maliyet', tip: 'DATA-REQUEST', kaynak: null, iddia: 'Maliyet burada.', konum }
  const { adaylar: r1, defter: defterSonra1 } = soruIdleriAta('strateji', [oncekiAday], bosDefter('strateji', 1))
  const idOncesi = r1[0].soru_id

  // "SONRASI" — AYNI konum (satır DEĞİŞMEDİ), AMA extraction kuralı değişmiş VARSAYIMIYLA iddia
  // metni TAMAMEN FARKLI (ör. gönderim-genişletme önceki cümleyi de dahil etmiş). Ham pencere de
  // (satırın kendisi değişmediği için) AYNI kalır — bu KASITLI: gerçek mutasyon senaryosunda
  // satırın KENDİSİ değişmez, yalnız YORUMLAMA değişir.
  const yeniAday = { anahtar: 'veri:eksik-maliyet', tip: 'DATA-REQUEST', kaynak: null, iddia: '...önceki cümle. Maliyet burada.', konum }
  const { adaylar: r2, ozet: ozet2 } = soruIdleriAta('strateji', [yeniAday], defterSonra1) // ÖNCEKİ defter kullanılıyor
  const idSonrasi = r2[0].soru_id

  ok('iddia METNİ GERÇEKTEN farklı (mühendislik-kontrolü — test anlamlı)', oncekiAday.iddia !== yeniAday.iddia)
  ok('AMA soru_id AYNI KALDI', idOncesi === idSonrasi)
  ok('bu "yeniden-kullanılan" olarak işaretlendi (yeni basılmadı)', ozet2.yeniden_kullanilan_konum.length === 1)
}

// ══ 5 — Konum kayması: ham-pencere ile YİNE bulunuyor, defter EK-SADECE güncelleniyor ══════════
bolum('konum KAYARSA (belgeye üstten satır eklenmiş gibi) ham-pencere ile YİNE aynı soru_id bulunur')
{
  const konumEski = { satirIdx: 10, gecisNo: 1, hamPencere: 'Sabit bir bağlam metni [eksik] burada.' }
  const aday1 = { anahtar: 'veri:eksik-x', tip: 'DATA-REQUEST', kaynak: null, iddia: 'burada.', konum: konumEski }
  const { defter: d1 } = soruIdleriAta('premise', [aday1], bosDefter('premise', 1))
  const idOnce = d1.kayitlar[0].soru_id

  // AYNI ham metin ama satır numarası KAYMIŞ (3 satır yukarı taşınmış gibi) — gecisNo de farklı
  // olabilir (başka bir [eksik] eklenmiş üstteki satıra).
  const konumYeni = { satirIdx: 13, gecisNo: 1, hamPencere: 'Sabit bir bağlam metni [eksik] burada.' }
  const aday2 = { anahtar: 'veri:eksik-x', tip: 'DATA-REQUEST', kaynak: null, iddia: 'burada.', konum: konumYeni }
  const { adaylar: r2, defter: d2, ozet } = soruIdleriAta('premise', [aday2], d1)

  ok('AYNI soru_id ham-pencere ile bulundu (konum kaymasına rağmen)', r2[0].soru_id === idOnce)
  ok('"ham-pencere" yöntemiyle bulunduğu özette görünüyor', ozet.yeniden_kullanilan_ham_pencere.length === 1)
  const kayit = d2.kayitlar.find(k => k.soru_id === idOnce)
  ok('defter EK-SADECE güncellendi: konum_gecmisi 2 girdi taşıyor (eskisi SİLİNMEDİ)', kayit.konum_gecmisi.length === 2)
  ok('İLK girdi hâlâ orijinal (satirIdx=10) — değiştirilmedi', kayit.konum_gecmisi[0].satirIdx === 10)
  ok('YENİ girdi eklendi (satirIdx=13, not="konum-guncellendi")', kayit.konum_gecmisi[1].satirIdx === 13 && kayit.konum_gecmisi[1].not === 'konum-guncellendi')
}

// ══ 6 — kimlikTutarliligiDogrula: pozitif + NEGATİF testler (taraf SEÇİLMEZ, sert başarısızlık) ═
bolum('kimlikTutarliligiDogrula: tutarlı durumda geçer; UYUŞMAZLIKTA taraf seçmeden SERT durur')
{
  const konum = { satirIdx: 1, gecisNo: 1, hamPencere: 'x [eksik] y' }
  const aday = { anahtar: 'veri:eksik-a', tip: 'DATA-REQUEST', kaynak: null, iddia: 'y', konum }
  const { adaylar: r1, defter } = soruIdleriAta('arastirma', [aday], bosDefter('arastirma', 1))
  const paketTutarli = { sorular: r1, ertelenen: [] }
  ok('tutarlı durum: doğrulama GEÇER', kimlikTutarliligiDogrula(paketTutarli, defter).gecerli === true)

  // NEGATİF 1: paket bir soru_id iddia ediyor ama defterde YOK.
  const paketYok = { sorular: [{ ...r1[0], soru_id: 'sk_hicYokOlanBirId' }], ertelenen: [] }
  const h1 = beklenenHata(() => kimlikTutarliligiDogrula(paketYok, defter))
  ok('NEGATİF: defterde olmayan soru_id SERT başarısız olur', !h1.fırlatmadı)
  ok('NEGATİF: hata mesajı "TARAF SEÇİLMİYOR" diyor (taraf tutmuyor)', h1.mesaj?.includes('TARAF SEÇİLMİYOR'))

  // NEGATİF 2: AYNI konum defterde İKİ FARKLI soru_id'ye ait görünüyor (çakışma simülasyonu).
  const defterCakismali = JSON.parse(JSON.stringify(defter))
  defterCakismali.kayitlar.push({
    soru_id: 'sk_baskaBirId', aktif: true,
    konum_gecmisi: [{ satirIdx: konum.satirIdx, gecisNo: konum.gecisNo, ham_pencere_hash: hamPencereHash(konum.hamPencere), zaman: new Date().toISOString(), not: 'ilk-atama' }],
  })
  const h2 = beklenenHata(() => kimlikTutarliligiDogrula(paketTutarli, defterCakismali))
  ok('NEGATİF: aynı konum iki soru_id\'ye ait görünüyorsa SERT başarısız olur', !h2.fırlatmadı)
  ok('NEGATİF: bu durumda da "TARAF SEÇİLMİYOR" diyor', h2.mesaj?.includes('TARAF SEÇİLMİYOR'))
}

// ══ 7 — GERÇEK dataRequestAdaylari çıktısıyla bütünleşik: konum alanı gerçekten dolu geliyor ════
bolum('BÜTÜNLEŞİK: gerçek dataRequestAdaylari çıktısı soruIdleriAta ile doğrudan çalışıyor')
{
  const icerik = 'Bu bir cümledir. Fiyat [eksik] ve maliyet [eksik] henüz netleşmedi. Ayrı bir cümlede tekrar [eksik] var.'
  const gercekAdaylar = dataRequestAdaylari(icerik)
  ok('gerçek fonksiyon kimliksiz adaylara konum EKLİYOR', gercekAdaylar.every(a => a.tip !== 'DATA-REQUEST' || a.kaynak != null || a.konum != null))
  const { adaylar: zenginlestirilmis, defter } = soruIdleriAta('arastirma', gercekAdaylar, bosDefter('arastirma', 1))
  ok('TÜM DATA-REQUEST adaylar soru_id aldı', zenginlestirilmis.filter(a => a.tip === 'DATA-REQUEST').every(a => !!a.soru_id))
  ok('defterde en az 1 kayıt oluştu (kimliksiz adaylar için)', defter.kayitlar.length >= 1)
}

// ══ 8 — defterYaz/defterOku: yalnız İZOLE tmp yola yazar, kanıt ═══════════════════════════════
bolum('defterYaz/defterOku: izole tmp namespace, gerçek proje yoluna HİÇ dokunmuyor')
{
  const ns = mkdtempSync(join(tmpdir(), 'soru-kimlik-test-'))
  const defter = bosDefter('arastirma', 1)
  defter.kayitlar.push({ soru_id: 'sk_test', aktif: true, konum_gecmisi: [{ satirIdx: 0, gecisNo: 1, ham_pencere_hash: 'x', zaman: 'now', not: 'ilk-atama' }] })
  const yol = defterYaz(ns, 'arastirma', 1, defter)
  ok('defter dosyası İZOLE tmp yolda oluştu', existsSync(yol) && yol.startsWith(ns))
  const geriOkunan = defterOku(ns, 'arastirma', 1)
  ok('yazılan defter GERİ OKUNDUĞUNDA aynı içeriği taşıyor', geriOkunan.kayitlar[0].soru_id === 'sk_test')
  rmSync(ns, { recursive: true, force: true })
}

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
