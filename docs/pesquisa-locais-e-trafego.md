# Pesquisa de locais e estimativas de rota — validação

## Implementado nesta alteração
- A pesquisa do mapa consulta primeiro os pontos guardados em `pontos_predefinidos` pelo nome, mesmo quando já têm latitude/longitude.
- Os resultados distinguem pontos guardados com coordenadas verificadas, pontos guardados ainda por verificar e resultados externos do OpenStreetMap/Nominatim.
- Ao seleccionar um resultado, o mapa centra-se nas coordenadas desse resultado e mostra um marcador.
- A pesquisa apresenta mensagens para campo vazio, resultados encontrados, pesquisa sem resultados e falha de ligação.
- A estimativa OSRM é identificada como estimativa sem trânsito em tempo real; o fallback em linha directa é identificado como aproximado e também sem trânsito em tempo real.

## Limites conhecidos
- A API pública OSRM usada actualmente fornece rotas rodoviárias e duração calculada sem trânsito actual. O Nominatim é geocodificação, não tráfego.
- Os serviços públicos OSM/Nominatim e OSRM não devem ser tratados como SLA de produção; respeitar as respectivas políticas de utilização e limites.
- Não foi activada uma chave comercial nem enviado qualquer segredo para o repositório.

## Opções de fornecedor com tráfego
- **Google Maps Routes API**: duração com tráfego via preferência de tráfego/rota; requer projecto Google Cloud, billing activo e chave restrita. Custo variável por SKU e volume; confirmar a tabela oficial vigente e os limites antes de activar.
- **HERE Routing API**: oferece routing com informação de tráfego conforme produto/área; requer conta e credenciais, com preços/quotas dependentes do plano.
- **TomTom Routing API**: suporta estimativas com tráfego; requer API key e plano com quota/preço conforme utilização.

Recomendação: manter OSRM como fallback sem custo de licença por chamada e integrar primeiro um fornecedor comercial atrás de uma função server-side/configuração de ambiente. Nunca expor uma chave comercial no frontend. Medir custo por 1.000 pedidos e validar cobertura de Maputo antes de escolher.

## Testes funcionais a executar em produção
1. Pesquisar um ponto guardado com coordenadas verificadas pelo nome e seleccioná-lo; confirmar marcador e centro do mapa.
2. Repetir com ponto guardado ainda por verificar; confirmar etiqueta de estado.
3. Pesquisar nome inexistente e confirmar mensagem clara.
4. Iniciar turno, mudar para operador/admin e regressar ao motorista; confirmar que o turno permanece activo.
5. Confirmar actualização de GPS em veículo/mapas relevantes e timestamp recente.
6. Comparar percurso e duração com uma viagem real, registando hora, origem/destino, distância, estimativa mostrada e duração observada.
7. Repetir em horário de pico e fora de pico; documentar que a estimativa actual não incorpora tráfego em tempo real.

## Estado
Esta lista é um plano de validação; testes em produção não são considerados concluídos apenas pela alteração do código.
