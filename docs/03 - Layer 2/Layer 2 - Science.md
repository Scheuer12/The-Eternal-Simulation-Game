---
type: layer
status: in-development
layer: 2
resource: Science Points and Quarks
---

# Layer 2 - Science

A Science Era comeca quando o jogador ativa o `Particle Sintetizer`. A primeira ativacao exige `100e9 J`; as proximas usam o custo energetico do proximo Science Point.

## Recursos

`Science Points` sao permanentes e compram perks na Science Tree. O custo usa o total historico adquirido, nao o saldo disponivel.

`Quarks` sao gerados a cada sintese na proporcao `1 quark / 100e9 J` disponiveis no ato da ativacao. O jogo distingue `Available Quarks`, `Total Quarks Earned` e `Last Synthesis Quarks`.

## Science Devices

### Quarks Cage

Science Device comprado com Stored Energy depois da primeira sintese. A capacidade segura inicial e `1 quark`; cada Cage aumenta a capacidade para `2^(cages + 1) - 1`. Cages sao hardware de run e sao resetadas por nova Particle Synthesis.

## Science Tree

A primeira versao funcional mantem `Matrix Mechanics` como perk inicial: Algorithm Upgrades aceleram Algorithm Improvement em `0.25%` composto por Improvement por Upgrade.

A arvore planejada se divide em tres branches: Automation and Life Quality, Studies e Energy, alem de Layer Perks. Automacoes futuras devem ser refletidas no offline progress por padrao.

## Particle Synthesis

Ao ativar o sintetizador:

1. concede `1 Science Point`;
2. incrementa `totalScienceEarned`;
3. gera `floor(energyAtSynthesis / 100e9)` quarks;
4. reseta a Energy Era;
5. preserva Science Points e Quarks.

Relacionados: [[Layer 1 - Energy]], [[Core Formulas]].
