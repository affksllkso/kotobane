import { maxText } from './analysis';

export async function readDocument(file: File) {
  if (file.size > 15 * 1024 * 1024) throw new Error('15 MB以下のファイルを選んでください。');
  const ext = file.name.split('.').at(-1)?.toLowerCase();
  let result: string;
  switch (ext) {
    case 'txt': {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes[0] === 0xff && bytes[1] === 0xfe) result = new TextDecoder('utf-16le').decode(buffer);
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) result = new TextDecoder('utf-16be').decode(buffer);
      else {
        try { result = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
        catch { result = new TextDecoder('shift_jis', { fatal: true }).decode(buffer); }
      }
      if (result.includes('\u0000')) throw new Error('テキストファイルの文字コードを確認してください。');
      break;
    }
    case 'docx': {
      const { default: mammoth } = await import('mammoth/mammoth.browser');
      result = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
      break;
    }
    case 'pdf': {
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
      const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      GlobalWorkerOptions.workerSrc = worker;
      const task = getDocument({
        data: await file.arrayBuffer(), cMapUrl: import.meta.env.BASE_URL + 'pdf/cmaps/', cMapPacked: true,
        standardFontDataUrl: import.meta.env.BASE_URL + 'pdf/standard_fonts/',
        wasmUrl: import.meta.env.BASE_URL + 'pdf/wasm/',
        isEvalSupported: false,
      });
      try {
        const document = await task.promise;
        if (document.numPages > 100) throw new Error('PDFは100ページ以下にしてください。');
        const pages: string[] = [];
        for (let index = 1; index <= document.numPages; index++) {
          const page = await document.getPage(index);
          pages.push((await page.getTextContent()).items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '').join(''));
          page.cleanup();
        }
        result = pages.join('\n\n');
        if (result.includes('\u0000')) throw new Error('PDFの一部で文字を復元できませんでした。Wordかテキストに書き出して読み込んでください。');
      } finally { await task.destroy(); }
      break;
    }
    default:
      throw new Error('PDF・Word（.docx）・テキスト（.txt）ファイルを選んでください。');
  }
  result = result.replace(/\r\n?/gu, '\n').trim();
  if (!result) throw new Error('抽出できる文字がありません。画像のみのPDFには文字認識が必要です。');
  if (Array.from(result).length > maxText) throw new Error('抽出結果が20,000字を超えています。ファイルを分けて読み込んでください。');
  return result;
}

export async function exportDocument(text: string, format: 'txt' | 'docx') {
  let blob: Blob;
  if (format === 'docx') {
    const { Document, Paragraph, Packer } = await import('docx');
    const doc = new Document({
      styles: { default: { document: { run: { font: { name: 'Yu Gothic', eastAsia: 'Yu Gothic' }, size: 22 } } } },
      sections: [{ children: text.split('\n').map((line) => new Paragraph(line)) }],
    });
    blob = await Packer.toBlob(doc);
  } else {
    blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ことばね-文章.' + format;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
