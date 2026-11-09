# Qual bateria, para qual função e lugar

Ferramenta da **Teiu Energia** que compara três tecnologias de armazenamento: **lítio (LFP)**, **chumbo-ácido** e **fluxo de vanádio**. A comparação é feita em três funções:

- ciclo diário e corte de pico;
- reserva longa;
- no-break no ponto de carga.

Para cada combinação, a ferramenta calcula:

- **Custo de ciclo de vida em 30 anos:** investimento, operação, trocas, perdas e valor residual. Mostra também o custo total dividido pelo investimento.
- **Tempo parado:** falhas × tempo até o conserto com a mão de obra do lugar, mais o atraso na troca da bateria.
- **Energia crítica perdida, carbono, resíduo tóxico em risco e risco de acidente.**
- **Chance de cada combinação ser a melhor:** milhares de sorteios dos pesos de cada lugar e das premissas incertas (método SMAA).

**Acesse:** https://bonaldorp.github.io/calculadora-baterias/

## Leia antes de usar

Preços, taxas de falha, tempos de conserto, chances de acidente e frações de resíduo que escapam da reciclagem são **hipóteses de partida**, não medições. Não há base pública de falhas de baterias estacionárias no Brasil. A ferramenta serve para comparar opções e ver o que muda a escolha. Não serve para dimensionar um projeto.

## Arquivos

- `index.html`: a ferramenta. É uma página única que roda no navegador, sem servidor.
- `modelo/model.js`: o modelo usado pela página.
- `modelo/mcda.py`: a mesma conta em Python, usada no relatório.

## Método

Teiu Energia (2026), *Case Maraú: armazenamento híbrido para resiliência energética*, seção "Modelo de decisão".

Fontes de contexto:

- Rede Energia & Comunidades / IEMA (2026), relatório sobre o Luz para Todos na Bahia.
- CONAQ (2026), nota técnica sobre o acesso à energia em comunidades quilombolas.

## Licença

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt-br). O uso e a adaptação são livres, desde que a Teiu Energia seja citada.

Versão 1.0, novembro de 2026.
