"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DASHBOARD_CARDS, DashboardCardId } from "@/lib/dashboard-cards";

const CARD_LABELS = new Map(DASHBOARD_CARDS.map((c) => [c.id, c.label]));

export function DashboardCardsPicker({
  initialOrder,
  initialEnabled,
}: {
  initialOrder: DashboardCardId[];
  initialEnabled: Set<DashboardCardId>;
}) {
  const [order, setOrder] = useState(initialOrder);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((items) => {
      const oldIndex = items.indexOf(active.id as DashboardCardId);
      const newIndex = items.indexOf(over.id as DashboardCardId);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {order.map((id) => (
            <SortableRow
              key={id}
              id={id}
              label={CARD_LABELS.get(id) ?? id}
              defaultChecked={initialEnabled.has(id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  defaultChecked,
}: {
  id: DashboardCardId;
  label: string;
  defaultChecked: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <label
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2 text-sm text-slate-600 ${
        isDragging ? "z-10 shadow-md" : ""
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab select-none px-1 text-slate-300 hover:text-slate-400 active:cursor-grabbing"
        title="Drag to reorder"
      >
        ⠿
      </span>
      <input
        type="checkbox"
        name="dashboard_cards"
        value={id}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
      />
      {label}
    </label>
  );
}
