"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import type { ChecklistPhase, CrewGroup } from "@/lib/types";
import { checklistProgress, crewNames, defaultChecklist, PHASE_BLURB, rowId } from "@/lib/shoot";
import { Card } from "@/components/ui/primitives";
import { Button, Select } from "@/components/ui/form";

/**
 * The run-up, ticked as it happens.
 *
 * The value isn't the ticks — it's that the list is the same list every time,
 * so the thing that gets forgotten once stops getting forgotten. Owners come
 * from the crew on the call sheet rather than a free-text box, because "who
 * was meant to pack the products" is the question this exists to answer.
 *
 * Everything is editable and the defaults can be put back: a checklist nobody
 * can change is a checklist people keep in a separate note.
 */
export function BriefChecklist({
  phases,
  crew,
  onChange,
}: {
  phases: ChecklistPhase[];
  crew: CrewGroup[];
  onChange: (phases: ChecklistPhase[]) => void;
}) {
  const owners = useMemo(() => crewNames(crew), [crew]);
  const progress = checklistProgress(phases);

  function patchPhase(index: number, patch: Partial<ChecklistPhase>) {
    onChange(phases.map((phase, position) => (position === index ? { ...phase, ...patch } : phase)));
  }

  function patchItem(
    phaseIndex: number,
    itemIndex: number,
    patch: Partial<ChecklistPhase["items"][number]>,
  ) {
    patchPhase(phaseIndex, {
      items: phases[phaseIndex].items.map((item, position) =>
        position === itemIndex ? { ...item, ...patch } : item,
      ),
    });
  }

  function restore() {
    if (
      !window.confirm(
        "Put the default checklist back? Anything you've added here, and every tick, goes with it.",
      )
    ) {
      return;
    }
    onChange(defaultChecklist());
    toast.success("Defaults restored");
  }

  function clearTicks() {
    onChange(
      phases.map((phase) => ({
        ...phase,
        items: phase.items.map((item) => ({ ...item, done: false })),
      })),
    );
    toast.success("Ticks cleared");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold tracking-tight">Run-up checklist</h3>
        <span className="text-[11.5px] text-[var(--color-ink-3)]">
          {progress.done} of {progress.total} ticked
        </span>
        <span className="ml-auto flex items-center gap-2 print:hidden">
          <Button size="sm" variant="ghost" onClick={clearTicks}>
            Clear ticks
          </Button>
          <Button size="sm" variant="ghost" onClick={restore}>
            <RotateCcw size={13} /> Restore defaults
          </Button>
        </span>
      </div>

      {phases.map((phase, phaseIndex) => (
        <Card key={phase.id} padded={false}>
          <div className="border-b border-[var(--color-line)] px-4 py-3">
            <input
              value={phase.title}
              aria-label={`Phase ${phaseIndex + 1} title`}
              onChange={(event) => patchPhase(phaseIndex, { title: event.target.value })}
              className="w-full bg-transparent text-[13px] font-semibold tracking-tight outline-none"
            />
            {PHASE_BLURB[phase.title] && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
                {PHASE_BLURB[phase.title]}
              </p>
            )}
          </div>

          <ul>
            {phase.items.map((item, itemIndex) => (
              <li
                key={item.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-1.5 border-b border-[var(--color-line)] px-4 py-2.5 last:border-0 sm:grid-cols-[auto_1fr_168px_auto]"
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  aria-label={item.text || "Checklist item"}
                  onChange={(event) =>
                    patchItem(phaseIndex, itemIndex, { done: event.target.checked })
                  }
                  className="shrink-0"
                />

                <input
                  value={item.text}
                  aria-label={`Item ${itemIndex + 1}`}
                  placeholder="What has to be true"
                  onChange={(event) =>
                    patchItem(phaseIndex, itemIndex, { text: event.target.value })
                  }
                  className={`min-w-0 bg-transparent text-[12.5px] outline-none ${
                    item.done ? "text-[var(--color-ink-3)] line-through" : ""
                  }`}
                />

                <Select
                  aria-label={`Owner of item ${itemIndex + 1}`}
                  value={item.owner}
                  onChange={(event) =>
                    patchItem(phaseIndex, itemIndex, { owner: event.target.value })
                  }
                  className="col-start-2 !py-1 !text-[11.5px] sm:col-start-3"
                >
                  <option value="">Nobody yet</option>
                  {/* The saved owner may be someone since taken off the crew —
                      keep it rather than silently reassigning their job. */}
                  {item.owner && !owners.includes(item.owner) && (
                    <option value={item.owner}>{item.owner}</option>
                  )}
                  {owners.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>

                <button
                  onClick={() =>
                    patchPhase(phaseIndex, {
                      items: phase.items.filter((_, position) => position !== itemIndex),
                    })
                  }
                  aria-label={`Remove "${item.text || "this item"}"`}
                  className="justify-self-end text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-critical)] print:hidden"
                >
                  <Trash2 size={13} />
                </button>

                {/* Second line, under the item it belongs to. Quiet until
                    there's something in it — most items never need one. */}
                <input
                  value={item.note}
                  aria-label={`Note on item ${itemIndex + 1}`}
                  placeholder="Note"
                  onChange={(event) =>
                    patchItem(phaseIndex, itemIndex, { note: event.target.value })
                  }
                  className="col-start-2 -mt-0.5 min-w-0 bg-transparent text-[11.5px] text-[var(--color-ink-2)] outline-none placeholder:text-[var(--color-ink-3)] sm:col-span-3"
                />
              </li>
            ))}
          </ul>

          <div className="px-4 py-2 print:hidden">
            <button
              onClick={() =>
                patchPhase(phaseIndex, {
                  items: [
                    ...phase.items,
                    { id: rowId(), text: "", owner: "", note: "", done: false },
                  ],
                })
              }
              className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
            >
              <Plus size={12} /> Add an item
            </button>
          </div>
        </Card>
      ))}

      <div className="print:hidden">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange([...phases, { id: rowId(), title: "New phase", items: [] }])
          }
        >
          <Plus size={13} /> Add a phase
        </Button>
      </div>
    </div>
  );
}
