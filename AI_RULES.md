# Project Rules

## Tech Stack

- Use **React 18+** with **TypeScript** for all application code; do not add new JSX-only or plain JavaScript modules.
- Use **Vite** for local development and production builds.
- Use **React Router** for client-side navigation, with the route definitions kept in `src/App.tsx`.
- Use **Tailwind CSS** for layout, spacing, typography, colors, responsive behavior, and other styling.
- Use **shadcn/ui** and its existing Radix UI primitives for accessible interface components.
- Use **lucide-react** for interface icons instead of custom inline SVGs or additional icon packages.
- Use **Chart.js** only for charts, dashboards, and data visualizations.
- Use **IBM Plex Sans Arabic** as the primary typeface and preserve Arabic-first, right-to-left (`dir="rtl"`) behavior.

## Library and Implementation Rules

- Put all source code under `src/`: pages in `src/pages/`, reusable components in `src/components/`, and the default page in `src/pages/Index.tsx`.
- Add new pages to `src/App.tsx` and ensure user-facing components are rendered by a routed page; do not leave implemented components disconnected from the UI.
- Prefer an existing shadcn/ui component for buttons, inputs, dialogs, cards, tables, tabs, selects, and feedback states. Compose or wrap these components instead of editing files under `src/components/ui/`.
- Use Tailwind utility classes rather than CSS modules, CSS-in-JS, inline style objects, or a second styling framework. Add global CSS only for shared tokens, font setup, and behavior Tailwind cannot express cleanly.
- Use Lucide icons with accessible labels where meaning is not already conveyed by adjacent text. Do not add another icon library or hand-code SVG icons when Lucide provides an equivalent.
- Use Chart.js only when a visual chart is required; use semantic HTML tables or lists for ordinary structured data.
- Keep state local with React hooks by default. Introduce a global state library only when state must be shared broadly and React context would be insufficient.
- Use native `fetch` for HTTP requests unless the project later adopts a single shared API client. Keep network and persistence logic outside presentational components.
- Build accessible, keyboard-operable interfaces with semantic HTML, explicit form labels, visible focus states, and sufficient color contrast.
- Preserve RTL layout and Arabic copy throughout the interface. Use logical alignment and spacing utilities so layouts remain correct in right-to-left mode.
- Keep components small and focused. Avoid duplicate components, unnecessary abstractions, placeholder implementations, and adding libraries for functionality already covered by the stack.
- Never expose secrets in client code, trust client-side authorization, or render untrusted HTML without sanitization. Validate user and external input at system boundaries.
