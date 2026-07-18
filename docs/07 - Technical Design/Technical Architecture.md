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
- reset exige confirmação.

## Mobile futuro

A interface é responsiva desde o MVP. Uma futura versão Android poderá envolver o aplicativo web com Capacitor sem alterar o engine e as fórmulas.

