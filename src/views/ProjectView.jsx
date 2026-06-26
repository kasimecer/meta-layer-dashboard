import { useEffect, useState } from 'react'
import Card from '../components/Card.jsx'
import { DurumBadge, StatusBadge, EtiketBadge } from '../components/Badges.jsx'

// #/proje/<id> — OPERATÖR seviyesi. Partner-view'den FARKLI: jargon-saklama YOK, her şey görünür.
// Kart yığını için slice-1 Card primitive'ini YENİDEN KULLANIR (onCevap YOK = read-only/izleme).

function Pipe() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}><div style={{ width: 2, height: 24, background: '#e4e4e7', borderRadius: 1 }} /></div>
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>{title}</h3>
      {children}
    </div>
  )
}

function FlagChip({ children }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600, fontFamily: 'ui-monospace, monospace',
      background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa',
      borderRadius: 6, padding: '3px 8px', marginRight: 6, marginBottom: 6,
    }}>⚑ {children}</span>
  )
}

function DocRow({ d }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0', borderBottom: '1px solid #f4f4f5' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#3f3f46' }}>{d.ad}</span>
      <span style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'ui-monospace, monospace' }}>{d.yol}</span>
    </div>
  )
}

export default function ProjectView({ projeId = 'baris' }) {
  const [proje, setProje] = useState(undefined)   // undefined = yükleniyor, null = bulunamadı
  const [kartlar, setKartlar] = useState(null)
  const [operator, setOperator] = useState(null)

  useEffect(() => {
    setProje(undefined); setKartlar(null); setOperator(null)
    fetch('./registry.json').then(r => r.ok ? r.json() : null).then(d => {
      const p = d ? (d.projeler ?? d).find(x => x.id === projeId) : null
      setProje(p ?? null)
    }).catch(() => setProje(null))
    fetch(`./cards-${projeId}.json`).then(r => r.ok ? r.json() : null)
      .then(d => setKartlar(d ? (d.kartlar ?? d) : null)).catch(() => setKartlar(null))
    fetch(`./operator-${projeId}.json`).then(r => r.ok ? r.json() : null)
      .then(setOperator).catch(() => setOperator(null))
  }, [projeId])

  if (proje === undefined) return <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>

  const kartVar = kartlar && kartlar.length > 0

  return (
    <div>
      <a href="#/portfoy" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>← portföy</a>

      {/* Operatör başlık: durum + rol + metrikler + operasyonel bağlam */}
      <div style={{ marginTop: 10, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{proje?.ad ?? projeId}</span>
          {proje && <DurumBadge durum={proje.durum} />}
          {proje && <StatusBadge status={proje.status} />}
        </div>
        {proje && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#71717a' }}>rol: <strong style={{ color: '#52525b' }}>{proje.rol}</strong></span>
            <EtiketBadge label="efor:" value={proje.efor} />
            <EtiketBadge label="değer:" value={proje.deger} />
            <span style={{ fontSize: 12, color: '#a1a1aa' }}>son: {proje.zaman_son_aktivite || '—'}</span>
          </div>
        )}
        {proje?.ozet && <p style={{ fontSize: 13, color: '#3f3f46', lineHeight: 1.55, margin: '0 0 6px' }}>{proje.ozet}</p>}
        {operator?.bekleyen_insan_girdisi && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#9a3412' }}>
            <span>⏳</span><span><strong>Bekleyen girdi:</strong> {operator.bekleyen_insan_girdisi}</span>
          </div>
        )}
        {operator?.son_ilerleme && (
          <p style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.55, marginTop: 10 }}>{operator.son_ilerleme}</p>
        )}
        {operator?.sonraki_kritik_adim && (
          <div style={{ display: 'flex', gap: 6, fontSize: 12.5, color: '#52525b', marginTop: 4 }}>
            <span>→</span><span>{operator.sonraki_kritik_adim}</span>
          </div>
        )}
      </div>

      {/* OPERATÖR-EK (partner GÖRMEZ): iç bayraklar */}
      {operator?.acik_bayraklar?.length > 0 && (
        <Section title="iç bayraklar — operatör (partner görmez)">
          <div>{operator.acik_bayraklar.map(b => <FlagChip key={b}>{b}</FlagChip>)}</div>
        </Section>
      )}

      {/* OPERATÖR-EK: kanonik doküman pointer'ları (Drive yolları) */}
      {operator?.dokumanlar?.length > 0 && (
        <Section title="dokümanlar — Drive (operatör)">
          <div>{operator.dokumanlar.map(d => <DocRow key={d.yol} d={d} />)}</div>
        </Section>
      )}

      {/* Kart yığını — Card primitive yeniden kullanım (read-only operatör; input yok) */}
      {kartVar ? (
        <Section title={`kartlar — ${kartlar.length}`}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {kartlar.map((k, i) => (
              <div key={k.id}>
                <Card kart={k} />
                {i < kartlar.length - 1 && <Pipe />}
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <div style={{ marginTop: 20, padding: '16px 18px', background: '#fafafa', border: '1px dashed #e4e4e7', borderRadius: 10, fontSize: 13, color: '#71717a' }}>
          Henüz kart yok — <strong>{proje?.durum || 'erken'}</strong> aşaması. {proje?.status === 'duraklı' && 'Proje duraklı.'}
        </div>
      )}
    </div>
  )
}
