// Registro degli endpoint serviti da Node. Tutto quello che non e' qui dentro
// viene inoltrato a PHP: aggiungere una voce qui significa spostare quel pezzo
// di app da PHP a Node.

import { categoryRoutes } from './categories.js';

export const routes = new Map(Object.entries({
  ...categoryRoutes,
}));
