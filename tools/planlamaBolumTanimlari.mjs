// Master-plan BÖLÜM TANIMLARI — veri, kod değil. 14 sabit bölüm + provenans-eki, sırasıyla.
// Bölüm kapıları (planlamaBolumKapilari.mjs) ve bölüm prompt'ları (canliExecutor.mjs'deki
// promptUretBolum) bu kayıttan ÜRETİLİR — 15 kez elle yazılmaz.
//
// Bölüm id'leri, soru sistemi (planlamaSorular.mjs) dahil HER YERDE aynı ÇIPLAK (bare) id
// olarak kullanılır (ör. 'pazar-analizi') — bileşik/namespaced bir id YOK. 15 bölüm id'si +
// 5 aşama id'si zaten global olarak benzersiz; bileşik id yalnız kozmetik bir alt-dizin
// düzenlemesi sağlardı ama paylaşılan birimKostur/birimUstYanitTuket/birimAcikDurum
// yardımcılarında state-anahtarı ile soru-dosyası anahtarını AYRIŞTIRMAYI gerektirirdi —
// gerçek fayda kozmetikti, eklenen karmaşıklık değmedi (bkz "makine büyümesin" ilkesi).
//
// Alanlar:
//   id, etiket                  — kimlik + insan-okunur ad
//   hedefAciklama                — bölümün prompt'a giden kısa hedef/done-when açıklaması (veri; promptUretBolum bundan üretir)
//   iddiaSinifi                 — görevdeki "claim-class" (bilgi amaçlı, prompt'a yansır)
//   ustBaglamAnahtarlari        — hangi aşama/bölüm içeriği prompt bağlamına enjekte edilir
//                                 ('*tum-bolumler*' = o ana kadar geçmiş TÜM diğer bölümler)
//   iddiaMuaf                   — true ⟺ TERS kural (sıfır etiket + sıfır çıplak sayı) — YALNIZ ozet-yonetici
//   mekanik                     — true ⟺ provenans-eki (kapı = kapsam kontrolü, satır kuralı DEĞİL) — YALNIZ provenans-ek
//   sifirAcikGerekli            — Layer-1 (bölüm-yerel) sıfır-açık şartı mı (false ⟹ acik-soru ile de gecti olabilir,
//                                 nihai Layer-2 kontrolü yine de bunu global olarak ister)
//   minDogrulandi                — Layer-1 yerel minimum [dogrulandi:*] sayısı (source-required bölümler)
//   ekKontrol                    — bölüme özgü ek kapı kontrolü (bolumId, icerik) => {gecti,neden?} | null
//   minBayt                      — YAPISAL BÜTÜNLÜK (bkz planlamaBolumButunluk.mjs): bölüm-türüne göre
//                                 kalibre edilmiş minimum bayt eşiği — KIRPILMA'ya karşı EK bir savunma
//                                 katmanı (birincil dedektör değil; bkz beklenenBasliklar + ilk-satır
//                                 kontrolü). Mevcut hermetik test fikstürlerinin GERÇEK boyutunun
//                                 altında kalacak şekilde BİLEREK mütevazı tutulur — tek küresel sabit
//                                 DEĞİL, her bölüm kendi değerini taşır.
//   beklenenBasliklar               — YAPISAL BÜTÜNLÜK (bkz planlamaBolumButunluk.mjs
//                                 eksikBasliklarBul): [[eş-anlamlı-kelime,...], ...] — her iç grup
//                                 bir "konu"; grup İÇİNDEKİ herhangi biri belgenin BİR BAŞLIK
//                                 SATIRINDA (##/###/... — gövde metninin TAMAMINDA DEĞİL) geçerse o
//                                 konu VAR sayılır (OR, paraphrase-toleranslı, konum-farkında —
//                                 2026-07-16 P2: eskiden gövdenin HERHANGİ bir yerinde arıyordu,
//                                 bu da kırpılmış bir kuyrukta alakasız bir cümlede geçen kelimeyi
//                                 "var" sayıp gerçek kırpılmayı kaçırıyordu). BİLEREK az sayıda
//                                 (1-2) VE merkezi konuyla sınırlı — hedefAciklama'nın HER cümlesini
//                                 zorunlu KILMAZ (yanlış-red riskini düşürmek için, bkz görev notu:
//                                 "must NOT false-fail legitimately short-but-complete sections").

// NOT (düzeltme): özet-yönetici BAŞTA değil, SONDA yürütülür — görevin kendi ifadesiyle
// "written last... only after all sections close". Mock-executor'lu testler bunu YAKALAMAZ
// (sabit metin döner, sıradan bağımsız) ama gerçek bir model-koşumunda özet-yönetici en
// başta çalışsaydı sentezleyeceği 13 bölümün HİÇBİRİ henüz yazılmamış olurdu — bkz
// bolumBaglamlarKur'un TUM_BOLUMLER_ISARETI döngüsü (yalnız o ana kadar 'gecti' olanları toplar).
export const BOLUM_SIRASI = [
  'problem-cozum', 'pazar-analizi', 'rekabet-konumlandirma', 'urun-tanimi',
  'is-modeli-fiyatlama', 'butce-finansal', 'gtm-pazarlama', 'dijital-varlik-spec',
  'operasyon-plani', 'yasal-uyumluluk', 'risk-varsayimlar', 'yol-haritasi', 'olcumleme-kpi',
  'ozet-yonetici', 'provenans-ek',
]

export const TUM_BOLUMLER_ISARETI = '*tum-bolumler*'

export const BOLUM_TANIMLARI = {
  'ozet-yonetici': {
    id: 'ozet-yonetici', etiket: 'Yönetici Özeti',
    hedefAciklama: 'Tüm bölümler kapandıktan SONRA yaz. YENİ hiçbir iddia/sayı/karar EKLEME — yalnız aşağıdaki bölümlerin zaten söylediklerini nitel biçimde özetle.',
    iddiaSinifi: ['synthesis'], ustBaglamAnahtarlari: [TUM_BOLUMLER_ISARETI],
    iddiaMuaf: true, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 0, ekKontrol: null,
    minBayt: 200, beklenenBasliklar: [],
  },
  'problem-cozum': {
    id: 'problem-cozum', etiket: 'Problem ve Çözüm Tanımı',
    hedefAciklama: 'Problem tanımını ve önerilen çözümü net biçimde yaz. Problem ifadesi operatör onayına sunulmalı.',
    iddiaSinifi: ['operator-input', 'synthesis'], ustBaglamAnahtarlari: ['genesis', 'premise'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 0, ekKontrol: null,
    minBayt: 120, beklenenBasliklar: [['çözüm', 'cozum']],
  },
  'pazar-analizi': {
    id: 'pazar-analizi', etiket: 'Pazar Analizi (TAM/SAM/SOM)',
    hedefAciklama: 'TAM/SAM/SOM, hedef segment, müşteri profili. En az bir pazar-büyüklüğü figürü GERÇEKTEN [dogrulandi:kaynak] ile kaynaklı olmalı; bu bölümde açık soru BIRAKMA.',
    iddiaSinifi: ['source-required'], ustBaglamAnahtarlari: ['arastirma'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: true, minDogrulandi: 1, ekKontrol: null,
    minBayt: 120, beklenenBasliklar: [['adreslenebilir pazar', 'pazar büyüklüğü', 'tam/sam/som', 'pazar analizi']],
  },
  'rekabet-konumlandirma': {
    id: 'rekabet-konumlandirma', etiket: 'Rekabet ve Konumlandırma',
    hedefAciklama: 'Alternatifler + farklılaşma. Rakip seti [dogrulandi:kaynak] ile kaynaklı olsun; konumlandırma tezi operatör onayına sunulmalı.',
    iddiaSinifi: ['source-required'], ustBaglamAnahtarlari: ['arastirma'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 1, ekKontrol: null,
    minBayt: 100, beklenenBasliklar: [['rakip', 'alternatif']],
  },
  'urun-tanimi': {
    id: 'urun-tanimi', etiket: 'Ürün/Hizmet Tanımı (MVP)',
    hedefAciklama: 'Kapsam, MVP, ürün yol haritası. MVP sınırı operatör onayına sunulmalı.',
    iddiaSinifi: ['operator-input'], ustBaglamAnahtarlari: ['premise', 'strateji'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 0, ekKontrol: null,
    minBayt: 100, beklenenBasliklar: [['mvp', 'kapsam']],
  },
  'is-modeli-fiyatlama': {
    id: 'is-modeli-fiyatlama', etiket: 'İş Modeli ve Fiyatlama',
    hedefAciklama: 'Gelir modeli, birim ekonomisi. HER birim-ekonomisi girdisi AYRI AYRI statülenmeli.',
    iddiaSinifi: ['source-required', 'operator-input'], ustBaglamAnahtarlari: ['strateji'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 0, ekKontrol: null,
    minBayt: 100, beklenenBasliklar: [['gelir modeli', 'gelir']],
  },
  'butce-finansal': {
    id: 'butce-finansal', etiket: 'Bütçe ve Finansallar',
    hedefAciklama: 'Başlangıç maliyeti, opex, başabaş, nakit akışı. HER kalem statülenmeli; başabaş girdileri izlenebilir olmalı.',
    iddiaSinifi: ['source-required', 'operator-approved-estimate'], ustBaglamAnahtarlari: ['strateji'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 1, ekKontrol: null,
    // Gerçek gözlemlenen kırpılma vakası bu bölümdeydi (4436 bayta kırpıldı, ilk kalemleri eksikti)
    // — iki grup BİLEREK tutuldu (başlangıç-maliyeti AYRI istendi çünkü kırpılan tam da "ilk kalem"di).
    minBayt: 180, beklenenBasliklar: [['başlangıç maliyeti', 'başlangıç'], ['opex', 'operasyonel gider', 'başabaş', 'nakit akışı', 'nakit']],
  },
  'gtm-pazarlama': {
    id: 'gtm-pazarlama', etiket: 'Pazara Giriş ve Pazarlama/Reklam Operasyonları',
    hedefAciklama: 'Kanal planı, içerik, lansman. Kanal seçimi operatör onayına sunulmalı; kanal MALİYET varsayımları statülenmeli.',
    iddiaSinifi: ['operator-input', 'source-required'], ustBaglamAnahtarlari: ['strateji'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 1, ekKontrol: null,
    minBayt: 100, beklenenBasliklar: [['kanal']],
  },
  'dijital-varlik-spec': {
    id: 'dijital-varlik-spec', etiket: 'Dijital Varlık SPEC (site/domain/analitik)',
    hedefAciklama: 'Web sitesi, domain, analitik, teknik gereksinimler — YALNIZ SPEC. Hiçbir kod/HTML/config İNŞA ETME; bu belge yalnız sonraki ayrı bir fazın girdisidir.',
    iddiaSinifi: ['operator-input'], ustBaglamAnahtarlari: ['strateji'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 0,
    ekKontrol: 'dijitalVarlikInsaDenylist', // bkz planlamaBolumKapilari.mjs — string olarak referans, döngüsel import yok
    minBayt: 120, beklenenBasliklar: [['web sitesi', 'site', 'domain']],
  },
  'operasyon-plani': {
    id: 'operasyon-plani', etiket: 'Operasyon Planı',
    hedefAciklama: 'Tedarik/üretim/teslimat süreçleri, araçlar. Kritik süreçleri tanımla; dış bağımlılıkları statüle.',
    iddiaSinifi: ['operator-input', 'source-required'], ustBaglamAnahtarlari: ['strateji'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 1, ekKontrol: null,
    minBayt: 100, beklenenBasliklar: [['tedarik']],
  },
  'yasal-uyumluluk': {
    id: 'yasal-uyumluluk', etiket: 'Yasal ve Uyumluluk',
    hedefAciklama: 'Kuruluş, vergi, izinler (projenin yerel bağlamına göre). Zorunlu adımları kaynakla; bilinmeyenleri AÇIKÇA [acik-soru:...] olarak yüzeye çıkar (bu bölümde açık soru bırakmak KABUL EDİLEBİLİR).',
    iddiaSinifi: ['source-required'], ustBaglamAnahtarlari: ['arastirma'],
    // Görev metninin kendi ifadesiyle: "unknowns surfaced as open-questions" — bu bölüm YEREL
    // sıfır-açık ŞARTI TAŞIMAZ (Layer-1 tolerans); nihai Layer-2 yine de global sıfır-açık ister.
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 1, ekKontrol: null,
    // TEK lenient grup (kuruluş/vergi/izin — HERHANGİ biri): bu bölüm zaten en toleranslı olanı
    // (yerel açık-soru kabul edilir) — bilinmeyen bir zorunluluk türü meşru biçimde tamamen
    // açık-soru olarak bırakılabilir, bu yüzden üçünü de ayrı ayrı ZORUNLU KILMAK yanlış-red üretirdi.
    minBayt: 100, beklenenBasliklar: [['kuruluş', 'vergi', 'izin']],
  },
  'risk-varsayimlar': {
    id: 'risk-varsayimlar', etiket: 'Riskler ve Varsayımlar',
    hedefAciklama: 'Riskler ve varsayımlar. HER varsayımı statüle; gizli-varsayım avı yap (üstü kapalı kabul edilmiş ama hiç yazılmamış varsayımları da yüzeye çıkar). Provenans Eki\'ndeki Varsayım Defteri\'ne (skip ile kapatılmış izlenen-varsayımlar) bir CÜMLEYLE gönderme yap — orada listelenen kayıtları burada TEKRARLAMA/KOPYALAMA (tek kaynak orasıdır); blocker-tier olmayan (onemli-tier) izlenen-varsayımların plan riskine etkisi daha yüksektir, bunu belirt.',
    iddiaSinifi: ['synthesis'], ustBaglamAnahtarlari: ['genesis', 'premise', 'arastirma', 'strateji', TUM_BOLUMLER_ISARETI],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 0, ekKontrol: null,
    minBayt: 100, beklenenBasliklar: [['risk', 'tehlike'], ['varsayım']],
  },
  'yol-haritasi': {
    id: 'yol-haritasi', etiket: 'Yol Haritası ve Yapılacaklar (ilk-90-gün)',
    hedefAciklama: 'Fazlar, kilometre taşları, ilk-90-gün planı. İlk 90 günü SOMUT yaz; sıralama mantığını görünür kıl.',
    iddiaSinifi: ['synthesis', 'operator-input'],
    ustBaglamAnahtarlari: ['urun-tanimi', 'is-modeli-fiyatlama', 'butce-finansal', 'gtm-pazarlama', 'dijital-varlik-spec', 'operasyon-plani'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 0, ekKontrol: null,
    minBayt: 100, beklenenBasliklar: [['90 gün', 'ilk 90', 'faz']],
  },
  'olcumleme-kpi': {
    id: 'olcumleme-kpi', etiket: 'Ölçümleme (KPI)',
    hedefAciklama: 'KPI\'lar, başarı kriterleri. Başarı kriterleri operatör onayına sunulmalı.',
    iddiaSinifi: ['operator-input'], ustBaglamAnahtarlari: ['strateji', 'urun-tanimi', 'is-modeli-fiyatlama'],
    iddiaMuaf: false, mekanik: false, sifirAcikGerekli: false, minDogrulandi: 0, ekKontrol: null,
    minBayt: 60, beklenenBasliklar: [['kpi', 'başarı kriteri']],
  },
  'provenans-ek': {
    id: 'provenans-ek', etiket: 'Provenans Eki',
    hedefAciklama: 'Her iddiayı kaynağına/soru-referansına ve statüsüne eşle; açıkça atlanan sorular burada listelenmeli. Bu MEKANİK bir biçimlendirme görevidir — yeni içerik ÜRETME, yalnız verilen bağlamı sadakatle işle.',
    iddiaSinifi: ['mekanik'], ustBaglamAnahtarlari: [TUM_BOLUMLER_ISARETI],
    iddiaMuaf: false, mekanik: true, sifirAcikGerekli: false, minDogrulandi: 0, ekKontrol: null,
    // Bütünlük kontrolü mekanik bölüme UYGULANMAZ (bkz planlamaBolumKapilari.mjs) — kendi
    // provenansKapisi'si (kapsam/coverage) zaten çok daha güçlü bir bütünlük garantisi verir.
    minBayt: 0, beklenenBasliklar: [],
  },
}

// Bir bölüm tanımının kaynak-gerekli olup olmadığı (minDogrulandi>0 VEYA iddiaSinifi'nde
// 'source-required') — testlerde/gate'lerde kullanışlı kısa-yol.
export function kaynakGerekliMi(bolumId) {
  const t = BOLUM_TANIMLARI[bolumId]
  return !!t && (t.minDogrulandi > 0 || t.iddiaSinifi.includes('source-required'))
}
