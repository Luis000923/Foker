/** Máximo de palabras por frase en la salida del agente (ASD-STE100). */
export const STE_MAX_WORDS = 20;

/**
 * Directiva de salida inmutable para los roles de Foker (ASD-STE100, controlled English).
 * Va en el prefijo estático: no la modifiques por tarea.
 */
export const OUTPUT_DIRECTIVE = [
  'Output rules (ASD-STE100):',
  `- Write sentences of ${STE_MAX_WORDS} words or fewer, in active voice.`,
  '- Do not use greetings, openers, pleasantries or recaps.',
  '- Keep code, file paths, commands, negations and security warnings exactly as they are.',
  '- Use one term for one thing. Use the imperative for instructions.',
].join('\n');
