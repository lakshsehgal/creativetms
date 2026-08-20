"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, UserPlus } from "lucide-react";
import type { FormatBenchmark, Profile, UserRole } from "@/lib/types";
import { FORMAT_ORDER, FORMATS } from "@/lib/types";
import { minutesToHuman } from "@/lib/format";
import { Avatar, Card, PageHeader } from "@/components/ui/primitives";
import { Button, Field, Select, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import {
  inviteTeammate,
  setActive,
  setBenchmark,
  setCapacity,
  setRole,
  type ActionResult,
} from "@/app/(app)/team/actions";

const ROLE_BLURB: Record<UserRole, string> = {
  admin: "Everything, including timing data and this page",
  strategist: "Raises tickets, reviews work, sees team analytics",
  designer: "Works tickets, sees their own scorecard",
};

export function TeamClient({
  profile,
  team,
  benchmarks,
}: {
  profile: Profile;
  team: Profile[];
  benchmarks: FormatBenchmark[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inviting, setInviting] = useState(false);

  /** Every action returns the same shape, so one handler covers all of them. */
  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const grouped: Record<UserRole, Profile[]> = {
    admin: team.filter((person) => person.role === "admin"),
    strategist: team.filter((person) => person.role === "strategist"),
    designer: team.filter((person) => person.role === "designer"),
  };

  return (
    <>
      <PageHeader title="Team" subtitle={`${team.filter((p) => p.is_active).length} active members`}>
        <Button variant="primary" size="sm" onClick={() => setInviting(true)}>
          <UserPlus size={14} /> Invite
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-4xl space-y-5">
          {(Object.keys(grouped) as UserRole[]).map((role) => (
            <Card key={role} padded={false}>
              <div className="flex items-baseline gap-2 border-b border-[var(--color-line)] px-4 py-3">
                <h2 className="text-[13px] font-semibold capitalize tracking-tight">{role}s</h2>
                <p className="text-[11.5px] text-[var(--color-ink-3)]">{ROLE_BLURB[role]}</p>
              </div>

              {grouped[role].length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-[var(--color-ink-3)]">
                  Nobody in this role yet.
                </p>
              ) : (
                <ul>
                  {grouped[role].map((person) => (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-4 py-2.5 last:border-0"
                    >
                      <Avatar
                        id={person.id}
                        name={person.full_name}
                        email={person.email}
                        size={28}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium leading-tight">
                          {person.full_name || person.email.split("@")[0]}
                          {person.id === profile.id && (
                            <span className="ml-1.5 text-[11px] font-normal text-[var(--color-ink-3)]">
                              you
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11.5px] leading-tight text-[var(--color-ink-3)]">
                          {person.email}
                        </p>
                      </div>

                      {role === "designer" && (
                        <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-3)]">
                          Day
                          <TextInput
                            type="number"
                            min={1}
                            max={24}
                            defaultValue={Math.round(person.daily_capacity_minutes / 60)}
                            disabled={pending}
                            onBlur={(event) => {
                              const hours = Number(event.target.value);
                              if (!hours || hours * 60 === person.daily_capacity_minutes) return;
                              run(() => setCapacity(person.id, hours * 60));
                            }}
                            className="!w-14 !px-2 !py-1 !text-[12px]"
                            aria-label={`Working hours for ${person.full_name || person.email}`}
                          />
                          h
                        </label>
                      )}

                      <Select
                        value={person.role}
                        disabled={pending || person.id === profile.id}
                        onChange={(event) =>
                          run(() => setRole(person.id, event.target.value as UserRole))
                        }
                        aria-label={`Role for ${person.full_name || person.email}`}
                        className="!w-auto !py-1 !text-[12px]"
                      >
                        <option value="designer">Designer</option>
                        <option value="strategist">Strategist</option>
                        <option value="admin">Admin</option>
                      </Select>

                      <Button
                        size="sm"
                        variant={person.is_active ? "ghost" : "secondary"}
                        disabled={pending || person.id === profile.id}
                        onClick={() => run(() => setActive(person.id, !person.is_active))}
                      >
                        {person.is_active ? "Revoke" : "Restore"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}

          {/* ------------------------------------------------- benchmarks */}
          <Card>
            <div className="flex items-start gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--color-ink-3)]" />
              <div>
                <h2 className="text-[13px] font-semibold tracking-tight">Format benchmarks</h2>
                <p className="mt-0.5 max-w-xl text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
                  The minutes one unit of each format is expected to take. Every
                  pace figure on a scorecard is measured against these, so set
                  them to something the team agrees is fair — a bar nobody
                  believes in is a bar nobody works to.
                </p>
              </div>
            </div>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FORMAT_ORDER.map((format) => {
                const row = benchmarks.find((item) => item.format === format);
                return (
                  <li
                    key={format}
                    className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-3"
                  >
                    <p
                      className="flex items-center gap-1.5 text-[12px] font-medium"
                      style={{ color: FORMATS[format].series }}
                    >
                      <span aria-hidden style={{ fontSize: 9 }}>
                        {FORMATS[format].icon}
                      </span>
                      {FORMATS[format].label}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <TextInput
                        type="number"
                        min={1}
                        max={2000}
                        defaultValue={row?.target_minutes_per_unit ?? 60}
                        disabled={pending}
                        onBlur={(event) => {
                          const minutes = Number(event.target.value);
                          if (!minutes || minutes === row?.target_minutes_per_unit) return;
                          run(() => setBenchmark(format, minutes));
                        }}
                        aria-label={`Benchmark minutes for ${FORMATS[format].label}`}
                        className="!w-20 !px-2 !py-1 !text-[13px]"
                      />
                      <span className="text-[11.5px] text-[var(--color-ink-3)]">min / unit</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-[var(--color-ink-3)]">
                      {minutesToHuman(row?.target_minutes_per_unit)} per {FORMATS[format].label.toLowerCase()}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} onDone={() => router.refresh()} />
    </>
  );
}

function InviteDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite a teammate"
      description="They'll get an email, and their role is waiting for them the moment they sign in."
    >
      <form
        action={(formData) =>
          startTransition(async () => {
            const result = await inviteTeammate(formData);
            if (result.ok) {
              toast.success(result.message);
              onDone();
              onClose();
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        <Field label="Email" htmlFor="invite-email">
          <TextInput
            id="invite-email"
            name="email"
            type="email"
            required
            autoFocus
            placeholder="designer@studio.com"
          />
        </Field>

        <Field label="Name" htmlFor="invite-name" className="mt-3.5" hint="Optional">
          <TextInput id="invite-name" name="full_name" placeholder="Priya Sharma" />
        </Field>

        <Field label="Role" htmlFor="invite-role" className="mt-3.5">
          <Select id="invite-role" name="role" defaultValue="designer">
            <option value="designer">Designer — works tickets, sees own scorecard</option>
            <option value="strategist">Strategist — raises and reviews tickets</option>
            <option value="admin">Admin — full access including timing data</option>
          </Select>
        </Field>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Send invite
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
