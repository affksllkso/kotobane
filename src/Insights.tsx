import { BarChart3, ChevronRight, Info, ScanLine } from 'lucide-react';
import { useMemo, useState } from 'react';
import { kinds, type Kind, type Finding, type analyze } from './analysis';

type Statistics = ReturnType<typeof analyze>;

export function Metrics({ stats }: { stats: Statistics | null }) {
  const items = [
    ['文字数', stats?.characters, '字'],
    ['文の数', stats?.sentenceCount, '文'],
    ['平均文長', stats?.average, '字'],
    ['段落数', stats?.paragraphCount, '段落'],
  ] as const;
  return <div className="metrics">
    {items.map(([label, value, unit]) => <div className="metric" key={label}>
      <span>{label}</span><div><strong>{value?.toLocaleString('ja-JP') ?? '–'}</strong> <small>{unit}</small></div>
    </div>)}
  </div>;
}

export function Insights({ stats, onFindings }: { stats: Statistics | null; onFindings: () => void }) {
  const [tab, setTab] = useState<'overview' | 'statistics'>('overview');
  return <aside className="card insights" aria-label="分析レポート">
    <div className="card-heading"><BarChart3 size={19} /><h2>AI文体チェック</h2></div>
    <div className="tabs" aria-label="分析レポートの表示">
      <button className={tab === 'overview' ? 'selected' : ''} aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>検出結果</button>
      <button className={tab === 'statistics' ? 'selected' : ''} aria-pressed={tab === 'statistics'} onClick={() => setTab('statistics')}>文章の統計</button>
    </div>
    {!stats ? <div className="empty small"><BarChart3 size={28} /><p>「AI文体をチェック」を押すと、特徴と検出理由を確認できます。</p></div>
      : tab === 'overview' ? <>
        <div className="score">
          <div className="ring" role="img" aria-label={'AI文体特徴スコア ' + stats.score + ' / 100'} style={{ background: 'conic-gradient(var(--accent) ' + stats.score + '%, var(--ring) 0)' }}>
            <div><strong>{stats.score}</strong><small>/ 100</small></div>
          </div>
          <div><h3>AI文体特徴スコア</h3><p>AIの下書きにも現れる<br />定型表現や反復を集計</p></div>
        </div>
        <div className="factor-list">
          {(Object.keys(kinds) as Kind[]).map((kind) => <div className="factor" key={kind}>
            <div className="flex items-center justify-between gap-2"><span>{kinds[kind].label}</span><strong>{stats.factors[kind]}</strong></div>
            <div className="track" role="meter" aria-label={kinds[kind].label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.factors[kind]}><div style={{ width: stats.factors[kind] + '%', background: kinds[kind].color }} /></div>
          </div>)}
        </div>
        <div className="score-note"><Info size={16} /><p>人が書いた文章にも同じ特徴が現れます。執筆者や不正行為の判断には使えません。{stats.sentenceCount < 6 && ' 短文では値が変動しやすくなります。'}</p></div>
        <button className="findings-link" onClick={onFindings}><ScanLine size={16} />特徴を本文で確認<span>{stats.findings.length}件 <ChevronRight size={15} /></span></button>
      </> : <StatisticsPanel stats={stats} />}
  </aside>;
}

function StatisticsPanel({ stats }: { stats: Statistics }) {
  const lengths = [['30字以下', 0, 30], ['31～50字', 31, 50], ['51～70字', 51, 70], ['71字以上', 71, Infinity]] as const;
  return <div className="details">
    <div className="detail-metrics">
      <div>文字数 <strong>{stats.characters.toLocaleString()}字</strong></div><div>文の数 <strong>{stats.sentenceCount}文</strong></div>
      <div>平均文長 <strong>{stats.average}字</strong></div><div>段落数 <strong>{stats.paragraphCount}段落</strong></div>
      <div>語の出現数 <strong>{stats.wordCount}</strong></div><div>異なり語数 <strong>{stats.unique}</strong></div>
      <div>語彙の多様度 <strong>{stats.lexicalDiversity}%</strong></div><div>文長の標準偏差 <strong>{stats.spread}字</strong></div>
    </div>
    <h3>文の長さ</h3>
    {lengths.map(([label, low, high]) => {
      const count = stats.lengths.filter((length) => length >= low && length <= high).length;
      return <div className="length-row" key={label}><span>{label}</span><div className="track"><div style={{ width: (count / Math.max(1, stats.sentenceCount)) * 100 + '%' }} /></div><strong>{count}文</strong></div>;
    })}
    {([['頻出語', stats.topWords], ['文頭の接続詞', stats.connectors], ['文末表現', stats.endings]] as const).map(([label, values]) => <section key={label}><h3>{label}</h3>
      <div className="chips">{values.length ? values.map(([word, count]) => <span key={word}>{word} <b>{count}</b></span>) : <small>該当なし</small>}</div>
    </section>)}
    <h3>段落ごとの文字数</h3>
    <div className="chips paragraph-chips">{stats.paragraphSize.length ? stats.paragraphSize.map((length, index) => <span key={index}>{index + 1}段落 <b>{length}字</b></span>) : <small>該当なし</small>}</div>
  </div>;
}

export function Highlighted({ text, findings }: { text: string; findings: Finding[] }) {
  const [active, setActive] = useState<number | null>(null);
  const segments = useMemo(() => {
    const bounds = new Map<number, { begin: number[]; end: number[] }>();
    function boundary(position: number) {
      let value = bounds.get(position);
      if (!value) { value = { begin: [], end: [] }; bounds.set(position, value); }
      return value;
    }
    boundary(0); boundary(text.length);
    findings.forEach(({ start, end }, index) => { boundary(start).begin.push(index); boundary(end).end.push(index); });
    const opened = new Set<number>();
    const positions = [...bounds].sort(([a], [b]) => a - b);
    return positions.slice(0, -1).map(([position, event], index) => {
      event.end.forEach((id) => opened.delete(id));
      event.begin.forEach((id) => opened.add(id));
      const ids = [...opened].sort((a, b) => (findings[a].end - findings[a].start) - (findings[b].end - findings[b].start));
      return { position, ids, value: text.slice(position, positions[index + 1][0]) };
    });
  }, [text, findings]);
  const selected = active !== null ? segments.find((segment) => segment.position === active) : undefined;
  return <>
    <div className="annotated-text">
      {segments.map(({ position, ids, value }) => ids.length
        ? <button key={position} className={'highlight ' + findings[ids[0]].kind} aria-pressed={active === position}
          title={ids.map((id) => kinds[findings[id].kind].label).join('・')} onClick={() => setActive(position)}>{value}</button>
        : <span key={position}>{value}</span>)}
    </div>
    <div className="annotation" aria-live="polite">
      {selected ? selected.ids.map((id) => <p key={id}><strong>{kinds[findings[id].kind].label}</strong> {findings[id].reason}</p>)
        : <p>{findings.length ? '色付きの箇所を選ぶと、検出理由を確認できます。' : '該当する特徴はありませんでした。'}</p>}
    </div>
  </>;
}
