import { Fragment, type ReactNode } from 'react';

/** Tiny safe renderer for the assistant's light markdown (bold, bullets, numbered lists, line breaks). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = (key: string) => {
    if (!list) return;
    const items = list.items.map((it, j) => <li key={j}>{inline(it, `${key}-${j}`)}</li>);
    blocks.push(list.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) {
        flush(`l${idx}`);
        list = { ordered, items: [] };
      }
      list.items.push((bullet || num)![1]);
      return;
    }
    flush(`l${idx}`);
    if (line.trim() === '') return;
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(
      <p key={`p${idx}`} className={heading ? 'mk-rt-h' : undefined}>
        {inline(heading ? heading[1] : line, `p${idx}`)}
      </p>
    );
  });
  flush('end');
  return <Fragment>{blocks}</Fragment>;
}
