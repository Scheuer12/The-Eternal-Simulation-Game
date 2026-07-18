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
| Soft Data Display | `1e-8 J` |
| Auto Calculator | `0.05 J` |
| Blueprint revelada | `100 J` de pico, ou descoberta rara antes disso |
| Segundo CRC | `0.08 J`, 20 segundos |
| Processor | `0.25 J` |

## Hipóteses a testar

- O começo desperta curiosidade antes que os números dominem a tela.
- O Soft Data Display chega cedo o suficiente para transformar números ocultos em telemetria útil.
- Quinze Improvements são suficientes para comunicar crescimento extremo sem parecerem repetição vazia.
- O Auto Calculator aparece desde o início como objetivo e fica disponível quando há energia suficiente.
- O segundo CRC é percebido como um salto importante.
- A variância dos Upgrades altera a run sem criar frustração.
- A Blueprint permanece oculta e funciona como surpresa, não como objetivo inicial.
- O Processor aparece desde o início como objetivo maior e deve ser alcançável em até 8 minutos.

## Métricas do playtest

- tempo até Auto Calculator;
- tempo até Soft Data Display;
- tempo até Blueprint;
- tempo até segundo CRC;
- tempo até Processor;
- quantidade de Upgrades;
- períodos sem decisão significativa;
- clareza da interface em tela mobile.

Use [[Playtest Template]] para registrar resultados.
