"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ExternalLink, Plus } from "lucide-react";
import type { Brand, Profile } from "@/lib/types";
import { BRAND_LINKS } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchBrands, queryKeys } from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button, Field, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

/** Brand swatches come from the categorical order so board colours stay distinct. */
const SWATCHES = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#9085e9",
  "#008300",
  "#e66767",
];

/** A brand nobody has filled in yet — also the shape the New dialog starts from. */
function blankBrand(): Brand {
  return {
    id: "",
    name: "",
    color: SWATCHES[0],
    is_active: true,
    brief_url: "",
    assets_url: "",
    onboarding_url: "",
    notes: "",
  };
}

export function BrandsClient({
  profile,
  initialBrands,
}: {
  profile: Profile;
  initialBrands: Brand[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();

  /** null = closed. A brand with no id is a new one. */
  const [editing, setEditing] = useState<Brand | null>(null);

  const brands = useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => fetchBrands(supabase),
    initialData: initialBrands,
  });

  async function patch(brand: Brand, fields: Partial<Brand>) {
    const { error } = await supabase.from("brands").update(fields).eq("id", brand.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.brands });
  }

  const rows = (brands.data ?? []) as Brand[];

  return (
    <>
      <PageHeader title="Brands" subtitle={`${rows.filter((b) => b.is_active).length} active`}>
        <Button variant="primary" size="sm" onClick={() => setEditing(blankBrand())}>
          <Plus size={14} /> New brand
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-3xl">
          <Card padded={false}>
            {rows.length === 0 ? (
              <EmptyState
                icon={<Building2 size={22} />}
                title="No brands yet"
                hint="Add the clients you make creative for — tickets get filed under them, analytics can be filtered by them, and the brand's brief and files sit on the profile where a designer can find them."
                action={
                  <Button variant="primary" size="sm" onClick={() => setEditing(blankBrand())}>
                    <Plus size={14} /> Add the first one
                  </Button>
                }
              />
            ) : (
              <ul>
                {rows.map((brand) => (
                  <li
                    key={brand.id}
                    className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3 last:border-0"
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-[var(--radius-sm)]"
                      style={{ background: brand.color, opacity: brand.is_active ? 1 : 0.4 }}
                    />

                    <button
                      onClick={() => setEditing(brand)}
                      className="min-w-0 flex-1 text-left"
                      style={{ opacity: brand.is_active ? 1 : 0.55 }}
                    >
                      <span className="block truncate text-[13.5px]">{brand.name}</span>
                      <ProfileState brand={brand} />
                    </button>

                    <span className="hidden items-center gap-1 sm:flex">
                      {SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          onClick={() => void patch(brand, { color: swatch })}
                          aria-label={`Set ${brand.name} colour`}
                          className="h-4 w-4 rounded-[3px] transition-transform hover:scale-110"
                          style={{
                            background: swatch,
                            outline: brand.color === swatch ? "2px solid var(--color-ink)" : "none",
                            outlineOffset: 1,
                          }}
                        />
                      ))}
                    </span>

                    <Button size="sm" variant="ghost" onClick={() => setEditing(brand)}>
                      Profile
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void patch(brand, { is_active: !brand.is_active })}
                    >
                      {brand.is_active ? "Archive" : "Restore"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="mt-4 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            Archiving keeps every past ticket intact — it just takes the brand
            out of the pickers. Whatever is on a profile shows on every ticket
            for that brand, so the designer working it doesn&apos;t have to go
            asking where the logo lives. Signed in as {profile.role}.
          </p>
        </div>
      </div>

      {editing && (
        <BrandDialog
          brand={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.brands });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/**
 * How much of this brand's profile exists.
 *
 * Said on the row rather than only inside the dialog, because the useful
 * question on this page is "which of our clients has nobody written down", and
 * answering it shouldn't take twelve clicks.
 */
function ProfileState({ brand }: { brand: Brand }) {
  const filled = BRAND_LINKS.filter((link) => brand[link.key].trim()).length;
  const note = brand.notes.trim().length > 0;

  if (filled === 0 && !note) {
    return (
      <span className="text-[11px] text-[var(--color-ink-3)]">Nothing on the profile yet</span>
    );
  }

  return (
    <span className="text-[11px] text-[var(--color-ink-3)]">
      {filled} of {BRAND_LINKS.length} links{note ? " · has notes" : ""}
    </span>
  );
}

/* ---------------------------------------------------------------- the form */

/**
 * One form for adding a brand and for its profile afterwards.
 *
 * The same fields either way, because the moment somebody has the brand kit to
 * hand is not reliably the moment they create the brand — and a second,
 * different screen for "edit" is how the two drift apart.
 *
 * Everything below the name is optional on purpose. A brand gets created in the
 * middle of raising a brief, by somebody who has a deadline and not a Drive
 * link, and a form that stops them there is a form that gets worked around.
 */
function BrandDialog({
  brand,
  onClose,
  onSaved,
}: {
  brand: Brand;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = supabaseBrowser();
  const isNew = brand.id === "";
  const [draft, setDraft] = useState<Brand>(brand);
  const [saving, setSaving] = useState(false);

  const set = (fields: Partial<Brand>) => setDraft((current) => ({ ...current, ...fields }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);

    const fields = {
      name: draft.name.trim(),
      color: draft.color,
      brief_url: draft.brief_url.trim(),
      assets_url: draft.assets_url.trim(),
      onboarding_url: draft.onboarding_url.trim(),
      notes: draft.notes.trim(),
    };

    const { error } = isNew
      ? await supabase.from("brands").insert(fields)
      : await supabase.from("brands").update(fields).eq("id", brand.id);

    setSaving(false);

    if (error) {
      toast.error(
        error.message.includes("duplicate") ? "That brand already exists" : error.message,
      );
      return;
    }

    toast.success(isNew ? "Brand added" : "Profile saved");
    onSaved();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? "New brand" : draft.name || "Brand profile"}
      description={
        isNew
          ? "Only the name is needed. The rest can wait until you have it."
          : "Everything here shows on every ticket for this brand."
      }
      width={480}
    >
      <form onSubmit={submit}>
        <Field label="Name" htmlFor="brand-name">
          <TextInput
            id="brand-name"
            autoFocus={isNew}
            required
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="Acme Skincare"
          />
        </Field>

        <Field label="Colour" className="mt-3.5" hint="Shows on every card for this brand">
          <div className="flex gap-1.5">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => set({ color: swatch })}
                aria-label={`Colour ${swatch}`}
                className="h-7 w-7 rounded-[var(--radius-sm)] transition-transform hover:scale-105"
                style={{
                  background: swatch,
                  outline: draft.color === swatch ? "2px solid var(--color-ink)" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </Field>

        {BRAND_LINKS.map((link) => (
          <Field
            key={link.key}
            label={link.label}
            htmlFor={`brand-${link.key}`}
            className="mt-3.5"
            hint={link.hint}
          >
            <TextInput
              id={`brand-${link.key}`}
              type="url"
              inputMode="url"
              value={draft[link.key]}
              onChange={(event) => set({ [link.key]: event.target.value } as Partial<Brand>)}
              placeholder="https://drive.google.com/…"
            />
          </Field>
        ))}

        <Field
          label="Anything else"
          htmlFor="brand-notes"
          className="mt-3.5"
          hint="Usually what to avoid — the thing nobody writes down and everybody finds out the hard way"
        >
          <TextArea
            id="brand-notes"
            rows={3}
            value={draft.notes}
            onChange={(event) => set({ notes: event.target.value })}
            placeholder="Never crop the logo. No lifestyle shots without the product in frame. The founder hates drop shadows."
          />
        </Field>

        {!isNew && <OpenLinks brand={draft} />}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!draft.name.trim()}>
            {isNew ? "Add brand" : "Save profile"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** A way to check a link actually goes where you think it does, before saving. */
function OpenLinks({ brand }: { brand: Brand }) {
  const live = BRAND_LINKS.filter((link) => brand[link.key].trim());
  if (live.length === 0) return null;

  return (
    <p className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--color-ink-3)]">
      <span>Open:</span>
      {live.map((link) => (
        <a
          key={link.key}
          href={brand[link.key]}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 transition-colors hover:text-[var(--color-ink-2)]"
        >
          {link.label}
          <ExternalLink size={10} />
        </a>
      ))}
    </p>
  );
}
