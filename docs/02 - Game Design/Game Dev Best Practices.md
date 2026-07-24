---
type: game-design-reference
status: active
---

# Game Dev Best Practices

Estas premissas guiam as decisoes de design de The Eternal Simulation. Elas nao substituem playtest; elas definem o que vamos testar primeiro.

## Progressao incremental

- O jogador deve sempre enxergar um proximo objetivo alcancavel, mesmo quando o jogo desacelera.
- Caps duros devem ser evitados no recurso principal quando bloqueiam feedback de progresso. Se um limite for necessario, preferir soft caps que continuem deixando o numero subir com eficiencia menor.
- Cada wall deve apontar para uma saida: novo sink, automacao, reset menor, melhoria de capacidade ou nova camada.
- Exponential costs funcionam melhor quando o efeito comprado e legivel imediatamente.

## Sinks e capacidade

- Um sink precisa comunicar o que consome e o que devolve. Power Cells consomem Stored Energy e devolvem capacidade estavel.
- Capacidade deve ser uma ferramenta de estabilidade, nao apenas uma tampa invisivel.
- Quando Stored Energy passa da capacidade estavel, a producao efetiva deve ser reduzida de forma gradual, com telemetria clara de retencao.
- A UI deve diferenciar raw production de retained production para evitar a sensacao de bug ou perda arbitraria.

## Reset layers

- Resets menores devem chegar depois de um ciclo completo de wall -> breakthrough, para parecerem conquista e nao punicao.
- O reset precisa preservar algo permanente e facil de entender.
- O jogador deve saber exatamente o que sera resetado antes de clicar.
- Multiplicadores permanentes podem acelerar a proxima subida, mas o jogo deve continuar oferecendo novas decisoes para nao virar apenas espera automatizada.

## UX de incremental textual

- Sistemas simples podem ser profundos se a organizacao visual for clara: resources, study loop, scaling, devices e ambient signals.
- Telemetria deve aparecer quando fizer sentido narrativo, como parte da restauracao do sistema.
- Informacoes criticas ficam visiveis; explicacoes ficam em tooltips curtas ou texto contextual.
- Elementos narrativos discretos podem sugerir camadas futuras sem competir com a decisao atual.

## Referencias usadas

- GameDeveloper, "The Math of Idle Games, Part III": prestige cria o efeito de subir novamente com mais poder e tambem ajuda a controlar crescimento numerico. https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii
- Solana Garden, "Idle Game Design Explained": idle/incremental depende de loops de producao, upgrades, automacao, sinks economicos e alternancia entre acumulacao e decisoes ativas. https://solana.garden/guides/game-idle-game-design-explained/
- Missions Zanx, "Idle Game Design: Systems, Mechanics, and Progression": progressao incremental combina automacao, upgrades em camadas, scaling e resets para manter planejamento de longo prazo. https://missionszanx.com/guides/idle-game-design-systems-mechanics-and-progression
- Steam Community / Idle Library patch notes: progress bars para prestige/ascension foram adicionadas para tornar progresso de resets visivel. https://steamcommunity.com/app/4450610/

## Decisao aplicada agora

Stored Energy nao usa mais hard cap na Power Cell. A Power Cell define `stable capacity`. Energia acima dessa capacidade permanece utilizavel, mas nova producao sofre retencao progressivamente menor. Power Cells extras aumentam capacidade estavel e funcionam como sink de progresso.
