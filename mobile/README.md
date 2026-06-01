# Expense Tracker — Mobile (Expo / React Native)

A native client for the Expense Tracker. It talks to the **same** Next.js API as
the web app (`ai-playground`) — there is no separate backend. Auth is the same
stateless JWT Bearer-token flow; the token is stored in `expo-secure-store`.

## Stack
- Expo SDK 54 + `expo-router` (file-based routing)
- NativeWind v4 (Tailwind classes in React Native)
- `expo-secure-store` for token storage

## Setup
```bash
cd mobile
npm install
cp .env.example .env      # then edit EXPO_PUBLIC_API_URL
npm start                 # press a (Android), i (iOS), or scan in Expo Go
```

### Pointing at the backend
A phone/emulator **cannot** reach your computer's `localhost`. Set
`EXPO_PUBLIC_API_URL` in `.env` accordingly:

| Target | URL |
|---|---|
| Physical device (Expo Go) | `http://<your-LAN-IP>:3000` (e.g. `http://192.168.1.20:3000`) |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Production | `https://your-app.vercel.app` |

The web app must be running (`npm run dev` in the repo root) or deployed so the
app has something to call.

## What's here
- `app/_layout.tsx` — root stack, wraps everything in `AuthProvider`
- `app/index.tsx` — redirects to `/dashboard` or `/login` based on auth
- `app/login.tsx` — login / register (handles email-verification prompt)
- `app/(tabs)/_layout.tsx` — bottom tab navigation (auth-gated): Dashboard / Groups / Reports
- `app/(tabs)/dashboard.tsx` — expense list, filters (type + date-range + category), scope-aware totals, **pagination**, pull-to-refresh, **edit/delete**, New Expense
- `app/(tabs)/groups.tsx` — list + create groups; tap to open a group
- `app/(tabs)/reports.tsx` — scope + **date-range** filters (quick ranges + custom dates), stat grid, **donut charts** (personal-vs-group, by-category), day-of-week bars, top-groups, category breakdown, monthly trend, **Export PDF**
- `app/group/[id].tsx` — group detail: members + balances, **add member**, **delete group**, **Settle Up** (mark settled), active expenses (edit/delete), settled history, per-group report
- `app/add-expense.tsx` — create **or edit** an expense (personal/group, payer, split members, category, **native date picker**) + **receipt scanning** (camera/library → `POST /scan`, Gemini Vision auto-fill)
- `components/Donut.tsx` — lightweight SVG donut chart (react-native-svg)
- `lib/auth.tsx` — auth context (mirror of the web one, SecureStore instead of localStorage)
- `lib/api.ts` — base URL + `apiUrl()` helper
- `lib/pdf.ts` — summary PDF builder (expo-print + expo-sharing)
- `lib/types.ts` — client-side response types + `CATEGORIES`

## Feature parity with web
The app now covers the full web feature set: dashboard filters + pagination,
add/edit/delete, receipt scanning, groups (create, add member, delete, settle,
history), reports (date ranges, charts, PDF export). The PDF mirrors the web
report: summary, top groups, category breakdown, monthly trend, the full
All-Expenses table, and a per-group section (member summary + settlement plan +
expense details). Only remaining cosmetic difference: charts render with
SVG/bars rather than recharts.
