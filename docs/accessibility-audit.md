# Accessibility Audit

Date: 2026-06-15

Scope: PR 36 release readiness pass for the command center flow.

## Screens Reviewed

- Home dashboard command center.
- Agent workspace, including template setup state and workflow editor entry.
- Run timeline and usage summary.
- Gmail draft review queue.
- News feed workspace.
- Workflow visualizer and editor.

## Checks

- Keyboard entry points are present through semantic buttons, links, labels,
  selects, and text inputs.
- The authenticated shell includes a skip link and landmark navigation.
- Focus-visible styling is defined globally for buttons, links, inputs, selects,
  textareas, and summary controls.
- Icon-only actions in the reviewed flow expose accessible names through visible
  text, `aria-label`, or screen-reader-only text.
- Loading, empty, error, unauthorized, and mutation-failure states use readable
  text and `role="alert"` or `aria-live` where the state changes after user
  action.
- Forms use labeled controls, browser autocomplete where appropriate, and
  disabled submit states during in-flight mutations.
- Dynamic chat and timeline surfaces expose streamed or changing content through
  polite live regions.
- Workflow visualization has named canvas regions, node labels, edge labels,
  and a validation panel that is readable without relying on color alone.

## Evidence

- `apps/web/components/dashboard.tsx` provides primary navigation and the
  authenticated skip link.
- `apps/web/app/globals.css` defines the global `:focus-visible` outline.
- `apps/web/components/dashboard-home.tsx`, `chat-workspace.tsx`, and
  `runs-workspace.tsx` use labeled composers and live message/timeline regions.
- `apps/web/components/gmail-workspace.tsx` and
  `apps/web/components/news-workspace.tsx` expose review/feed lists as
  selectable button lists with explicit error states.
- `apps/web/components/agent-workflow-preview.tsx` and
  `apps/web/components/agent-workflow-editor.tsx` name the graph/canvas regions
  and expose validation results.

## Remaining Manual Verification

A clean-checkout release pass should still include browser-level keyboard
navigation across desktop and mobile breakpoints. That pass is intentionally
manual because the local demo requires a running API, worker, Redis,
PostgreSQL, Qdrant, Ollama, and tenant credentials.
