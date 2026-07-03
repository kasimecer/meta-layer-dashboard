// Hermetik master-plan BÖLÜM test fikstürleri — repo-içi, Drive'dan BAĞIMSIZ. Her fikstür
// GERÇEK bölüm kapısından (bolumKapidanGecerMi) geçecek şekilde tasarlandı; bu modül
// yüklenirken kendi kendini doğrular (drift olursa test-koşumu anında patlar) — AYNI desen
// scripts/planlama-test-fikstur.mjs ile (F0 "drift kalkanı").
// BOZUK_* varyantlar BİLEREK kapıdan/kuraldan KALIR (red-yolu testleri için).

import { bolumKapidanGecerMi } from '../tools/planlamaBolumKapilari.mjs'
import { BOLUM_SIRASI } from '../tools/planlamaBolumTanimlari.mjs'

export const FIKSTUR_BOLUM = {
  'ozet-yonetici': `# Yönetici Özeti — Test Projesi

Bu proje, pazar analizi bölümünde işaret edilen fırsat alanına odaklanıyor ve rekabet
konumlandırma bölümünde tarif edilen farklılaşmayı hedefliyor.

Ürün tanımı ve iş modeli bölümlerinde çerçevelenen kapsam, bütçe bölümünde onaylanan
kaynaklarla desteklenmektedir.

Operasyon ve pazara giriş bölümleri birlikte okunduğunda, ekip yürütmeye hazır bir plan görüyor.
`,

  'problem-cozum': `# Problem ve Çözüm Tanımı — Test Projesi

Hedef kullanıcı, günlük tekrar eden bir sürtünmeyle karşılaşıyor ve bugüne kadar kalıcı bir çözüm bulamadı. [operator-beyan:problem-onay]

Önerilen çözüm, kurulumsuz ve kalıcı bir retrofit katmanı sunarak bu sürtünmeyi ortadan kaldırır. [operator-beyan:cozum-tanimi]
`,

  'pazar-analizi': `# Pazar Analizi — Test Projesi

Toplam adreslenebilir pazar sektör raporuyla doğrulanmıştır. [dogrulandi:sektor-raporu-2026]

Hedef segment, düşük-bakım çözümlere açık şehirli yetişkinlerden oluşuyor. [dogrulandi:sektor-raporu-2026]

Müşteri profili, tekrar eden günlük sürtünmeden rahatsız olan konfor odaklı tüketicidir. [dogrulandi:sektor-raporu-2026]
`,

  'rekabet-konumlandirma': `# Rekabet ve Konumlandırma — Test Projesi

Mevcut rakipler ya mevcut ürünü değiştiriyor ya da kurulum gerektiriyor. [dogrulandi:rakip-taramasi-2026]

Kurulumsuz kalıcı forma odaklanan güçlü bir rakip şu an görünmüyor. [dogrulandi:rakip-taramasi-2026]

Konumlandırma tezi, kullanım-anı tasarımını öne çıkarmaktır. [operator-beyan:konumlandirma-onay]
`,

  'urun-tanimi': `# Ürün/Hizmet Tanımı (MVP) — Test Projesi

MVP kapsamı, tek bir kalıcı form varyantı ve temel kurulum kılavuzudur. [operator-beyan:mvp-sinir]

Ürün yol haritası, ikinci varyantı pilot geri bildirimi sonrası ekler. [operator-beyan:yol-haritasi-oncelik]
`,

  'is-modeli-fiyatlama': `# İş Modeli ve Fiyatlama — Test Projesi

Gelir modeli, tek seferlik satış artı isteğe bağlı bakım paketidir. [operator-beyan:gelir-modeli]

Birim başına üretim maliyeti operatör tarafından kabul edilmiştir. [operator-onayli-tahmin:birim-maliyet-tahmini]

Hedef kâr marjı operatör tarafından belirlenmiştir. [operator-beyan:marj-hedefi]
`,

  'butce-finansal': `# Bütçe ve Finansallar — Test Projesi

Başlangıç maliyeti tedarikçi teklifiyle doğrulanmıştır. [dogrulandi:tedarikci-teklifi-2026]

Aylık operasyonel gider tahmini operatör tarafından onaylanmıştır. [operator-onayli-tahmin:opex-tahmini]

Başabaş noktası, doğrulanmış başlangıç maliyeti ve onaylı opex tahminine dayanır. [operator-onayli-tahmin:basabas-hesabi]
`,

  'gtm-pazarlama': `# Pazara Giriş ve Pazarlama/Reklam Operasyonları — Test Projesi

Birincil kanal olarak organik içerik ve sosyal medya seçilmiştir. [operator-beyan:kanal-secimi]

Sosyal medya reklam maliyeti kıyaslama verisiyle doğrulanmıştır. [dogrulandi:reklam-kiyaslama-2026]
`,

  'dijital-varlik-spec': `# Dijital Varlık SPEC — Test Projesi

Web sitesi tek sayfalık bir tanıtım ve ön-kayıt formu içerir. [operator-beyan:site-kapsami]

Domain adı operatör tarafından seçilecek bir marka adı kullanır. [operator-beyan:domain-secimi]

Temel analitik olarak ziyaretçi sayısı ve form dönüşüm oranı izlenir. [operator-beyan:analitik-kapsami]
`,

  'operasyon-plani': `# Operasyon Planı — Test Projesi

Tedarik süreci, doğrulanmış tek bir tedarikçi üzerinden yürütülecektir. [dogrulandi:tedarikci-teklifi-2026]

Teslimat süreci operatör tarafından yerel kargo üzerinden planlanmıştır. [operator-beyan:teslimat-plani]
`,

  'yasal-uyumluluk': `# Yasal ve Uyumluluk — Test Projesi

Şirket kuruluş süreci resmi kaynakla doğrulanmıştır. [dogrulandi:ticaret-odasi-rehberi-2026]

Vergi yükümlülükleri aynı kaynakta tanımlanmıştır. [dogrulandi:ticaret-odasi-rehberi-2026]
`,

  'risk-varsayimlar': `# Riskler ve Varsayımlar — Test Projesi

En kritik varsayım, kullanıcının kurulumsuz forma alışacağıdır. [operator-beyan:varsayim-benimseme]

Gizli varsayım taraması, tedarik sürekliliğinin garanti sayıldığını ortaya çıkarmıştır. [operator-beyan:varsayim-tedarik]
`,

  'yol-haritasi': `# Yol Haritası ve Yapılacaklar — Test Projesi

İlk 90 gün, tedarik onayı, prototip üretimi ve pilot lansmanını kapsar. [operator-beyan:ilk-90-gun-plani]

Sıralama mantığı, tedarik olmadan pilotun başlayamayacağı önceliğine dayanır. [operator-beyan:siralama-mantigi]
`,

  'olcumleme-kpi': `# Ölçümleme (KPI) — Test Projesi

Başarı kriteri, ilk 90 günde belirli bir pilot-kullanıcı kitlesinin tekrar kullanımıdır. [operator-beyan:basari-kriteri]
`,
}

// provenans-ek statik bir "geçerli içerik" fikstürü taşımaz — kapısı (provenansKapisi) `baglam`
// (toplanmış iddia/atlanan verisi) ile İLİŞKİSEL çalışır; gerçek coverage-davranışı test
// runner'da kontrollü `baglam` ile ayrıca sınanır. Burada yalnız baglamsız-düşme yolunun
// (fallback: içerik>20 karakter) makul bir örneği tutulur.
export const PROVENANS_EK_ORNEK = `# Provenans Eki — Test Projesi

Bu bölüm, önceki bölümlerdeki iddiaları kaynak/soru-referansı ve statüleriyle listeler.
`

// ── BOZUK varyantlar (bilerek kapıdan/kuraldan KALIR) ──────────────────────────────────
export const BOZUK_BOLUM = {
  // T testi: bir içerik satırı HİÇBİR statü etiketi taşımıyor.
  etiketsizSatir: `# Ürün/Hizmet Tanımı (MVP) — Test Projesi

MVP kapsamı, tek bir kalıcı form varyantı ve temel kurulum kılavuzudur. [operator-beyan:mvp-sinir]

Bu satır kasıtlı olarak hiçbir statü etiketi taşımıyor ve bu yüzden reddedilmeli.
`,

  // S9 testi: dijital-varlik-spec'e sızmış bariz bir inşa-artefaktı (gerçek kod/HTML). Her
  // satır KASITLI OLARAK etiketli — amaç genel "satır-etiketi" kuralını DEĞİL, ÖZEL olarak
  // dijitalVarlikInsaDenylist'in kendisini izole edip sınamak (iki farklı red-nedeni var;
  // bu fikstür yalnız denylist'i tetiklemeli, genel govde kuralını DEĞİL).
  insaArtefakti: `# Dijital Varlık SPEC — Test Projesi

Web sitesi aşağıdaki gibi kurulacaktır. [operator-beyan:site-kapsami]

<!DOCTYPE html> ana sayfa taslağı budur. [operator-beyan:html-taslak]

Sayfa gövdesi <html><body><h1>Merhaba</h1></body></html> şeklinde kurulacaktır. [operator-beyan:html-govde]
`,

  // Exec-summary TERS kuralı testi: özet bölümü YENİ bir statü etiketi taşıyor (yasak).
  ozetEtiketli: `# Yönetici Özeti — Test Projesi

Pazar fırsatı gerçek bir kaynakla doğrulanmıştır. [dogrulandi:sektor-raporu-2026]
`,

  // D1 testi: yasal-uyumluluk'un YEREL toleransı — açık-soru etiketiyle BİRLİKTE de bölüm
  // kendi kapısından geçmeli (sifirAcikGerekli=false bu bölüm için).
  yasalUyumlulukAcik: `# Yasal ve Uyumluluk — Test Projesi

Şirket kuruluş süreci resmi kaynakla doğrulanmıştır. [dogrulandi:ticaret-odasi-rehberi-2026]

Gerekli izin türü henüz netleşmemiştir. [acik-soru:izin-turu-belirsiz]
`,

  // D1 testi: pazar-analizi'nde SIFIR doğrulanmış iddia (minDogrulandi=1 karşılanmıyor) —
  // tüm satırlar statülü ama hiçbiri [dogrulandi:...] değil, kaynak-gerekli şartı BOŞ kalır.
  pazarAnaliziDogrulanmamis: `# Pazar Analizi — Test Projesi

Toplam adreslenebilir pazar için operatör bir tahmini kabul etmiştir. [operator-onayli-tahmin:pazar-buyuklugu-tahmini]

Hedef segment operatör tarafından tanımlanmıştır. [operator-beyan:segment-tanimi]
`,

  // GR testi: bariz UYDURMA bir kaynak — sözdizimi geçerli ([dogrulandi:kaynak]) ama kaynak
  // araştırma aşamasında GERÇEKTEN doğrulanmamış. Gate bunu REDDETMELİ (damga kaynak yerine geçmez).
  pazarAnaliziUydurmaKaynak: `# Pazar Analizi — Test Projesi

Toplam adreslenebilir pazar UYDURULMUŞ bir rakamla verilmiştir. [dogrulandi:uydurma-kaynak-xyz]

Hedef segment, düşük-bakım çözümlere açık şehirli yetişkinlerden oluşuyor. [dogrulandi:sektor-raporu-2026]
`,

  // GR testi: pazar-analizi'nde bir iddia HENÜZ kaynaklanamadı ([acik-soru:...]) — diğer 2 satır
  // zaten GERÇEK kaynaklı (minDogrulandi=1 bağımsız karşılanıyor); testin odağı YALNIZ
  // açık-soru → DATA-REQUEST + yerel sıfır-açık bloğu mekaniği (pazar-analizi sifirAcikGerekli=true).
  pazarAnaliziAcikSoru: `# Pazar Analizi — Test Projesi

Toplam adreslenebilir pazar sektör raporuyla doğrulanmıştır. [dogrulandi:sektor-raporu-2026]

Hedef segment, düşük-bakım çözümlere açık şehirli yetişkinlerden oluşuyor. [dogrulandi:sektor-raporu-2026]

Kullanıcı başına ortalama yıllık harcama HENÜZ doğrulanamadı. [acik-soru:kullanici-basi-harcama]
`,
}

// Genel (bölüme özgü olmayan) DATA-REQUEST-tetikleme testi için ham parça — araştırma-tarzı
// [eksik] etiketi, bölüm sözlüğü DIŞINDA (görev metninin "figures marked missing" örneği).
export const EKSIK_FIGUR_SATIRI = 'Kullanıcı edinme maliyeti [eksik] henüz ölçülmedi.'

// ── Kendi kendini doğrula (F0 "drift kalkanı") ──────────────────────────────────────────
export function bolumFiksturuDogrula() {
  const hatalar = []
  for (const [bolumId, icerik] of Object.entries(FIKSTUR_BOLUM)) {
    const g = bolumKapidanGecerMi(bolumId, icerik)
    if (!g.gecti) hatalar.push(`FIKSTUR_BOLUM.${bolumId} kapıdan GEÇMELİYDİ ama kaldı: ${g.neden}`)
  }
  const kontrolEt = (bolumId, icerik, beklenenGectiMi, etiket) => {
    const g = bolumKapidanGecerMi(bolumId, icerik)
    if (g.gecti !== beklenenGectiMi) {
      hatalar.push(`BOZUK_BOLUM.${etiket} beklenen gecti=${beklenenGectiMi} ama gerçek=${g.gecti} (${g.neden ?? '—'})`)
    }
  }
  kontrolEt('urun-tanimi', BOZUK_BOLUM.etiketsizSatir, false, 'etiketsizSatir')
  kontrolEt('dijital-varlik-spec', BOZUK_BOLUM.insaArtefakti, false, 'insaArtefakti')
  kontrolEt('ozet-yonetici', BOZUK_BOLUM.ozetEtiketli, false, 'ozetEtiketli')
  kontrolEt('yasal-uyumluluk', BOZUK_BOLUM.yasalUyumlulukAcik, true, 'yasalUyumlulukAcik (yerel tolerans)')
  kontrolEt('pazar-analizi', BOZUK_BOLUM.pazarAnaliziDogrulanmamis, false, 'pazarAnaliziDogrulanmamis')
  // baglamsız (kontrolsüz) çağrıda grounding uygulanmaz — bu fikstür YALNIZ baglam.gercekKaynaklar
  // verildiğinde reddedilir (bkz test-runner GR bölümü, burada yalnız yapı/govde geçtiğini doğrular).
  kontrolEt('pazar-analizi', BOZUK_BOLUM.pazarAnaliziUydurmaKaynak, true, 'pazarAnaliziUydurmaKaynak (baglamsız — grounding YOK)')
  // sifirAcikGerekli=true bölümde ÇÖZÜLMEMİŞ bir açık-soru, baglamsız (=ham sayım) çağrıda da
  // REDDEDİLMELİ — bu, "yanıtlanana kadar bloklar" iddiasının en temel hâli.
  kontrolEt('pazar-analizi', BOZUK_BOLUM.pazarAnaliziAcikSoru, false, 'pazarAnaliziAcikSoru (çözülmemiş → bloklar)')

  // Kayıt bütünlüğü: BOLUM_SIRASI'ndaki her asıl bölüm (provenans-ek hariç) FIKSTUR_BOLUM'da var mı?
  for (const id of BOLUM_SIRASI) {
    if (id === 'provenans-ek') continue
    if (!(id in FIKSTUR_BOLUM)) hatalar.push(`FIKSTUR_BOLUM'da eksik bölüm: ${id}`)
  }

  if (hatalar.length) throw new Error('Bölüm fikstür drift:\n  ' + hatalar.join('\n  '))
  return true
}
