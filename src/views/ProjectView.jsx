import { useEffect, useState } from 'react'
import Card from '../components/Card.jsx'
import { DurumBadge, StatusBadge, EtiketBadge, TaslakBadge, FazBadge } from '../components/Badges.jsx'
import MateryalizeButton from '../components/MateryalizeButton.jsx'
import { taslaklariOku, taslakSil, taslakKaydet, fazHesapla } from '../lib/intakeBuilder.js'
import { gecisUygula } from '../lib/stateMachine.js'

// #/proje/<id> — OPERATÖR seviyesi. Partner-view'den FARKLI: jargon-saklama YOK, her şey görünür.
// Kart yığını için slice-1 Card primitive'ini YENİDEN KULLANIR.
// Gerçek/materyalize projede onCevap YOK = read-only/izleme (gerçek cevap yolu #/partner/<id>).
// Taslak/draft projede onCevap YEREL (localStorage) bağlanır — henüz cards-<id>.json
// üretilmediği için partner-view bu projeyi yükleyemez; tek cevaplama yolu burasıdır.

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

// docKey — DocumentView.jsx'teki eşleşmeyle AYNI kural (d.asama ?? d.ad); '/' içerebilir (bölüm
// asama'ları "master-plan/pazar-analizi" gibi), bu yüzden route segmentine encodeURIComponent'lı
// gömülür (App.jsx rota() bunu decode eder).
function DocRow({ d, projeId }) {
  const docKey = d.asama ?? d.ad
  const dokumanHref = `#/dokuman/${projeId}/${encodeURIComponent(docKey)}`
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0', borderBottom: '1px solid #f4f4f5' }}>
      <a href={dokumanHref}
        style={{ fontSize: 13, fontWeight: 600, color: '#4338ca', textDecoration: 'none' }}>
        {d.ad}
      </a>
      {d.asama && <span style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'ui-monospace, monospace' }}>{d.asama}</span>}
    </div>
  )
}

function TaslakRow({ t }) {
  const sinifRenk = t.terminal_sinif === 'yakinsama'
    ? { bg: '#dcfce7', fg: '#166534' }
    : { bg: '#fff7ed', fg: '#9a3412' }
  return (
    <div style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: '#3f3f46' }}>
          {t.karar_id}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
          background: sinifRenk.bg, color: sinifRenk.fg, textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          {t.terminal_sinif ?? '—'}
        </span>
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#71717a', fontFamily: 'ui-monospace, monospace' }}>
        {t.yayinla_cli}
      </div>
    </div>
  )
}

// Build-board: 3-kolon operatör görünümü. Partner görmez.
function BoardKolon({ label, items }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
        {label} <span style={{ fontWeight: 400 }}>({items.length})</span>
      </div>
      {items.length === 0 && (
        <div style={{ padding: '10px 12px', fontSize: 12, color: '#a1a1aa', background: '#fafafa', border: '1px dashed #e4e4e7', borderRadius: 8 }}>boş</div>
      )}
      {items.map(({ kart, event_blok, bağlı_olay }) => (
        <div key={kart.id} style={{ marginBottom: 10 }}>
          {event_blok && (
            <div style={{ marginBottom: 3, padding: '2px 8px', fontSize: 10, fontFamily: 'ui-monospace, monospace', color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 5 }}>
              ⏳ blok: {event_blok}
            </div>
          )}
          {bağlı_olay && (
            <div style={{ marginBottom: 3, padding: '2px 8px', fontSize: 10, fontFamily: 'ui-monospace, monospace', color: bağlı_olay.escalation ? '#7e22ce' : '#166534', background: bağlı_olay.escalation ? '#faf5ff' : '#f0fdf4', border: '1px solid', borderColor: bağlı_olay.escalation ? '#e9d5ff' : '#bbf7d0', borderRadius: 5 }}>
              {bağlı_olay.escalation ? '⚠' : '✓'} {bağlı_olay.karar_id} [{bağlı_olay.terminal_sinif ?? '—'}]
            </div>
          )}
          <Card kart={kart} />
        </div>
      ))}
    </div>
  )
}

export default function ProjectView({ projeId = 'mustafa' }) {
  const [proje, setProje] = useState(undefined)   // undefined = yükleniyor, null = bulunamadı
  const [kartlar, setKartlar] = useState(null)
  const [operator, setOperator] = useState(null)
  const [taslak, setTaslak] = useState(null)
  const [sorular, setSorular] = useState(null)     // planlama soru-yanıt anlık-görüntüsü (best-effort)

  // GERÇEK/materyalize veri (registry veya cards-<id>.json) HER ZAMAN localStorage taslağının
  // ÖNÜNE geçer — aksi hâlde bir proje materyalize edildikten SONRA bile, aynı tarayıcıda kalan
  // eski bir taslak kaydı gerçek durumu SONSUZA KADAR gölgeler (bkz PortfolioView.jsx'in kendi
  // registry-üyeliği kontrolü — burada AYNI önceliği, per-id detay sayfasında da uyguluyoruz).
  // Gerçek veri bulununca kalan taslak varsa BAYATTIR → kendiliğinden temizlenir (taslakSil).
  useEffect(() => {
    let iptal = false
    setProje(undefined); setKartlar(null); setOperator(null); setTaslak(null); setSorular(null)

    async function yukle() {
      let registryProje = null
      try {
        const r = await fetch('./registry.json')
        if (r.ok) {
          const d = await r.json()
          registryProje = (d.projeler ?? d).find(x => x.id === projeId) ?? null
        }
      } catch { /* noop */ }

      let cardsVarMi = false, kartlarVeri = null
      try {
        const r = await fetch(`./cards-${projeId}.json`)
        if (r.ok) { cardsVarMi = true; const d = await r.json(); kartlarVeri = d.kartlar ?? d }
      } catch { /* noop */ }

      if (iptal) return
      const gercekVeriVar = !!registryProje || cardsVarMi

      if (gercekVeriVar) {
        if (taslaklariOku().some(t => t.id === projeId)) taslakSil(projeId) // bayat taslak — self-heal
        setProje(registryProje)
        setKartlar(kartlarVeri)
        fetch(`./operator-${projeId}.json`).then(r => r.ok ? r.json() : null)
          .then(o => { if (!iptal) setOperator(o) }).catch(() => {})
      } else {
        const ls = taslaklariOku().find(t => t.id === projeId)
        if (ls) {
          setTaslak(ls)
          setProje(ls.projeKaydi)
          setKartlar(ls.cardsJson?.kartlar ?? [])
        } else {
          setProje(null)
        }
      }

      // Soru-yanıt anlık-görüntüsü — best-effort, registry-bağımsız (bkz build-card-data.js §4).
      fetch(`./sorular-${projeId}.json`).then(r => r.ok ? r.json() : null)
        .then(s => { if (!iptal) setSorular(s) }).catch(() => {})
    }
    yukle()
    return () => { iptal = true }
  }, [projeId])

  // Yalnız taslak/draft projede: cevap localStorage'a yazılır (kalıcı, yenilemeye dayanıklı).
  // Gerçek/materyalize projede bu fonksiyon hiç bağlanmaz — Card onCevap={undefined} alır.
  async function cevapla(kart, cevap) {
    const yeniKart = { ...gecisUygula(kart, 'cevaplandi'), partner_cevap: cevap }
    setKartlar(ks => ks.map(k => (k.id === kart.id ? yeniKart : k)))
    setTaslak(t => {
      const guncelKartlar = (t.cardsJson?.kartlar ?? []).map(k => (k.id === kart.id ? yeniKart : k))
      const guncelTaslak = { ...t, cardsJson: { ...t.cardsJson, kartlar: guncelKartlar } }
      taslakKaydet(guncelTaslak)
      return guncelTaslak
    })
    return { ok: true, kart: yeniKart }
  }

  if (proje === undefined) return <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>

  const projeEtkin = proje ?? operator?.proje_meta ?? null
  const faz = projeEtkin ? (projeEtkin.faz ?? fazHesapla(projeEtkin.durum)) : null
  const kartVar = kartlar && kartlar.length > 0

  return (
    <div>
      <a href="#/portfoy" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>← portföy</a>

      {/* Taslak uyarı bandı */}
      {taslak && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12.5, color: '#92400e' }}>
              <strong>Taslak proje</strong> — sadece localStorage'da, henüz materyalize edilmedi.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href="#/baslat" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Düzenle</a>
              <button onClick={() => { taslakSil(projeId); window.location.hash = '#/portfoy' }} style={{
                fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0,
              }}>Taslağı sil</button>
            </div>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #fde68a' }}>
            <MateryalizeButton taslak={taslak} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: '#92400e' }}>
            Yedek yol (elle): <code style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>
              node scripts/intake-materialize.mjs
            </code>
          </div>
        </div>
      )}

      {/* Operatör başlık: durum + rol + metrikler + operasyonel bağlam */}
      <div style={{ marginTop: 10, background: '#fff', border: `1px solid ${taslak ? '#fde68a' : '#e4e4e7'}`, borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{projeEtkin?.ad ?? projeId}</span>
          {faz && <FazBadge faz={faz} />}
          {taslak ? <TaslakBadge /> : projeEtkin && <DurumBadge durum={projeEtkin.durum} />}
          {!taslak && projeEtkin?.status && <StatusBadge status={projeEtkin.status} />}
        </div>
        {projeEtkin && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#71717a' }}>rol: <strong style={{ color: '#52525b' }}>{projeEtkin.rol}</strong></span>
            <EtiketBadge label="efor:" value={projeEtkin.efor} />
            <EtiketBadge label="değer:" value={projeEtkin.deger} />
            <span style={{ fontSize: 12, color: '#a1a1aa' }}>son: {projeEtkin.zaman_son_aktivite || '—'}</span>
          </div>
        )}
        {projeEtkin?.ozet && <p style={{ fontSize: 13, color: '#3f3f46', lineHeight: 1.55, margin: '0 0 6px' }}>{projeEtkin.ozet}</p>}
        {operator?.bekleyen_insan_girdisi && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#9a3412' }}>
            <span>⏳</span><span><strong>Bekleyen girdi:</strong> {operator.bekleyen_insan_girdisi}</span>
          </div>
        )}
        {/* Planlama soru-yanıt: aktif aşama + açık soru sayısı — CLI listesinin (planlama-baslat.mjs)
            yüzeye çıkardığı AYNI olguyu tarayıcıya taşır (bkz tools/planlamaDurumOzeti.mjs). */}
        {sorular && !sorular.tamamlandi && sorular.aktif_asama && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#4338ca' }}>
            <span>{sorular.acik_sorular.length > 0 ? '❓' : '◐'}</span>
            <span>
              <strong>planlama:</strong> aktif aşama {sorular.aktif_asama}
              {sorular.acik_sorular.length > 0 && <> · <strong>{sorular.acik_sorular.length} açık soru</strong></>}
            </span>
            {sorular.acik_sorular.length > 0 && (
              <a href={`#/sorular/${projeId}`} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#4338ca', textDecoration: 'none' }}>
                Yanıtla →
              </a>
            )}
          </div>
        )}
        {/* 5-aşama + bölüm-yürüyüşü BİTTİ (tamamlandi) AMA Kritik Pasaj (elestiri) hâlâ bekleyen bir
            kararsa (ör. go/no-go/pivot) — 2026-07-19 kör-nokta düzeltmesi (bkz tools/
            planlamaDurumOzeti.mjs:acikSoruDurum). ÖNCEKİ blok (yukarıda, !sorular.tamamlandi) BİLEREK
            DEĞİŞTİRİLMEDİ — bu tamamen AYRI, EK bir durak: "pipeline bitti" ARTIK "operatörün göreceği
            hiçbir şey kalmadı" ANLAMINA GELMEZ. */}
        {sorular && sorular.tamamlandi && sorular.acik_sorular?.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#9a3412' }}>
            <span>⚑</span>
            <span>
              <strong>Kritik Pasaj — E kararı bekliyor:</strong> <strong>{sorular.acik_sorular.length} açık soru</strong>
              {sorular.durum_etiketi && <> · durum: {sorular.durum_etiketi}</>}
            </span>
            <a href={`#/sorular/${projeId}`} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#9a3412', textDecoration: 'none' }}>
              Yanıtla →
            </a>
          </div>
        )}
        {/* Leftover: proje boyunca (aktif olmayan birimler dahil) ertelenmiş, hâlâ açık adaylar —
            walk/deferral tasarımı DEĞİŞMEDİ, yalnız görünürlük eklendi (bkz tools/
            planlamaDurumOzeti.mjs:projeLeftoverOzetiCikar). Detay #/sorular/<id>'de. */}
        {sorular && sorular.leftover_by_unit?.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#52525b' }}>
            <span>🗂</span>
            <span>
              <strong>{sorular.leftover_by_unit.reduce((n, u) => n + u.sayi, 0)} ertelenen aday</strong> hâlâ açık
              ({sorular.leftover_by_unit.length} birimde: {sorular.leftover_by_unit.map(u => u.birimId).join(', ')})
            </span>
            <a href={`#/sorular/${projeId}`} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#52525b', textDecoration: 'none' }}>
              Detay →
            </a>
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
          <div>{operator.dokumanlar.map(d => <DocRow key={d.asama ?? d.ad} d={d} projeId={projeId} />)}</div>
        </Section>
      )}

      {/* OPERATÖR-EK: fasilitasyon taslakları (partner GÖRMEZ) */}
      {operator?.fasilitasyon_taslaklar?.length > 0 && (
        <Section title="fasilitasyon taslakları — operatör (partner görmez)">
          <div style={{ marginBottom: 6, fontSize: 11, color: '#71717a' }}>
            Yayınlamak için terminalde CLI komutunu çalıştır:
          </div>
          {operator.fasilitasyon_taslaklar.map(t => <TaslakRow key={t.karar_id} t={t} />)}
        </Section>
      )}

      {/* Build-board (operator.board varsa) veya düz kart yığını */}
      {operator?.board ? (
        <Section title="build board">
          <div style={{ display: 'flex', gap: 14 }}>
            <BoardKolon label="Yapılacak" items={operator.board.bekliyor ?? []} />
            <BoardKolon label="Devam"     items={operator.board.devam    ?? []} />
            <BoardKolon label="Bitti"     items={operator.board.bitti    ?? []} />
          </div>
        </Section>
      ) : kartVar ? (
        <Section title={`kartlar — ${kartlar.length}`}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {kartlar.map((k, i) => (
              <div key={k.id}>
                <Card kart={k} onCevap={taslak ? (cevap) => cevapla(k, cevap) : undefined} />
                {i < kartlar.length - 1 && <Pipe />}
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <div style={{ marginTop: 20, padding: '16px 18px', background: '#fafafa', border: '1px dashed #e4e4e7', borderRadius: 10, fontSize: 13, color: '#71717a' }}>
          Henüz kart yok — <strong>{projeEtkin?.durum || 'erken'}</strong> aşaması. {projeEtkin?.status === 'duraklı' && 'Proje duraklı.'}
        </div>
      )}
    </div>
  )
}
