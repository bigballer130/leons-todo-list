# Leon's Planner

A personal to-do list and planner that runs entirely in the browser. Inspired by the workflow of
popular task managers — Inbox, Today, Upcoming, projects, natural-language quick add — with its own
look and branding.

## Features

- **Inbox, Today, Upcoming** — Today shows overdue + today's tasks (with one-click *Reschedule*);
  Upcoming has a week strip and day-by-day list you can drag tasks between.
- **Sync between devices** through a secret gist in your own GitHub account (see below).
- **Projects** with colors, sub-projects, favorites, archiving, sections, and **List, Board, Calendar
  or Table** layouts. Upcoming, labels and filters also offer calendar/table views.
- **Deadlines** (separate from the planned date), **durations**, and **reminders** (relative to the
  due time or at a specific time, plus an optional automatic reminder) with browser notifications.
- **Templates** — four built-in starters, or save any project as a template.
- **Voice entry** — dictate a task in the editor (browsers with speech recognition).
- **Automatic daily backups** kept on each device, restorable from Settings, and **calendar export**
  (`.ics`) of dated tasks and deadlines.
- **Tasks** with descriptions, sub-tasks (nest by dragging to the right or via *Make sub-task*),
  priorities P1–P4, labels, comments, due dates, times, and **recurring** schedules.
- **Natural-language quick add** — press `Q` and type, e.g.
  - `Pay rent every 1st p1 #Home @bills`
  - `Gym every mon, wed, fri 7am`
  - `Submit report next friday #Work /Reports`
  - `Renew passport in 3 weeks`

  Recognised parts are highlighted as you type.
- **Filters** with a query language: `today | overdue`, `p1 & #Work`, `@errand*`, `7 days`,
  `no date`, `due before: fri`, `!recurring`, parentheses, and more.
- **Search / command palette** (`Ctrl K` or `/`).
- **Drag & drop** to reorder tasks, nest sub-tasks, move between sections/board columns, reschedule
  in Upcoming, reorder projects, or drop a task on a project in the sidebar.
- **Undo** for every change (toast button or `Ctrl Z`).
- **Completed** history with a 7-day chart, daily/weekly goals and a streak counter.
- Light / dark / system themes and 8 accent colors; works on phones (installable as a PWA).
- Export / import a JSON backup from Settings.

## Sync

Data is stored in your browser. To use the same list on your phone and computer:

1. Open *Settings → Sync* and follow the link to create a GitHub token with only the **gist**
   permission (pick a long expiration).
2. Paste the token and press **Connect** on the first device.
3. On the second device, paste the same token, press **Connect**, and choose **Use synced data**.

Changes sync within a couple of seconds while the app is open, and whenever you return to it.
Edits made offline on both devices are merged task by task. The data lives in a *secret* gist:
it isn't listed or searchable, but anyone who has its exact URL could open it, so don't share it.

Reminders go off while the app is open or running in the background; a task manager with a server
would be needed for push notifications when the app is fully closed.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Q` | Quick add |
| `A` | Add task at the end of the current list |
| `/` or `Ctrl K` | Search |
| `G` then `I` / `T` / `U` / `V` / `C` | Go to Inbox / Today / Upcoming / Filters & Labels / Completed |
| `O` then `S` | Settings |
| `M` | Toggle sidebar |
| `Ctrl Z` | Undo |
| `?` | Show all shortcuts |

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build
```

Built with React, TypeScript and Vite. Icons from [lucide](https://lucide.dev).

## Deploying

The build is a static site (hash-based routing, relative asset paths), so `dist/` can be hosted
anywhere. A GitHub Actions workflow (`.github/workflows/deploy.yml`) publishes to GitHub Pages on
every push to `main` — enable it under *Settings → Pages → Source: GitHub Actions*.
