// atlas-ui/react/static/js/Utils/Rival.tsx
// One persistent rival captain. Each week they stake out a slice of the planets
// near you: arriving there costs 15% of the haul, but it is always visible.

import { hashText } from "./Deterministic.tsx";
import { Residents, Resident } from "./Residents.tsx";

const MARK_RATE = 12;

export class Rival {
  /** Always the same captain for a given universe. */
  static identity(): Resident {
    const roster = Residents.roster(Residents.universeSeed());
    return roster[hashText(`rival|${Residents.universeSeed()}`) % roster.length];
  }

  static isMarked(planetKey: string): boolean {
    const rival = Rival.identity();
    return hashText(`rival-mark|${rival.id}|${Residents.weekKey()}|${planetKey}`) % 100 < MARK_RATE;
  }

  /** Applied to gathering on a staked planet. */
  static multiplier(planetKey: string): number {
    return Rival.isMarked(planetKey) ? 0.85 : 1;
  }
}

export default Rival;
