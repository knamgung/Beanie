import { rankChar, beanieRankForRound, TOTAL_ROUNDS } from "../cards";
import type { PlayerView, BonusEventView } from "../store";

interface Props {
  players: PlayerView[];
  bonuses: BonusEventView[];
  currentRound: number;
}

/** The bonus badge for a given player at a given round, if any. */
function bonusTag(seat: number, round: number, bonuses: BonusEventView[]) {
  const ev = bonuses.find((b) => b.round === round);
  if (!ev) return null;
  if (ev.choice === "double" && ev.winnerSeat !== seat)
    return { label: "×2", cls: "bonustag--up" };
  if (ev.choice === "halve" && ev.winnerSeat === seat)
    return { label: "÷2", cls: "bonustag--down" };
  return null;
}

/**
 * A grid of all 14 rounds. Columns are labelled by that round's Beanie (wild)
 * rank; cells show the points a player earned that round, badged with ×2 / ÷2
 * in the round where a bonus was applied to their total.
 */
export function ScoreGrid({ players, bonuses, currentRound }: Props) {
  const rounds = Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1);
  const lowest = Math.min(...players.map((p) => p.score));

  return (
    <div className="scoregrid__wrap">
      <table className="scoregrid">
        <thead>
          <tr>
            <th className="scoregrid__name">Player</th>
            {rounds.map((r) => (
              <th
                key={r}
                className={r === currentRound ? "scoregrid__cur" : ""}
                title={`Round ${r}`}
              >
                {rankChar(beanieRankForRound(r))}
                <span className="scoregrid__bean">🫘</span>
              </th>
            ))}
            <th className="scoregrid__total">Total</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.seat}>
              <td className="scoregrid__name">{p.name}</td>
              {rounds.map((r) => {
                const tag = bonusTag(p.seat, r, bonuses);
                const penalty = p.roundPenalties[r - 1] ?? 0;
                return (
                  <td key={r} className={r === currentRound ? "scoregrid__cur" : ""}>
                    <span>{p.roundPoints[r - 1] ?? ""}</span>
                    {penalty > 0 && (
                      <span
                        className="bonustag bonustag--penalty"
                        title={`Discarded ${penalty / 50} Beanie${penalty > 50 ? "s" : ""}: +${penalty}`}
                      >
                        +{penalty}
                      </span>
                    )}
                    {tag && (
                      <span
                        className={`bonustag ${tag.cls}`}
                        title={`${tag.label} bonus applied to your total this round`}
                      >
                        {tag.label}
                      </span>
                    )}
                  </td>
                );
              })}
              <td
                className={`scoregrid__total ${p.score === lowest ? "scoregrid__lead" : ""}`}
              >
                {p.score}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="scoregrid__hint">
        Cells = points that round · +50 = discarded a Beanie · ×2 / ÷2 = bonus on your total · lowest wins
      </p>
    </div>
  );
}
