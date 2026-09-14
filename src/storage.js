const API_URL = "/api/estoque";

const LOCAL_DATA_KEY = "estoque_app_v1";
const PENDING_KEY = "estoque_app_pending_sync";
const LAST_SYNC_KEY = "estoque_app_last_sync";


// ============================================================
// REQUISIÇÃO
// ============================================================

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.success === false) {
    throw new Error(
      data?.error || `Erro HTTP ${response.status}`
    );
  }

  return data;
}


// ============================================================
// DADOS LOCAIS
// ============================================================

function loadLocalItems() {
  try {
    const data = localStorage.getItem(LOCAL_DATA_KEY);

    if (!data) return [];

    const parsed = JSON.parse(data);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Erro ao carregar dados locais:", error);
    return [];
  }
}


function saveLocalItems(items) {
  try {
    if (!Array.isArray(items)) return;

    localStorage.setItem(
      LOCAL_DATA_KEY,
      JSON.stringify(items)
    );
  } catch (error) {
    console.error("Erro ao salvar dados locais:", error);
  }
}


// ============================================================
// FILA DE PENDENTES
// ============================================================

function loadPendingSync() {
  try {
    const data = localStorage.getItem(PENDING_KEY);

    if (!data) return null;

    const parsed = JSON.parse(data);

    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error("Erro ao carregar fila:", error);
    return null;
  }
}


function savePendingSync(items) {
  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify(items)
    );
  } catch (error) {
    console.error("Erro ao salvar fila:", error);
  }
}


function clearPendingSync() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}


// ============================================================
// ÚLTIMA SINCRONIZAÇÃO
// ============================================================

function setLastSync() {
  try {
    localStorage.setItem(
      LAST_SYNC_KEY,
      new Date().toISOString()
    );
  } catch {}
}


export function getLastSync() {
  try {
    return localStorage.getItem(LAST_SYNC_KEY) || "";
  } catch {
    return "";
  }
}


// ============================================================
// CARREGAR
// ============================================================

export const loadItems = async () => {

  // Primeiro tentamos o banco.

  try {
    const data = await request(API_URL);

    const items = Array.isArray(data?.items)
      ? data.items
      : [];

    // Salva uma cópia local imediatamente.
    saveLocalItems(items);

    setLastSync();

    // Se havia alterações pendentes,
    // tentamos enviá-las agora.

    const pending = loadPendingSync();

    if (pending) {
      try {
        await saveItems(pending);

        return pending;
      } catch (error) {
        console.warn(
          "Não foi possível enviar pendências:",
          error
        );
      }
    }

    return items;

  } catch (error) {

    console.warn(
      "Sentinel Database indisponível. Trabalhando offline.",
      error
    );

    // Banco offline:
    // devolve a última cópia local.

    return loadLocalItems();
  }
};


// ============================================================
// SALVAR
// ============================================================

export const saveItems = async (items) => {

  if (!Array.isArray(items)) {
    return false;
  }

  // ==========================================================
  // PRIMEIRO:
  // salva imediatamente no dispositivo.
  // ==========================================================

  saveLocalItems(items);

  // ==========================================================
  // SEGUNDO:
  // coloca na fila de sincronização.
  // ==========================================================

  savePendingSync(items);

  // ==========================================================
  // TERCEIRO:
  // tenta enviar para o Sentinel Database.
  // ==========================================================

  try {

    await request(API_URL, {
      method: "PUT",

      body: JSON.stringify({
        items,
      }),
    });

    // Banco recebeu com sucesso.

    clearPendingSync();

    setLastSync();

    return true;

  } catch (error) {

    console.warn(
      "Banco indisponível. Alteração mantida na fila.",
      error
    );

    // NÃO apagamos a fila.

    // A próxima tentativa vai reenviar.

    return false;
  }
};


// ============================================================
// SINCRONIZAÇÃO MANUAL
// ============================================================

export const syncPending = async () => {

  const pending = loadPendingSync();

  if (!pending) {
    return true;
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

    return true;

  } catch (error) {

    console.warn(
      "Sincronização ainda não disponível.",
      error
    );

    return false;
  }
};


// ============================================================
// VERIFICAR CONEXÃO
// ============================================================

export const checkConnection = async () => {

  try {

    await request(API_URL);

    return true;

  } catch {

    return false;
  }
};


// ============================================================
// QUANTIDADE DE PENDÊNCIAS
// ============================================================

export const hasPendingSync = () => {
  return loadPendingSync() !== null;
};