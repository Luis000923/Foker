import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
});

export const env = schema.parse({ NODE_ENV: process.env.NODE_ENV, APP_ORIGIN: process.env.APP_ORIGIN });
