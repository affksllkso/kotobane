import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleApi, requestRewrite, validate } from '../server/api.mjs';

const keys = {
  GEMINI_API_KEY: 'gemini-dummy-secret', GEMINI_MODEL: 'gemini-test',
  OPENAI_API_KEY: 'openai-dummy-secret', OPENAI_MODEL: 'openai-test',
};
const body = { provider: 'gemini', text: '前段。元の文章。後段。', start: 3, end: 9, style: 'だ・である調', level: '中', target: 10, terms: ['文章'] };
const raw = JSON.stringify({
  text: '修正した文章。',
  checks: ['内容', '主張', '引用', '専門用語'].map((category) => ({ category, status: '維持', note: '原文の内容を維持しました。' })),
});

test('段階3: 部分対象と前後の文脈を分離し、不正な範囲や文字数を拒否する', () => {
  const { data } = validate({ ...body, end: 8 });
  assert.equal(data.書き換え対象, '元の文章。');
  assert.equal(data.直前の文脈, '前段。');
  assert.equal(data.直後の文脈, '後段。');
  assert.throws(() => validate({ ...body, start: -1 }));
  assert.throws(() => validate({ ...body, target: 0 }));
  assert.throws(() => validate({ ...body, provider: 'constructor' }));
});

test('自然化の修正候補には選択範囲内の実際の表現だけを含める', () => {
  const { data } = validate({ ...body, end: 8, findings: [
    { kind: 'formula', start: 3, end: 8, reason: 'この値は送らない' },
    { kind: 'connector', start: 0, end: 2 },
    { kind: 'ending', start: 6, end: 9 },
    { kind: 'unknown', start: 4, end: 6 },
    null,
  ] });
  assert.deepEqual(data.修正候補, [{ 特徴: '定型表現', 開始位置: 0, 該当表現: '元の文章。' }]);
});

test('段階3: GeminiとOpenAIのリクエストと構造化応答を確認する', async () => {
  for (const provider of ['gemini', 'openai']) {
    const rewrite = await requestRewrite(provider, validate(body).data, keys, async (url, options) => {
      assert.equal(options.method, 'POST');
      const requestBody = JSON.parse(options.body);
      if (provider === 'gemini') {
        assert.match(url, /gemini-test:generateContent$/);
        assert.equal(options.headers['x-goog-api-key'], keys.GEMINI_API_KEY);
        assert.ok(requestBody.generationConfig.responseJsonSchema);
        return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'internal' }, { text: raw }] } }] });
      }
      assert.match(url, /api\.openai\.com\/v1\/responses$/);
      assert.equal(options.headers.Authorization, 'Bearer ' + keys.OPENAI_API_KEY);
      assert.equal(requestBody.store, false);
      assert.equal(requestBody.text.format.strict, true);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: raw }] }] });
    });
    assert.equal(rewrite.text, '修正した文章。');
    assert.equal(rewrite.checks.length, 4);
    assert.ok(!JSON.stringify(rewrite).includes('-dummy-secret'));
  }
});

test('段階3: APIエラーと中断した生成を扱う', async () => {
  await assert.rejects(() => requestRewrite('openai', {}, keys, async () => new Response(null, { status: 429 })), { status: 429 });
  await assert.rejects(() => requestRewrite('gemini', {}, keys, async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] })), { status: 502 });
});

test('段階3: 実HTTP経由でキーの非公開、未設定、別オリジンの拒否を確認する', async () => {
  const server = createServer((req, res) => void handleApi(req, res, { GEMINI_API_KEY: keys.GEMINI_API_KEY, GEMINI_MODEL: keys.GEMINI_MODEL }));
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const config = await fetch(base + '/api/config');
    assert.deepEqual(await config.json(), { gemini: true, openai: false });
    assert.equal(config.headers.get('cache-control'), 'no-store');
    const upgrade = await fetch(base + '/api/rewrite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, provider: 'openai' }),
    });
    assert.equal(upgrade.status, 503);
    const external = await fetch(base + '/api/config', { headers: { Origin: 'https://other.example' } });
    assert.equal(external.status, 403);
  } finally { await new Promise((done) => server.close(done)); }
});
