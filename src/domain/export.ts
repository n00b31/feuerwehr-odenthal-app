export function csv(rows: (string | number)[][]): string {
  return "\uFEFF" + rows.map((row) => row.map((cell) => {
    const value = String(cell);
    const safe = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(";")).join("\r\n");
}
