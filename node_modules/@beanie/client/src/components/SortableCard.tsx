import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "./Card";

interface Props {
  id: string;
  rank: number;
  suit: string;
  beanie?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

/** A hand card that can be dragged to reorder (mouse + touch via @dnd-kit). */
export function SortableCard({ id, rank, suit, beanie, selected, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none", // let dnd-kit handle touch instead of scrolling
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="handslot"
      {...attributes}
      {...listeners}
    >
      <Card
        rank={rank}
        suit={suit}
        beanie={beanie}
        selected={selected}
        onClick={onClick}
      />
    </div>
  );
}
