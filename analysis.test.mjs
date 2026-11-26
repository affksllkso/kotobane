import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, checkConsistency, countChars, getSentences, makeProfile } from '../src/analysis.ts';

test('段階1: 空白、和文、改行、句読点とUnicodeを集計する', () => {
  const value = ' 見出し\n\n😀猫が来た。犬も来た！\n調査を続ける。';
  const stats = analyze(value);
  assert.equal(stats.characters, countChars('見出し😀猫が来た。犬も来た！調査を続ける。'));
  assert.equal(stats.sentenceCount, 4);
  assert.equal(stats.paragraphCount, 2);
  assert.equal(stats.average, 5.3);
  assert.deepEqual(stats.paragraphSize, [3, 18]);
  assert.ok(stats.wordCount > stats.unique);
  assert.deepEqual(getSentences('「今日は晴れ。」明日は雨。').map(({ text }) => text), ['「今日は晴れ。」', '明日は雨。']);
  assert.equal(analyze(' \n ').score, 0);
});

test('段階2・5: 人手で指定した特徴ラベルと該当文字範囲を照合する', () => {
  const cases = [
    { text: '朝は駅まで歩く。帰宅後は紅茶を飲む。', expected: [] },
    { text: 'また、調査が必要である。検討も必要である。', expected: [['connector', 'また'], ['ending', 'である']] },
    { text: '対象を分けて集計することができる。', expected: [['formula', 'することができる']] },
    { text: '本稿では、したがってという語を扱う。結果は安定した。', expected: [] },
    { text: '結果を詳しく記録したうえで'.repeat(6) + '。', expected: [['length', '結果を詳しく記録したうえで'.repeat(6) + '。']] },
    { text: '結果の詳細を確認した。'.repeat(30), expected: [['structure', '結果の詳細を確認した。']] },
  ];
  for (const { text, expected } of cases) {
    const result = analyze(text);
    assert.deepEqual(result.findings.map(({ kind, start, end }) => [kind, text.slice(start, end)]), expected);
    assert.ok(result.score >= 0 && result.score <= 100);
  }
});

test('段階4: 数値、直接引用、参照、用語の削除と追加を検出する', () => {
  const checks = checkConsistency('「原文」[1]。中央値は12件（田中, 2020）。', '「変更」[2]。平均値は13件（田中, 2020）。', ['中央値', '平均値']);
  assert.deepEqual(checks.map(({ removed, added }) => [removed, added]), [
    [['12件'], ['13件']], [['「原文」'], ['「変更」']], [['[1]'], ['[2]']], [['中央値'], ['平均値']],
  ]);
  assert.deepEqual(checkConsistency('12件 12件', '12件', [])[0].removed, ['12件']);
});

test('接続詞1回だけの用例を残し、定型的な下書きと推敲案を比較する', () => {
  const draft = analyze('まず、資料の確認は極めて重要である。また、引用の記録は重要な役割を果たす。また、出典は確認する必要があると考えられる。');
  const polished = analyze('資料を確認し、引用した箇所を記録する。次に、出典を照合する。照合には原典を使う。');
  assert.ok(draft.score > polished.score);
  assert.equal(draft.findings.filter(({ kind }) => kind === 'formula').length, 3);
  assert.equal(draft.findings.filter(({ kind, reason }) => kind === 'connector' && reason.includes('複数回')).length, 2);
  assert.deepEqual(polished.connectors, [['次に', 1]]);
  assert.equal(polished.factors.connector, 0);
});

test('段階5: 著者本人の複数サンプルから集計値だけを返す', () => {
  const first = '授業で扱った先行研究を読み、その内容を学習活動の目的と照らし合わせて読み直しました。'.repeat(3);
  const second = 'また、利用した資料の出典を記録し、次回の調査で検討する内容をノートにまとめました。'.repeat(3);
  assert.throws(() => makeProfile('文体', [first, first]));
  const profile = makeProfile('文体', [first, second]);
  assert.equal(profile.sampleCount, 2);
  assert.equal(profile.sentenceCount, 6);
  assert.equal(profile.register, 'です・ます調');
  assert.deepEqual(profile.connectors, ['また']);
  assert.ok(!JSON.stringify(profile).includes(first));
});
