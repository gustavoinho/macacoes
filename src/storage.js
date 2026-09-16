/*
 * =========================================================
 * ENDEREÇO DO BACKEND
 * =========================================================
 *
 * O navegador SEMPRE fala com o próprio domínio do Vercel.
 * É o arquivo api/estoque.js (rodando no servidor do Vercel,
 * não no navegador) quem repassa a requisição até o Sentinel
 * Database no seu PC, usando as variáveis de ambiente
 * SENTINEL_DATABASE_URL e SENTINEL_API_KEY — que ficam só do
 * lado do servidor e nunca chegam ao navegador de quem usa o
 * app.
 * =========================================================
 */

const API_URL = "/api/estoque";

const LOCAL_KEY = "estoque_app_v1";
const PENDING_KEY = "estoque_app_pending_sync";
const LAST_SYNC_KEY = "estoque_app_last_sync";

/*
 * =========================================================
 * SISTEMA DE SALVAMENTO
 *
 * O problema anterior era:
 *
 * PUT estado antigo
 * PUT estado novo
 * PUT estado mais novo
 *
 * Todos ficavam na fila.
 *
 * Agora usamos "latest snapshot wins":
 *
 * - apenas UMA requisição pode estar sendo enviada;
 * - enquanto ela estiver sendo enviada, guardamos somente
 *   o estado MAIS RECENTE;
 * - quando a requisição terminar, enviamos o último estado.
 *
 * Isso impede que snapshots antigos fiquem esperando na fila
 * e ressuscitem itens que o usuário acabou de excluir.
 * =========================================================
 */

let salvamentoEmAndamento = false;
let ultimoSnapshot = null;

let resolversSalvamento = [];

/*
 * Compara dois snapshots.
 */
function snapshotsIguais(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
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
 * TRABALHADOR DE SALVAMENTO
 * =========================================================
 *
 * Regra:
 *
 * 1. pega o snapshot mais recente;
 * 2. envia;
 * 3. verifica se apareceu outro snapshot enquanto
 *    estava enviando;
 * 4. se apareceu, envia SOMENTE o mais recente;
 * 5. continua até não existir mais alteração pendente.
 *
 * IMPORTANTE:
 *
 * Se o usuário apagar um item enquanto um PUT antigo está
 * sendo enviado, a exclusão fica esperando.
 *
 * Assim que o PUT antigo termina, o PUT com a exclusão
 * é enviado depois.
 *
 * Portanto o estado final do banco será o estado mais novo.
 * =========================================================
 */

async function processarSalvamentos() {
  if (salvamentoEmAndamento) {
    return;
  }

  salvamentoEmAndamento = true;

  let ultimoResultado = true;

  try {
    while (ultimoSnapshot !== null) {
      const snapshot = ultimoSnapshot;

      /*
       * Limpa antes de enviar.
       *
       * Se uma alteração acontecer durante o PUT,
       * saveItems() colocará o novo snapshot novamente
       * em ultimoSnapshot.
       */
      ultimoSnapshot = null;

      try {
        await request(API_URL, {
          method: "PUT",

          body: JSON.stringify({
            items: snapshot,
          }),
        });

        /*
         * Só removemos a pendência se ela ainda representa
         * exatamente o snapshot que acabamos de enviar.
         */
        const pendenteAtual = loadPendingSync();

        if (
          Array.isArray(pendenteAtual) &&
          snapshotsIguais(
            pendenteAtual,
            snapshot
          )
        ) {
          clearPendingSync();
        }

        saveLocalItems(snapshot);
        setLastSync();

        ultimoResultado = true;
      } catch (error) {
        console.warn(
          "Banco indisponível. Alteração mantida localmente:",
          error
        );

        /*
         * Se não conseguiu enviar, preservamos o snapshot.
         *
         * Mas se apareceu uma alteração mais nova enquanto
         * estávamos tentando enviar, ela tem prioridade.
         */
        if (ultimoSnapshot === null) {
          ultimoSnapshot = snapshot;
        }

        ultimoResultado = false;

        /*
         * Não ficamos tentando infinitamente.
         */
        break;
      }
    }
  } finally {
    salvamentoEmAndamento = false;

    /*
     * Resolve as chamadas que estavam aguardando.
     */
    const resolvers = resolversSalvamento;
    resolversSalvamento = [];

    resolvers.forEach((resolve) => {
      resolve(ultimoResultado);
    });

    /*
     * Segurança:
     *
     * se uma alteração entrou exatamente durante a
     * finalização, inicia novamente.
     */
    if (
      ultimoSnapshot !== null &&
      !salvamentoEmAndamento
    ) {
      processarSalvamentos();
    }
  }
}

/*
 * =========================================================
 * CARREGAR
 * =========================================================
 *
 * CORREÇÃO IMPORTANTE:
 *
 * Antes, esta função buscava o servidor e sobrescrevia
 * QUALQUER coisa local, mesmo que existisse uma alteração
 * pendente (feita offline, ou que falhou ao enviar). Isso
 * fazia com que, ao recarregar a página, uma alteração do
 * usuário fosse silenciosamente apagada e substituída pela
 * versão antiga do servidor.
 *
 * Agora: se existe uma pendência não confirmada, tentamos
 * reenviá-la ANTES de confiar no servidor. Só usamos o dado
 * do servidor quando não há nenhuma alteração local à espera
 * de ser sincronizada.
 * =========================================================
 */

export const loadItems = async () => {
  const localItems = loadLocalItems();
  const pending = loadPendingSync();

  if (pending) {
    console.warn(
      "Existe uma alteração pendente de sincronização. Tentando reenviar antes de carregar o servidor..."
    );

    // Reaproveita a fila de salvamento normal.
    await saveItems(pending);

    // Independentemente do resultado, a versão "pending" é
    // a mais recente que o usuário produziu neste dispositivo
    // — nunca a descartamos aqui.
    return pending;
  }

  try {
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
     * Se o banco responder []:
     *
     * [] é o estado verdadeiro do banco.
     *
     * Nunca restauramos o cache antigo.
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
     * Só usamos cache se o servidor realmente estiver
     * indisponível.
     */
    if (localItems.length > 0) {
      console.warn(
        "Sentinel Database indisponível. Usando cache local."
      );

      return localItems;
    }

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
   * Salva imediatamente o estado atual no navegador.
   */
  saveLocalItems(items);

  /*
   * Este passa a ser SEMPRE o snapshot mais recente.
   *
   * Se havia outro esperando, ele é substituído.
   */
  ultimoSnapshot = items;

  savePendingSync(items);

  /*
   * Se já existe uma requisição acontecendo,
   * não criamos outra fila.
   *
   * A requisição atual terminará e depois enviará
   * ultimoSnapshot.
   */
  if (salvamentoEmAndamento) {
    return new Promise((resolve) => {
      resolversSalvamento.push(resolve);
    });
  }

  /*
   * Inicia o trabalhador.
   */
  processarSalvamentos();

  /*
   * Retorna uma Promise que termina quando o ciclo
   * de salvamento atual terminar.
   */
  return new Promise((resolve) => {
    resolversSalvamento.push(resolve);
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

  const sucesso = await saveItems(pending);

  if (sucesso) {
    const atual = loadPendingSync();

    if (
      Array.isArray(atual) &&
      snapshotsIguais(atual, pending)
    ) {
      clearPendingSync();
    }

    return {
      synced: true,
      hadPending: true,
      items: pending,
    };
  }

  return {
    synced: false,
    hadPending: true,
  };
};

/*
 * =========================================================
 * VERIFICAR CONEXÃO
 * =========================================================
 */

export const checkConnection = async () => {
  try {
    const data = await request(API_URL);

    return Array.isArray(data?.items);
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

/*
 * =========================================================
 * SINCRONIZAÇÃO ENTRE DISPOSITIVOS (POLLING)
 * =========================================================
 *
 * Este é o pedaço que faltava.
 *
 * Sem ele, o app só buscava o servidor UMA vez, quando a
 * página abria. Resultado, na prática:
 *
 *   1. Você abre o app no celular e no notebook.
 *   2. Altera algo no celular. Vai para o servidor certinho.
 *   3. O notebook continua com a lista antiga na memória,
 *      porque nunca foi avisado da mudança.
 *   4. Você mexe em qualquer coisa no notebook (mesmo algo
 *      pequeno, tipo marcar "devolvido ao armário").
 *   5. O notebook reenvia a LISTA INTEIRA que ele tinha —
 *      desatualizada — e apaga a alteração feita no celular.
 *
 * startAutoSync busca o servidor periodicamente (a cada
 * `intervalMs`, e também quando a aba volta a ficar visível
 * ou em foco) e chama `onUpdate(items)` sempre que encontra
 * uma versão diferente da que está salva localmente.
 *
 * Ele só faz essa busca quando NÃO há nada pendente de envio
 * neste dispositivo — assim nunca sobrescreve, no meio do
 * caminho, uma alteração local que ainda não chegou ao
 * servidor.
 *
 * Uso (no componente React):
 *
 *   useEffect(() => {
 *     if (!loaded) return;
 *     const parar = startAutoSync((novosItens) => {
 *       setItems(novosItens);
 *     });
 *     return parar; // limpa o intervalo ao desmontar
 *   }, [loaded]);
 * =========================================================
 */

export const startAutoSync = (onUpdate, intervalMs = 4000) => {
  let parado = false;
  let emExecucao = false;

  const tick = async () => {
    if (parado || emExecucao) return;

    // Nunca busca o servidor enquanto houver um envio em
    // andamento ou uma alteração local ainda não confirmada.
    if (salvamentoEmAndamento || loadPendingSync()) {
      return;
    }

    emExecucao = true;

    try {
      const data = await request(API_URL);

      if (
        !parado &&
        Array.isArray(data?.items)
      ) {
        const atual = loadLocalItems();

        if (!snapshotsIguais(atual, data.items)) {
          saveLocalItems(data.items);
          setLastSync();
          onUpdate(data.items);
        }
      }
    } catch {
      // Falha silenciosa — tenta de novo no próximo ciclo.
    } finally {
      emExecucao = false;
    }
  };

  const id = setInterval(tick, intervalMs);

  const aoFicarVisivel = () => {
    if (document.visibilityState === "visible") {
      tick();
    }
  };

  document.addEventListener(
    "visibilitychange",
    aoFicarVisivel
  );

  window.addEventListener("focus", tick);

  // Primeira verificação assim que ativado.
  tick();

  return () => {
    parado = true;
    clearInterval(id);
    document.removeEventListener(
      "visibilitychange",
      aoFicarVisivel
    );
    window.removeEventListener("focus", tick);
  };
};