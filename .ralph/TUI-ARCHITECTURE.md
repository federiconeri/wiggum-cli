# Wiggum CLI - TUI Architecture Specification

> Comprehensive documentation of the Terminal User Interface layer for UX review and improvement.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entry Points & Initialization](#2-entry-points--initialization)
3. [Screen Architecture](#3-screen-architecture)
4. [Component Library](#4-component-library)
5. [State Management](#5-state-management)
6. [Navigation Patterns](#6-navigation-patterns)
7. [Input Handling](#7-input-handling)
8. [Theme & Visual System](#8-theme--visual-system)
9. [User Flows](#9-user-flows)
10. [Current Issues & Pain Points](#10-current-issues--pain-points)
11. [Out of Scope](#11-out-of-scope)

---

## 1. Overview

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js ≥18 | JavaScript execution |
| UI Framework | Ink 5.x | React for CLI rendering |
| React | 18.x | Component model |
| Input | ink-text-input | Text input handling |
| Entry | Commander.js | CLI argument parsing |

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                        User Terminal                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Entry Point (index.ts)                   │
│  • Mode detection (TUI vs CLI)                              │
│  • Session state initialization                              │
│  • Provider/config loading                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      App.tsx (Router)                        │
│  • Screen navigation state                                   │
│  • SessionState propagation                                  │
│  • Completion/exit callbacks                                 │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  WelcomeScreen  │ │    MainShell    │ │   InitScreen    │
│                 │ │                 │ │                 │
│  • ASCII banner │ │  • REPL loop    │ │  • Multi-phase  │
│  • Press Enter  │ │  • Commands     │ │  • Provider     │
└─────────────────┘ │  • Navigation   │ │  • AI analysis  │
                    └─────────────────┘ └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ InterviewScreen │
                    │                 │
                    │  • Spec gen     │
                    │  • Q&A flow     │
                    │  • Streaming    │
                    └─────────────────┘
```

---

## 2. Entry Points & Initialization

### File: `src/index.ts`

### Startup Function

```typescript
startInkTui(initialScreen: AppScreen = 'welcome', interviewFeature?: string)
```

### Initialization Sequence

```
1. Detect project root (cwd)
         │
         ▼
2. Check config exists? ──────────────────┐
   hasConfig(projectRoot)                  │
         │                                 │
    ┌────┴────┐                           │
    │ YES     │ NO                        │
    ▼         ▼                           │
3a. Load    3b. Set                       │
    config      initialized=false          │
         │                                 │
         ▼                                 │
4. Detect available provider ◄────────────┘
   getAvailableProvider()
   (checks env vars: ANTHROPIC_API_KEY,
    OPENAI_API_KEY, OPENROUTER_API_KEY)
         │
         ▼
5. Create SessionState
   {
     projectRoot,
     provider,
     model (defaults based on provider),
     config,
     initialized
   }
         │
         ▼
6. Render App with sessionState
   render(<App sessionState={...} />)
```

### SessionState Interface

```typescript
interface SessionState {
  projectRoot: string;
  provider: AIProvider | null;  // 'anthropic' | 'openai' | 'openrouter'
  model: string;
  config: RalphConfig | null;
  initialized: boolean;
  scanResult?: ScanResult;      // Cached from /init
}
```

### Model Defaults by Provider

| Provider | Default Model |
|----------|---------------|
| anthropic | claude-sonnet-4-20250514 |
| openai | gpt-4.1 |
| openrouter | anthropic/claude-sonnet-4 |

---

## 3. Screen Architecture

### File: `src/tui/screens/`

### Screen Registry

| Screen | File | Purpose | Entry Condition |
|--------|------|---------|-----------------|
| WelcomeScreen | `WelcomeScreen.tsx` | First-run welcome | App startup |
| MainShell | `MainShell.tsx` | Interactive REPL | After welcome / navigation |
| InitScreen | `InitScreen.tsx` | Project initialization | `/init` command |
| InterviewScreen | `InterviewScreen.tsx` | Spec generation | `/new <feature>` command |

---

### 3.1 WelcomeScreen

**Purpose**: Branded entry point with status display

**Visual Layout**:
```
┌────────────────────────────────────────────────────┐
│                                                    │
│  ██╗    ██╗██╗ ██████╗  ██████╗ ██╗   ██╗███╗   ███╗│
│  ██║    ██║██║██╔════╝ ██╔════╝ ██║   ██║████╗ ████║│
│  ██║ █╗ ██║██║██║  ███╗██║  ███╗██║   ██║██╔████╔██║│
│  ██║███╗██║██║██║   ██║██║   ██║██║   ██║██║╚██╔╝██║│
│  ╚███╔███╔╝██║╚██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║│
│   ╚══╝╚══╝ ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝│
│                                                    │
│  v0.10.9                                           │
│  anthropic/claude-sonnet-4 │ Ready                 │
│                                                    │
│  Press Enter to continue... (blinking)             │
│                                                    │
│  Tips: /init, /new <feature>, /help                │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface WelcomeScreenProps {
  provider: AIProvider | null;
  model: string;
  version: string;
  isInitialized: boolean;
  onContinue: () => void;
}
```

**Behavior**:
- Blinking "Press Enter..." text (800ms interval)
- Status shows green "Ready" or orange "Not initialized"
- Enter key → navigates to MainShell

---

### 3.2 MainShell

**Purpose**: Primary interactive interface (REPL replacement)

**Visual Layout**:
```
┌────────────────────────────────────────────────────┐
│ Wiggum Interactive Mode │ Ready                    │
│ openai/gpt-5.1 │ Type /help for commands           │
├────────────────────────────────────────────────────┤
│                                                    │
│ (message history appears here)                     │
│                                                    │
│ › Feature name required. Usage: /new <feature>    │
│                                                    │
├────────────────────────────────────────────────────┤
│ › /new my-feature█                                 │
│   ┌──────────────────────────────┐                │
│   │ /init   Initialize project   │                │
│   │ /new    Create spec          │ ← dropdown     │
│   │ /run    Run spec with AI     │                │
│   │ /help   Show commands        │                │
│   └──────────────────────────────┘                │
└────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface MainShellProps {
  sessionState: SessionState;
  onNavigate: (target: NavigationTarget, props?: NavigationProps) => void;
  onSessionStateChange?: (state: SessionState) => void;
}
```

**Available Commands**:

| Command | Aliases | Description | Requires Init |
|---------|---------|-------------|---------------|
| `/init` | `/i` | Initialize project | No |
| `/new <name>` | `/n` | Create feature spec | Yes |
| `/run <name>` | `/r` | Run feature loop | Yes |
| `/monitor <name>` | `/m` | Monitor running loop | No |
| `/config` | `/cfg` | Manage settings | No |
| `/help` | `/h`, `/?` | Show help | No |
| `/exit` | `/quit`, `/q` | Exit application | No |

**Message Types**:
- User messages: `› content` (blue prefix)
- Assistant messages: `● content` (yellow prefix)
- System messages: dimmed text (no prefix)

---

### 3.3 InitScreen

**Purpose**: Multi-phase project initialization wizard

**Phases**:

| # | Phase | Display Name | User Action |
|---|-------|--------------|-------------|
| 1 | scanning | Analyzing project | (automatic) |
| 2 | provider-select | Select AI provider | Select from list |
| 2 | key-input | Enter API key | Type masked input |
| 2 | key-save | Save to .env.local | Yes/No confirm |
| 3 | model-select | Select AI model | Select from list |
| 4 | ai-analysis | AI codebase analysis | (automatic, shows tools) |
| 5 | confirm | Confirm generation | Yes/No confirm |
| 5 | generating | Creating files | (automatic) |
| 6 | complete | Done | Press Enter |
| - | error | Error occurred | Press Escape |

**Visual Layout** (ai-analysis phase):
```
┌────────────────────────────────────────────────────┐
│ ━━━ Phase 4 of 5: AI-powered codebase analysis ━━━ │
├────────────────────────────────────────────────────┤
│                                                    │
│ ● Search Code (pattern: "export.*component")       │
│   → 12 matches found                               │
│                                                    │
│ ● Read File (src/index.ts)                         │
│   → 156 lines                                      │
│                                                    │
│ ◐ List Directory (src/components)                  │
│   Running...                                       │
│                                                    │
│ ⠋ Analyzing codebase structure...                  │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface InitScreenProps {
  projectRoot: string;
  sessionState: SessionState;
  onComplete: (newState: SessionState) => void;
  onCancel: () => void;
}
```

**State Hook**: `useInit` (manages all phase transitions)

---

### 3.4 InterviewScreen

**Purpose**: Interactive spec generation through AI conversation

**Phases**:

| # | Phase | Display Name | User Action |
|---|-------|--------------|-------------|
| 1 | context | Share references | Enter URLs/files or skip |
| 2 | goals | Describe feature | Type description |
| 3 | interview | Clarify requirements | Answer 2-10 questions |
| 4 | generation | Generating spec | (automatic, streaming) |
| 5 | complete | Spec ready | Press Enter |

**Visual Layout** (interview phase):
```
┌────────────────────────────────────────────────────┐
│ ━━━ Phase 3 of 4: Answer clarifying questions ━━━  │
├────────────────────────────────────────────────────┤
│                                                    │
│ › I want to build a user authentication system     │
│                                                    │
│ ● Reading codebase to understand structure...      │
│   ◐ search_codebase → 8 matches                    │
│   ● read_file (src/app.tsx) → 234 lines            │
│                                                    │
│ ● What authentication method do you prefer?        │
│   - JWT tokens                                     │
│   - Session-based                                  │
│   - OAuth providers                                │
│                                                    │
│ › JWT with refresh tokens█                         │
│                                                    │
│ (Type "done" or "skip" to generate early)          │
└────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface InterviewScreenProps {
  featureName: string;
  projectRoot: string;
  provider: AIProvider;
  model: string;
  scanResult?: ScanResult;
  onComplete: (spec: string) => void;
  onCancel: () => void;
}
```

**State Hook**: `useSpecGenerator`
**Orchestrator**: `InterviewOrchestrator` (bridges TUI ↔ AI)

---

## 4. Component Library

### File: `src/tui/components/`

### Component Hierarchy

```
App
├── WelcomeScreen
│   └── WiggumBanner
├── MainShell
│   ├── MessageList
│   │   ├── UserMessage
│   │   ├── AssistantMessage
│   │   │   ├── ToolCallCard
│   │   │   └── StreamingText
│   │   └── SystemMessage
│   └── ChatInput
│       └── CommandDropdown
├── InitScreen
│   ├── PhaseHeader
│   ├── Select
│   ├── PasswordInput
│   ├── Confirm
│   ├── ActionList
│   │   └── ActionOutput
│   └── WorkingIndicator
└── InterviewScreen
    ├── PhaseHeader
    ├── MessageList
    ├── WorkingIndicator
    └── ChatInput
```

---

### 4.1 Input Components

#### ChatInput

**Purpose**: Primary text input with command dropdown support

**Visual**:
```
› Type your message...█
```

**Props**:
```typescript
interface ChatInputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  commands?: Command[];
  onCommand?: (command: string) => void;
}
```

**Behavior**:
- Shows `›` blue prompt prefix
- Typing `/` triggers CommandDropdown
- Space after command hides dropdown
- Disabled state shows `› [waiting for AI...]`

---

#### CommandDropdown

**Purpose**: Autocomplete for slash commands

**Visual**:
```
  /init   Initialize project with CLAUDE.md
  /new    Create a new feature specification
► /run    Run a spec file with AI
  /help   Show available commands
```

**Props**:
```typescript
interface CommandDropdownProps {
  commands: Command[];
  filter: string;
  onSelect: (command: string) => void;
  onCancel: () => void;
}
```

---

#### Select

**Purpose**: Arrow-navigable option list

**Visual**:
```
Select AI provider:
  ○ Anthropic (Claude)
► ● OpenAI (GPT-4)
  ○ OpenRouter
```

**Props**:
```typescript
interface SelectProps<T> {
  message: string;
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  onCancel?: () => void;
  initialIndex?: number;
}
```

**Controls**: ↑/↓, j/k, Enter, Escape

---

#### PasswordInput

**Purpose**: Masked text input for secrets

**Visual**:
```
Enter your API key:
› ************************************█
(Enter to submit, Esc to cancel)
```

**Props**:
```typescript
interface PasswordInputProps {
  message: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  mask?: string;
  placeholder?: string;
}
```

---

#### Confirm

**Purpose**: Yes/No binary choice

**Visual**:
```
Save API key to .env.local?
  [Yes]  No
```

**Props**:
```typescript
interface ConfirmProps {
  message: string;
  onConfirm: (value: boolean) => void;
  onCancel?: () => void;
  initialValue?: boolean;
}
```

**Controls**: ←/→, y/n, Enter, Escape

---

### 4.2 Display Components

#### PhaseHeader

**Purpose**: Progress indicator for multi-step flows

**Visual**:
```
━━━ Phase 3 of 5: AI-powered codebase analysis ━━━
```

**Props**:
```typescript
interface PhaseHeaderProps {
  currentPhase: number;
  totalPhases: number;
  phaseName: string;
}
```

---

#### MessageList

**Purpose**: Conversation history display

**Visual**:
```
› What should I build?              (user - blue)

● Let me explore the codebase...    (assistant - yellow)
  ● search_codebase → 5 matches
  ● read_file → 120 lines

Project not initialized.            (system - dimmed)
```

**Props**:
```typescript
interface MessageListProps {
  messages: Message[];
  maxHeight?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}
```

---

#### ToolCallCard

**Purpose**: Tool execution status display

**Visual States**:
```
○ Search Code (pattern)           (pending - brown)
◐ Read File (path)                (running - yellow)
● List Directory (path) → 5 items (complete - green)
● Search Code (pattern) → Error   (error - pink)
```

**Props**:
```typescript
interface ToolCallCardProps {
  toolName: string;
  status: ToolCallStatus;  // 'pending' | 'running' | 'complete' | 'error'
  input: string;
  output?: string;
  error?: string;
}
```

---

#### WorkingIndicator

**Purpose**: Loading state with spinner

**Visual**:
```
⠋ Analyzing codebase structure... (Press Esc to cancel)
```

**Props**:
```typescript
interface WorkingIndicatorProps {
  state: {
    isWorking: boolean;
    status: string;
    hint?: string;
  };
}
```

---

#### StreamingText

**Purpose**: Real-time text display with cursor

**Visual**:
```
The authentication system should use JWT tokens for...█
```

**Props**:
```typescript
interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  color?: string;
  showCursor?: boolean;
}
```

---

### 4.3 Branding Components

#### WiggumBanner

**Purpose**: ASCII art logo

**Visual**:
```
██╗    ██╗██╗ ██████╗  ██████╗ ██╗   ██╗███╗   ███╗
██║    ██║██║██╔════╝ ██╔════╝ ██║   ██║████╗ ████║
██║ █╗ ██║██║██║  ███╗██║  ███╗██║   ██║██╔████╔██║
██║███╗██║██║██║   ██║██║   ██║██║   ██║██║╚██╔╝██║
╚███╔███╔╝██║╚██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║
 ╚══╝╚══╝ ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝
```

---

## 5. State Management

### Patterns

| Level | Scope | Mechanism | Persistence |
|-------|-------|-----------|-------------|
| Session | Cross-screen | SessionState object | Yes (config files) |
| Screen | Single screen | useState/hooks | No |
| Component | Single component | useState | No |

### State Hooks

#### useInit (`src/tui/hooks/useInit.ts`)

**Manages**: InitScreen phases and data

**Key State**:
```typescript
interface InitState {
  phase: InitPhase;
  projectRoot: string;
  scanResult: ScanResult | null;
  enhancedResult: EnhancedScanResult | null;
  provider: AIProvider | null;
  model: string | null;
  hasApiKey: boolean;
  apiKeyEnteredThisSession: boolean;
  saveKeyToEnv: boolean;
  isWorking: boolean;
  workingStatus: string;
  error: string | null;
  generatedFiles: string[];
  toolCalls: ToolCallDisplay[];
}
```

**Actions**: `initialize`, `setScanResult`, `selectProvider`, `setApiKey`, `selectModel`, `setEnhancedResult`, `setGenerationComplete`, etc.

---

#### useSpecGenerator (`src/tui/hooks/useSpecGenerator.ts`)

**Manages**: InterviewScreen phases and conversation

**Key State**:
```typescript
interface SpecGeneratorState {
  phase: 'context' | 'goals' | 'interview' | 'generation' | 'complete';
  messages: Message[];
  isWorking: boolean;
  workingStatus: string;
  currentQuestion: string;
  awaitingInput: boolean;
  generatedSpec: string | null;
  error: string | null;
  questionCount: number;
  references: Array<{ source: string; content: string }>;
}
```

**Actions**: `initialize`, `addMessage`, `setPhase`, `startToolCall`, `completeToolCall`, `updateStreamingMessage`, etc.

---

### Orchestrator Pattern

**File**: `src/tui/orchestration/interview-orchestrator.ts`

**Purpose**: Bridge between TUI state and AI services

```
┌─────────────────────────────────────────────────────────────┐
│                    InterviewOrchestrator                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TUI Callbacks                    AI Services               │
│  ─────────────────                ───────────────           │
│  onMessage()          ◄─────►    ConversationManager        │
│  onStreamChunk()      ◄─────►    InterviewTools             │
│  onToolStart()        ◄─────►    TavilySearchTool           │
│  onToolEnd()          ◄─────►    Context7Tools              │
│  onPhaseChange()                                            │
│  onComplete()                                               │
│  onError()                                                  │
│  onWorkingChange()                                          │
│  onReady()                                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Navigation Patterns

### Navigation Targets

```typescript
type NavigationTarget = 'welcome' | 'shell' | 'interview' | 'init';
```

### Navigation Flow Diagram

```
                    ┌──────────────────┐
                    │   App Startup    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
          ┌────────│  WelcomeScreen   │
          │        └────────┬─────────┘
          │                 │ [Enter]
          │                 ▼
          │        ┌──────────────────┐
          │   ┌────│    MainShell     │◄─────────────────┐
          │   │    └────────┬─────────┘                  │
          │   │             │                            │
          │   │    ┌────────┼────────┐                   │
          │   │    │        │        │                   │
          │   │ [/init]  [/new]  [/exit]                │
          │   │    │        │        │                   │
          │   │    ▼        │        ▼                   │
          │   │ ┌──────┐    │    ┌────────┐             │
          │   │ │ Init │────┼───►│ Exit() │             │
          │   │ │Screen│    │    └────────┘             │
          │   │ └──┬───┘    │                           │
          │   │    │        │                           │
          │   │ [complete]  │                           │
          │   │    │        ▼                           │
          │   │    │   ┌──────────┐                     │
          │   │    │   │Interview │                     │
          │   │    │   │ Screen   │─────────────────────┤
          │   │    │   └──────────┘     [complete]      │
          │   │    │                                    │
          │   └────┴────────────────────────────────────┘
          │                    [Escape]
          │
     [Deep link: wiggum --new feature]
```

### Navigation Triggers

| Trigger | From | To | Condition |
|---------|------|-----|-----------|
| Enter | Welcome | Shell | Always |
| `/init` | Shell | Init | Always |
| `/new <name>` | Shell | Interview | `initialized=true` |
| `/exit` | Shell | (exit) | Always |
| Escape | Init/Interview | Shell | Always |
| Complete | Init | Shell | Success |
| Complete | Interview | Shell | Spec saved |

---

## 7. Input Handling

### Input Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                        Raw Stdin                             │
│  (managed by Ink internally)                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    useInput Hook                             │
│  (keyboard events: chars, arrows, special keys)             │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    TextInput    │ │     Select      │ │  PasswordInput  │
│    (typing)     │ │  (navigation)   │ │   (masked)      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Component Handler                          │
│  (ChatInput.handleSubmit, Select.handleSelect, etc.)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Screen Handler                            │
│  (MainShell.handleSubmit → parseInput → executeCommand)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Business Logic                             │
│  (Orchestrator, AI services, file operations)               │
└─────────────────────────────────────────────────────────────┘
```

### Key Bindings

| Key | Context | Action |
|-----|---------|--------|
| Enter | TextInput | Submit |
| Enter | Select | Confirm selection |
| Enter | Welcome | Continue |
| Escape | Any screen | Cancel/back |
| Ctrl+C | MainShell | Show "use /exit" hint |
| ↑/↓ | Select/Dropdown | Navigate options |
| j/k | Select | Vim navigation |
| ←/→ | Confirm | Toggle Yes/No |
| y/n | Confirm | Quick select |
| Backspace | TextInput | Delete char |

### Command Parsing

**File**: `src/repl/command-parser.ts`

```typescript
parseInput(value: string): ParsedInput

// Returns one of:
{ type: 'empty' }
{ type: 'slash-command', command: { name, args, raw } }
{ type: 'natural-language', text }
```

---

## 8. Theme & Visual System

### File: `src/tui/theme.ts`

### Color Palette (Simpson Theme)

| Name | Hex | Usage |
|------|-----|-------|
| blue | #2f64d6 | Input prompts (›), user messages |
| yellow | #f8db27 | Primary accent, headers, assistant messages |
| brown | #9c5b01 | Secondary, hints, pending states |
| white | #ffffff | Content text |
| pink | #ff81c1 | Errors, warnings |
| green | #4ade80 | Success states |
| orange | #fb923c | Caution, not initialized |

### Status Indicators

| Symbol | Name | Usage |
|--------|------|-------|
| `○` | pending | Tool not started |
| `◐` | active | Tool running |
| `●` | complete | Tool done / bullet |
| `✓` | success | Phase complete |
| `✗` | error | Phase failed |
| `›` | prompt | User input prefix |
| `█` | cursor | Streaming text cursor |

### Box Drawing

```typescript
const box = {
  topLeft: '┌',     topRight: '┐',
  bottomLeft: '└',  bottomRight: '┘',
  horizontal: '─',  vertical: '│',
}
```

### Phase Header Style

```
━━━ Phase 3 of 5: Phase Name ━━━
```
(Uses U+2501 heavy horizontal line)

---

## 9. User Flows

### Flow 1: First-Time Setup

```
1. User runs `wiggum`
         │
         ▼
2. WelcomeScreen displays
   - ASCII banner
   - "Not initialized" status (orange)
   - Tips shown
         │
         ▼ [Enter]
3. MainShell displays
   - Status bar shows provider/model
         │
         ▼ [/init]
4. InitScreen starts
   │
   ├─► Phase 1: Scanning (automatic)
   │
   ├─► Phase 2: Provider selection
   │   └─► API key entry (if needed)
   │   └─► Save to .env.local confirmation
   │
   ├─► Phase 3: Model selection
   │
   ├─► Phase 4: AI analysis
   │   └─► Tool calls displayed
   │
   ├─► Phase 5: Confirm & generate
   │   └─► Files created
   │
   └─► Complete: Return to MainShell
         │
         ▼
5. MainShell with "Ready" status
```

### Flow 2: Create Feature Spec

```
1. User in MainShell
         │
         ▼ [/new my-feature]
2. InterviewScreen starts
   │
   ├─► Phase 1: Context (optional)
   │   └─► User enters URLs/files or skips
   │
   ├─► Phase 2: Goals
   │   └─► User describes feature
   │
   ├─► Phase 3: Interview (2-10 questions)
   │   └─► AI asks questions
   │   └─► User answers
   │   └─► Tool calls shown
   │
   ├─► Phase 4: Generation (streaming)
   │   └─► Spec text appears incrementally
   │
   └─► Phase 5: Complete
       └─► Spec saved to .ralph/specs/my-feature.md
         │
         ▼
3. Return to MainShell
```

### Flow 3: Quick Commands

```
MainShell
    │
    ├─► [/help] → Shows command list (inline)
    │
    ├─► [/config] → "Not implemented" message
    │
    ├─► [/run feature] → "Not implemented" message
    │
    └─► [/exit] → "Goodbye!" → Process exits
```

---

## 10. Current Issues & Pain Points

### Known UX Issues

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| Stdin conflicts | High | index.ts | Ink/readline mode switching |
| Buffered input | Medium | repl-prompts.ts | 100ms delay workaround |
| No scroll | Medium | MessageList | Long conversations overflow |
| No persistence | Low | MainShell | Messages lost on navigation |
| Limited feedback | Medium | Various | No progress bars |

### Visual Inconsistencies

| Issue | Location | Description |
|-------|----------|-------------|
| Mixed prefixes | Various | Sometimes `>`, sometimes `›` |
| Color usage | Various | Inconsistent success/error colors |
| Spacing | Various | Inconsistent padding/margins |

### Missing Features

| Feature | Priority | Notes |
|---------|----------|-------|
| History | High | Command history (up arrow) |
| Autocomplete | Medium | Tab completion for paths |
| Resize handling | Medium | Terminal resize events |
| Copy/paste | Low | Full clipboard support |
| Mouse support | Low | Click to select |

---

## 11. Out of Scope

The following are **not** part of this TUI review:

### Ralph Loop Layer (AI/Generation)
- `src/ai/` - AI providers, prompts, tools
- `src/generator/` - File generation, templates
- `src/scanner/` - Tech stack detection

### Configuration Files
- `.ralph/claude.md` content/format
- `.ralph/specs/*.md` content/format
- Template files in `src/templates/`

### CLI Mode
- `src/cli.ts` - Commander.js CLI
- Direct command execution (non-TUI)

---

## Appendix: File Reference

### Core TUI Files

| Path | Purpose |
|------|---------|
| `src/index.ts` | Entry point, TUI initialization |
| `src/tui/app.tsx` | Root component, screen router |
| `src/tui/theme.ts` | Colors, symbols, box drawing |

### Screens

| Path | Screen |
|------|--------|
| `src/tui/screens/WelcomeScreen.tsx` | Welcome |
| `src/tui/screens/MainShell.tsx` | Shell/REPL |
| `src/tui/screens/InitScreen.tsx` | Initialization |
| `src/tui/screens/InterviewScreen.tsx` | Spec generation |

### Components

| Path | Component |
|------|-----------|
| `src/tui/components/ChatInput.tsx` | Text input |
| `src/tui/components/CommandDropdown.tsx` | Command autocomplete |
| `src/tui/components/MessageList.tsx` | Conversation display |
| `src/tui/components/ToolCallCard.tsx` | Tool status |
| `src/tui/components/PhaseHeader.tsx` | Progress header |
| `src/tui/components/WorkingIndicator.tsx` | Loading spinner |
| `src/tui/components/Select.tsx` | Option list |
| `src/tui/components/PasswordInput.tsx` | Masked input |
| `src/tui/components/Confirm.tsx` | Yes/No prompt |
| `src/tui/components/WiggumBanner.tsx` | ASCII logo |

### Hooks

| Path | Hook |
|------|------|
| `src/tui/hooks/useInit.ts` | Init state |
| `src/tui/hooks/useSpecGenerator.ts` | Interview state |

### Orchestration

| Path | Class |
|------|-------|
| `src/tui/orchestration/interview-orchestrator.ts` | TUI↔AI bridge |

### Support

| Path | Purpose |
|------|---------|
| `src/repl/command-parser.ts` | Command parsing |
| `src/repl/session-state.ts` | Session state types |

---

*Document generated for UX/TUI review. Last updated: 2026-01-27*
