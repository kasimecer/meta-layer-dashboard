// meta-layer-core — KANIT (üretim koduna doğrudan çağrı, MODEL ÇAĞRISI YOK): intake.md'nin
// tam içeriğinin, GERÇEK projelerin GERÇEK dosyalarından, fiilen gönderilecek prompt string'ine
// karakter-karakter ulaştığını gösterir. Reimplement YOK — promptUret/promptUretBolum/
// bolumBaglamlarKur BİREBİR üretimde kullanılan (import edilen, kopyalanmayan) fonksiyonlardır.
//
// Kapsam:
//   1) genesis prompt ailesi  — proje: goteborg-hjarta-fotograf-2026-07-18 (yalnız genesis
//      koştu; baglamlar.intake tek girdi — chicken-egg yok, tam o anki durumu yansıtır).
//   2) master-plan BÖLÜM prompt ailesi — proje: i-svec-te-reklam-ajansi-2026-07-04 (tüm 14
//      bölüm zaten 'gecti' — GERÇEK yukarı-akış dosyalarıyla tam bağlam kurulabiliyor;
//      goteborg henüz master-plan'a ulaşmadığı için bu proof için KULLANILMADI — bkz rapor).
//
// Koşum: node scripts/planlama-prompt-intake-proof.mjs
// Çıkışı meta-kanal.md'ye elle eklenir (bu script yalnız RAPOR üretir, dosyaya yazmaz).

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { META_DATA_ROOT } from './config.js'
import { promptUret, promptUretBolum } from '../tools/canliExecutor.mjs'
import { stateYukle } from '../tools/planlamaDurumMakinesiV2.mjs'
import { bolumBaglamlarKur } from '../tools/planlamaBolumLoop.mjs'
import { BOLUM_TANIMLARI } from '../tools/planlamaBolumTanimlari.mjs'

function projeKaydiOku(id) {
  const registry = JSON.parse(readFileSync(join(META_DATA_ROOT, 'projeler', 'registry.json'), 'utf8'))
  const kayit = registry.projeler.find(p => p.id === id)
  if (!kayit) throw new Error(`registry.json'da bulunamadı: ${id}`)
  return kayit
}

function bayt(s) { return Buffer.byteLength(s, 'utf8') }

console.log('='.repeat(78))
console.log('1) GENESIS PROMPT AİLESİ — proje: goteborg-hjarta-fotograf-2026-07-18')
console.log('='.repeat(78))
{
  const id = 'goteborg-hjarta-fotograf-2026-07-18'
  const nsYolu = join(META_DATA_ROOT, 'projeler', id)
  const intakeYol = join(nsYolu, 'intake.md')
  if (!existsSync(intakeYol)) throw new Error(`intake.md yok: ${intakeYol}`)

  // Üretimdeki tools/planlamaLoopV2.mjs:baglamlarKur ile BİREBİR AYNI okuma — o fonksiyon içindeki
  // icerikOku(yol) de bundan farklı bir şey YAPMAZ ("if (!existsSync) return null; return
  // readFileSync(yol,'utf8')" — burada existsSync zaten üstte kontrol edildi, geri kalan aynı
  // tek satır). Reimplement DEĞİL — aynı ilkel işlemin (dosya oku) burada tekrarı.
  const intakeIcerik = readFileSync(intakeYol, 'utf8')
  const proje = projeKaydiOku(id)
  const projeConfig = { id, ad: proje.ad, aciklama: proje.ozet }
  const baglamlar = { intake: intakeIcerik }

  // BU, üretimde executor'ın fiilen inşa ettiği/gönderdiği STRING'İN AYNISI (promptUret
  // tools/canliExecutor.mjs'ten import edildi, kopyalanmadı; yanitlarMetni bu koşumda boş
  // çünkü genesis'in üstü yok — üretimde de aynı, ek bir ekleme YOK).
  const prompt = promptUret('genesis', projeConfig, baglamlar)

  console.log(`intake.md bayt uzunluğu       : ${bayt(intakeIcerik)}`)
  console.log(`assemble edilen prompt bayt   : ${bayt(prompt)}`)
  const idx = prompt.indexOf(intakeIcerik)
  console.log(`intake.md TAM İÇERİĞİ prompt içinde karakter-karakter VAR MI: ${idx !== -1 ? 'EVET' : 'HAYIR'}`)
  console.log(`  bulunduğu karakter-index (prompt string'i içinde)        : ${idx}`)
  console.log(`  doğrulama yöntemi                                        : prompt.indexOf(intakeIcerik) !== -1 (tam alt-dizi eşleşmesi, fuzzy DEĞİL)`)
  if (idx === -1) {
    console.log('  !!! KANIT BAŞARISIZ — intake içeriği prompt\'ta TAM olarak bulunamadı.')
  }
}

console.log()
console.log('='.repeat(78))
console.log('2) MASTER-PLAN BÖLÜM PROMPT AİLESİ — proje: i-svec-te-reklam-ajansi-2026-07-04')
console.log('   (goteborg henüz master-plan\'a ulaşmadı — bu bölüm-ailesi kanıtı için tüm 14')
console.log('    bölümü GERÇEKTEN geçmiş, GERÇEK dosyaları olan farklı bir proje kullanıldı)')
console.log('='.repeat(78))
{
  const id = 'i-svec-te-reklam-ajansi-2026-07-04'
  const nsYolu = join(META_DATA_ROOT, 'projeler', id)
  const intakeYol = join(nsYolu, 'intake.md')
  if (!existsSync(intakeYol)) throw new Error(`intake.md yok: ${intakeYol}`)
  const intakeIcerik = readFileSync(intakeYol, 'utf8')

  const proje = projeKaydiOku(id)
  const projeConfig = { id, ad: proje.ad, aciklama: proje.ozet }

  // GERÇEK state, GERÇEK dosyadan (planlama-durum.json) — reimplement YOK.
  const state = stateYukle(nsYolu, id)
  const mp = state.asamalar['master-plan']
  const bolumId = 'urun-tanimi' // normal (mekanik/iddiaMuaf değil) bölüm — en genel dal
  const bolumTanim = BOLUM_TANIMLARI[bolumId]

  // GERÇEK üretim fonksiyonu — bolumBaglamlarKur (tools/planlamaBolumLoop.mjs, bu proof için
  // export edildi, mantığı DEĞİŞTİRİLMEDİ) — bu, üretimin bölüm-yürüyüşünde AYNEN çağırdığı
  // fonksiyonun ta kendisi.
  const baglamlarBolum = bolumBaglamlarKur(nsYolu, state, mp, bolumId)
  console.log(`bolumBaglamlarKur('${bolumId}') anahtarları: ${Object.keys(baglamlarBolum).join(', ')}`)
  console.log(`  baglamlar.intake mevcut mu: ${baglamlarBolum.intake != null ? 'EVET' : 'HAYIR'}`)

  const prompt = promptUretBolum(bolumId, projeConfig, baglamlarBolum, bolumTanim)

  console.log(`intake.md bayt uzunluğu       : ${bayt(intakeIcerik)}`)
  console.log(`assemble edilen prompt bayt   : ${bayt(prompt)}`)
  const idx = prompt.indexOf(intakeIcerik)
  console.log(`intake.md TAM İÇERİĞİ prompt içinde karakter-karakter VAR MI: ${idx !== -1 ? 'EVET' : 'HAYIR'}`)
  console.log(`  bulunduğu karakter-index (prompt string'i içinde)        : ${idx}`)
  console.log(`  doğrulama yöntemi                                        : prompt.indexOf(intakeIcerik) !== -1 (tam alt-dizi eşleşmesi, fuzzy DEĞİL)`)
  if (idx === -1) {
    console.log('  !!! KANIT BAŞARISIZ — intake içeriği prompt\'ta TAM olarak bulunamadı.')
  }
}
console.log()
console.log('='.repeat(78))
console.log('BİTTİ — hiçbir LLM/model çağrısı yapılmadı (yalnız promptUret/promptUretBolum çağrıldı).')
console.log('='.repeat(78))
