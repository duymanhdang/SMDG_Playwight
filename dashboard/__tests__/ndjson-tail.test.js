import { describe, it, expect } from 'vitest';
import { extractCompleteLines, readNewLines } from '../ndjson-tail.js';

describe('extractCompleteLines (§SSE line splitting)', () => {
  it('splits multiple complete lines, no remainder when buffer ends in \\n', () => {
    const { lines, remainder } = extractCompleteLines('{"a":1}\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(remainder).toBe('');
  });

  it('keeps a trailing partial line as remainder', () => {
    const { lines, remainder } = extractCompleteLines('{"a":1}\n{"b":2');
    expect(lines).toEqual(['{"a":1}']);
    expect(remainder).toBe('{"b":2');
  });

  it('returns nothing for an empty buffer', () => {
    expect(extractCompleteLines('')).toEqual({ lines: [], remainder: '' });
  });

  it('drops empty lines (e.g. consecutive newlines)', () => {
    const { lines } = extractCompleteLines('{"a":1}\n\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });
});

// A minimal fake `fs` — just enough of statSync/openSync/readSync/closeSync
// for readNewLines() to unit-test without touching a real file.
function makeFakeFs(content) {
  let buf = Buffer.from(content, 'utf8');
  return {
    _setContent(newContent) { buf = Buffer.from(newContent, 'utf8'); },
    statSync: () => ({ size: buf.length }),
    openSync: () => 1,
    readSync: (fd, target, targetStart, length, position) => {
      buf.copy(target, targetStart, position, position + length);
      return length;
    },
    closeSync: () => {},
  };
}

describe('readNewLines (§SSE tail-parsing, pure/unit-testable)', () => {
  it('reads complete lines from offset 0 and returns the advanced offset', () => {
    const content = '{"type":"begin"}\n{"type":"testBegin"}\n';
    const fs = makeFakeFs(content);
    const { lines, newOffset } = readNewLines(fs, '/fake/events.ndjson', 0);
    expect(lines).toEqual(['{"type":"begin"}', '{"type":"testBegin"}']);
    expect(newOffset).toBe(Buffer.byteLength(content, 'utf8'));
  });

  it('does not consume a trailing partial line, so newOffset stops before it', () => {
    const firstLine = '{"type":"begin"}\n';
    const partial = '{"type":"testBe';
    const fs = makeFakeFs(firstLine + partial);
    const { lines, newOffset } = readNewLines(fs, '/fake/events.ndjson', 0);
    expect(lines).toEqual(['{"type":"begin"}']);
    expect(newOffset).toBe(Buffer.byteLength(firstLine, 'utf8'));
  });

  it('resumes correctly on a second call, completing a line split across two reads', () => {
    const fs = makeFakeFs('{"type":"begin"}\n{"type":"testBe');
    const first = readNewLines(fs, '/fake/events.ndjson', 0);
    expect(first.lines).toEqual(['{"type":"begin"}']);

    // Simulate the writer appending the rest of the second line.
    fs._setContent('{"type":"begin"}\n{"type":"testBegin","id":"t1"}\n');
    const second = readNewLines(fs, '/fake/events.ndjson', first.newOffset);
    expect(second.lines).toEqual(['{"type":"testBegin","id":"t1"}']);
  });

  it('returns no lines and the same offset when the file has not grown', () => {
    const content = '{"type":"begin"}\n';
    const fs = makeFakeFs(content);
    const offset = Buffer.byteLength(content, 'utf8');
    const { lines, newOffset } = readNewLines(fs, '/fake/events.ndjson', offset);
    expect(lines).toEqual([]);
    expect(newOffset).toBe(offset);
  });

  it('returns empty lines and the original offset when the file does not exist yet', () => {
    const fs = { statSync: () => { throw new Error('ENOENT'); } };
    const { lines, newOffset } = readNewLines(fs, '/fake/does-not-exist.ndjson', 5);
    expect(lines).toEqual([]);
    expect(newOffset).toBe(5);
  });
});
