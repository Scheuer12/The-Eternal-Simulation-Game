---
type: layer
status: in-development
layer: 2
resource: Science Points and Quarks
---

# Layer 2 - Science

A Science Era comeca quando o jogador ativa o `Particle Sintetizer`. Cada ativacao sempre custa `100e9 J`. O requisito para receber cada novo Science Point cresce separadamente com o total historico de SP.

## Recursos

`Science Points` sao permanentes e compram perks na Science Tree. Cada ativacao desconta sempre `100e9 J`, mas concede um SP apenas quando a energia no momento da ativacao atinge o requisito crescente do proximo SP. O requisito usa o total historico adquirido, nao o saldo disponivel.

`Quarks` sao gerados a cada sintese na proporcao `1 quark / 100e9 J` disponiveis no ato da ativacao. O jogo distingue `Available Quarks`, `Total Quarks Earned` e `Last Synthesis Quarks`.

## Science Devices

### Quarks Cage

Science Device comprado com Stored Energy depois da primeira sintese. Antes da primeira sintese, a capacidade segura e `1 quark`. Apos a primeira ativacao, o jogador comeca com uma Quarks Cage; cada Cage comporta `10 quarks` e acrescenta outros `10` a capacidade. Cages adicionais sao hardware de run e sao resetadas por nova Particle Synthesis.

## Science Tree

`Redundancy Elimination` fica no topo da arvore, junto da area de Layer Perks; `Particle Generator` fica logo abaixo no mesmo agrupamento. Redundancy aumenta a velocidade de pesquisa de Algorithm Improvements em `0.3%` por ciclo para cada Algorithm Upgrade. As tres lanes que descem da raiz sao Energy, Automation & Life Quality e Studies.

`50G Calculator` custa `1 SP` e depende de `Redundancy Elimination`. Ele estende o Auto Calculator para automatizar Algorithm Upgrades com um tempo de execucao crescente por Upgrade. Algorithm Upgrades manuais continuam instantaneos; somente a rota automatizada usa a curva de duracao configurada.

`Quantum Calculation Principles` e `Quantum Superposition` ficam a direita de Redundancy Elimination; ambos convergem para `Particle Generator`. Os dois principios quanticos ficam como `???` ate o jogador gastar/alocar pelo menos `3 SP`. Particle Generator tambem fica como `???` ate Stored Energy atingir `100e30 J` (`1e32 J`); a descoberta permanece registrada depois de alcancar o marco.

Quantum Calculation Principles aumenta a velocidade dos Algorithm Upgrades com base em `Total Quarks Earned`, usando logaritmo, softcap em `1.15x` com 75% de reducao marginal e hardcap em `1.30x`. Quantum Superposition preserva ate `10%` do progresso de Algorithm Improvement no espaco logaritmico quando Algorithm Upgrade reseta Improvements. Progresso ja preservado nao e retido uma segunda vez em upgrades posteriores.

Energy perks: Processor Bonus applies to CRC usa o bonus total dos Processors elevado a `0.15`; Power Modules Scaling torna o multiplicador de capacidade ligeiramente mais forte a cada modulo; Stored Energy Preservation mantem energia ao fazer Setup Optimization; Science-Powered Energy Production multiplica a producao pelo total historico de SP; CRC Exponential Scaling adiciona `1.005^CRC` a producao base. O perk vermelho Processor Bonus applies to A. Improvements speed aplica o bonus de Processor elevado a `1.07` a velocidade de pesquisa.

Automacoes futuras devem ser refletidas no offline progress por padrao.

## Particle Synthesis

Ao ativar o sintetizador:

1. desconta sempre `100e9 J`;
2. concede `1 Science Point` e incrementa `totalScienceEarned` somente se a energia na ativacao atingir o requisito atual de SP;
3. gera `floor(energyAtSynthesis / 100e9)` quarks;
4. reseta a Energy Era;
5. preserva Science Points e Quarks.

Antes da primeira ativacao, a interface de Science mostra somente `Science Points` e `Total Quarks`. Depois dela, libera capacidade, decay, total historico, custo fixo de ativacao e o requisito de energia do proximo SP.

Toda ativacao exige confirmacao e informa os ganhos antes do reset. A primeira confirmacao concluida transita para uma narrativa curta sobre a sobrecarga da instalacao e apresenta a Science Era. Depois da primeira sintese, o controle do `Particle Sintetizer` sai do painel de progresso da layer e passa para `Science Devices`.

Relacionados: [[Layer 1 - Energy]], [[Core Formulas]].
