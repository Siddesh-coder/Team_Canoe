# Canoe Claim River

A React + TypeScript claims intake app built with TanStack Start, Vite, Tailwind CSS and Lovable. This handoff includes a small floating canoe help chat, English/German intake copy, and a light/dark theme switch.

- [Lovable editor](https://lovable.dev/projects/71f89c40-da44-4aa1-9a95-c46f980fe60f)
- [Live app](https://canoe-claim-river.lovable.app) (publishing is separate from this branch)
- [Feature branch](https://github.com/Maxi-2505/canoe-claim-river/tree/feat/floating-canoe-lovable-handoff): `feat/floating-canoe-lovable-handoff`

## Open these changes in Lovable

In the existing project, open **Project settings → Git → GitHub**, then select `feat/floating-canoe-lovable-handoff` in the branch picker. Lovable edits and syncs the selected branch. Alternatively, review and merge this branch into the connected branch. Use a normal merge and preserve published history. [Lovable GitHub documentation](https://docs.lovable.dev/integrations/github)

For a separate project, select this branch on GitHub, choose **Code → Download ZIP**, and use Lovable's **Upload code** import. This creates a separate copy; connecting Git sync afterwards is a separate step. [Import guidance](https://docs.lovable.dev/integrations/github#can-i-import-an-existing-github-repo-into-lovable)

The project owner must give the recipient editing access through **Share**. This README and the source code do not grant account permissions. Editors can customize features; ownership, transfer and some administration actions require other roles. GitHub access is separate. [Collaboration roles](https://docs.lovable.dev/features/collaboration)

## Paste this into Lovable to start the handoff

```text
Read README.md and AGENTS.md. Work on the
feat/floating-canoe-lovable-handoff branch.

Keep the small transparent 3D-style canoe chatbot at middle-right,
with the "Sail with us" label, gentle motion, reduced-motion support,
English/German selector, and light/dark toggle.

The implementation is in src/components/site-tools/SiteTools.tsx,
src/components/site-tools/ChatBoatMark.tsx, src/assets/chat-canoe-3d.png,
and the floating site tools section of src/styles.css.
The provider and widget are mounted in src/routes/__root.tsx.

Let me customize the position, size, label, artwork, colours, messages,
and which pages show the widget. Preserve the existing claims workflow
and current background scene. Keep decisions in the external rules
engine, and follow AGENTS.md for server writes, schema and secrets.
Run the existing tests and production build after changes.
```

## Feature controls and file locations

| Feature | Where to edit | What to change |
| --- | --- | --- |
| Canoe artwork | `src/assets/chat-canoe-3d.png` | Replace the transparent PNG or change its import in `ChatBoatMark.tsx`. |
| Shared boat component | `src/components/site-tools/ChatBoatMark.tsx` | Used by the launcher and chat header. |
| Position and size | `src/styles.css` | `.canoe-chat-launcher`, `.canoe-chat-logo`, `.canoe-chat-panel`, and mobile media queries. |
| Invitation | `src/components/site-tools/SiteTools.tsx` | Find `Sail with us` / `Komm an Bord`; update visible and accessible labels together. |
| Greeting, topics, replies | `SiteTools.tsx`, `copy.en` / `copy.de` | Edit both languages. Topic and answer arrays use matching indexes. |
| Reply matching | `SiteTools.tsx`, `answer()` | Update keyword matching when changing topics. |
| Translations | `SiteTools.tsx`, `translations` / `t()` | Add dictionary entries; wrap additional page strings with `t()`. |
| Theme colours | `src/styles.css`, `:root` / `.dark` | Edit colour variables. The provider controls the document theme class. |
| Mounting and visibility | `src/routes/__root.tsx` | Mount `SiteTools` once; keep its provider above all `useSiteTools()` consumers. |
| Translated intake | `src/components/canoe/IntakeFlow.tsx`, `QuestionCard.tsx` | These consume the shared translation helper. |
| Image generation notes | `src/assets/chat-canoe-3d.prompt.md` | Original prompt for creating replacement artwork. |

The help chat provides **local canned FAQ replies**. It does not call an AI service, retrieve a customer's claim, or make claim decisions. Messages are held in component state and reset on reload. Language and theme are stored in localStorage under `canoe-locale` and `canoe-theme`. Defaults are English and light mode; saved preferences take effect after mounting. Translation coverage is partial: unmapped strings remain in English.

The canoe is a transparent illustration with 3D-style shading and CSS motion, not a rotatable 3D model. The widget needs no API key; claim submission still needs the project's existing backend configuration.

## Move, resize, or remove features

Current artwork: **72 × 48 px**. Clickable area including the label: **90 × 66 px**. Position: `right: 20px; top: 50%; transform: translateY(-50%)`; phones use `right: 12px`.

Edit the existing rules in `src/styles.css` rather than accumulating contradictory overrides. Move the panel with the launcher and check the mobile media queries at the end of the floating-tools section.

Example: bottom-right launcher, panel above it (change these properties on the existing selectors):

```css
.canoe-chat-launcher {
  left: auto;
  right: 20px;
  top: auto;
  bottom: 20px;
  transform: none;
}
.canoe-chat-panel {
  left: auto;
  right: 20px;
  top: auto;
  bottom: 102px;
  transform: none;
  max-height: min(520px, calc(100dvh - 126px));
}
```

For another floating location, change the anchors and clear opposing ones with `auto`. For a header or content container, use `position: static; transform: none` on the launcher and move `<SiteTools />` to that container inside the provider. Its chat panel and theme/language controls remain separately positioned until their CSS is changed too. Do not mount multiple widget copies.

Change `.canoe-chat-logo` for artwork size and `.canoe-chat-launcher` for its hit area. Keep room for the label and a usable touch target. To disable movement, set `.canoe-chat-logo { animation: none; }`. Reduced-motion users already receive a static boat.

To hide the widget, remove `<SiteTools />` but keep `<SiteToolsProvider>` for translated intake components. To keep chat only, remove the `canoe-site-controls` JSX from `SiteTools`; retain its provider. To use just the artwork, copy the PNG and render it as a normal `<img>` wherever needed.

### Paste-ready customization prompts

```text
Move the existing canoe chat launcher to right: 24px and top: 30%.
Keep its small image and "Sail with us" label. Position the panel inside
the viewport and check phone layouts, form controls and navigation.
```

```text
Change the invitation to "Need a hand?" in English and
"Brauchst du Hilfe?" in German, including the accessible label.
Keep the current small size and transparent background.
```

```text
Replace the FAQ topics and replies with the text below.
Update copy.en, copy.de and answer() keyword matching together.
Keep claim decision logic out of this chat.
[Paste the new topics and replies here.]
```

## Copy into another React project

These are editable React components, not a universal HTML embed. For a compatible React/TypeScript app:

1. Copy `SiteTools.tsx`, `ChatBoatMark.tsx`, and `src/assets/chat-canoe-3d.png`, retaining their relative locations.
2. Install `lucide-react` if missing. Adjust the `@/assets/...` import if the destination uses another alias.
3. Copy the CSS starting at `/* Floating site tools. All styling is scoped to these additions. */`. Supply these variables from the target theme or this project's `:root` / `.dark` definitions: `--paper`, `--ink`, `--stone`, `--cedar`, `--border`, `--muted`, `--card`, `--background`, `--foreground`, `--font-display`, `--font-mono`. Provide a standard `sr-only` class if Tailwind is absent.
4. Mount the provider and widget once around the existing app:

```tsx
import { SiteTools, SiteToolsProvider } from "./components/site-tools/SiteTools";

export function App() {
  return (
    <SiteToolsProvider>
      <YourExistingApp />
      <SiteTools />
    </SiteToolsProvider>
  );
}
```

5. To translate destination pages, use `useSiteTools().t(...)` inside the provider and add dictionary entries. Copying the widget alone does not translate the destination app.
6. Adapt document language/theme handling and localStorage keys if the destination already manages them.

## Local development

```sh
git clone --branch feat/floating-canoe-lovable-handoff https://github.com/Maxi-2505/canoe-claim-river.git
cd canoe-claim-river
npm install
npm run dev
```

Use a Node.js version compatible with the project's Vite 8 dependencies. The repository also has `bun.lock` for its Bun workflow. On Windows PowerShell, use `npm.cmd` if script policy blocks `npm.ps1`.

```sh
npm test
npm run build
npm run preview
```

Use Lovable-managed secrets and the existing backend setup for database operations. Never put credentials in this README, prompts or browser code. `VITE_` variables are browser-visible. Reviewer and policy APIs use `VITE_API_URL` when set, otherwise in-memory mocks; those mocks do not replace claim-submission storage.

Check chat open/close, label readability, narrow/wide layouts, saved theme/language preferences and reduced-motion behavior. Verify that the launcher stays clear of the main form and decorative boat.

## Project boundaries

Follow [AGENTS.md](AGENTS.md). Questions belong in `src/config`; intake rules stay in `src/lib/intake/logic.ts`; claim writes go through server functions; external rules engines own decisions. Reviewer and policy data use their API modules. Lovable manages schema changes, generated files, connectors and secrets. Preserve the current decorative background and published Git history when integrating this feature branch.
