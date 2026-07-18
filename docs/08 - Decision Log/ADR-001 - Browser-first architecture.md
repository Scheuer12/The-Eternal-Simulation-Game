---
type: adr
status: accepted
date: 2026-07-17
---

# ADR-001 - Browser-first architecture

## Contexto

Python era a linguagem mais familiar ao criador, mas existe intenção de publicar o jogo na Play Store futuramente.

## Decisão

Usar HTML, CSS e JavaScript puro para o runtime do jogo. Usar Python para balanceamento e simulações.

## Motivos

- execução sem backend;
- publicação web simples;
- interface responsiva nativa;
- caminho direto para empacotamento Android;
- acesso nativo ao armazenamento local;
- ausência de framework e build obrigatório no MVP.

## Consequências

- parte do projeto exige familiaridade crescente com JavaScript;
- lógica e UI devem permanecer separadas;
- parâmetros precisam ser legíveis por JavaScript e Python;
- bibliotecas de números incrementais poderão ser introduzidas quando a escala superar `Number`.

