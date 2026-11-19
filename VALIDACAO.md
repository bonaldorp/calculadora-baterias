# Como este modelo é validado

Este documento descreve o método de validação da calculadora "Qual bateria, para qual função e lugar", o que ele já cobre e o que ainda falta. A validação é feita em cinco níveis. Os dois primeiros estão automatizados e rodam a cada versão; os outros três dependem de dados e de pessoas de fora e entram por etapas.

## Situação em 19/11/2026 (versão 5.7)

| Nível | Pergunta | Situação |
|---|---|---|
| 1 | O código faz a conta que o método descreve? | Automatizado: 16 testes, todos passam |
| 2 | O resultado se repete quando o sorteio é refeito? | Automatizado: 16 testes, todos passam |
| 3 | Os parâmetros batem com dado medido? | Parcial: fontes citadas, sem conferência de campo |
| 4 | O modelo bate com ferramentas e casos reais? | Não feito |
| 5 | Os pesos e as conclusões fazem sentido para quem decide? | Parcial: teste de método feito, consulta não feita |

## Como rodar

```
node modelo/validar.js
```

Leva cerca de 40 segundos e não precisa instalar nada. Com `--rapido`, pula a repetição do sorteio e leva cerca de 7 segundos. Se a máquina tiver `python3` com `numpy`, o teste do grupo 4 compara também com a segunda implementação (`modelo/mcda.py`); sem isso, ele é pulado e avisado na tela. O comando termina com erro se algum teste falhar.

**Regra de uso:** nenhuma versão é publicada com teste falhando. Quando um resultado muda de propósito (preço novo, regra nova), os valores de referência do grupo 5 são atualizados no mesmo envio, e a mudança é explicada aqui.

## Nível 1: o código faz a conta que o método descreve?

Grupos 1 a 4 do `validar.js`.

- **Cálculo à mão.** Um bloco de lítio de 100 kWh úteis e 50 kW, em 30 anos e a 8% ao ano, é calculado passo a passo dentro do próprio teste e comparado com o modelo. Resultado: R$ 283.175 de valor presente e 18,07 t de CO₂ nos dois.
- **Regras gerais.** Dobrar potência e energia dobra custos e impactos. Com taxa de desconto zero, o valor presente é igual à soma simples. O fluxo de caixa ano a ano fecha com o custo total. A vida útil nunca aumenta com temperatura, ciclos ou oscilação térmica.
- **Bateria da aba de emergência.** O tamanho calculado pela simulação hora a hora é comparado com um segundo método, o do maior déficit acumulado (pico sequente), em 225 cenários de consumo, solar e duração. Os dois dão a mesma resposta. Sem solar, a bateria é igual ao consumo dos dias pedidos.
- **Segunda implementação.** Os 72 blocos de bateria dos oito lugares (três funções × três tecnologias) são calculados em JavaScript e em Python. Custo, vida útil, carbono, resíduo e indisponibilidade saem idênticos.

Limite: as duas implementações têm o mesmo autor. O teste pega erro de programação, não erro de concepção.

## Nível 2: o resultado se repete?

Grupo 5 do `validar.js`.

O percentual de cada combinação vem de um sorteio de premissas e de pesos. Para cada um dos oito lugares, o teste confere que:

- a primeira opção e o percentual batem com o valor de referência (tolerância de 2 pontos);
- com outras cinco sementes de sorteio, a primeira opção é a mesma e o percentual varia no máximo 3 pontos.

Valores de referência da versão 5.7:

| Lugar | Primeira opção | % das simulações |
|---|---|---|
| Vila turística conectada | Lítio em tudo | 62 |
| Hospital regional | Lítio em tudo | 44 |
| Quilombola em ponta de linha | Lítio em tudo | 81 |
| Quilombola isolada | Lítio no ciclo, reserva de vanádio | 59 |
| Pequeno centro urbano | Lítio em tudo | 72 |
| Sertaneja em ponta de linha | Lítio em tudo | 67 |
| Aldeia indígena isolada | Lítio no ciclo, reserva de vanádio | 66 |
| Ilha ou ribeirinha | Lítio no ciclo, reserva de vanádio | 60 |

### Erro encontrado e corrigido na versão 5.7

Até a versão 5.6, o sorteio usava 1.000 conjuntos de premissas × 20 de pesos. A primeira rodada desta validação mostrou que, na comunidade sertaneja, a tela exibia 71% ± 2, enquanto a média de 30 sorteios independentes era 67,5%. A primeira opção era a mesma, mas o número estava fora da margem anunciada. Na aldeia indígena, a margem exibida (±1) era menor do que a variação real entre sorteios (cerca de ±2).

A versão 5.7 usa 2.500 conjuntos de premissas × 8 de pesos, com o mesmo total de 20 mil simulações. A variação entre sorteios cai de cerca de 1,0 para 0,6 ponto, e os oito percentuais publicados ficam a menos de 1 ponto da média de 30 sorteios. O cálculo fica cerca de duas vezes mais lento (menos de 1 segundo em um computador comum).

## Nível 3: os parâmetros batem com dado medido?

Preços, vida útil, eficiência e emissões têm fonte citada na página e no relatório. O que falta é conferir com medição de campo. Os parâmetros abaixo são hipóteses dos autores, sem fonte medida, e são os que mais pesam nos lugares remotos:

| Hipótese | Valor usado | Como validar |
|---|---|---|
| Tempo de conserto longe de técnico | ×5 no lítio, ×8 no vanádio, ×1,5 no chumbo | Entrevista com operadores de sistemas isolados; registros de chamados |
| Chance de atraso na troca | 50% quando a comunidade paga, 5% quando paga a distribuidora | Histórico de programas de eletrificação (trocas feitas × trocas vencidas) |
| Resíduo tóxico que escapa | 30% a 40% (lítio), 5% a 30% (chumbo), 2% a 5% (vanádio) | Dados de logística reversa por região |
| Teste do gerador a diesel | 30 minutos por semana, a meia carga | Rotina de hospitais e prefeituras |
| Oscilação térmica diária | ±3 °C no litoral, ±7 °C no sertão, ±1 °C climatizado | Medição em abrigos de baterias |

## Nível 4: o modelo bate com ferramentas e casos reais?

Ainda não feito. Em ordem de prioridade:

1. **Comparação com ferramenta consagrada.** Dimensionar dois ou três dos oito lugares no HOMER ou no REopt (NREL) e comparar tamanho da bateria e custo. Diferença de até 20% é esperada; acima disso, precisa de explicação.
2. **Casos com histórico.** Aplicar o modelo a sistemas isolados brasileiros com alguns anos de operação e conferir se ele prevê o que aconteceu, em especial a vida real das baterias de chumbo e as trocas que não foram feitas.
3. **Rede de Maraú.** Dimensionar com as interrupções de 2023 a 2025 e testar com as de 2026 (dados da ANEEL). Confirmar a topologia com a distribuidora e rodar fluxo de potência no ponto de conexão.

## Nível 5: os pesos e as conclusões fazem sentido para quem decide?

Os pesos dos critérios não têm valor certo, então não se validam com dado. O que se faz:

- **Teste de método (feito).** A página refaz a conta trocando a soma ponderada pelo produto ponderado e avisa quando a primeira opção muda. Nos três lugares sem rede ela muda: a soma indica reserva de vanádio e o produto indica lítio em dois blocos. Nesses lugares, as duas devem ser tratadas como candidatas.
- **Consulta (não feita).** Levantar os pesos com as comunidades, a distribuidora e o financiador. Em territórios quilombolas e indígenas, isso passa pela consulta livre, prévia e informada.
- **Revisão externa (não feita).** Leitura crítica do método por especialista em armazenamento e por especialista em análise multicritério.

## Registro

| Data | Versão | O que foi feito |
|---|---|---|
| 19/11/2026 | 5.7 | Criação do `validar.js` (32 testes). Correção do número de sorteios de premissas. |
