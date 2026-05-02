// ─── FetchLogger.js ──────────────────────────────────────────────────────────

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, SILENT: 4 };

/**
 * Mappa HTTP method → operazione CRUD semantica.
 * PATCH è trattato come update parziale, distinto da PUT (update completo).
 */
const HTTP_METHOD_CRUD = {
    GET: 'READ',
    POST: 'CREATE',
    PUT: 'UPDATE',
    PATCH: 'PATCH',    // partial update — sottoinsieme di UPDATE
    DELETE: 'DELETE',
    HEAD: 'READ',     // semantica identica a GET, senza body in risposta
    OPTIONS: 'META',     // discovery/preflight — non rientra nel CRUD classico
};

const METHOD_STYLES = {
    GET: 'color:#66bb6a',                    // verde
    POST: 'color:#4fc3f7',                    // azzurro
    PUT: 'color:#ffa726',                    // arancio
    PATCH: 'color:#ce93d8',                    // viola
    DELETE: 'color:#ef5350;font-weight:bold',   // rosso bold
    HEAD: 'color:#80cbc4',                    // teal
    OPTIONS: 'color:#b0bec5',                    // grigio
};

const METHOD_ICONS = {
    GET: '📥',
    POST: '📤',
    PUT: '🔄',
    PATCH: '🩹',
    DELETE: '🗑️',
    HEAD: '🔍',
    OPTIONS: '⚙️',
};

class FetchLogger {

    static MAX_FLUSH_FAILURES = 3;

    constructor(options = {}) {
        this.level = LOG_LEVELS[options.level?.toUpperCase()] ?? LOG_LEVELS.DEBUG;
        this.service = options.service ?? 'fetchRequest';
        this.transport = options.transport ?? null;
        this.transportMethod = options.transportMethod?.toUpperCase() ?? 'POST';
        this._buffer = [];
        this._flushInterval = options.flushInterval ?? 5000;
        this._consecutiveFlushFailures = 0;
        this._flushStopped = false;

        if (this.transport) {
            this._validateTransportMethod(this.transportMethod);
            this._startFlush();
        }
    }

    // ── Metodi pubblici core ──────────────────────────────────────────────────

    debug(event, meta = {}) { this._log('DEBUG', event, meta); }
    info(event, meta = {}) { this._log('INFO', event, meta); }
    warn(event, meta = {}) { this._log('WARN', event, meta); }
    error(event, meta = {}) { this._log('ERROR', event, meta); }

    // ── Lifecycle fetch ───────────────────────────────────────────────────────

    requestStart({ url, method = 'POST', attempt, retries, timeout }) {
        this.info('REQUEST_START', {
            httpMethod: method.toUpperCase(),
            crudOp: this._resolveCrud(method),
            url: this._sanitizeUrl(url),
            attempt,
            retries,
            timeout,
        });
    }

    requestSuccess({ url, method = 'POST', attempt, durationMs, status }) {
        this.info('REQUEST_SUCCESS', {
            httpMethod: method.toUpperCase(),
            crudOp: this._resolveCrud(method),
            url: this._sanitizeUrl(url),
            attempt,
            durationMs,
            status,
        });
    }

    requestRetry({ url, method = 'POST', attempt, retries, errorMessage, errorCode, isH2Error, delayMs }) {
        this.warn('REQUEST_RETRY', {
            httpMethod: method.toUpperCase(),
            crudOp: this._resolveCrud(method),
            url: this._sanitizeUrl(url),
            attempt,
            retries,
            errorMessage,
            errorCode: errorCode ?? null,
            isH2Error: isH2Error ?? false,
            delayMs,
        });
    }

    requestFailure({ url, method = 'POST', attempt, retries, errorMessage, errorCode, isTimeout, isH2Error, durationMs }) {
        this.error('REQUEST_FAILURE', {
            httpMethod: method.toUpperCase(),
            crudOp: this._resolveCrud(method),
            url: this._sanitizeUrl(url),
            attempt,
            retries,
            errorMessage,
            errorCode: errorCode ?? null,
            isTimeout: isTimeout ?? false,
            isH2Error: isH2Error ?? false,
            durationMs,
        });
    }

    // ── Lifecycle worker ──────────────────────────────────────────────────────

    workerSpawned({ url, method = 'POST', attempt }) {
        this.debug('WORKER_SPAWNED', {
            httpMethod: method.toUpperCase(),
            crudOp: this._resolveCrud(method),
            url: this._sanitizeUrl(url),
            attempt,
        });
    }

    workerTerminated({ url, method = 'POST', attempt, durationMs }) {
        this.debug('WORKER_TERMINATED', {
            httpMethod: method.toUpperCase(),
            crudOp: this._resolveCrud(method),
            url: this._sanitizeUrl(url),
            attempt,
            durationMs,
        });
    }

    // ── Parsing ───────────────────────────────────────────────────────────────

    /**
     * Chiamato da FetchRequest quando JSON.parse fallisce sulla risposta.
     * Logga come ERROR e mostra la risposta grezza in un gruppo collassabile.
     *
     * @param {string} url          - URL della richiesta (verrà sanitizzato)
     * @param {string} method       - Verbo HTTP usato
     * @param {string} errorMessage - Messaggio dell'eccezione di parsing
     * @param {string} rawText      - Corpo della risposta grezzo non parsabile
     */
    jsonParseFailed({ url, method = 'POST', errorMessage, rawText }) {
        const m = method.toUpperCase();

        this._log('ERROR', 'JSON_PARSE_FAILED', {
            httpMethod: m,
            crudOp: this._resolveCrud(m),
            url: this._sanitizeUrl(url),
            errorMessage,
        });

        // Mostra il body grezzo in un gruppo separato per non inquinare la entry
        // strutturata — il testo potrebbe essere arbitrariamente lungo
        console.groupCollapsed(
            `%c[FetchLogger] 📄 Risposta grezza — ${m} ${this._sanitizeUrl(url)}`,
            'color:#ef5350;font-weight:bold'
        );
        console.log(rawText);
        console.groupEnd();
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    _log(level, event, meta) {
        if (LOG_LEVELS[level] < this.level) return;

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.service,
            event,
            ...meta,
        };

        this._printConsole(level, entry);

        if (this.transport) {
            this._buffer.push(entry);
        }
    }

    _printConsole(level, entry) {
        const baseStyles = {
            DEBUG: 'color:#888',
            INFO: 'color:#4fc3f7',
            WARN: 'color:#ffb74d',
            ERROR: 'color:#ef5350;font-weight:bold',
        };
        const levelIcons = { DEBUG: '🔍', INFO: '✅', WARN: '⚠️', ERROR: '❌' };

        const { timestamp, level: lvl, service, event, httpMethod, ...rest } = entry;

        const style = httpMethod
            ? METHOD_STYLES[httpMethod] ?? baseStyles[level]
            : baseStyles[level];

        const methodTag = httpMethod
            ? ` ${METHOD_ICONS[httpMethod] ?? ''} ${httpMethod}`
            : '';

        const prefix = `[${timestamp}] ${levelIcons[level]} ${service}${methodTag} › ${event}`;

        if (Object.keys(rest).length) {
            console.groupCollapsed(`%c${prefix}`, style);
            console.table(rest);
            console.groupEnd();
        } else {
            console.log(`%c${prefix}`, style);
        }
    }

    /** Rimuove query string e hash per non loggare parametri potenzialmente sensibili */
    _sanitizeUrl(url) {
        try {
            const u = new URL(url);
            return `${u.origin}${u.pathname}`;
        } catch {
            return url;
        }
    }

    _resolveCrud(method) {
        return HTTP_METHOD_CRUD[method.toUpperCase()] ?? 'UNKNOWN';
    }

    _validateTransportMethod(method) {
        const allowed = ['POST', 'PUT', 'PATCH'];
        if (!allowed.includes(method)) {
            console.warn(
                `[FetchLogger] transportMethod "${method}" insolito per un endpoint di logging. ` +
                `Metodi consigliati: ${allowed.join(', ')}.`
            );
        }
    }

    /**
     * Flush periodico verso il transport remoto.
     * Il metodo HTTP è configurabile via transportMethod (default POST):
     *  - POST  → crea un nuovo batch (più comune)
     *  - PUT   → sovrascrive la sessione di log corrente
     *  - PATCH → aggiornamento incrementale della sessione
     */
    _startFlush() {
        this._flushTimerId = setInterval(async () => {
            if (this._flushStopped || !this._buffer.length) return;

            const batch = this._buffer.splice(0, this._buffer.length);
            try {
                const res = await fetch(this.transport, {
                    method: this.transportMethod,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ logs: batch }),
                    keepalive: true,
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                this._consecutiveFlushFailures = 0;
            } catch (err) {
                this._consecutiveFlushFailures++;

                if (this._consecutiveFlushFailures >= FetchLogger.MAX_FLUSH_FAILURES) {
                    console.warn(
                        `[FetchLogger] Transport non raggiungibile dopo ${FetchLogger.MAX_FLUSH_FAILURES} tentativi — flush remoto disattivato.`
                    );
                    this._flushStopped = true;
                    clearInterval(this._flushTimerId);
                    return;
                }

                console.warn('[FetchLogger] flush fallito:', err.message);
                this._buffer.unshift(...batch);
            }
        }, this._flushInterval);
    }
}

export default FetchLogger;