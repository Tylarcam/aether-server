/**
 * Lightweight, dependency-free markdown rendering for CEO Briefs.
 * Handles headings, bold, lists, tables, and paragraphs — no HTML passthrough.
 */

function inlineBold(text, keyPrefix) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-luna-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
  });
}

function isTableSeparator(line) {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line.trim());
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * @param {{ markdown: string }} props
 */
export default function CeoBriefMarkdown({ markdown }) {
  if (!markdown?.trim()) return null;

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Table block
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const header = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={`tbl-${blocks.length}`} className="overflow-x-auto my-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th
                    key={ci}
                    className="border border-white/10 px-2 py-1 text-luna-silver font-semibold"
                  >
                    {inlineBold(cell, `th-${blocks.length}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-white/10 px-2 py-1 text-luna-white align-top"
                    >
                      {inlineBold(cell, `td-${blocks.length}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (line.startsWith('# ')) {
      blocks.push(
        <h3 key={`h1-${i}`} className="text-sm font-bold text-luna-white mt-2 mb-1">
          {inlineBold(line.slice(2), `h1-${i}`)}
        </h3>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push(
        <h4 key={`h2-${i}`} className="text-xs font-semibold text-luna-accent-primary mt-3 mb-1 uppercase tracking-wide">
          {inlineBold(line.slice(3), `h2-${i}`)}
        </h4>
      );
      i += 1;
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*] /, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc list-inside space-y-1 my-1 text-luna-white">
          {items.map((item, ii) => (
            <li key={ii}>{inlineBold(item, `li-${blocks.length}-${ii}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="text-luna-white my-1 leading-relaxed">
        {inlineBold(line, `p-${i}`)}
      </p>
    );
    i += 1;
  }

  return <div className="text-xs space-y-0.5">{blocks}</div>;
}
