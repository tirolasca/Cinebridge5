import { useCallback, useEffect, useState } from 'react';

export type Tema = 'dark' | 'light';
const CHAVE = 'cinebridge-tema';

function inicial(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === 'dark' || salvo === 'light') return salvo;
  } catch {
    /* storage indisponível */
  }
  return 'dark'; // dark-first
}

export const aplicarTema = (t: Tema): void => {
  document.documentElement.dataset.theme = t;
};
export const temaInicial = (): Tema => inicial();

export function useTheme() {
  const [tema, setTema] = useState<Tema>(inicial);
  useEffect(() => {
    aplicarTema(tema);
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      /* ignora */
    }
  }, [tema]);
  const alternar = useCallback(() => setTema((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { tema, alternar };
}
