const API_URL = "/api/estoque";

const LOCAL_KEY = "estoque_app_v1";
const PENDING_KEY = "estoque_app_pending_sync";
const LAST_SYNC_KEY = "estoque_app_last_sync";

/*
 * =========================================================
 * FILA DE SINCRONIZAÇÃO
 *
 * Impede que dois PUTs aconteçam ao mesmo tempo.
 *
 * Isso evita uma alteração antiga terminar depois de uma
 * alteração nova e ressuscitar dados excluídos.
 * =========================================================
 */

let filaSalvar = Promise.resolve();

function executarNaFila(operacao) {
  const proxima = filaSalvar
    .catch(() => {})
    .then(() => operacao());

  filaSalvar = proxima.catch(() => {});

  return proxima;
}

/*
 * =========================================================
 * CACHE LOCAL
 * =========================================================
 */

function saveLocalItems(items) {
  if (!Array.isArray(items)) {
    console.error(
      "Tentativa de salvar no cache algo que não é uma lista."
    );
    return false;
  }

  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify(items)
    );

    return true;
  } catch (error) {
    console.error(
      "Erro ao salvar cache local:",
      error
    );

    return false;
  }
}

function loadLocalItems() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);

    if (!raw) {
      return [];
    }

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      console.warn(
        "Cache local inválido. Ignorando cache."
      );

      return [];
    }

    return data;
  } catch (error) {
    console.error(
      "Erro ao ler cache local:",
      error
    );

    return [];
  }
}

/*
 * =========================================================
 * PENDÊNCIA
 * =========================================================
 */

function savePendingSync(items) {
  if (!Array.isArray(items)) {
    console.error(
      "Tentativa de guardar pendência inválida."
    );

    return false;
  }

  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify(items)
    );

    return true;
  } catch (error) {
    console.error(
      "Erro ao guardar sincronização pendente:",
      error
    );

    return false;
  }
}

function loadPendingSync() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);

    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      console.warn(
        "Pendência de sincronização inválida."
      );

      return null;
    }

    return data;
  } catch (error) {
    console.error(
      "Erro ao ler sincronização pendente:",
      error
    );

    return null;
  }
}

function clearPendingSync() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (error) {
    console.error(
      "Erro ao limpar pendência:",
      error
    );
  }
}

/*
 * =========================================================
 * ÚLTIMA SINCRONIZAÇÃO
 * =========================================================
 */

function setLastSync() {
  try {
    localStorage.setItem(
      LAST_SYNC_KEY,
      new Date().toISOString()
    );
  } catch (error) {
    console.error(
      "Erro ao salvar data da sincronização:",
      error
    );
  }
}

/*
 * =========================================================
 * REQUEST
 * =========================================================
 */

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,

    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      "Resposta inválida recebida do servidor."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        `Erro HTTP ${response.status}`
    );
  }

  if (data?.success === false) {
    throw new Error(
      data?.error ||
        "O servidor recusou a operação."
    );
  }

  return data;
}

/*
 * =========================================================
 * CARREGAR
 * =========================================================
 */

export const loadItems = async () => {
  const localItems = loadLocalItems();

  try {
    /*
     * PRIMEIRO:
     * consulta o banco central.
     *
     * O banco central é a fonte oficial.
     */
    const data = await request(API_URL);

    if (
      !Object.prototype.hasOwnProperty.call(
        data,
        "items"
      )
    ) {
      throw new Error(
        "Resposta do Sentinel Database não contém 'items'."
      );
    }

    if (!Array.isArray(data.items)) {
      throw new Error(
        "O campo 'items' recebido do servidor não é uma lista."
      );
    }

    /*
     * IMPORTANTE:
     *
     * Se o servidor respondeu []:
     *
     * NÃO usamos o cache antigo.
     * NÃO reenviamos o cache.
     *
     * [] significa que o banco central está vazio.
     *
     * Isso impede que uma exclusão seja desfeita pelo
     * cache antigo do navegador.
     */
    saveLocalItems(data.items);

    clearPendingSync();

    setLastSync();

    return data.items;
  } catch (error) {
    console.error(
      "Erro ao carregar Sentinel Database:",
      error
    );

    /*
     * Se o servidor estiver indisponível,
     * aí sim podemos trabalhar com o cache local.
     */
    if (localItems.length > 0) {
      console.warn(
        "Sentinel Database indisponível. Usando cache local."
      );

      return localItems;
    }

    /*
     * Sem servidor e sem cache:
     * não inventamos um estoque vazio.
     */
    throw error;
  }
};

/*
 * =========================================================
 * SALVAR
 * =========================================================
 */

export const saveItems = async (items) => {
  if (!Array.isArray(items)) {
    console.error(
      "saveItems recebeu algo que não é uma lista."
    );

    return false;
  }

  /*
   * Salva imediatamente no dispositivo.
   */
  saveLocalItems(items);

  /*
   * Guarda a versão mais recente como pendência.
   */
  savePendingSync(items);

  /*
   * IMPORTANTE:
   *
   * Todas as gravações entram em uma fila.
   *
   * Assim:
   *
   * alteração 1
   *     ↓
   * alteração 2
   *     ↓
   * alteração 3
   *
   * nunca ficam disputando entre si.
   */
  return executarNaFila(async () => {
    try {
      await request(API_URL, {
        method: "PUT",

        body: JSON.stringify({
          items,
        }),
      });

      /*
       * Só apagamos a pendência se a mesma versão
       * que estamos enviando ainda for a versão atual.
       *
       * Se o usuário fez outra alteração enquanto esta
       * estava sendo enviada, mantemos a nova pendência.
       */
      const pendenteAtual = loadPendingSync();

      if (
        Array.isArray(pendenteAtual) &&
        JSON.stringify(pendenteAtual) ===
          JSON.stringify(items)
      ) {
        clearPendingSync();
      }

      setLastSync();

      return true;
    } catch (error) {
      console.warn(
        "Banco indisponível. Alteração mantida localmente:",
        error
      );

      return false;
    }
  });
};

/*
 * =========================================================
 * SINCRONIZAR PENDÊNCIA
 * =========================================================
 */

export const syncPending = async () => {
  const pending = loadPendingSync();

  if (!pending) {
    return {
      synced: false,
      hadPending: false,
    };
  }

  return executarNaFila(async () => {
    try {
      await request(API_URL, {
        method: "PUT",

        body: JSON.stringify({
          items: pending,
        }),
      });

      /*
       * Só limpamos se a pendência ainda for a mesma.
       */
      const pendenteAtual = loadPendingSync();

      if (
        Array.isArray(pendenteAtual) &&
        JSON.stringify(pendenteAtual) ===
          JSON.stringify(pending)
      ) {
        clearPendingSync();
        saveLocalItems(pending);
      }

      setLastSync();

      return {
        synced: true,
        hadPending: true,
        items: pending,
      };
    } catch (error) {
      console.warn(
        "Ainda não foi possível sincronizar:",
        error
      );

      return {
        synced: false,
        hadPending: true,
      };
    }
  });
};

/*
 * =========================================================
 * VERIFICAR CONEXÃO
 * =========================================================
 */

export const checkConnection = async () => {
  try {
    const data = await request(API_URL);

    return (
      Array.isArray(data?.items)
    );
  } catch {
    return false;
  }
};

/*
 * =========================================================
 * VERIFICAR PENDÊNCIA
 * =========================================================
 */

export const hasPendingSync = () => {
  return Boolean(loadPendingSync());
};