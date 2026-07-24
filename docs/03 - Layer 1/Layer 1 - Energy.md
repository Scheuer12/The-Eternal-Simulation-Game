---
type: layer
status: in-development
layer: 1
resource: Stored Energy
---

# Layer 1 - Energy

## Recurso

`Stored Energy`, medida em Joules (`J`), e coletada pelo `Cosmic Radiation Condenser` e estabilizada por `Power Cells`.

Power Cells nao sao hard cap. Elas definem capacidade estavel. Energia acima dessa capacidade continua utilizavel, mas fica instavel e decai por segundo em ritmo crescente conforme o excesso aumenta.

## Progressao atual

1. Encontrar e ativar o `Cosmic Radiation Condenser`.
2. Reativar o `Soft Display`.
3. Executar `Algorithm Improvements`.
4. Reativar o `Auto Calculator`.
5. Restaurar `T2 Soft Display` para decompor a producao atual.
6. Completar `Algorithm Upgrades` manualmente quando houver Improvements suficientes.
7. Completar `Calculation Method Upgrades` depois de varios Algorithm Upgrades.
8. Desbloquear `Power Cells` depois de `Soft Display + 3 Algorithm Upgrades`.
9. Completar `Setup Optimizations` depois de varios Method Upgrades.
10. Pesquisar `CRC Blueprint` depois de cruzar `10 J` de pico.
11. Construir CRCs adicionais com custo escalonado.
12. Comprar Processors adicionais para melhorar eficiencia de devices.
13. Instalar o `Overclocker` quando houver estrutura suficiente para queimar energia por velocidade.

## Devices

### Cosmic Radiation Condenser

Produz `1e-12 J` de Usable Energy por tick conceitual de `1s`. O jogo comeca com um CRC ativo.

Requisito para novos CRCs: `CRC Blueprint`.

### Soft Display

Mostra producao de energia, capacidade de Power Cell, ocupacao de capacidade e decaimento de overflow.

Requisito: nenhum.

### T2 Soft Display

Desbloqueia a aba `Measure`, onde o output atual e decomposto em base total dos CRCs e contribuicoes ativas de Algorithm Improvements, Algorithm Upgrades e outros modificadores reais de producao.

Requisito: `Soft Display`.

Custo: `2 J`.

### Auto Calculator

Automatiza Algorithm Improvements. O primeiro roda Improvements `2x` mais rapido que o manual; compras adicionais dobram novamente a velocidade.

Requisito: nenhum.

### Processor

Melhora eficiencia de sistemas computacionais e de fabricacao em `15%` multiplicativo por compra. Afeta Auto Calculators, Overclocker e tempos de fabricacao/construcao quando conectados; nao aumenta diretamente a producao de energia do CRC.

Requisito: nenhum.

### Overclocker

Consome energia excedente acima da capacidade estavel por segundo para acelerar Auto Calculators enquanto estiver engajado pelo Processor. A intencao de balance e ser uma rajada curta: muita velocidade por poucos segundos, com consumo por segundo crescendo exponencialmente durante a propria ativacao. Cada segundo extra deve exigir proporcionalmente muito mais energia excedente. Compras adicionais expandem o overclock, mas o consumo de energia escala muito mais rapido que a velocidade ganha. Desliga automaticamente quando o excedente nao sustenta o consumo.

Requisito de visibilidade: `3 Processors + 3 Power Cells`.

Custo inicial: `2 J`, com crescimento exponencial por compra.

### Power Cell

Adiciona `1 J` de capacidade estavel por celula regular. Pode ser comprada individualmente ou em `Buy Max` para estabilizar todas as celulas acessiveis com a energia atual.

Requisito: `Soft Display + 3 Algorithm Upgrades`.

O custo escala sem teto de multiplicador: as primeiras celulas devem ser alcancaveis, mas capacidade estavel comum continua ficando progressivamente mais cara no longo prazo.

### Power Module

A cada grupo completo de `100 Power Cells`, a facility pode instalar um `Power Module`. As celulas nao sao consumidas; o modulo ativa circuitos de captacao e conducao ao redor do conjunto, aumentando a capacidade estavel efetiva das Power Cells.

Efeito inicial de balance: capacidade estavel `x1.35` por Power Module.

Requisito do proximo modulo: `(powerModules + 1) * 100 Power Cells`.

Custo inicial: `100 J`, com crescimento exponencial por modulo.

### Overclocker - planejamento

Device planejado para depois da primeira interacao relevante com Power Cells. Deve consumir energia excedente por segundo para acelerar Auto Calculators em rajadas curtas, com custo marginal por segundo cada vez pior conforme o tempo ativo sobe.

Intencao: transformar capacidade armazenada em decisao temporal. Primeiro o jogador aprende capacidade estavel; depois escolhe quando queimar energia para acelerar estudos.

## Studies

### Algorithm Improvement

Melhora produtividade do CRC. Primeiras conclusoes tem impacto pesado; depois o ganho cai rapidamente ate a regiao de `5%`, desacelera a queda e nunca fica abaixo de `2.5%`.

### Algorithm Upgrade

Dobra produtividade do CRC e reseta Algorithm Improvements.

Requisito inicial: `10 Algorithm Improvements`; sobe `+5` por conclusao.

### Calculation Method Upgrade

Reduz a penalidade da formula de efeito dos Algorithm Improvements e reseta estudos.

Requisito inicial: `5 Algorithm Upgrades`; sobe `+5` por conclusao.

### Setup Optimization

Substitui o antigo Compression Protocol. Reduz a carga efetiva usada dentro da formula exponencial de tempo dos Algorithm Improvements e reseta energia, estudos e hardware, exceto Power Cells. A UI mostra o impacto na curva de penalidade, nao um multiplicador simples aplicado ao tempo final.

Requisito inicial: `2 Calculation Method Upgrades`; sobe `+2` por conclusao.

## Particle Laboratory

A porta do `Particle Laboratory` abre quando `peakEnergy >= 100 J`. A porta nao consome energia; ela e uma recompensa narrativa e troca a antiga barra de porta por um painel interno.

Dentro do laboratorio, um painel central fraco mostra `Particle Sintetizer` e uma barra `Activate Particle Sintetizer`.

Meta de ativacao: `100 GJ = 100e9 J`.

Na versao atual, ativar o sintetizador consome `100 GJ` de Stored Energy e marca o equipamento como ativo, preparando a transicao futura para a proxima layer.

## Foreshadowing

O `SIMULATION RECORD - 14.3 BILLION YEARS` e a rota do `Particle Laboratory` permanecem como sinais textuais discretos.

Relacionados: [[Core Formulas]], [[MVP-0 Balance Baseline]], [[Game Dev Best Practices]].
