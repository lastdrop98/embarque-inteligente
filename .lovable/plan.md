# Etapa grande: mobile-first, notificações certas e fluxo operacional

Uma única implementação coesa, feita por cima do que já existe. Nada de páginas novas paralelas, nada de refazer QR, GPS ou pedidos.

## 1. Notificações com destinatário certo (base de tudo)

Uma migração cria **uma única função central no servidor** que decide quem recebe cada aviso, em vez de cada ecrã inserir avisos à sua maneira:

- `notificar_evento(tipo, referência)` — função segura que calcula os destinatários a partir dos dados reais:
  - administradores: tudo o que é operacional
  - operadores: pedidos novos, aprovações, abertura/fecho de embarque, ocorrências, conclusão
  - motorista: só a rota que lhe está atribuída
  - passageiro: só o seu pedido, o seu bilhete, a sua viagem
- Nunca insere para "todos"; para eventos de rota, cria um aviso individual por passageiro daquela rota.
- A mensagem nunca inclui o nome de outro passageiro.
- Protecção contra duplicados: um aviso igual (mesmo destinatário + tipo + referência) não é inserido duas vezes.

Ligações aos eventos (pontos 1 a 9 do pedido): pedido enviado, pedido aprovado, bilhete criado, rota atribuída a motorista, embarque aberto, passageiro embarcado, ocorrência, desembarque, conclusão/reconciliação. Feito por gatilhos na base de dados onde já há tabelas envolvidas, para não depender do ecrã.

## 2. Sino de notificações

- Filtro explícito pela conta actual na consulta.
- Remover passa a funcionar: correcção da permissão de apagar + a lista actualiza-se de imediato.
- Novo botão "Limpar lidas".
- No telemóvel, deslizar para a esquerda mostra "Remover"; o X continua no computador e para acessibilidade.
- Som curto em avisos **novos** apenas (não ao marcar como lido nem ao remover), com interruptor "Som das notificações" guardado no aparelho.
- Aviso do sistema do telemóvel/computador só depois de o utilizador pedir, uma única vez.

## 3. Histórico que se pode limpar sem perder dados

Tabela nova `historico_ocultos` (utilizador, tipo de item, id do item). Cada pessoa só vê e só mexe nos seus próprios registos. Nada é apagado de verdade: viagens, bilhetes, leituras e ocorrências ficam intactos para auditoria; só deixam de aparecer na vista daquela pessoa. Aplicado onde já existe histórico: passageiro, motorista, operador e administrador.

## 4. Responsividade mobile-first

- Cabeçalho compacto com menu lateral no telemóvel; barra completa no computador.
- Todas as listas largas passam a cartões empilhados no telemóvel e tabela no computador.
- Formulários numa coluna no telemóvel; botões e selectores com área de toque confortável.
- Mapas a toda a largura, com altura menor no telemóvel.
- Leitor de QR e bilhete ajustados à largura do ecrã.
- Sem scroll horizontal em nenhuma página.
- Mesma identidade visual (azul escuro e branco), sem redesenho.

## 5. Mapa ao vivo

- O passageiro passa a ver só o veículo da viagem dele.
- O motorista vê a rota, as paragens e a sua posição.
- Quando ainda não há posição, aparece uma mensagem clara em vez de um mapa vazio.
- Mostra a hora da última posição recebida.

## 6. Escolha de viagem pelo passageiro

Depois de preencher origem, destino, data e hora, o sistema procura rotas compatíveis (mesma data, com lugares livres, com paragens correspondentes). Se houver, o passageiro escolhe uma; se não houver, o pedido segue para análise do operador como hoje.

## 7. Sugestão de motorista para o operador

Botão "Sugerir motorista" ao lado da atribuição manual. A sugestão considera motorista activo, veículo livre com capacidade suficiente, horário compatível e sem outra viagem sobreposta, e explica o motivo. O operador confirma sempre — nunca é automático.

## 8. Estados de rota por botões

Substituir o selector de estado pelo botão certo para o momento: Agendar, Abrir embarque, Fechar embarque, Iniciar viagem, Concluir viagem. Sem saltos de estado, mantendo as funções seguras já existentes de iniciar e concluir viagem.

## Notas técnicas

- Migrações versionadas em `supabase/migrations/`; tipos regenerados para a tabela nova.
- Sem enfraquecer RLS; sem abrir inserção de notificações ao cliente (tudo por funções SECURITY DEFINER e gatilhos).
- QR de embarque/desembarque, GPS do motorista, `iniciar_rota_segura` e `concluir_rota_segura` ficam intactos.
- Verificação de tipos e build no final.

## Limitação conhecida

O som só toca depois de o utilizador o activar uma vez (regra dos navegadores) e não toca com o navegador totalmente suspenso em segundo plano — nesse caso fica o aviso do sistema, se tiver sido autorizado.
