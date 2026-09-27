// Preencha estes valores antes de publicar o site.
// Veja o passo a passo em SETUP.md.
const CONFIG = {
  // Client ID OAuth criado no Google Cloud Console (tela "Credenciais").
  GOOGLE_CLIENT_ID: 'COLOQUE_AQUI_SEU_CLIENT_ID.apps.googleusercontent.com',

  // ID da planilha (já é o da sua planilha "Controle_Despesas_Fazenda").
  SPREADSHEET_ID: '1IAGCDZAUUnM5dMNjMM5Iw-LwOYFDOx6JMjt0OLjG3E8',

  // Só contas Google listadas aqui conseguem usar o site.
  // Isso é só uma checagem de conveniência na tela — a segurança real
  // vem de quem tem acesso de Editor na planilha (ver SETUP.md).
  ALLOWED_EMAILS: [
    'coloque-seu-email@gmail.com',
  ],

  // Nome das abas na planilha (ajuste se você renomear alguma).
  SHEETS: {
    despesas: 'Despesas',
    categorias: 'Categorias',
    centrosCusto: 'Centros_Custo',
    fornecedores: 'Fornecedores',
  },

  // Opções fixas (a planilha não tem aba própria para isso).
  FORMAS_PAGAMENTO: ['Pix', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Transferência', 'Cheque', 'Outro'],
};
