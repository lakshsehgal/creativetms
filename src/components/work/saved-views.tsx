"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, BookmarkPlus, Check, Trash2, Users } from "lucide-react";
import type { Profile, SavedView } from "@/lib/types";
import type { TicketFilters } from "@/lib/filters";
import { activeFilterCount } from "@/lib/filters";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Button, Field, TextInput } from "@/components/ui/form";

export function SavedViews({
  viewer,
  filters,
  layout,
  onApply,
}: {
  viewer: Profile;
  filters: TicketFilters;
  layout: "board" | "list" | "today";
  onApply: (view: SavedView) => void;
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const views = useQuery({
    queryKey: ["saved-views"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_views")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as SavedView[];
    },
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("saved_views").upsert(
      {
        owner_id: viewer.id,
        name: name.trim(),
        filters,
        // "today" isn't a saved layout — it's a live view of the day.
        layout: layout === "list" ? "list" : "board",
        is_shared: shared,
      },
      { onConflict: "owner_id,name" },
    );

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    setName("");
    setShared(false);
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["saved-views"] });
    toast.success("View saved");
  }

  async function remove(view: SavedView) {
    const { error } = await supabase.from("saved_views").delete().eq("id", view.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["saved-views"] });
  }

  const list = views.data ?? [];
  const count = activeFilterCount(filters);

  return (
    <>
      <div className="flex items-center gap-1">
        {list.length > 0 && (
          <div className="flex items-center gap-1">
            {list.slice(0, 4).map((view) => (
              <span key={view.id} className="group relative">
                <button
                  onClick={() => onApply(view)}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] py-1 pl-2 pr-6 text-[12px] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  {view.is_shared ? <Users size={11} /> : <Bookmark size={11} />}
                  {view.name}
                </button>
                {view.owner_id === viewer.id && (
                  <button
                    onClick={() => void remove(view)}
                    aria-label={`Delete view ${view.name}`}
                    className="absolute right-1 top-1/2 hidden -translate-y-1/2 text-[var(--color-ink-3)] hover:text-[var(--color-critical)] group-hover:block"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen(true)}
          disabled={count === 0}
          title={count === 0 ? "Set some filters first" : "Save these filters as a view"}
        >
          <BookmarkPlus size={13} /> Save view
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Save this view"
        description="Filters and layout are remembered together, so it opens exactly like this."
        width={420}
      >
        <form onSubmit={save}>
          <Field label="Name" htmlFor="view-name">
            <TextInput
              id="view-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Overdue UGC — SuperBottoms"
            />
          </Field>

          <label className="mt-3.5 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={shared}
              onChange={(event) => setShared(event.target.checked)}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <span className="text-[12.5px]">
              Share with the team
              <span className="block text-[11.5px] text-[var(--color-ink-3)]">
                Everyone sees the view. They still only see tickets they have
                access to.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              <Check size={13} /> Save view
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
