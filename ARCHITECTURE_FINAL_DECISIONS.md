# The Eternal Simulation — Decisões Finais de Arquitetura

> Documento de referência das decisões arquiteturais já estabelecidas para a evolução do jogo. Não substitui a implementação atual nem autoriza uma reescrita automática.

## 1. Princípio central

O jogo será organizado como um conjunto de peças reutilizáveis:

```text
Config / Content SSoT
        |
Layers -> Effect Packages -> EffectRegistry -> EffectEngine
        |                                      |
     GameState -------------------------> StatResolver
                                               |
                              componentes solicitam stats calculadas
```

Config define o que existe e como funciona. `GameState` define o que o jogador possui. Layers agrupam conteúdo. Efeitos conectam origens e atributos por IDs. A engine resolve os valores. Commands alteram o estado. A UI apenas apresenta valores e envia intenções.

## 2. SSoT e separação de responsabilidades

### Configuração

JSON ou equivalente versionado será a fonte única para conteúdo e parâmetros imutáveis:

- IDs de Devices, Studies, Perks e Layers;
- custos, requisitos, condições de visibilidade e compra;
- parâmetros de fórmulas;
- `targetStatId`, operações, prioridades e pipelines de efeitos;
- textos e metadados de conteúdo quando apropriado.

Configuração não guarda progresso e não deve conter JavaScript arbitrário executável.

### Estado

`GameState` é a fonte única do estado persistente da partida:

- recursos e quantidades possuídas;
- componentes comprados ou ativados;
- estudos, upgrades e perks adquiridos;
- discoveries, timestamps, progresso ativo e dados de prestígio;
- estatísticas persistentes necessárias ao design.

Valores derivados, como multiplicadores e produção final, não são fonte de verdade persistente. São recalculados a partir de Config + GameState, com cache descartável quando houver benefício medido.

### Cálculo

Equações especializadas ficam em funções puras ou em um futuro `FormulaRegistry`. A `EffectEngine` executa operações e compõe efeitos de forma determinística; ela não deve conter uma lista hardcoded de todos os Devices ou Perks.

## 3. Layers

As Layers são unidades de organização de conteúdo e de ciclo de vida, por exemplo:

- `EnergyLayer`;
- `ScienceLayer`;
- `ParticlesLayer`.

Uma Layer pode ser uma classe ou provider quando isso ajudar a organizar hooks como entrada, reset ou prestígio. Layers não importam diretamente umas às outras para buscar bônus ou manipular estado alheio.

Uma Layer publica definições de efeitos. O bootstrap reúne esses pacotes no registro central. Assim, uma Layer futura pode afetar uma stat existente por ID sem exigir edição no consumidor original.

## 4. Classes e objetos

### Regra geral

Não haverá uma classe específica para cada CRC, Processor, Power Cell, Study ou Perk. Isso criaria muitas classes triviais e não resolveria as relações entre entidades.

O modelo será:

```text
Device  -> classe genérica / contrato
Study   -> classe genérica / contrato
Perk    -> definição declarativa / contrato

CRC, Processor, Power Cell -> instâncias/configurações de Device
Algorithm Improvement      -> instância/configuração de Study
Science Perks               -> definições de Perk com efeitos
```

As definições declarativas são os dados que tornam cada componente diferente. O runtime genérico fornece estado, enablement, custos, requisitos e integração com efeitos.

### Quando uma classe especializada é válida

Uma classe ou behavior específico só será criado quando houver comportamento próprio com identidade ou ciclo de vida relevante, como:

- ativação e desligamento;
- consumo progressivo;
- cooldown;
- hooks de reset ou prestígio;
- transação especial que não seja apenas uma fórmula.

O Overclocker é o exemplo de comportamento que pode justificar um `OverclockBehavior` especializado. Um Perk que apenas adiciona um multiplicador não precisa de uma classe exclusiva.

Esse é o princípio de composição sobre herança: reutilizar contratos, dados e behaviors, em vez de construir uma hierarquia extensa.

## 5. Effects: relação entre Layers e objetos

A relação planejada é N:N:

```text
ScienceLayer -> pacote de efeitos declarativos -> targetStatId
EnergyLayer  -> pacote de efeitos declarativos -> targetStatId
ParticlesLayer -> pacote de efeitos declarativos -> targetStatId
```

O consumidor não precisa saber qual Layer fornece cada bônus. Um CRC solicita, por exemplo:

```js
resolve("devices.crc.productionRate")
```

O `EffectRegistry` indexa definições por `targetStatId`. A `EffectEngine` filtra efeitos ativos, resolve argumentos, aplica a composição configurada e pode produzir um breakdown rastreável.

O desenho discutido como:

```text
Class Science -> Effects Package JSON -> Class Any <- Effect Engine
```

é mantido, com o Registry como intermediário. `Any` representa um componente ou stat de qualquer Layer, sem acoplamento direto a uma classe concreta.

## 6. Pipeline de efeitos

A composição é centralizada e determinística. A política padrão é:

1. fórmula base;
2. adições;
3. multiplicadores;
4. potências;
5. logs, somente quando declarados para transformar o acumulador;
6. softcaps, hardcaps e floors, quando fizerem parte da regra;
7. overrides condicionais com prioridade explícita.

A ordem pode ser específica por stat. Dentro de uma fase, prioridade e depois `effectId` determinam o desempate.

Operações de efeito e ações de jogo permanecem separadas:

- `mult`, `add`, potência, log e caps são efeitos aritméticos;
- compra, unlock, transferência de recurso, reset, prestígio e preservação são Commands ou event hooks.

O breakdown de um valor deve ser derivado pela engine, não mantido manualmente pela UI. Isso permitirá mostrar futuramente quanto cada bônus contribui para a produção ou velocidade.

## 7. Serviços e responsabilidades principais

| Componente | Responsabilidade |
|---|---|
| `ConfigLoader` | Carregar e validar configuração versionada |
| `GameState` | Manter o estado persistente da partida |
| `LayerProvider` | Agrupar conteúdo e publicar definições |
| `EffectRegistry` | Indexar efeitos por atributo de destino |
| `EffectEngine` | Executar e compor efeitos |
| `FormulaRegistry` | Registrar fórmulas puras especializadas |
| `StatResolver` | Resolver dependências, detectar ciclos e produzir trace |
| `NumericAdapter` | Isolar BigNum, comparação, persistência e formatação |
| `CommandEngine` | Validar e aplicar transições de estado |
| `SimulationRunner` | Simular progressão sem UI |
| `SaveManager` | Persistir, normalizar e migrar saves |
| `OfflineSimulator` | Reproduzir progressão offline usando as mesmas regras |
| `UI` | Renderizar view models e enviar comandos |

## 8. Números grandes

Quantidades econômicas podem alcançar expoentes extremamente grandes. O projeto usa `break_eternity.js` por trás de um adaptador próprio (`NumericAdapter`/módulo numérico).

Regras decididas:

- não representar recursos gigantes como `Number` nativo;
- não persistir grandes quantidades como números JSON comuns;
- manter mantissa/expoente dentro da abstração BigNum;
- centralizar comparação, operações, serialização e notação;
- não converter energia armazenada gigante para `Number` apenas para calcular recompensas ou produção.

## 9. Runtime atual e direção de evolução

A implementação atual usa HTML, CSS responsivo, JavaScript ES modules, JSON de configuração, `localStorage`, Node test runner e Python para simulação. As fronteiras atuais são:

- parâmetros: `config/game-config.json`;
- fórmulas: `js/formulas.js`;
- estado: `js/state.js`;
- regras e ações: `js/engine.js`;
- persistência: `js/save-system.js`;
- renderização: `js/ui.js`;
- efeitos: `js/effect-system.js`;
- simulação: `simulation/`.

A evolução para as abstrações acima deve ser incremental. Não haverá reescrita total sem auditoria e equivalência comportamental. O código existente será reorganizado por fronteiras, preservando saves, regras e compatibilidade quando necessário.

## 10. Offline, saves e UI

Offline progress usa replay acelerado do engine, não apenas `produção × tempo`. Toda nova automação ou ciclo contínuo deve ser refletido no simulador offline, salvo decisão explícita em contrário.

Saves armazenam estado persistente e metadados necessários ao cálculo offline. Enablement, custos atuais e valores derivados são recalculados no carregamento.

A UI não reimplementa fórmulas. Ela consulta snapshots/view models e envia comandos. Medidas detalhadas de produção devem usar o breakdown produzido pelo sistema de efeitos.

## 11. Critério de reutilização

O objetivo de criar peças de Lego é reduzir alterações espalhadas e permitir reaproveitar a estrutura macro em jogos incrementais semelhantes. O reuso será obtido por:

1. runtime compartilhável;
2. `GamePackage` declarativo para conteúdo;
3. estado de partida separado;
4. behaviors/plugins para exceções com comportamento próprio.

Um novo jogo deverá ser composto por definições, fórmulas registradas e behaviors necessários. O runtime só deve ser extraído como framework independente depois que um segundo jogo confirmar quais contratos são realmente comuns.

## 12. Resumo final

Não será criada uma classe para cada objeto do jogo. Serão criados contratos genéricos, definições declarativas e behaviors especializados quando justificados.

Layers publicam efeitos; o Registry localiza efeitos; a EffectEngine calcula; o StatResolver rastreia dependências; Commands alteram o estado; a UI apresenta; Config e GameState permanecem fontes de verdade separadas.

Essa é a estrutura planejada para tornar Devices, Studies, Perks e futuras Layers reorganizáveis, rastreáveis e reutilizáveis sem transformar cada novo conteúdo em uma nova classe ou em imports cruzados entre sistemas.
