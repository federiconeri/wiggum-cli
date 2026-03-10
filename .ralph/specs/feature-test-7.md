# feature-test-7 Feature Specification

**Status:** Planned  
**Version:** 1.0  
**Last Updated:** 2026-02-12

---

## Purpose

Add a TUI-first “agent mode” called `feature-test-7` that can orchestrate autonomous and semi-autonomous Ralph implement → test → fix loops from within the existing interactive UI. The agent should start from an existing feature/project flow, branch into a dedicated agent screen, stream detailed loop logs, and handle repeated failures by prompting the user after N failed loops.

---

## User Stories

1. **TUI-first entry**
   - As a developer, I want to launch an agent from the existing TUI flow so that I can run Ralph loops without leaving my current workflow or switching to raw CLI commands.

2. **Configurable automation**
   - As a developer, I want to choose how autonomous the agent is (fully, semi, or manual) so that I can balance speed, oversight, and safety depending on the risk profile of the change.

3. **Feature-aware context**
   - As a developer, I want the agent to inherit my current feature/project context so that the loops run using the same spec, scripts, and configuration I already set up.

4. **Detailed streaming visibility**
   - As a developer, I want a detailed, streaming log of each loop step and command so that I understand what the agent is doing and can debug issues when something goes wrong.

5. **Failure handling with user choice**
   - As a developer, I want the agent to pause and ask me what to do after repeated failed loops so that I can decide whether to stop, keep going, or switch to a more controlled mode.

6. **Clean exit & summary**
   - As a developer, I want a clear final summary when the agent finishes or is stopped so that I know how far it got, what failed (if anything), and what to do next.

---

## Requirements

### Functional Requirements

#### 1. TUI Entry & Navigation

- [ ] **Agent entry from existing flow**
  - The TUI must expose an option from an existing feature/project screen (e.g., after interview or feature selection) to start the `feature-test-7` agent.
  - Example label: “Run Ralph loops with agent (feature-test-7)”.

- [ ] **Dedicated agent screen**
  - Selecting the agent option transitions to a dedicated Ink screen/component for the `feature-test-7` agent while preserving:
    - Current project root
    - Current feature/spec (if any)
    - Relevant run/test configuration already established by the workflow

- [ ] **Back navigation**
  - From the agent screen, users must be able to:
    - Return to the parent screen (previous step in the flow)
    - Exit the application entirely (following existing patterns)
  - The agent screen should clearly show keybindings for navigation (e.g., `Q` to quit, `B` to go back if supported by the app).

**Acceptance Criteria**

- [ ] From a normal TUI feature/project flow, I can see and select an option labeled to start the `feature-test-7` agent.
- [ ] After selecting the option, a new agent screen appears with status/controls specific to the agent (not the generic TUI).
- [ ] Pressing the documented “back”/“quit” keys exits the agent screen and returns me to the parent context or exits the app as designed.

---

#### 2. Automation Level Selection

- [ ] **Mode options**
  - At the start of the agent screen, the user is prompted to choose one of:
    - Fully autonomous – automatically run consecutive loops until success or stop condition.
    - Semi-automatic – agent proposes each loop; user must confirm before each new loop.
    - Manual – user manually triggers each phase of the loop (implement/test/fix) step-by-step.

- [ ] **Mode persistence**
  - The selected mode is stored in session state for the entire agent run and used by the orchestrator.
  - Mode must be clearly visible in the UI (e.g., a status bar showing “Mode: Autonomous / Semi / Manual”).

- [ ] **Optional mode switching**
  - The agent must allow switching modes at certain points (e.g., after hitting the failure threshold, see Failure Handling), at minimum via explicit prompt logic.

**Acceptance Criteria**

- [ ] On entering the agent, I am prompted to choose between three clearly labeled modes (Autonomous, Semi-automatic, Manual).
- [ ] Once chosen, the mode is displayed on screen and governs how the loops proceed.
- [ ] If the agent offers mode switching (e.g., after failure threshold), the new mode is reflected both in behavior and in the displayed mode label.

---

#### 3. Ralph Loop Orchestration

- [ ] **Loop structure**
  - Each loop must conceptually perform:
    1. Implement or apply changes via underlying coding agent / scripts.
    2. Run tests or checks (using project-specific test command).
    3. Analyze results to determine:
       - All tests passed → success.
       - Failures or errors → proceed to fix phase.
    4. Optional fix phase using coding agent to address failing tests.
    5. Decide whether to run another loop based on result and configured limits.

- [ ] **Loop driver**
  - Implement an orchestrator (e.g., in `src/generator/agent` or similar) that:
    - Accepts context: project paths, commands, feature info, mode, and config (e.g., test command).
    - Exposes an imperative or evented API to the TUI:
      - Methods like `startRun()`, `startNextLoop()`, `runPhase(phase)`, `pause()`, `resume()`, `abort()`.
      - Events or callbacks for: `loopStarted`, `phaseStarted`, `phaseOutput`, `phaseCompleted`, `loopCompleted`, `runCompleted`, `error`.

- [ ] **Loop counter & limits**
  - The orchestrator tracks:
    - `loopCount` – total loops executed this run.
    - `consecutiveFailures` – consecutive loops that ended in non-success state.
  - A `maxFailedLoops` param (default e.g., `3` or `5`) is configurable per run, with a default from config. User-facing prompt at start is optional but recommended.

**Acceptance Criteria**

- [ ] In Autonomous mode, starting the agent causes at least one full loop to run without additional input.
- [ ] The agent increments and displays loop numbers (`Loop #1`, `Loop #2`, etc.) as loops execute.
- [ ] The orchestrator can distinguish success (all tests passed) vs. failure (tests failed or error) and stops further loops on success by default.

---

#### 4. Integration with Existing Feature Flow

- [ ] **Feature-aware context**
  - When launched from a feature-aware screen (e.g., after generating a spec), the agent must:
    - Receive a reference to the active feature/spec (id, path, or in-memory structure).
    - Use the same project-level configuration (e.g., test command, run scripts) already determined.

- [ ] **Generic fallback**
  - If no specific feature/spec exists in session:
    - The agent runs in “generic mode”.
    - The UI explicitly indicates “No specific feature bound – running generic Ralph loops”.

- [ ] **Non-blocking integration**
  - If feature-specific artifacts are missing or invalid, the agent:
    - Fails gracefully with a clear message describing what is missing.
    - Does not crash the entire TUI.

**Acceptance Criteria**

- [ ] When launched from a feature flow that has a spec, the agent UI shows that it is running “for feature X” or similar, and uses that context.
- [ ] When launched without a feature, the agent UI shows a generic mode message and still allows loops to run using the project context.
- [ ] If required inputs (like test command) are missing, a clear error message is displayed and the UI returns me safely to a usable state.

---

#### 5. Detailed Streaming Logs

- [ ] **Live log area**
  - The agent screen includes a primary log area that:
    - Updates in real-time as each phase runs.
    - Shows:
      - Loop numbers and boundaries (e.g., “=== Loop #2 ===”).
      - Phase markers (Implement, Test, Fix).
      - Commands invoked or logical actions (e.g., `Running tests: npm test`).
      - Key standard output/error lines.
      - Final status per loop (success/failure summary).

- [ ] **Scrolling / pagination**
  - When logs exceed the viewport height, the UI must:
    - Support scrolling (up/down) or paging.
    - Provide a small indicator when more content exists above or below.

- [ ] **Output trimming**
  - Excessively long output (e.g., verbose test runs) should be:
    - Truncated with an indication like “[…] truncated – press X to view more” or similar, OR
    - Buffered, showing recent lines by default with ability to inspect more if needed.
  - Implementation approach should favor TUI responsiveness over showing every line.

**Acceptance Criteria**

- [ ] While loops are running, I can see log lines appear in real time without manually refreshing the screen.
- [ ] For multi-loop runs, the log clearly distinguishes where each loop begins and ends.
- [ ] When output exceeds the screen, I can scroll or otherwise access earlier lines and the TUI remains responsive (no obvious input lag).

---

#### 6. User Controls During Run

- [ ] **Keybindings**
  - The agent screen supports at least the following keys (or equivalents consistent with the app):
    - `P` – Pause agent (where applicable).
    - `R` – Resume agent.
    - `S` – Stop/End agent run gracefully.
    - `Q` – Quit agent screen (and return/exit per design).
  - A help/footer line lists available controls.

- [ ] **Mode-specific behavior**
  - **Autonomous mode:**
    - After starting, loops run back-to-back until success/stop/threshold.
    - `P` pauses between loops or during safe points in long-running phases where possible.
  - **Semi-automatic mode:**
    - Before each loop begins, the TUI prompts: “Start Loop #N? [y/n]”.
    - If user chooses “no”, the run ends with a summary.
  - **Manual mode:**
    - The UI exposes controls to run each phase individually:
      - Implement phase
      - Test phase
      - Fix phase (only if test failed)
    - The orchestrator enforces a valid order (e.g., can’t run Fix before Test in that loop).

**Acceptance Criteria**

- [ ] The agent screen shows a help/footer with the keys for pause, resume, stop, and quit.
- [ ] In Semi-automatic mode, the agent always waits for my confirmation before starting the next loop.
- [ ] In Manual mode, I can trigger Implement, Test, and Fix individually, and the UI prevents me from running phases out of sequence.
- [ ] Pressing Stop/End results in the run halting gracefully with a final summary, not an abrupt error.

---

#### 7. Failure Handling After N Failed Loops

- [ ] **Failure threshold tracking**
  - `consecutiveFailures` increments when a loop ends with:
    - Tests failing or
    - An unhandled error in the loop phases.
  - When `consecutiveFailures >= maxFailedLoops`, the orchestrator:
    - Halts automatic progression.
    - Emits a `failureThresholdReached` event for the TUI.

- [ ] **Prompting the user**
  - On threshold reached, the TUI displays a clear prompt, e.g.:
    - “Reached N consecutive failed loops. What would you like to do?”
  - Options must include at least:
    - Stop now and show summary.
    - Continue for N more loops with the current mode.
    - Switch to a less autonomous mode (e.g., from Autonomous to Semi or Manual).

- [ ] **Applying the decision**
  - The user’s choice is passed back to the orchestrator, which:
    - Stops on “Stop now”.
    - Resets/extends the threshold and continues on “Continue”.
    - Switches mode and continues in the new mode on “Switch mode”.

**Acceptance Criteria**

- [ ] When loops fail consecutively N times, the agent stops automatically progressing and shows a prompt with clear options.
- [ ] Choosing “Stop” ends the run and displays a summary with at least the last error and count of failed loops.
- [ ] Choosing “Continue” causes additional loops to run and the failure counter behavior is correct (e.g., either extended threshold or reset per design).
- [ ] Choosing “Switch mode” results in the displayed mode changing and the next loops following the appropriate behavior of that mode.

---

#### 8. Run Summary & Exit

- [ ] **Success summary**
  - On successful completion (tests pass and agent decides it is done), display:
    - Total number of loops executed.
    - Final test status (e.g., “All tests green”).
    - Any notable errors resolved along the way (optional, based on available data).
    - Information about bound feature (if any).

- [ ] **Failure/abort summary**
  - If the run ends due to user abort or failure threshold:
    - Show the last failure reason (e.g., failing test names or error message).
    - Show total loops and number of failed loops.
    - Suggest possible next actions (e.g., “Re-run in manual mode” or “Inspect logs in path X”).

- [ ] **Exit choices**
  - After showing summary, allow the user to:
    - Return to the parent TUI screen.
    - Exit the application (if consistent with current patterns).

**Acceptance Criteria**

- [ ] On any run completion (success, user stop, or threshold failure), I see a concise summary screen with loop count and final test status.
- [ ] From the summary screen, I can either go back to the previous TUI screen or exit completely.
- [ ] No matter how the run ends, the TUI returns to a stable, interactive state without hanging or crashing.

---

### Non-Functional Requirements

- [ ] **Performance**
  - Logging and screen updates must not cause obvious input lag in typical projects (e.g., standard Jest / npm test output).
  - Handling large volumes of output should avoid re-rendering the entire screen for each line; use batched updates or buffering.

- [ ] **Reliability**
  - Errors from child processes (test commands, coding agent commands) must be caught and surfaced as controlled failures, not uncaught exceptions that crash the TUI.
  - Pausing, resuming, and stopping must leave the internal orchestrator in a coherent state (no double-running or dangling processes).

- [ ] **UX & Accessibility**
  - Controls and modes must be clearly labeled and discoverable in the UI.
  - Avoid color-only distinctions for key status indicators; include textual labels.

- [ ] **Logging & Observability**
  - Internally, use the project’s logger utility (`src/utils/logger`) for structured logs where appropriate in addition to the TUI output.
  - Log important transitions: mode changes, threshold hits, start/stop events.

- [ ] **Security & Safety**
  - Reuse existing mechanisms for running shell commands (test runs, scripts) to avoid new injection surfaces.
  - Validate any user-entered commands or paths via existing configuration/validation utilities (e.g., Zod schemas) before execution.

---

## Technical Notes

### Implementation Approach

1. **Orchestrator Layer**

   - Create a dedicated orchestrator module, e.g.:

     - `src/generator/agent/feature-test-7-orchestrator.ts`

   - Responsibilities:
     - Own loop state: mode, loopCount, consecutiveFailures, maxFailedLoops.
     - Provide a typed interface, e.g.:

       ```ts
       type AutomationMode = 'AUTONOMOUS' | 'SEMI_AUTOMATIC' | 'MANUAL';

       interface FeatureTest7Config {
         projectRoot: string;
         testCommand: string;
         featureId?: string;
         maxFailedLoops: number;
         mode: AutomationMode;
       }

       interface FeatureTest7Events {
         onLog: (line: string) => void;
         onLoopStarted: (loopIndex: number) => void;
         onLoopCompleted: (loopIndex: number, success: boolean) => void;
         onPhaseStarted: (loopIndex: number, phase: 'IMPLEMENT' | 'TEST' | 'FIX') => void;
         onPhaseCompleted: (loopIndex: number, phase: 'IMPLEMENT' | 'TEST' | 'FIX', success: boolean) => void;
         onFailureThresholdReached: (info: { loopIndex: number; failures: number }) => void;
         onRunCompleted: (summary: { loops: number; success: boolean; reason?: string }) => void;
       }
       ```

     - Implement methods:

       ```ts
       class FeatureTest7Agent {
         constructor(config: FeatureTest7Config, events: FeatureTest7Events) { /* ... */ }

         startRun(): Promise<void>;
         requestNextLoop(): Promise<void>; // for semi-automatic
         runPhase(phase: 'IMPLEMENT' | 'TEST' | 'FIX'): Promise<void>; // for manual
         pause(): void;
         resume(): void;
         abort(reason?: string): void;
         setMode(mode: AutomationMode): void;
       }
       ```

   - Internally, orchestrator should:
     - Call existing utilities to run implement/test/fix scripts (wrappers around `feature-loop.sh` or similar if present).
     - Signal progress and output via `onLog` and lifecycle events.

2. **TUI Screen Component**

   - Add a new Ink screen component, e.g.:

     - `src/tui/screens/FeatureTest7AgentScreen.tsx`

   - Responsibilities:
     - Render:
       - Status bar: mode, loop count, failure count, feature name or “generic mode”.
       - Streaming log area with scroll support (e.g., store lines in state and slice for viewport).
       - Footer/help text with keybindings.
     - Handle:
       - Initial prompt to select automation mode.
       - Keybindings (`P`, `R`, `S`, `Q`, etc.), wired to orchestrator methods.
       - Confirmation prompts (semi-automatic loops, failure threshold decisions).
       - Rendering of final summary and return navigation.

   - Use existing TUI shell/routing pattern to:
     - Add a route or screen id for `feature-test-7`.
     - Provide navigation from the parent feature screen into this screen.

3. **Session & Context Integration**

   - Extend existing session/context type (see `src/context` / `src/repl`) to include:
     - Current automation mode.
     - Current feature id / spec path (if not already present).
     - Optional agent-specific state (if needed).

   - Ensure the TUI passes the relevant context into `FeatureTest7AgentScreen` via props or context provider.

4. **Command Execution**

   - Use the project’s existing process execution utilities (if any; otherwise Node’s `child_process` or `execa`-style) encapsulated in a utility file (likely already present).
   - Standardize capturing stdout/stderr as async streams and feeding them into `onLog` callbacks for incremental rendering.

5. **Error Handling**

   - Wrap external calls in try/catch inside the orchestrator; propagate errors to the TUI as structured events rather than throwing directly.
   - In the TUI, when an error event is received:
     - Append a clear error line to logs.
     - Mark loop as failed and increment `consecutiveFailures`.
     - Trigger threshold logic if applicable.

6. **Configuration**

   - If a config file or environment variables define a default test command and max loops:
     - Read them using existing config utilities in `src/utils`.
     - Allow overriding per run via the TUI if desired (future enhancement; optional in v1).

---

## Acceptance Criteria (Consolidated, Test-Focused)

- [ ] **Entry & Navigation**
  - QA can start from the existing feature/project TUI, select a labeled option for `feature-test-7`, and see a distinct agent screen.
  - Exiting the agent returns to the parent screen or exits the app without errors.

- [ ] **Mode Selection & Behavior**
  - On agent start, a mode-selection prompt appears with three options.
  - In Autonomous mode, loops run without further confirmation until success, stop, or failure threshold.
  - In Semi-automatic mode, each loop starts only after explicit user confirmation.
  - In Manual mode, phases are only run when triggered, and invalid sequences are prevented.

- [ ] **Loop & Logging**
  - During a run, loop numbers and phase markers are visible in the log.
  - Test runs (e.g., failing npm tests) produce log output that streams on-screen in real time.
  - The log remains navigable (scrollable or pageable) when long, and the TUI stays responsive.

- [ ] **Failure Threshold**
  - With `maxFailedLoops` set to N, after N consecutive failed loops, the agent stops auto-progress and shows a prompt with at least three choices.
  - Choosing each option (Stop, Continue, Switch mode) yields observable, correct behavior consistent with its description.

- [ ] **Summaries**
  - On success (tests green), the summary shows loops executed, final success status, and any bound feature reference.
  - On failure/abort, the summary shows the last error and the count of failed loops.
  - From the summary, QA can return to the parent screen and run another flow without restarting the app.

- [ ] **Robustness**
  - If the underlying test command crashes or returns a non-zero exit code, the agent does not crash; it records the failure and behaves according to the mode and threshold rules.
  - Pausing and resuming works at least between loops (or at documented safe points), and does not result in duplicated or skipped loops.

---

## Out of Scope

- Automatic generation or modification of feature specs beyond what existing flows already do.
- Any non-TUI UI (web, GUI) for the agent.
- Multi-repository or distributed coordination.
- Persistent run history UI (beyond logs and any existing logging system).