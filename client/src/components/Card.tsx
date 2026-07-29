import { rankChar, SUIT_SYMBOL, isRed } from "../cards";

interface Props {
  rank: number;
  suit: string;
  beanie?: boolean; // is this the wild rank this round?
  selected?: boolean;
  small?: boolean;
  onClick?: () => void;
}

export function Card({ rank, suit, beanie, selected, small, onClick }: Props) {
  const cls = [
    "card",
    small ? "card--small" : "",
    isRed(suit) ? "card--red" : "card--black",
    selected ? "card--selected" : "",
    beanie ? "card--beanie" : "",
    onClick ? "card--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} onClick={onClick} title={beanie ? "Beanie (wild)" : ""}>
      <span className="card__rank">{rankChar(rank)}</span>
      <span className="card__suit">{SUIT_SYMBOL[suit]}</span>
      {beanie && <span className="card__wild">🫘</span>}
    </div>
  );
}

/** A face-down card back (draw pile). */
export function CardBack({ small }: { small?: boolean }) {
  return <div className={`card card--back ${small ? "card--small" : ""}`}>🫘</div>;
}
