---
type: layer
status: in-development
layer: 1
resource: Stored Energy
---

# Layer 1 - Energy

## Recurso

`Stored Energy`, medida em Joules (`J`), é coletada pelo `Cosmic Radiation Condenser` e limitada pela `Power Cell`.

## Progressão do MVP-0

1. Ativar o CRC.
2. Usar `Manual Condensing`.
3. Executar `Algorithm Improvements`.
4. Descobrir `Algorithm Upgrades`.
5. Ativar o `Auto Calculator` próximo de `1e-3 J/s`.
6. Recuperar a `CRC Blueprint` por sorte ou threshold.
7. Construir o segundo CRC.
8. Instalar o `Processor`.

## Devices

### Cosmic Radiation Condenser

Produção-base: `1e-12 J/s`. Todos os CRCs recebem os modificadores globais.

### Auto Calculator

Automatiza Studies e divide sua duração por 2. Também desbloqueia a medição explícita de produção por segundo.

### Processor

Reduz em 10% o tempo de execução dos Devices conectados. No MVP-0, sua ativação marca o final do conteúdo jogável.

## Foreshadowing

O painel `SIMULATION RECORD — 14.3 BILLION YEARS` e a porta do `Particle Laboratory` permanecem visíveis sem explicação completa.

Relacionados: [[Core Formulas]], [[MVP-0 Balance Baseline]].

