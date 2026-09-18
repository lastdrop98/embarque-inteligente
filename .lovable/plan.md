# Plataforma de Mobilidade — próximos passos

## Situação actual

Já existem e funcionam: autenticação com papéis (admin, operador, motorista, passageiro), veículos, rotas com paragens ordenadas, passageiros e delegações, bilhetes com QR, ecrã do motorista com leitura de QR, painel operacional, mapas ao vivo, incidentes, notificações e registo de auditoria de papéis.

O **Painel Admin** e o **Painel do Passageiro** já foram criados no trabalho anterior. Falta confirmá-los a funcionar de ponta a ponta e ligá-los bem à navegação.

O documento novo descreve uma plataforma bastante maior. Proponho construí-la por fases, começando pelo que dá valor imediato.

## Fase 0 — Fechar o que está a meio (incluída já)

- Verificar e corrigir os painéis Admin e Passageiro (acesso, dados, mapa, avaliações, sino de notificações).
- Garantir que só administradores entram no Painel Admin.

## Fase 1 — Pedidos de transporte

- Novo registo "Pedido de transporte": origem, destino, data, hora, nº de passageiros, categoria, tipo de viatura, observações.
- Pedido para delegação inteira, grupo, passageiro individual ou independente.
- Estados: rascunho → submetido → em análise → aprovado → alocado → agendado.
- Ecrã de criação (operador) e ecrã de aprovação/alocação (admin/operador).

## Fase 2 — Manifesto dinâmico e ciclo da viagem

- Manifesto por viagem: lista de passageiros com categoria, delegação, QR e estado (previsto → embarcado → desembarcado → não compareceu).
- Contagem automática ao vivo: previstos, embarcados, em falta, desembarcados.
- Abrir embarque, fechar embarque (marca ausentes como "não compareceu"), partir, chegar, abrir desembarque, concluir.
- Leitura de QR também no desembarque, com as mesmas validações.

## Fase 3 — Reconciliação e excepções

- Comparação embarcados × desembarcados com alerta quando não bate certo, e lista de quem falta.
- Acções do operador: recusar passageiro, adicionar passageiro à viagem, transferir para outra viagem, registar excepção.

## Fase 4 — Command Centre e alertas

- Painel operacional reforçado: viagens programadas, em curso, concluídas, atrasadas, com incidentes, passageiros transportados, viaturas activas.
- Mapa ao vivo com estado por viatura e painel de alertas activos.
- Alertas automáticos a partir do GPS: paragem prolongada, atraso face ao previsto, desvio do corredor, excesso de velocidade.

## Fase 5 — Histórico, relatórios e auditoria

- Histórico por viagem: planeado vs. real (horas, passageiros, no-shows, distância, duração, incidentes).
- Relatórios: quem viajou, em que viatura, com que motorista, ocupação, viagens por delegação.
- Registo de auditoria completo de cada leitura de QR (passageiro, viagem, viatura, ponto, hora, GPS, quem leu).

## Notas técnicas

- Tudo assente na base de dados actual (Lovable Cloud), estendendo tabelas em vez de recriar: novas tabelas `pedidos_transporte`, `alertas`, `excepcoes_viagem`; novas colunas de tempos reais, distância e no-show onde faltarem.
- Regras de acesso por papel em todas as tabelas novas (admin vê tudo; operador gere; motorista só a sua viagem; passageiro só os seus bilhetes).
- Validações de QR sempre no servidor, com registo de cada tentativa.
- Interface em português, azul escuro e branco, mapas OpenStreetMap.

## O que faço agora

Executo a **Fase 0** e, se aprovares, sigo directo para a **Fase 1**. As fases seguintes ficam para mensagens seguintes, uma de cada vez, para manteres controlo e qualidade.
