// meta-layer-core — SEAM RECONCILE testleri (hermetik, SENTETİK fikstürler, GERÇEK partner
// verisine ASLA dokunmaz). Drive'daki gerçek projeler/*/inbox.md ya da repo'daki gerçek
// partner-inbox/*.md hiçbir testte OKUNMAZ/YAZILMAZ — her test kendi geçici dizinini kurar.
//
// Koşum: node scripts/seam-reconcile-test-runner.mjs

import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  gitSatirlariAyristir, kanonikKartTarihleriCikar, seamReconcileHesapla, seamReconcileCalistir,
} from '../tools/seamReconcile.mjs'

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

// ── SENTETİK fikstürler (gerçek partner-inbox/baris.md ve gerçek Drive projeler/*/inbox.md
// biçimini BİREBİR yansıtır — bkz worker/worker.js inboxSatiri() + gerçek projeler/baris/inbox.md —
// ama TAMAMEN uydurma proje/kart id'leriyle) ──────────────────────────────────────────────
const GIT_FIKSTUR = `# Partner Inbox (partner-app yazma-yolu · yalnız-ekleme)

> Bu dosyayı Cloudflare Worker (partner-app submit) yazar — İKİ-YAZAR KONTRATI: partner burada konuşur.
> Loop okur → kanonik (projeler/<proje>/inbox.md + durum.md) ile uzlaştırır → buradan temizler.
> Format: [tarih] partner-cevap · proje:<id> · kart:<id> (<özet>) → "<cevap>"

[2026-07-01] partner-cevap · proje:_test-seam · kart:test-k1 (Test sorusu 1) → "Cevap 1"
[2026-07-02] partner-cevap · proje:_test-seam · kart:test-k2 (Test sorusu 2) → "Cevap 2"
[2026-06-20] partner-cevap · proje:_test-seam · kart:test-k3-eski (Eski cevap) → "Bu artık eski bir cevap"
[2026-07-03] partner-cevap · proje:_test-seam · kart:test-k4-tekrar (Tekrar eden kart) → "İlk deneme"
[2026-07-05] partner-cevap · proje:_test-seam · kart:test-k4-tekrar (Tekrar eden kart) → "Son deneme (kazanan)"
`

const KANONIK_FIKSTUR = `# _test-seam — Inbox

> Format: [tarih] partner-cevap · kart:<id> (<özet>) → "<cevap>"

[2026-06-25] partner-cevap · kart:test-k3-eski (Eski cevap) → "Kanonikte zaten DAHA YENİ bir cevap var" — ✓İŞLENDİ 2026-06-26
`

function yeniNs() {
  const ns = mkdtempSync(join(tmpdir(), 'seam-reconcile-test-'))
  const partnerInboxKokYolu = join(ns, 'partner-inbox')
  const kanonikKokYolu = join(ns, 'projeler', '_test-seam')
  mkdirSync(partnerInboxKokYolu, { recursive: true })
  mkdirSync(kanonikKokYolu, { recursive: true })
  return {
    ns, partnerInboxKokYolu, kanonikKokYolu,
    partnerInboxYol: join(partnerInboxKokYolu, '_test-seam.md'),
    kanonikInboxYol: join(kanonikKokYolu, 'inbox.md'),
  }
}
function temizle(ns) { try { rmSync(ns, { recursive: true, force: true }) } catch { /* noop */ } }

// ════════════════════════════════════════════════════════════════════════════
bolum('P1 — Saf ayrıştırma: gitSatirlariAyristir + kanonikKartTarihleriCikar')
{
  const satirlar = gitSatirlariAyristir(GIT_FIKSTUR)
  ok('P1: 5 veri-satırı ayrıştırıldı (başlık/yorum satırları atlandı)', satirlar.length === 5, `bulunan: ${satirlar.length}`)
  ok('P1: kart:test-k1 doğru ayrıştırıldı (tarih/ozet/cevap)',
    satirlar.some(s => s.kartId === 'test-k1' && s.tarih === '2026-07-01' && s.ozet === 'Test sorusu 1' && s.cevap === 'Cevap 1'))
  ok('P1: proje alanı doğru ayrıştırıldı', satirlar[0].projeId === '_test-seam')
  ok('P1: test-k4-tekrar için İKİ ayrı satır ayrıştırıldı (git-içi tekrar)',
    satirlar.filter(s => s.kartId === 'test-k4-tekrar').length === 2)

  const kanonikTarihler = kanonikKartTarihleriCikar(KANONIK_FIKSTUR)
  ok('P1: kanonik ayrıştırma test-k3-eski için 2026-06-25 buluyor (zengin insan-notu satırında da)',
    kanonikTarihler.get('test-k3-eski') === '2026-06-25')
  ok('P1: kanonikte olmayan bir kart için undefined döner', kanonikTarihler.get('yok-boyle-bir-kart') === undefined)

  // Kanonikte AYNI kart birden fazla satırda geçerse MAX tarih alınmalı.
  const cokluKanonik = '[2026-01-01] partner-cevap · kart:cx (x) → "a"\n[2026-03-15] partner-cevap · kart:cx (x) → "b"\n[2026-02-01] partner-cevap · kart:cx (x) → "c"\n'
  ok('P1: kanonikte AYNI kart çoklu satırda geçerse MAX tarih alınır (sıra ÖNEMSİZ)',
    kanonikKartTarihleriCikar(cokluKanonik).get('cx') === '2026-03-15')
}

// ════════════════════════════════════════════════════════════════════════════
bolum('P2 — Birleştirme hesabı (seamReconcileHesapla): pozitif yol')
{
  const hesap = seamReconcileHesapla({ gitIcerik: GIT_FIKSTUR, kanonikIcerik: KANONIK_FIKSTUR, calistirmaZamaniIso: '2026-07-06 10:00' })

  ok('P2: değişiklik VAR (birleştirilecek en az bir kart var)', hesap.degisiklikVar === true)
  ok('P2: tam 3 kart birleştirilecek (k1, k2, k4-tekrar — k3-eski HARİÇ)', hesap.birlestirilecekler.length === 3,
    hesap.birlestirilecekler.map(k => k.kartId).join(','))
  ok('P2: k1 birleştirilecekler arasında', hesap.birlestirilecekler.some(k => k.kartId === 'test-k1' && k.cevap === 'Cevap 1'))
  ok('P2: k2 birleştirilecekler arasında', hesap.birlestirilecekler.some(k => k.kartId === 'test-k2' && k.cevap === 'Cevap 2'))
  ok('P2: k4-tekrar için git-içi EN SON (2026-07-05, "Son deneme") kazanır, ilk deneme DEĞİL',
    hesap.birlestirilecekler.some(k => k.kartId === 'test-k4-tekrar' && k.tarih === '2026-07-05' && k.cevap === 'Son deneme (kazanan)'))

  ok('P2: kanonikEkMetni her birleştirilen kart için bir satır + bir SEAM-RECONCILE yorum-satırı içeriyor',
    hesap.kanonikEkMetni.includes('SEAM-RECONCILE') &&
    hesap.kanonikEkMetni.includes('kart:test-k1') &&
    hesap.kanonikEkMetni.includes('kart:test-k2') &&
    hesap.kanonikEkMetni.includes('kart:test-k4-tekrar'))
  ok('P2: kanonikEkMetni k4-tekrar için yalnız KAZANAN cevabı içeriyor ("İlk deneme" YOK)',
    hesap.kanonikEkMetni.includes('Son deneme (kazanan)') && !hesap.kanonikEkMetni.includes('İlk deneme'))

  ok('P2: yeniGitIcerik başlık/yorum satırlarını KORUYOR', hesap.yeniGitIcerik.includes('İKİ-YAZAR KONTRATI'))
  ok('P2: yeniGitIcerik birleştirilen kartların (k1/k2/k4-tekrar) SATIRLARINI kaldırdı',
    !hesap.yeniGitIcerik.includes('kart:test-k1') && !hesap.yeniGitIcerik.includes('kart:test-k2') && !hesap.yeniGitIcerik.includes('kart:test-k4-tekrar'))
}

// ════════════════════════════════════════════════════════════════════════════
bolum('N1 — NEGATİF (görevin zorunlu kıldığı): eski/stale git cevabı DAHA YENİ kanonik cevabı EZMEZ')
{
  const hesap = seamReconcileHesapla({ gitIcerik: GIT_FIKSTUR, kanonikIcerik: KANONIK_FIKSTUR })

  ok('N1: test-k3-eski birleştirilecekler arasında YOK (latest-wins → kanonik korunur)',
    !hesap.birlestirilecekler.some(k => k.kartId === 'test-k3-eski'))
  ok('N1: test-k3-eski atlananlar listesinde (gitTarih 2026-06-20 < kanonikTarih 2026-06-25)',
    hesap.atlananlar.some(a => a.kartId === 'test-k3-eski' && a.gitTarih === '2026-06-20' && a.kanonikTarih === '2026-06-25'))
  ok('N1: kanonikEkMetni test-k3-eski\'yi HİÇ İÇERMİYOR (kanoniğe tekrar yazılmadı)',
    !hesap.kanonikEkMetni.includes('test-k3-eski'))
  ok('N1: yeniGitIcerik test-k3-eski satırını KORUYOR (git\'ten temizlenmedi — "reconciled" değil)',
    hesap.yeniGitIcerik.includes('kart:test-k3-eski') && hesap.yeniGitIcerik.includes('Bu artık eski bir cevap'))

  // EŞİT tarih — bilinçli tasarım kararı: eşitlikte KANONİK kazanır (git KESİNLİKLE daha yeni
  // olmalı ki ezsin). Bu, "manual operator edit kanoniği ASLA ezilmez" garantisinin sınır-durumu.
  const esitGit = '[2026-07-01] partner-cevap · proje:x · kart:esit-test (y) → "git-cevabi"\n'
  const esitKanonik = '[2026-07-01] partner-cevap · kart:esit-test (y) → "kanonik-cevabi"\n'
  const hesapEsit = seamReconcileHesapla({ gitIcerik: esitGit, kanonikIcerik: esitKanonik })
  ok('N1 (eşitlik sınırı): AYNI tarihte kanonik kazanır (git KESİNLİKLE daha yeni olmalı, eşitlik yetmez)',
    !hesapEsit.degisiklikVar && hesapEsit.atlananlar.some(a => a.kartId === 'esit-test'))
}

// ════════════════════════════════════════════════════════════════════════════
bolum('N2 — NEGATİF (görevin zorunlu kıldığı): kanonik yazım BAŞARISIZ olursa git ASLA temizlenmez')
{
  const { ns, partnerInboxKokYolu, kanonikKokYolu, partnerInboxYol, kanonikInboxYol } = yeniNs()
  try {
    writeFileSync(partnerInboxYol, GIT_FIKSTUR, 'utf8')
    writeFileSync(kanonikInboxYol, KANONIK_FIKSTUR, 'utf8')
    const gitOncesi = readFileSync(partnerInboxYol, 'utf8')
    const kanonikOncesi = readFileSync(kanonikInboxYol, 'utf8')

    // guvenliYaz'ın KENDİ fault-injection noktası: geri-okuma HER ZAMAN yanlış/kırpılmış
    // döner → kanonik yazım TÜM denemelerde doğrulanamaz → guvenliYaz fırlatır → seamReconcileCalistir
    // bu noktada SONA ERMELİ, git'e HİÇ dokunulmamalı (bkz görev: "no partner input lost").
    const sahteOku = () => 'HER-ZAMAN-KIRPILMIŞ-YANLIŞ-İÇERİK'

    let hataYakalandi = null
    try {
      seamReconcileCalistir({
        projeId: '_test-seam', partnerInboxYol, partnerInboxKokYolu, kanonikInboxYol, kanonikKokYolu,
        guvenliYazOpts: { maxDeneme: 2, _readFileSync: sahteOku },
      })
    } catch (e) { hataYakalandi = e }

    ok('N2: kanonik yazım doğrulanamayınca fonksiyon HATA FIRLATTI (sessizce yutmadı)', hataYakalandi !== null)
    ok('N2: hata mesajı doğrulama-başarısızlığını işaret ediyor', /DOĞRULANMIŞ yazım başarısız/.test(hataYakalandi?.message ?? ''))

    const gitSonrasi = readFileSync(partnerInboxYol, 'utf8')
    ok('N2: git partner-inbox dosyası BİREBİR AYNI kaldı (temizlenmedi — partner girdisi KAYBOLMADI)',
      gitSonrasi === gitOncesi)
    ok('N2: git İÇERİĞİ hâlâ TÜM orijinal kartları taşıyor (k1/k2/k3-eski/k4-tekrar×2)',
      (gitSonrasi.match(/kart:test-k/g) || []).length === 5)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('E2E — Uçtan-uca (gerçek fs, injection YOK): birleştirme + doğrulanmış kanonik yazım + git temizliği')
{
  const { ns, partnerInboxKokYolu, kanonikKokYolu, partnerInboxYol, kanonikInboxYol } = yeniNs()
  try {
    writeFileSync(partnerInboxYol, GIT_FIKSTUR, 'utf8')
    writeFileSync(kanonikInboxYol, KANONIK_FIKSTUR, 'utf8')

    const sonuc = seamReconcileCalistir({
      projeId: '_test-seam', partnerInboxYol, partnerInboxKokYolu, kanonikInboxYol, kanonikKokYolu,
    })

    ok('E2E: degisti=true, 3 kart birleştirildi', sonuc.degisti === true && sonuc.birlestirilenler.length === 3)
    ok('E2E: 1 kart atlandı (test-k3-eski)', sonuc.atlananlar.length === 1 && sonuc.atlananlar[0].kartId === 'test-k3-eski')

    const kanonikSonrasi = readFileSync(kanonikInboxYol, 'utf8')
    ok('E2E: kanonik dosya ESKİ içeriği KORUDU (test-k3-eski notu hâlâ orada)',
      kanonikSonrasi.includes('Kanonikte zaten DAHA YENİ bir cevap var'))
    ok('E2E: kanonik dosya YENİ 3 kartı da içeriyor', ['test-k1', 'test-k2', 'test-k4-tekrar'].every(k => kanonikSonrasi.includes(`kart:${k}`)))
    ok('E2E: kanonikte k4-tekrar yalnız KAZANAN ("Son deneme (kazanan)") cevabıyla var', kanonikSonrasi.includes('Son deneme (kazanan)'))

    const gitSonrasi = readFileSync(partnerInboxYol, 'utf8')
    ok('E2E: git dosyası başlığı KORUDU', gitSonrasi.includes('İKİ-YAZAR KONTRATI'))
    ok('E2E: git dosyasında birleştirilen 3 kart ARTIK YOK', !['test-k1', 'test-k2', 'test-k4-tekrar'].some(k => gitSonrasi.includes(`kart:${k}`)))
    ok('E2E: git dosyasında atlanan test-k3-eski HÂLÂ VAR (kaybolmadı)', gitSonrasi.includes('kart:test-k3-eski'))

    // ── İDEMPOTENTLİK: aynı (artık güncellenmiş) dosyalarla İKİNCİ kez koştur ──
    const kanonikIlkKosum = kanonikSonrasi
    const gitIlkKosum = gitSonrasi
    const ikinciSonuc = seamReconcileCalistir({
      projeId: '_test-seam', partnerInboxYol, partnerInboxKokYolu, kanonikInboxYol, kanonikKokYolu,
    })
    ok('İDEMPOTENT: ikinci koşum NO-OP döner (birleştirilecek yeni bir şey yok)', ikinciSonuc.degisti === false)
    ok('İDEMPOTENT: kanonik dosya İKİNCİ koşumdan sonra BİREBİR AYNI (tekrar eklenmedi/bozulmadı)',
      readFileSync(kanonikInboxYol, 'utf8') === kanonikIlkKosum)
    ok('İDEMPOTENT: git dosyası İKİNCİ koşumdan sonra BİREBİR AYNI', readFileSync(partnerInboxYol, 'utf8') === gitIlkKosum)

    // Üçüncü kez de (bariz ama ekstra sağlamlık kanıtı).
    const ucuncuSonuc = seamReconcileCalistir({
      projeId: '_test-seam', partnerInboxYol, partnerInboxKokYolu, kanonikInboxYol, kanonikKokYolu,
    })
    ok('İDEMPOTENT: üçüncü koşum da NO-OP', ucuncuSonuc.degisti === false)
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('G1 — Proje dizini yoksa (yazım hatası olasılığı) SESSİZCE yeni dizin OLUŞTURULMAZ')
{
  const { ns, partnerInboxKokYolu, partnerInboxYol } = yeniNs()
  try {
    writeFileSync(partnerInboxYol, GIT_FIKSTUR, 'utf8')
    const YANLIS_PROJE_DIZINI = join(ns, 'projeler', 'yazim-hatali-proje-xyz')
    const yanlisInboxYol = join(YANLIS_PROJE_DIZINI, 'inbox.md')

    const sonuc = seamReconcileCalistir({
      projeId: 'yazim-hatali-proje-xyz', partnerInboxYol, partnerInboxKokYolu,
      kanonikInboxYol: yanlisInboxYol, kanonikKokYolu: YANLIS_PROJE_DIZINI,
    })

    ok('G1: var-olmayan proje dizini için NO-OP döner (hata değil, ama işlem YAPILMAZ)', sonuc.degisti === false)
    ok('G1: proje dizini SESSİZCE OLUŞTURULMADI', !existsSync(YANLIS_PROJE_DIZINI))
  } finally { temizle(ns) }
}

// ════════════════════════════════════════════════════════════════════════════
bolum('W1 — GÜVENLİK KANITI: hiçbir izleyici/daemon/başlangıç yolu seam-reconcile\'ı OTOMATİK ÇAĞIRMAZ')
{
  const izlemeDosyalari = [
    '../scripts/intake-queue-watch.mjs',
    '../scripts/soru-yanit-queue-watch.mjs',
  ]
  for (const yol of izlemeDosyalari) {
    const kaynak = readFileSync(new URL(yol, import.meta.url), 'utf8')
    ok(`W1: ${yol.replace('../', '')} seamReconcile/seam-reconcile'a HİÇ REFERANS VERMİYOR`,
      !kaynak.includes('seamReconcile') && !kaynak.includes('seam-reconcile'))
  }

  // package.json'daki HİÇBİR script (dev/build/watch/pre*/post* dahil) seam-reconcile'ı
  // çağırmamalı — yalnız elle "node scripts/seam-reconcile.mjs <id>" ile koşulur.
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const scriptDegerleri = Object.values(pkg.scripts ?? {})
  ok('W1: package.json\'daki HİÇBİR npm script seam-reconcile\'a referans vermiyor (yalnız elle koşulur)',
    scriptDegerleri.every(v => !v.includes('seam-reconcile')))

  // Kaynağın kendisi de kanıt: seam-reconcile.mjs / seamReconcile.mjs'i import eden TEK dosya
  // (test dosyaları hariç) kendi CLI'sinin kendisi olmalı — başka HİÇBİR üretim dosyası değil.
  const tumScriptler = readFileSync(new URL('../scripts/seam-reconcile.mjs', import.meta.url), 'utf8')
  ok('W1: scripts/seam-reconcile.mjs kendi başlığında "MANUEL/OPERATÖR-TETİKLEMELİ" uyarısını taşıyor',
    /MANUEL|OPERATÖR-TETİKLEMELİ/.test(tumScriptler))
  const toolKaynagi = readFileSync(new URL('../tools/seamReconcile.mjs', import.meta.url), 'utf8')
  ok('W1: tools/seamReconcile.mjs kendi başlığında "izleyici/daemon" bağlanmama uyarısını taşıyor',
    /izleyici.*daemon|daemon.*izleyici/i.test(toolKaynagi))
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
