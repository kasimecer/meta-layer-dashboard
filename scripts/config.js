// meta-layer-core — veri-kökü config.
// Repo Drive-DIŞINDA çalışır (~/dev/...); VERİ Drive'da KALIR (projeler/*, kanal dosyaları).
// Build script veriyi buradan MUTLAK yolla okur, public/'i repo-içine yazar.
// Yol değişirse TEK yer: aşağıdaki sabit ya da META_DATA_ROOT env değişkeni.
export const META_DATA_ROOT =
  process.env.META_DATA_ROOT ||
  '/Users/kasimecer/Library/CloudStorage/GoogleDrive-kasimecer@gmail.com/My Drive/meta-layer'
