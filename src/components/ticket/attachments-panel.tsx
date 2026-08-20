"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import type { Attachment, Profile } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { Button } from "@/components/ui/form";

const BUCKET = "creative-assets";
const MAX_BYTES = 200 * 1024 * 1024;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is over 200 MB — link it from Drive instead.`);
        continue;
      }

      const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
      const path = `${ticketId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        toast.error(`${file.name}: ${uploadError.message}`);
        continue;
      }

      const { error: rowError } = await supabase.from("attachments").insert({
        ticket_id: ticketId,
        uploaded_by: profile.id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        round,
      });

      if (rowError) toast.error(rowError.message);
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    queryClient.invalidateQueries({ queryKey: queryKeys.attachments(ticketId) });
  }

  /** Bucket is private, so downloads go through a short-lived signed URL. */
  async function download(item: Attachment) {
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
    await supabase.storage.from(BUCKET).remove([item.storage_path]);
    const { error } = await supabase.from("attachments").delete().eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.attachments(ticketId) });
  }

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        void upload(event.dataTransfer.files);
      }}
      className={`rounded-[var(--radius-lg)] border p-4 transition-colors ${
        dragOver
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-line)] bg-[var(--color-surface)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <Paperclip size={13} className="text-[var(--color-ink-3)]" />
        <h3 className="text-[12px] font-semibold tracking-tight">Working files</h3>
        <span className="ml-auto">
          <Button
            size="sm"
            variant="ghost"
            loading={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={13} /> Upload
          </Button>
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => void upload(event.target.files)}
      />

      {attachments.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-3)]">
          Optional. Finished work goes to Frame.io via the review link above —
          this is for the odd source file, font or reference that needs to sit
          with the ticket.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {attachments.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <span className="min-w-0 flex-1">
                <button
                  onClick={() => void download(item)}
                  className="block max-w-full truncate text-left text-[12.5px] hover:text-[var(--color-accent)]"
                >
                  {item.file_name}
                </button>
                <span className="text-[10.5px] text-[var(--color-ink-3)]">
                  {formatBytes(item.size_bytes)} · {relativeTime(item.created_at)}
                  {item.round > 0 && ` · round ${item.round}`}
                </span>
              </span>

              <button
                onClick={() => void download(item)}
                aria-label={`Download ${item.file_name}`}
                className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] opacity-0 transition-opacity hover:text-[var(--color-ink)] focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Download size={13} />
              </button>

              {(item.uploaded_by === profile.id || profile.role === "admin") && (
                <button
                  onClick={() => void remove(item)}
                  aria-label={`Delete ${item.file_name}`}
                  className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] opacity-0 transition-opacity hover:text-[var(--color-critical)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
