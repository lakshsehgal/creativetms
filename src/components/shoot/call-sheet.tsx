"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clapperboard,
  MapPin,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
  UsersRound,
  UtensilsCrossed,
  Eye,
} from "lucide-react";
import type {
  Brand,
  CrewGroup,
  ShootActor,
  ShootDoc,
  ShootLocation,
  ShootScript,
} from "@/lib/types";
import { CREW_ROLES, SCRIPT_VERSIONS } from "@/lib/types";
import { crewCount, mealCostTotal, mealsSelected, rowId, rupees } from "@/lib/shoot";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Card } from "@/components/ui/primitives";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";

/**
 * The call sheet.
 *
 * Two renderings of the same document: the form, and the thing you print and
 * hand to a crew standing in a car park. Both are in the DOM — print CSS
 * decides which one goes on paper, so what comes out of the printer is never
 * a page of input boxes, whichever mode somebody left it in.
 */

interface Meta {
  title?: string;
  brand?: string;
  shoot_date?: string | null;
}

export function CallSheet({
  title,
  brand,
  shootDate,
  doc,
  onMeta,
  onDoc,
}: {
  title: string;
  brand: string;
  shootDate: string | null;
  doc: ShootDoc;
  onMeta: (meta: Meta) => void;
  onDoc: (doc: ShootDoc) => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // The brand list is the real one, not a hardcoded copy that drifts the first
  // time somebody signs a new client.
  const brands = useQuery({
    queryKey: ["brands", "names"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabaseBrowser()
        .from("brands")
        .select("id,name,color,is_active")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as Brand[];
    },
  });

  const patch = (next: Partial<ShootDoc>) => onDoc({ ...doc, ...next });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
        >
          {mode === "edit" ? (
            <>
              <Eye size={13} /> Preview
            </>
          ) : (
            <>
              <Pencil size={13} /> Edit
            </>
          )}
        </Button>
        <span className="text-[11.5px] text-[var(--color-ink-3)]">
          Printing always gives you the preview, whichever one you&apos;re looking at.
        </span>
      </div>

      <div className={mode === "edit" ? "space-y-4 print:hidden" : "hidden"}>
        <Editor
          title={title}
          brand={brand}
          shootDate={shootDate}
          doc={doc}
          brands={brands.data ?? []}
          onMeta={onMeta}
          patch={patch}
        />
      </div>

      <div className={mode === "preview" ? "block" : "hidden print:block"}>
        <Preview title={title} brand={brand} shootDate={shootDate} doc={doc} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- edit */

function Editor({
  title,
  brand,
  shootDate,
  doc,
  brands,
  onMeta,
  patch,
}: {
  title: string;
  brand: string;
  shootDate: string | null;
  doc: ShootDoc;
  brands: Brand[];
  onMeta: (meta: Meta) => void;
  patch: (next: Partial<ShootDoc>) => void;
}) {
  const dayOptions = Array.from({ length: Math.max(1, doc.days) }, (_, index) => index + 1);

  return (
    <>
      {/* ------------------------------------------------------- the shoot */}
      <Card>
        <SectionHead icon={<Clapperboard size={13} />} title="The shoot" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What it's called" htmlFor="cs-title">
            <TextInput
              id="cs-title"
              value={title}
              placeholder="SuperBottoms monsoon shoot"
              onChange={(event) => onMeta({ title: event.target.value })}
            />
          </Field>
          <Field label="Brand" htmlFor="cs-brand">
            <TextInput
              id="cs-brand"
              list="cs-brand-list"
              value={brand}
              placeholder="Pick or type one"
              onChange={(event) => onMeta({ brand: event.target.value })}
            />
            <datalist id="cs-brand-list">
              {brands.map((row) => (
                <option key={row.id} value={row.name} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Shoot date" htmlFor="cs-date">
            <TextInput
              id="cs-date"
              type="date"
              value={shootDate ?? ""}
              onChange={(event) => onMeta({ shoot_date: event.target.value || null })}
            />
          </Field>
          <Field label="Call time" htmlFor="cs-time">
            <TextInput
              id="cs-time"
              type="time"
              value={doc.callTime}
              onChange={(event) => patch({ callTime: event.target.value })}
            />
          </Field>
          <Field label="How many days" htmlFor="cs-days">
            <Select
              id="cs-days"
              value={String(doc.days)}
              onChange={(event) => patch({ days: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                <option key={count} value={count}>
                  {count} {count === 1 ? "day" : "days"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* -------------------------------------------------------- locations */}
      <Card>
        <SectionHead
          icon={<MapPin size={13} />}
          title="Locations"
          action={
            <AddRow
              label="Add a location"
              onClick={() =>
                patch({
                  locations: [
                    ...doc.locations,
                    { id: rowId(), name: "", mapUrl: "", address: "" },
                  ],
                })
              }
            />
          }
        />
        {doc.locations.length === 0 ? (
          <Blank>Nowhere yet. Add the address the crew will type into Maps at 6am.</Blank>
        ) : (
          <ul className="space-y-2.5">
            {doc.locations.map((place, index) => (
              <li key={place.id} className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-3">
                <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
                  <TextInput
                    aria-label={`Location ${index + 1} name`}
                    value={place.name}
                    placeholder="Warehouse, studio, home set…"
                    onChange={(event) =>
                      patch({
                        locations: replace<ShootLocation>(doc.locations, index, {
                          name: event.target.value,
                        }),
                      })
                    }
                  />
                  <TextInput
                    aria-label={`Location ${index + 1} map link`}
                    value={place.mapUrl}
                    placeholder="Google Maps link"
                    onChange={(event) =>
                      patch({
                        locations: replace<ShootLocation>(doc.locations, index, {
                          mapUrl: event.target.value,
                        }),
                      })
                    }
                  />
                  <RemoveRow
                    label={`Remove location ${index + 1}`}
                    onClick={() => patch({ locations: without(doc.locations, index) })}
                  />
                </div>
                <div className="mt-2.5">
                  <TextArea
                    aria-label={`Location ${index + 1} address`}
                    rows={2}
                    value={place.address}
                    placeholder="Full address, gate number, who to ask for"
                    onChange={(event) =>
                      patch({
                        locations: replace<ShootLocation>(doc.locations, index, {
                          address: event.target.value,
                        }),
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------------------------------------------------- scripts */}
      <Card>
        <SectionHead
          icon={<ScrollText size={13} />}
          title="Scripts"
          action={
            <AddRow
              label="Add a script"
              onClick={() =>
                patch({
                  scripts: [
                    ...doc.scripts,
                    { id: rowId(), name: "", day: 1, hours: "", versions: "Vertical", link: "" },
                  ],
                })
              }
            />
          }
        />
        {doc.scripts.length === 0 ? (
          <Blank>No scripts yet. Each one is a thing that has to come back in the can.</Blank>
        ) : (
          <ul className="space-y-2.5">
            {doc.scripts.map((script, index) => (
              <li key={script.id} className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-3">
                <div className="grid gap-2.5 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <TextInput
                    aria-label={`Script ${index + 1} name`}
                    value={script.name}
                    placeholder="Script name"
                    onChange={(event) =>
                      patch({
                        scripts: replace<ShootScript>(doc.scripts, index, {
                          name: event.target.value,
                        }),
                      })
                    }
                  />
                  <Select
                    aria-label={`Script ${index + 1} day`}
                    value={String(script.day)}
                    onChange={(event) =>
                      patch({
                        scripts: replace<ShootScript>(doc.scripts, index, {
                          day: Number(event.target.value),
                        }),
                      })
                    }
                  >
                    {dayOptions.map((day) => (
                      <option key={day} value={day}>
                        Day {day}
                      </option>
                    ))}
                  </Select>
                  {/* The unit stays on screen once the box has a number in
                      it — a bare "4" beside a script is unreadable at 6am. */}
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      aria-label={`Script ${index + 1} expected hours`}
                      value={script.hours}
                      placeholder="Hours"
                      onChange={(event) =>
                        patch({
                          scripts: replace<ShootScript>(doc.scripts, index, {
                            hours: event.target.value,
                          }),
                        })
                      }
                      className="min-w-0"
                    />
                    <span className="shrink-0 text-[11.5px] text-[var(--color-ink-3)]">h</span>
                  </div>
                  <RemoveRow
                    label={`Remove script ${index + 1}`}
                    onClick={() => patch({ scripts: without(doc.scripts, index) })}
                  />
                </div>
                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[1fr_2fr]">
                  <Select
                    aria-label={`Script ${index + 1} versions`}
                    value={script.versions}
                    onChange={(event) =>
                      patch({
                        scripts: replace<ShootScript>(doc.scripts, index, {
                          versions: event.target.value,
                        }),
                      })
                    }
                  >
                    {SCRIPT_VERSIONS.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </Select>
                  <TextInput
                    aria-label={`Script ${index + 1} link`}
                    value={script.link}
                    placeholder="Link to the script or shot list"
                    onChange={(event) =>
                      patch({
                        scripts: replace<ShootScript>(doc.scripts, index, {
                          link: event.target.value,
                        }),
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------------------- crew */}
      <Card>
        <SectionHead
          icon={<UsersRound size={13} />}
          title="Crew"
          hint={`${crewCount(doc.crew)} named`}
          action={
            <AddRow
              label="Add a role"
              onClick={() =>
                patch({
                  crew: [
                    ...doc.crew,
                    { id: rowId(), role: "Other", members: [{ id: rowId(), name: "", reportingTime: "" }] },
                  ],
                })
              }
            />
          }
        />
        <ul className="space-y-2.5">
          {doc.crew.map((group, groupIndex) => (
            <li key={group.id} className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-3">
              <div className="flex items-center gap-2.5">
                <Select
                  aria-label={`Crew group ${groupIndex + 1} role`}
                  value={group.role}
                  onChange={(event) =>
                    patch({
                      crew: replace<CrewGroup>(doc.crew, groupIndex, { role: event.target.value }),
                    })
                  }
                >
                  {CREW_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
                <RemoveRow
                  label={`Remove the ${group.role} group`}
                  onClick={() => patch({ crew: without(doc.crew, groupIndex) })}
                />
              </div>

              <ul className="mt-2.5 space-y-2">
                {group.members.map((member, memberIndex) => (
                  <li key={member.id} className="grid gap-2.5 sm:grid-cols-[2fr_1fr_auto]">
                    <TextInput
                      aria-label={`${group.role} name`}
                      value={member.name}
                      placeholder="Name"
                      onChange={(event) =>
                        patch({
                          crew: replaceMember(doc.crew, groupIndex, memberIndex, {
                            name: event.target.value,
                          }),
                        })
                      }
                    />
                    <TextInput
                      aria-label={`${group.role} reporting time`}
                      type="time"
                      value={member.reportingTime}
                      onChange={(event) =>
                        patch({
                          crew: replaceMember(doc.crew, groupIndex, memberIndex, {
                            reportingTime: event.target.value,
                          }),
                        })
                      }
                    />
                    <RemoveRow
                      label={`Remove ${member.name || "this person"}`}
                      onClick={() =>
                        patch({
                          crew: replace<CrewGroup>(doc.crew, groupIndex, {
                            members: without(group.members, memberIndex),
                          }),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>

              <button
                onClick={() =>
                  patch({
                    crew: replace<CrewGroup>(doc.crew, groupIndex, {
                      members: [...group.members, { id: rowId(), name: "", reportingTime: "" }],
                    }),
                  })
                }
                className="mt-2 text-[11.5px] font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
              >
                + Someone else in {group.role.toLowerCase()}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {/* ----------------------------------------------------------- actors */}
      <Card>
        <SectionHead
          icon={<UsersRound size={13} />}
          title="Actors"
          action={
            <AddRow
              label="Add an actor"
              onClick={() =>
                patch({
                  actors: [
                    ...doc.actors,
                    { id: rowId(), name: "", age: "", requirement: "", timeIn: "", timeOut: "" },
                  ],
                })
              }
            />
          }
        />
        {doc.actors.length === 0 ? (
          <Blank>Nobody cast yet.</Blank>
        ) : (
          <ul className="space-y-2.5">
            {doc.actors.map((actor, index) => (
              <li key={actor.id} className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-3">
                <div className="grid gap-2.5 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <TextInput
                    aria-label={`Actor ${index + 1} name`}
                    value={actor.name}
                    placeholder="Name"
                    onChange={(event) =>
                      patch({
                        actors: replace<ShootActor>(doc.actors, index, { name: event.target.value }),
                      })
                    }
                  />
                  <div className="flex items-center gap-1.5">
                    <TextInput
                      aria-label={`Actor ${index + 1} age`}
                      value={actor.age}
                      placeholder="Age"
                      onChange={(event) =>
                        patch({
                          actors: replace<ShootActor>(doc.actors, index, {
                            age: event.target.value,
                          }),
                        })
                      }
                      className="min-w-0"
                    />
                    <span className="shrink-0 text-[11.5px] text-[var(--color-ink-3)]">yrs</span>
                  </div>
                  <TextInput
                    aria-label={`Actor ${index + 1} time in`}
                    type="time"
                    value={actor.timeIn}
                    onChange={(event) =>
                      patch({
                        actors: replace<ShootActor>(doc.actors, index, {
                          timeIn: event.target.value,
                        }),
                      })
                    }
                  />
                  <TextInput
                    aria-label={`Actor ${index + 1} time out`}
                    type="time"
                    value={actor.timeOut}
                    onChange={(event) =>
                      patch({
                        actors: replace<ShootActor>(doc.actors, index, {
                          timeOut: event.target.value,
                        }),
                      })
                    }
                  />
                  <RemoveRow
                    label={`Remove actor ${index + 1}`}
                    onClick={() => patch({ actors: without(doc.actors, index) })}
                  />
                </div>
                <div className="mt-2.5">
                  <TextInput
                    aria-label={`Actor ${index + 1} requirement`}
                    value={actor.requirement}
                    placeholder="What they're needed for — wardrobe, look, scenes"
                    onChange={(event) =>
                      patch({
                        actors: replace<ShootActor>(doc.actors, index, {
                          requirement: event.target.value,
                        }),
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------------------ meals */}
      <Card>
        <SectionHead icon={<UtensilsCrossed size={13} />} title="Meals" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["breakfast", "lunch", "dinner", "snacks"] as const).map((meal) => (
            <label
              key={meal}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px] capitalize"
            >
              <input
                type="checkbox"
                checked={doc.meals[meal]}
                onChange={(event) =>
                  patch({ meals: { ...doc.meals, [meal]: event.target.checked } })
                }
              />
              {meal}
            </label>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Cost per meal, per person" htmlFor="cs-meal-cost" hint="₹">
            <TextInput
              id="cs-meal-cost"
              inputMode="numeric"
              value={doc.meals.costPerMeal}
              onChange={(event) =>
                patch({ meals: { ...doc.meals, costPerMeal: event.target.value } })
              }
            />
          </Field>
          <Field label="Estimated total" htmlFor="cs-meal-total" hint="meals × crew × cost">
            <TextInput
              id="cs-meal-total"
              readOnly
              value={`${rupees(mealCostTotal(doc))}  (${mealsSelected(doc.meals)} × ${crewCount(doc.crew)} crew)`}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Notes" htmlFor="cs-meal-notes" hint="Allergies, who's arranging it, where from">
            <TextArea
              id="cs-meal-notes"
              rows={2}
              value={doc.meals.notes}
              onChange={(event) => patch({ meals: { ...doc.meals, notes: event.target.value } })}
            />
          </Field>
        </div>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------- preview */

function Preview({
  title,
  brand,
  shootDate,
  doc,
}: {
  title: string;
  brand: string;
  shootDate: string | null;
  doc: ShootDoc;
}) {
  const when = useMemo(() => {
    const parts: string[] = [];
    if (shootDate) {
      parts.push(
        new Date(`${shootDate}T00:00:00`).toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      );
    }
    if (doc.callTime) parts.push(`call ${doc.callTime}`);
    parts.push(`${doc.days} ${doc.days === 1 ? "day" : "days"}`);
    return parts.join("  ·  ");
  }, [shootDate, doc.callTime, doc.days]);

  const scriptsByDay = useMemo(() => {
    const map = new Map<number, ShootScript[]>();
    for (const script of doc.scripts) {
      const list = map.get(script.day) ?? [];
      list.push(script);
      map.set(script.day, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [doc.scripts]);

  const total = mealCostTotal(doc);

  return (
    <Card>
      <header className="border-b border-[var(--color-line)] pb-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-3)]">
          {brand || "Shoot"} — call sheet
        </p>
        <h2 className="mt-0.5 text-[20px] font-semibold tracking-tight">
          {title || "Untitled shoot"}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-2)]">{when}</p>
      </header>

      <PreviewSection title="Locations">
        {doc.locations.length === 0 ? (
          <Dash />
        ) : (
          <ul className="space-y-2">
            {doc.locations.map((place) => (
              <li key={place.id} className="text-[12.5px] leading-relaxed">
                <span className="font-medium">{place.name || "Location"}</span>
                {place.address && (
                  <span className="text-[var(--color-ink-2)]"> — {place.address}</span>
                )}
                {place.mapUrl && (
                  <>
                    {" "}
                    <a
                      href={place.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-accent)] underline"
                    >
                      map
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </PreviewSection>

      <PreviewSection title="Scripts">
        {scriptsByDay.length === 0 ? (
          <Dash />
        ) : (
          <div className="space-y-3">
            {scriptsByDay.map(([day, scripts]) => (
              <div key={day}>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-3)]">
                  Day {day}
                </p>
                <ul className="mt-1 space-y-1">
                  {scripts.map((script) => (
                    <li key={script.id} className="text-[12.5px]">
                      <span className="font-medium">{script.name || "Script"}</span>
                      <span className="text-[var(--color-ink-2)]">
                        {script.versions ? ` · ${script.versions}` : ""}
                        {script.hours ? ` · ${script.hours}h` : ""}
                      </span>
                      {script.link && (
                        <>
                          {" "}
                          <a
                            href={script.link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--color-accent)] underline"
                          >
                            open
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </PreviewSection>

      <PreviewSection title="Crew">
        {crewCount(doc.crew) === 0 ? (
          <Dash />
        ) : (
          <div className="space-y-2">
            {doc.crew
              .filter((group) => group.members.some((member) => member.name.trim()))
              .map((group) => (
                <div key={group.id} className="text-[12.5px]">
                  <span className="text-[var(--color-ink-3)]">{group.role}: </span>
                  {group.members
                    .filter((member) => member.name.trim())
                    .map(
                      (member) =>
                        `${member.name}${member.reportingTime ? ` (${member.reportingTime})` : ""}`,
                    )
                    .join(", ")}
                </div>
              ))}
          </div>
        )}
      </PreviewSection>

      <PreviewSection title="Actors">
        {doc.actors.length === 0 ? (
          <Dash />
        ) : (
          <ul className="space-y-1">
            {doc.actors.map((actor) => (
              <li key={actor.id} className="text-[12.5px]">
                <span className="font-medium">{actor.name || "Actor"}</span>
                <span className="text-[var(--color-ink-2)]">
                  {actor.age ? ` · ${actor.age}` : ""}
                  {actor.timeIn || actor.timeOut
                    ? ` · ${actor.timeIn || "?"}–${actor.timeOut || "?"}`
                    : ""}
                  {actor.requirement ? ` · ${actor.requirement}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PreviewSection>

      <PreviewSection title="Meals">
        {mealsSelected(doc.meals) === 0 ? (
          <Dash />
        ) : (
          <div className="text-[12.5px] leading-relaxed">
            <p>
              {(["breakfast", "lunch", "dinner", "snacks"] as const)
                .filter((meal) => doc.meals[meal])
                .map((meal) => meal[0].toUpperCase() + meal.slice(1))
                .join(", ")}
            </p>
            {total > 0 && (
              <p className="text-[var(--color-ink-2)]">
                {rupees(total)} estimated — {mealsSelected(doc.meals)} meals ×{" "}
                {crewCount(doc.crew)} crew × {rupees(Number(doc.meals.costPerMeal) || 0)}
              </p>
            )}
            {doc.meals.notes && (
              <p className="text-[var(--color-ink-2)]">{doc.meals.notes}</p>
            )}
          </div>
        )}
      </PreviewSection>
    </Card>
  );
}

/* ------------------------------------------------------------ small bits */

function SectionHead({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-[var(--color-ink-3)]">{icon}</span>
      <h3 className="text-[12.5px] font-semibold tracking-tight">{title}</h3>
      {hint && <span className="text-[11.5px] text-[var(--color-ink-3)]">{hint}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 break-inside-avoid">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Dash() {
  return <p className="text-[12.5px] text-[var(--color-ink-3)]">—</p>;
}

function Blank({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-3 text-[12px] text-[var(--color-ink-3)]">
      {children}
    </p>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      <Plus size={13} /> {label}
    </Button>
  );
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-critical)]"
    >
      <Trash2 size={13} />
    </button>
  );
}

/* --------------------------------------------------------------- helpers */

function replace<T>(rows: T[], index: number, patch: Partial<T>): T[] {
  return rows.map((row, position) => (position === index ? { ...row, ...patch } : row));
}

function without<T>(rows: T[], index: number): T[] {
  return rows.filter((_, position) => position !== index);
}

function replaceMember(
  crew: CrewGroup[],
  groupIndex: number,
  memberIndex: number,
  patch: Partial<CrewGroup["members"][number]>,
): CrewGroup[] {
  return crew.map((group, position) =>
    position === groupIndex
      ? {
          ...group,
          members: group.members.map((member, memberPosition) =>
            memberPosition === memberIndex ? { ...member, ...patch } : member,
          ),
        }
      : group,
  );
}
