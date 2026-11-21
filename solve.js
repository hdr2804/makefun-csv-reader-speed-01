// Fast broken-CSV reader: a drop-in for csv-reader 1.0.0's run(input).
// Reads the text once, left to right. Commas and double quotes are the
// only structure. See the competition rules for the exact error contract.
//
// Speed shape: a record whose first line holds no quote and no stray CR
// is sliced out and split on commas in one native call; only records with
// a quote (or a stray CR) go through the field parser. CR searches are
// always bounded to the field being read, never run to the next CR in
// the file.
export function run(input) {
  const text = input.text;
  const header = input.header;
  const len = text.length;
  let pos = 0;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;
  let line = 1;
  let columns = null;
  let width = -1;
  const rows = [];
  const errors = [];
  let isFirst = true;
  let recStartLine = 1;
  let rowIdx = null;

  function finishRecord(fields) {
    if (isFirst) {
      isFirst = false;
      width = fields.length;
      if (header) {
        columns = fields;
        return;
      }
      rows.push(fields);
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recStartLine, row: rowIdx, fields: fields.length });
      for (let i = fields.length; i < width; i++) fields.push('');
    } else if (fields.length > width) {
      const extra = fields.slice(width);
      errors.push({ code: 'long_row', line: recStartLine, row: rowIdx, extra });
      fields.length = width;
    }
    rows.push(fields);
  }

  // First CR in [from, to), or -1. Bounded: never scans past the field.
  function findCR(from, to) {
    for (let i = from; i < to; i++) if (text.charCodeAt(i) === 13) return i;
    return -1;
  }

  // Parse one unquoted field starting at pos. Leaves pos on the delimiter
  // (',', LF, or a CR of a CRLF) or at len. A CR not followed by LF is
  // dropped and reported; quotes inside are literal characters.
  function scanUnquoted() {
    const start = pos;
    let c = text.indexOf(',', pos);
    let n = text.indexOf('\n', pos);
    let end = len;
    if (c !== -1 && c < end) end = c;
    if (n !== -1 && n < end) end = n;
    let r = findCR(pos, end);
    if (r === -1) {
      pos = end;
      return text.slice(start, end);
    }
    if (text.charCodeAt(r + 1) === 10) {
      pos = r;
      return text.slice(start, r);
    }
    let out = text.slice(start, r);
    let p = r + 1;
    errors.push({ code: 'stray_cr', line: recStartLine, row: rowIdx });
    for (;;) {
      c = text.indexOf(',', p);
      n = text.indexOf('\n', p);
      end = len;
      if (c !== -1 && c < end) end = c;
      if (n !== -1 && n < end) end = n;
      r = findCR(p, end);
      if (r === -1) {
        out += text.slice(p, end);
        pos = end;
        return out;
      }
      if (text.charCodeAt(r + 1) === 10) {
        out += text.slice(p, r);
        pos = r;
        return out;
      }
      out += text.slice(p, r);
      errors.push({ code: 'stray_cr', line: recStartLine, row: rowIdx });
      p = r + 1;
    }
  }

  // Parse one quoted field starting at pos (text[pos] === '"'). Leaves pos
  // on the delimiter or at len, as scanUnquoted does.
  function parseQuoted() {
    let q = pos + 1;
    let hasDoubled = false;
    let close = -1;
    for (;;) {
      const nq = text.indexOf('"', q);
      if (nq === -1) break;
      if (text.charCodeAt(nq + 1) === 34) {
        hasDoubled = true;
        q = nq + 2;
        continue;
      }
      close = nq;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character and the text
      // after it is read again as unquoted.
      errors.push({ code: 'unterminated_quote', line: recStartLine, row: rowIdx });
      return scanUnquoted();
    }
    // A line break inside the content shows up as the next LF before the
    // closing quote (an LF search stops at the record's own end at worst).
    const nIn = text.indexOf('\n', pos + 1);
    const contentHasLF = nIn !== -1 && nIn < close;
    let value;
    if (!contentHasLF && findCR(pos + 1, close) === -1) {
      value = hasDoubled
        ? text.slice(pos + 1, close).replaceAll('""', '"')
        : text.slice(pos + 1, close);
    } else if (!contentHasLF) {
      // Lone CRs only: normalize them to LF, count the breaks.
      let val = '';
      let breaks = 0;
      for (let i = pos + 1; i < close; i++) {
        const ch = text.charCodeAt(i);
        if (ch === 34) {
          val += '"';
          i++;
        } else if (ch === 13) {
          breaks++;
          val += '\n';
        } else {
          val += text[i];
        }
      }
      value = val;
      line += breaks;
    } else {
      // Normalize: "" -> ", CRLF or a lone CR inside quotes -> LF.
      let val = '';
      let breaks = 0;
      for (let i = pos + 1; i < close; i++) {
        const ch = text.charCodeAt(i);
        if (ch === 34) {
          val += '"';
          i++;
        } else if (ch === 13) {
          breaks++;
          val += '\n';
          if (text.charCodeAt(i + 1) === 10) i++;
        } else if (ch === 10) {
          breaks++;
          val += '\n';
        } else {
          val += text[i];
        }
      }
      value = val;
      line += breaks;
    }
    // Text after the closing quote, up to the next comma or line break,
    // is appended as it stands (quote_junk when the field ends).
    const after = close + 1;
    if (after >= len) {
      pos = len;
      return value;
    }
    const ch = text.charCodeAt(after);
    if (ch === 44 || ch === 10) {
      pos = after;
      return value;
    }
    if (ch === 13 && text.charCodeAt(after + 1) === 10) {
      pos = after;
      return value;
    }
    let junk = '';
    let p = after;
    for (;;) {
      const c = text.indexOf(',', p);
      const n = text.indexOf('\n', p);
      let end = len;
      if (c !== -1 && c < end) end = c;
      if (n !== -1 && n < end) end = n;
      const r = findCR(p, end);
      if (r === -1) {
        junk += text.slice(p, end);
        pos = end;
        break;
      }
      if (text.charCodeAt(r + 1) === 10) {
        junk += text.slice(p, r);
        pos = r;
        break;
      }
      junk += text.slice(p, r);
      errors.push({ code: 'stray_cr', line: recStartLine, row: rowIdx });
      p = r + 1;
    }
    if (junk.length > 0) {
      errors.push({ code: 'quote_junk', line: recStartLine, row: rowIdx });
      return value + junk;
    }
    return value;
  }

  while (pos < len) {
    recStartLine = line;
    rowIdx = isFirst && header ? null : rows.length;
    const lineEnd0 = text.indexOf('\n', pos);
    const hasNL = lineEnd0 !== -1;
    const lineEnd = hasNL ? lineEnd0 : len;
    const hasCRLF = hasNL && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13;
    const q = text.indexOf('"', pos);
    const r = text.indexOf('\r', pos);
    const lineHasQuote = q !== -1 && q < lineEnd;
    const lineHasStrayCR = r !== -1 && r < lineEnd && !(hasCRLF && r === lineEnd - 1);
    if (!lineHasQuote && !lineHasStrayCR) {
      // Fast path: a single-line record with no quotes and no stray CR.
      // (A quoted field can only start on this line, so no field of this
      // record is quoted and no field spans lines.)
      const end = hasCRLF ? lineEnd - 1 : lineEnd;
      if (end === pos) {
        // Blank line: no record.
        pos = hasNL ? lineEnd + 1 : len;
        line++;
        continue;
      }
      const fields = text.slice(pos, end).split(',');
      pos = hasNL ? lineEnd + 1 : len;
      line++;
      finishRecord(fields);
      continue;
    }
    // Slow path: the record's first line holds a quote or a stray CR.
    const fields = [];
    for (;;) {
      const field = text.charCodeAt(pos) === 34 ? parseQuoted() : scanUnquoted();
      fields.push(field);
      if (pos < len && text.charCodeAt(pos) === 44) {
        pos++;
        if (pos >= len) {
          fields.push('');
          break;
        }
        continue;
      }
      break;
    }
    if (pos < len && text.charCodeAt(pos) === 10) {
      pos++;
      line++;
    } else if (pos < len && text.charCodeAt(pos) === 13) {
      pos += 2;
      line++;
    }
    finishRecord(fields);
  }

  return { columns, rows, errors };
}
