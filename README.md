# Bubble.

I was so tired of using clunky CRMs, tables & spreadsheets. 

I needed an aesthetically pleasing way to visualize my involvement in the social circles I care deeply about. 

So, this is what I made, **for myself**.<br/><br/>

<p align="center">
  <img width="1728" height="905" alt="bubbleexample" src="https://github.com/user-attachments/assets/17afcf80-25c9-4537-b0af-53418c8a5cdd" />
</p>
<div align="center">
  Above: My "TMNT" friend group visualized in Bubble.
</div>

---

# New User?

## Installing Your Own Bubble

Bubble is privacy-first and currently designed as a **single-owner private app**, not a shared public service. The hosted `bubble.garden` instance belongs to one person (me, the owner), so new users should not sign into it or expect to create their own separate account there.

Yes, this is intentional. I understand that this makes the project much harder for others to set up and use, but I'm very conscious about security and paranoid about online privacy. 

Bubble stores personal relational data like names, categories, friend groups, photos, last-interaction dates, and, if you use the Mac helper, local iMessage-derived identity links. That kind of data matters A LOT and reveals who matters to you, how often you talk to them, and which relationships you are trying to maintain. 

Bubble is therefore built around the assumption that each person should control their own deployment, login, storage, helper tokens, and local permissions. If you want to use Bubble, make your own private Bubble instance by forking this project and following the instructions below :)

### What you need

- A GitHub account, so you can fork or copy this project.
- A hosting account that can deploy a Next.js app. Vercel works well.
- A Postgres database URL for hosted persistence. Neon, Supabase Postgres, Vercel Postgres, or another Postgres provider can work.
- Node.js 20 or newer if you want to run the app locally or generate values from your terminal.
- A Mac if you want to use the optional iMessage Bubble Helper.

### 1. Make your own copy

Fork this repository into your own GitHub account, or copy the source into a private repository that you control.

Do not use the existing `bubble.garden` deployment as your personal Bubble. It is not a signup page, and it does not create isolated accounts for different people.

### 2. Deploy your copy

Deploy your repository to Vercel or another Next.js host.

On Vercel, the usual flow is:

1. Create a new Vercel project.
2. Import your Bubble repository.
3. Keep the default Next.js build settings unless your host requires something different.
4. Add the environment variables listed below before relying on the deployment.

### 3. Create your private login

Bubble does not store a plain-text admin password. You generate a password hash locally, then put only the hash in your deployed environment variables.

From the repository root, run:

```bash
npm run auth:hash -- "replace-this-with-your-real-password"
```

Use your actual password in place of `replace-this-with-your-real-password`. The command prints a value beginning with `scrypt$...`.

Set these environment variables in your host:

| Variable | Required? | What it does |
| --- | --- | --- |
| `BUBBLE_ADMIN_USERNAME` | Optional | The username for your private Bubble login. If omitted, it defaults to `admin`. |
| `BUBBLE_ADMIN_PASSWORD_HASH` | Required | The hashed version of your password. This is what Bubble checks during sign-in. |
| `BUBBLE_SESSION_SECRET` | Required | Signs your login session cookie so browsers cannot forge a signed-in session. |
| `BUBBLE_STORAGE_SECRET` | Recommended | Encrypts hosted Bubble storage separately from the login-session secret. |

For `BUBBLE_SESSION_SECRET` and `BUBBLE_STORAGE_SECRET`, use long random values. For example:

```bash
openssl rand -base64 32
```

Use different values for the session secret and storage secret. Do not commit these secrets to GitHub.

### 4. Add hosted storage

Bubble needs durable hosted storage so your bubbles do not disappear after a deployment or server restart.

Create a Postgres database, then set:

| Variable | Required? | What it does |
| --- | --- | --- |
| `DATABASE_URL` | Required for hosted persistence | Lets Bubble save encrypted app state in your own Postgres database. |

For a new install, prefer `DATABASE_URL`. Do not set `BLOB_READ_WRITE_TOKEN` unless you are migrating an older Bubble deployment that already used Vercel Blob. Blob support exists only as a temporary migration path.

### 5. Sign in and start using Bubble

After deploying with the environment variables above:

1. Open your deployed Bubble URL.
2. Sign in with the username and password you configured.
3. Create categories, such as Family, Friends, Work, or any groups that matter to you.
4. Add bubbles for people you want to keep track of.

At this point, Bubble works as a private manual relationship tracker.

### 6. Optional: connect the Mac Helper for iMessage updates

The Mac Helper is optional. It is for people who want Bubble to update last-interaction dates based on local iMessage activity.

The helper is intentionally local-first:

- It runs on your Mac.
- It reads your local Messages database only after you grant macOS Full Disk Access.
- It can optionally use Contacts access to improve names and contact photos.
- It sends only the Bubble update information needed by your private web app.
- It uses helper tokens generated inside your own Bubble instance.

If you do not want iMessage-based automation, you do not need the helper.

### Security notes

- Treat your Bubble deployment as personal infrastructure, not a shared social app. Do not give another person access to your Bubble instance.
- Do not share your admin username, password, session secret, storage secret, database URL, or helper tokens.
