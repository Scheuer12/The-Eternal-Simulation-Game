---
type: technical-design
status: implemented
---

# Technical Architecture

## Stack

- HTML semântico;
- CSS responsivo e mobile-first;
- JavaScript puro com ES modules;
- Python para simulação e Monte Carlo;
- localStorage para save;
- testes com o test runner nativo do Node.

## Responsabilidades

| Área | Local |
|---|---|
| Parâmetros | `config/game-config.json` |
| Fórmulas | `js/formulas.js` |
| Estado | `js/state.js` |
| Regras e ações | `js/engine.js` |
| Persistência | `js/save-system.js` |
| Renderização | `js/ui.js` |
| Narrativa | `content/texts.js` |
| Balanceamento | `simulation/simulator.py` |

## Loop

O engine calcula a produção usando o tempo real transcorrido. A interface é renderizada em intervalos de 100 ms. A simulação é independente do DOM e limita um tick a 1 segundo para evitar saltos inesperados nesta versão sem progresso offline completo.

## Save

- versionado;
- normalizado ao carregar;
- salvo automaticamente a cada 5 segundos;
- modo normal e modo de desenvolvimento usam chaves diferentes;
- reset exige confirmacao;
- reset bloqueia o autosave durante reload para nao recriar o save apagado;
- Save now grava imediatamente o estado atual e atualiza `lastSavedAt`, criando uma ancora confiavel para offline progress antes de fechar a pagina;
- UI tem painel de Save Management para resetar save atual, normal, desenvolvimento ou todos.

## Development mode

Development mode e ativado por `?dev=1`. A UI mostra um selo `DEVELOPMENT`, controles de teste e um botao `Exit dev` que remove o parametro da URL.

## Mobile futuro

A interface é responsiva desde o MVP. Uma futura versão Android poderá envolver o aplicativo web com Capacitor sem alterar o engine e as fórmulas.
## Save keys atuais

Os saves ficam no `localStorage` do browser, presos ao origin usado para abrir o jogo.

- normal: `the-eternal-simulation.save.v2`;
- desenvolvimento: `the-eternal-simulation.development.v2`.

O reset de um modo remove todos os saves versionados daquele modo. Assim, ao resetar o modo normal, chaves antigas como `the-eternal-simulation.save.v1` tambem sao apagadas, mas saves de desenvolvimento permanecem separados. O painel de Save Management tambem permite apagar ambos os modos de uma vez.

O schema atual usa `SAVE_VERSION = 2` porque a progressao da Energy Layer mudou de forma estrutural.

## Component enablement

Componentes com requisitos comuns devem ser declarados em `js/component-registry.js`. A funcao `evaluateComponent()` em `js/availability.js` deriva `visible`, `enabled`, `cost`, `owned`, `requirement` e `reason` a partir do state/config.

O save continua guardando fatos persistentes da run. Enablement, affordance e custos atuais sao consequencias derivadas e devem ser recalculados em runtime.

## Effects

`js/effect-system.js` inicia a trilha de rastreabilidade de efeitos. Nesta versao ele cobre os multiplicadores de producao do CRC e serve como base para futuros breakdowns de bonus/penalidades na UI.

Valores finais continuam derivados a partir das fontes de efeito. O save nao deve armazenar resultados calculados como fonte da verdade.

## Active duration retiming

Quando uma compra ou controle de desenvolvimento altera a duracao calculada de um trabalho ativo, o engine preserva a fracao de progresso concluida e recalcula `elapsed/duration` na nova escala. Isso faz upgrades de velocidade afetarem imediatamente o ciclo em andamento sem completar estudos de forma acidental.

## Offline progress

Offline progress usa replay acelerado do engine, nao `production * time`. No load, `simulateOfflineProgress` calcula o tempo desde `lastSavedAt`, aplica o teto de `config.offlineProgress`, roda um `GameEngine` com logs individuais suprimidos e event accounting ativo, e grava um resumo unico no log.

Eventos contabilizados incluem energia coletada, overflow decay, consumo de Overclocker, Algorithm Improvements, Algorithm Upgrades, Blueprint Research, construcoes e compras. Ciclos continuos e novas automacoes devem entrar no offline progress por padrao. Se uma automacao existir online, sua policy equivalente deve ser espelhada no hook offline, a menos que o design diga explicitamente o contrario.

Na versao atual, o offline cobre producao passiva, overflow decay, trabalhos ativos, Overclocker ativo ate perder excedente, e Auto Calculator continuando Algorithm Improvements. Acoes manuais como iniciar Algorithm Upgrade, comprar devices ou reclamar resets continuam manuais ate haver automacao desbloqueada.
