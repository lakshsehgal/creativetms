"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ListTodo, Plus, Trash2 } from "lucide-react";
import type { Profile, StrategistTask, TaskStatus } from "@/lib/types";
import { TASK_STATUSES, TASK_STATUS_ORDER } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchTasks, queryKeys } from "@/lib/queries";
import { dayLabel, isoDay, shortName } from "@/lib/format";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Stamp } from "@/components/ui/stamp";

type Scope = "mine" | "everyone" | "unowned";

/**
 * The strategists' to-do list.
 *
 * Not tickets. Tickets are work a designer does; these are the things a
 * strategist does around them — chase the logo, write the brief, send the
 * deck — and until now they lived in notes apps nobody else could reach.
 *
 * Three views: mine (the default, because that is the question you open the
 * page with), everyone (so a colleague's list is visible when they are out),
 * and the unowned pile anybody can take from. Handing a task over is a
 * dropdown on the row, same as a ticket's designer.
 */
export function TasksClient({
  profile,
  initialTasks,
  staff,
}: {
  profile: Profile;
  initialTasks: StrategistTask[];
  staff: Profile[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<Scope>("mine");
  const [showDone, setShowDone] = useState(false);
  const [composing, setComposing] = useState(false);

  const tasks = useQuery({
    queryKey: queryKeys.tasks,
    queryFn: () => fetchTasks(supabase),
    initialData: initialTasks,
  });

  // A task somebody hands you should appear without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel("strategist-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "strategist_tasks" },
        () => void queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, queryClient]);

  const rows = tasks.data ?? [];
  const today = isoDay();

  const visible = useMemo(() => {
    const scoped = rows.filter((task) =>
      scope === "mine"
        ? task.assigned_to === profile.id
        : scope === "unowned"
          ? !task.assigned_to
          : true,
    );
    return (showDone ? scoped : scoped.filter((task) => task.status !== "done")).sort(
      (a, b) => {
        // Open before done, overdue first, then the order people dragged
        // them into (position), which is creation order until someone moves
        // one.
        const rank = (task: StrategistTask) =>
          task.status === "done" ? 2 : task.due_on && task.due_on < today ? 0 : 1;
        return rank(a) - rank(b) || (a.due_on ?? "9").localeCompare(b.due_on ?? "9") || a.position - b.position;
      },
    );
  }, [rows, scope, showDone, profile.id, today]);

  const counts = {
    mine: rows.filter((t) => t.assigned_to === profile.id && t.status !== "done").length,
    everyone: rows.filter((t) => t.status !== "done").length,
    unowned: rows.filter((t) => !t.assigned_to && t.status !== "done").length,
  };

  async function patch(task: StrategistTask, fields: Partial<StrategistTask>, note?: string) {
    const previous = queryClient.getQueryData<StrategistTask[]>(queryKeys.tasks);
    queryClient.setQueryData<StrategistTask[]>(queryKeys.tasks, (list) =>
      (list ?? []).map((row) => (row.id === task.id ? { ...row, ...fields } : row)),
    );
    const { error } = await supabase.from("strategist_tasks").update(fields).eq("id", task.id);
    if (error) {
      queryClient.setQueryData(queryKeys.tasks, previous);
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    if (note) toast.success(note);
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
  }

  async function remove(task: StrategistTask) {
    const { error } = await supabase.from("strategist_tasks").delete().eq("id", task.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed");
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
  }

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${counts.mine} on you · ${counts.unowned} unowned`}
      >
        <div
          role="tablist"
          aria-label="Whose tasks"
          className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-line)] p-0.5"
        >
          {(
            [
              ["mine", "Mine"],
              ["everyone", "Everyone"],
              ["unowned", "Unowned"],
            ] as [Scope, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={scope === key}
              onClick={() => setScope(key)}
              className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] transition-colors ${
                scope === key
                  ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
              }`}
            >
              {label}
              <span className="tabular text-[10.5px] text-[var(--color-ink-3)]">{counts[key]}</span>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-3)]">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show done
        </label>

        <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
          <Plus size={14} /> New task
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-4xl">
          <Card padded={false}>
            {visible.length === 0 ? (
              <EmptyState
                icon={<ListTodo size={22} />}
                title={
                  scope === "mine"
                    ? "Nothing on you"
                    : scope === "unowned"
                      ? "Nothing waiting to be picked up"
                      : "No open tasks"
                }
                hint="Tasks are the work around the tickets — chasing assets, writing briefs, sending decks. Add one, or hand one to a colleague when you're out."
                action={
                  <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
                    <Plus size={14} /> Add a task
                  </Button>
                }
              />
            ) : (
              <ul>
                {visible.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    staff={staff}
                    viewer={profile}
                    today={today}
                    onPatch={patch}
                    onRemove={remove}
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {composing && (
        <NewTaskDialog
          viewer={profile}
          staff={staff}
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ rows */

function TaskRow({
  task,
  staff,
  viewer,
  today,
  onPatch,
  onRemove,
}: {
  task: StrategistTask;
  staff: Profile[];
  viewer: Profile;
  today: string;
  onPatch: (task: StrategistTask, fields: Partial<StrategistTask>, note?: string) => void;
  onRemove: (task: StrategistTask) => void;
}) {
  const done = task.status === "done";
  const overdue = !done && task.due_on != null && task.due_on < today;
  const canDelete = viewer.role === "admin" || task.created_by === viewer.id;

  return (
    <li className="flex items-start gap-3 border-b border-[var(--color-line)] px-4 py-3 last:border-0">
      {/* Done is a tick; the two live states are a small cycling pill. */}
      <button
        onClick={() => onPatch(task, { status: done ? "todo" : "done" }, done ? "Reopened" : "Done")}
        aria-label={done ? "Reopen" : "Mark done"}
        className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-[4px] border transition-colors"
        style={{
          borderColor: done ? "var(--color-good)" : "var(--color-line-strong)",
          background: done ? "var(--color-good)" : "transparent",
          color: "white",
        }}
      >
        {done && <Check size={11} strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-[13.5px] leading-snug ${done ? "text-[var(--color-ink-3)] line-through" : ""}`}
        >
          {task.title}
        </p>
        {task.notes && (
          <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-[var(--color-ink-2)]">
            {task.notes}
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-ink-3)]">
          <span>
            by {shortName(task.author)} · <Stamp at={task.created_at} />
          </span>
          {done && task.completed_at && (
            <span>
              · done <Stamp at={task.completed_at} />
            </span>
          )}
        </p>
      </div>

      {!done && (
        <Select
          value={task.status}
          onChange={(e) => onPatch(task, { status: e.target.value as TaskStatus })}
          aria-label="Status"
          className="!w-auto !py-1 !text-[12px]"
        >
          {TASK_STATUS_ORDER.filter((s) => s !== "done").map((s) => (
            <option key={s} value={s}>
              {TASK_STATUSES[s].label}
            </option>
          ))}
        </Select>
      )}

      <input
        type="date"
        value={task.due_on ?? ""}
        onChange={(e) => onPatch(task, { due_on: e.target.value || null })}
        aria-label="Due"
        title={task.due_on ? dayLabel(task.due_on) : "No date"}
        className="rounded-[var(--radius-sm)] border bg-transparent px-1.5 py-1 text-[11.5px] outline-none focus:border-[var(--color-accent)]"
        style={{
          borderColor: overdue ? "var(--color-critical)" : "var(--color-line)",
          color: overdue ? "var(--color-critical)" : undefined,
        }}
      />

      {/* Whose it is. Same control as a ticket's designer: hand it over here. */}
      <span className="flex items-center gap-1.5">
        {task.assignee && (
          <Avatar
            id={task.assignee.id}
            name={task.assignee.full_name}
            email={task.assignee.email}
            src={task.assignee.avatar_url}
            size={18}
          />
        )}
        <Select
          value={task.assigned_to ?? ""}
          onChange={(e) =>
            onPatch(
              task,
              { assigned_to: e.target.value || null },
              e.target.value ? "Handed over" : "Back in the pile",
            )
          }
          aria-label="Who has this"
          className="!w-auto !max-w-[140px] !py-1 !text-[12px]"
        >
          <option value="">Unowned</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.id === viewer.id ? "Me" : person.full_name || person.email}
            </option>
          ))}
        </Select>
      </span>

      {canDelete && (
        <button
          onClick={() => onRemove(task)}
          aria-label="Delete task"
          className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-critical)]"
        >
          <Trash2 size={13} />
        </button>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- new one */

function NewTaskDialog({
  viewer,
  staff,
  onClose,
  onSaved,
}: {
  viewer: Profile;
  staff: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = supabaseBrowser();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueOn, setDueOn] = useState("");
  // On you by default — most tasks people write down are their own.
  const [assignee, setAssignee] = useState<string>(viewer.id);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("strategist_tasks").insert({
      title: title.trim(),
      notes: notes.trim(),
      due_on: dueOn || null,
      assigned_to: assignee || null,
      created_by: viewer.id,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success("Added");
    onSaved();
  }

  return (
    <Dialog open onClose={onClose} title="New task" width={460}>
      <form onSubmit={submit}>
        <Field label="What" htmlFor="task-title">
          <TextInput
            id="task-title"
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chase Mokobara for the new logo files"
          />
        </Field>
        <Field label="Notes" htmlFor="task-notes" className="mt-3.5">
          <TextArea
            id="task-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — a link, a name, what good looks like"
          />
        </Field>
        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <Field label="Due" htmlFor="task-due">
            <TextInput id="task-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </Field>
          <Field label="On" htmlFor="task-owner">
            <Select id="task-owner" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unowned — anyone can take it</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.id === viewer.id ? "Me" : person.full_name || person.email}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!title.trim()}>
            Add task
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
