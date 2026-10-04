// Cada import cubre un caso de REQ-MAP-004; el resultado esperado está en expected/resolution.json.
import { a } from './lib/a.js';
import { b } from './lib';
import { c } from '~/lib/c';
import { s } from '@shared';
import { d } from 'src/lib/d';
import { cond } from '@rc/cond';
import { sub } from '@rc/cond/sub';
import { entry } from '@rc/main-field';
import { plain } from '@rc/plain';
import { deep } from '@rc/plain/src/deep';
import missing from './missing';
import { nope } from '~/nope';
import fs from 'node:fs';
import path from 'path';
import react from 'react';
import { jsx } from 'react/jsx-runtime';
import './styles.css';
import type { Typed } from './lib/types.js';

export const all = [a, b, c, s, d, cond, sub, entry, plain, deep, missing, nope, fs, path, react, jsx] as unknown as Typed;
