# YgoFlow (YGO Engine Lab) — Plan

Branch: `refactor/ygo-flow` (from `main`)

## Decisions

- Host: Angular SPA (`ygo-card-checker`), route `/flow`
- Effect scripts: typed JSON AST + human `luaSource` (hybrid); runtime never eval Lua
- Coverage: auto-generate from `card_effects` for all cards; HAT-2014 manual overrides win
- Reuse: `YdkeService`, `YgoApiService`, knowledge assets where present

## Deliverables

1. `card_scripts` table + `build-effect-scripts` + asset export
2. HAT-2014 curated pack (starters / interrupts / ED)
3. `/flow` page: YDKE, canvas flowchart, solitaire, wizard, hypergeo, `.ygoflow` + PNG
4. Wizard + tagging consume `EffectScriptService`
5. Nav + i18n IT/EN + unit tests (hypergeo, ydke roundtrip, script merge)

## Verify

```bash
npm run db:effect-scripts   # optional if DB present
npx ng test --watch=false --browsers=ChromeHeadless
npm run build
```
