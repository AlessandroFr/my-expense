// ─── optimistic.js ───────────────────────────────────────────────────────────
// Pattern di mutazione ottimistica: il DOM cambia subito, poi parte la chiamata.
// Se la chiamata fallisce, esegui rollback e mostra errore.

import { animateEnter, animateExit, withViewTransition } from './transitions.js';
import { toast }                                          from './toast.js';

/**
 * Esegue una mutazione ottimistica.
 *
 * @template T
 * @param {{
 *   apply:    () => any,
 *   rollback: (handle: any) => void,
 *   commit:   (handle: any, response: any) => void,
 *   call:     () => Promise<T>,
 *   errorMsg?: string,
 * }} opts
 */
export async function optimistic(opts) {
    let handle;
    try {
        handle = opts.apply();
    } catch (e) {
        toast.error(e.message ?? 'Errore applicazione modifica.');
        throw e;
    }

    try {
        const response = await opts.call();
        if (opts.commit) opts.commit(handle, response);
        return response;
    } catch (err) {
        try { opts.rollback?.(handle); } catch { /* swallow */ }
        toast.error(err.message ?? opts.errorMsg ?? 'Operazione fallita.');
        throw err;
    }
}

/**
 * Wrapper "create": prepende riga ottimistica con animazione enter,
 * sostituisce con la riga reale al success.
 */
export async function optimisticCreate({ container, makeOptimisticRow, makeFinalRow, call, position = 'prepend' }) {
    return optimistic({
        apply: () => {
            const row = makeOptimisticRow();
            row.classList.add('mx-optimistic');
            if (position === 'prepend') container.prepend(row);
            else container.append(row);
            animateEnter(row);
            return row;
        },
        rollback: (row) => {
            row.classList.remove('mx-optimistic');
            row.classList.add('mx-optimistic-error');
            setTimeout(() => animateExit(row).then(() => row.remove()), 800);
        },
        commit: (row, response) => {
            const finalRow = makeFinalRow(response);
            if (finalRow && finalRow !== row) {
                row.replaceWith(finalRow);
            } else {
                row.classList.remove('mx-optimistic');
            }
        },
        call,
    });
}

/**
 * Wrapper "delete": fade subito, rimuove dal DOM al success, ripristina al fail.
 */
export async function optimisticDelete({ row, call }) {
    return optimistic({
        apply: () => {
            row.classList.add('mx-optimistic');
            return { row };
        },
        rollback: ({ row }) => {
            row.classList.remove('mx-optimistic');
            row.classList.add('mx-optimistic-error');
            setTimeout(() => row.classList.remove('mx-optimistic-error'), 600);
        },
        commit: async ({ row }) => {
            await animateExit(row);
            row.remove();
        },
        call,
    });
}

/**
 * Wrapper "update inline": applica i nuovi valori al DOM subito, sincronizza al success.
 */
export async function optimisticUpdate({ row, applyValues, makeFinalRow, call }) {
    let snapshot = row.cloneNode(true);
    return optimistic({
        apply: () => {
            applyValues();
            row.classList.add('mx-optimistic');
            return row;
        },
        rollback: () => {
            row.replaceWith(snapshot);
        },
        commit: (_row, response) => {
            const finalRow = makeFinalRow(response);
            if (finalRow) {
                withViewTransition(() => row.replaceWith(finalRow));
            } else {
                row.classList.remove('mx-optimistic');
            }
        },
        call,
    });
}
