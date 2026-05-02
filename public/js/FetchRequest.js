import FetchLogger from '/javascript/FetchLogger.js';
// ─── FetchRequest.js ─────────────────────────────────────────────────────────

class FetchRequest {

    // ── Costanti ──────────────────────────────────────────────────────────────

    static H2_ERRORS = [
        'ERR_HTTP2_PROTOCOL_ERROR', 'ERR_HTTP2_STREAM_ERROR',
        'ERR_HTTP2_SESSION_ERROR', 'ERR_HTTP2_GOAWAY_SESSION',
        'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
    ];

    static DEFAULTS = {
        timeout: 2 * 60000,
        retries: 3,
        backoff: 500,
        loggerOptions: {
            service: `${window.location.origin}-API`,
            level: 'WARN',
            transport: `${window.location.origin}/endpoints/logs/ingest.php`,
            flushInterval: 10000,
        },
    };

    /**
     * Metodi che NON hanno body nella request.
     * Per questi i parametri vengono serializzati come query string.
     */
    static BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

    /**
     * Content-Type per ogni metodo.
     * PUT/PATCH usano JSON per agevolare update parziali o completi strutturati.
     * POST mantiene URLencoded per compatibilità con form tradizionali.
     */
    static CONTENT_TYPES = {
        POST: 'application/x-www-form-urlencoded',
        PUT: 'application/json',
        PATCH: 'application/json',
        DELETE: null,   // nessun body
        GET: null,
        HEAD: null,
        OPTIONS: null,
    };

    // ── Costruttore ───────────────────────────────────────────────────────────

    /**
     * @param {Object}      [options={}]
     * @param {number}      [options.timeout]       - ms prima di abortire (default 2 min)
     * @param {number}      [options.retries]       - tentativi massimi (default 3)
     * @param {number}      [options.backoff]       - ms base exponential backoff (default 500)
     * @param {FetchLogger} [options.logger]        - istanza logger custom
     * @param {Object}      [options.loggerOptions] - opzioni per creare il logger interno
     */
    constructor(options = {}) {
        const { timeout, retries, backoff, loggerOptions } = FetchRequest.DEFAULTS;

        this.timeout = options.timeout ?? timeout;
        this.retries = options.retries ?? retries;
        this.backoff = options.backoff ?? backoff;
        this.logger = options.logger ?? new FetchLogger(options.loggerOptions ?? loggerOptions);

        /**
         * Mappa in-flight per GET/HEAD idempotenti: due chiamate identiche
         * simultanee riusano la stessa Promise invece di colpire due volte
         * il backend. La voce viene rimossa al settle (successo o errore).
         * @type {Map<string, Promise<any>>}
         */
        this._inflight = new Map();
    }

    // ── Singleton ─────────────────────────────────────────────────────────────

    static getInstance(options = {}) {
        if (!FetchRequest._instance) {
            FetchRequest._instance = new FetchRequest(options);
        }
        return FetchRequest._instance;
    }

    // ── API pubblica CRUD ─────────────────────────────────────────────────────

    /** READ — recupera una risorsa. I parametri diventano query string. */
    get(url, params = {}, options = {}) {
        return this.send(url, params, { ...options, method: 'GET' });
    }

    /** CREATE — crea una nuova risorsa. */
    post(url, body = {}, options = {}) {
        return this.send(url, body, { ...options, method: 'POST' });
    }

    /** UPDATE — sostituisce completamente una risorsa. */
    put(url, body = {}, options = {}) {
        return this.send(url, body, { ...options, method: 'PUT' });
    }

    /** PARTIAL UPDATE — aggiorna solo i campi forniti. */
    patch(url, body = {}, options = {}) {
        return this.send(url, body, { ...options, method: 'PATCH' });
    }

    /** DELETE — elimina una risorsa. */
    delete(url, params = {}, options = {}) {
        return this.send(url, params, { ...options, method: 'DELETE' });
    }

    /** HEAD — come GET ma senza body in risposta (utile per check esistenza). */
    head(url, params = {}, options = {}) {
        return this.send(url, params, { ...options, method: 'HEAD' });
    }

    /** OPTIONS — discovery CORS o capability dell'endpoint. */
    options(url, options = {}) {
        return this.send(url, {}, { ...options, method: 'OPTIONS' });
    }

    /**
     * Upload di un FormData (multipart/form-data) direttamente dal main thread.
     * Non usa il Worker isolato perché File/FormData non è trasferibile via postMessage.
     * Non ha retry — i file upload sono operazioni one-shot avviate dall'utente.
     *
     * @param {string}   url
     * @param {FormData} formData
     * @returns {Promise<any>}  Risposta JSON
     */
    async postFormData(url, formData) {
        const absoluteUrl = new URL(url, window.location.href).href;
        const controller  = new AbortController();
        const tid         = setTimeout(() => controller.abort(), this.timeout);

        let response;
        try {
            const headers = {};
            const csrfToken = this.#getCsrfToken();
            if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

            response = await fetch(absoluteUrl, {
                method:    'POST',
                body:      formData,
                headers,
                cache:     'no-store',
                keepalive: false,
                signal:    controller.signal,
                // NB: non impostare Content-Type — il browser lo aggiunge con il boundary corretto
            });
        } catch (err) {
            clearTimeout(tid);
            if (err.name === 'AbortError') {
                const e = new Error(`Timeout dopo ${this.timeout / 1000}s`);
                e.isTimeout = true;
                throw e;
            }
            throw err;
        } finally {
            clearTimeout(tid);
        }

        const text = await response.text();

        if (!response.ok) {
            let body = null;
            try { body = JSON.parse(text); } catch (_) { /* noop */ }
            const e   = new Error(`Errore HTTP ${response.status}`);
            e.status  = response.status;
            e.body    = body;
            throw e;
        }

        try {
            return JSON.parse(text);
        } catch (_) {
            return text;
        }
    }

    // ── CSRF ────────────────────────────────────────────────────────────────────

    /**
     * Legge il token CSRF dal cookie csrf_token.
     * @returns {string} Token CSRF o stringa vuota.
     */
    #getCsrfToken() {
        const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    // ── Metodo pubblico principale ────────────────────────────────────────────

    /**
     * Esegue una richiesta HTTP con retry, backoff e connessione isolata per ogni tentativo.
     *
     * @param {string}                 url          - Endpoint API (relativo o assoluto)
     * @param {URLSearchParams|Object} [param={}]   - Parametri body o query string
     * @param {Object}                 [options={}] - Override timeout/retries/backoff/method per questa chiamata
     * @returns {Promise<any>}                      - Risposta JSON o testo grezzo
     */
    async send(url, param = {}, options = {}) {
        const timeout = options.timeout ?? this.timeout;
        const retries = options.retries ?? this.retries;
        const backoff = options.backoff ?? this.backoff;
        const method = (options.method ?? 'POST').toUpperCase();

        const isBodyless = FetchRequest.BODYLESS_METHODS.has(method);
        const contentType = FetchRequest.CONTENT_TYPES[method];

        // Risolve URL relativo in assoluto — il worker non ha window.location
        let absoluteUrl = new URL(url, window.location.href).href;

        // Serializzazione parametri
        let serializedBody = null;

        if (isBodyless) {
            // Per metodi senza body i parametri vanno in query string
            const qs = param instanceof URLSearchParams
                ? param
                : new URLSearchParams(param);
            if ([...qs].length) {
                absoluteUrl += (absoluteUrl.includes('?') ? '&' : '?') + qs.toString();
            }
        } else {
            // POST → URLencoded  |  PUT / PATCH → JSON
            if (contentType === 'application/json') {
                serializedBody = JSON.stringify(
                    param instanceof URLSearchParams
                        ? Object.fromEntries(param)
                        : param
                );
            } else {
                serializedBody = param instanceof URLSearchParams
                    ? param.toString()
                    : new URLSearchParams(param).toString();
            }
        }

        // ── In-flight deduplication (solo GET/HEAD) ─────────────────────────
        // Due chiamate identiche concorrenti condividono la stessa Promise,
        // evitando round-trip duplicati al backend. L'entry viene pulita
        // quando la Promise si risolve (o fallisce). Non si applica agli
        // altri metodi HTTP perche' potrebbero avere side-effect lato server.
        if ((method === 'GET' || method === 'HEAD') && !options.skipDedup) {
            const dedupKey = method + ' ' + absoluteUrl;
            const existing = this._inflight.get(dedupKey);
            if (existing) {
                return existing;
            }
            const promise = this.#runSend(absoluteUrl, method, serializedBody, contentType, timeout, retries, backoff);
            this._inflight.set(dedupKey, promise);
            promise.finally(() => this._inflight.delete(dedupKey));
            return promise;
        }

        return this.#runSend(absoluteUrl, method, serializedBody, contentType, timeout, retries, backoff);
    }

    /**
     * Esegue effettivamente il ciclo di retry/backoff.
     * Estratto da send() per consentire l'in-flight dedup senza duplicare
     * la logica di retry.
     */
    async #runSend(absoluteUrl, method, serializedBody, contentType, timeout, retries, backoff) {
        const startedAt = performance.now();
        this.logger.requestStart({ url: absoluteUrl, method, attempt: 1, retries, timeout });

        let lastError;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const result = await this.#isolatedFetch(
                    absoluteUrl, method, serializedBody, contentType, timeout, attempt
                );

                this.logger.requestSuccess({
                    url: absoluteUrl,
                    method,
                    attempt,
                    durationMs: Math.round(performance.now() - startedAt),
                    status: 200,
                });

                return result;

            } catch (err) {
                lastError = err;
                const isLast = attempt === retries;
                const delayMs = Math.round(backoff * Math.pow(2, attempt - 1));

                if (!isLast && !err.isTimeout && this.#isRetriable(err)) {
                    this.logger.requestRetry({
                        url: absoluteUrl,
                        method,
                        attempt,
                        retries,
                        errorMessage: err.message,
                        errorCode: err.code,
                        isH2Error: this.#isH2Error(err),
                        delayMs,
                    });
                    await this.#delay(attempt, backoff);
                } else {
                    this.logger.requestFailure({
                        url: absoluteUrl,
                        method,
                        attempt,
                        retries,
                        errorMessage: err.message,
                        errorCode: err.code,
                        isTimeout: err.isTimeout ?? false,
                        isH2Error: this.#isH2Error(err),
                        durationMs: Math.round(performance.now() - startedAt),
                    });
                    break;
                }
            }
        }

        throw lastError;
    }

    // ── Metodi privati ────────────────────────────────────────────────────────

    /**
     * Spawna un Web Worker isolato per ogni tentativo.
     * Ogni worker ha il proprio connection pool → nessun multiplexing H2 condiviso.
     *
     * @param {string}      url           - Endpoint assoluto (con eventuale query string)
     * @param {string}      method        - Verbo HTTP (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
     * @param {string|null} body          - Body già serializzato, null per metodi senza body
     * @param {string|null} contentType   - Content-Type da inviare, null se nessun body
     * @param {number}      timeout       - ms prima di abortire
     * @param {number}      attempt       - Numero tentativo corrente (per il logger)
     */
    #isolatedFetch(url, method, body, contentType, timeout, attempt) {
        const csrfToken = this.#getCsrfToken();
        return new Promise((resolve, reject) => {
            const workerCode = `
                self.onmessage = async ({ data: { url, method, body, contentType, timeout, csrfToken } }) => {
                    const controller = new AbortController();
                    const tid = setTimeout(() => controller.abort(), timeout);
                    try {
                        const headers = { 'Cache-Control': 'no-store' };
                        if (contentType) headers['Content-Type'] = contentType;
                        if (csrfToken)   headers['X-CSRF-Token'] = csrfToken;

                        const response = await fetch(url, {
                            method,
                            keepalive: false,
                            cache:     'no-store',
                            headers,
                            body:      body ?? undefined,
                            signal:    controller.signal,
                        });

                        // HEAD non ha body — restituisce solo status e headers
                        const text = method === 'HEAD' ? null : await response.text();

                        self.postMessage({ ok: response.ok, status: response.status, text });
                    } catch (err) {
                        self.postMessage({
                            error:   err.message,
                            code:    err.code,
                            isAbort: err.name === 'AbortError',
                        });
                    } finally {
                        clearTimeout(tid);
                    }
                };
            `;

            const workerUrl = URL.createObjectURL(
                new Blob([workerCode], { type: 'application/javascript' })
            );
            const worker = new Worker(workerUrl);
            const spawnedAt = performance.now();

            this.logger.workerSpawned({ url, method, attempt });

            worker.onmessage = ({ data }) => {
                const durationMs = Math.round(performance.now() - spawnedAt);
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
                this.logger.workerTerminated({ url, method, attempt, durationMs });

                if (data.isAbort) {
                    const e = new Error(`Timeout dopo ${timeout / 1000}s`);
                    e.isTimeout = true;
                    return reject(e);
                }
                if (data.error) {
                    const e = new Error(data.error);
                    e.code = data.code;
                    return reject(e);
                }
                if (!data.ok) {
                    let body = null;
                    try { body = JSON.parse(data.text); } catch (_) { /* non-JSON */ }
                    console.error(
                        `[FetchRequest] HTTP ${data.status} — ${method} ${url}`,
                        body ?? data.text
                    );
                    if (body && typeof body === 'object') { body._httpStatus = data.status; return resolve(body); }
                    return resolve({ result: false, title: `Errore HTTP ${data.status}`, message: data.text ?? '', _httpStatus: data.status });
                }

                // HEAD: nessun body da parsare
                if (data.text === null) return resolve(null);

                // Tentativo di parsing JSON con log dell'errore in caso di fallimento
                try {
                    resolve(JSON.parse(data.text));
                } catch (parseErr) {
                    console.error(
                        `[FetchRequest] JSON parse fallito per ${method} ${url}\n`,
                        `Errore: ${parseErr.message}\n`,
                        `Risposta grezza:`, data.text
                    );
                    this.logger.jsonParseFailed({
                        url,
                        method,
                        errorMessage: parseErr.message,
                        rawText: data.text,
                    });
                    resolve(data.text);
                }
            };

            worker.onerror = (e) => {
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
                reject(new Error(e.message));
            };

            worker.postMessage({ url, method, body, contentType, timeout, csrfToken });
        });
    }

    /** Controlla se l'errore è specifico del protocollo HTTP/2 o della rete */
    #isH2Error(err) {
        return FetchRequest.H2_ERRORS.some(
            code => err.message?.includes(code) || err.code === code
        );
    }

    /** Decide se ha senso riprovare in base al tipo di errore */
    #isRetriable(err) {
        return this.#isH2Error(err) || !err.status || err.status >= 500 || err.status === 429;
    }

    /** Exponential backoff con jitter random per distribuire il carico */
    #delay(attempt, backoff) {
        const ms = backoff * Math.pow(2, attempt - 1) + Math.random() * 200;
        return new Promise(r => setTimeout(r, ms));
    }
}

export default FetchRequest;