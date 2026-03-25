# ⏱ Kairos — Consulting Time Tracker

> Track your time. Maximize your value.

A full-stack time tracking SaaS for independent consultants and small teams.  
Built with **Next.js 14 · Supabase · Tailwind CSS** — 100% free to host, MIT-licensed, sellable.

---

## Features

- 🕐 **Live timer** with one-click start/stop
- ✏️ **Manual time entries** with date/time pickers
- 📁 **Projects** with color coding, hourly rates, archive
- 👥 **Clients** portfolio management
- 📊 **Reports** — daily bar chart, project pie chart, CSV export
- 💰 **Earnings** calculated automatically per entry
- 🔐 **Auth** — email/password sign up & login (Supabase Auth)
- 🛡️ **Row Level Security** — each user only sees their own data
- 👨‍👩‍👧 **Multi-user** — every account is independent

---

## Deploy in ~15 minutes

### Step 1 — Supabase (database + auth)

1. Go to [supabase.com](https://supabase.com) → **New project** (free)
2. Open **SQL Editor** → **New query**
3. Paste the entire contents of `supabase/schema.sql` → **Run**
4. Go to **Settings → API** and copy:
   - `Project URL`  → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 2 — GitHub

```bash
git init
git add .
git commit -m "init: Kairos time tracker"
# Create a new repo on github.com then:
git remote add origin https://github.com/YOUR_USERNAME/kairos.git
git push -u origin main
```

### Step 3 — Vercel (hosting)

1. Go to [vercel.com](https://vercel.com) → **Add new project**
2. Import your GitHub repo
3. Under **Environment Variables**, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJh...
   ```
4. Click **Deploy** ✅

Your app is live at `https://kairos-xxx.vercel.app`!

### Step 4 — Supabase Auth redirect URL (1 min)

In Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://your-vercel-url.vercel.app`
- **Redirect URLs**: `https://your-vercel-url.vercel.app/api/auth/callback`

---

## Local development

```bash
cp .env.local.example .env.local
# Fill in your Supabase values

npm install
npm run dev
# → http://localhost:3000
```

---

## Tech stack

| Layer | Technology | License | Cost |
|---|---|---|---|
| Frontend | Next.js 14 (App Router) | MIT | Free |
| Styling | Tailwind CSS | MIT | Free |
| Auth + DB | Supabase | Apache 2 (hosted) | Free tier |
| Hosting | Vercel | — | Free tier |
| Charts | Recharts | MIT | Free |
| Icons | Lucide React | ISC | Free |

**Can I sell this?** Yes. All libraries are MIT/ISC. You use Supabase's *hosted service* (not their AGPL self-hosted code), so the AGPL does not apply to your product. The code you write is fully yours.

---

## Scaling beyond free tier

| When you need more | Upgrade path |
|---|---|
| > 500 MB DB / > 50k MAU | Supabase Pro ($25/mo) |
| > 100 GB bandwidth | Vercel Pro ($20/mo) |
| Custom domain | Both support it on free tier |

---

## Roadmap ideas

- [ ] Workspace/team support (shared projects)
- [ ] Invoice generation (PDF)
- [ ] Stripe billing for your SaaS customers
- [ ] Pomodoro mode
- [ ] Browser extension / mobile PWA
- [ ] Zapier / webhook integrations
