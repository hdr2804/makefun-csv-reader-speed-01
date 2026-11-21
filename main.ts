import { setFlagsFromString } from 'node:v8';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

setFlagsFromString('--no-incremental-marking');

const { run } = await import('./solve.js');

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(`${inputDir}/cases.json`, 'utf8')) as {
  id: string;
  input: { text: string; header: boolean };
}[];
const answers = cases.map((c) => run(c.input));
mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/answers.json`, JSON.stringify(answers));
