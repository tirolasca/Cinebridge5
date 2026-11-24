import { Link } from 'react-router';
import { EstadoVazio } from '@/components/comuns';
import { botao } from '@/components/ui/button-variants';

export default function NaoEncontrada() {
  return (
    <EstadoVazio
      titulo="Página não encontrada"
      texto="O endereço não existe neste painel."
      acao={
        <Link to="/" className={botao({ variante: 'primario' })}>
          Voltar à visão geral
        </Link>
      }
    />
  );
}
