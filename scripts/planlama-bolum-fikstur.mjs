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

Toplam adreslenebilir pazar sektör raporuyla doğrulanmıştır. [dogrulandi:sektor-raporu-2026] [tip:masabasi]

Hedef segment, düşük-bakım çözümlere açık şehirli yetişkinlerden oluşuyor. [dogrulandi:sektor-raporu-2026] [tip:masabasi]

Müşteri profili, tekrar eden günlük sürtünmeden rahatsız olan konfor odaklı tüketicidir. [dogrulandi:sektor-raporu-2026] [tip:masabasi]
`,

  'rekabet-konumlandirma': `# Rekabet ve Konumlandırma — Test Projesi

## Rakip Seti

Mevcut rakipler ya mevcut ürünü değiştiriyor ya da kurulum gerektiriyor. [dogrulandi:rakip-taramasi-2026] [tip:masabasi]

Kurulumsuz kalıcı forma odaklanan güçlü bir rakip şu an görünmüyor. [dogrulandi:rakip-taramasi-2026] [tip:masabasi]

Konumlandırma tezi, kullanım-anı tasarımını öne çıkarmaktır. [operator-beyan:konumlandirma-onay]
`,

  'urun-tanimi': `# Ürün/Hizmet Tanımı (MVP) — Test Projesi

MVP kapsamı, tek bir kalıcı form varyantı ve temel kurulum kılavuzudur. [operator-beyan:mvp-sinir]

Ürün yol haritası, ikinci varyantı pilot geri bildirimi sonrası ekler. [operator-beyan:yol-haritasi-oncelik]
`,

  'is-modeli-fiyatlama': `# İş Modeli ve Fiyatlama — Test Projesi

## Gelir Modeli

Gelir modeli, tek seferlik satış artı isteğe bağlı bakım paketidir. [operator-beyan:gelir-modeli]

Birim başına üretim maliyeti operatör tarafından kabul edilmiştir. [operator-onayli-tahmin:birim-maliyet-tahmini] [tip:icbilgi]

Hedef kâr marjı operatör tarafından belirlenmiştir. [operator-beyan:marj-hedefi]
`,

  'butce-finansal': `# Bütçe ve Finansallar — Test Projesi

## Başlangıç Maliyeti

Başlangıç maliyeti tedarikçi teklifiyle doğrulanmıştır. [dogrulandi:tedarikci-teklifi-2026] [tip:icbilgi]

## Opex ve Nakit Akışı

Aylık operasyonel gider tahmini operatör tarafından onaylanmıştır. [operator-onayli-tahmin:opex-tahmini] [tip:icbilgi]

Başabaş noktası, doğrulanmış başlangıç maliyeti ve onaylı opex tahminine dayanır. [operator-onayli-tahmin:basabas-hesabi] [tip:icbilgi]

Nakit akışı projeksiyonu, başabaş noktasına kadarki dönemi operatör onaylı tahminle kapsar. [operator-onayli-tahmin:nakit-akisi-tahmini] [tip:icbilgi]
`,

  'gtm-pazarlama': `# Pazara Giriş ve Pazarlama/Reklam Operasyonları — Test Projesi

## Kanal Planı

Birincil kanal olarak organik içerik ve sosyal medya seçilmiştir. [operator-beyan:kanal-secimi]

Sosyal medya reklam maliyeti kıyaslama verisiyle doğrulanmıştır. [dogrulandi:reklam-kiyaslama-2026] [tip:masabasi]
`,

  'dijital-varlik-spec': `# Dijital Varlık SPEC — Test Projesi

## Web Sitesi

Web sitesi tek sayfalık bir tanıtım ve ön-kayıt formu içerir. [operator-beyan:site-kapsami]

Domain adı operatör tarafından seçilecek bir marka adı kullanır. [operator-beyan:domain-secimi]

Temel analitik olarak ziyaretçi sayısı ve form dönüşüm oranı izlenir. [operator-beyan:analitik-kapsami]
`,

  'operasyon-plani': `# Operasyon Planı — Test Projesi

## Tedarik Süreci

Tedarik süreci, doğrulanmış tek bir tedarikçi üzerinden yürütülecektir. [dogrulandi:tedarikci-teklifi-2026] [tip:icbilgi]

Teslimat süreci operatör tarafından yerel kargo üzerinden planlanmıştır. [operator-beyan:teslimat-plani]
`,

  'yasal-uyumluluk': `# Yasal ve Uyumluluk — Test Projesi

## Kuruluş ve Vergi

Şirket kuruluş süreci resmi kaynakla doğrulanmıştır. [dogrulandi:ticaret-odasi-rehberi-2026] [tip:masabasi]

Vergi yükümlülükleri aynı kaynakta tanımlanmıştır. [dogrulandi:ticaret-odasi-rehberi-2026] [tip:masabasi]
`,

  'risk-varsayimlar': `# Riskler ve Varsayımlar — Test Projesi

En büyük risk, tedarikçi sürekliliğinin kesintiye uğramasıdır. [operator-beyan:risk-tedarik-sureklilik]

En kritik varsayım, kullanıcının kurulumsuz forma alışacağıdır. [operator-beyan:varsayim-benimseme]

Gizli varsayım taraması, tedarik sürekliliğinin garanti sayıldığını ortaya çıkarmıştır. [operator-beyan:varsayim-tedarik]
`,

  'yol-haritasi': `# Yol Haritası ve Yapılacaklar — Test Projesi

## İlk 90 Gün Planı

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

## Web Sitesi

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

## Kuruluş ve Vergi

Şirket kuruluş süreci resmi kaynakla doğrulanmıştır. [dogrulandi:ticaret-odasi-rehberi-2026] [tip:masabasi]

Gerekli izin türü henüz netleşmemiştir. [acik-soru:izin-turu-belirsiz] [tip:masabasi]
`,

  // D1 testi: pazar-analizi'nde SIFIR doğrulanmış iddia (minDogrulandi=1 karşılanmıyor) —
  // tüm satırlar statülü ama hiçbiri [dogrulandi:...] değil, kaynak-gerekli şartı BOŞ kalır.
  pazarAnaliziDogrulanmamis: `# Pazar Analizi — Test Projesi

Toplam adreslenebilir pazar için operatör bir tahmini kabul etmiştir. [operator-onayli-tahmin:pazar-buyuklugu-tahmini] [tip:masabasi]

Hedef segment operatör tarafından tanımlanmıştır. [operator-beyan:segment-tanimi]
`,

  // GR testi: bariz UYDURMA bir kaynak — sözdizimi geçerli ([dogrulandi:kaynak]) ama kaynak
  // araştırma aşamasında GERÇEKTEN doğrulanmamış. Gate bunu REDDETMELİ (damga kaynak yerine geçmez).
  pazarAnaliziUydurmaKaynak: `# Pazar Analizi — Test Projesi

Toplam adreslenebilir pazar UYDURULMUŞ bir rakamla verilmiştir. [dogrulandi:uydurma-kaynak-xyz] [tip:masabasi]

Hedef segment, düşük-bakım çözümlere açık şehirli yetişkinlerden oluşuyor. [dogrulandi:sektor-raporu-2026] [tip:masabasi]
`,

  // GR testi: pazar-analizi'nde bir iddia HENÜZ kaynaklanamadı ([acik-soru:...]) — diğer 2 satır
  // zaten GERÇEK kaynaklı (minDogrulandi=1 bağımsız karşılanıyor); testin odağı YALNIZ
  // açık-soru → DATA-REQUEST + yerel sıfır-açık bloğu mekaniği (pazar-analizi sifirAcikGerekli=true).
  pazarAnaliziAcikSoru: `# Pazar Analizi — Test Projesi

Toplam adreslenebilir pazar sektör raporuyla doğrulanmıştır. [dogrulandi:sektor-raporu-2026] [tip:masabasi]

Hedef segment, düşük-bakım çözümlere açık şehirli yetişkinlerden oluşuyor. [dogrulandi:sektor-raporu-2026] [tip:masabasi]

Kullanıcı başına ortalama yıllık harcama HENÜZ doğrulanamadı. [acik-soru:kullanici-basi-harcama] [tip:masabasi]
`,

  // BÜTÜNLÜK testi (gerçek gözlemlenen vaka): bütçe/finansal bölüm KIRPILDI — başlık VE ilk
  // kalem (başlangıç maliyeti) tamamen eksik, ilk hayatta kalan satır cümle-ortası bir parça
  // (küçük harfle başlıyor, önceki — artık var olmayan — satırın devamı). GERİYE KALAN kuyruk
  // KENDİ İÇİNDE tam etiketli (satır-etiketi kuralından GEÇER) — bu TAM OLARAK 2026-07-08'de
  // gözlemlenen 4436-bayt kırpılma vakasının küçültülmüş bir temsili (bkz planlamaBolumButunluk.mjs).
  butceKirpilmis: `tedarikçi teklifiyle doğrulanmıştır ve bu maliyet kalemi ayrıca operatör tarafından da teyit edilmiştir. [dogrulandi:tedarikci-teklifi-2026] [tip:icbilgi]

Aylık operasyonel gider tahmini operatör tarafından onaylanmıştır. [operator-onayli-tahmin:opex-tahmini] [tip:icbilgi]
`,

  // TIP testi: urun-tanimi'nde bir [dogrulandi:...] iddiası co-located [tip:...] TAŞIMIYOR —
  // negatif-gate testi (görev: "reject a bölüm containing an empirical claim that lacks a
  // co-located [tip:...]"). Diğer satırlar (operator-beyan) MUAF, kasıtlı olarak dokunulmadı —
  // amaç YALNIZ tip-gerekliliğini izole etmek, genel govde kuralını DEĞİL.
  tipsizAmpirikIddia: `# Ürün/Hizmet Tanımı (MVP) — Test Projesi

MVP kapsamı, tek bir kalıcı form varyantı ve temel kurulum kılavuzudur. [operator-beyan:mvp-sinir]

Rakip ürünlerin ortalama fiyatı pazar taramasıyla doğrulanmıştır. [dogrulandi:rakip-fiyat-taramasi-2026]
`,

  // P2 BÜTÜNLÜK testi (eksikBasliklarBul'un YENİ yakaladığı sınıf): bölüm KIRPILMAMIŞ — düzgün
  // başlıkla başlıyor, minBayt'ı rahatça aşıyor, ilk satır bir cümle-parçası DEĞİL — ama beklenen
  // konunun ("gelir modeli"/"gelir") kelimesi yalnız GÖVDE METNİNDE geçiyor, o konuyu TANIMLAYAN
  // hiçbir başlık satırı YOK ("## Maliyet Yapısı" tek alt-başlık, "gelir" içermiyor). ESKİ
  // eksikKonularBul (belge-geneli .includes()) bunu YANLIŞLIKLA geçirirdi — "gelir" kelimesi
  // "Toplam gelir hedefi..." cümlesinde geçtiği için. YENİ (başlık-satırı-kapsamlı) kontrol bunu
  // doğru biçimde REDDETMELİ.
  basliksizKonu: `# İş Modeli ve Fiyatlama — Test Projesi

## Maliyet Yapısı

Toplam gelir hedefi operatör tarafından üçüncü çeyreğe kadar gözden geçirilecektir. [operator-beyan:gelir-hedefi-notu]

Birim başına üretim maliyeti operatör tarafından kabul edilmiştir. [operator-onayli-tahmin:birim-maliyet-tahmini] [tip:icbilgi]
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
  // TIP negatif-gate: ampirik ([dogrulandi:...]) bir iddia co-located [tip:...] TAŞIMIYORSA REDDEDİLİR.
  kontrolEt('urun-tanimi', BOZUK_BOLUM.tipsizAmpirikIddia, false, 'tipsizAmpirikIddia (co-located [tip:...] eksik → reddedilir)')

  // Kayıt bütünlüğü: BOLUM_SIRASI'ndaki her asıl bölüm (provenans-ek hariç) FIKSTUR_BOLUM'da var mı?
  for (const id of BOLUM_SIRASI) {
    if (id === 'provenans-ek') continue
    if (!(id in FIKSTUR_BOLUM)) hatalar.push(`FIKSTUR_BOLUM'da eksik bölüm: ${id}`)
  }

  if (hatalar.length) throw new Error('Bölüm fikstür drift:\n  ' + hatalar.join('\n  '))
  return true
}
