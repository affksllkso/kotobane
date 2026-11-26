import { diffArrays } from 'diff';

const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
const tokenize = (text: string) => Array.from(segmenter.segment(text), ({ segment }) => segment);

export function compareJapanese(before: string, after: string) {
  return diffArrays(tokenize(before), tokenize(after), { timeout: 250 })?.map((part) => ({
    ...part, value: part.value.join(''),
  }));
}
