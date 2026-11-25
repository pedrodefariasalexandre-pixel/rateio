/** Copiar e baixar texto, como o v3 (se a área de transferência falhar, pede para copiar à mão). */
export async function copyText(
  txt: string,
  ask: (msg: string, def?: string) => Promise<string | null>,
  hint = 'Copie o texto (Ctrl+C):',
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    return (await ask(hint, txt)) !== null;
  }
}

export function downloadText(name: string, text: string, type: string): boolean {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}
