"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import type { Brand, Profile } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchBrands, queryKeys } from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button, Field, TextInput } from "@/components/ui/form";
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

export function BrandsClient({
  profile,
  initialBrands,
}: {
  profile: Profile;
  initialBrands: Brand[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [saving, setSaving] = useState(false);

  const brands = useQuery({
    queryKey: queryKeys.brands,
    queryFn: () => fetchBrands(supabase),
    initialData: initialBrands,
  });

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("brands").insert({ name: name.trim(), color });
    setSaving(false);

    if (error) {
      toast.error(error.message.includes("duplicate") ? "That brand already exists" : error.message);
      return;
    }

    setName("");
    setAdding(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.brands });
    toast.success("Brand added");
  }

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
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
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
                hint="Add the clients you make creative for — tickets get filed under them and analytics can be filtered by them."
                action={
                  <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
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
                    <span
                      className="min-w-0 flex-1 truncate text-[13.5px]"
                      style={{ opacity: brand.is_active ? 1 : 0.55 }}
                    >
                      {brand.name}
                    </span>

                    <span className="flex items-center gap-1">
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

          <p className="mt-4 text-[11.5px] text-[var(--color-ink-3)]">
            Archiving keeps every past ticket intact — it just takes the brand
            out of the pickers. Signed in as {profile.role}.
          </p>
        </div>
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="New brand" width={420}>
        <form onSubmit={create}>
          <Field label="Name" htmlFor="brand-name">
            <TextInput
              id="brand-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Skincare"
            />
          </Field>

          <Field label="Colour" className="mt-3.5" hint="Shows on every card for this brand">
            <div className="flex gap-1.5">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Colour ${swatch}`}
                  className="h-7 w-7 rounded-[var(--radius-sm)] transition-transform hover:scale-105"
                  style={{
                    background: swatch,
                    outline: color === swatch ? "2px solid var(--color-ink)" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Add brand
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
