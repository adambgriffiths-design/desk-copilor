# Desk Copilot — 100-step checklist

Tick as you go. Steps 1–15 are **today**; the rest are weekly / ongoing.

## Today (1–15)
- [ ] 1. Reload extension (latest version in manifest)
- [ ] 2. `npm run dev` → one server on port 3000
- [ ] 3. `npm run health` → OK
- [ ] 4. Reload TradingView
- [ ] 5. Draw levels — FVG boxes visible
- [ ] 6. Voice on — allow mic
- [ ] 7. Voice Test — see "Heard: …"
- [ ] 8. Ask: what do you see on the chart
- [ ] 9. Confirm brief uses activeSession + structureFacts
- [ ] 10. Thumbs up/down on a read
- [ ] 11. Extension Options → API URL blank (local)
- [ ] 12. Hard refresh if panel stuck
- [ ] 13. Note any red error text
- [ ] 14. Fix one issue before adding features
- [ ] 15. Log session date + call in a spreadsheet

## Stabilize (16–35)
- [ ] 16. Voice works 3 sessions in a row
- [ ] 17. FVG formation ~6pm ET on c2
- [ ] 18. Three daily FVGs max on chart
- [ ] 19. Test Asia session brief
- [ ] 20. Test London session brief
- [ ] 21. Test NY AM brief
- [ ] 22. Test NY PM brief
- [ ] 23. MSS in JSON when present
- [ ] 24. Sweeps in JSON when present
- [ ] 25. Chat without voice
- [ ] 26. Speak replies on/off
- [ ] 27. Toolbar icon verdict
- [ ] 28. Auto-draw on load (optional)
- [ ] 29. Copy / Clear levels
- [ ] 30. `npm run build` passes
- [ ] 31. One backtest dry run: `npm run backtest:dry`
- [ ] 32. Kill extra dev servers if port conflict
- [ ] 33. Delete `.next` if corrupt cache
- [ ] 34. Reload extension after every code change
- [ ] 35. One full NY AM session paper log

## Deploy (36–50)
- [ ] 36. Push to GitHub
- [ ] 37. Vercel project
- [ ] 38. `OPENAI_API_KEY` in Vercel
- [ ] 39. Deploy
- [ ] 40. Extension Options → production URL
- [ ] 41. Verdict with dev server off
- [ ] 42. Voice with dev server off
- [ ] 43. Levels with dev server off
- [ ] 44. `LEARN_FROZEN=true` on prod (optional)
- [ ] 45. Never commit `.env.local`
- [ ] 46. Keep local dev for experiments
- [ ] 47. Rotate API key if exposed
- [ ] 48. Document prod URL privately
- [ ] 49. Pine script on chart (optional stable lines)
- [ ] 50. Compare extension overlay vs Pine once

## Chart quality (51–65)
- [ ] 51. ORG / CE match your chart
- [ ] 52. Session H/L match today
- [ ] 53. Less clutter — only key lines drawn
- [ ] 54. NWOG / NDOG in brief only
- [ ] 55. Premium/discount in brief
- [ ] 56. Bias conflict → stand aside
- [ ] 57. Rate 10 reads good/bad
- [ ] 58. List 3 bad patterns
- [ ] 59. One prompt rule per pattern (max)
- [ ] 60. Don't change playbook daily
- [ ] 61. Unfilled FVG in brief only
- [ ] 62. Recent FVG on chart always
- [ ] 63. Screenshot one good brief per session type
- [ ] 64. Screenshot one bad brief
- [ ] 65. Fix one failure mode, re-test

## Voice & UX (66–80)
- [ ] 66. Quiet room test
- [ ] 67. Noisy room test
- [ ] 68. Barge-in while speaking
- [ ] 69. "stop voice" command
- [ ] 70. "read it" after verdict
- [ ] 71. Alt+Shift+V toggles voice
- [ ] 72. Alt+Shift+L draws levels
- [ ] 73. Alt+Shift+R chart read
- [ ] 74. Queue two questions quickly
- [ ] 75. Long session (2h+) stable
- [ ] 76. Second monitor / zoom
- [ ] 77. Windows mic device correct
- [ ] 78. tradingview.com mic allowed
- [ ] 79. Service worker alive (reload ext if dead)
- [ ] 80. Panel minimize / drag position

## Learning loop (81–95)
- [ ] 81. Spreadsheet: time, call, outcome
- [ ] 82. Mark right / wrong / no-trade
- [ ] 83. Weekly review wrong reads
- [ ] 84. Prompt changes from patterns only
- [ ] 85. Max 8 learned rules
- [ ] 86. Don't grade low confidence
- [ ] 87. Backtest monthly
- [ ] 88. Compare backtest vs live drift
- [ ] 89. Freeze rules before big edits
- [ ] 90. Version extension on voice/levels changes
- [ ] 91. Version backend on JSON changes
- [ ] 92. `npm run learn` only when ready
- [ ] 93. `npm run dedupe-feedback` after backtest
- [ ] 94. One failure fixed per week
- [ ] 95. Re-test that failure next session

## Stop line (96–100)
- [ ] 96. No new indicators until core stable
- [ ] 97. No payments / signup yet
- [ ] 98. MNQ only until solid
- [ ] 99. No rewrite until 30+ logged sessions
- [ ] 100. Ship daily use — one chart, one workflow
