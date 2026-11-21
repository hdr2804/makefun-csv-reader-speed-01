# Fast broken-CSV reader

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/hdr2804/makefun-csv-reader-speed-01/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/hdr2804/makefun-csv-reader-speed-01/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

A fast drop-in for make.fun's own csv-reader 1.0.0: it reads broken CSV files
exactly as csv-reader does — same columns, rows and errors — but faster.

`solve.js` is a dependency-free ES module whose `run(input)` returns
`{columns, rows, errors}` for one case's `{text, header}`. `main.ts` is the
program the harness runs: it reads every case from `/input/cases.json`,
answers each with `run`, and writes `/output/answers.json`.

## How it works

Single left-to-right byte scan over the text with a manual fast path: plain
unquoted fields are sliced out with `indexOf` for the next comma or line
break, quoted fields are handled only when a quote actually opens one, and
rows are padded or cut to the first record's width with the matching
`short_row` / `long_row` errors. No regex on the hot loop, no per-character
state machine for the common case.
