"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import type { Attachment, Profile } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { Button, TextInput } from "@/components/ui/form";

const BUCKET = "creative-assets";

/**
 * Where the working files actually live.
 *
 * These are links, not uploads. The source files already sit on Drive, Frame.io
 * or Dropbox, and holding a second copy here only created a place for versions
 * to go stale — the ticket's job is to say where the work is.
 *
 * Files uploaded before the change keep their rows and stay downloadable; they
 * simply can't be added to any more.
 */
export function AttachmentsPanel({
  ticketId,
  round,
  profile,
  attachments,
}: {
  ticketId: string;
  round: number;
  profile: Profile;
  attachments: Attachment[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  async function addLink(event: React.FormEvent) {
    event.preventDefault();
    const clean = url.trim();
    if (!clean) return;

    const parsed = safeUrl(clean);
    if (!parsed) {
      toast.error("That doesn't look like a link. It needs to start with https://");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("attachments").insert({
      ticket_id: ticketId,
      uploaded_by: profile.id,
      url: parsed.href,
      label: label.trim() || describeHost(parsed),
      file_name: "",
      round,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setUrl("");
    setLabel("");
    setAdding(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.attachments(ticketId) });
  }

  /** Bucket is private, so downloads go through a short-lived signed URL. */
  async function download(item: Attachment) {
    if (!item.storage_path) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(item.storage_path, 60, { download: item.file_name });
    if (error || !data) {
      toast.error("Couldn't open that file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(item: Attachment) {
    const name = displayName(item);
    if (!window.confirm(`Remove "${name}" from this ticket?`)) return;

    // Only ever delete from storage what storage actually holds. A link row
    // has no object behind it, and passing null here would throw.
    if (item.storage_path) {
      await supabase.storage.from(BUCKET).remove([item.storage_path]);
    }
    const { error } = await supabase.from("attachments").delete().eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.attachments(ticketId) });
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-2">
        <Link2 size={13} className="text-[var(--color-ink-3)]" />
        <h3 className="text-[12px] font-semibold tracking-tight">Working files</h3>
        <span className="ml-auto">
          <Button size="sm" variant="ghost" onClick={() => setAdding((open) => !open)}>
            <Plus size={13} /> Add link
          </Button>
        </span>
      </div>

      {adding && (
        <form onSubmit={addLink} className="mt-3 space-y-2">
          <TextInput
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://drive.google.com/…"
            aria-label="Link to the working file"
          />
          <TextInput
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="What is it? (optional)"
            aria-label="Label"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setUrl("");
                setLabel("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" loading={saving}>
              Add
            </Button>
          </div>
        </form>
      )}

      {attachments.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-3)]">
          Link the project file, the raw footage, the font pack — wherever it
          already lives. Finished work goes to Frame.io through the review link
          above; this is for everything that feeds it.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {attachments.map((item) => {
            const parsed = item.url ? safeUrl(item.url) : null;
            const name = displayName(item);

            return (
              <li
                key={item.id}
                className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <span className="min-w-0 flex-1">
                  {parsed ? (
                    <a
                      href={parsed.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-full truncate text-[12.5px] hover:text-[var(--color-accent)]"
                    >
                      {name}
                    </a>
                  ) : (
                    <button
                      onClick={() => void download(item)}
                      className="block max-w-full truncate text-left text-[12.5px] hover:text-[var(--color-accent)]"
                    >
                      {name}
                    </button>
                  )}
                  <span className="truncate text-[10.5px] text-[var(--color-ink-3)]">
                    {parsed ? describeHost(parsed) : formatBytes(item.size_bytes)} ·{" "}
                    {relativeTime(item.created_at)}
                    {item.round > 0 && ` · round ${item.round}`}
                  </span>
                </span>

                {parsed ? (
                  <a
                    href={parsed.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${name}`}
                    className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] opacity-0 transition-opacity hover:text-[var(--color-ink)] focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <button
                    onClick={() => void download(item)}
                    aria-label={`Download ${name}`}
                    className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] opacity-0 transition-opacity hover:text-[var(--color-ink)] focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Download size={13} />
                  </button>
                )}

                {(item.uploaded_by === profile.id || profile.role === "admin") && (
                  <button
                    onClick={() => void remove(item)}
                    aria-label={`Remove ${name}`}
                    className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] opacity-0 transition-opacity hover:text-[var(--color-critical)] focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- helpers */

/**
 * Parse, and refuse anything that isn't http(s).
 *
 * These links are typed by one person and clicked by another, so a
 * `javascript:` URL stored here would run in the reader's session. The
 * database has the same check; this one keeps the bad paste from ever
 * being sent.
 */
function safeUrl(value: string): URL | null {
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

const HOSTS: [RegExp, string][] = [
  [/(^|\.)drive\.google\.com$/, "Google Drive"],
  [/(^|\.)docs\.google\.com$/, "Google Docs"],
  [/(^|\.)frame\.io$/, "Frame.io"],
  [/(^|\.)dropbox\.com$/, "Dropbox"],
  [/(^|\.)wetransfer\.com$/, "WeTransfer"],
  [/(^|\.)figma\.com$/, "Figma"],
  [/(^|\.)notion\.so$/, "Notion"],
  [/(^|\.)canva\.com$/, "Canva"],
  [/(^|\.)sharepoint\.com$/, "SharePoint"],
  [/(^|\.)onedrive\.live\.com$/, "OneDrive"],
];

function describeHost(parsed: URL): string {
  const host = parsed.hostname.toLowerCase();
  for (const [pattern, name] of HOSTS) if (pattern.test(host)) return name;
  return host.replace(/^www\./, "");
}

function displayName(item: Attachment): string {
  if (item.label) return item.label;
  if (item.file_name) return item.file_name;
  if (item.url) {
    const parsed = safeUrl(item.url);
    return parsed ? describeHost(parsed) : item.url;
  }
  return "Untitled";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
