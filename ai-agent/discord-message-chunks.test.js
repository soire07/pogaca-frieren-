import test from 'node:test';
import assert from 'node:assert/strict';
import { splitDiscordMessage } from './discord-message-chunks.js';

test('keeps ordinary reports in a single message', () => {
  assert.deepEqual(splitDiscordMessage('summary\nPASS: 2'), ['summary\nPASS: 2']);
});

test('splits long reports into messages no longer than Discord 2000 character limit', () => {
  const source = Array.from({ length: 80 }, (_, index) => 'Behavior check ' + index + ': ' + 'x'.repeat(80)).join('\n');
  const chunks = splitDiscordMessage(source);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 1900));
  assert.equal(chunks.join('\n'), source);
});

test('splits a single oversized line without dropping characters', () => {
  const source = 'x'.repeat(4501);
  const chunks = splitDiscordMessage(source);
  assert.deepEqual(chunks.map(chunk => chunk.length), [1900, 1900, 701]);
  assert.equal(chunks.join(''), source);
});

test('rejects invalid chunk limits', () => {
  assert.throws(() => splitDiscordMessage('x', 2001), RangeError);
});
