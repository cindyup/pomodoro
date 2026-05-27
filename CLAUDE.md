# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Pomodoro timer application with task management, session tracking, and a weekly report dashboard. The frontend is a single HTML file; the backend is a Node.js server (stdlib only) providing API endpoints and file-based persistence.

## Quick Start

```bash
node pomodoro.js     # Starts on port 3457, auto-opens browser
```

Or double-click `启动番茄钟.bat` (Windows). The app can also be opened as `pomodoro.html` directly in a browser (localStorage-only mode, some features degrade silently).

## Architecture

Two files: `pomodoro.html` (frontend, ~1058 lines) and `pomodoro.js` (Node.js server, ~297 lines). No dependencies, no build step, no package manager.

### Frontend (pomodoro.html)

Vanilla JS, no framework. All HTML/CSS/JS in one file with an IIFE-less global scope pattern.

**Core modules:**
- **Timer**: `setInterval`-based countdown with SVG `stroke-dashoffset` progress ring. Three modes (pomodoro/shortBreak/longBreak) with configurable durations.
- **Task management**: Add/delete/complete tasks. Clicking a task selects it and auto-starts the timer. Tasks have session history tracked per-item in `data-sessions`.
- **Weekly report**: Fixed sidebar opens a left panel with bar charts. Client-side computation (`generateClientWeeklyReport`) when server is unavailable.
- **Task categorization**: Three categories (dev/meeting/doc) set via the weekly report UI. Local computation fallback (`renderLocalWeeklyAnalysis`) if server analysis endpoint is down.

**Key patterns:**
- **Dual persistence with tiered retention**: `saveState()` saves 30-day filtered session data to `localStorage` (instant DOM read). When full server data (`_fullData`) is loaded asynchronously, it merges current DOM sessions into full history via `mergeIntoFullData()` and POSTs to server. `_fullDataReady` flag prevents writes before full data loads, avoiding overwriting history with the 30-day window.
- **Silent degradation**: All `fetch()` calls to the server use `.catch(() => {})` — no user-facing errors for server unavailability.
- **DOM as source of truth**: Task data (sessions, category, timestamps) is stored in `data-*` attributes. `collectTasks()` reads from DOM to serialize state.
- **State object** (`state`): Holds mode, timeLeft, sessionDuration, running, completed counts, and `currentTaskIndex`. Not the single source of truth for task data (DOM is). `sessionDuration` is captured at toggle start so `recordSession()` records the actual mode duration, not hardcoded pomodoro length.
- **30-day session window**: Only sessions within the last 30 days are kept in DOM/localStorage for daily performance. Full history is preserved on the server for annual analysis. `mergeIntoFullData()` matches tasks by `createdAt`, deduplicates sessions by `timestamp`, and prunes incomplete tasks not in the current DOM.

### Backend (pomodoro.js)

Node.js stdlib HTTP server (no Express, no npm). Serves static files and provides REST API endpoints.

- **Port strategy**: Starts at 3457, increments on conflict, up to 10 attempts.
- **Persistence**: Reads/writes `pomodoro-data.json` in the project root.
- **Auto-classification**: Keyword-based classifier in `CLASSIFY_RULES` for dev/meeting/doc categories. Used by `/api/weekly-analysis` to generate category breakdowns and summary text.

### API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/load` | Load all data from JSON file |
| POST | `/api/save` | Save all data to JSON file |
| POST | `/api/import` | Import data via form (bypasses CORS for file://) |
| GET | `/api/weekly-summary` | Current + previous week task summary |
| GET | `/api/weekly-analysis` | Category breakdown + auto-generated summary text |
| POST | `/api/set-category` | Set category on a specific task (matched by `createdAt`) |

## Data Model

Tasks stored as JSON array in `pomodoro-data.json` and `localStorage` (key `pomodoro-state`). Each task:
- `text` (string), `done` (boolean), `category` (dev|meeting|doc|null)
- `sessions[]` — array of `{timestamp, duration}` objects for each completed pomodoro
- `createdAt` (number) — epoch ms, used as unique identifier for category assignment
- `completedAt` (number) — epoch ms when task was checked done

## Weekly Report Rendering Flow

1. `openWeeklyPanel()` → calls `renderClientWeeklyReport()` (computes from `collectTasks()`) + `fetchWeeklyAnalysis()` (server, with local fallback)
2. `renderTaskRow()` creates a bar chart row per task, calls `addCategoryPicker()` for uncategorized tasks
3. Category selection → updates `li.dataset.category`, calls `saveState()` + `renderClientWeeklyReport()` + `renderLocalWeeklyAnalysis()`
