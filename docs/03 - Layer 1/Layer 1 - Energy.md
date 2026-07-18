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

1. Encontrar o CRC.
2. Ler o briefing narrativo do `Cosmic Radiation Condenser`.
3. Ativar o CRC.
4. Reativar o `Soft Data Display` nos primeiros Improvements.
5. Executar `Algorithm Improvements`.
6. Descobrir `Algorithm Upgrades`.
7. Reativar o `Auto Calculator` ao acumular energia suficiente.
8. Recuperar a `CRC Blueprint` por descoberta rara ou por energia extrema.
9. Construir o segundo CRC.
10. Instalar o `Processor` ao acumular energia suficiente.

## Devices

### Cosmic Radiation Condenser

Produção-base: `1e-12 J/s`. Todos os CRCs recebem os modificadores globais.

### Soft Data Display

Exibe telemetria leve: produção por segundo, estimativa de enchimento da Power Cell e energia total condensada. Não altera produção; torna a progressão legível.

### Auto Calculator

Automatiza Studies e divide sua duração por 2. Também desbloqueia a medição explícita de produção por segundo.

Trava: apenas custo em `Stored Energy`.

### Processor

Reduz em 10% o tempo de execução dos Devices conectados. No MVP-0, sua ativação marca o final do conteúdo jogável.

Trava: apenas custo em `Stored Energy`.

## Foreshadowing

O `SIMULATION RECORD — 14.3 BILLION YEARS` e a rota do `Particle Laboratory` permanecem como sinais textuais discretos, visíveis sem explicação completa.

Relacionados: [[Core Formulas]], [[MVP-0 Balance Baseline]].
