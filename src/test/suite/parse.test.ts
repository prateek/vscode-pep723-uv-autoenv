import * as assert from 'assert';
import { parsePep723HeaderFromText, computeEnvHash } from '../../pep723';

describe('parsePep723HeaderFromText', () => {
  it('parses basic header', () => {
    const text = [
      '# /// script',
      '# requires-python = ">=3.10"',
      '# dependencies = ["requests==2.32.3"]',
      '# ///',
      'print("ok")',
    ].join('\n');
    const h = parsePep723HeaderFromText(text);
    assert.ok(h);
    assert.deepStrictEqual(h!.dependencies, ['requests==2.32.3']);
    assert.strictEqual(h!.requiresPython, '>=3.10');
    const hash = computeEnvHash(h!.dependencies, h!.requiresPython);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 12);
  });

  it('parses requires.python nested form', () => {
    const text = [
      '# /// script',
      '# requires.python = ">=3.11"',
      '# dependencies = ["pandas==2.2.2"]',
      '# ///',
    ].join('\n');
    const h = parsePep723HeaderFromText(text);
    assert.ok(h);
    assert.deepStrictEqual(h!.dependencies, ['pandas==2.2.2']);
    assert.strictEqual(h!.requiresPython, '>=3.11');
  });

  it('handles lines without a space after #', () => {
    const text = [
      '# /// script',
      '#requires-python = ">=3.8"',
      '#dependencies = ["python-dotenv==1.0.1"]',
      '# ///',
    ].join('\n');
    const h = parsePep723HeaderFromText(text);
    assert.ok(h);
    assert.deepStrictEqual(h!.dependencies, ['python-dotenv==1.0.1']);
    assert.strictEqual(h!.requiresPython, '>=3.8');
  });

  it('returns null on invalid TOML', () => {
    const text = [
      '# /// script',
      '# requires-python = >=3.10',
      '# dependencies = [requests==2.32.3]',
      '# ///',
    ].join('\n');
    const h = parsePep723HeaderFromText(text);
    assert.strictEqual(h, null);
  });
});
