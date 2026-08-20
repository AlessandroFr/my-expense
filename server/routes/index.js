// Registro degli endpoint serviti da Node. Tutto quello che non e' qui dentro
// viene inoltrato a PHP: aggiungere una voce qui significa spostare quel pezzo
// di app da PHP a Node.

import { accountRoutes } from './accounts.js';
import { attachmentRoutes } from './attachments.js';
import { backupRoutes } from './backup.js';
import { bankImportRoutes } from './bank-import.js';
import { budgetRoutes } from './budgets.js';
import { categoryRoutes } from './categories.js';
import { contactRoutes } from './contacts.js';
import { csvRoutes } from './csv.js';
import { expenseRoutes } from './expenses.js';
import { filterRoutes } from './filters.js';
import { incomeRoutes } from './incomes.js';
import { manutenzioneRoutes } from './manutenzione.js';
import { pacRoutes } from './pac.js';
import { pageRoutes } from './pages.js';
import { reconciliationRoutes } from './reconciliations.js';
import { recurringRoutes } from './recurring.js';
import { reportRoutes } from './reports.js';
import { securitiesRoutes } from './securities.js';
import { tagRoutes } from './tags.js';
import { transferBackfillRoutes } from './transfers-backfill.js';
import { transferRoutes } from './transfers.js';

export const routes = new Map(Object.entries({
  ...pageRoutes,
  ...manutenzioneRoutes,
  ...categoryRoutes,
  ...tagRoutes,
  ...filterRoutes,
  ...budgetRoutes,
  ...accountRoutes,
  ...expenseRoutes,
  ...incomeRoutes,
  ...transferRoutes,
  ...recurringRoutes,
  ...contactRoutes,
  ...attachmentRoutes,
  ...backupRoutes,
  ...securitiesRoutes,
  ...pacRoutes,
  ...reportRoutes,
  ...reconciliationRoutes,
  ...csvRoutes,
  ...bankImportRoutes,
  ...transferBackfillRoutes,
}));
