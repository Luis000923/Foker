/** FKR-DEP-006: diccionario curado de paquetes npm de alto uso, objetivo habitual de typosquatting. */
export const POPULAR_PACKAGES: readonly string[] = [
  '@angular/core',
  '@babel/core',
  '@babel/preset-env',
  '@emotion/react',
  '@nestjs/core',
  '@prisma/client',
  '@reduxjs/toolkit',
  '@tanstack/react-query',
  '@testing-library/react',
  '@types/node',
  '@types/react',
  '@typescript-eslint/parser',
  '@vitejs/plugin-react',
  'ajv',
  'axios',
  'babel-loader',
  'bcrypt',
  'bcryptjs',
  'body-parser',
  'chai',
  'chalk',
  'cheerio',
  'chokidar',
  'classnames',
  'clsx',
  'colors',
  'commander',
  'concurrently',
  'cookie-parser',
  'cors',
  'cross-env',
  'cross-spawn',
  'css-loader',
  'date-fns',
  'dayjs',
  'debug',
  'dotenv',
  'drizzle-orm',
  'electron',
  'esbuild',
  'eslint',
  'eslint-config-prettier',
  'eslint-plugin-react',
  'express',
  'fastify',
  'fs-extra',
  'glob',
  'graphql',
  'helmet',
  'husky',
  'immer',
  'inquirer',
  'jest',
  'jquery',
  'js-yaml',
  'jsonwebtoken',
  'knex',
  'koa',
  'lint-staged',
  'lodash',
  'lodash-es',
  'mime',
  'minimist',
  'mkdirp',
  'mocha',
  'moment',
  'mongodb',
  'mongoose',
  'morgan',
  'multer',
  'mysql',
  'mysql2',
  'nanoid',
  'next',
  'next-auth',
  'node-fetch',
  'nodemailer',
  'nodemon',
  'nuxt',
  'passport',
  'pg',
  'pino',
  'playwright',
  'postcss',
  'preact',
  'prettier',
  'prisma',
  'prop-types',
  'puppeteer',
  'qs',
  'ramda',
  'react',
  'react-dom',
  'react-redux',
  'react-router',
  'react-router-dom',
  'redis',
  'redux',
  'request',
  'rimraf',
  'rollup',
  'rxjs',
  'sass',
  'semver',
  'sequelize',
  'sharp',
  'socket.io',
  'styled-components',
  'stripe',
  'supertest',
  'svelte',
  'tailwindcss',
  'ts-node',
  'tslib',
  'turbo',
  'typeorm',
  'typescript',
  'underscore',
  'uuid',
  'validator',
  'vite',
  'vitest',
  'vue',
  'webpack',
  'webpack-cli',
  'winston',
  'ws',
  'yaml',
  'yargs',
  'zod',
  'zustand',
];

/** Distancia de Levenshtein con corte temprano cuando supera `max`. */
export function levenshtein(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      cur.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] as number;
}

/** Nombre conocido más parecido (distancia 1–2), o null. Coincidencias exactas no cuentan. */
export function closestKnown(name: string, known: Iterable<string>): { target: string; distance: number } | null {
  const set = new Set(known);
  if (set.has(name)) return null;
  const max = name.length < 5 ? 1 : 2;
  let best: { target: string; distance: number } | null = null;
  for (const target of [...set].sort()) {
    if (target.length < 3) continue;
    const distance = levenshtein(name, target, max);
    if (distance >= 1 && distance <= max && (!best || distance < best.distance)) best = { target, distance };
  }
  return best;
}
