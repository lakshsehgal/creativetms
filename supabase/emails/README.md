# Auth emails

Two of the three emails this app sends are not sent by this app.

| Email | Sent by | Where it lives |
|---|---|---|
| Daily scorecard | Our code, via Resend | `src/lib/scorecard-email.ts` |
| Sign-in code | **Supabase Auth** | Dashboard template — `sign-in-code.html` here |
| Invite | **Supabase Auth** | Dashboard template — `invite.html` here |

Supabase renders the last two from templates stored in its own dashboard, so
they can't be branded from the codebase. The files here are the source of
truth for what should be pasted in; keep them in step with the dashboard.

## Where they go

**Supabase → Authentication → Emails → Templates**

- **Magic Link** → paste `sign-in-code.html`
  Subject: `Your sign-in code`
- **Invite user** → paste `invite.html`
  Subject: `You've been added to Neuroid Creative Studio`

## The sender name

The templates control the body. The name in the inbox — the part people
actually read — comes from the SMTP settings, not the template:

**Supabase → Project Settings → Authentication → SMTP Settings**

- Sender name: `Neuroid Creative Studio`
- Sender email: whatever domain is verified with the mail provider

Without custom SMTP, Supabase sends from its own shared address and is rate
limited to a handful of emails an hour — fine for a first look, not for a
studio where six people sign in each morning. Point it at the same Resend
account the scorecard uses.

## Variables

Supabase substitutes these when it sends. Anything else renders empty.

| Variable | Is |
|---|---|
| `{{ .Token }}` | The sign-in code |
| `{{ .ConfirmationURL }}` | The one-click link |
| `{{ .Email }}` | Who it's going to |
| `{{ .SiteURL }}` | The app's address, from Authentication → URL Configuration |

## Testing

Send yourself one — invite a spare address from the Team page, and sign out
and back in for the code. Check it on a phone: the code has to be readable
and tappable-to-copy at arm's length, which is where most of the layout
decisions here come from.
