# Retenção de dados (padrão adotado — revisar com o advogado)

| Dado | Prazo padrão | Como é aplicado |
|---|---|---|
| Pedidos de cotação pelo link público (`public_quote_requests`) | **180 dias** após o pedido | **Automático:** rotina diária (`purge-public-quotes`) apaga o que passou do prazo |
| Localização do motorista (`trip_locations`) | **30 dias** após o registro | **Automático:** rotina diária no banco apaga o que passou do prazo |
| Cadastro de motoristas | Vínculo ativo + prazos legais de trabalho/transporte | Manual (a transportadora desativa/apaga) |
| Clientes (contatos) | Relação comercial + prazos fiscais | Manual |
| Documentos fiscais e comprovantes | Prazos fiscais aplicáveis (em regra, 5 anos) | Manual; **validar com contador** |
| Usuários do sistema | Enquanto a conta estiver ativa | Manual |
| Registro de auditoria | Mantido (protegido contra alteração) | — |
| Solicitações de titulares / incidentes | Mantidos como prova de atendimento | — |

A localização é o dado mais sensível: só é coletada com consentimento do motorista, durante a viagem e com o aplicativo aberto, e é apagada sozinha após 30 dias.
