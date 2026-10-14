<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep operator section tabs as one horizontally scrollable, visibly scrollable row below 768px; scope overrides to that menu so desktop and unrelated panels retain their layouts.

## PickApp Mobility map and CRUD requirements

- Boarding points must only be used for new routes and passenger booking when latitude/longitude were explicitly selected and verified by an administrator on the map.
- Never invent coordinates for existing points or infer legacy vehicle makes/models from a single display name.
- Keep vehicle `marca` and `modelo` in their own database fields while preserving `nome` for compatibility with existing routes and tickets.
- New route stops must receive the verified coordinates of the selected predefined points; keep OpenStreetMap attribution visible and use the documented tile URL.
- Create/edit forms should have a visible cancel/reset action. Destructive actions require confirmation and must respect foreign-key dependencies and existing audit/history records.

