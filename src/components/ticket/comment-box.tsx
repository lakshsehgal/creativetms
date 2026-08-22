"use client";

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtSign, Send } from "lucide-react";
import type { Profile } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queries";
import { Avatar } from "@/components/ui/primitives";
import { Button } from "@/components/ui/form";

/**
 * Comment composer with @mentions.
 *
 * Mentions are resolved to real people at send time and the ping is written
 * by a SECURITY DEFINER function — notifications aren't writable by end users,
 * or anyone could manufacture one for somebody else.
 */
export function CommentBox({
  ticketId,
  profile,
  team,
}: {
  ticketId: string;
  profile: Profile;
  team: Profile[];
}) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const candidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const needle = mentionQuery.toLowerCase();
    return team
      .filter((person) => person.id !== profile.id && person.is_active)
      .filter((person) =>
        `${person.full_name} ${person.email}`.toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [mentionQuery, team, profile.id]);

  /** Track the partial @word directly before the caret. */
  function onChange(value: string) {
    setBody(value);
    const caret = inputRef.current?.selectionStart ?? value.length;
    const upToCaret = value.slice(0, caret);
    const match = /@([\w.\- ]{0,30})$/.exec(upToCaret);
    setMentionQuery(match ? match[1] : null);
    setHighlight(0);
  }

  function insertMention(person: Profile) {
    const caret = inputRef.current?.selectionStart ?? body.length;
    const upToCaret = body.slice(0, caret);
    const handle = (person.full_name || person.email.split("@")[0]).trim();
    const replaced = upToCaret.replace(/@([\w.\- ]{0,30})$/, `@${handle} `);
    const next = replaced + body.slice(caret);

    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const position = replaced.length;
      inputRef.current?.setSelectionRange(position, position);
    });
  }

  /** Longest names first, so "@Ananya Jain" wins over "@Ananya". */
  function findMentioned(text: string): string[] {
    const sorted = [...team].sort(
      (a, b) => (b.full_name?.length ?? 0) - (a.full_name?.length ?? 0),
    );
    const hits = new Set<string>();
    sorted.forEach((person) => {
      const handle = person.full_name || person.email.split("@")[0];
      if (!handle) return;
      if (text.toLowerCase().includes(`@${handle.toLowerCase()}`)) hits.add(person.id);
    });
    return [...hits];
  }

  async function send() {
    const text = body.trim();
    if (!text) return;

    setSending(true);
    const { data, error } = await supabase
      .from("comments")
      .insert({ ticket_id: ticketId, author_id: profile.id, body: text })
      .select("id")
      .single();

    if (error) {
      setSending(false);
      toast.error(error.message);
      return;
    }

    const mentioned = findMentioned(text);
    if (mentioned.length > 0 && data?.id) {
      const { error: mentionError } = await supabase.rpc("notify_mentions", {
        p_comment_id: data.id,
        p_user_ids: mentioned,
      });
      // The comment is already saved; a failed ping shouldn't lose it.
      if (mentionError) toast.error("Comment saved, but the mention didn't send");
      else toast.success(`Notified ${mentioned.length} ${mentioned.length === 1 ? "person" : "people"}`);
    }

    setSending(false);
    setBody("");
    setMentionQuery(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.comments(ticketId) });
  }

  return (
    <div className="relative mt-4 flex items-start gap-2.5">
      <Avatar
        id={profile.id}
        name={profile.full_name}
        email={profile.email}
        src={profile.avatar_url}
        size={28}
      />

      <div className="min-w-0 flex-1">
        <div className="rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] transition-[border-color,box-shadow] focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]">
          <textarea
            ref={inputRef}
            rows={3}
            value={body}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (candidates.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlight((index) => (index + 1) % candidates.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlight((index) => (index - 1 + candidates.length) % candidates.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  insertMention(candidates[highlight]);
                  return;
                }
                if (event.key === "Escape") {
                  setMentionQuery(null);
                  return;
                }
              }
              // Enter sends, Shift+Enter is a newline — the common case is short.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Add a note…  type @ to tag someone"
            className="w-full resize-y bg-transparent px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-ink-3)]"
          />

          <div className="flex items-center gap-2 border-t border-[var(--color-line)] px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => {
                setBody((value) => `${value}@`);
                setMentionQuery("");
                inputRef.current?.focus();
              }}
              title="Mention someone"
              className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
            >
              <AtSign size={13} />
            </button>
            <span className="text-[11px] text-[var(--color-ink-3)]">
              Enter to send · Shift+Enter for a new line
            </span>
            <Button
              size="sm"
              variant="primary"
              className="ml-auto"
              loading={sending}
              disabled={!body.trim()}
              onClick={() => void send()}
            >
              <Send size={12} /> Comment
            </Button>
          </div>
        </div>

        {candidates.length > 0 && (
          <ul className="rise absolute z-30 mt-1 w-64 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]">
            {candidates.map((person, index) => (
              <li key={person.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => insertMention(person)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                    index === highlight ? "bg-[var(--color-accent-soft)]" : ""
                  }`}
                >
                  <Avatar
                    id={person.id}
                    name={person.full_name}
                    email={person.email}
                    src={person.avatar_url}
                    size={20}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px]">
                      {person.full_name || person.email}
                    </span>
                    <span className="block truncate text-[10.5px] capitalize text-[var(--color-ink-3)]">
                      {person.role}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
