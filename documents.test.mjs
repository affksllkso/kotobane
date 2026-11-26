import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Document, Packer, Paragraph } from 'docx';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { compareJapanese } from '../src/difference.ts';

test('段階4: CIDフォントを使う日本語PDFから文字を抽出する', async () => {
  const data = new Uint8Array(await readFile(new URL('./fixtures/japanese.pdf', import.meta.url)));
  const cMapUrl = fileURLToPath(new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url)).replaceAll('\\', '/');
  const task = getDocument({ data, cMapUrl, isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    assert.equal(content.items.map((item) => item.str ?? '').join(''), '日本語PDFの読み込み確認。');
  } finally { await task.destroy(); }
});

test('段階4: Wordの出力と読み込みで日本語と改行が維持される', async () => {
  const lines = ['生成AIと大学教育', '主張と引用の整合性を確認する。'];
  const document = new Document({ sections: [{ children: lines.map((line) => new Paragraph(line)) }] });
  const buffer = await Packer.toBuffer(document);
  const imported = await mammoth.extractRawText({ buffer });
  assert.deepEqual(imported.value.trim().split(/\n+/u), lines);
});

test('段階4: 日本語差分から入力と出力の双方を復元できる', () => {
  const original = '本研究の結果は有意ではない。\n結論は保留する。';
  const revised = '本研究の結果に有意差はない。\n結論は保留する。';
  const changes = compareJapanese(original, revised);
  assert.ok(changes.some((change) => change.removed) && changes.some((change) => change.added));
  assert.equal(changes.filter((change) => !change.added).map((change) => change.value).join(''), original);
  assert.equal(changes.filter((change) => !change.removed).map((change) => change.value).join(''), revised);
});
