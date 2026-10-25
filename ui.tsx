import type { ReactNode } from 'react';

export type Note = { text: string; kind: 'ok' | 'err' | 'warn' } | null;

export function Msg({ note }: { note: Note }) {
  if (!note) return null;
  return <div className={`m ${note.kind}`} role={note.kind === 'err' ? 'alert' : 'status'}>{note.text}</div>;
}
export const Card = ({ title, children }: { title?: string; children: ReactNode }) => (
  <section className="c">{title && <h2>{title}</h2>}{children}</section>
);
export const List = ({ items }: { items: string[] }) =>
  items.length ? <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="mu">-</p>;
export const errText = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong.');
