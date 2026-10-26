# Arquivo de Estratégias de Balanceamento e Economia (Memória Local)

Este documento registra formalmente a evolução das regras de cálculo de velocidade dos **Auto Calculators** e **Processors**, os problemas matemáticos diagnosticados, a estratégia descartada e a nova estratégia adotada em outubro de 2026.

---

## 1. Lógica Anterior (V1: Compounding Exponencial em Torre) — *Arquivada*

### Formulação Matemática:
$$E_P = (1 + u_P)^P$$
$$u_P = \text{baseBonus} \cdot 1.2^M \cdot D(S) \cdot O_{\text{eff}}$$
$$u_{\text{calc}} = \text{baseCalcBonus} \cdot D(S) \cdot E_P$$
$$V_A = (1 + u_{\text{calc}})^C$$

* Onde:
  * $C$: quantidade de Auto Calculators
  * $P$: quantidade de Processors
  * $M$: quantidade de CMUs (Calculation Method Upgrades)
  * $S$: quantidade de Setup Optimizations ($D(S) = 1 + 2 \ln(1 + S)$)
  * $O_{\text{eff}}$: multiplicador de Overclocker
  * $\text{baseCalcBonus} = 0.5$
  * $\text{baseBonus} = 0.08$

### Diagnóstico do Problema (Salto de $50 \times 10^{-3}\text{ J}$ para $10 \times 10^6\text{ J}$):
* A fórmula continha uma **torre super-exponencial**: a eficácia agregada dos Processors ($E_P$) entrava multiplicando a base unitária do Calculator ($u_{\text{calc}}$), e esse valor somado a 1 era então **elevado à potência $C$** ($C$ calculadoras).
* Quando o jogador alcança $S = 1$ ($D(1) \approx 2.386$) e $M = 2$ ($1.2^2 = 1.44$):
  $$u_P = 0.08 \times 1.44 \times 2.386 \approx 0.275$$
  Com $P = 15$ processadores:
  $$E_P = (1.275)^{15} \approx 38.6$$
  E a base do Auto Calculator tornava-se:
  $$u_{\text{calc}} = 0.5 \times 2.386 \times 38.6 \approx 46.0$$
  Ao possuir $C = 6$ calculadoras:
  $$V_A = (1 + 46.0)^6 = 47^6 \approx 10.775.144.700\times \text{ velocidade!}$$
  Com $C = 10$:
  $$V_A = 47^{10} \approx 5.2 \times 10^{16}\times!$$
* **Consequência**: A velocidade dos estudos de melhoria atingia bilhões de melhorias por segundo. Dezenas de Algorithm Upgrades completavam-se instantaneamente, multiplicando a produção de energia por $2^U$ ($2^{30} \approx 10^9$). A energia saltava de milijoules para megajoules em poucos minutos, anulando todo o sentimento de progressão gradual.

---

## 2. Estratégia Alternativa Avaliada e Descartada (Nerf no Buff de 1.5x para 1.025x)

### Proposta:
Manter a estrutura $(1 + u_{\text{calc}})^C$, mas reduzir a base unitária de $0.5$ (+50%) para $0.025$ (+2.5%), abaixando também os custos dos calculadores.

### Razões para Descarte:
1. **Ineficácia Matemática contra o Root Cause**:
   * O problema fundamental não é o $0.5$, mas o fato de que $E_P$ multiplica a base e depois é elevado a $C$.
   * Mesmo com $\text{base} = 0.025$, quando $E_P \approx 200$ e $D(S) \approx 2.4$, $u_{\text{calc}} = 0.025 \times 2.4 \times 200 = 12$.
   * $(1 + 12)^C = 13^C$. Com $C = 10$, $13^{10} \approx 1.37 \times 10^{11}\times$! O jogo continua explodindo.
2. **Destruição do Early Game**:
   * Na primeira run (sem processadores e sem CMUs), cada calculadora daria apenas $+2.5\%$ de velocidade.
   * Comprar 5 calculadoras daria $1.025^5 = 1.13\times$ (apenas 13% mais rápido). A automação inicial pareceria insignificante, lenta e desanimadora.

---

## 3. Estratégia Escolhida e Implementada (V2: Modelo de Threads Paralelas Lineares) — *Ativa*

### Conceito Temático e Mecânico:
* Cada **Auto Calculator** atua como uma **thread / core de computação paralelo**.
* $C$ calculadoras executam $C$ fluxos paralelos de pesquisa de melhoria de algoritmos.
* O throughput do parque de calculadoras escala linearmente com $C$ ($1, 2, 3, \dots, C$ threads de processamento).
* Os **Processors** controlam a frequência de ciclo / eficiência de clock de todas as threads simultaneamente:
  $$V_A = C_{\text{eff}} \cdot E_P$$
  * Onde $C_{\text{eff}} = C \cdot \text{ThreadBonus}$ (com $\text{ThreadBonus} = 1.0$ base, ou $1.4$ com perk de ciência).
  * $E_P = (1 + u_P)^P$.
* Se $C = 0$: $V_A = 1$ (modo manual).

### Fortalecimento dos Processadores:
* Como $E_P$ agora multiplica o throughput linearmente e não mais dentro da base exponencial de $C$, os processadores puderam ser fortalecidos sem perigo de quebrar o jogo:
  * $\text{baseBonus}$ dos Processors elevado de $0.08$ para $0.12$ (+12% de eficiência base por core).

### Curva de Preço Rebalanceada para Frota Contínua:
* A curva exponencial de preço do Auto Calculator foi suavizada para permitir a montagem gradual de frotas de 10 a 25 cores ao longo da era:
  * `baseCost`: $1.2 \times 10^{-7}\text{ J}$
  * `costGrowth`: $3.2$ (anteriormente era $60$)
  * `costGrowthExponent`: $1.08$ (anteriormente era $1.25$)

### Comportamento Resultante:
* Com $C = 12, P = 15, S = 1, M = 2$:
  * $u_P \approx 0.412 \implies E_P \approx 174\times$.
  * $V_A = 12 \times 174 \approx 2.088\times$.
  * Em vez de $10^{23}\times$, a velocidade fica em $\approx 2.000\times$, proporcionando cadência rápida e estável que avança centenas de melhorias sem pular ordens astronômicas de grandeza em segundos.
