import { useState } from 'react'
import { intakeArtifaktlariUret, taslakKaydet, idOner } from '../lib/intakeBuilder.js'

// #/baslat — operatör intake yüzeyi.
// İki kip: fikir-var (somut fikir) | tohum (ilgi/kısıt/varlık tohumları).
// Çıktı: proje kaydı + kart seti localStorage taslağa yazılır → sistemin tüketebileceği JSON.

function FormField({ label, zorunlu, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#52525b', marginBottom: 4 }}>
        {label} {zorunlu && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const INPUT_STYLE = {
  width: '100%', padding: '9px 12px', border: '1px solid #d4d4d8',
  borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
}

function JsonBox({ label, json, kopyalandi, onKopyala }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#3f3f46' }}>{label}</span>
        <button onClick={onKopyala} style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid #e4e4e7',
          background: '#fff', cursor: 'pointer', color: kopyalandi ? '#166534' : '#71717a',
        }}>
          {kopyalandi ? 'kopyalandı ✓' : 'kopyala'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '12px 14px', background: '#fafafa', border: '1px solid #e4e4e7',
        borderRadius: 8, fontSize: 11.5, fontFamily: 'ui-monospace, monospace',
        color: '#374151', overflowX: 'auto', lineHeight: 1.5, whiteSpace: 'pre-wrap',
      }}>{JSON.stringify(json, null, 2)}</pre>
    </div>
  )
}

export default function IntakeView() {
  const [kip, setKip] = useState('fikir-var')
  const [ad, setAd] = useState('')
  const [fikirMetni, setFikirMetni] = useState('')
  const [ilgiAlani, setIlgiAlani] = useState('')
  const [kisit, setKisit] = useState('')
  const [varlik, setVarlik] = useState('')
  const [idDuzenleme, setIdDuzenleme] = useState('')
  const [sonuc, setSonuc] = useState(null)
  const [hata, setHata] = useState(null)
  const [kopyalandi, setKopyalandi] = useState({})

  const icerikSimdi = kip === 'fikir-var' ? { fikirMetni } : { ilgiAlani, kisit, varlik }
  const onerilenId = idOner(ad, icerikSimdi)
  const efektifId = idDuzenleme || onerilenId

  function gonder(e) {
    e.preventDefault()
    setHata(null)
    if (kip === 'fikir-var' && !fikirMetni.trim()) {
      setHata('Fikir metni boş bırakılamaz.')
      return
    }
    if (kip === 'tohum' && !ilgiAlani.trim() && !kisit.trim() && !varlik.trim()) {
      setHata('En az bir tohum alanı doldurulmalı.')
      return
    }
    try {
      const artifakt = intakeArtifaktlariUret({
        kip, ad,
        icerik: icerikSimdi,
        idOverride: efektifId || undefined,
      })
      taslakKaydet(artifakt)
      setSonuc(artifakt)
    } catch (err) {
      setHata(err.message)
    }
  }

  function kopyala(key, text) {
    navigator.clipboard.writeText(text).then(() => {
      setKopyalandi(p => ({ ...p, [key]: true }))
      setTimeout(() => setKopyalandi(p => ({ ...p, [key]: false })), 1500)
    }).catch(() => {})
  }

  // ── Sonuç ekranı ─────────────────────────────────────────────────────────────
  if (sonuc) {
    return (
      <div style={{ maxWidth: 680 }}>
        <a href="#/portfoy" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>← portföy</a>

        <div style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#166534', marginBottom: 4 }}>Proje taslağı oluşturuldu</div>
          <div style={{ fontSize: 12, color: '#15803d', fontFamily: 'ui-monospace, monospace' }}>{sonuc.id}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <a href={`#/proje/${sonuc.id}`} style={{
            fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8,
            background: '#6366f1', color: '#fff', textDecoration: 'none',
          }}>Projeye git →</a>
          <a href="#/portfoy" style={{
            fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            background: '#fff', color: '#52525b', border: '1px solid #e4e4e7', textDecoration: 'none',
          }}>Portföyde gör</a>
          <button onClick={() => { setSonuc(null); setFikirMetni(''); setIlgiAlani(''); setKisit(''); setVarlik(''); setAd(''); setIdDuzenleme('') }} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
            background: '#fff', color: '#71717a', border: '1px solid #e4e4e7', cursor: 'pointer',
          }}>Yeni proje</button>
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
            Kalıcı materyalizasyon için JSON
          </div>
          <div style={{ fontSize: 12, color: '#71717a', marginBottom: 10 }}>
            Taslak şu an localStorage'da görünür. Dosyalara yazmak için:
            <code style={{ display: 'block', marginTop: 5, padding: '6px 10px', background: '#f4f4f5', borderRadius: 6, fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#374151' }}>
              node scripts/intake-materialize.mjs &lt;taslak.json dosya yolu&gt;
            </code>
          </div>
          <JsonBox
            label={`proje kaydı — registry.json'a eklenecek`}
            json={sonuc.projeKaydi}
            kopyalandi={kopyalandi.proje}
            onKopyala={() => kopyala('proje', JSON.stringify(sonuc.projeKaydi, null, 2))}
          />
          <JsonBox
            label={`cards-${sonuc.id}.json`}
            json={sonuc.cardsJson}
            kopyalandi={kopyalandi.cards}
            onKopyala={() => kopyala('cards', JSON.stringify(sonuc.cardsJson, null, 2))}
          />
        </div>
      </div>
    )
  }

  // ── Form ekranı ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 560 }}>
      <a href="#/portfoy" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>← portföy</a>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#18181b', marginTop: 12, marginBottom: 4 }}>Yeni proje başlat</h2>
      <div style={{ fontSize: 12.5, color: '#71717a', marginBottom: 18 }}>Planlama döngüsü için ilk kaydı oluşturur.</div>

      {/* Kip seçici */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
        {[
          { k: 'fikir-var', baslik: 'Fikrim var',    aciklama: 'Somut bir fikir ya da ürün aklımda' },
          { k: 'tohum',    baslik: 'Fikir arıyorum', aciklama: 'İlgi, kısıt veya elindeki varlıktan başla' },
        ].map(({ k, baslik, aciklama }) => (
          <button key={k} onClick={() => setKip(k)} style={{
            flex: 1, padding: '13px 14px', borderRadius: 10, cursor: 'pointer',
            textAlign: 'left', fontFamily: 'inherit',
            border: kip === k ? '2px solid #6366f1' : '2px solid #e4e4e7',
            background: kip === k ? '#eef2ff' : '#fff',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: kip === k ? '#4338ca' : '#18181b', marginBottom: 2 }}>{baslik}</div>
            <div style={{ fontSize: 11, color: kip === k ? '#6366f1' : '#71717a', lineHeight: 1.4 }}>{aciklama}</div>
          </button>
        ))}
      </div>

      <form onSubmit={gonder}>
        <FormField label="Proje adı (opsiyonel)">
          <input value={ad} onChange={e => setAd(e.target.value)} placeholder="ör. Balkon Bahçesi" style={INPUT_STYLE} />
        </FormField>

        {kip === 'fikir-var' ? (
          <FormField label="Fikrin ne?" zorunlu>
            <textarea
              value={fikirMetni} onChange={e => setFikirMetni(e.target.value)}
              rows={4} placeholder="Neyi, kimin için çözüyorsun? Kısa ve net yaz."
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />
          </FormField>
        ) : (
          <>
            {[
              { st: ilgiAlani, set: setIlgiAlani, label: 'İlgi alanı',       ph: 'ör. bahçecilik, dil öğrenme, eğitim' },
              { st: kisit,    set: setKisit,     label: 'Kısıt',              ph: 'ör. haftada 5 saat, düşük bütçe, coğrafi sınır' },
              { st: varlik,   set: setVarlik,    label: 'Elindeki varlık',    ph: 'ör. balkon, yazılım becerisi, profesyonel ağ' },
            ].map(({ st, set, label, ph }) => (
              <FormField key={label} label={label}>
                <input value={st} onChange={e => set(e.target.value)} placeholder={ph} style={INPUT_STYLE} />
              </FormField>
            ))}
            <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 14 }}>En az bir alan doldurulmalı.</div>
          </>
        )}

        {/* ID önizlemesi ve düzenleme */}
        <FormField label="Proje ID (düzenlenebilir)">
          <input
            value={efektifId}
            onChange={e => setIdDuzenleme(e.target.value)}
            style={{ ...INPUT_STYLE, fontSize: 12, fontFamily: 'ui-monospace, monospace', color: '#52525b' }}
          />
          {idDuzenleme && idDuzenleme !== onerilenId && (
            <button type="button" onClick={() => setIdDuzenleme('')}
              style={{ marginTop: 4, fontSize: 11, color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              önerilen ID'ye dön ({onerilenId})
            </button>
          )}
        </FormField>

        {hata && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
            {hata}
          </div>
        )}

        <button type="submit" style={{
          padding: '10px 24px', fontSize: 14, fontWeight: 700, borderRadius: 9,
          border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer',
        }}>Taslak oluştur</button>
      </form>
    </div>
  )
}
