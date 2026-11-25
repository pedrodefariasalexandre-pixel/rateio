/** Etapa 1 do v3 (#sImport): soltar/escolher o OFX ou dividir só as cobranças fixas. */
import { useRef, useState } from 'react';
import { useRateio } from '../../AppContext';
import { hasCharges } from '../../../lib/charges';
import { importStatement } from '../../../lib/invoice';
import { decodeOfx, parseOFX, type ParsedOfx } from '../../../lib/ofx';

const MAX = 5 * 1024 * 1024;

export function ImportScreen({ onImported }: { onImported: () => void }) {
  const { ctx, commit, toast } = useRateio();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const load = async (parsed: ParsedOfx | null, name: string) => {
    let msg = '';
    // a fatura não é salva; a memória de parcelas pode ser atualizada (upgradeRecord), por isso grava
    const ok = await commit(
      (c) => {
        const r = importStatement(c, parsed, name);
        if (!r.ok) return (msg = r.msg);
      },
      { undo: false },
    );
    if (ok || (!msg && ctx.inv.txs.length)) onImported();
  };
  const readFile = (f: File) => {
    if (f.size > MAX) return toast('Arquivo grande demais para um OFX de fatura.', 'err');
    f.arrayBuffer().then(
      (buf) => {
        let parsed: ParsedOfx;
        try {
          parsed = parseOFX(decodeOfx(buf));
        } catch (err) {
          console.error(err);
          return toast('Não consegui ler esse arquivo.', 'err');
        }
        void load(parsed, f.name);
      },
      () => toast('Não consegui ler o arquivo.', 'err'),
    );
  };

  return (
    <section id="sImport">
      <div className="hero">
        <h1>Divida a fatura do cartão em poucos minutos.</h1>
        <p>
          Importe o OFX, confirme quem paga cada item e envie a mensagem pronta para cada pessoa.
        </p>
      </div>
      <div
        id="dropzone"
        className={drag ? 'drag' : undefined}
        tabIndex={0}
        role="button"
        aria-label="Importar arquivo OFX da fatura"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) readFile(f);
        }}
      >
        <strong>Solte o arquivo OFX aqui</strong>
        <span>ou toque para escolher (Nubank, Mercado Pago, outros bancos)</span>
      </div>
      <input
        ref={input}
        type="file"
        id="fileInput"
        data-testid="ofx-input"
        accept=".ofx,.qfx,.txt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFile(f);
          e.target.value = '';
        }}
      />
      <p className="privacy">
        🔒 O arquivo é lido só neste aparelho. Os dados da fatura não são enviados para lugar
        nenhum.
      </p>
      <div className="side-actions">
        {hasCharges(ctx.d.charges) && (
          <button className="btn" id="btnOnlyCharges" onClick={() => void load(null, '')}>
            Dividir só as cobranças fixas (sem OFX)
          </button>
        )}
      </div>
    </section>
  );
}
