import { redirect } from "next/navigation";

/**
 * The section is called Tickets now. This keeps every link anybody has
 * already sent — a filtered board pasted into a chat, a bookmark, the old
 * PWA start_url — working, query string and all, because a rename that
 * breaks other people's links isn't a rename, it's a small outage.
 */
export default async function OldBoardRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
  }
  redirect(search.toString() ? `/tickets?${search}` : "/tickets");
}
