// meta-layer-core — kelime-sınırı FARKINDA metin kırpma. Framework-bağımsız (node + tarayıcı) —
// tools/*.mjs (Node) VE src/ (Vite/tarayıcı) tarafından PAYLAŞILIR.
//
// 2026-07-18 (Priority 2a/2b): iki AYRI yerde (planlama soru metni; registry.json'un portföy
// "ozet" alanı) aynı desen tekrarlanıyordu — sabit karakter sayısında `.slice()`, kelime sınırı
// FARKINDALIĞI yok, ikisi de kelimenin ortasında kesip biteni sanki tam cümleymiş gibi
// sunuyordu (canlı-vakalar: "...dijital albüm s" / "...Ücret 50-100 s"). TEK kök neden, TEK
// paylaşılan düzeltme.
//
// @param {string} metin
// @param {number} maxUzunluk
// @returns {string} — metin maxUzunluk'u aşmıyorsa DEĞİŞMEDEN; aşıyorsa SON boşluktan kesilip
//   "…" eklenir (kelimenin ortasında ASLA kesmez — maxUzunluk öncesinde hiç boşluk yoksa, son
//   çare olarak sert kesim yapılır, ki bu yalnız tek-kelime/ayraçsız patolojik girdilerde olur).
export function kelimeSiniriKirp(metin, maxUzunluk) {
  const s = String(metin ?? '')
  if (s.length <= maxUzunluk) return s
  const kesim = s.slice(0, maxUzunluk)
  const sonBosluk = kesim.lastIndexOf(' ')
  return (sonBosluk > 0 ? kesim.slice(0, sonBosluk) : kesim).trimEnd() + '…'
}
