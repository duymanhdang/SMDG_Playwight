/**
 * ndjson-tail.js — pure helper for the live-run SSE endpoint (v0.9.0).
 *
 * Splitting new bytes into complete NDJSON lines is the only part of the SSE
 * polling loop worth unit-testing on its own (partial lines split across
 * reads are an easy off-by-one to get wrong), so it lives here as a
 * standalone, I/O-free function. server.js's GET /api/runs/:id/stream does
 * the actual file reading and calls this with the raw bytes read since the
 * last known offset.
 */

'use strict';

/**
 * @param {string} buffer     Newly-read bytes (as a utf8 string) since `offset`.
 * @param {number} bytesReadLength  How many bytes `buffer` represents (usually
 *                                  Buffer.byteLength(buffer, 'utf8')) — passed
 *                                  separately so callers working with raw
 *                                  Buffers can be precise about multi-byte
 *                                  chars; if omitted, byte length is derived
 *                                  from the string itself (fine for ASCII/NDJSON).
 * @returns {{ lines: string[], remainder: string }}
 *   `lines` are complete (newline-terminated) NDJSON lines with the
 *   trailing newline stripped. `remainder` is the trailing partial line (if
 *   any) that should be prepended to the next read.
 */
function extractCompleteLines(buffer) {
  if (!buffer) return { lines: [], remainder: '' };
  const parts = buffer.split('\n');
  // If buffer ends with '\n', the last element is '' (no partial line).
  // Otherwise the last element is an incomplete line to carry forward.
  const remainder = parts.pop();
  const lines = parts.filter((l) => l.length > 0);
  return { lines, remainder: remainder || '' };
}

/**
 * Reads new bytes from `filePath` starting at `offset`, splits into complete
 * NDJSON lines, and returns the new offset to resume from next time. Any
 * partial trailing line is NOT consumed — it stays on disk and will be
 * re-read (together with whatever gets appended after it) on the next call,
 * because `newOffset` only advances past complete lines.
 *
 * This function itself does the file read (fs is injected so it stays easy
 * to unit test with a fake), but the line-splitting logic is delegated to
 * extractCompleteLines() above.
 *
 * @param {object} fs          Node's fs module (or a fake with statSync/openSync/readSync/closeSync)
 * @param {string} filePath
 * @param {number} offset      Byte offset to resume reading from.
 * @returns {{ lines: string[], newOffset: number }}
 */
function readNewLines(fs, filePath, offset) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    return { lines: [], newOffset: offset };
  }

  const size = stat.size;
  if (size <= offset) {
    // File hasn't grown (or was truncated/rotated — in which case restart
    // from 0 defensively rather than throwing on a negative read length).
    return { lines: [], newOffset: size < offset ? 0 : offset };
  }

  const length = size - offset;
  const buf = Buffer.alloc(length);
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, length, offset);
  } catch (_) {
    return { lines: [], newOffset: offset };
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }

  const text = buf.toString('utf8');
  const { lines, remainder } = extractCompleteLines(text);
  // Advance past exactly the bytes consumed by complete lines (i.e. exclude
  // the trailing partial `remainder`), so re-reading it next time is exact.
  const consumedBytes = Buffer.byteLength(text, 'utf8') - Buffer.byteLength(remainder, 'utf8');
  return { lines, newOffset: offset + consumedBytes };
}

module.exports = { extractCompleteLines, readNewLines };
