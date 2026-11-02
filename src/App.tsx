import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, saveImage, exportAll, importStudio, importVault, STATUSES, REF_CATS, type Idea, type Ref, type Concept, type Status } from './db'
import { Pic, Empty, Sheet, splitTags, pickFiles, download } from './util'
import { Boards, newBoard } from './Board'
import { Sketches } from './Sketch'
import { Palettes } from './Palette'
import { Concepts, blankConcept } from './Concepts'
import { SLOTS, roll, pick, dailySpark, sparkText, type SlotKey } from './spark'

type Tab = 'home' | 'ideas' | 'boards' | 'concepts' | 'sketch' | 'palette' | 'spark' | 'refs' | 'more'
const TABS: [Tab, string, string, boolean][] = [['home', '🏝', 'Home', true], ['ideas', '💡', 'Ideas', true], ['boards', '🌺', 'Boards', true], ['concepts', '🐚', 'Concepts', true], ['sketch', '✏️', 'Sketch', false], ['palette', '🎨', 'Palettes', false], ['spark', '✨', 'Spark', false], ['refs', '📸', 'Refs', false], ['more', '🥥', 'More', true]]
const STATUS_ICON: Record<Status, string> = { spark: '✨', exploring: '🔍', planned: '📝', made: '🌟' }

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [dark, setDark] = useState(() => localStorage.getItem('studio-theme') === 'dark')
  const [quick, setQuick] = useState<Partial<Idea> | null>(null)
  const [boardId, setBoardId] = useState<string | null>(null)
  const [concept, setConcept] = useState<Concept | null>(null)
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('studio-theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => { // share target / ?add=
    const p = new URLSearchParams(location.search); const text = [p.get('title'), p.get('text')].filter(Boolean).join(' — '); const link = p.get('url') ?? undefined
    if (text || link) { setQuick({ text, link }); history.replaceState(null, '', location.pathname) }
  }, [])
  const go = (t: Tab) => { setTab(t); setBoardId(null); window.scrollTo(0, 0) }
  return <div className="app">
    <header className="top"><img src="./logo.png" alt="Coconut Cove Creations" className="logo" /><h1>Cove Studio</h1>
      <button className="ghost" onClick={() => setDark(!dark)} aria-label="toggle theme">{dark ? '🌞' : '🌙'}</button></header>
    <nav className="nav">{TABS.map(([t, i, l, m]) => <button key={t} className={(tab === t ? 'on ' : '') + (m ? '' : 'desk')} onClick={() => go(t)}><span>{i}</span>{l}</button>)}</nav>
    <main>
      {tab === 'home' && <Home go={go} openConcept={c => { setConcept(c); go('concepts') }} quick={() => setQuick({})} />}
      {tab === 'ideas' && <Ideas toConcept={i => { setConcept(blankConcept({ name: i.text.slice(0, 40), backstory: i.text, ideaId: i.id })); setTab('concepts') }} />}
      {tab === 'boards' && <Boards openId={boardId} setOpenId={setBoardId} />}
      {tab === 'concepts' && <Concepts edit={concept} setEdit={setConcept} />}
      {tab === 'sketch' && <Sketches />}
      {tab === 'palette' && <Palettes />}
      {tab === 'spark' && <Spark />}
      {tab === 'refs' && <Refs openBoard={id => { setTab('boards'); setBoardId(id) }} />}
      {tab === 'more' && <More go={go} />}
    </main>
    {!(tab === 'boards' && boardId) && tab !== 'sketch' && <button className="fab" onClick={() => setQuick({})} aria-label="Quick add idea">＋</button>}
    {quick && <IdeaSheet idea={{ id: uid(), text: '', imageIds: [], tags: [], star: false, status: 'spark', createdAt: Date.now(), ...quick }} onClose={() => setQuick(null)} />}
  </div>
}

/* ---------- Home ---------- */
function Home({ go, openConcept, quick }: { go: (t: Tab) => void; openConcept: (c: Concept) => void; quick: () => void }) {
  const ideas = useLiveQuery(() => db.ideas.orderBy('createdAt').reverse().limit(6).toArray()) ?? []
  const concepts = useLiveQuery(() => db.concepts.filter(c => c.status === 'exploring' || c.status === 'planned').toArray()) ?? []
  const counts = useLiveQuery(async () => ({ ideas: await db.ideas.count(), boards: await db.boards.count(), sketches: await db.sketches.count(), palettes: await db.palettes.count() })) ?? { ideas: 0, boards: 0, sketches: 0, palettes: 0 }
  const s = useMemo(dailySpark, [])
  return <section>
    <div className="hero"><small>today's spark ✨</small><h2>{sparkText(s)}</h2>
      <div className="row actions"><button className="yellow" onClick={async () => { await db.ideas.put({ id: uid(), text: sparkText(s), imageIds: [], tags: ['spark', s.theme], star: false, status: 'spark', createdAt: Date.now() }); go('ideas') }}>💡 Save idea</button><button onClick={() => go('spark')}>🎲 More sparks</button></div></div>
    <div className="quick-grid">
      <button onClick={quick}>💡<b>Jot idea</b></button><button onClick={() => go('boards')}>🌺<b>Boards</b><small>{counts.boards}</small></button>
      <button onClick={() => go('sketch')}>✏️<b>Sketch</b><small>{counts.sketches}</small></button><button onClick={() => go('palette')}>🎨<b>Palettes</b><small>{counts.palettes}</small></button>
    </div>
    <div className="row head"><h3 style={{ flex: 1 }}>In-progress concepts</h3><button className="ghost" onClick={() => go('concepts')}>All →</button></div>
    {concepts.length ? <div className="hscroll">{concepts.map(c => <div key={c.id} className="mini" onClick={() => openConcept(c)}><b>{c.name || 'Untitled'}</b><small>{STATUS_ICON[c.status]} {c.status} · {c.species}</small></div>)}</div> : <p className="muted">Concepts set to “exploring” or “planned” show here.</p>}
    <div className="row head"><h3 style={{ flex: 1 }}>Recent ideas</h3><button className="ghost" onClick={() => go('ideas')}>All {counts.ideas} →</button></div>
    {ideas.length ? <div className="idea-list">{ideas.map(i => <IdeaCard key={i.id} i={i} onClick={() => go('ideas')} />)}</div> : <Empty icon="🥥" title="Your cove is quiet" sub="Tap ＋ to catch your first idea." />}
  </section>
}

/* ---------- Ideas ---------- */
function IdeaCard({ i, onClick }: { i: Idea; onClick: () => void }) {
  return <div className="idea" onClick={onClick}>
    {i.imageIds[0] && <Pic id={i.imageIds[0]} className="idea-img" />}
    <div className="idea-b"><div className="row"><span className={'chip st-' + i.status}>{STATUS_ICON[i.status]} {i.status}</span>{i.star && <span>⭐</span>}</div>
      <p>{i.text}</p>{i.link && <small className="ln">🔗 {i.link.replace(/^https?:\/\//, '').slice(0, 40)}</small>}
      <div className="tags">{i.tags.map(t => <span className="chip" key={t}>#{t}</span>)}</div></div></div>
}
function Ideas({ toConcept }: { toConcept: (i: Idea) => void }) {
  const all = useLiveQuery(() => db.ideas.orderBy('createdAt').reverse().toArray()) ?? []
  const [q, setQ] = useState(''); const [st, setSt] = useState(''); const [tag, setTag] = useState(''); const [star, setStar] = useState(false)
  const [edit, setEdit] = useState<Idea | null>(null); const [text, setText] = useState('')
  const tags = useMemo(() => [...new Set(all.flatMap(i => i.tags))].sort(), [all])
  const list = all.filter(i => (!st || i.status === st) && (!tag || i.tags.includes(tag)) && (!star || i.star) && (!q || (i.text + ' ' + i.tags.join(' ') + ' ' + (i.link ?? '')).toLowerCase().includes(q.toLowerCase())))
  const fast = async () => { if (!text.trim()) return; const tg = [...text.matchAll(/#([\w-]+)/g)].map(m => m[1]); const link = text.match(/https?:\/\/\S+/)?.[0]; await db.ideas.put({ id: uid(), text: text.trim(), link, imageIds: [], tags: tg, star: false, status: 'spark', createdAt: Date.now() }); setText('') }
  const drop = async (files: File[]) => { const ids: string[] = []; for (const f of files.filter(f => f.type.startsWith('image/'))) ids.push(await saveImage(f)); if (ids.length) await db.ideas.put({ id: uid(), text: text.trim() || 'Image idea', imageIds: ids, tags: [], star: false, status: 'spark', createdAt: Date.now() }); setText('') }
  return <section onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); drop([...e.dataTransfer.files]) }}>
    <div className="row head"><h2>Idea Inbox</h2></div>
    <div className="capture"><input placeholder="Catch an idea… (#tags and links work)" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && fast()} onPaste={e => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); drop(f) } }} />
      <button onClick={async () => drop(await pickFiles())} aria-label="add image">📷</button><button className="primary" onClick={fast}>Add</button></div>
    <div className="filters"><input placeholder="Search ideas" value={q} onChange={e => setQ(e.target.value)} />
      <select value={st} onChange={e => setSt(e.target.value)}><option value="">All status</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
      <select value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{tags.map(t => <option key={t}>{t}</option>)}</select>
      <button className={star ? 'on' : ''} onClick={() => setStar(!star)}>⭐</button></div>
    {!list.length ? <Empty icon="💡" title="No ideas here" sub="Type above, paste a screenshot, or drop images." /> :
      <div className="idea-list">{list.map(i => <IdeaCard key={i.id} i={i} onClick={() => setEdit(i)} />)}</div>}
    {edit && <IdeaSheet idea={edit} onClose={() => setEdit(null)} toConcept={toConcept} />}
  </section>
}
function IdeaSheet({ idea, onClose, toConcept }: { idea: Idea; onClose: () => void; toConcept?: (i: Idea) => void }) {
  const [i, setI] = useState(idea); const [tags, setTags] = useState(idea.tags.join(', '))
  const save = async () => { const v = { ...i, tags: splitTags(tags) }; if (v.text.trim() || v.imageIds.length || v.link) await db.ideas.put(v); onClose(); return v }
  return <Sheet onClose={onClose}>
    <h3>{idea.text ? 'Idea' : 'Quick idea 💡'}</h3>
    <textarea autoFocus value={i.text} onChange={e => setI({ ...i, text: e.target.value })} placeholder="What's the spark?" />
    <label>Link<input value={i.link ?? ''} onChange={e => setI({ ...i, link: e.target.value || undefined })} placeholder="https://…" /></label>
    <label>Tags<input value={tags} onChange={e => setTags(e.target.value)} placeholder="witchy, moth, outfit" /></label>
    <div className="stages">{STATUSES.map(s => <button key={s} className={i.status === s ? 'on' : ''} onClick={() => setI({ ...i, status: s })}>{STATUS_ICON[s]} {s}</button>)}</div>
    <div className="pick-row">{i.imageIds.map(id => <div className="pick" key={id}><Pic id={id} /><button className="x rm" onClick={() => setI({ ...i, imageIds: i.imageIds.filter(x => x !== id) })}>✕</button></div>)}
      <button onClick={async () => { const ids: string[] = []; for (const f of await pickFiles()) ids.push(await saveImage(f)); setI(v => ({ ...v, imageIds: [...v.imageIds, ...ids] })) }}>📷 Images</button></div>
    <div className="row actions"><button className="primary" onClick={save}>Save</button><button onClick={() => setI({ ...i, star: !i.star })}>{i.star ? '⭐ Starred' : '☆ Star'}</button>
      {toConcept && <button onClick={async () => toConcept(await save())}>🐚 Make concept</button>}
      {i.imageIds.length > 0 && <button onClick={async () => { const v = await save(); const b = newBoard(v.text.slice(0, 30) || 'Idea board'); b.tiles = v.imageIds.map((imageId, n) => ({ id: uid(), type: 'image', imageId, x: n * 280, y: 0, w: 260, h: 260, rot: 0, z: n })); await db.boards.put(b); alert('Board created ✿ — find it in Boards') }}>🌺 To board</button>}
      {idea.text && <button className="danger" onClick={async () => { await db.ideas.delete(i.id); onClose() }}>Delete</button>}</div>
  </Sheet>
}

/* ---------- Spark ---------- */
function Spark() {
  const [s, setS] = useState(roll()); const [locks, setLocks] = useState<Partial<Record<SlotKey, boolean>>>({}); const [msg, setMsg] = useState('')
  const reroll = (k?: SlotKey) => setS(o => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, (k ? key === k : !locks[key as SlotKey]) ? pick(SLOTS[key as SlotKey]) : v])) as any)
  return <section>
    <div className="row head"><h2>Spark Generator</h2></div>
    <div className="hero"><small>your mix</small><h2>{sparkText(s)}</h2></div>
    {(Object.keys(SLOTS) as SlotKey[]).map(k => <div key={k} className={'slot' + (locks[k] ? ' locked' : '')}>
      <small>{k}</small><b>{s[k]}</b>
      <button className="ghost" onClick={() => reroll(k)} aria-label="reroll">🎲</button>
      <button className="ghost" onClick={() => setLocks({ ...locks, [k]: !locks[k] })} aria-label="lock">{locks[k] ? '🔒' : '🔓'}</button></div>)}
    <div className="row actions"><button className="primary big" onClick={() => reroll()}>🎲 Reroll unlocked</button>
      <button className="yellow" onClick={async () => { await db.ideas.put({ id: uid(), text: sparkText(s), imageIds: [], tags: ['spark', s.theme, s.species], star: false, status: 'spark', createdAt: Date.now() }); setMsg('Saved to Idea Inbox ✿'); setTimeout(() => setMsg(''), 1500) }}>💡 Save to Inbox</button></div>
    {msg && <div className="toast">{msg}</div>}
  </section>
}

/* ---------- Refs ---------- */
function Refs({ openBoard }: { openBoard: (id: string) => void }) {
  const all = useLiveQuery(() => db.refs.orderBy('createdAt').reverse().toArray()) ?? []
  const boards = useLiveQuery(() => db.boards.toArray()) ?? []
  const [cat, setCat] = useState(''); const [q, setQ] = useState(''); const [edit, setEdit] = useState<Ref | null>(null)
  const list = all.filter(r => (!cat || r.category === cat) && (!q || (r.tags.join(' ') + ' ' + (r.note ?? '')).toLowerCase().includes(q.toLowerCase())))
  const add = async (files: File[]) => { for (const f of files.filter(f => f.type.startsWith('image/'))) await db.refs.put({ id: uid(), imageId: await saveImage(f), category: cat || 'other', tags: [], boardIds: [], createdAt: Date.now() }) }
  return <section onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add([...e.dataTransfer.files]) }}>
    <div className="row head"><h2>Reference Gallery</h2><button className="primary" onClick={async () => add(await pickFiles())}>+ Refs</button></div>
    <div className="stages"><button className={!cat ? 'on' : ''} onClick={() => setCat('')}>all</button>{REF_CATS.map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c} <small>{all.filter(r => r.category === c).length}</small></button>)}</div>
    <div className="filters"><input placeholder="Search tags & notes" value={q} onChange={e => setQ(e.target.value)} /></div>
    {!list.length ? <Empty icon="📸" title="No references" sub="Add hair, outfit, pose and texture refs. Drop or pick images." /> :
      <div className="masonry">{list.map(r => <figure key={r.id} onClick={() => setEdit(r)}><Pic id={r.imageId} /><figcaption><span className="chip">{r.category}</span>{r.tags.map(t => <span className="chip" key={t}>#{t}</span>)}</figcaption></figure>)}</div>}
    {edit && <RefSheet r={edit} boards={boards} onClose={() => setEdit(null)} openBoard={openBoard} />}
  </section>
}
function RefSheet({ r: r0, boards, onClose, openBoard }: { r: Ref; boards: any[]; onClose: () => void; openBoard: (id: string) => void }) {
  const [r, setR] = useState(r0); const [tags, setTags] = useState(r0.tags.join(', '))
  const save = () => db.refs.put({ ...r, tags: splitTags(tags) })
  return <Sheet onClose={onClose}><Pic id={r.imageId} className="ref-big" />
    <label>Category<select value={r.category} onChange={e => setR({ ...r, category: e.target.value })}>{REF_CATS.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Tags<input value={tags} onChange={e => setTags(e.target.value)} /></label>
    <label>Note<input value={r.note ?? ''} onChange={e => setR({ ...r, note: e.target.value })} /></label>
    <label>Add to board</label><div className="tags">{boards.map(b => <button key={b.id} className={'chip tog' + (r.boardIds.includes(b.id) ? ' on' : '')} onClick={async () => {
      if (r.boardIds.includes(b.id)) { openBoard(b.id); await save(); return }
      const fresh = await db.boards.get(b.id); if (fresh) { fresh.tiles.push({ id: uid(), type: 'image', imageId: r.imageId, x: 40 * fresh.tiles.length, y: 40 * fresh.tiles.length, w: 260, h: 260, rot: 0, z: fresh.tiles.length + 1 }); await db.boards.put({ ...fresh, updatedAt: Date.now() }) }
      setR({ ...r, boardIds: [...r.boardIds, b.id] })
    }}>{r.boardIds.includes(b.id) ? '✓ ' : '+ '}{b.name}</button>)}{!boards.length && <small className="muted">Make a board first</small>}</div>
    <div className="row actions"><button className="primary" onClick={async () => { await save(); onClose() }}>Save</button><button className="danger" onClick={async () => { await db.refs.delete(r.id); onClose() }}>Delete</button></div>
  </Sheet>
}

/* ---------- More ---------- */
function More({ go }: { go: (t: Tab) => void }) {
  const assets = useLiveQuery(() => db.assets.count()) ?? 0; const [msg, setMsg] = useState('')
  const readJson = async () => { const [f] = await pickFiles(false, 'application/json,.json'); return f ? JSON.parse(await f.text()) : null }
  return <section>
    <h2>Studio tools</h2>
    <div className="quick-grid">{TABS.filter(t => !t[3]).map(([t, i, l]) => <button key={t} onClick={() => go(t)}>{i}<b>{l}</b></button>)}</div>
    <div className="card pad"><h3>🥥 Cove Vault bridge</h3><p className="muted">Import a Cove Vault export so your owned assets can be dropped onto boards as tiles. {assets} assets loaded.</p>
      <div className="row actions"><button onClick={async () => { try { const d = await readJson(); if (d) setMsg(`Imported ${await importVault(d)} assets ✿`) } catch (e: any) { setMsg(e.message) } }}>Import Cove Vault export</button>
        {assets > 0 && <button onClick={async () => { await db.assets.clear(); setMsg('Cleared vault assets') }}>Clear</button>}</div></div>
    <div className="card pad"><h3>💾 Backup</h3><p className="muted">Everything lives on this device only. Export a backup to move it between phone and desktop.</p>
      <div className="row actions"><button className="primary" onClick={async () => { download(`cove-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(await exportAll())], { type: 'application/json' })) }}>Export backup</button>
        <button onClick={async () => { try { const d = await readJson(); if (d) { await importStudio(d); setMsg('Backup restored ✿') } } catch (e: any) { setMsg(e.message) } }}>Restore backup</button></div></div>
    {msg && <div className="toast">{msg}</div>}
    <p className="center muted">Cove Studio · a Coconut Cove Creations companion to <a href="https://idunnoletmeinbro.github.io/cove-vault/">Cove Vault</a></p>
  </section>
}
