import { Activity, ArrowUpRight, BookOpen, Check, CircleHelp, Clipboard, Clock3, FileDown, FileText, History as HistoryIcon, Layers3, Moon, PenLine, ScanLine, Sparkles, Sun, Trash2, Upload, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { analyze, countChars, kinds, makeProfile, maxText } from './analysis';
import { exportDocument, readDocument } from './files';
import { Highlighted, Insights } from './Insights';
import { loadLocal, providerNames, saveLocal, type History, type Provider, type Revision, type StoredProfile } from './model';
import { RevisionView } from './RevisionView';
import { sample } from './sample';

type Page = 'workspace' | 'history' | 'profiles';
const pages = [
  { id: 'workspace', label: '文章スタジオ', icon: PenLine },
  { id: 'history', label: '履歴', icon: HistoryIcon },
  { id: 'profiles', label: '文体プロファイル', icon: UserRound },
] as const;
const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

export function App() {
  const [page, setPage] = useState<Page>('workspace');
  const [text, setText] = useState(sample);
  const [snapshot, setSnapshot] = useState<string | null>(sample);
  const [editorTab, setEditorTab] = useState<'edit' | 'findings'>('edit');
  const [history, setHistory] = useState(() => loadLocal<History[]>('history', []));
  const [profiles, setProfiles] = useState(() => loadLocal<StoredProfile[]>('profiles', []));
  const [theme, setTheme] = useState(() => loadLocal('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [provider, setProvider] = useState<Provider>(() => loadLocal<Provider>('provider', 'gemini') === 'openai' ? 'openai' : 'gemini');
  const [config, setConfig] = useState<Partial<Record<Provider, boolean>>>({});
  const [revision, setRevision] = useState<Revision | null>(null);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; error: boolean } | null>(null);
  const [style, setStyle] = useState('原文の文体');
  const [target, setTarget] = useState('');
  const [level, setLevel] = useState('中');
  const [terms, setTerms] = useState('');
  const [profileId, setProfileId] = useState('');
  const [mode, setMode] = useState<'all' | 'partial'>('all');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [help, setHelp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editorCard = useRef<HTMLElement>(null);
  const rewriteHeading = useRef<HTMLHeadingElement>(null);
  const resultAnchor = useRef<HTMLDivElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);

  const stats = useMemo(() => snapshot === null ? null : analyze(snapshot), [snapshot]);
  const limitCount = useMemo(() => Array.from(text).length, [text]);
  const characters = useMemo(() => countChars(text), [text]);
  const selectedText = text.slice(selection.start, selection.end);
  const dirty = snapshot !== text;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return;
      const available = await response.json();
      if (!cancelled) {
        setConfig(available);
        setProvider((pref) => available[pref] ? pref : available.gemini ? 'gemini' : available.openai ? 'openai' : pref);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161723' : '#f7f8fc');
    try { saveLocal('theme', theme); } catch { /* Theme still applies for this session. */ }
  }, [theme]);
  useEffect(() => {
    if (!notification || notification.error) return;
    const timer = setTimeout(() => setNotification(null), 4500);
    return () => clearTimeout(timer);
  }, [notification]);
  useEffect(() => {
    if (help && !helpDialog.current?.open) helpDialog.current?.showModal();
    if (!help && helpDialog.current?.open) helpDialog.current.close();
  }, [help]);

  function notify(message: string, error = false) { setNotification({ message, error }); }
  function persistHistory(next: History[]) {
    try { saveLocal('history', next); setHistory(next); return true; }
    catch { notify('端末の保存容量またはブラウザー設定を確認してください。履歴は保存できませんでした。', true); return false; }
  }
  function addHistory(item: Omit<History, 'id' | 'date'>) {
    return persistHistory([{ ...item, id: crypto.randomUUID(), date: new Date().toISOString() }, ...history].slice(0, 40));
  }
  function navigate(next: Page) {
    if (pending || reading) return;
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function replaceText(value: string) {
    setText(value);
    setSelection({ start: 0, end: 0 });
    setEditorTab('edit');
  }
  function runAnalysis() {
    if (!text.trim() || limitCount > maxText) return;
    setSnapshot(text);
    setEditorTab('findings');
    if (addHistory({ type: 'analysis', text })) notify('文体のチェック結果を履歴に保存しました。');
  }
  function focusRewrite() {
    rewriteHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    rewriteHeading.current?.focus({ preventScroll: true });
  }
  function showFindings() {
    setEditorTab('findings');
    editorCard.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function applyRevision(value: string, show: boolean) {
    if (pending || reading) return;
    replaceText(value);
    setSnapshot(value);
    if (show) setEditorTab('findings');
    editorCard.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setReading(true);
    try {
      const value = await readDocument(file);
      replaceText(value);
      setSnapshot(null);
      notify(file.name + ' を読み込みました。');
    } catch (error) { notify(error instanceof Error ? error.message : 'ファイルを読み込めませんでした。', true); }
    finally { setReading(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); notify('クリップボードにコピーしました。'); }
    catch { notify('コピーできませんでした。文章を選択し、ブラウザーのコピー機能を使ってください。', true); }
  }
  async function download(value: string, format: 'txt' | 'docx') {
    try { await exportDocument(value, format); }
    catch { notify('ファイルの出力に失敗しました。', true); }
  }
  async function rewrite() {
    if (pending || !text.trim() || limitCount > maxText) return;
    const before = text;
    const partial = mode === 'partial';
    const start = partial ? selection.start : 0;
    const end = partial ? selection.end : before.length;
    if (!before.slice(start, end).trim()) { notify('入力欄でリライトする文章を選択してください。', true); return; }
    const expected = target ? Number(target) : null;
    if (expected !== null && (!Number.isInteger(expected) || expected < 1 || expected > maxText)) {
      notify('目標文字数は1～20,000の整数で指定してください。', true); return;
    }
    const glossary = [...new Set(terms.split(/[、,，\n]/u).map((term) => term.trim()).filter(Boolean))].slice(0, 40);
    const findings = (snapshot === before && stats ? stats : analyze(before)).findings
      .filter((finding) => finding.start >= start && finding.end <= end)
      .sort((a, b) => Number(a.kind === 'length' || a.kind === 'structure') - Number(b.kind === 'length' || b.kind === 'structure'))
      .slice(0, 24)
      .map(({ kind, start, end }) => ({ kind, start, end }));
    setPending(true);
    try {
      const response = await fetch('/api/rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, text: before, start, end, style, level, target: expected, terms: glossary, findings, profile: profiles.find((profile) => profile.id === profileId) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error ?? 'リライト用のサーバーに接続できませんでした。');
      const original = before.slice(start, end);
      const replacement = (original.match(/^\s*/u)?.[0] ?? '') + data.text + (original.match(/\s*$/u)?.[0] ?? '');
      const after = before.slice(0, start) + replacement + before.slice(end);
      if (Array.from(after).length > maxText) throw new Error('リライト後の全文が20,000字を超えました。短めの目標文字数を指定してください。');
      const next: Revision = { before, after, review: data.checks, provider, terms: glossary, target: expected, actual: countChars(data.text), partial };
      setRevision(next);
      if (addHistory({ type: 'rewrite', text: before, revision: next })) notify('リライト案を作成し、履歴に保存しました。');
      requestAnimationFrame(() => resultAnchor.current?.scrollIntoView({ behavior: 'smooth' }));
    } catch (error) { notify(error instanceof Error ? error.message : 'リライトに失敗しました。', true); }
    finally { setPending(false); }
  }
  function restore(entry: History) {
    replaceText(entry.text);
    setSnapshot(entry.text);
    setRevision(entry.revision ?? null);
    navigate('workspace');
  }
  function updateProfiles(next: StoredProfile[]) {
    try { saveLocal('profiles', next); setProfiles(next); return true; }
    catch { notify('文体プロファイルを保存できませんでした。', true); return false; }
  }

  const nav = pages.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span></button>);
  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('workspace')} aria-label="ことばね ホーム">
        <img src="/icon.svg" alt="" /><span><strong>ことばね</strong><small>日本語文章スタジオ</small></span>
      </button>
      <nav className="navigation" aria-label="メインナビゲーション">{nav}</nav>
      <div className="sidebar-foot"><button onClick={() => setHelp(true)}><CircleHelp size={18} /><span>使い方</span></button><p>文章分析は端末内で処理</p></div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><Layers3 size={16} /><span>ワークスペース</span><span className="slash">/</span><strong>{pages.find(({ id }) => id === page)?.label}</strong></div>
        <div className="top-actions">
          <span className="local-label"><i />ローカル保存</span>
          <button className="icon-button" aria-label={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
        </div>
      </header>
      <main>
        {page === 'workspace' && <>
          <div className="page-intro">
            <div><h1>AIの文章を自然な日本語に</h1><p>定型句や同じ文末の繰り返しを見つけ、主張や引用を保ちながら読みやすく整えます。</p></div>
            <button className="button secondary" disabled={pending || reading} onClick={() => { replaceText(sample); setSnapshot(sample); }}><BookOpen size={16} />サンプルを使う</button>
          </div>
          <div className="workspace-grid">
            <section className="card editor-card" ref={editorCard}>
              <div className="editor-heading">
                <div className="card-heading"><FileText size={19} /><h2>原稿</h2></div>
                <button className="button secondary upload" disabled={reading || pending} onClick={() => fileInput.current?.click()}><Upload size={15} />{reading ? '読み込み中…' : 'ファイルを読み込む'}</button>
                <input ref={fileInput} className="sr-only" type="file" accept=".pdf,.docx,.txt" aria-label="PDF・Word・テキストを読み込む" tabIndex={-1} onChange={importFile} />
              </div>
              <div className="tabs" aria-label="原稿の表示">
                <button className={editorTab === 'edit' ? 'selected' : ''} aria-pressed={editorTab === 'edit'} onClick={() => setEditorTab('edit')}>入力</button>
                <button className={editorTab === 'findings' ? 'selected' : ''} aria-pressed={editorTab === 'findings'} disabled={!stats} onClick={showFindings}><ScanLine size={15} />ハイライト{stats ? <span className="tab-count">{stats.findings.length}</span> : null}</button>
              </div>
              <div className="editor-body">
                {dirty && stats && <p className="stale" role="status">分析レポートとハイライトは前回の分析結果です。</p>}
                {editorTab === 'edit'
                  ? <textarea ref={editor} aria-label="日本語の原稿" value={text} placeholder="自然な文章に整えたい下書きを貼り付けてください。" disabled={reading || pending}
                      onChange={(event) => { setText(event.target.value); setSelection({ start: event.target.selectionStart, end: event.target.selectionEnd }); }}
                      onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} />
                  : stats && snapshot !== null && <>
                      <div className="legend">{Object.entries(kinds).map(([id, kind]) => <span key={id}><i style={{ background: kind.color }} />{kind.label}</span>)}</div>
                      <Highlighted key={snapshot} text={snapshot} findings={stats.findings} />
                    </>}
                <div className="editor-toolbar">
                  <span className={limitCount > maxText ? 'invalid' : ''}>{characters.toLocaleString()} 字{limitCount > maxText && ' ／ 入力上限20,000字'}</span>
                  <div className="flex gap-1">
                    <button className="icon-button" disabled={!text.trim()} aria-label="原稿をコピー" title="原稿をコピー" onClick={() => void copy(text)}><Clipboard size={16} /></button>
                    <details className="export-menu"><summary className="icon-button" aria-label="原稿を出力" title="原稿を出力"><FileDown size={16} /></summary>
                      <div><button disabled={!text.trim()} onClick={() => void download(text, 'docx')}>Word（.docx）</button><button disabled={!text.trim()} onClick={() => void download(text, 'txt')}>テキスト（.txt）</button></div>
                    </details>
                  </div>
                </div>
              </div>
              <div className="editor-footer">
                <button className="button primary" disabled={!text.trim() || limitCount > maxText || reading || pending} onClick={runAnalysis}><Activity size={17} />AI文体をチェック</button>
                <button className="button secondary" disabled={!text.trim() || limitCount > maxText || reading || pending} onClick={focusRewrite}><Sparkles size={16} />自然な文章に整える</button>
              </div>
            </section>
            <Insights stats={stats} onFindings={showFindings} />
          </div>
          <section className="card rewrite-card">
            <div className="card-heading"><Sparkles size={20} /><h2 ref={rewriteHeading} tabIndex={-1}>自然な文章に整える</h2></div>
            <p>検出した箇所を手掛かりに書き換え、原文との違いを表示します。</p>
            <form onSubmit={(event) => { event.preventDefault(); void rewrite(); }}>
              <fieldset disabled={pending || reading}>
                <legend className="sr-only">リライト設定</legend>
                <div className="rewrite-fields">
                  <label>範囲<select value={mode} onChange={(event) => { const next = event.target.value === 'partial' ? 'partial' : 'all'; setMode(next); if (next === 'partial') setEditorTab('edit'); }}><option value="all">全文</option><option value="partial">選択範囲</option></select></label>
                  <label>文体<select value={style} onChange={(event) => setStyle(event.target.value)}>{['原文の文体', 'だ・である調', 'です・ます調', '平易な日本語'].map((option) => <option key={option}>{option}</option>)}</select></label>
                  <label>目標文字数<input type="number" min={1} max={maxText} step={1} placeholder="指定なし" value={target} onChange={(event) => setTarget(event.target.value)} /></label>
                  <label>変更度<select value={level} onChange={(event) => setLevel(event.target.value)}>{['小', '中', '大'].map((option) => <option key={option}>{option}</option>)}</select></label>
                  <label>AIサービス<select value={provider} onChange={(event) => {
                    const choice = event.target.value as Provider; setProvider(choice);
                    try { saveLocal('provider', choice); } catch { /* Selection remains active. */ }
                  }}><option value="gemini">Gemini{config.gemini === false ? '（未設定）' : ''}</option><option value="openai">OpenAI{config.openai === false ? '（未設定）' : ''}</option></select></label>
                  <label>文体プロファイル<select value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">使用しない</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                  <label className="wide-field">維持する専門用語<input value={terms} maxLength={1600} placeholder="例　形態素解析、語彙多様性" onChange={(event) => setTerms(event.target.value)} /></label>
                </div>
                {mode === 'partial' && <button type="button" className="text-button" onClick={() => { setEditorTab('edit'); requestAnimationFrame(() => editor.current?.focus()); }}>{selectedText.trim() ? '選択中 ' + countChars(selectedText) + '字・範囲を変更' : '原稿の入力欄で範囲を選択'}</button>}
                <div className="rewrite-footer">
                  <span>{config[provider] === false ? providerNames[provider] + ' のキーとモデルを .env に設定してください。' : '実行すると、対象の文章と前後の文脈を選択したAIサービスに送信します。'}</span>
                  <button className="button primary" disabled={!text.trim() || limitCount > maxText || config[provider] === false || (mode === 'partial' && !selectedText.trim())} type="submit"><Sparkles size={16} />{pending ? '文章を整えています…' : '書き換え案を作る'}</button>
                </div>
              </fieldset>
            </form>
          </section>
          <div ref={resultAnchor}>{revision && <RevisionView key={revision.before + '\u0000' + revision.after} revision={revision} onCopy={(value) => void copy(value)} onExport={(value, format) => void download(value, format)} onApply={applyRevision} />}</div>
        </>}
        {page === 'history' && <>
          <div className="page-intro"><div><h1>履歴</h1><p>このブラウザーに保存した分析とリライトを開きます。</p></div></div>
          <section className="card collection">
            {!history.length ? <div className="empty"><Clock3 size={30} /><h2>保存された履歴はありません</h2><button className="button primary" onClick={() => navigate('workspace')}>文章スタジオを開く</button></div>
              : history.map((entry) => <article key={entry.id} className="list-row">
                <div className="item-icon">{entry.type === 'rewrite' ? <Sparkles size={19} /> : <Activity size={19} />}</div>
                <button className="list-open" onClick={() => restore(entry)}><strong>{entry.text.trim().slice(0, 90)}</strong><small>{entry.type === 'rewrite' ? 'リライト' : '分析'} · {dateFormat.format(new Date(entry.date))} · {countChars(entry.text)}字</small></button>
                <button className="icon-button" aria-label="この履歴を開く" title="開く" onClick={() => restore(entry)}><ArrowUpRight size={18} /></button>
                <button className="icon-button" disabled={pending} aria-label="この履歴を削除" title="削除" onClick={() => { if (persistHistory(history.filter(({ id }) => id !== entry.id))) notify('履歴を削除しました。'); }}><Trash2 size={17} /></button>
              </article>)}
          </section>
        </>}
        {page === 'profiles' && <Profiles profiles={profiles} onSave={(name, samples) => {
          try {
            const profile = { ...makeProfile(name, samples), id: crypto.randomUUID() };
            if (!updateProfiles([profile, ...profiles])) return false;
            setProfileId(profile.id); notify('文体プロファイルを保存しました。'); return true;
          } catch (error) { notify(error instanceof Error ? error.message : 'プロファイルを作成できませんでした。', true); return false; }
        }} onDelete={(id) => { if (updateProfiles(profiles.filter((profile) => profile.id !== id)) && profileId === id) setProfileId(''); }} />}
      </main>
    </div>
    <dialog ref={helpDialog} onClose={() => setHelp(false)}>
      <div className="card-heading"><CircleHelp size={19} /><h2>使い方</h2><button className="icon-button" aria-label="閉じる" onClick={() => setHelp(false)}><X size={18} /></button></div>
      <ol><li>下書きを貼り付けるか、PDF・Word（.docx）・テキストを読み込みます。</li><li>「AI文体をチェック」を押し、色付きの箇所を選んで検出理由を確認します。</li><li>「書き換え案を作る」を押し、原文と比較して採用するか決めます。</li></ol>
      <p>AI文体特徴スコアは定型表現や接続詞の反復などの集計値です。執筆者の特定や不正行為の判断には使えません。</p>
    </dialog>
    {notification && <div className={'toast ' + (notification.error ? 'toast-error' : '')} role={notification.error ? 'alert' : 'status'}>
      {notification.error ? <CircleHelp size={19} /> : <Check size={19} />}<span>{notification.message}</span><button className="icon-button" aria-label="通知を閉じる" onClick={() => setNotification(null)}><X size={16} /></button>
    </div>}
  </div>;
}

function Profiles({ profiles, onSave, onDelete }: { profiles: StoredProfile[]; onSave: (name: string, samples: string[]) => boolean; onDelete: (id: string) => void }) {
  const [name, setName] = useState('');
  const [samples, setSamples] = useState(['', '']);
  return <>
    <div className="page-intro"><div><h1>文体プロファイル</h1><p>自作文の文長や文末の傾向を、リライト時に参照できます。</p></div></div>
    <section className="card rewrite-card profile-card">
      <div className="card-heading"><UserRound size={19} /><h2>プロファイルを作成</h2></div>
      <p>異なる自作文を2本以上、合計200字・6文以上入力してください。保存するのは文体の集計値です。</p>
      <form onSubmit={(event) => { event.preventDefault(); if (onSave(name, samples)) { setName(''); setSamples(['', '']); } }}>
        <label>プロファイル名<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="例　大学レポート" /></label>
        <div className="sample-grid">{samples.map((value, index) => <label key={index}>自作文 {index + 1}<textarea value={value} maxLength={maxText} onChange={(event) => setSamples(samples.map((sampleText, i) => i === index ? event.target.value : sampleText))} /></label>)}</div>
        <div className="rewrite-footer"><button type="button" className="button secondary" disabled={samples.length >= 6} onClick={() => setSamples([...samples, ''])}>自作文を追加</button><button className="button primary" type="submit">プロファイルを保存</button></div>
      </form>
    </section>
    {profiles.length > 0 && <section className="card collection">{profiles.map((profile) => <article className="list-row" key={profile.id}>
      <div className="item-icon"><UserRound size={18} /></div><div className="list-open"><strong>{profile.name}</strong><small>{profile.sampleCount}本 · {profile.sentenceCount}文 · 平均{profile.average}字 · {profile.register}{profile.connectors.length ? ' · ' + profile.connectors.join('、') : ''}</small></div>
      <button className="icon-button" title="削除" aria-label={'プロファイルを削除 ' + profile.name} onClick={() => onDelete(profile.id)}><Trash2 size={17} /></button>
    </article>)}</section>}
  </>;
}
