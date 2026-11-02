import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Palette } from './db'
import { pickFiles, extractPalette, hexToHsl, hslToHex, textOn, Empty } from './util'

export function harmonies(hex: string) {
  const [h, s, l] = hexToHsl(hex)
  return {
    Analogous: [-30, -15, 0, 15, 30].map(d => hslToHex(h + d, s, l)),
    Complementary: [hslToHex(h, s, l), hslToHex(h, s, Math.min(.9, l + .2)), hslToHex(h + 180, s, l), hslToHex(h + 180, s, Math.max(.15, l - .2))],
    Triad: [0, 120, 240].map(d => hslToHex(h + d, s, l)),
    'Soft pastel': [0, 40, 80, 200, 280].map(d => hslToHex(h + d, Math.min(s, .7), .82)),
  }
}
const copy = (c: string) => { navigator.clipboard?.writeText(c); }

export function Silhouette({ colors, size = 220 }: { colors: string[]; size?: number }) {
  const [hair, skin, outfit, accent, extra] = [colors[0] ?? '#5b3592', colors[1] ?? '#f6ead2', colors[2] ?? '#8e5fd0', colors[3] ?? '#ffd23f', colors[4] ?? colors[0] ?? '#f6a5b8']
  return <svg viewBox="0 0 200 300" width={size * 2 / 3} height={size} className="sil">
    <path d="M58 40 L48 4 L80 28 Z M142 40 L152 4 L120 28 Z" fill={hair} />
    <path d="M62 34 L56 14 L76 28Z M138 34 L144 14 L124 28Z" fill={extra} />
    <ellipse cx="100" cy="70" rx="44" ry="46" fill={skin} />
    <path d="M54 70 Q50 18 100 20 Q150 18 146 70 Q140 44 118 40 Q100 54 78 42 Q60 48 54 70Z" fill={hair} />
    <path d="M54 66 Q44 120 60 140 L66 90Z M146 66 Q156 120 140 140 L134 90Z" fill={hair} />
    <circle cx="84" cy="76" r="5" fill="#2a1a40" /><circle cx="116" cy="76" r="5" fill="#2a1a40" />
    <ellipse cx="74" cy="90" rx="7" ry="4" fill="#f6a5b8" opacity=".7" /><ellipse cx="126" cy="90" rx="7" ry="4" fill="#f6a5b8" opacity=".7" />
    <rect x="90" y="112" width="20" height="14" fill={skin} />
    <path d="M62 128 Q100 116 138 128 L150 210 Q100 222 50 210Z" fill={outfit} />
    <path d="M62 128 L40 200 L52 204 L72 150Z M138 128 L160 200 L148 204 L128 150Z" fill={outfit} />
    <circle cx="46" cy="206" r="8" fill={skin} /><circle cx="154" cy="206" r="8" fill={skin} />
    <path d="M84 126 L100 146 L116 126" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" />
    <circle cx="100" cy="150" r="6" fill={accent} />
    <path d="M70 212 L72 280 L94 280 L96 214Z M104 214 L106 280 L128 280 L130 212Z" fill={skin} />
    <path d="M66 270 L98 270 L98 290 L62 290Z M102 270 L134 270 L138 290 L102 290Z" fill={accent} />
    <path d="M150 200 Q190 180 180 130 Q176 160 150 180Z" fill={hair} />
  </svg>
}

export function Palettes() {
  const list = useLiveQuery(() => db.palettes.orderBy('createdAt').reverse().toArray()) ?? []
  const [cur, setCur] = useState<Palette>({ id: uid(), name: 'Coconut Cove', colors: ['#5b3592', '#f6ead2', '#8e5fd0', '#ffd23f', '#f6a5b8'], createdAt: Date.now() })
  const [base, setBase] = useState('#8e5fd0'); const [toast, setToast] = useState('')
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 1200) }
  const set = (i: number, c: string) => setCur({ ...cur, colors: cur.colors.map((x, j) => j === i ? c : x) })
  return <section>
    <div className="row head"><h2>Palette Lab</h2></div>
    <div className="pl-grid">
      <div className="card pad">
        <input className="title-in" value={cur.name} onChange={e => setCur({ ...cur, name: e.target.value })} />
        <div className="pal-big">{cur.colors.map((c, i) => <div key={i} style={{ background: c, color: textOn(c) }}>
          <input type="color" value={c} onChange={e => set(i, e.target.value)} aria-label="edit color" />
          <button className="ghost" onClick={() => { copy(c); flash('Copied ' + c) }}>{c}</button>
          <button className="ghost x" onClick={() => setCur({ ...cur, colors: cur.colors.filter((_, j) => j !== i) })}>✕</button></div>)}</div>
        <div className="row actions">
          <button onClick={() => setCur({ ...cur, colors: [...cur.colors, '#ffffff'] })}>+ Color</button>
          <button onClick={async () => { const [f] = await pickFiles(false); if (f) { const colors = await extractPalette(f); setCur({ ...cur, colors }); flash('Extracted!') } }}>📷 From image</button>
          <button onClick={() => { copy(cur.colors.join(', ')); flash('Copied all') }}>📋 Copy all</button>
          <button className="primary" onClick={async () => { await db.palettes.put({ ...cur, createdAt: Date.now() }); flash('Saved ✿') }}>💾 Save</button>
          <button onClick={() => setCur({ id: uid(), name: 'New palette', colors: ['#ffffff'], createdAt: Date.now() })}>New</button>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
      <div className="card pad center"><h3>Avatar preview</h3><Silhouette colors={cur.colors} /><br /><small className="muted">hair · skin · outfit · accents · extra (colors 1–5)</small></div>
    </div>
    <div className="card pad"><div className="row"><h3 style={{ flex: 1 }}>Harmony ideas</h3><input type="color" value={base} onChange={e => setBase(e.target.value)} style={{ width: 60 }} /></div>
      {Object.entries(harmonies(base)).map(([n, cs]) => <div key={n} className="row harm"><small style={{ width: 110 }}>{n}</small><div className="pal" style={{ flex: 1 }}>{cs.map((c, i) => <i key={i} style={{ background: c, height: 28 }} title={c} onClick={() => { copy(c); flash('Copied ' + c) }} />)}</div>
        <button className="ghost" onClick={() => setCur({ ...cur, colors: cs })}>Use</button></div>)}
    </div>
    <h3>Saved palettes</h3>
    {!list.length ? <Empty icon="🎨" title="No saved palettes" sub="Save one above to link it to concepts." /> :
      <div className="grid">{list.map(p => <div key={p.id} className="card pad" onClick={() => setCur(p)} style={{ cursor: 'pointer' }}>
        <div className="pal">{p.colors.map((c, i) => <i key={i} style={{ background: c, height: 30 }} />)}</div>
        <div className="row"><b style={{ flex: 1 }}>{p.name}</b><button className="ghost x" onClick={e => { e.stopPropagation(); if (confirm('Delete palette?')) db.palettes.delete(p.id) }}>🗑</button></div></div>)}</div>}
  </section>
}
