// Hermetik SORU–YANIT test fikstürleri — repo-içi, Drive'dan BAĞIMSIZ, MODELSİZ.
// Temel aşama fikstürlerini (planlama-test-fikstur) yeniden kullanır; soru üretimini
// tetiklemek için genesis'e GATE-GÜVENLİ bir [tahmin-doğrulanacak:*] iddiası ekler.
// Modül yüklenirken kendi kendini doğrular (gerçek kapı + gerçek üretici) → drift → patlar.

import { kapidanGecerMi } from '../tools/planlamaKapilari.mjs'
import { varsayilanSoruUretici, sorulariDogrula } from '../tools/planlamaSorular.mjs'
import { FIKSTUR } from './planlama-test-fikstur.mjs'

// genesis + GATE-GÜVENLİ bir tahmin iddiası (§4 gövdesine, aynı satırda etiketli sayı →
// çıplak-sayı kapısını GEÇER, ama DATA-REQUEST üretir). Kaynak: 'test-pazar-2024'.
const TAHMIN_SATIRI =
  'Pazar büyüme beklentisi yıllık %18 [tahmin-doğrulanacak:test-pazar-2024] düzeyindedir.'

export const SORULU_GENESIS = FIKSTUR.genesis.replace(
  'Çıktı → Bir sonraki aşama: premise',
  `${TAHMIN_SATIRI}\n\nÇıktı → Bir sonraki aşama: premise`,
)

// premise: değişmeden — soru üreticide CHOICE yok, tahmin yok → yalnız APPROVAL + FREE-TEXT.
export const SORULU_PREMISE = FIKSTUR.premise

export const SORULU = {
  genesis: SORULU_GENESIS,
  premise: SORULU_PREMISE,
  arastirma: FIKSTUR.arastirma,
  strateji: FIKSTUR.strateji,
  'master-plan': FIKSTUR['master-plan'],
}

// ── Kendi kendini doğrula ──────────────────────────────────────────────────────
export function soruFiksturuDogrula() {
  const hatalar = []
  // 1) Tüm fikstürler GERÇEK yapısal kapıdan geçmeli (tahmin eklentisi kapıyı bozmamalı).
  for (const [asama, icerik] of Object.entries(SORULU)) {
    const g = kapidanGecerMi(asama, icerik)
    if (!g.gecti) hatalar.push(`SORULU.${asama} kapıdan GEÇMELİYDİ: ${g.neden}`)
  }
  // 2) genesis üretimi: APPROVAL + CHOICE(öneri-ilk) + DATA-REQUEST + FREE-TEXT taşımalı.
  const pg = varsayilanSoruUretici('genesis', SORULU_GENESIS, { projeId: '_fix', surum: 1 })
  sorulariDogrula(pg)
  const tipler = new Set(pg.sorular.map(s => s.tip))
  for (const t of ['APPROVAL', 'CHOICE', 'DATA-REQUEST', 'FREE-TEXT']) {
    if (!tipler.has(t)) hatalar.push(`SORULU_GENESIS üretimi ${t} taşımalıydı (bulunan: ${[...tipler].join(',')})`)
  }
  const dr = pg.sorular.find(s => s.tip === 'DATA-REQUEST')
  if (dr && dr.anahtar !== 'veri:test-pazar-2024') hatalar.push(`DATA-REQUEST anahtarı beklenen 'veri:test-pazar-2024', olan '${dr.anahtar}'`)
  // 3) premise üretimi: CHOICE/DATA-REQUEST YOK; APPROVAL + FREE-TEXT.
  const pp = varsayilanSoruUretici('premise', SORULU_PREMISE, { projeId: '_fix', surum: 1 })
  if (pp.sorular.some(s => s.tip === 'CHOICE' || s.tip === 'DATA-REQUEST')) {
    hatalar.push('SORULU_PREMISE üretimi CHOICE/DATA-REQUEST üretmemeliydi')
  }
  if (hatalar.length) throw new Error('Soru fikstür drift:\n  ' + hatalar.join('\n  '))
  return true
}
