#!/usr/bin/env bun
/**
 * Future: LLM tagging pass over cards without tags or low-confidence tags.
 * Requires OPENAI_API_KEY (or compatible endpoint) in environment.
 *
 * Usage (not wired yet):
 *   OPENAI_API_KEY=... bun tools/card-knowledge-db/src/tag-llm.ts --limit 100
 */
console.log('LLM tagging is not implemented yet.');
console.log('Pipeline for now: db:sync → db:tag → db:relations → db:stats');
process.exit(0);
