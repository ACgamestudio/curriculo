# Central de Candidaturas — instalação

Tempo estimado: 15 minutos. Não é preciso saber programar, apenas copiar e colar.

## Antes de começar

Use a conta de Gmail que vai **enviar** os e-mails. Todo o sistema roda dentro dela: planilha, script, Drive e envio.

---

## 1. Criar a planilha

1. Abra <https://sheets.new>
2. No nome do arquivo (canto superior esquerdo), escreva `Central de Candidaturas`

Não precisa criar abas nem colunas — o script faz isso no passo 5.

## 2. Abrir o editor de script

Na planilha: menu **Extensões → Apps Script**. Abre uma nova aba com um arquivo chamado `Código.gs`.

## 3. Colar os 4 arquivos

**Arquivo 1 — `Código.gs`**
Apague tudo que estiver escrito e cole o conteúdo de `Code.gs`.

**Arquivo 2 — `index`**
Clique no `+` ao lado de "Arquivos" → **HTML** → nome: `index` (sem `.html`, o editor completa).
Apague o conteúdo padrão e cole o de `index.html`.

**Arquivo 3 — `style`**
`+` → **HTML** → nome: `style`. Cole o conteúdo de `style.html`.

**Arquivo 4 — `script`**
`+` → **HTML** → nome: `script`. Cole o conteúdo de `script.html`.

Clique no ícone de disquete (**Salvar projeto**).

> Por que `style` e `script` são arquivos HTML? O Apps Script não hospeda `.css` nem `.js` soltos. O padrão oficial é guardá-los em arquivos HTML dentro das tags `<style>` e `<script>` — foi exatamente o que fizemos. A separação lógica continua: um arquivo de layout, um de estilo, um de comportamento, um de servidor.

## 4. Preparar a planilha (roda uma vez)

1. No editor, na barra de cima, selecione a função **`setup`**
2. Clique em **Executar**
3. Vai aparecer "É necessária autorização" → **Revisar permissões** → escolha sua conta
4. Se aparecer "O Google não verificou este app": **Avançado → Acessar Central de Candidaturas (não seguro)**. Esse aviso é normal para scripts pessoais, você é o autor e o dono.
5. Clique em **Permitir**

O que você está autorizando:

| Permissão | Para quê |
|---|---|
| Ver e gerenciar suas planilhas | ler e atualizar contatos e histórico |
| Enviar e-mail em seu nome | disparar as candidaturas |
| Ver e gerenciar arquivos do Drive | guardar o PDF do currículo |

Volte na planilha: existem agora as abas **Contatos**, **Historico** e **Config**, e uma pasta no Drive chamada `Curriculos - Central de Candidaturas`.

## 5. Publicar como aplicativo web

1. No editor: **Implantar → Nova implantação**
2. Engrenagem ao lado de "Selecionar tipo" → **App da Web**
3. Preencha:
   - Descrição: `v1`
   - Executar como: **Eu**
   - Quem pode acessar: **Somente eu**
4. **Implantar** → copie a **URL do app da Web**

Guarde essa URL. É o seu sistema.

> **Quem pode acessar = Somente eu** é o correto aqui. O sistema envia e-mails da sua conta; se você liberar para "qualquer pessoa", qualquer um com o link disparará e-mails no seu nome e gastará sua cota.

## 6. Abrir no celular

Abra a URL no navegador do celular, logado na mesma conta Google. No Chrome/Safari use **Adicionar à tela de início** para ficar como um app.

## 7. Primeiro teste (faça este antes de tudo)

1. Aba **Contatos** → adicione um contato com **o seu próprio e-mail**
2. Aba **Compor** → preencha nome, assunto e ajuste o texto
3. Carregue o PDF do currículo
4. Selecione só o seu contato → **Enviar e-mails**
5. Confira na sua caixa de entrada: nome do remetente, personalização das variáveis e anexo

Só depois de o teste passar, cadastre as empresas reais.

## 8. Cadastrar contatos em volume

Na aba **Contatos → Importar CSV**, use um arquivo com esta primeira linha:

```
Empresa,Nome,Email,Categoria,Cargo
ABC Tecnologia,RH,rh@abctecnologia.com,TI,Analista de Sistemas
Delta Offshore,Recrutamento,vagas@deltaoffshore.com,Offshore,Técnico de Manutenção
```

As categorias são livres — o que você digitar aparece automaticamente como filtro na tela de disparo.

## 9. Enviar a primeira campanha

1. Filtre por categoria (ex.: `TI`) e marque **Só pendentes**
2. **Selecionar todos** → **Pré-visualizar** (confere como o texto ficou com os dados reais)
3. **Enviar e-mails**

O painel de disparo mostra lote por lote, com selo `ENVIADO ✓` ou `FALHA ✕` por empresa. Tudo fica registrado na aba **Historico**.

---

## Limites reais do Gmail + Apps Script

| Limite | Conta Gmail gratuita | Google Workspace |
|---|---|---|
| Destinatários por dia | ~100 | ~1.500 |
| Tempo por execução | 6 minutos | 6 minutos |
| Tamanho total do e-mail | 25 MB | 25 MB |

Como o sistema lida com isso:

- **Cota**: o número no topo da tela é a cota real que ainda resta hoje (`MailApp.getRemainingDailyQuota()`). Se zerar no meio de um disparo, o envio para, avisa e o resto continua marcado como pendente.
- **6 minutos**: o disparo é quebrado em lotes de 15 e-mails, chamados em sequência. Nenhuma execução chega perto do limite, e uma falha derruba só um lote — não a campanha.
- **25 MB**: o PDF é limitado a 20 MB na entrada, com margem para o corpo do e-mail. Currículo bom tem menos de 1 MB.
- **Envio individual**: cada empresa recebe um e-mail próprio. Nada de CC ou BCC coletivo — nenhum destinatário vê os outros.
- **Duplicidade**: quem está como `Enviado` é ignorado, a não ser que você marque "enviar novamente".
- **Concorrência**: `LockService` impede dois disparos simultâneos (celular e computador ao mesmo tempo, por exemplo).

## Riscos que valem sua atenção

1. **Reputação de envio.** 100 e-mails/dia com o mesmo texto e um anexo é padrão de campanha. Personalize de verdade — pelo menos uma frase específica sobre a empresa — e prefira 20 a 30 por dia a 100 de uma vez.
2. **E-mail do remetente.** O campo aceita a sua conta e apelidos já verificados no Gmail (Configurações → Contas → Enviar e-mail como). Qualquer outro endereço é ignorado pelo Google e o e-mail sai da conta principal.
3. **Erro na coluna Status.** Uma falha grava `Erro` no contato e o motivo na coluna Observação. Reenvie só depois de corrigir o e-mail.
4. **Reimplantação.** Ao alterar qualquer código, use **Implantar → Gerenciar implantações → editar (lápis) → Nova versão**. Sem isso, a URL continua servindo a versão antiga.
5. **Currículo no Drive.** O PDF fica salvo na pasta do sistema. Trocar o arquivo pela tela sobe uma nova versão; o antigo permanece no Drive até você apagar manualmente.

## Se algo der errado

| Sintoma | Causa provável |
|---|---|
| Tela branca ao abrir a URL | falta criar os arquivos `style` e `script`, ou nomes com maiúscula/minúscula diferente |
| `Aba "Contatos" não existe` | a função `setup` não foi executada |
| Nenhum contato aparece | coluna `Email` vazia — contatos sem e-mail são ignorados de propósito |
| Data em inglês na planilha | as colunas de data são gravadas como texto pelo `setup`; se você formatou manualmente, rode `setup` de novo |
| `Serviço invocado muitas vezes` | cota diária estourada — continue no dia seguinte |
