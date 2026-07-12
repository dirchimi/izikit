// Petit utilitaire CSV côté client — génération + téléchargement. Un BOM UTF-8
// en tête de fichier, il fait qu'Excel ouvre correctement les accents. Séparateur
// virgule ; les valeurs contenant virgule/guillemet/retour ligne sont échappées.

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: string | number): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, content: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
