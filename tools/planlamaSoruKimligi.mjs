// meta-layer-core — Görev 1: soru'ya metinden/tag'ten/extraction-kuralından bağımsız KARARLI
// bir kimlik (`soru_id`). Plan: $META_DATA_ROOT/gorev1-soru-kimligi-plani.md (2026-07-18).
//
// SÖZLEŞME: bu modül HİÇBİR gerçek proje dosyasına YAZMAZ. `defterOku`/`defterYaz` genel
// yardımcılardır (nsYolu parametresiyle HERHANGİ bir yola yazabilir) — GERÇEK proje verisine
// karşı ÇAĞRILMALARI bu görevde YASAK (yalnız izole test/tmp namespace'leri ve salt-okunur kuru-
// çalışma script'i kullanılır, bkz scripts/planlama-cevap-yerini-alma-test.mjs deseni).
//
// İKİ TİP, İKİ FARKLI ATAMA STRATEJİSİ:
//   KİMLİKLİ (kaynak≠null, `tahmin-doğrulanacak`/`acik-soru`): `soru_id` DETERMİNİSTİK olarak
//     `asama+anahtar`den türer — bu tip zaten stabildi (anahtar tag'in KENDİ sabit parametresinden
//     gelir), soru_id yalnız şema-tekliği + imza-geçişi için var, ekstra makine gerekmez.
//   KİMLİKSİZ ([eksik], kaynak=null): `soru_id` KONUM-ÇAPALI bir deftere göre atanır/yeniden-
//     bulunur — extraction KURALI (iddiaCumlesiCikar'ın davranışı) değişse BİLE konum (satirIdx +
//     o satırdaki kaçıncı [eksik] geçişi) ve ham-metin-penceresi (extraction'dan ÖNCEKİ, ham
//     satır metni) DEĞİŞMEZ; bu ikisi extraction-davranışından TAMAMEN bağımsız çapalardır.

import { createHash, randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export const KIMLIK_SEMA = 1

export function kimlikDefteriDosyaAdi(asama, surum) {
  return (surum ?? 0) <= 1 ? `${asama}-kimlik-defteri.json` : `${asama}-kimlik-defteri-v${surum}.json`
}

export function bosDefter(asama, surum) {
  return { sema: KIMLIK_SEMA, asama, surum, kayitlar: [] }
}

export function defterOku(nsYolu, asama, surum) {
  const yol = join(nsYolu, kimlikDefteriDosyaAdi(asama, surum))
  if (!existsSync(yol)) return bosDefter(asama, surum)
  const d = JSON.parse(readFileSync(yol, 'utf8'))
  if (d.sema !== KIMLIK_SEMA) throw new Error(`kimlik-defteri şema uyuşmazlığı: ${yol}`)
  return d
}

// Çağıran BİLEREK karar vermeli NE ZAMAN yazacağına — bu fonksiyon KENDİSİ hiçbir akışın
// PARÇASI olarak otomatik çağrılmaz (bkz soruIdleriAta: SAF, yan-etkisiz).
export function defterYaz(nsYolu, asama, surum, defter) {
  const yol = join(nsYolu, kimlikDefteriDosyaAdi(asama, surum))
  mkdirSync(dirname(yol), { recursive: true })
  writeFileSync(yol, JSON.stringify(defter, null, 2) + '\n', 'utf8')
  return yol
}

export function hamPencereHash(pencere) {
  return createHash('sha256').update(String(pencere ?? '')).digest('hex').slice(0, 16)
}

// KİMLİKLİ tip: deterministik, konum/defter GEREKMEZ (kaynak zaten stabil).
export function kimlikliSoruId(asama, anahtar) {
  return 'sk_' + createHash('sha256').update(`${asama}|${anahtar}`).digest('hex').slice(0, 20)
}

function enGuncelKonum(kayit) {
  return kayit.konum_gecmisi[kayit.konum_gecmisi.length - 1]
}

// Defterde bir konum ARA — birincil: (satirIdx, gecisNo) TAM eşleşme (en yaygın, en güvenilir —
// belge değişmediği sürece HER ZAMAN tutar). İkincil: ham-pencere hash'i (satır KAYMIŞSA — belgeye
// ÜSTTEN satır eklenmiş/silinmişse — konum numarası değişir ama tag'in ETRAFINDAKİ ham metin
// AYNI kalır, bu ikincil çapa onu YİNE bulur).
function defterdeAra(defter, konum, hamHash) {
  for (const kayit of defter.kayitlar) {
    if (!kayit.aktif) continue
    const g = enGuncelKonum(kayit)
    if (g.satirIdx === konum.satirIdx && g.gecisNo === konum.gecisNo) return { kayit, yontem: 'konum' }
  }
  for (const kayit of defter.kayitlar) {
    if (!kayit.aktif) continue
    if (kayit.konum_gecmisi.some(k => k.ham_pencere_hash === hamHash)) return { kayit, yontem: 'ham-pencere' }
  }
  return null
}

// SAF fonksiyon — HİÇBİR dosyaya yazmaz, girdi defterini MUTASYONA UĞRATMAZ (derin kopya döner).
// `adaylar`: tools/planlamaSorular.mjs:dataRequestAdaylari çıktısı (yeniden yazılmadı/taklit
// edilmedi — GERÇEK fonksiyonun çıktısı beklenir, `konum` alanı kimliksiz tip için zaten orada).
export function soruIdleriAta(asama, adaylar, defter) {
  const yeniDefter = JSON.parse(JSON.stringify(defter)) // derin kopya — girdi dokunulmaz
  const ozet = { kimlikli: [], yeni: [], yeniden_kullanilan_konum: [], yeniden_kullanilan_ham_pencere: [] }

  const sonuclar = adaylar.map(aday => {
    if (aday.tip !== 'DATA-REQUEST') return aday
    if (aday.kaynak != null) {
      const soru_id = kimlikliSoruId(asama, aday.anahtar)
      ozet.kimlikli.push(aday.anahtar)
      return { ...aday, soru_id }
    }
    if (!aday.konum) return aday // savunmacı: konum yoksa (beklenmez) dokunma
    const hamHash = hamPencereHash(aday.konum.hamPencere)
    const bulunan = defterdeAra(yeniDefter, aday.konum, hamHash)
    if (bulunan) {
      const { kayit, yontem } = bulunan
      const g = enGuncelKonum(kayit)
      if (g.satirIdx !== aday.konum.satirIdx || g.gecisNo !== aday.konum.gecisNo || g.ham_pencere_hash !== hamHash) {
        // konum KAYMIŞ — defter EK-SADECE güncellenir (eski konum_gecmisi girdisi SİLİNMEZ/
        // ÜZERİNE YAZILMAZ, yeni bir "konum-guncellendi" olayı EKLENİR).
        kayit.konum_gecmisi.push({ satirIdx: aday.konum.satirIdx, gecisNo: aday.konum.gecisNo, ham_pencere_hash: hamHash, zaman: new Date().toISOString(), not: 'konum-guncellendi' })
      }
      ozet[yontem === 'konum' ? 'yeniden_kullanilan_konum' : 'yeniden_kullanilan_ham_pencere'].push({ anahtar: aday.anahtar, soru_id: kayit.soru_id })
      return { ...aday, soru_id: kayit.soru_id }
    }
    const soru_id = 'sk_' + randomUUID()
    yeniDefter.kayitlar.push({
      soru_id, aktif: true,
      konum_gecmisi: [{ satirIdx: aday.konum.satirIdx, gecisNo: aday.konum.gecisNo, ham_pencere_hash: hamHash, zaman: new Date().toISOString(), not: 'ilk-atama' }],
    })
    ozet.yeni.push({ anahtar: aday.anahtar, soru_id })
    return { ...aday, soru_id }
  })

  return { adaylar: sonuclar, defter: yeniDefter, ozet }
}

// GÜVENCE — "ledger'ın kendisi de bozulabilirse bu bir iyileştirme değildir": defter ile
// paket ARASINDA bir UYUŞMAZLIK varsa (paket bir soru_id iddia ediyor ama defterde YOK; ya da
// AYNI konum defterde İKİ FARKLI soru_id'ye ait görünüyor) bu fonksiyon SERT BAŞARISIZLIKLA
// durur — HANGİ TARAFIN doğru olduğuna KARAR VERMEZ (defter mi kazanır, dosya mı — SEÇİLMEZ).
export function kimlikTutarliligiDogrula(paket, defter) {
  const tumSorular = [...(paket.sorular ?? []), ...(paket.ertelenen ?? [])]
  for (const s of tumSorular) {
    if (s.tip !== 'DATA-REQUEST' || !s.soru_id) continue
    if (s.kaynak != null) continue // kimlikli tip deftere bağımlı değil, kontrol dışı
    const kayit = defter.kayitlar.find(k => k.soru_id === s.soru_id)
    if (!kayit) {
      throw new Error(`kimlikTutarliligiDogrula: "${s.anahtar}" soru_id="${s.soru_id}" defterde YOK — dosya/defter UYUŞMUYOR (defter kaybı/bozulması ya da elle-müdahale şüphesi). TARAF SEÇİLMİYOR — durduruldu.`)
    }
    if (s.konum) {
      for (const digerKayit of defter.kayitlar) {
        if (digerKayit.soru_id === s.soru_id) continue
        const g = enGuncelKonum(digerKayit)
        if (g.satirIdx === s.konum.satirIdx && g.gecisNo === s.konum.gecisNo) {
          throw new Error(`kimlikTutarliligiDogrula: konum (satirIdx=${s.konum.satirIdx}, gecisNo=${s.konum.gecisNo}) HEM "${s.soru_id}" (dosyada) HEM "${digerKayit.soru_id}" (defterde, başka kayıt) için geçerli görünüyor — ÇAKIŞMA. TARAF SEÇİLMİYOR — durduruldu.`)
        }
      }
    }
  }
  return { gecerli: true }
}
