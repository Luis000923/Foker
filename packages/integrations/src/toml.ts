/** Marcadores TOML equivalentes al bloque Markdown; el manifiesto conserva su formato v1. */
export function tomlBlockText(text: string): string {
  return text
    .replace(/^# foker:begin v1\r?$/m, '<!-- foker:begin v1 -->')
    .replace(/^# foker:end\r?$/m, '<!-- foker:end -->');
}

export function tomlText(text: string): string {
  return text.replace(/^<!-- foker:begin v1 -->$/m, '# foker:begin v1').replace(/^<!-- foker:end -->$/m, '# foker:end');
}

/** Comprobación conservadora de propiedad; no pretende validar todo el lenguaje TOML. */
export function tomlConflict(text: string, outside: string): string | undefined {
  const begins = [...text.matchAll(/^# foker:begin.*$/gm)];
  const ends = [...text.matchAll(/^# foker:end.*$/gm)];
  if (
    begins.length !== ends.length ||
    begins.length > 1 ||
    (begins.length && !/^# foker:begin v1\r?$/.test(begins[0]?.[0] ?? '')) ||
    (ends.length && !/^# foker:end\r?$/.test(ends[0]?.[0] ?? '')) ||
    (begins[0] && ends[0] && (begins[0].index ?? 0) >= (ends[0].index ?? 0))
  ) {
    return 'marcadores TOML de Foker inválidos; corrígelos manualmente';
  }
  // Claves bare, básicas y literales, y espacios entre tramos de una clave con puntos.
  const namespace = '(?:mcp_servers|"mcp_servers"|\'mcp_servers\'|agents|"agents"|\'agents\')';
  const key = '(?:foker(?:-[a-z0-9-]+)?|"foker(?:-[a-z0-9-]+)?"|\'foker(?:-[a-z0-9-]+)?\')';
  const owned = new RegExp(`^\\s*\\[\\[?\\s*${namespace}\\s*\\.\\s*${key}\\s*(?:[.\\]]|$)`, 'm');
  const dotted = new RegExp(`^\\s*${namespace}\\s*\\.\\s*${key}\\s*(?:[.=]|$)`, 'm');
  if (owned.test(outside) || dotted.test(outside)) return 'tabla TOML de Foker existente fuera del bloque gestionado';
  let section = '';
  for (const line of outside.split(/\r?\n/)) {
    const table = /^\s*\[\s*(.*?)\s*\]\s*(?:#.*)?$/.exec(line);
    if (table) section = (table[1] ?? '').replace(/["']/g, '').trim();
    if ((section === 'mcp_servers' || section === 'agents') && new RegExp(`^\\s*${key}\\s*=`).test(line))
      return 'entrada TOML de Foker existente fuera del bloque gestionado';
    // Una tabla inline puede declarar cualquier rol o servidor y no puede reabrirse.
    if (!section && new RegExp(`^\\s*${namespace}\\s*=`).test(line))
      return 'tabla inline de anfitrión existente; integra Foker manualmente';
  }
  return undefined;
}
