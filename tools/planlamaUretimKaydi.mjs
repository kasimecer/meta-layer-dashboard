// meta-layer-core — Üretim kaydı + taşıma-defteri mekanizması.
//
// SORUN (bkz docs/OPERATOR_ARTIFACT_SURVEY.md §2, §4): birimSorulariUretVeYaz her yeniden-
// üretimde ÖNCÜL soru paketinin İÇERİĞİNİ hiç okumaz — yalnız önceki YANITLARI, anahtar
// dize-eşitliğiyle on_dolgu için okur. Hangi kod sürümünün hangi öncül paketten bu yeni paketi
// türettiği hiçbir yerde kayıtlı değildi; öncüldeki bir kayıt yeni sette kaybolursa (extraction
// kuralı değiştiği için) bu SESSİZCE olurdu.
//
// Bu modül İKİ ayrı ama TEK üretim-kaydı altında birleşen tüketici için:
//   (1) tazelik-kontrolü — bu paket şu anki kod sürümüyle mi üretildi?
//   (2) taşıma            — öncül paketteki HER kayıt (yanıtlı/atlanmış/dokunulmamış fark etmeksizin)
//                            yeni pakete karşı sınıflandırılır; sessizce hiçbir kayıt kaybolmaz.
//
// SÖZLEŞME:
//  - Bu modül HİÇBİR gerçek proje dosyasına kendiliğinden yazmaz (yalnız açıkça verilen bir
//    nsYolu'ya yazan yardımcılar — çağıran karar verir NEREYE, tools/planlamaSoruKimligi.mjs'teki
//    defterYaz deseniyle AYNI disiplin).
//  - imzaHesapla (tools/planlamaSorular.mjs) BU MODÜLDE GENİŞLETİLMEZ/DEĞİŞTİRİLMEZ. `uretim_kaydi`
//    paketin İMZA KAPSAMI DIŞINDA yeni bir üst-seviye alandır (imzaHesapla yalnız paket.sorular
//    dizisini okur) — eklenmesi mevcut hiçbir imzayı geçersiz kılmaz, hiçbir tüketiciyi bozmaz.
//  - KİMLİK KURALI (taşıma sınıflandırması): YALNIZ birebir `anahtar` dize eşitliği. Prefix/slug/
//    benzerlik eşleşmesi KİMLİK SAYILMAZ (bkz survey §5 — soru_id'nin kimlikli-tip dalı da zaten
//    anahtar'ın kendisinden türer, daha güçlü bir kimlik DEĞİLDİR).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execFileSync } from 'child_process'

export const URETIM_KAYDI_SEMA = 1
export const TASIMA_DEFTERI_SEMA = 1

// Bu dosyanın bulunduğu repo kökü (tools/ tam bir alt-dizin) — kodSurumuBilgisiOku'nun
// varsayılan cwd'si. scripts/planlama-provenans-ek-sanctioned-regen.mjs'deki AYNI hesaplama
// (orada scripts/'den, burada tools/'dan — ikisi de repo köküne BİR seviye).
const REPO_KOKU = new URL('..', import.meta.url).pathname

// Üretim-kaydının kod_surumu/kod_kirli alanları İÇİN tek kaynak — HER production-yazan çağıran
// (birimSorulariUretVeYaz) AYNI git sorgusunu tekrar İCAT ETMESİN diye burada. Modelsiz, saf git
// çağrısı; hiçbir dosyaya yazmaz (SÖZLEŞME'yi ihlal etmez).
export function kodSurumuBilgisiOku(repoKoku = REPO_KOKU) {
  const kodSurumu = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoKoku, encoding: 'utf8' }).trim()
  const kirliCikti = execFileSync('git', ['status', '--porcelain'], { cwd: repoKoku, encoding: 'utf8' }).trim()
  return { kodSurumu, kodKirli: kirliCikti.length > 0 }
}

// ── (a) Üretim kaydı ────────────────────────────────────────────────────────────────────────
// TEK obje — generator sürümü (kod_surumu + paket_sema) + öncül referansı (onceki) BİRLİKTE.
// İki ayrı mekanizma İCAT EDİLMEZ: her iki tüketici de bu tek objeyi okur.
export function uretimKaydiOlustur({ kodSurumu, kodKirli = false, paketSema, onceki = null }) {
  if (!kodSurumu || typeof kodSurumu !== 'string') {
    throw new Error('uretimKaydiOlustur: kodSurumu zorunlu (git rev-parse HEAD çıktısı)')
  }
  if (!Number.isInteger(paketSema)) {
    throw new Error('uretimKaydiOlustur: paketSema zorunlu (tamsayı — paket.sema ile aynı)')
  }
  if (onceki != null && (!onceki.dosya || !Number.isInteger(onceki.surum))) {
    throw new Error('uretimKaydiOlustur: onceki verilirse {dosya, surum} tam olmalı')
  }
  return {
    sema: URETIM_KAYDI_SEMA,
    kod_surumu: kodSurumu,
    kod_kirli: !!kodKirli, // true ⟺ üretim anında çalışma ağacında commit'lenmemiş değişiklik vardı
    paket_sema: paketSema,
    onceki: onceki ? { dosya: onceki.dosya, surum: onceki.surum } : null,
  }
}

// Tazelik-kontrolü tüketicisi — bu paket ŞU ANKİ kod sürümüyle mi üretildi? Zorlamaz/otomatik
// yeniden-üretim TETİKLEMEZ, yalnız bilgi döner (çağıran — CLI/panel — nasıl göstereceğine karar verir).
export function kodSurumuGuncelMi(paket, mevcutKodSurumu) {
  const uk = paket?.uretim_kaydi
  if (!uk) {
    return { bilinir: false, guncel: null, neden: 'paket üretim-kaydı taşımıyor (mekanizma-öncesi paket)' }
  }
  return { bilinir: true, guncel: uk.kod_surumu === mevcutKodSurumu, kayitli: uk.kod_surumu, mevcut: mevcutKodSurumu }
}

// ── (b) Taşıma sınıflandırması — SAF fonksiyon, hiçbir dosyaya yazmaz ──────────────────────
// oncekiTumKayitlar : [...oncekiPaket.sorular, ...oncekiPaket.ertelenen] — öncül setin TAMAMI
// oncekiYanitlar    : oncekiYanitHam?.yanitlar ?? [] (ham okuma çağıranın işi — yanitlariHamOku)
// yeniTumKayitlar   : [...yeniPaket.sorular, ...yeniPaket.ertelenen] — yeni setin TAMAMI
//
// SONEK-PATLAMASI TESPİTİ (yalnız bir AÇIKLAMA/neden etiketi — sınıflandırmayı DEĞİŞTİRMEZ):
// bir öncül anahtar `-N` (sayısal) sonekiyle bitiyor VE (a) kökü (sonek atılmış hâli) yeni sette
// TAM olarak var VE (b) öncül settE AYNI köke düşen BAŞKA bir kayıt da varsa (gerçek bir sonek-
// grubu — yalnız kendisi değil), bu 2026-07-17 dedup hatasının bilinen imzasıdır (bkz survey §4).
// KRİTİK: kök yeni sette olsa bile öncül settE tek başınaysa (grup boyu 1) sonek-patlaması
// SAYILMAZ — aksi hâlde "-2024" gibi gerçek bir kaynak-parametresi soneki (yıl), sayısal olduğu
// İÇİN yanlışlıkla dedup-sayacı sonekiyle karıştırılırdı (bu modülün ilk taslağında YAKALANAN
// gerçek bir yanlış-pozitif — testte regresyon olarak kilitlendi, bkz test-runner).
export function tasimaSiniflandirmasiYap(oncekiTumKayitlar, oncekiYanitlar, yeniTumKayitlar) {
  const yeniHarita = new Map(yeniTumKayitlar.map(s => [s.anahtar, s]))
  const yanitHarita = new Map((oncekiYanitlar ?? []).map(e => [e.anahtar, e]))

  const kokSayaci = new Map()
  for (const s of oncekiTumKayitlar) {
    const kok = s.anahtar.replace(/-[0-9]+$/, '')
    kokSayaci.set(kok, (kokSayaci.get(kok) ?? 0) + 1)
  }

  const carried = [], carried_with_text_drift = [], unmatched_stamped = []
  for (const eski of oncekiTumKayitlar) {
    const yeni = yeniHarita.get(eski.anahtar) // BİREBİR dize eşitliği — tek kimlik kuralı
    const yanit = yanitHarita.get(eski.anahtar) ?? null

    if (!yeni) {
      const kok = eski.anahtar.replace(/-[0-9]+$/, '')
      const sonekVarMi = kok !== eski.anahtar
      const grupBoyu = kokSayaci.get(kok) ?? 1
      const sonekPatlamasiMi = sonekVarMi && grupBoyu > 1 && yeniHarita.has(kok)
      unmatched_stamped.push({
        anahtar: eski.anahtar, tip: eski.tip, eski_iddia: eski.iddia ?? null,
        yanit_vardi: !!yanit, yanit: yanit ?? null,
        neden: sonekPatlamasiMi ? 'sonek-patlamasi-eski-hata' : null,
        belirsiz: !sonekPatlamasiMi,
      })
      continue
    }

    const metinKaydi = eski.iddia !== undefined && yeni.iddia !== undefined && eski.iddia !== yeni.iddia
    if (metinKaydi) {
      carried_with_text_drift.push({
        anahtar: eski.anahtar, tip: eski.tip,
        eski_iddia: eski.iddia, yeni_iddia: yeni.iddia,
        yanit_vardi: !!yanit, yanit: yanit ?? null,
      })
    } else {
      carried.push({
        anahtar: eski.anahtar, tip: eski.tip,
        yanit_vardi: !!yanit, yanit: yanit ?? null,
      })
    }
  }
  return { carried, carried_with_text_drift, unmatched_stamped }
}

// ── Taşıma defteri — persist edilen artefakt ───────────────────────────────────────────────
export function tasimaDefteriDosyaAdi(asama, surum) {
  return `${asama}-tasima-defteri-v${surum}.json`
}

export function tasimaDefteriKur({ projeId, asama, surum, onceki, siniflandirma }) {
  const ozet = {
    carried: siniflandirma.carried.length,
    carried_with_text_drift: siniflandirma.carried_with_text_drift.length,
    unmatched_stamped: siniflandirma.unmatched_stamped.length,
  }
  ozet.toplam = ozet.carried + ozet.carried_with_text_drift + ozet.unmatched_stamped
  // Karar-taşıyan (yanit_vardi=true) kayıtların NEREYE düştüğü — "sessizce yetim kaldı" olup
  // olmadığının TEK, doğrudan sayaç. >0 ise Done-when gereği YÜKSEK SESLE raporlanmalı.
  ozet.karar_tasindi = siniflandirma.carried.filter(c => c.yanit_vardi).length
    + siniflandirma.carried_with_text_drift.filter(c => c.yanit_vardi).length
  ozet.karar_yetim_kaldi = siniflandirma.unmatched_stamped.filter(c => c.yanit_vardi).length
  return {
    sema: TASIMA_DEFTERI_SEMA,
    proje_id: projeId,
    asama,
    surum,
    onceki,
    olusturma: new Date().toISOString(),
    ozet,
    siniflandirma,
  }
}

export function tasimaDefteriYaz(nsYolu, defter) {
  const dosya = join(nsYolu, tasimaDefteriDosyaAdi(defter.asama, defter.surum))
  mkdirSync(dirname(dosya), { recursive: true })
  writeFileSync(dosya, JSON.stringify(defter, null, 2) + '\n', 'utf8')
  return dosya
}

export function tasimaDefteriOku(nsYolu, asama, surum) {
  const dosya = join(nsYolu, tasimaDefteriDosyaAdi(asama, surum))
  if (!existsSync(dosya)) return null
  return JSON.parse(readFileSync(dosya, 'utf8'))
}

// ── Uçtan uca (SAF hesaplama + AÇIKÇA verilen yollara yazma) ───────────────────────────────
// Çağıran şunları AÇIKÇA verir — hiçbir geriye-tarama/otomatik-öncül-bulma YAPILMAZ (mevcut
// enSonYanitliOncekiSurum'un AKSİNE): oncekiPaket, oncekiYanitlar (dizi), yeniPaket (zaten
// üretilmiş — bu fonksiyon soru ÜRETMEZ, yalnız üretim-kaydını ekler + sınıflandırır + yazar).
export function paketiUretimKaydiIleTamamlaVeTasi({
  nsYolu, projeId, asama, oncekiDosyaAdi, oncekiSurum, oncekiPaket, oncekiYanitlar,
  yeniPaket, kodSurumu, kodKirli,
}) {
  const tumOnceki = [...oncekiPaket.sorular, ...(oncekiPaket.ertelenen ?? [])]
  const tumYeni = [...yeniPaket.sorular, ...(yeniPaket.ertelenen ?? [])]
  const siniflandirma = tasimaSiniflandirmasiYap(tumOnceki, oncekiYanitlar, tumYeni)

  const onceki = { dosya: oncekiDosyaAdi, surum: oncekiSurum }
  const paketImzaliUretimKaydiIle = {
    ...yeniPaket,
    uretim_kaydi: uretimKaydiOlustur({ kodSurumu, kodKirli, paketSema: yeniPaket.sema, onceki }),
  }
  const defter = tasimaDefteriKur({ projeId, asama, surum: yeniPaket.surum, onceki, siniflandirma })

  return { paket: paketImzaliUretimKaydiIle, defter, siniflandirma }
}
