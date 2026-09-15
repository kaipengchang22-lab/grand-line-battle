# Luffy Spine runtime pack

This folder is a Spine 4.2 JSON/Atlas runtime pack for the anime-inspired pirate captain used by Grand Line Battle.

- `luffy.json`: bones, slots, default skin, and idle/walk/attack/hurt/skill timelines.
- `luffy.atlas`: libGDX/Spine atlas text with attachment regions.
- `luffy-parts.webp`: transparent cutout attachment sheet (WebP keeps the mobile download small while preserving alpha).

The game keeps its existing high-resolution action atlas as the visual fallback while this pack is loaded and used as the data source for the lightweight Three.js cutout adapter. The attachments are intentionally named after their rig slots so they can be replaced by a Spine-editor export later without changing combat code.
