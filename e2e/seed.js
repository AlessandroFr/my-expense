// Il database dei test, rifatto da zero prima di ogni giro.
//
// Ci mette dentro il minimo che serve a tutte le spec: due conti (uno normale
// e uno PAC), un paio di categorie, due fondi con il loro piano da 300 e 200 —
// che insieme fanno i 500 del bonifico nel file di esempio dell'import — e una
// spesa gia' registrata su cui provare il versamento.
//
// Sta fuori dai test apposta: un test che si costruisce il mondo da solo
// diventa lento e racconta il seed invece di raccontare la funzione.
//
// La chiama `server.js`, che prima ha cancellato la cartella e messo
// MY_EXPENSE_DATA_DIR: qui si trova gia' tutto al suo posto.
/** La password del database dei test. Non protegge niente: e' usa e getta. */
export const PASSWORD_TEST = 'prova-prova-1234';

export async function seed() {
  // Le prove passano dal cancello vero: si crea un vault con la password nota
  // a `sblocca.spec.js`, cosi' l'app dei test si apre esattamente come quella
  // installata invece di avere una porta di servizio che nessuno collauda.
  const lock = await import('../server/lock.js');
  const { ensureUser, run, one } = await import('../server/db.js');
  lock.proteggiNuovo(PASSWORD_TEST);
  const userId = ensureUser();

  const account = (name, type, opening = '0.00') => {
    run(
      `INSERT INTO accounts (user_id, name, type, color, icon, opening_balance, sort_order)
       VALUES (?, ?, ?, '#6c757d', NULL, ?, 0)`,
      userId, name, type, opening,
    );
    return one('SELECT id FROM accounts WHERE user_id = ? AND name = ?', userId, name).id;
  };

  const conto = account('Conto corrente', 'checking', '2000.00');
  const pac = account('Conto PAC', 'pac');
  account('In tasca', 'cash');

  for (const [name, color] of [['Spesa quotidiana', '#0d6efd'], ['Casa', '#198754']]) {
    run('INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, NULL, 0)',
      userId, name, color);
  }

  for (const [fund, plan, amount] of [['Fondo Mondo', 'PAC Mondo', '300.00'], ['Fondo Europa', 'PAC Europa', '200.00']]) {
    run("INSERT INTO pac_funds (user_id, name, currency, fund_type) VALUES (?, ?, 'EUR', 'etf')", userId, fund);
    const fundId = one('SELECT id FROM pac_funds WHERE user_id = ? AND name = ?', userId, fund).id;
    run(
      `INSERT INTO pac_plans (user_id, account_id, source_account_id, fund_id, name, amount, frequency, start_date)
       VALUES (?, ?, ?, ?, ?, ?, 'monthly', '2026-01-01')`,
      userId, pac, conto, fundId, plan, amount,
    );
  }

  // Il NAV serve a far vedere le quote comprate: senza, il versamento si
  // registra lo stesso ma resta senza unita'.
  run("INSERT INTO pac_fund_navs (fund_id, nav_date, nav) VALUES (1, '2026-08-01', '10.000000')");

  // Una spesa che le spec possono marcare come versamento (300 + 200 = 500).
  run(
    `INSERT INTO expenses (user_id, category_id, account_id, amount, description, payment_method, expense_date)
     VALUES (?, 1, ?, '500.00', 'ADDEBITO PAC AGOSTO', 'transfer', '2026-08-05')`,
    userId, conto,
  );

  // Si richiude: le prove devono passare dalla schermata di sblocco come chi
  // usa l'app davvero. Ad aprirlo e' `sblocca.setup.js`, da cui tutte le altre
  // spec dipendono.
  lock.blocca();
}
