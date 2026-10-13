---
type: formulas
status: approved-for-test
source: config/game-config.json
---

# Core Formulas

Os valores abaixo formam uma baseline de playtest, nao um balanceamento definitivo.

## Base tick

O tick base da Energy Layer e `1s` como unidade conceitual. A engine ainda usa delta time para suavidade, mas producao e UI sao descritas como Joules por segundo/tick.

Em layers futuras, distorcao temporal podera fazer mais ticks conceituais caberem na mesma janela real de `1s`.

## Stored Energy

```text
rawProduction = 1e-12 * crcCount * improvementMultiplier * 2^algorithmUpgrades
```

Development mode aplica um multiplicador global configuravel na UI.

## Power Cell soft cap and overflow decay

Requisito de visibilidade/compra:

```text
softDisplay == true
algorithmUpgrades >= 3
```

Capacidade estavel:

```text
stableCapacity = 1 J * powerCells
```

Com Power Modules:

```text
powerModuleRequirement = (powerModules + 1) * 100 Power Cells
powerModuleMultiplier = 1.35^powerModules
stableCapacity = 1 J * powerCells * powerModuleMultiplier
```

Com o perk Power Modules Scaling, o expoente total cresce ligeiramente por modulo adicional. Energy perks de producao aplicam os multiplicadores desbloqueados: `processorBonus^0.15`, `totalScienceEarned` e `1.005^crcCount`.

Power Modules nao consomem Power Cells. O custo representa energia para ativar circuitos de captacao e conducao:

```text
powerModuleCost = 100 J * 3.2^(powerModules^1.18)
```

Decaimento de excesso:

```text
if energy <= stableCapacity:
  overflowDecayPerSecond = 0
else:
  overflowRatio = (energy - stableCapacity) / stableCapacity
  overflowDecayPerSecond = stableCapacity * 0.009 * overflowRatio^1.35
```

A producao entra cheia. Energia acima da capacidade estavel fica utilizavel, mas perde energia por segundo. Se a producao parar, o saldo cai ate no minimo `stableCapacity`. Se a producao continuar, o excesso tende a um ponto de equilibrio onde producao e decaimento quase se igualam.

Power Cell cost:

```text
owned = max(1, powerCells)
completedArrays = floor(owned / 100)
arrayPressure = 1.04^completedArrays
multiplier = 1.5 * (1 + (owned - 1) / 4)^1.25 * arrayPressure
cost = stableCapacity * multiplier
```

O custo nao tem teto de multiplicador. Power Cells comuns seguem ficando mais caras indefinidamente, e cada array completo de `100` celulas aumenta levemente a pressao de custo das proximas compras. Isso deixa espaco para features futuras que expandam muito a capacidade ou alterem a regra de armazenamento.

## Algorithm Improvement

Tempo base:

```text
if n <= 10:
  load = n * 0.7
else if n < 15:
  progress = smoothstep((n - 10) / 5)
  load = lerp(n * 0.7, n, progress)
else:
  load = n

effectiveLoad = load * 0.86^setupOptimizations
t(n) = 5 * (1 + 0.1315 * effectiveLoad^2.2)
```

As 10 primeiras conclusoes escalam menos o tempo. Entre 10 e 15 a curva converge para a formula principal. Depois de 15, sem Setup Optimization, ela volta ao crescimento-base e mira aproximadamente `1h` perto do 50o Improvement antes de automacao e Processor.

Efeito:

```text
effectiveN = n * 0.9^calculationMethodUpgrades
```

Para `effectiveN < 15`:

```text
b(n) = 0.05 + (9.00 - 0.05) * (1 - effectiveN/15)^1.55
```

Para `effectiveN >= 15`:

```text
b(n) = 0.05 / (1 + (effectiveN - 15)/40)^0.65
```

Piso:

```text
b(n) = max(0.025, b(n))
```

Cada Improvement multiplica a producao por `1 + b(n)`.

## Algorithm Upgrade

Requisito:

```text
requiredImprovements = 10 + 5 * algorithmUpgrades
```

Efeito:

- dobra producao do CRC;
- reseta Algorithm Improvements;
- quando manual, completa instantaneamente;
- quando o perk `50G Calculator` automatiza A. Upgrades, usa o tempo de execucao crescente abaixo.

Tempo de execucao da automacao de A. Upgrades:

```text
t = 10 * (1 + 0.16 * algorithmUpgrades^1.1)
```

## Calculation Method Upgrade

Requisito:

```text
requiredAlgorithmUpgrades = 5 + 5 * calculationMethodUpgrades
```

Efeito:

- reduz a escala de penalidade do efeito dos Algorithm Improvements;
- reseta estudos;
- preserva hardware.

## Setup Optimization

Requisito:

```text
requiredMethodUpgrades = 2 + 2 * setupOptimizations
```

Efeito:

- reduz a carga efetiva usada pela formula de penalidade de tempo dos Algorithm Improvements;
- reseta energia, estudos e hardware;
- preserva Power Cells.

## Device costs

Custos "logarithmically raised" usam:

```text
cost = baseCost * growth^(owned^exponent)
```

Auto Calculator usa crescimento mais agressivo para criar um pequeno abismo entre a primeira e a segunda compra.

## Offline replay

Offline progress reaproveita as formulas e o engine em steps acelerados. Isso preserva producao nao linear, overflow decay, curvas de tempo de studies, Overclocker e ciclos automatizados sem depender de uma aproximacao fechada. O resultado do load e um summary de eventos e deltas de recursos, nao apenas um saldo final.

## Particle Laboratory

```text
particleLabDoorOpen = peakEnergy >= 100 J
sciencePointCost(S) = 10^(11 + 0.9*S + 0.055*S^2)
particleSynthesizerActivationCost = 100e9
sciencePointAward = energyAtSynthesis >= sciencePointCost(totalScienceEarned) ? 1 : 0
particleSynthesizerProgress = energy / particleSynthesizerActivationCost
```

`100e9 J` equivale a `100 GJ`. A porta usa energia de pico; o sintetizador usa energia atual.

## Science Era

Science Points usam o total historico ja adquirido, nao o saldo disponivel:

```text
SP Cost(S) = 10^(11 + 0.9*S + 0.055*S^2)
```

O Particle Synthesizer sempre gasta `100e9 J`. O custo acima e um requisito separado para receber o proximo SP; abaixo dele, a ativacao ainda ocorre, mas concede `0 SP`.

Quarks gerados por sintese:

```text
quarksGenerated = floor(energyAtSynthesis / 100e9)
```

Quantum Calculation Principles (com `Total Quarks Earned`, nao quarks disponiveis):

```text
raw = 0.015 * log10(1 + totalQuarksEarned)
bonus = raw <= 0.15 ? raw : 0.15 + 0.25 * (raw - 0.15)
algorithmUpgradeSpeed = 1 + min(0.30, bonus)
```

Quantum Superposition uses a capped logarithmic fraction of newly earned Improvement progress:

```text
retention = min(0.10, 0.01 * log10(1 + totalQuarksEarned))
nextMultiplier = exp(previouslyPreservedLog + newlyEarnedLog * retention)
```

Previously preserved log progress remains unchanged, so later Algorithm Upgrades do not reapply retention to old carryover.

Quarks possuem capacidade segura de `1` antes da primeira sintese. Apos a primeira Particle Synthesis, o jogador comeca com uma Quarks Cage que guarda `10` quarks. Cada cage adicional aumenta a capacidade em mais `10`; cages adicionais sao resetadas por Particle Synthesis:

```text
quarkCapacity = quarkCages > 0 ? 10 * quarkCages : 1
quarkCageCost = 10^(11 + quarkCages) J
```

Quark decay so afeta `Available Quarks`, nao `Total Quarks Earned`:

```text
if availableQuarks <= quarkCapacity:
  quarkDecay = 0
else:
  overflowRatio = (availableQuarks - quarkCapacity) / quarkCapacity
  quarkDecay = 0.12 * quarkCapacity * overflowRatio^1.7
```
