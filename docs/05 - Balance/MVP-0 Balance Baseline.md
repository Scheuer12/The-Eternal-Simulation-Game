---
type: balance
status: test-required
target-duration: 7 minutes
---

# MVP-0 Balance Baseline

## Objetivo

Uma run normal deve levar aproximadamente 7 minutos entre a ativação do CRC e a instalação do Processor. O modo de desenvolvimento deve permitir validar o ciclo em menos de um minuto.

## Marcos

| Marco | Parâmetro inicial |
|---|---:|
| Produção-base | `1e-12 J/s` |
| Manual Condensing | `5e-12 J` |
| Auto Calculator | 15 Improvements e `0.05 J` |
| Blueprint garantida | 17 Improvements ou 3 Upgrades |
| Segundo CRC | `0.08 J`, 20 segundos |
| Processor | `0.60 J` |

## Hipóteses a testar

- O começo desperta curiosidade antes que os números dominem a tela.
- Quinze Improvements são suficientes para comunicar crescimento extremo sem parecerem repetição vazia.
- O Auto Calculator chega no momento em que o bônus marginal estabiliza em 5%.
- O segundo CRC é percebido como um salto importante.
- A variância dos Upgrades altera a run sem criar frustração.
- O Processor aparece perto de 7 minutos em uma run sem cliques excessivos.

## Métricas do playtest

- tempo até Auto Calculator;
- tempo até Blueprint;
- tempo até segundo CRC;
- tempo até Processor;
- quantidade de Upgrades;
- cliques de Manual Condensing;
- períodos sem decisão significativa;
- clareza da interface em tela mobile.

Use [[Playtest Template]] para registrar resultados.
