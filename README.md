# Qual bateria, para qual função e lugar

Ferramenta da **Teiu Energia** que compara três tecnologias de armazenamento: **lítio (LFP)**, **chumbo-ácido** e **fluxo de vanádio**. A comparação é feita em três funções:

- ciclo diário e corte de pico;
- reserva longa;
- no-break no ponto de carga.

Para cada combinação, a ferramenta calcula:

- **Custo de ciclo de vida em 30 anos:** investimento, operação, trocas, perdas e valor residual. Mostra também o custo total dividido pelo investimento.
- **Tempo parado:** falhas × tempo até o conserto com a mão de obra do lugar, mais o atraso na troca da bateria.
- **Energia crítica perdida, carbono, resíduo tóxico em risco e risco de acidente.**
- **Chance de cada combinação ser a melhor:** 20 mil simulações (1.000 conjuntos de premissas × 20 conjuntos de pesos, método SMAA), com a margem do sorteio ao lado de cada número.
- **Por que ela ganha da segunda opção:** critério por critério, com o confronto direto entre as duas e o aviso de empate técnico quando for o caso.

Lugares de exemplo, todos ajustáveis:

- comunidade quilombola isolada;
- comunidade quilombola em ponta de linha;
- aldeia indígena isolada;
- comunidade de ilha ou ribeirinha;
- comunidade sertaneja em ponta de linha;
- vila turística conectada;
- pequeno centro urbano;
- hospital regional.

**Aba "Emergência climática"** (https://bonaldorp.github.io/calculadora-baterias/#emergencia): dimensiona o sistema para a rede fora do ar por 1, 3, 7 ou 15 dias. As cargas entram em seis blocos (residências afetadas, saúde e hospitais, segurança e vigilância, defesa civil, indústria, refrigeração e mercado), e cada linha é marcada como essencial, adicional ou desligada. A aba mostra:

- a energia que a bateria precisa entregar, com e sem solar funcionando durante a emergência;
- a capacidade nominal e o investimento em lítio, chumbo e vanádio para cada duração;
- a comparação com um gerador a diesel: litros, custo do combustível e CO₂;
- um gráfico de dias sem rede × capacidade necessária, que responde ao que está marcado nos blocos (só o essencial, essencial + adicional e o efeito do solar);
- uma tabela de 30 anos com custo e CO₂ de bateria, diesel e da combinação de bateria para 1 dia com gerador;
- por quantos dias o sistema montado na aba de comunidades (reserva longa, com e sem o ciclo diário) seguraria esta emergência;
- um botão que leva a carga essencial e a meta de dias para a aba de comunidades, onde a reserva passa a ser dimensionada por essa meta.

Diesel: preço das pesquisas semanais da ANP (2026), consumo de tabelas de fabricantes de grupos geradores, preço do gerador pelo SINAPI. Manutenção do gerador, testes semanais e troca em 30 anos são hipóteses. A emissão conta só a queima do diesel.

**Aba "Minha casa"** (https://bonaldorp.github.io/calculadora-baterias/#casa): você lista os aparelhos da residência, informa consumo e horas de uso e marca quais ficam ligados numa falta. A aba mostra:

- quanto tempo a bateria aguenta, com e sem solar no telhado, para a hora em que a falta começa;
- que tamanho de bateria segura o essencial pelo tempo desejado, nas três tecnologias;
- a curva de carga em 72 horas;
- cada aparelho sozinho: parte do consumo da casa e autonomia ligado sem parar e no uso típico.

A lista de aparelhos fica guardada só no navegador de quem usa.

**Outros recursos:**

- link que reabre o mesmo cenário ("Copiar link deste cenário");
- impressão ou PDF em versão clara;
- "O que muda a escolha": cada mudança testada pode ser aplicada ao cenário com um clique;
- gráficos com leitura ao passar o mouse ou tocar;
- desenho do sistema e gráficos adaptados ao celular.

**Acesse:** https://bonaldorp.github.io/calculadora-baterias/

## Leia antes de usar

Preços, taxas de falha, tempos de conserto, chances de acidente e frações de resíduo que escapam da reciclagem são **hipóteses de partida**, não medições. Não há base pública de falhas de baterias estacionárias no Brasil. A ferramenta serve para comparar opções e ver o que muda a escolha. Não serve para dimensionar um projeto.

## Arquivos

- `index.html`: a ferramenta. É uma página única que roda no navegador, sem servidor.
- `modelo/model.js`: o modelo usado pela página.
- `modelo/mcda.py`: a mesma conta em Python.

## Método

Teiu Energia (2026), *Case Maraú: armazenamento híbrido para resiliência energética*, seção "Modelo de decisão".

### O que mudou no modelo na versão 4.0

- **Folga para o fim da vida.** A bateria é dimensionada para entregar a energia útil até o último ano: 25% a mais no lítio e no chumbo (fim de vida a 80% da capacidade, como na IEEE 485 para o chumbo) e 11% a mais no vanádio (a capacidade volta com o rebalanceamento do eletrólito, mas cai entre um serviço e outro).
- **Oscilação térmica.** O envelhecimento usa a temperatura média do abrigo e a oscilação ao longo do dia. Como o efeito do calor é convexo, oscilar em torno da média encurta a vida mais do que ficar nela.
- **Sorteios simétricos.** As premissas incertas são sorteadas em escala logarítmica: metade e dobro têm a mesma chance, e o valor central é a mediana.
- **Energia perdida nas demais cargas.** Critério novo, só para sistema isolado: o que a comunidade deixa de receber quando a bateria do dia a dia para.
- **Teste de método.** Ao lado da soma ponderada, a página refaz a conta com o produto ponderado e avisa quando a recomendação muda.

Os resultados da versão 4.0 não são comparáveis aos das versões anteriores nem aos do relatório de novembro de 2026.

Fontes de contexto:

- Rede Energia & Comunidades / IEMA (2026), relatório sobre o Luz para Todos na Bahia.
- CONAQ (2026), nota técnica sobre o acesso à energia em comunidades quilombolas.

## Licença

[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt-br). O uso e a adaptação são livres, desde que a Teiu Energia seja citada.

Versão 5.2, novembro de 2026.
