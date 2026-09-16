const API_URL = "/api/estoque";

const LOCAL_KEY = "estoque_app_v1";
const PENDING_KEY = "estoque_app_pending_sync";
const LAST_SYNC_KEY = "estoque_app_last_sync";

function saveLocalItems(items) {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify(Array.isArray(items) ? items : [])
    );
  } catch (error) {
    console.error("Erro ao salvar cache local:", error);
  }
}

function loadLocalItems() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);

    if (!raw) {
      return [];
    }

    const data = JSON.parse(raw);

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Erro ao ler cache local:", error);
    return [];
  }
}

function savePendingSync(items) {
  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify(Array.isArray(items) ? items : [])
    );
  } catch (error) {
    console.error(
      "Erro ao guardar sincronização pendente:",
      error
    );
  }
}

function loadPendingSync() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);

    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw);

    return Array.isArray(data) ? data : null;
  } catch (error) {
    console.error(
      "Erro ao ler sincronização pendente:",
      error
    );

    return null;
  }
}

function clearPendingSync() {
  localStorage.removeItem(PENDING_KEY);
}

function setLastSync() {
  try {
    localStorage.setItem(
      LAST_SYNC_KEY,
      new Date().toISOString()
    );
  } catch {}
}

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

/* =========================================================
   CARREGAR
========================================================= */

export const loadItems = async ({
  skipPendingUpload = false,
} = {}) => {
  const localItems = loadLocalItems();

  /*
   * Se existem alterações pendentes, tentamos sincronizar
   * primeiro.
   */
  const pending = loadPendingSync();

  if (pending && !skipPendingUpload) {
    const resultado = await syncPending();

    if (resultado.synced) {
      return await loadItems({
        skipPendingUpload: true,
      });
    }

    /*
     * Banco indisponível:
     * usamos a cópia local/pedente.
     *
     * IMPORTANTE:
     * isso NÃO significa que o banco está vazio.
     */
    return pending;
  }

  try {
    const data = await request(API_URL);

    /*
     * O servidor PRECISA mandar "items".
     *
     * Se não mandar, consideramos erro.
     *
     * Isso evita que uma resposta quebrada seja
     * interpretada como estoque vazio.
     */
    if (!Object.prototype.hasOwnProperty.call(data, "items")) {
      throw new Error(
        "Resposta do Sentinel Database não contém 'items'."
      );
    }

    if (!Array.isArray(data.items)) {
      throw new Error(
        "O campo 'items' recebido do servidor não é uma lista."
      );
    }

    const items = data.items;

    /*
     * MIGRAÇÃO:
     *
     * Só fazemos isso quando o servidor respondeu
     * corretamente dizendo que possui 0 itens.
     *
     * Se o servidor estiver fora do ar, cai no catch
     * e NUNCA entra aqui.
     */
    if (
      items.length === 0 &&
      localItems.length > 0
    ) {
      console.log(
        "Banco central vazio. Verificando migração do cache local..."
      );

      savePendingSync(localItems);

      const resultado = await syncPending();

      if (resultado.synced) {
        return localItems;
      }

      /*
       * Não conseguiu sincronizar.
       * Mantém o estoque local.
       */
      return localItems;
    }

    /*
     * Banco respondeu corretamente.
     * Agora podemos confiar nos dados.
     */
    saveLocalItems(items);

    setLastSync();

    return items;
  } catch (error) {
    console.error(
      "Erro ao carregar Sentinel Database:",
      error
    );

    /*
     * IMPORTANTE:
     *
     * Se existe cache local, usamos.
     *
     * Se NÃO existe cache local, NÃO retornamos [].
     *
     * Isso impede que o App pense:
     *
     * "Banco vazio!"
     *
     * e depois envie [] para o servidor.
     */
    if (localItems.length > 0) {
      console.warn(
        "Sentinel Database indisponível. Usando cache local."
      );

      return localItems;
    }

    /*
     * Sem banco e sem cache.
     *
     * Jogamos o erro para o App.
     */
    throw error;
  }
};

/* =========================================================
   SALVAR
========================================================= */

export const saveItems = async (items) => {
  if (!Array.isArray(items)) {
    return false;
  }

  /*
   * Primeiro salva no navegador.
   */
  saveLocalItems(items);

  /*
   * Guarda como pendência.
   */
  savePendingSync(items);

  try {
    await request(API_URL, {
      method: "PUT",

      body: JSON.stringify({
        items,
      }),
    });

    /*
     * Só removemos a pendência depois que o
     * Sentinel Database confirmou o salvamento.
     */
    clearPendingSync();

    setLastSync();

    return true;
  } catch (error) {
    console.warn(
      "Banco indisponível. Alteração mantida localmente:",
      error
    );

    return false;
  }
};

/* =========================================================
   SINCRONIZAR PENDÊNCIAS
========================================================= */

export const syncPending = async () => {
  const pending = loadPendingSync();

  if (!pending) {
    return {
      synced: false,
      hadPending: false,
    };
  }

  try {
    await request(API_URL, {
      method: "PUT",

      body: JSON.stringify({
        items: pending,
      }),
    });

    clearPendingSync();

    saveLocalItems(pending);

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
};

/* =========================================================
   VERIFICAR CONEXÃO
========================================================= */

export const checkConnection = async () => {
  try {
    await request("/api/health", {
      method: "GET",
    });

    return true;
  } catch {
    return false;
  }
};

/* =========================================================
   VERIFICAR PENDÊNCIA
========================================================= */

export const hasPendingSync = () => {
  return Boolean(loadPendingSync());
};