// Registro degli endpoint serviti da Node. Tutto quello che non e' qui dentro
// viene inoltrato a PHP: aggiungere una voce qui significa spostare quel pezzo
// di app da PHP a Node.

import { accountRoutes } from './accounts.js';
import { budgetRoutes } from './budgets.js';
import { categoryRoutes } from './categories.js';
import { filterRoutes } from './filters.js';
import { tagRoutes } from './tags.js';

export const routes = new Map(Object.entries({
  ...categoryRoutes,
  ...tagRoutes,
  ...filterRoutes,
  ...budgetRoutes,
  ...accountRoutes,
}));
