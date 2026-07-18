---
type: formulas
status: approved-for-test
source: config/game-config.json
---

# Core Formulas

Os valores abaixo formam uma baseline de playtest, não um balanceamento definitivo.

## Algorithm Improvement — onboarding

Para `n < 15` Improvements concluídos:

```text
b(n) = 0.05 + (9.00 - 0.05) × (1 - n/15)^1.55
```

Cada conclusão multiplica a produção por `1 + b(n)`.

O primeiro bônus é `+900%`. O 15º leva a produção-base acumulada para aproximadamente `1.05e-3 J/s`. O 16º Improvement usa a baseline de `+5%`.

## Algorithm Improvement — após a baseline

Para `n ≥ 15`:

```text
b(n) = 0.05 / (1 + (n - 15)/40)^0.65
```

Cinco por cento não é piso. O valor continua caindo lentamente e tende a zero, preparando o sistema para frequências futuras de muitos ciclos por segundo.

## Duração do Study

```text
t(n) = 7 × (1 + 0.08 × n^1.5) segundos
```

Modificadores multiplicativos:

- Auto Calculator: `÷ 2`;
- CRC Blueprint: `× 0.65`;
- Processor: `× 0.90` para atividades de Device.

Multiplicadores evitam durações negativas e permitem composição previsível.

## Chance de Algorithm Upgrade

Chance bruta:

```text
p(u) = 0.10 / (1 + 0.75u)^1.15
```

Camadas aprovadas:

- softcap em `1%`;
- hardcap de desaceleração em `0.1%`;
- mínimo absoluto em `0.01%`.

Quando a chance atravessa um cap, uma potência fracionária desacelera sua queda. Cada Upgrade multiplica a produção por 2.

## Números

O MVP utiliza `Number` do JavaScript, suficiente para a escala atual. Toda matemática está isolada em `js/formulas.js`, permitindo migração posterior para uma representação de números incrementais acima de `1e308`.

