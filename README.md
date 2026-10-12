# Embarque Inteligente

Cria uma aplicação web full-stack (TypeScript, Tailwind, shadcn/ui) chamada "Rotas & Embarque QR" para gestão de mobilidade com rotas multiponto e check-in de passageiros por QR Code.

CONTEXTO:
É um módulo de uma plataforma de gestão de mobilidade e logística (Mobility Command Centre). Cada veículo segue uma rota com várias paragens ordenadas, recolhendo e largando passageiros diferentes em cada paragem. Cada passageiro tem um QR Code pessoal e tokenizado que apresenta ao entrar no veículo para confirmar o embarque.

MODELO DE DADOS (entidades principais):
- Rota: id, nome, veículo associado, janela horária, lista ordenada de paragens
- Paragem: id, rota_id, ordem, nome do local, latitude/longitude, hora prevista
- Passageiro: id, nome, contacto
- ViagemPassageiro: liga um passageiro a uma rota, com paragem de embarque, paragem de desembarque, estado (pendente / a_bordo / concluida / recusada), token_qr
- RegistoEmbarque: viagem_passageiro_id, tipo (embarque/desembarque), timestamp, resultado (aprovado/recusado), motivo_recusa

FUNCIONALIDADES DO MVP (fazer nesta ordem):
1. Autenticação simples com dois papéis: "motorista" e "operador" (login por email/password).
2. Painel do Operador: criar rotas com paragens ordenadas, criar passageiros, atribuir passageiros a uma rota (definindo paragem de embarque e paragem de desembarque), gerar um token QR único por viagem de passageiro.
3. Ecrã do Passageiro (pode ser uma página pública por token, sem precisar de login): mostra o QR Code do passageiro em destaque, com o nome da rota e a paragem de embarque prevista.
4. App/Ecrã do Motorista (após login): mostra a rota atribuída como uma lista ordenada de paragens, indicando em cada paragem quem deve recolher e quem deve largar. Tem um botão "Scan" que abre um leitor de QR Code (ou permite colar/digitar o token manualmente como alternativa) e valida se o passageiro corresponde à rota, ao veículo e à paragem certa — mostra "Aprovado" (verde) ou "Recusado" (vermelho, com motivo).
5. Painel Operacional em tempo real: mostra quantos passageiros estão "a bordo" em cada veículo neste momento, e quantos lugares ficam livres.

REGRAS IMPORTANTES DE SEGURANÇA:
- O token QR de cada viagem deve ser único, difícil de adivinhar (gerado aleatoriamente, tipo UUID longo) e só pode ser validado com sucesso UMA vez por evento (embarque não pode ser repetido).
- Cada leitura de QR (aprovada ou recusada) deve ficar registada com timestamp para auditoria.
- Dados pessoais dos passageiros só devem ser visíveis para utilizadores autenticados com papel "operador" ou "motorista" da rota correspondente.

Mantém o MVP enxuto e directo — estamos numa conta gratuita, por isso prioriza o essencial (autenticação, criação de rotas/paragens, ecrã do passageiro com QR, ecrã do motorista com scan e validação) antes de qualquer extra.

Usa um design limpo, profissional, em tons de azul escuro e branco. Interface em português.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d899fbff-b6b9-4bd9-9d0f-e86f39a738a5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
