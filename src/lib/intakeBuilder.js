// meta-layer-core — Intake builder: form → proje kaydı + kart seti.
// Yeni şema icat edilmez: registry.js Proje + stateMachine.js Kart şemaları kullanılır.
// Saf JS (React bağımlılığı yok); node ve tarayıcıda çalışır.

import { kartDogrula } from './stateMachine.js'

// Proje lifecycle'daki faz sınırı: planlama (fikir → plan) | build (build-onayı →)
const PLANLAMA_DURUMLARI = new Set(['fikir', 'araştırma', 'premise', 'plan'])
export function fazHesapla(durum) {
  return PLANLAMA_DURUMLARI.has(durum) ? 'planlama' : 'build'
}

function bugunIso() {
  return new Date().toISOString().slice(0, 10)
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ıİi]/g, 'i')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
}

export function idOner(ad, icerik) {
  const base = ad || (icerik?.fikirMetni || icerik?.ilgiAlani || 'proje')
  return `${slugify(base)}-${bugunIso()}`
}

// ── Proje kaydı ──────────────────────────────────────────────────────────────

export function projeKaydiUret({ id, kip, ad, icerik }) {
  const ozet = kip === 'fikir-var'
    ? (icerik.fikirMetni || '').slice(0, 140)
    : [icerik.ilgiAlani, icerik.kisit, icerik.varlik].filter(Boolean).join(' · ').slice(0, 140)

  return {
    id,
    ad: (ad || 'Yeni Proje').trim(),
    durum: 'fikir',
    faz: 'planlama',
    rol: 'solo',
    status: 'aktif',
    efor: '?',
    deger: '?',
    zaman_son_aktivite: bugunIso(),
    ozet: ozet || '(tanımlanmadı)',
  }
}

// ── Başlangıç kartları ───────────────────────────────────────────────────────

export function baslamgicKartlariUret({ id: projeId, kip, icerik }) {
  const now = new Date().toISOString()

  const kartlar = []

  if (kip === 'fikir-var') {
    kartlar.push({
      id: `${projeId}-k01`,
      tip: 'girdi-talebi',
      durum: 'cevap-bekliyor',
      ozet: 'Bir cümleyle netleştir: hedef kitle + çözülen sorun',
      detay: `**Başlangıç fikri:**\n\n${icerik.fikirMetni}\n\n*Sonraki adım: premise kapısı için fikri netleştir.*`,
      partner_cevap: null,
      olusturma: now,
      guncelleme: now,
    })
  } else {
    const satirlar = [
      icerik.ilgiAlani && `**İlgi alanı:** ${icerik.ilgiAlani}`,
      icerik.kisit     && `**Kısıt:** ${icerik.kisit}`,
      icerik.varlik    && `**Elindeki varlık:** ${icerik.varlik}`,
    ].filter(Boolean)

    kartlar.push({
      id: `${projeId}-k01`,
      tip: 'girdi-talebi',
      durum: 'cevap-bekliyor',
      ozet: 'Bu tohumlardan hangi ürün fikri çıkıyor?',
      detay: satirlar.join('\n'),
      partner_cevap: null,
      olusturma: now,
      guncelleme: now,
    })
  }

  for (const k of kartlar) {
    const h = kartDogrula(k)
    if (h.length) throw new Error(`Intake kart şema hatası [${k.id}]: ${h.join('; ')}`)
  }

  return kartlar
}

// ── intake.md (loop için; META_DATA_ROOT/projeler/<id>/intake.md) ─────────────

export function intakeMdUret({ id, kip, ad, icerik }) {
  const satirlar = [
    `# Intake — ${ad || 'Yeni Proje'}`,
    `**ID:** ${id}`,
    `**Giriş kipi:** ${kip === 'fikir-var' ? 'fikir-var' : 'tohum'}`,
    `**Tarih:** ${bugunIso()}`,
    '',
  ]
  if (kip === 'fikir-var') {
    satirlar.push('## Fikir', '', icerik.fikirMetni || '')
  } else {
    satirlar.push('## Tohumlar', '')
    if (icerik.ilgiAlani) satirlar.push(`- **İlgi alanı:** ${icerik.ilgiAlani}`)
    if (icerik.kisit)     satirlar.push(`- **Kısıt:** ${icerik.kisit}`)
    if (icerik.varlik)    satirlar.push(`- **Elindeki varlık:** ${icerik.varlik}`)
  }
  return satirlar.join('\n')
}

// ── Ana üretici ───────────────────────────────────────────────────────────────

/**
 * @param {{ kip:'fikir-var'|'tohum', ad:string, icerik:object, idOverride?:string }} form
 * @returns {{ projeKaydi, cardsJson, intakeMd, id }}
 */
export function intakeArtifaktlariUret(form) {
  const { kip, ad, icerik, idOverride } = form
  const id = idOverride || idOner(ad, icerik)
  const projeKaydi = projeKaydiUret({ id, kip, ad, icerik })
  const kartlar = baslamgicKartlariUret({ id, kip, icerik })
  return {
    id,
    projeKaydi,
    cardsJson: { kartlar },
    intakeMd: intakeMdUret({ id, kip, ad, icerik }),
  }
}

// ── localStorage draft yönetimi (UI katmanı için yardımcı) ───────────────────

const LS_KEY = 'meta-layer-intake-taslaklar'

export function taslaklariOku() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

export function taslakKaydet(artifakt) {
  const liste = taslaklariOku().filter(t => t.id !== artifakt.id)
  liste.unshift({ ...artifakt, _taslak: true, _kayitZaman: new Date().toISOString() })
  localStorage.setItem(LS_KEY, JSON.stringify(liste.slice(0, 20)))
}

export function taslakSil(id) {
  const liste = taslaklariOku().filter(t => t.id !== id)
  localStorage.setItem(LS_KEY, JSON.stringify(liste))
}
