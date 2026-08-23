import { redirect } from "next/navigation";

/**
 * A ticket used to live at /board/<id>, and those links are out in the world —
 * in old email alerts, in desktop notifications people never cleared, pasted
 * into chats. They land here and carry on to the same ticket.
 */
export default async function OldTicketRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/tickets/${id}`);
}
