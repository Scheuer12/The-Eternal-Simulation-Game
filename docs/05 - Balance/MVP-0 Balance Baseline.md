---
type: balance
status: personal-playtest-required
---

# Energy Layer Balance Baseline

## Postura atual

A partir desta versao, a run nao e enquadrada em uma duracao especifica. O objetivo e permitir playtest pessoal e ajustar sensacao de progresso, walls e resets a partir da experiencia direta.

## Marcos monitorados

| Marco | Baseline atual |
|---|---:|
| Producao-base CRC | `1e-12 J/tick` |
| Soft Display | `1e-8 J` |
| T2 Soft Display | `2 J` |
| Auto Calculator | `1e-3 J` |
| Processor | `0.25 J` |
| Overclocker | `2 J` inicial, escala por compra, visivel apos `3 Processors + 3 Power Cells` |
| Blueprint pesquisavel | `10 J` de pico |
| Blueprint Research | `1m` base |
| Novo CRC | `2 J` base |
| Power Cell | visivel apos `Soft Display + 3 A. Upgrades` |
| Power Module | `100 J` inicial, exige `100 Power Cells` por modulo |
| Particle Laboratory | porta abre em `100 J` de pico |
| Particle Sintetizer | ativacao em `100 GJ` |

## Hipoteses a testar

- O jogador entende o tick como referencia de `J/s`, sem sentir cliques quebrados ou espera opaca.
- O Soft Display chega cedo o suficiente para explicar capacidade, overflow e decaimento.
- O T2 Soft Display deve chegar quando o jogador ja tem output complexo o bastante para querer entender de onde ele vem.
- O Auto Calculator a `1e-3 J` cria uma primeira automacao satisfatoria.
- O pequeno abismo entre a primeira e a segunda compra de Auto Calculator cria objetivo, nao frustracao.
- Algorithm Upgrade como estudo manual cria decisao melhor que descoberta aleatoria.
- Calculation Method Upgrade e Setup Optimization comunicam claramente o que resetam.
- Power Cells aparecem tarde o bastante para parecerem descoberta e cedo o bastante para resolver overflow.
- Power Cells comuns devem escalar sem teto de multiplicador, preservando pressao economica de armazenamento ate uma futura quebra de regra de capacidade.
- Overclocker deve transformar energia excedente em tempo de pesquisa, aparecendo so quando o jogador ja entende capacidade e ja tem estrutura para sustentar rajadas curtas de consumo. Upgrades de Overclocker devem escalar como abismos deliberados: ganho adicional relevante de velocidade, mas consumo e custo muito mais agressivos. Cada ativacao tambem deve aquecer em tempo real, aumentando exponencialmente o consumo por segundo ate o excedente acabar; no unlock, a expectativa e que uma ativacao dure poucos segundos e raramente passe de cerca de 10s sem muito excedente.
- O decaimento de overflow cria equilibrio dinamico, nao uma parede seca: mais producao deve empurrar o saldo a um novo patamar.
- Setup Optimization precisa ser perceptivel principalmente em ciclos altos, por reduzir a carga efetiva da formula de tempo.
- Overclocker deve ser planejado para depois da primeira Power Cell, quando o jogador ja entende capacidade e pode escolher queimar excedente para ganhar alguns segundos de tempo acelerado.
- Blueprint Research de `1m` base deve parecer uma reconstrução curta depois do marco de `10 J`, nao uma parede sem ferramenta.
- Power Module e a ponte experimental entre escala de MJ e GJ. Simulacoes iniciais com compra automatica de teste chegaram a `100 GJ` entre aproximadamente `8h46` e `14h38`, dependendo da politica de resets, antes de balance manual fino.

## Metricas de playtest

- tempo ate Soft Display;
- tempo ate Auto Calculator;
- tempo ate primeiro Algorithm Upgrade;
- tempo ate primeiro Calculation Method Upgrade;
- tempo ate Power Cell ficar visivel;
- tempo ate Blueprint Research aparecer;
- tempo percebido sem decisao significativa;
- clareza da UI mobile;
- momentos em que o jogador nao entende o proximo objetivo.

Use [[Playtest Template]] para registrar resultados.
