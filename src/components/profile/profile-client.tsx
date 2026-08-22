"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import type { Profile } from "@/lib/types";
import { avatarTint, initials } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Button, Field, TextInput } from "@/components/ui/form";

const ROLE_LABEL: Record<Profile["role"], string> = {
  admin: "Admin",
  operator: "Operator",
  strategist: "Creative Strategist",
  designer: "Designer",
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function ProfileClient({ profile }: { profile: Profile }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(profile.full_name);
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name.trim() })
      .eq("id", profile.id);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Name updated");
    router.refresh();
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That needs to be an image");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Keep it under 2 MB");
      return;
    }

    setUploading(true);
    // Path is keyed on the person, so a new upload replaces the old file
    // rather than leaving orphans behind in the bucket.
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${profile.id}/avatar.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      setUploading(false);
      toast.error(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-bust so the new picture appears now, not in an hour.
    const url = `${data.publicUrl}?v=${Date.now()}`;

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", profile.id);

    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    setAvatar(url);
    if (fileRef.current) fileRef.current.value = "";
    toast.success("Picture updated");
    router.refresh();
  }

  async function removeAvatar() {
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", profile.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAvatar(null);
    toast.success("Picture removed");
    router.refresh();
  }

  return (
    <>
      <PageHeader title="Your profile" subtitle={profile.email} />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-lg space-y-4">
          <Card>
            <h2 className="text-[13px] font-semibold tracking-tight">Picture</h2>
            <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
              Shows on every ticket you touch. Square images work best.
            </p>

            <div className="mt-4 flex items-center gap-4">
              <span className="relative">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt=""
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="grid h-16 w-16 place-items-center rounded-full text-[20px] font-semibold text-white"
                    style={{ background: avatarTint(profile.id) }}
                  >
                    {initials(profile.full_name, profile.email)}
                  </span>
                )}
                {uploading && (
                  <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45">
                    <Loader2 size={18} className="animate-spin text-white" />
                  </span>
                )}
              </span>

              <div className="flex gap-2">
                <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Camera size={13} /> {avatar ? "Replace" : "Upload"}
                </Button>
                {avatar && (
                  <Button size="sm" variant="ghost" onClick={() => void removeAvatar()}>
                    <Trash2 size={13} /> Remove
                  </Button>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void uploadAvatar(event.target.files?.[0])}
              />
            </div>
          </Card>

          <Card>
            <form onSubmit={saveName}>
              <Field label="Display name" htmlFor="full-name" hint="How you appear on tickets">
                <TextInput
                  id="full-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ananya Jain"
                  maxLength={80}
                />
              </Field>

              <div className="mt-3.5 grid grid-cols-2 gap-3 text-[12.5px]">
                <div>
                  <p className="text-[11.5px] text-[var(--color-ink-3)]">Email</p>
                  <p className="mt-0.5 truncate">{profile.email}</p>
                </div>
                <div>
                  <p className="text-[11.5px] text-[var(--color-ink-3)]">Role</p>
                  <p className="mt-0.5">{ROLE_LABEL[profile.role]}</p>
                </div>
              </div>

              <p className="mt-3 text-[11.5px] text-[var(--color-ink-3)]">
                Your email and role are set by an admin.
              </p>

              <div className="mt-4 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  loading={saving}
                  disabled={!name.trim() || name.trim() === profile.full_name}
                >
                  Save
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
