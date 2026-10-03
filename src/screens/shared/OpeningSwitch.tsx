import { useState } from 'preact/hooks';
import { OPENINGS } from '../../content/catalog';
import type { OpeningId } from '../../content/types';
import { getLastGame } from '../../progress/store';
import { OPENING_SHORT, sideName } from './labels';
import { Segmented } from './Segmented';

const OPTIONS = OPENINGS.map((o) => ({ value: o.id, label: OPENING_SHORT[o.id], hint: sideName(o.id) }));

// Today and Progress show the same opening, so a choice made on one carries to the other.
let chosen: OpeningId | null = null;

/** The opening you chose this session, else the one you played last, else the first. */
export function useOpening(): [OpeningId, (opening: OpeningId) => void] {
  const [opening, setOpening] = useState<OpeningId>(() => chosen ?? getLastGame()?.opening ?? OPENINGS[0].id);
  const choose = (next: OpeningId) => {
    chosen = next;
    setOpening(next);
  };
  return [opening, choose];
}

/** Italian Game White | Caro-Kann Black: picks the opening the screen below is about. */
export function OpeningSwitch({ value, onChange }: { value: OpeningId; onChange: (opening: OpeningId) => void }) {
  return <Segmented label="Opening" options={OPTIONS} value={value} onChange={onChange} />;
}
