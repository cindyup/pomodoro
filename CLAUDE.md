# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-file Pomodoro timer application (`pomodoro.html`) with task management and session tracking. No build tools, no dependencies, no package manager — just open in a browser.

## Running the App

Open `pomodoro.html` in any modern browser directly. No dev server or build step needed.

## Architecture

**Single file** — `pomodoro.html` contains HTML, CSS, and JavaScript in one document (~475 lines). The app has no framework, no bundler, and no external dependencies.

### Structure

- **HTML**: Semantic structure with a `.container` holding mode tabs, timer ring (SVG), controls, task input/list, and stats display.
- **CSS**: Dark theme with custom properties, flexbox layout, SVG circle progress ring. All styles are inline in `<style>`.
- **JavaScript**: Vanilla JS in a single `<script>` block using an IIFE-less global scope pattern.

### State Management

A `state` object holds all runtime state:
```js
{
  mode: 'pomodoro' | 'shortBreak' | 'longBreak',
  timeLeft: number (seconds),
  running: boolean,
  timerId: interval ID,
  completed: number (total pomodoros),
  sessionInRound: number (pomodoros since last long break),
  currentTaskIndex: number (-1 = no task selected),
}
```

Persistence via `localStorage` key `pomodoro-state` — saves completed count, session count, current task index, and full task list (text, done status, session history). Task session history is stored per-task in `data-sessions` as a JSON array of `{timestamp, duration}` objects.

### Key Functions

| Function | Purpose |
|---|---|
| `switchMode(mode)` | Switches between pomodoro/shortBreak/longBreak, resets timer |
| `toggleTimer()` | Start/pause the countdown interval |
| `tick()` | Decrements `timeLeft` each second, triggers completion at 0 |
| `completePomodoro()` | Records a completed pomodoro, auto-switches to break |
| `resetTimer()` | Resets timeLeft to current mode's duration |
| `getDurations()` | Reads the `<input>` values for all three modes in seconds |
| `saveState()` / `loadState()` | Serialize/deserialize state + tasks to localStorage |
| `createTaskElement(text, done, sessions)` | Creates a `<li>` with checkbox, label, session badge, delete button |
| `recordSession()` | Attaches current pomodoro session data to the selected task |
| `updateDisplay()` | Syncs all UI elements (timer text, ring progress, phase label, mode tabs) |

### Data Flow

1. Timer ticks → `tick()` decrements `state.timeLeft` → `updateDisplay()` refreshes UI
2. Pomodoro completes → `completePomodoro()` increments counters, calls `recordSession()` (attaches to active task), then auto-switches to break mode
3. Tasks are clickable — clicking a task selects it (`state.currentTaskIndex`) and auto-starts the timer if not running
4. All meaningful state changes call `saveState()` → `localStorage`
5. On page load, `loadState()` restores persisted state

### CSS Architecture

- Dark theme with three colors: `#1a1a2e` (background), `#16213e` (container), `#0f3460` (elements), `#e94560` (accent/highlight)
- SVG progress ring uses `stroke-dasharray`/`stroke-dashoffset` for animation
- `.hidden` utility class toggles visibility of mode-specific settings inputs
- `@keyframes slideDown` for notification entrance animation

### Notification System

- Visual: Fixed-position `<div>` with slide-down animation, auto-hides after 4s
- Audio: Web Audio API generates a 880Hz sine tone for 300ms on completion
