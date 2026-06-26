// meta-layer-core — Proje registry yardımcıları (PROJE-seviyesi; kart-seviyesinden AYRI).
// Portföy = projeler-arası denge + zaman-bazlı sıralama (KK-48 v1).
// efor/deger = MANUEL etiket; skor formülü YOK (ayrı açık-madde).

/**
 * @typedef {Object} Proje  — Registry şeması v1
 * @property {string}  id
 * @property {string}  ad
 * @property {'fikir'|'araştırma'|'premise'|'plan'|'build-onayı'|'inşa'|'canlı'} durum
 * @property {'solo'|'uzman-ortak'|'eş-ortak'|'ortak-tek'} rol
 * @property {'aktif'|'duraklı'} status
 * @property {'düşük'|'orta'|'yüksek'|'?'} efor
 * @property {'düşük'|'orta'|'yüksek'|'?'} deger
 * @property {?string} zaman_son_aktivite
 * @property {string}  ozet
 */

// Yaşam-döngüsü sırası (sol→sağ ilerleme).
export const DURUM_YASAM = ['fikir', 'araştırma', 'premise', 'plan', 'build-onayı', 'inşa', 'canlı']

export const DURUM_RENK = {
  'fikir':       { bg: '#f1f5f9', fg: '#475569' },
  'araştırma':   { bg: '#dbeafe', fg: '#1d4ed8' },
  'premise':     { bg: '#e0e7ff', fg: '#4338ca' },
  'plan':        { bg: '#fef9c3', fg: '#854d0e' },
  'build-onayı': { bg: '#fed7aa', fg: '#9a3412' },
  'inşa':        { bg: '#dcfce7', fg: '#166534' },
  'canlı':       { bg: '#bbf7d0', fg: '#15803d' },
}

export const ETIKET_RENK = {
  'düşük':  { bg: '#f1f5f9', fg: '#64748b' },
  'orta':   { bg: '#fef9c3', fg: '#854d0e' },
  'yüksek': { bg: '#fed7aa', fg: '#9a3412' },
  '?':      { bg: '#f1f5f9', fg: '#94a3b8' },
}

export function durumSira(durum) {
  const i = DURUM_YASAM.indexOf(durum)
  return i < 0 ? -1 : i
}

// Basit v1 sıralama (KK-48 v1):
//   'durum'    → yaşam-döngüsünde ileri olan üstte; eşitlikte aktif önce
//   'aktivite' → en yeni son-aktivite üstte (null en altta)
export function sirala(projeler, mod) {
  const x = [...projeler]
  if (mod === 'aktivite') {
    x.sort((a, b) => (b.zaman_son_aktivite || '').localeCompare(a.zaman_son_aktivite || ''))
  } else {
    x.sort((a, b) => {
      const d = durumSira(b.durum) - durumSira(a.durum)
      if (d !== 0) return d
      return (a.status === 'duraklı' ? 1 : 0) - (b.status === 'duraklı' ? 1 : 0)
    })
  }
  return x
}
