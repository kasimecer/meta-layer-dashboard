// Master-plan BÖLÜM alt-döngüsü. planlamaLoopV2.mjs'nin ileriMod'u, aktif_asama==='master-plan'
// VE opt-in (masterPlanBolumleri) AKTİFKEN, o birimin TÜM yaşam-döngüsünü (bekliyor/kosuyor/
// onay-bekliyor) BURAYA devreder — asla eski (opt-in KAPALI) kapiMasterPlan/ciplakSayiVarMi
// yoluna düşmez (yeni 4-etiket sözlüğü eskisiyle UYUMSUZ olurdu — yanlış-red üretirdi). Opt-in
// KAPALIYKEN bu dosyaya HİÇ girilmez; planlamaLoopV2.mjs'nin eski davranışı birebir korunur.
//
// Bir invokasyon EN ÇOK bir birim (bir bölüm VEYA nihai onay) işler — üst-seviye "bir-koşum-
// bir-karar" sözleşmesi bölüm-seviyesinde de AYNEN geçerlidir (bkz birimKostur).
//
// İKİ-KATMANLI done-when (tier/kapanma modeli — REVİZE):
//   Layer-1 (bölüm-yerel)  — bolumKapidanGecerMi; bazı bölümler (ör. yasal-uyumluluk) yerel
//                            açık-soru'yu TOLERE eder (görev metninin kendi ifadesiyle).
//   Layer-2 (tüm-plan)     — TÜM 15 birim yerel-gecti olduktan SONRA (layer2Kontrol): her
//                            kaynak-gerekli bölümde ≥1 doğrulanmış iddia (değişmedi) + her
//                            bölümde SIFIR açık BLOCKER + aktif-set = 0 (soru-yanıt katmanı
//                            üzerinden — her aday cevaplandı/skip/atildi). ESKİ "her yerde sıfır
//                            açık-soru İÇERİK ETİKETİ" ölçütü KALDIRILDI: bir skip-kapatılmış
//                            iddianın etiketi KASITLI OLARAK acik-soru'da KALIR (izlenen-varsayım
//                            — bkz planlamaIddiaDurumu.mjs closure alanı), bu yüzden o ölçüt
//                            yapısal olarak asla sıfıra inemezdi (bkz meta-kanal.md "Layer-2/
//                            MAX_SORU tension" bulgusu). Yalnız BUNDAN SONRA nihai APPROVAL
//                            sorusu üretilir.

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { bosAsama, statePersist, asamaDosyaAdi, ilerlet, GERCEK_ASAMALAR } from './planlamaDurumMakinesiV2.mjs'
import { birimIlerlet, birimGeriDon, birimBayatMi, birimKostur, birimAcikDurum, birimSorulariUretVeYaz } from './planlamaBirimMotoru.mjs'
import { BOLUM_SIRASI, BOLUM_TANIMLARI, TUM_BOLUMLER_ISARETI } from './planlamaBolumTanimlari.mjs'
import { bolumKapidanGecerMi } from './planlamaBolumKapilari.mjs'
import { iddialariCikar, gercekKaynaklariCikar, iddialariCozumle } from './planlamaIddiaDurumu.mjs'
import { sorulariOku, yanitlariHamOku, yanitButunluk, atlananlar } from './planlamaSorular.mjs'

const MP = 'master-plan'

function readIcerik(yol) {
  if (!yol || !existsSync(yol)) return null
  return readFileSync(yol, 'utf8')
}

function bolumDosyaAdi(bolumId, surum) {
  return (surum ?? 0) <= 1 ? `master-plan--${bolumId}.md` : `master-plan--${bolumId}-v${surum}.md`
}

// bolumler+aktif_bolum'u tazele — İLK BAŞLATMA VE outer --geri sonrası TAM-YENİDEN-BAŞLATMA
// AYNI işlemdir (v1 basitleştirmesi — bkz plan: "intra-section staleness" cuttable).
function bolumleriHazirla(mp) {
  mp.bolumler = {}
  for (const id of BOLUM_SIRASI) mp.bolumler[id] = bosAsama()
  mp.aktif_bolum = BOLUM_SIRASI[0]
}

// Bölüm-yürüyüşü hâlâ AKTİF mi (outer 'kosuyor' aşamasında, section-seviyesi soru-durumu
// geçerli) — planlamaDurumOzeti.mjs'nin acikSoruDurum sarmalayıcısı bunu kullanır.
export function aktifBolumBilgisi(state) {
  const mp = state.asamalar[MP]
  if (!mp || !mp.bolumler || !mp.aktif_bolum) return null
  if (mp.durum === 'onay-bekliyor' || mp.durum === 'gecti') return null // walk bitti; outer'ın kendi sorusu geçerli
  return { bolumId: mp.aktif_bolum, bolumler: mp.bolumler }
}

// Bölüm bağlamını (ustBaglamAnahtarlari) kur — aşama-seviyesi VE bölüm-seviyesi anahtarları
// karışık taşıyabilir; hangi map'te arayacağını GERCEK_ASAMALAR üyeliğine bakarak seçer.
function bolumBaglamlarKur(nsYolu, state, mp, bolumId) {
  const tanim = BOLUM_TANIMLARI[bolumId]
  const b = {}
  const eklenen = new Set()
  const ekle = (id, icerik) => { if (icerik != null && !eklenen.has(id)) { b[id] = icerik; eklenen.add(id) } }
  for (const anahtar of tanim.ustBaglamAnahtarlari) {
    if (anahtar === TUM_BOLUMLER_ISARETI) {
      for (const id of BOLUM_SIRASI) {
        if (id === bolumId || id === 'provenans-ek') continue
        const bs = mp.bolumler[id]
        if (bs?.durum === 'gecti') ekle(id, readIcerik(bs.cikti_pointer))
      }
      continue
    }
    if (GERCEK_ASAMALAR.includes(anahtar)) {
      ekle(anahtar, readIcerik(state.asamalar[anahtar]?.cikti_pointer))
    } else {
      const bs = mp.bolumler[anahtar]
      if (bs?.durum === 'gecti') ekle(anahtar, readIcerik(bs.cikti_pointer))
    }
  }
  if (bolumId === 'provenans-ek') b.__provenansVerisi = provenansVerisiTopla(nsYolu, state, mp)
  return b
}

// 13 asıl bölümün iddiaları + tüm soru-paketlerinin (5 aşama + 15 bölüm) atlanan kayıtları —
// provenans-ekinin HEM prompt-bağlamı HEM DE kendi kapısının coverage-kontrolü için TEK kaynak.
function provenansVerisiTopla(nsYolu, state, mp) {
  const tumIddialar = []
  const tumAtlananlar = []
  for (const id of BOLUM_SIRASI) {
    if (id === 'provenans-ek') continue
    const bs = mp.bolumler[id]
    const icerik = bs?.cikti_pointer ? readIcerik(bs.cikti_pointer) : null
    if (icerik != null) {
      // Efektif çözümleme ile — yanıtlanmış bir açık-soru artık RESOLVED statüsüyle görünür,
      // ham (bayat) "acik-soru" etiketiyle değil.
      tumIddialar.push(...iddialariCozumle(nsYolu, id, bs, iddialariCikar(icerik)).map(i => ({ ...i, bolumId: id })))
    }
    if (bs?.sorular_surum != null) {
      const paket = sorulariOku(nsYolu, id, bs.sorular_surum)
      if (paket) {
        // yanitlariHamOku {durum,ham,dosya} ZARFINI döner — atlananlar düz bir yanıt DİZİSİ
        // bekler. yanitButunluk bu zarfı çözüp doğrular (planlamaBirimMotoru.mjs/
        // planlamaDurumOzeti.mjs'nin ZATEN yaptığı gibi); durum≠'gecerli' ise but.yanitlar
        // undefined kalır, atlananlar bunu (yanitlar||[]) ile boş dizi olarak ele alır.
        const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, id, bs.sorular_surum))
        for (const a of atlananlar(paket, but.yanitlar)) tumAtlananlar.push({ ...a, bolumId: id })
      }
    }
  }
  for (const asama of GERCEK_ASAMALAR) {
    const as = state.asamalar[asama]
    if (as?.sorular_surum != null) {
      const paket = sorulariOku(nsYolu, asama, as.sorular_surum)
      if (paket) {
        const but = yanitButunluk(paket, yanitlariHamOku(nsYolu, asama, as.sorular_surum))
        for (const a of atlananlar(paket, but.yanitlar)) tumAtlananlar.push({ ...a, bolumId: asama })
      }
    }
  }
  return { tumIddialar, tumAtlananlar }
}

// provenans-ek'in İÇERİĞİNİ provenansVerisiTopla'nın çıktısından DETERMİNİSTİK olarak üretir —
// MODEL/executor ÇAĞRISI YOK (bkz bolumWalkAdimAt'ın executorFn dalı: tanim.mekanik olduğunda
// bu render, ctx.executor'ın YERİNE geçer). provenansKapisi (planlamaBolumKapilari.mjs) her
// iddia.param'ı VE her atlanan.anahtar'ı HARFİYEN metinde arar; bu fonksiyon HER kaydı (kaç
// tane olursa olsun) tek tek, mekanik biçimde yazdığı için kapsam İNŞA GEREĞİ %100'dür —
// bir modelin yüzlerce tam dizeyi eksiksiz nesir hâlinde yeniden üretmeye çalışmasından farklı
// olarak, kayıt SAYISIYLA bozulmaz (dizi-üzerinde-döngü + string-birleştirme; dikkat/bağlam
// sınırı yok). Ham `tip:param` (kapsam-kontrolü için harfiyen) VE efektif statü/kaynak (asıl
// okunabilir provenans bilgisi) HER ikisi de yazılır — efektif çözümleme (iddialariCozumle)
// bir açık-sorunun YANITLANDIYSA gerçek statüsünü gösterir, ham etiket ne olursa olsun.
export function provenansEkRenderla(veri) {
  const satirlar = ['# Provenans Eki', '', '## İddialar']
  for (const i of (veri?.tumIddialar ?? [])) {
    const etiket = BOLUM_TANIMLARI[i.bolumId]?.etiket ?? i.bolumId
    const kaynakStr = i.efektifKaynak ? ` — kaynak: \`${i.efektifKaynak}\`` : ''
    // tier/kapanma: graceful varsayılan — hand-rolled/eski test verisi bu alanları taşımasa da
    // (bkz PM testleri) render "undefined" basmaz, sessizce en-güvenli varsayılana düşer.
    const tier = i.tier ?? 'onemli'
    const kapanma = i.closure ?? 'acik'
    satirlar.push(`- **${etiket}** — ham: \`${i.tip}:${i.param}\` → efektif-statü: **${i.efektifTip}**${kaynakStr} — tier: ${tier} — kapanma: ${kapanma}`)
  }
  satirlar.push('', '## Atlanan Sorular')
  for (const a of (veri?.tumAtlananlar ?? [])) {
    const etiket = BOLUM_TANIMLARI[a.bolumId]?.etiket ?? a.bolumId
    satirlar.push(`- **${etiket}** — soru: \`${a.anahtar}\` (tip: ${a.tip}) — gerekçe: ${a.gerekce ?? 'belirtilmedi'}`)
  }
  satirlar.push('', '## Varsayım Defteri (izlenen-varsayımlar — skip ile kapatılmış sorular)')
  const ledger = assumptionLedgerOlustur(veri)
  if (ledger.length === 0) {
    satirlar.push('(izlenen varsayım yok — hiçbir onemli/opsiyonel soru skip ile kapatılmadı)')
  } else {
    for (const kayit of ledger) {
      const deger = kayit.assumedValue ? ` — varsayılan değer: \`${kayit.assumedValue}\`` : ''
      satirlar.push(`- **${kayit.sectionEtiket}** [tier: ${kayit.tier}] — ${kayit.question}${deger} (statü: ${kayit.status})`)
    }
  }
  return satirlar.join('\n') + '\n'
}

// Varsayım defteri — provenansEkRenderla'nın ALDIĞI AYNI tumIddialar verisinin FİLTRELENMİŞ bir
// projeksiyonu (closure === 'skip'). Tek kaynak, kopya toplama-mantığı YOK. Her kayıt bir
// "izlenen-varsayım": operatör bir onemli/opsiyonel iddiayı YANITLAMADAN skip ile kapattı;
// status HER ZAMAN 'acik-soru' kalır (iddialariCozumle bunu asla 'dogrulandi'ya YÜKSELTMEZ —
// bir izlenen-varsayım gerçekten doğrulanmış GİBİ sayılamaz).
export function assumptionLedgerOlustur(veri) {
  return (veri?.tumIddialar ?? [])
    .filter(i => i.closure === 'skip')
    .map(i => ({
      question: i.satir,
      assumedValue: i.varsayilanDeger ?? null,
      tier: i.tier ?? 'onemli',
      section: i.bolumId,
      sectionEtiket: BOLUM_TANIMLARI[i.bolumId]?.etiket ?? i.bolumId,
      status: i.efektifTip,
    }))
}

// Bölüme özel kapı-çağırıcı — HER bölüm için baglam.gercekKaynaklar (grounding) +
// baglam.efektifIddialar (acik-soru → yanıtlanmışsa efektif statü) hesaplar; provenans-ek
// İÇİN ayrıca coverage verisini (tumIddialar/tumAtlananlar) ekler. birimKostur'un 2-argümanlı
// kapiFn(birimId,icerik) çağrısıyla TAM uyumlu kalır — sözleşme genişletilmedi, yalnız baglam
// artık her zaman DOLU (önceden yalnız provenans-ek için doluydu).
function kapiFnKur(nsYolu, state, mp) {
  // Araştırma aşamasının GERÇEK kaynak kümesi — tüm bölüm koşumları için TEK SEFER hesaplanır
  // (içerik değişmez; araştırma zaten 'gecti' olmadan master-plan'a girilemez).
  const arastirmaIcerik = readIcerik(state.asamalar.arastirma?.cikti_pointer)
  const gercekKaynaklar = gercekKaynaklariCikar(arastirmaIcerik)

  return (bolumId, icerik) => {
    const bs = mp.bolumler[bolumId]
    const efektifIddialar = iddialariCozumle(nsYolu, bolumId, bs, iddialariCikar(icerik))
    // İLK-GEÇİŞ (henüz bu birim için sorular_surum YOK): birimKostur bu kapı çağrısını
    // SORU PAKETİ ÜRETİLMEDEN ÖNCE yapar (bkz planlamaBirimMotoru.mjs birimKostur — kapiFn
    // önce, sorulariUretVeYaz SONRA). Bu ANDA henüz hiçbir acik-soru YANITLANAMAMIŞ olabilir —
    // minDogrulandi/sifirAcikGerekli'yi BURADA zorlamak, dürüstçe acik-soru yazan bir bölümü
    // KALICI OLARAK tıkar (soru paketi hiç doğmadan reddedilir → yanıtlanacak bir DATA-REQUEST
    // asla oluşmaz). Bu iki yeterlilik kontrolü, bir soru paketi VAR OLDUKTAN SONRAKİ
    // doğrulamaya (onay-bekliyor re-check / donduruldu-kurtarma sonrası) ERTELENİR — bkz
    // bolumKapidanGecerMi'nin baglam.ilkGecisMi kullanımı.
    const ilkGecisMi = bs?.sorular_surum == null
    const baglam = {
      gercekKaynaklar,
      efektifIddialar,
      ilkGecisMi,
      ...(bolumId === 'provenans-ek' ? provenansVerisiTopla(nsYolu, state, mp) : {}),
    }
    return bolumKapidanGecerMi(bolumId, icerik, baglam)
  }
}

// Onay-noktası (sorular-acik/onay-bekliyor) sonuç-şekli — sonucDonFn'e bölüm bilgisini ekler.
function onayNoktasiDonBolum(bolumId, d, sonucDonFn) {
  return sonucDonFn({
    durdu: d.engelli ? 'sorular-acik' : 'onay-bekliyor',
    bekleyenOnay: bolumId,
    acikSorularListesi: d.acik,
    sorularSurum: d.sorularSurum,
    ertelenenSorular: d.ertelenen,
    butunlukHatasi: d.butunlukHatasi,
  })
}

// Layer-2: tüm 15 birim yerel-gecti OLDUKTAN SONRA çağrılır. 13 asıl bölümün GÜNCEL kabul
// edilmiş içeriğini yeniden-tarar: her kaynak-gerekli bölümde ≥1 doğrulanmış iddia (DEĞİŞMEDİ,
// içerik/claim düzeyinde) + her bölümde sıfır açık BLOCKER + aktif-set=0 (SORU-YANIT katmanı
// üzerinden — birimAcikDurum). Bu, bölüm-yerel toleransların (ör. yasal-uyumluluk) GLOBAL olarak
// hâlâ kapatılması gerektiğini garanti eden nihai kapı — ama artık "hâlâ acik-soru etiketli" ile
// "skip ile kapatılmış (izlenen-varsayım)" arasında AYRIM yapar (bkz closure), ikincisini
// ENGELLEMEZ.
function layer2Kontrol(nsYolu, mp) {
  const eksikler = []
  for (const id of BOLUM_SIRASI) {
    if (id === 'provenans-ek') continue
    const bs = mp.bolumler[id]
    const icerik = bs?.cikti_pointer ? readIcerik(bs.cikti_pointer) : null
    if (icerik == null) { eksikler.push(`${id}: içerik bulunamadı`); continue }
    // minDogrulandi: EFEKTİF statüyle say (DEĞİŞMEDİ) — bir açık-soru bu arada YANITLANMIŞSA
    // (karar=veri/tahmin) artık doğrulanmış/tahmin sayılır (bkz iddialariCozumle). Grounding
    // Layer-1'de zaten uygulandı; burada tekrar edilmiyor.
    const iddialar = iddialariCozumle(nsYolu, id, bs, iddialariCikar(icerik))
    const tanim = BOLUM_TANIMLARI[id]
    if (tanim.minDogrulandi > 0) {
      const n = iddialar.filter(i => i.efektifTip === 'dogrulandi').length
      if (n < tanim.minDogrulandi) eksikler.push(`${id}: yeterli doğrulanmış iddia yok (${n}/${tanim.minDogrulandi})`)
    }
    // active-set + blocker: SORU-YANIT katmanı üzerinden (içerik-etiketi ÜZERİNDEN DEĞİL) —
    // bir skip-kapatılmış claim'in etiketi KASITLI OLARAK acik-soru'da kalır (izlenen-varsayım),
    // içerik-etiketi tek başına "hâlâ dokunulmamış" ile "skip ile kapandı"yı ayırt edemez;
    // birimAcikDurum (closure'a bakan iddialariCozumle'nin AYNI yanıt-okuma yolunu kullanır)
    // bu ayrımı doğru yapar.
    const d = birimAcikDurum(nsYolu, mp.bolumler, id)
    if (d.acikBlokerler.length > 0) {
      eksikler.push(`${id}: ${d.acikBlokerler.length} açık blocker soru hâlâ var`)
    } else if (d.acik.length > 0 || d.acikErtelenen.length > 0) {
      eksikler.push(`${id}: ${d.acik.length + d.acikErtelenen.length} açık (onemli/opsiyonel) soru hâlâ var — aktif-set≠0 (cevapla / skip / at gerekir)`)
    }
  }
  return { gecti: eksikler.length === 0, eksikler }
}

// Layer-2 GEÇTİKTEN sonra: 15 bölümü TEK bileşik dokümanda birleştir, outer surum'u artır,
// nihai (yalnız-APPROVAL) soru paketini üret, outer'ı onay-bekliyor'a al.
function layer2VeSonrasi(nsYolu, projeId, state, ctx) {
  const mp = state.asamalar[MP]
  const sonuc = layer2Kontrol(nsYolu, mp)
  if (!sonuc.gecti) {
    // Otomatik state değişikliği YOK — insan ilgili bölüme --geri yapıp düzeltsin. mp.durum
    // 'kosuyor' KALIR (walk zaten teknik olarak sürüyor, yalnız insan-kararı bekliyor).
    ctx.log(`LAYER-2 BAŞARISIZ (tüm-plan done-when karşılanmadı): ${sonuc.eksikler.join('; ')}`)
    mp.blok_nedeni = `Layer-2: ${sonuc.eksikler.join('; ')}`
    statePersist(nsYolu, state)
    return ctx.sonucDonFn({ durdu: 'donduruldu' })
  }

  const yeniSurum = (mp.surum ?? 0) + 1
  const composedYol = join(nsYolu, asamaDosyaAdi(MP, yeniSurum))
  const composedIcerik = BOLUM_SIRASI
    .map(id => `## ${BOLUM_TANIMLARI[id].etiket}\n\n${readIcerik(mp.bolumler[id].cikti_pointer) ?? ''}`)
    .join('\n\n---\n\n')
  writeFileSync(composedYol, composedIcerik, 'utf8')
  mp.surum = yeniSurum
  mp.cikti_pointer = composedYol
  mp.blok_nedeni = null

  const paket = birimSorulariUretVeYaz(nsYolu, ctx.soruUretici, MP, yeniSurum, composedIcerik, projeId)
  mp.sorular_surum = paket ? yeniSurum : null
  mp.durum = 'onay-bekliyor'
  statePersist(nsYolu, state)
  ctx.log(`LAYER-2 GEÇTİ — nihai master-plan onayı bekleniyor (bileşik sürüm ${yeniSurum})`)

  const d = birimAcikDurum(nsYolu, state.asamalar, MP)
  return onayNoktasiDonBolum(MP, d, ctx.sonucDonFn)
}

// Outer 'onay-bekliyor' işleyicisi — nihai APPROVAL sorusu cevaplandıysa outer'ı gecti yapar
// + ilerlet(state) (planlamaDurumMakinesiV2.mjs'den, DEĞİŞTİRİLMEDİ) → 'tamamlandi'.
function outerOnayIsle(nsYolu, state, ctx) {
  const mp = state.asamalar[MP]
  const d = birimAcikDurum(nsYolu, state.asamalar, MP)
  if (d.engelli) {
    statePersist(nsYolu, state)
    return onayNoktasiDonBolum(MP, d, ctx.sonucDonFn)
  }
  // Bileşik belge zaten her bölümün KENDİ kapısından geçmiş içeriklerin sadık birleşimi;
  // yeniden-doğrulama Layer-2'nin kendisiydi. Onay anında yalnız varlık kontrolü yeterli
  // (el-düzenlemesi olasılığına karşı — bileşik dosyayı elle bozmak alışılmadık bir yol).
  const icerik = readIcerik(mp.cikti_pointer)
  if (icerik == null) {
    mp.durum = 'donduruldu'
    mp.blok_nedeni = 'bileşik master-plan dosyası bulunamadı'
    statePersist(nsYolu, state)
    return ctx.sonucDonFn({ durdu: 'donduruldu' })
  }
  mp.durum = 'gecti'
  mp.kapi_sonuc = 'gecti'
  mp.blok_nedeni = null
  ilerlet(state)
  statePersist(nsYolu, state)
  ctx.log(`ONAY ${MP} -> gecti (TÜM BÖLÜMLER + PROVENANS TAMAMLANDI)`)
  return ctx.sonucDonFn({ durdu: 'tamamlandi' })
}

// Bölüm-seviyesi adım — ileriMod'un while-döngüsünün AYNI ŞEKLİ, BOLUM_SIRASI/bolumler
// üzerinde. Bir invokasyon EN ÇOK bir bölüm koşturur/onaylar (aynı sözleşme, bir kat içeride).
async function bolumWalkAdimAt(nsYolu, projeId, state, ctx) {
  const mp = state.asamalar[MP]
  const kapiFn = kapiFnKur(nsYolu, state, mp)

  while (true) {
    const B = mp.aktif_bolum
    const Bs = mp.bolumler[B]

    if (Bs.durum === 'donduruldu') {
      const icerik = readIcerik(Bs.cikti_pointer)
      const g = icerik == null
        ? { gecti: false, neden: `çıktı dosyası bulunamadı: ${Bs.cikti_pointer ?? 'yok'}` }
        : kapiFn(B, icerik)
      if (g.gecti) {
        Bs.durum = 'onay-bekliyor'; Bs.kapi_sonuc = 'gecti'; Bs.blok_nedeni = null
        const paket = birimSorulariUretVeYaz(nsYolu, ctx.soruUretici, B, Bs.surum ?? 1, icerik, projeId)
        Bs.sorular_surum = paket ? (Bs.surum ?? 1) : null
        statePersist(nsYolu, state)
        const d = birimAcikDurum(nsYolu, mp.bolumler, B)
        ctx.log(`KURTARMA ${B} -> bölüm kapısı yeniden GEÇTİ; ${d.engelli ? 'SORULAR AÇIK' : 'ONAY BEKLİYOR'}`)
        return onayNoktasiDonBolum(B, d, ctx.sonucDonFn)
      }
      Bs.blok_nedeni = g.neden
      statePersist(nsYolu, state)
      ctx.log(`BLOKE ${B} — ${g.neden}`)
      return ctx.sonucDonFn({ durdu: 'donduruldu' })
    }

    if (Bs.durum === 'onay-bekliyor') {
      // Bayat kontrolü ÖNCE (tier modeli — bkz planlamaLoopV2.mjs'deki AYNI düzeltme + birimBayatMi
      // üstündeki not): bu bölüm 'gecti' olmadan ÖNCE üstü --geri ile yeni sürüme geçmiş olabilir.
      if (birimBayatMi(BOLUM_SIRASI, mp.bolumler, B)) {
        return ctx.sonucDonFn({ durdu: 'bayat-karar', bayatAsama: B })
      }
      const d = birimAcikDurum(nsYolu, mp.bolumler, B)
      if (d.engelli) {
        statePersist(nsYolu, state)
        return onayNoktasiDonBolum(B, d, ctx.sonucDonFn)
      }
      const icerik = readIcerik(Bs.cikti_pointer)
      const g = icerik == null
        ? { gecti: false, neden: `çıktı dosyası bulunamadı: ${Bs.cikti_pointer ?? 'yok'}` }
        : kapiFn(B, icerik)
      if (!g.gecti) {
        Bs.durum = 'donduruldu'; Bs.kapi_sonuc = 'reddedildi'; Bs.blok_nedeni = g.neden
        statePersist(nsYolu, state)
        ctx.log(`ONAY REDDİ ${B} -> donduruldu (el-düzenlemesi kapıyı bozdu: ${g.neden})`)
        return ctx.sonucDonFn({ durdu: 'donduruldu' })
      }
      Bs.durum = 'gecti'; Bs.kapi_sonuc = 'gecti'; Bs.blok_nedeni = null

      if (B === BOLUM_SIRASI[BOLUM_SIRASI.length - 1]) {
        statePersist(nsYolu, state)
        ctx.log(`ONAY ${B} -> gecti (SON BÖLÜM); Layer-2 kontrolü çalıştırılıyor`)
        return layer2VeSonrasi(nsYolu, projeId, state, ctx)
      }
      birimIlerlet(BOLUM_SIRASI, mp, 'aktif_bolum')
      statePersist(nsYolu, state)
      ctx.log(`ONAY ${B} -> gecti; ilerleniyor`)
      continue
    }

    if (Bs.durum === 'gecti') {
      if (birimBayatMi(BOLUM_SIRASI, mp.bolumler, B)) {
        return ctx.sonucDonFn({ durdu: 'bayat-karar', bayatAsama: B })
      }
      if (B === BOLUM_SIRASI[BOLUM_SIRASI.length - 1]) {
        return layer2VeSonrasi(nsYolu, projeId, state, ctx)
      }
      birimIlerlet(BOLUM_SIRASI, mp, 'aktif_bolum')
      statePersist(nsYolu, state)
      continue
    }

    if (Bs.durum === 'bekliyor' || Bs.durum === 'kosuyor') {
      const baglamlar = bolumBaglamlarKur(nsYolu, state, mp, B)
      return await birimKostur(B, {
        sira: BOLUM_SIRASI, birimler: mp.bolumler, nsYolu, projeId,
        dosyaAdiFn: bolumDosyaAdi,
        kapiFn,
        // tanim.mekanik (yalnız provenans-ek) İÇİN model/executor HİÇ ÇAĞRILMAZ — içerik
        // provenansEkRenderla ile __provenansVerisi'nden DETERMİNİSTİK üretilir (kapsam İNŞA
        // GEREĞİ %100). Diğer 14 birim (14 asıl bölüm) bu dalın DIŞINDA kalır — ctx.executor
        // (gerçek model çağrısı) o birimler için HİÇ DEĞİŞMEDEN aynen çalışır.
        executorFn: BOLUM_TANIMLARI[B].mekanik
          ? async (bolumId, opts) => {
              const icerik = provenansEkRenderla(opts.baglamlar.__provenansVerisi)
              writeFileSync(opts.hedefDosya, icerik, 'utf8')
              return { icerik, cikti_pointer: opts.hedefDosya, maliyet_usd: 0, sure_ms: 0 }
            }
          : (bolumId, opts) => ctx.executor(bolumId, { ...opts, bolumTanim: BOLUM_TANIMLARI[bolumId] }),
        soruUretici: ctx.soruUretici, baglamlar, log: ctx.log, maliyet: ctx.maliyet,
        executorSayaci: ctx.executorSayaci, kostuTutucu: ctx.kostuTutucu,
        statePersistFn: () => statePersist(nsYolu, state),
        sonucDonFn: ctx.sonucDonFn,
        // onSonBirimTamamlandi KASITLI OLARAK verilmiyor — provenans-ek DAHİL her bölüm normal
        // onay-bekliyor duraklamasından geçer (insan inceleyebilsin); "son birim" özel-durumu
        // yalnız ONAY anında (yukarıda) ele alınır, yürütme anında DEĞİL.
      })
    }

    throw new Error(`bolumLoop: bilinmeyen bölüm durumu "${Bs.durum}" (bölüm ${B})`)
  }
}

/**
 * Master-plan biriminin TÜM yaşam-döngüsünü işler (opt-in aktifken planlamaLoopV2.mjs'nin
 * ileriMod'unun 'master-plan' için TEK çağrı noktası). ctx: { executor, log, maliyet,
 * executorSayaci, kostuTutucu, soruUretici, sonucDonFn }.
 */
export async function bolumLoopCalistir(nsYolu, projeId, state, ctx) {
  const mp = state.asamalar[MP]

  if (mp.durum === 'bekliyor') {
    bolumleriHazirla(mp) // ilk başlatma VEYA outer --geri sonrası tam-yeniden-başlatma
    mp.durum = 'kosuyor'
    statePersist(nsYolu, state)
  }

  if (mp.durum === 'onay-bekliyor') {
    return outerOnayIsle(nsYolu, state, ctx)
  }

  return bolumWalkAdimAt(nsYolu, projeId, state, ctx)
}

// SIHHATLİ bölüm geri-dönüşü — geriAsamaya ile AYNI birimGeriDon çekirdeğini kullanır.
// Konteyner (outer master-plan birimi) walk'a GERİ döner: onay-bekliyor/gecti'ydiyse
// kosuyor'a resetlenir (bir sonraki invokasyon walk'ı doğru yerden sürdürsün); pipeline
// tamamlanmıştıysa (aktif_asama='tamamlandi') master-plan'a geri alınır.
export function bolumeGeriDon(state, hedefBolumId) {
  const mp = state.asamalar[MP]
  if (!mp.bolumler || !mp.aktif_bolum) {
    throw new Error(`geri reddedildi: master-plan bölüm-yürüyüşü henüz başlamadı`)
  }
  birimGeriDon(BOLUM_SIRASI, mp.bolumler, mp, 'aktif_bolum', hedefBolumId)
  mp.durum = 'kosuyor'
  mp.kapi_sonuc = null
  mp.blok_nedeni = null
  if (state.aktif_asama === 'tamamlandi') state.aktif_asama = MP
  return state
}
