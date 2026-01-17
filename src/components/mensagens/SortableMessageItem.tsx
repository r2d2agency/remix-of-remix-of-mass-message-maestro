import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageItemEditor, MessageItem } from "./MessageItemEditor";

interface SortableMessageItemProps {
  item: MessageItem;
  index: number;
  onUpdate: (id: string, updates: Partial<MessageItem>) => void;
  onDelete: (id: string) => void;
  insertVariable: (id: string, variable: string) => void;
}

export function SortableMessageItem({
  item,
  index,
  onUpdate,
  onDelete,
  insertVariable,
}: SortableMessageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <MessageItemEditor
        item={item}
        index={index}
        onUpdate={onUpdate}
        onDelete={onDelete}
        insertVariable={insertVariable}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
