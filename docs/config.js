// Preencha estes valores antes de publicar o site.
// Veja o passo a passo em SETUP.md.
const CONFIG = {
  // Client ID OAuth criado no Google Cloud Console (tela "Credenciais").
  GOOGLE_CLIENT_ID: '849981699114-17njh8u639b4tpbjlemumba8bgc1oen7.apps.googleusercontent.com',

  // ID da planilha (já é o da sua planilha "Controle_Despesas_Fazenda").
  SPREADSHEET_ID: '1IAGCDZAUUnM5dMNjMM5Iw-LwOYFDOx6JMjt0OLjG3E8',

  // Só contas Google listadas aqui conseguem usar o site.
  // Isso é só uma checagem de conveniência na tela — a segurança real
  // vem de quem tem acesso de Editor na planilha (ver SETUP.md).
  ALLOWED_EMAILS: [
    'silvinhosaran@gmail.com',
    'vwsagronegocios@gmail.com',
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
