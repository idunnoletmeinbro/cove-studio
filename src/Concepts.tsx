import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, STATUSES, type Concept } from './db'
import { Pic, Empty, Sheet, splitTags, canvasBlob, download, loadImage, wrapText, textOn } from './util'
import { Silhouette } from './Palette'

export const FEATURES = ['ears', 'tail', 'horns', 'wings', 'toggles', 'outfit swaps', 'face tracking', 'physbones', 'color variants', 'glow / emission', 'particles', 'props', 'quest version', 'custom textures']
export const blankConcept = (p: Partial<Concept> = {}): Concept => ({ id: uid(), name: '', tagline: '', vibes: [], species: '', personality: '', backstory: '', sketchIds: [], outfits: '', features: [], status: 'spark', createdAt: Date.now(), ...p })

export function Concepts({ edit, setEdit }: { edit: Concept | null; setEdit: (c: Concept | null) => void }) {
  const list = useLiveQuery(() => db.concepts.orderBy('createdAt').reverse().toArray()) ?? []
  const pals = useLiveQuery(() => db.palettes.toArray()) ?? []
  return <section>
    <div className="row head"><h2>Concept Cards</h2><button className="primary" onClick={() => setEdit(blankConcept())}>+ Concept</button></div>
    {!list.length ? <Empty icon="🐚" title="No concepts yet" sub="Turn an idea into a full character sheet." /> :
      <div className="grid wide">{list.map(c => { const p = pals.find(p => p.id === c.paletteId); return <div className="card concept" key={c.id} onClick={() => setEdit(c)}>
        <div className="c-top" style={{ background: p ? `linear-gradient(135deg,${p.colors.join(',')})` : undefined }}>{c.sketchIds[0] ? <Pic id={c.sketchIds[0]} /> : <Silhouette colors={p?.colors ?? []} size={110} />}</div>
        <div className="body"><span className={'chip st-' + c.status}>{c.status}</span><h4>{c.name || 'Untitled'}</h4><small>{c.tagline}</small><div className="tags">{c.vibes.slice(0, 4).map(v => <span className="chip" key={v}>{v}</span>)}</div></div></div> })}</div>}
    {edit && <ConceptEditor c={edit} onClose={() => setEdit(null)} />}
  </section>
}

function ConceptEditor({ c: c0, onClose }: { c: Concept; onClose: () => void }) {
  const [c, setC] = useState(c0); const s = (p: Partial<Concept>) => setC({ ...c, ...p })
  const pals = useLiveQuery(() => db.palettes.toArray()) ?? []; const boards = useLiveQuery(() => db.boards.toArray()) ?? []; const sketches = useLiveQuery(() => db.sketches.toArray()) ?? []
  const [vibes, setVibes] = useState(c.vibes.join(', '))
  const save = async () => { await db.concepts.put({ ...c, vibes: splitTags(vibes) }); onClose() }
  return <Sheet onClose={onClose}>
    <h3>Concept sheet</h3>
    <label>Name<input value={c.name} onChange={e => s({ name: e.target.value })} placeholder="e.g. Mochi the Moth Witch" /></label>
    <label>Tagline<input value={c.tagline} onChange={e => s({ tagline: e.target.value })} /></label>
    <label>Vibe words (comma separated)<input value={vibes} onChange={e => setVibes(e.target.value)} placeholder="cozy, witchy, pastel" /></label>
    <div className="two"><label>Species / body type<input value={c.species} onChange={e => s({ species: e.target.value })} /></label>
      <label>Status<select value={c.status} onChange={e => s({ status: e.target.value as any })}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select></label></div>
    <label>Personality<textarea value={c.personality} onChange={e => s({ personality: e.target.value })} /></label>
    <label>Backstory<textarea value={c.backstory} onChange={e => s({ backstory: e.target.value })} /></label>
    <label>Outfits (one per line)<textarea value={c.outfits} onChange={e => s({ outfits: e.target.value })} /></label>
    <label>Must-have features</label><div className="tags">{FEATURES.map(f => <button key={f} className={'chip tog' + (c.features.includes(f) ? ' on' : '')} onClick={() => s({ features: c.features.includes(f) ? c.features.filter(x => x !== f) : [...c.features, f] })}>{f}</button>)}</div>
    <div className="two"><label>Palette<select value={c.paletteId ?? ''} onChange={e => s({ paletteId: e.target.value || undefined })}><option value="">—</option>{pals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Mood board<select value={c.boardId ?? ''} onChange={e => s({ boardId: e.target.value || undefined })}><option value="">—</option>{boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
    {pals.find(p => p.id === c.paletteId) && <div className="pal">{pals.find(p => p.id === c.paletteId)!.colors.map((x, i) => <i key={i} style={{ background: x, height: 24 }} />)}</div>}
    <label>Linked sketches (tap to toggle)</label>
    <div className="pick-row">{sketches.length ? sketches.map(k => <div key={k.id} className={'pick' + (c.sketchIds.includes(k.id) ? ' on' : '')} onClick={() => s({ sketchIds: c.sketchIds.includes(k.id) ? c.sketchIds.filter(x => x !== k.id) : [...c.sketchIds, k.id] })}><Pic id={k.imageId} /></div>) : <small className="muted">No sketches yet</small>}</div>
    <div className="row actions"><button className="primary" onClick={save}>Save</button>
      <button onClick={() => exportConcept({ ...c, vibes: splitTags(vibes) })}>⬇ Card PNG</button><button onClick={() => window.print()}>🖨 Print</button>
      {c0.name && <button className="danger" onClick={async () => { if (confirm('Delete concept?')) { await db.concepts.delete(c.id); onClose() } }}>Delete</button>}</div>
  </Sheet>
}

async function exportConcept(c: Concept) {
  const pal = c.paletteId ? await db.palettes.get(c.paletteId) : undefined; const colors = pal?.colors ?? ['#5b3592', '#8e5fd0', '#a98bd6', '#ffd23f', '#f6a5b8']
  const W = 1200, H = 1600; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d')!
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#f3ecff'); g.addColorStop(1, '#fff6d6'); x.fillStyle = g; x.fillRect(0, 0, W, H)
  x.fillStyle = '#8e5fd0'; x.beginPath(); x.roundRect(40, 40, W - 80, 220, 40); x.fill()
  x.fillStyle = '#ffd23f'; x.font = '700 76px Fredoka, sans-serif'; x.fillText(c.name || 'Untitled', 80, 150)
  x.fillStyle = '#fff'; x.font = '600 34px Nunito, sans-serif'; x.fillText(c.tagline, 80, 210)
  // image
  const sk = c.sketchIds[0] ? await db.sketches.get(c.sketchIds[0]) : undefined; const im = sk ? await loadImage(sk.imageId) : null
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(60, 300, 500, 640, 30); x.fill()
  if (im) { const r = Math.min(480 / im.width, 620 / im.height); x.drawImage(im, 310 - im.width * r / 2, 620 - im.height * r / 2, im.width * r, im.height * r) }
  else { const svg = document.querySelector('.sil') ? null : null; void svg; x.fillStyle = colors[0]; x.font = '200px serif'; x.fillText('🥥', 210, 700) }
  colors.forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.roundRect(60 + i * (500 / colors.length), 960, 500 / colors.length - 8, 70, 14); x.fill(); x.fillStyle = textOn(col); x.font = '600 18px Nunito'; x.fillText(col, 70 + i * (500 / colors.length), 1020) })
  let y = 330; const col = 600, mw = W - col - 60
  const sec = (h: string, t: string) => { if (!t) return; x.fillStyle = '#5b3592'; x.font = '700 34px Fredoka, sans-serif'; x.fillText(h, col, y); y += 40; x.fillStyle = '#3b2560'; x.font = '400 26px Nunito, sans-serif'; for (const l of wrapText(x, t, mw).slice(0, 8)) { x.fillText(l, col, y); y += 34 } y += 20 }
  sec('Species / body', c.species); sec('Vibes', c.vibes.join(' · ')); sec('Personality', c.personality); sec('Features', c.features.join(' · ')); sec('Outfits', c.outfits.split('\n').filter(Boolean).join(' · '))
  y = Math.max(y, 1080); const sv = y; y = sv; const oc = col; void oc
  x.fillStyle = '#5b3592'; x.font = '700 34px Fredoka'; x.fillText('Backstory', 60, 1090); x.fillStyle = '#3b2560'; x.font = '400 26px Nunito'; wrapText(x, c.backstory || '—', W - 120).slice(0, 12).forEach((l, i) => x.fillText(l, 60, 1135 + i * 34))
  x.fillStyle = '#8e5fd0'; x.font = '600 22px Fredoka'; x.fillText('✿ Coconut Cove Creations · Cove Studio', 60, H - 40); x.fillText('status: ' + c.status, W - 260, H - 40)
  download(`${c.name || 'concept'}-card.png`, await canvasBlob(cv))
}
