import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useBeanie } from "../useBeanie";
import { Card, CardBack } from "../components/Card";
import { SortableCard } from "../components/SortableCard";
import { ScoreGrid } from "../components/ScoreGrid";
import { rankChar } from "../cards";
import type { FieldHandView, PendingChoice } from "../store";

export function Table() {
  const store = useBeanie();
  const s = store.snapshot!;
  const mySeat = store.mySeat;
  const me = s.players.find((p) => p.seat === mySeat);

  const [selected, setSelected] = useState<string[]>([]);
  const [showScores, setShowScores] = useState(false);
  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  const clear = () => setSelected([]);

  // Drag to reorder the hand. A small movement threshold means a tap/click
  // still selects a card rather than starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } })
  );

  const nameOf = (seat: number) =>
    s.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;

  const bonusPending = s.awaitingBonusSeat !== -1;
  const myTurn = s.turnSeat === mySeat && s.phase === "PLAYING" && !bonusPending;
  const inAct = myTurn && s.turnPhase === "ACT";
  const canDraw = myTurn && s.turnPhase === "DRAW" && !s.openingTurn;
  const canPlay = inAct && selected.length >= 3;
  const canDiscard = inAct && selected.length === 1;
  // Eligible to insert/reclaim at all (your turn, played a hand, not round 14).
  const canInteractField = inAct && s.round !== 14 && !!me?.hasPlayed;
  // The actual move also needs exactly one selected card.
  const hasOneSelected = selected.length === 1;

  const play = () => {
    store.send("playHand", { cardIds: selected });
    clear();
  };
  const discard = () => {
    store.send("discard", { cardId: selected[0] });
    clear();
  };
  const insert = (f: FieldHandView) => {
    store.send("insert", { fieldId: f.id, cardId: selected[0] });
    clear();
  };
  const reclaim = (f: FieldHandView) => {
    store.send("reclaim", { fieldId: f.id, cardId: selected[0] });
    clear();
  };

  const handSorted = store.orderedHand();
  const handIds = handSorted.map((c) => c.id);
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const from = handIds.indexOf(String(active.id));
      const to = handIds.indexOf(String(over.id));
      if (from >= 0 && to >= 0) store.setHandOrder(arrayMove(handIds, from, to));
    }
  };

  const turnText = bonusPending
    ? `${s.roundWinnerName} is choosing a bonus…`
    : myTurn
    ? s.openingTurn
      ? "Your opening turn — play and/or discard to start (no draw)"
      : s.turnPhase === "DRAW"
      ? "Your turn — draw a card"
      : "Your turn — play / insert, then discard to end"
    : `${nameOf(s.turnSeat)}'s turn`;

  return (
    <div className="table">
      {/* header */}
      <header className="table__header">
        <div>
          <strong>Round {s.round}/14</strong>
          <span className="wild">
            Beanie: <span className="wild__rank">{rankChar(s.beanieRank)}</span>
          </span>
        </div>
        <div className={`turnbar ${myTurn ? "turnbar--mine" : ""}`}>{turnText}</div>
        <div className="table__header-btns">
          <div className="volume" title="Sound volume">
            <span className="volume__icon" aria-hidden="true">
              {store.volume === 0 ? "🔇" : store.volume < 0.5 ? "🔉" : "🔊"}
            </span>
            <input
              className="volume__slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={store.volume}
              onChange={(e) => store.setVolume(parseFloat(e.target.value))}
              aria-label="Sound volume"
            />
          </div>
          <button className="btn btn--small btn--ghost" onClick={() => setShowScores(true)}>
            📊 Scoreboard
          </button>
        </div>
      </header>

      {/* players */}
      <section className="players">
        {s.players.map((p) => (
          <div
            key={p.seat}
            className={[
              "pchip",
              p.seat === s.turnSeat ? "pchip--turn" : "",
              !p.connected ? "pchip--offline" : "",
            ].join(" ")}
          >
            <div className="pchip__top">
              <span className="pchip__name">{p.name}</span>
              {p.seat === mySeat && <span className="tag tag--you">you</span>}
            </div>
            <div className="pchip__meta">
              <span>🂠 {p.handCount}</span>
              <span>· {p.score} pts</span>
            </div>
            {!p.connected && <div className="pchip__off">reconnecting…</div>}
          </div>
        ))}
      </section>

      {/* piles */}
      <section className="piles">
        <div className="pile">
          <div className="pile__label">Draw ({s.drawCount})</div>
          <div className="pile__stack" onClick={() => canDraw && store.send("draw", { source: "pile" })}>
            <CardBack />
          </div>
          {canDraw && <button className="btn btn--small" onClick={() => store.send("draw", { source: "pile" })}>Draw</button>}
        </div>

        <div className="pile">
          <div className="pile__label">Discard</div>
          <div className="pile__stack">
            {s.discardTop ? (
              <Card rank={s.discardTop.rank} suit={s.discardTop.suit} beanie={s.discardTop.rank === s.beanieRank} />
            ) : (
              <div className="card card--empty">—</div>
            )}
          </div>
          {canDraw && s.hasDiscard && (
            <button className="btn btn--small" onClick={() => store.send("draw", { source: "discard" })}>Take</button>
          )}
        </div>
      </section>

      {/* field: everyone's played hands */}
      <section className="field">
        <h3>Played hands</h3>
        {s.field.length === 0 && <p className="muted">Nothing played yet.</p>}
        <div className="field__list">
          {s.field.map((f) => (
            <div key={f.id} className="fhand">
              <div className="fhand__owner">
                {f.ownerSeat === mySeat ? "You" : nameOf(f.ownerSeat)} · {f.kind === "SET" ? "Set" : "Run"}
              </div>
              <div className="fhand__cards">
                {f.cards.map((c, i) => (
                  <Card
                    key={i}
                    rank={c.rank}
                    suit={c.suit}
                    small
                    beanie={c.rank === s.beanieRank}
                  />
                ))}
              </div>
              {canInteractField && (
                <div className="fhand__actions">
                  <button
                    className="btn btn--small"
                    disabled={!hasOneSelected}
                    title={hasOneSelected ? "" : "Select one card in your hand first"}
                    onClick={() => insert(f)}
                  >
                    Insert
                  </button>
                  <button
                    className="btn btn--small"
                    disabled={!hasOneSelected}
                    title={hasOneSelected ? "" : "Select the card the beanie stands for"}
                    onClick={() => reclaim(f)}
                  >
                    Reclaim Beanie
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* my hand */}
      <section className="myhand">
        <div className="myhand__header">
          <h3>Your hand ({store.hand.length})</h3>
          <div className="myhand__tools">
            <span className="hint">drag to reorder · sort:</span>
            <button className="btn btn--small btn--ghost" onClick={() => store.sortHand("suit")}>
              Suit
            </button>
            <button className="btn btn--small btn--ghost" onClick={() => store.sortHand("rank")}>
              Rank
            </button>
          </div>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={handIds} strategy={horizontalListSortingStrategy}>
            <div className="myhand__cards">
              {handSorted.map((c) => (
                <SortableCard
                  key={c.id}
                  id={c.id}
                  rank={c.rank}
                  suit={c.suit}
                  selected={selected.includes(c.id)}
                  onClick={() => toggle(c.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="actions">
          <span className="actions__count">{selected.length} selected</span>
          <button className="btn btn--primary" disabled={!canPlay} onClick={play}>
            Play hand
          </button>
          <button className="btn" disabled={!canDiscard} onClick={discard}>
            Discard
          </button>
          {selected.length > 0 && (
            <button className="btn btn--ghost" onClick={clear}>Clear</button>
          )}
        </div>
      </section>

      {/* pick between valid readings of a play/insert (Set vs Run, run ends) */}
      {store.pendingChoice && (
        <PlayChoiceModal
          choice={store.pendingChoice}
          beanieRank={s.beanieRank}
          onPick={(seq) => store.resolveChoice(seq)}
          onCancel={() => store.cancelChoice()}
        />
      )}

      {/* bonus modal */}
      {bonusPending && s.awaitingBonusSeat === mySeat && (
        <div className="overlay">
          <div className="modal">
            <h2>🎉 You went out in one turn!</h2>
            <p>Choose your bonus:</p>
            <div className="modal__actions">
              <button className="btn btn--primary" onClick={() => store.send("bonus", { choice: "double" })}>
                Double everyone else's score
              </button>
              <button className="btn btn--primary" onClick={() => store.send("bonus", { choice: "halve" })}>
                Halve your own score
              </button>
            </div>
          </div>
        </div>
      )}

      {/* round end */}
      {s.phase === "ROUND_END" && (
        <div className="overlay">
          <div className="modal modal--wide">
            <h2>Round {s.round} complete</h2>
            <p>🏆 {s.roundWinnerName} went out{s.lastBonus ? ` (${s.lastBonus} bonus)` : ""}.</p>
            <ScoreGrid players={s.players} bonuses={s.bonuses} currentRound={s.round} />
            <div className="ready">
              <div className="ready__list">
                {s.players.map((p) => (
                  <span
                    key={p.seat}
                    className={`ready__chip ${p.ready ? "ready__chip--on" : ""}`}
                  >
                    {p.ready ? "✓" : "…"} {p.name}
                  </span>
                ))}
              </div>
              {me?.ready ? (
                <p className="muted">Waiting for everyone to ready up…</p>
              ) : (
                <button className="btn btn--primary" onClick={() => store.send("ready")}>
                  Ready for round {s.round + 1}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* game over */}
      {s.phase === "GAME_OVER" && (
        <div className="overlay">
          <div className="modal modal--wide">
            <h2>🫘 Game over!</h2>
            <GameWinner players={s.players} />
            <ScoreGrid players={s.players} bonuses={s.bonuses} currentRound={s.round} />
          </div>
        </div>
      )}

      {/* scoreboard (toggled) */}
      {showScores && (
        <div className="overlay" onClick={() => setShowScores(false)}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <h2>📊 Scoreboard</h2>
            <ScoreGrid players={s.players} bonuses={s.bonuses} currentRound={s.round} />
            <button className="btn" onClick={() => setShowScores(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GameWinner({ players }: { players: { name: string; score: number }[] }) {
  const min = Math.min(...players.map((p) => p.score));
  const winners = players.filter((p) => p.score === min).map((p) => p.name);
  return (
    <p className="winner">
      🏆 {winners.join(" & ")} win{winners.length === 1 ? "s" : ""} with {min} points!
    </p>
  );
}

/**
 * Ask the player how to read an ambiguous play/insert. For a play we go two
 * steps — Set or Run, then which run — when both kinds are on offer; an insert
 * only ever offers run ends, so it's a single step. Each concrete option is
 * shown as its actual cards, with Beanies rendered in the rank they'd stand for.
 */
function PlayChoiceModal({
  choice,
  beanieRank,
  onPick,
  onCancel,
}: {
  choice: PendingChoice;
  beanieRank: number;
  onPick: (seq: string) => void;
  onCancel: () => void;
}) {
  const sets = choice.options.filter((o) => o.kind === "SET");
  const runs = choice.options.filter((o) => o.kind !== "SET");
  // Two-step only makes sense when it's a play offering both a set and runs.
  const twoStep = choice.action === "play" && sets.length > 0 && runs.length > 0;
  const [kind, setKind] = useState<"SET" | "RUN" | null>(null);

  const title =
    choice.action === "insert"
      ? "Which end does the Beanie extend?"
      : "How do you want to play these cards?";

  // Render one option as its cards. A Beanie shows the rank it stands for (its
  // assignedRank), keeping its wild styling; in a run it takes the run's suit.
  const renderOption = (o: PendingChoice["options"][number]) => {
    const cards = o.cards ?? [];
    const runSuit = cards.find((c) => c.rank !== beanieRank)?.suit;
    return (
      <button
        key={o.seq}
        className="btn btn--choice"
        title={o.label}
        onClick={() => onPick(o.seq)}
      >
        <span className="choice__cards">
          {cards.map((c, i) => {
            const isBeanie = c.rank === beanieRank;
            const rank = isBeanie ? c.assignedRank ?? c.rank : c.rank;
            const suit =
              isBeanie && o.kind === "FLUSH" ? runSuit ?? c.suit : c.suit;
            return <Card key={i} rank={rank} suit={suit} small beanie={isBeanie} />;
          })}
        </span>
      </button>
    );
  };

  let body;
  if (twoStep && kind === null) {
    body = (
      <div className="modal__actions">
        {renderOption(sets[0])}
        <button className="btn btn--choice btn--choice-more" onClick={() => setKind("RUN")}>
          Run…
        </button>
      </div>
    );
  } else {
    const opts = twoStep ? runs : choice.options;
    body = (
      <div className="modal__actions modal__actions--wrap">
        {opts.map(renderOption)}
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="modal modal--choice">
        <h2>{title}</h2>
        {body}
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
