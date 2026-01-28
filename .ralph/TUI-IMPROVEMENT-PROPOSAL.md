# Wiggum CLI - TUI Improvement Proposal

> Redesigning the terminal experience to match Claude Code/Codex quality while maintaining guided, plug-and-play workflows.

---

## Executive Summary

### Vision

Transform Wiggum from a functional CLI into a **professional daily-driver tool** that feels as polished as Claude Code or Codex - guided without being constrained, informative without being verbose.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Progressive Disclosure** | Show summaries, expand on demand |
| **Conversation-First** | AI interaction is primary, chrome is secondary |
| **Purposeful Color** | Color conveys meaning, not decoration |
| **Fluid Transitions** | States change smoothly, no jarring redraws |
| **Respect User Time** | Don't show unnecessary information |

### Success Metrics

- First-time setup: < 2 minutes
- `/new` spec creation: Feels like a conversation, not a form
- Tool calls: Glanceable status, detail on demand
- Zero confusion about "what do I do next?"

---

## Part 1: Visual Language Overhaul

### 1.1 Information Hierarchy

**Current Problem**: Everything has equal visual weight

**Solution**: Three-tier hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: Primary Content (bright, full color)                │
│   - User input                                              │
│   - AI responses                                            │
│   - Actionable prompts                                      │
├─────────────────────────────────────────────────────────────┤
│ TIER 2: Supporting Context (muted, dimmed)                  │
│   - Tool call summaries                                     │
│   - Phase indicators                                        │
│   - Status updates                                          │
├─────────────────────────────────────────────────────────────┤
│ TIER 3: Detail (hidden by default)                          │
│   - Full tool output                                        │
│   - Raw JSON                                                │
│   - Verbose logs                                            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 New Color System

**Current**: Simpson theme (yellow/brown/pink)
**Proposed**: Refined Simpson-inspired semantic system

```typescript
const colors = {
  // Brand identity (Simpson connection)
  simpson: '#f8db27',       // Simpson yellow - KEEP for branding/headers

  // Primary actions (user focus)
  prompt: '#4ade80',        // Green - input prompt ›
  userText: '#ffffff',      // White - user typed content

  // AI responses
  aiText: '#f8db27',        // Simpson yellow - AI speaking (brand tie-in)
  aiThinking: '#9c5b01',    // Brown - AI processing/dimmed

  // Tool calls (status-based)
  toolPending: '#6b7280',   // Gray - waiting
  toolRunning: '#f8db27',   // Simpson yellow - in progress
  toolSuccess: '#4ade80',   // Green - complete
  toolError: '#ff81c1',     // Pink - failed (Simpson pink)

  // Chrome (minimal attention)
  chrome: '#374151',        // Dark gray - borders, separators
  hint: '#6b7280',          // Gray - hints, shortcuts

  // Semantic
  warning: '#fb923c',       // Orange - caution
  link: '#60a5fa',          // Blue - clickable/actionable
}
```

**Brand Continuity**: Simpson yellow remains the primary accent color, used for:
- AI responses (tying the AI to "Ralph Wiggum" personality)
- Active/running states
- Headers and branding elements
- The ASCII banner

### 1.3 Status Indicators

**Current**: Mix of `○ ◐ ● ✓ ✗`
**Proposed**: Consistent dot system with color

```
●  Complete (green)     - Action finished successfully
●  Running (amber)      - Action in progress (with spinner text)
●  Error (red)          - Action failed
○  Pending (gray)       - Action queued
✓  Success (green)      - Confirmation checkmark
```

---

## Part 2: Component Redesign

### 2.1 Tool Call Display (Critical)

**Current Problem**: Raw JSON, verbose output, no collapse

```
● Read File ( src/index.ts ) → {
    "content": "/**\n * CodeRide MCP Server\n * \n * Entry p...
```

**Proposed**: Claude Code-style collapsible preview

```
● Read File(src/index.ts) → 156 lines
  │ import { Server } from '@modelcontextprotocol/sdk';
  │ import { tools } from './tools';
  │ ...
  └ +154 lines (ctrl+o to expand)

● Search Codebase("authentication") → 8 matches
  │ src/auth/login.ts:23
  │ src/auth/session.ts:45
  │ src/middleware/auth.ts:12
  └ +5 more (ctrl+o to expand)

● List Directory(src/tools) → 5 items
  │ 📁 validators/
  │ 📄 base-tool.ts
  │ 📄 index.ts
  └ +2 more
```

**Implementation**:
```typescript
interface ToolCallDisplay {
  name: string;
  input: string;           // Formatted, not raw JSON
  status: 'pending' | 'running' | 'complete' | 'error';
  summary: string;         // "156 lines", "8 matches", "5 items"
  preview?: string[];      // First 3 lines
  expandedCount?: number;  // "+154 lines"
  expanded: boolean;       // User toggled expand
}
```

### 2.2 Message Display

**Current Problem**: `AI:` label, verbose role indicators

**Proposed**: Minimal, conversation-focused

```
› I want to add user authentication                    (user - green ›)

Let me explore your codebase to understand the        (AI - no prefix)
current structure...

● Read File(src/app.ts) → 89 lines                    (tool - dimmed)

Based on your Next.js setup, I recommend using        (AI continues)
NextAuth.js. Here are my questions:

1. Do you need social login (Google, GitHub)?
2. Should sessions persist across browser restarts?

› Yes to social login, sessions should persist        (user)
```

**Key Changes**:
- Remove "AI:" prefix entirely - AI text is distinguished by color/position
- User messages get `›` prompt in green
- Tools appear inline but dimmed
- No boxing or heavy separators

### 2.3 Phase Indicator / Status Line

**Current Problem**: Heavy centered header taking focus

```
━━━ Phase 4 of 5: AI-powered codebase analysis ━━━
```

**Proposed**: Horizontal pipe-separated status line (top of screen)

**Option A: Horizontal (preferred)**
```
Initialize Project │ Analysis (4/5) │ /Users/name/project
```

**Option B: Vertical (for narrow terminals)**
```
Initialize Project
  Analysis (4/5)
  /Users/name/project
```

**Key Principles**:
- NO centered elements - always left-aligned
- Pipe `│` separator for horizontal layout
- Compact information density
- Status updates in-place (no new lines)
- Simpson yellow for the current action name

### 2.4 Input Prompt

**Current**: Mix of `>` and `›` with various placeholders

**Proposed**: Consistent green prompt with contextual hints

```
› _                                          (default - cursor blinks)

› Type your response (or "done" to generate)_   (interview phase)

› Enter URL or file path, or press Enter_       (context phase)

› [waiting...]                               (disabled - dimmed, no cursor)
```

### 2.5 Command Dropdown

**Current**: Showing above input, basic filtering

**Proposed**: Claude Code-style inline dropdown

```
› /
  ┌──────────────────────────────────────────────────────────┐
  │ /init          Initialize project with CLAUDE.md        │
  │ /new           Create a new feature specification       │
  │ /run           Run a spec file with AI                  │
  │ /help          Show available commands                  │
  │ /exit          Exit wiggum                              │
  └──────────────────────────────────────────────────────────┘

› /ne
  ┌──────────────────────────────────────────────────────────┐
  │ /new           Create a new feature specification       │ ← filtered
  └──────────────────────────────────────────────────────────┘
```

**Improvements**:
- Dropdown appears BELOW input (like Claude Code)
- Selected item highlighted with background
- Descriptions aligned in column
- Arrow key navigation with visual feedback

---

## Part 3: Flow Redesign

### 3.1 Welcome Flow

**Current**: ASCII banner → "Press Enter to continue" → Shell

**Proposed**: Keep banner, remove friction

```
██╗    ██╗██╗ ██████╗  ██████╗ ██╗   ██╗███╗   ███╗
██║    ██║██║██╔════╝ ██╔════╝ ██║   ██║████╗ ████║
██║ █╗ ██║██║██║  ███╗██║  ███╗██║   ██║██╔████╔██║
██║███╗██║██║██║   ██║██║   ██║██║   ██║██║╚██╔╝██║
╚███╔███╔╝██║╚██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║
 ╚══╝╚══╝ ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝

v0.10.9 │ anthropic/claude-sonnet-4 │ Ready

› _

Tip: /init to set up, /new <feature> to create spec, /help for commands
```

**Changes**:
- KEEP ASCII banner in Simpson yellow (brand identity)
- Remove "Press Enter to continue" friction - boot directly to ready
- Status line below banner (horizontal, pipe-separated)
- Immediately input-ready with contextual tip
- Banner clears after first command (screen space)

### 3.2 Init Flow

**Current**: 6+ phases with explicit transitions

**Proposed**: Fluid, self-updating display

```
wiggum v0.10.9 │ Initializing...

Detected Stack
  Language: TypeScript
  Package Manager: npm
  Framework: Next.js 14

Running AI analysis with anthropic/claude-sonnet-4

● Read File(package.json) → 45 lines
● List Directory(src) → 12 items
● Search Codebase("api routes") → 6 matches
⠋ Analyzing architecture...

──────────────────────────────────────────────────────────

AI Analysis Complete (6,759 tokens)

Key findings:
  • Next.js App Router with TypeScript
  • Prisma ORM with PostgreSQL
  • NextAuth.js for authentication

? Generate configuration files?
  › Yes    No                          (← to toggle, Enter to confirm)
```

**Key Changes**:
- No explicit "Phase X of Y" - just show what's happening
- Tool calls appear as they execute, scroll naturally
- Separator before requiring user decision
- Simple Yes/No toggle (not selection list)

### 3.3 Spec Generation Flow (`/new`)

**Current**: 5 explicit phases, confusing context phase

**Proposed**: Conversation-first flow

```
wiggum v0.10.9 │ /new user-auth

Creating spec: user-auth

? Have any reference URLs or files to share? (Enter to skip)
› https://next-auth.js.org/getting-started

  Fetching reference...
  ● Fetch URL(https://next-auth.js.org/...) → 2,450 words

? What would you like to build?
› I want to add user authentication with Google and GitHub
  login, plus email/password option

  Exploring codebase...
  ● List Directory(src) → 15 items
  ● Read File(src/app/layout.tsx) → 67 lines
  ● Search Codebase("session") → 3 matches

Based on your Next.js 14 app, I have a few questions:

1. Should the auth flow redirect to a specific page after login?

› Yes, redirect to /dashboard

2. Do you need role-based access (admin vs regular user)?

› No, all users have the same permissions

  Generating specification...

────────────────────────────────────────────────────────────

Spec saved: .ralph/specs/user-auth.md

Summary:
  • NextAuth.js with Google, GitHub, Email providers
  • Redirect to /dashboard after login
  • Single user role

› _
```

**Key Changes**:
- Questions appear naturally in conversation
- No "Phase 2: Goals" headers
- References are optional and inline
- Tool calls are dimmed background noise
- Clear completion with summary
- Immediate return to input-ready state

---

## Part 4: Interaction Improvements

### 4.1 Input Handling

**Problem**: Commands require exact syntax

**Solution**: Fuzzy matching and suggestions

```
› /ne my-feature                    → Runs /new my-feature
› /init                             → Runs /init
› new feature                       → "Did you mean /new feature?"
› authentication                    → Treats as chat/natural language
```

### 4.2 Keyboard Shortcuts

**Current**: Basic Enter/Escape

**Proposed**: Power-user shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `Enter` | Input | Submit |
| `Escape` | Any | Cancel/back |
| `Ctrl+C` | Any | Exit (with confirm if work in progress) |
| `Ctrl+O` | Tool output | Expand/collapse |
| `Ctrl+L` | Any | Clear screen |
| `↑` | Input | Previous command (history) |
| `Tab` | Command | Autocomplete |

### 4.3 Error States

**Current**: Generic error messages

**Proposed**: Actionable, contextual errors

```
✗ API key invalid

  Your Anthropic API key was rejected. This usually means:
  • The key was revoked or expired
  • The key doesn't have the required permissions

  Fix: Run /init to update your API key

› _
```

### 4.4 Progress Feedback

**Current**: Spinner with text

**Proposed**: Contextual progress

```
⠋ Analyzing codebase... (12s)              ← Show elapsed time

⠋ Generating spec... ████████░░ 80%        ← Progress bar when estimable

⠋ Waiting for AI response...               ← When timing unknown
  └ Tip: Press Ctrl+C to cancel
```

---

## Part 5: Technical Implementation

### 5.1 Component Changes

| Component | Change | Priority |
|-----------|--------|----------|
| `ToolCallCard` | Complete rewrite - collapsible with preview | High |
| `MessageList` | Remove role labels, add inline tools | High |
| `ChatInput` | Move dropdown below, add history | High |
| `PhaseHeader` | Replace with horizontal StatusLine | Medium |
| `WorkingIndicator` | Add elapsed time, progress bar | Medium |
| `CommandDropdown` | Redesign layout, add highlight | Medium |
| `Select` | Horizontal toggle option | Low |
| `WelcomeScreen` | Keep banner, remove "Press Enter" friction | Low |

### 5.2 New Components Needed

| Component | Purpose |
|-----------|---------|
| `StatusLine` | Horizontal pipe-separated status: `Action │ Phase (X/Y) │ Path` |
| `CollapsibleOutput` | Expandable tool output with preview lines |
| `ProgressBar` | Visual progress indicator |
| `CommandHistory` | Up-arrow command recall |
| `ErrorCard` | Actionable error display with suggestions |

### 5.3 State Changes

**Add to hooks**:
```typescript
// useInit additions
expandedToolCalls: Set<string>;  // Track which tools are expanded
elapsedTime: number;             // Track phase duration

// useSpecGenerator additions
commandHistory: string[];        // Previous commands for ↑ recall
expandedTools: Set<string>;      // Expanded tool outputs
```

### 5.4 Theme Updates

```typescript
// src/tui/theme.ts - Simpson-inspired semantic system
export const theme = {
  colors: {
    // Brand (Simpson identity)
    brand: '#f8db27',           // Simpson yellow - banner, headers

    // Input
    prompt: '#4ade80',          // Green prompt ›
    userText: '#ffffff',        // White user text
    placeholder: '#6b7280',     // Gray placeholder

    // AI (Simpson connection)
    aiText: '#f8db27',          // Simpson yellow - AI responses
    aiDim: '#9c5b01',           // Brown - dimmed AI/thinking

    // Tools (status-driven)
    tool: {
      pending: '#6b7280',       // Gray
      running: '#f8db27',       // Simpson yellow
      success: '#4ade80',       // Green
      error: '#ff81c1',         // Pink (Simpson pink)
    },

    // Chrome
    separator: '#374151',       // Dark gray │
    hint: '#6b7280',            // Gray hints
    statusLine: '#f8db27',      // Simpson yellow for action name

    // Semantic
    success: '#4ade80',
    warning: '#fb923c',
    error: '#ff81c1',
    link: '#60a5fa',
  },

  // Status line format
  statusLine: {
    separator: ' │ ',           // Pipe with spaces
    format: 'horizontal',       // or 'vertical' for narrow
  },

  // Consistent spacing
  spacing: {
    indent: 2,                  // Tool output indent
    sectionGap: 1,              // Lines between sections
  },

  // Animation
  animation: {
    spinnerInterval: 80,
    blinkInterval: 500,
  },
};
```

---

## Part 6: Migration Path

### Phase 1: Quick Wins (1-2 days)

1. **Fix tool output display** - Summary instead of raw JSON
2. **Remove duplicate messages** - Fix "Spec Generator initialized" x2
3. **Standardize prompt** - All `›` green, no `>`
4. **Dim tool calls** - Lower visual weight

### Phase 2: Component Redesign (3-5 days)

1. **New ToolCallCard** - Collapsible with preview
2. **New StatusLine** - Replace PhaseHeader
3. **Updated MessageList** - No role labels
4. **Dropdown below input** - Claude Code style

### Phase 3: Flow Polish (2-3 days)

1. **Streamline WelcomeScreen** - Keep banner, remove "Press Enter" friction
2. **Fluid init flow** - Status line updates, no explicit phase transitions
3. **Conversational /new** - Questions inline

### Phase 4: Power Features (ongoing)

1. **Command history** - ↑ recall
2. **Ctrl+O expand** - Toggle tool output
3. **Progress bars** - Where estimable
4. **Error cards** - Actionable errors

---

## Part 7: Visual Mockups

### Mockup 1: Init Flow (Improved)

```
Initialize Project │ Scanning (1/5) │ /Users/name/my-app

Detected Stack
  Language: TypeScript
  Package Manager: npm
  Framework: Next.js 14.2

Initialize Project │ Analysis (4/5) │ /Users/name/my-app

Running AI analysis with anthropic/claude-sonnet-4

● Package(package.json) → 34 dependencies
  │ "next": "14.2.0",
  │ "react": "18.2.0",
  └ +32 more
● List(src) → 8 items
● List(src/app) → 12 items
● Search("api") → 6 matches
● Read(src/app/layout.tsx) → 45 lines

Initialize Project │ Confirm (5/5) │ /Users/name/my-app

AI Analysis Complete
  Tokens: 5,234 in / 892 out

Summary
  • Next.js App Router application
  • Tailwind CSS styling
  • No database detected
  • No auth configured

? Generate CLAUDE.md and configuration?
  › Yes    No

› _
```

### Mockup 2: Spec Generation (Improved)

```
New Spec │ Goals (2/4) │ user-auth

? What would you like to build?
› Add user authentication with social logins

New Spec │ Interview (3/4) │ user-auth

Exploring codebase...
● List(src/app) → 12 items
● Read(src/app/api) → 23 lines
● Search("session") → 2 matches

Got it. I see you're using Next.js 14 with the App Router.
A few questions:

1. Which social providers? (Google, GitHub, Discord, etc.)

› Google and GitHub

2. Need email/password as fallback?

› Yes

3. Where should users land after login?

› /dashboard

New Spec │ Generating (4/4) │ user-auth

Generating specification...

────────────────────────────────────────────────────────

✓ Spec saved: .ralph/specs/user-auth.md

Created specification for user authentication with:
  • Google OAuth
  • GitHub OAuth
  • Email/password
  • Redirect to /dashboard

Run /run user-auth to implement with AI.

› _
```

### Mockup 3: Error State (Improved)

```
Initialize Project │ Analysis (4/5) │ /Users/name/my-app

✗ API request failed

  The Anthropic API returned an error:
  "Invalid API key provided"

  This usually means:
  • Your API key is incorrect or expired
  • The key doesn't have required permissions

  To fix: Run /init to enter a new API key

  Tip: Get your API key at console.anthropic.com

› _
```

---

## Part 8: Success Criteria

### Qualitative

- [ ] First-time user completes init without confusion
- [ ] Power user can work as fast as with Claude Code
- [ ] Tool calls don't interrupt reading flow
- [ ] Clear what to do at every state
- [ ] Feels professional, not like a prototype

### Quantitative

- [ ] Init flow: < 2 minutes end-to-end
- [ ] `/new` spec: < 5 minutes for simple feature
- [ ] Screen real estate: Tool calls < 30% of visible space
- [ ] Response time: No perceived lag on input

---

## Appendix: Reference Comparison

### Wiggum Brand Identity (KEEP)

| Element | Treatment |
|---------|-----------|
| ASCII Banner | Keep in Simpson yellow - strong brand recognition |
| Simpson Yellow | Primary AI/brand color - ties to Ralph Wiggum |
| Simpson Pink | Error states - maintains palette consistency |
| "Wiggum" name | Keep throughout - product identity |

### Claude Code Patterns to Adopt

| Pattern | How Wiggum Should Use It |
|---------|--------------------------|
| Collapsible output | Tool calls show preview, expand on Ctrl+O |
| Inline status | Horizontal status line, not centered headers |
| Minimal chrome | Remove boxes, heavy separators |
| Color = meaning | Green=action, Simpson yellow=AI, gray=secondary |
| Bottom dropdown | Commands dropdown below input |
| Conversational | Status line updates, no "Phase X" interruptions |

### Codex Patterns to Adopt

| Pattern | How Wiggum Should Use It |
|---------|--------------------------|
| Action summaries | "Ran git push" not full command output |
| Time tracking | "Worked for 37s" on completions |
| Commit-style | Clear "what happened" summaries |
| Checkmarks | ✓ for completed actions |

---

*Proposal created: 2026-01-27*
*Based on analysis of current TUI and Claude Code/Codex reference*
