# Expense Tracker — Mobile (Expo / React Native)

A native client for the Expense Tracker. It talks to the **same** Next.js API as
the web app (`ai-playground`) — there is no separate backend. Auth is the same
stateless JWT Bearer-token flow; the token is stored in `expo-secure-store`.

## Stack
- Expo SDK 52 + `expo-router` (file-based routing)
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
- `app/_layout.tsx` — root layout, wraps everything in `AuthProvider`
- `app/index.tsx` — redirects to `/dashboard` or `/login` based on auth
- `app/login.tsx` — login / register (handles email-verification prompt)
- `app/dashboard.tsx` — expense list with All/Personal/Group filter, totals, pull-to-refresh, "New Expense"
- `app/add-expense.tsx` — create expense (personal/group, payer, split members, category) + **receipt scanning** (camera/library → `POST /scan`, auto-fills the form via Gemini Vision)
- `lib/auth.tsx` — auth context (mirror of the web one, SecureStore instead of localStorage)
- `lib/api.ts` — base URL + `apiUrl()` helper
- `lib/types.ts` — client-side response types + `CATEGORIES`

## Next steps (not yet built)
- Edit / delete expense (`PUT/DELETE /api/projects/expense-tracker/expenses/:id`)
- Groups & reports tabs
- A native date picker (currently a `YYYY-MM-DD` text field)
- Share the zod schemas from `modules/expense-tracker` once they're split from
  server-only deps (`@google/generative-ai`).
