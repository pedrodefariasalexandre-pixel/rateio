# Liquid Glass — fundação visual

Camada em `src/ui/glass/` importada depois de `src/ui/index.css`:

- `tokens.css`: fundo com manchas de cor (`--bg-wash`), material de vidro (`--glass-bg`, `-strong`, `-thin`, `--glass-filter` = blur 24px + saturate 1.8), borda especular (`--glass-border`, `--glass-edge`), sombra, raios (`--radius-lg` 22, `--radius` 16, `--radius-sm` 11, `--radius-pill`), mola (`--ease-spring`). Claro e escuro.
- `base.css`: aplica o material em topbar flutuante, abas em cápsula, botões, campos, chips/segmentado, modal, barra inferior, toasts e login/PIN. Classe utilitária `.glass`.

Acessibilidade: `prefers-reduced-transparency` e navegadores sem `backdrop-filter` caem para superfícies opacas; `prefers-contrast: more` reforça bordas; `prefers-reduced-motion` tira animações.

Regra para as telas (frentes 2 a 5): cada tela tem seu próprio CSS ao lado do componente (ex.: `src/ui/telas/historico/historico.css`), importado pelo componente, usando só tokens. Não editar `index.css` nem `glass/` sem combinar.

Referência de estilo: liquidglassdesign.com/prompts (biblioteca de prompts de imagem; não traz CSS, usada como direção visual: vidro translúcido, bordas claras, profundidade suave).
