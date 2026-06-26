// meta-layer-core SLICE 1 doğrulama — durum-makinesi + yazma-yolu (saf, React'siz, node ile koşar).
// `node scripts/verify-slice1.mjs` → PASS/FAIL. Drive'da çalışır (exec-bit gerekmez).
import {
  AKIS, baslangicDurum, sonrakiDurum, gecisGecerliMi, gecisUygula,
} from '../src/lib/stateMachine.js'
import { submitPartnerInput } from '../src/lib/writePath.js'

let gecti = 0, kaldi = 0
function ok(ad, kosul) {
  if (kosul) { gecti++; console.log('  ✓', ad) }
  else { kaldi++; console.log('  ✗', ad) }
}

console.log('== Durum-makinesi v1 ==')
ok('ilerleme statik (yalnız bitti)', JSON.stringify(AKIS['ilerleme']) === '["bitti"]')
ok('girdi-talebi başlangıç = cevap-bekliyor', baslangicDurum('girdi-talebi') === 'cevap-bekliyor')
ok('girdi-talebi: cevap-bekliyor → cevaplandi', sonrakiDurum('girdi-talebi', 'cevap-bekliyor') === 'cevaplandi')
ok('girdi-talebi: cevaplandi son (ileri yok)', sonrakiDurum('girdi-talebi', 'cevaplandi') === null)
ok('build-task tam akış: yapılacak→yapılıyor→bitti',
  sonrakiDurum('build-task', 'yapilacak') === 'yapiliyor' && sonrakiDurum('build-task', 'yapiliyor') === 'bitti')
ok('feedback: acik → ele-alindi', sonrakiDurum('feedback', 'acik') === 'ele-alindi')
ok('tek-yön: geri geçiş reddedilir', !gecisGecerliMi('build-task', 'yapiliyor', 'yapilacak'))
ok('atlama reddedilir (yapılacak→bitti)', !gecisGecerliMi('build-task', 'yapilacak', 'bitti'))
let atti = false
try { gecisUygula({ tip: 'girdi-talebi', durum: 'cevaplandi' }, 'cevap-bekliyor') } catch { atti = true }
ok('geçersiz geçiş hata fırlatır', atti)

console.log('== Yazma-yolu (mock) — placeholder A1–A4 (SİMÜLASYON, gerçek Barış cevabı değil) ==')
const SIM = [
  { id: 'baris-k12', ozet: 'Firmana bir isim seç',                 cevap: 'Hemrena Göteborg' },
  { id: 'baris-k13', ozet: 'Hangi makineyle başlıyorsun?',         cevap: 'begagnad (ikinci el) makine' },
  { id: 'baris-k14', ozet: 'En düşük iş ~999 kr — yetiyor mu?',     cevap: 'marj OK, yeterli' },
  { id: 'baris-k15', ozet: 'Başlangıç fiyat listesini onayla',     cevap: 'parite liste onaylandı' },
]
for (const s of SIM) {
  const kart = {
    id: s.id, tip: 'girdi-talebi', durum: 'cevap-bekliyor',
    ozet: s.ozet, detay: '', partner_cevap: null,
    olusturma: '2026-06-26', guncelleme: '2026-06-26',
  }
  const r = await submitPartnerInput({ projeId: 'baris', kart, cevap: s.cevap })
  ok(`${s.id}: cevap-bekliyor→cevaplandi + partner_cevap`,
    r.ok && r.kart.durum === 'cevaplandi' && r.kart.partner_cevap === s.cevap)
  ok(`${s.id}: inbox.md satırı üretildi`, r.ok && r.inboxSatiri.includes(s.cevap) && r.inboxSatiri.includes(s.id))
  if (r.ok) console.log('     inbox →', r.inboxSatiri)
}
ok('boş cevap reddedilir',
  !(await submitPartnerInput({ projeId: 'baris', kart: { id: 'x', tip: 'girdi-talebi', durum: 'cevap-bekliyor', ozet: '' }, cevap: '   ' })).ok)
ok('yanlış tip reddedilir (ilerleme)',
  !(await submitPartnerInput({ projeId: 'baris', kart: { id: 'y', tip: 'ilerleme', durum: 'bitti', ozet: '' }, cevap: 'x' })).ok)

console.log(`\nSONUÇ: ${gecti} geçti, ${kaldi} kaldı`)
process.exit(kaldi === 0 ? 0 : 1)
