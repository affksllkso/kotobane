export const maxText = 20_000;
const connectorPattern = /^(?:しかしながら|その一方で|これに対して|これにより|そのため|したがって|したがいまして|一方で|例えば|たとえば|それゆえ|すなわち|言い換えると|このように|さらに|加えて|また|なお|ただし|その結果|結果として|以上より|以上のことから|最後に|次に|まず|一方|しかし|つまり|よって)(?=[、，,\s]|$)/u;
const formulaPattern = /重要であると言える|重要であるといえる|極めて重要である|重要な役割を果たす|極めて有意義である|と言えるでしょう|と言えるだろう|多角的な視点から|さまざまな観点から|様々な観点から|多岐にわたる課題|必要があると考えられる|今後の課題として挙げられる|一層の検討が求められる|と考えられる|と言える|といえる|することができる|においては/gu;
const wordSegmenter = new Intl.Segmenter('ja', { granularity: 'word' });
const jpSentence = /[^。！？!?\n]+[。！？!?]*[」』”）)]*|[。！？!?]+/gu;
const closing = /[。！？!?”」』）)\s]+$/gu;

export type Kind = 'formula' | 'connector' | 'ending' | 'length' | 'structure';
export const kinds: Record<Kind, { label: string; color: string }> = {
  formula: { label: '定型表現', color: '#b78224' },
  connector: { label: '接続詞', color: '#7960e9' },
  ending: { label: '文末の反復', color: '#408bc1' },
  length: { label: '文長の特徴', color: '#258a78' },
  structure: { label: '文章構成', color: '#ac5e8b' },
};

export type Finding = { kind: Kind; start: number; end: number; reason: string };
export type Sentence = { text: string; start: number; size: number; ending: string };
export type Profile = {
  name: string; sampleCount: number; sentenceCount: number; average: number;
  variety: number; register: string; connectors: string[];
};

export const countChars = (value: string) => Array.from(value.replace(/\s/gu, '')).length;
const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
const frequency = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

export function getSentences(text: string): Sentence[] {
  return Array.from(text.matchAll(jpSentence)).flatMap((match) => {
    const value = match[0].trim();
    if (!value || !/[\p{L}\p{N}]/u.test(value)) return [];
    const tail = value.replace(closing, '');
    const ending = tail.match(/(?:である|ではない|だった|でした|でしょう|ません|ました|ます|です|だ|ない)$/u)?.[0] ?? '';
    return [{ text: value, start: match.index + match[0].indexOf(value), size: countChars(value), ending }];
  });
}

export function analyze(text: string) {
  const sentences = getSentences(text);
  const sentenceCount = sentences.length;
  const paragraphs = text.trim() ? text.trim().split(/\r?\n[ \t\u3000]*\r?\n+/u) : [];
  const characters = countChars(text);
  const average = sentenceCount ? sentences.reduce((sum, item) => sum + item.size, 0) / sentenceCount : 0;
  const spread = sentenceCount ? Math.sqrt(sentences.reduce((sum, item) => sum + (item.size - average) ** 2, 0) / sentenceCount) : 0;
  const words = Array.from(wordSegmenter.segment(text.normalize('NFKC')), ({ segment, isWordLike }) => isWordLike ? segment.toLowerCase() : '').filter(Boolean);
  const lexicalDiversity = words.length ? new Set(words).size / words.length : 0;
  const findings: Finding[] = [];
  const connectors: string[] = [];
  const endings: string[] = [];
  const formulae: string[] = [];
  let longestRun = 0;
  let consecutive = 0;
  let previousEnding = '';
  let longCount = 0;
  for (const sentence of sentences) {
    const { start, text: value, ending, size } = sentence;
    const connector = value.match(connectorPattern)?.[0];
    if (connector) connectors.push(connector);
    for (const match of value.matchAll(formulaPattern)) {
      formulae.push(match[0]);
      findings.push({ kind: 'formula', start: start + match.index, end: start + match.index + match[0].length, reason: '汎用的な定型表現です。原文に具体的な根拠や対象があれば、それを文の中心に置くと判断の内容が伝わります。' });
    }
    consecutive = ending && ending === previousEnding ? consecutive + 1 : Number(Boolean(ending));
    longestRun = Math.max(longestRun, consecutive);
    previousEnding = ending;
    if (ending) endings.push(ending);
    if (consecutive >= 2) {
      const index = value.replace(closing, '').length - ending.length;
      findings.push({ kind: 'ending', start: start + index, end: start + index + ending.length, reason: '直前の文と同じ文末表現が続いています。レポートで文体を統一する場合には自然なこともあります。' });
    }
    if (size > 70) {
      longCount++;
      findings.push({ kind: 'length', start, end: start + value.length, reason: '70字を超える文です。一文の中に複数の論点が含まれていないか確認できます。' });
    }
  }
  const connectorCounts = new Map(frequency(connectors));
  const connectorDensity = connectors.length / Math.max(1, sentenceCount);
  let flaggedConnectors = 0;
  for (const { text: value, start } of sentences) {
    const connector = value.match(connectorPattern)?.[0];
    if (!connector) continue;
    const repeated = (connectorCounts.get(connector) ?? 0) >= 2;
    if (!repeated && (sentenceCount < 2 || connectorDensity < .4)) continue;
    flaggedConnectors++;
    findings.push({
      kind: 'connector', start, end: start + connector.length,
      reason: repeated
        ? '同じ接続詞が複数回使われています。つながりが明らかな箇所は省ける場合があります。'
        : sentenceCount + '文中' + connectors.length + '文が接続詞から始まっています。対比や因果関係が伝わる箇所には接続詞を残します。',
    });
  }
  const paragraphSize = paragraphs.map(countChars);
  const oversized = paragraphSize.filter((size) => size >= 300).length;
  let paragraphOffset = 0;
  for (const [index, paragraph] of paragraphs.entries()) {
    const start = text.indexOf(paragraph, paragraphOffset);
    paragraphOffset = start + paragraph.length;
    if (paragraphSize[index] >= 300) {
      const end = start + (getSentences(paragraph)[0]?.text.length ?? Math.min(45, paragraph.length));
      findings.push({ kind: 'structure', start, end, reason: '300字以上の段落の先頭です。論点が変わる箇所に段落を入れられるか確認できます。' });
    }
  }
  const scale = Math.max(1, sentenceCount);
  const factors: Record<Kind, number> = {
    formula: clamp(formulae.length / scale * 105),
    connector: clamp(flaggedConnectors / scale * 115),
    ending: clamp((longestRun - 1) / Math.max(1, sentenceCount - 1) * 100),
    length: clamp(longCount / scale * 70 + (sentenceCount >= 4 ? Math.max(0, 1 - spread / 15) * 30 : 0)),
    structure: clamp(oversized / Math.max(1, paragraphs.length) * 100),
  };
  const score = clamp(factors.formula * .38 + factors.connector * .24 + factors.ending * .23 + factors.length * .10 + factors.structure * .05);
  return {
    characters, sentenceCount, paragraphCount: paragraphs.length, average: round(average), spread: round(spread),
    wordCount: words.length, unique: new Set(words).size, lexicalDiversity: round(lexicalDiversity * 100),
    topWords: frequency(words.filter((word) => countChars(word) >= 2)).slice(0, 6),
    endings: frequency(endings), connectors: frequency(connectors), paragraphSize, score, factors,
    findings: findings.sort((a, b) => a.start - b.start || a.end - b.end),
    lengths: sentences.map(({ size }) => size),
  };
}

export function makeProfile(name: string, samples: string[]): Profile {
  const cleaned = samples.map((sample) => sample.trim()).filter(Boolean);
  const distinct = [...new Set(cleaned)];
  const statistics = analyze(distinct.join('\n\n'));
  if (distinct.length < 2 || statistics.characters < 200 || statistics.sentenceCount < 6) {
    throw new Error('異なる自作文を2本以上、合計200字・6文以上入力してください。');
  }
  const polite = statistics.endings.filter(([ending]) => /です|ます|ません|ました|でした|でしょう/u.test(ending)).reduce((sum, [, count]) => sum + count, 0);
  const formal = statistics.endings.filter(([ending]) => /^(である|ではない|だった|だ)$/u.test(ending)).reduce((sum, [, count]) => sum + count, 0);
  return {
    name: name.trim() || '自分の文体',
    sampleCount: distinct.length,
    sentenceCount: statistics.sentenceCount,
    average: statistics.average,
    variety: statistics.spread,
    register: polite > formal * 1.5 ? 'です・ます調' : formal > polite * 1.5 ? 'だ・である調' : '混在または判定保留',
    connectors: statistics.connectors.slice(0, 4).map(([word]) => word),
  };
}

export type Consistency = { label: string; removed: string[]; added: string[] };
export function checkConsistency(before: string, after: string, terms: string[]): Consistency[] {
  const extract = (text: string, pattern: RegExp) => Array.from(text.matchAll(pattern), ([value]) => value.trim());
  const changed = (label: string, oldValues: string[], newValues: string[]) => {
    const difference = (a: string[], b: string[]) => {
      const remaining = new Map(frequency(b));
      return a.filter((value) => {
        const count = remaining.get(value) ?? 0;
        if (count === 0) return true;
        remaining.set(value, count - 1);
        return false;
      });
    };
    return { label, removed: difference(oldValues, newValues), added: difference(newValues, oldValues) };
  };
  const numbers = /[+\-−]?(?:[0-9０-９]+(?:[.,，．][0-9０-９]+)*)(?:\s*[%％年月日円件人倍度点名万億])?/gu;
  const quotes = /「[^」\n]+」|『[^』\n]+』|“[^”\n]+”|"[^"\n]+"/gu;
  const citations = /https?:\/\/[^\s）)\]」。、，]+|\[[0-9０-９,、\s–-]+\]|［[0-9０-９,、\s–-]+］|[（(][^）)\n]{0,90}(?:19|20)\d{2}[a-z]?[^）)\n]{0,20}[）)]/gu;
  const extractTerms = (text: string) => terms.flatMap((term) => {
    const values: string[] = [];
    if (!term) return values;
    for (let index = text.indexOf(term); index !== -1; index = text.indexOf(term, index + term.length)) values.push(term);
    return values;
  });
  return [
    changed('数値・日付', extract(before.replace(citations, ' '), numbers), extract(after.replace(citations, ' '), numbers)),
    changed('引用文', extract(before, quotes), extract(after, quotes)),
    changed('出典・参照', extract(before, citations), extract(after, citations)),
    changed('指定した専門用語', extractTerms(before), extractTerms(after)),
  ];
}
