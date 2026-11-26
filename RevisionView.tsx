import { ArrowLeftRight, Clipboard, FileDown, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { analyze, checkConsistency } from './analysis';
import { compareJapanese } from './difference';
import { Metrics, Insights } from './Insights';
import { providerNames, type Revision } from './model';

export function RevisionView({ revision, onCopy, onExport, onApply }: {
  revision: Revision;
  onCopy: (text: string) => void;
  onExport: (text: string, format: 'txt' | 'docx') => void;
  onApply: (text: string, showFindings: boolean) => void;
}) {
  const [diff, setDiff] = useState(true);
  const [reanalyzed, setReanalyzed] = useState(false);
  const changes = useMemo(() => compareJapanese(revision.before, revision.after), [revision]);
  const checks = useMemo(() => checkConsistency(revision.before, revision.after, revision.terms), [revision]);
  const beforeStats = useMemo(() => analyze(revision.before), [revision.before]);
  const afterStats = useMemo(() => analyze(revision.after), [revision.after]);
  const panel = (after: boolean) => diff && changes
    ? changes.filter((change) => after ? !change.removed : !change.added).map((change, index) =>
      <span key={index} className={change.added ? 'addition' : change.removed ? 'deletion' : ''}>{change.value}</span>)
    : after ? revision.after : revision.before;
  return <div className="results">
    <section className="card result-card">
      <div className="card-heading"><ArrowLeftRight size={19} /><h2>変換前後の比較</h2><span className="tag">{providerNames[revision.provider]}</span></div>
      <div className="comparison-actions">
        <div className="segmented">
          <button aria-pressed={!diff} onClick={() => setDiff(false)}>並列表示</button>
          <button aria-pressed={diff} onClick={() => setDiff(true)}>差分表示</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button secondary" onClick={() => onCopy(revision.after)}><Clipboard size={15} />コピー</button>
          <button className="button secondary" onClick={() => onExport(revision.after, 'docx')}><FileDown size={15} />Word</button>
          <button className="button secondary" onClick={() => onExport(revision.after, 'txt')}><FileDown size={15} />テキスト</button>
        </div>
      </div>
      {!changes && diff && <p className="subtle">差分が大きいため、文章を並列で表示しています。</p>}
      <div className="compare">
        <div><h3>原文 <span className="tag">AI文体特徴 {beforeStats.score} / 100</span></h3><div className="compare-text">{panel(false)}</div></div>
        <div><h3>書き換え案 <span className="tag">AI文体特徴 {afterStats.score} / 100</span></h3><div className="compare-text">{panel(true)}</div></div>
      </div>
      <div className="comparison-actions result-footer">
        <span>{revision.partial ? '選択範囲' : '全文'}の出力 {revision.actual.toLocaleString()}字{revision.target !== null && ' ／ 目標 ' + revision.target.toLocaleString() + '字'}</span>
        <div className="flex flex-wrap gap-2">
          <button className="button secondary" aria-expanded={reanalyzed} onClick={() => setReanalyzed(!reanalyzed)}>{reanalyzed ? '再チェック結果を閉じる' : '書き換え案の文体を確認'}</button>
          <button className="button primary" onClick={() => onApply(revision.after, false)}>編集欄に反映</button>
        </div>
      </div>
    </section>
    <section className="card result-card">
      <div className="card-heading"><ShieldCheck size={19} /><h2>整合性チェック</h2></div>
      <div className="review-grid">
        <div><h3>表記の照合</h3><div className="review-items">{checks.map((check) => {
          const changed = Boolean(check.removed.length || check.added.length);
          return <div key={check.label}><div className="review-heading"><strong>{check.label}</strong><span className={'tag ' + (changed ? 'caution' : '')}>{changed ? '要確認' : '差分なし'}</span></div>
            {changed && <p>{[check.removed.length ? '削除 ' + check.removed.slice(0, 5).join('、') : '', check.added.length ? '追加 ' + check.added.slice(0, 5).join('、') : ''].filter(Boolean).join(' ／ ')}{Math.max(check.removed.length, check.added.length) > 5 && '（各5件まで表示）'}</p>}
          </div>;
        })}</div></div>
        <div><h3>AIによる原文との比較</h3><div className="review-items">{revision.review.map((item) => <div key={item.category}>
          <div className="review-heading"><strong>{item.category}</strong><span className={'tag ' + (item.status === '要確認' ? 'caution' : '')}>{item.status}</span></div><p>{item.note}</p>
        </div>)}</div></div>
      </div>
      <p className="subtle">自動照合で拾えない意味や根拠の変化があります。提出前に原文と照らし合わせてください。</p>
    </section>
    {reanalyzed && <section className="result-stats" aria-label="書き換え案の再チェック"><Metrics stats={afterStats} /><Insights stats={afterStats} onFindings={() => onApply(revision.after, true)} /></section>}
  </div>;
}
