import { readFileSync } from 'node:fs';
import { evaluateTask } from './compiled/benchmarks/src/evaluate-task.js';

const options = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(await evaluateTask(options)));
