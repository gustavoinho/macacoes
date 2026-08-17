import { useState, useEffect } from "react";
import "./style.css";
import jsPDF from "jspdf";
import Scanner from "../src/components/Scanner";
import { loadItems, saveItems } from "./storage";

const STORAGE_UPDATE_KEY = "macacoes_ultima_atualizacao";

export default function App() {
  const [history, setHistory] = useState([]);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState("estoque");
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  const [dark, setDark] = useState(false);

  const [ultimaAtualizacao, setUltimaAtualizacao] = useState("");

  const [showPDFModal, setShowPDFModal] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [form, setForm] = useState({
    numero: "",
    codigo: "",
    tamanho: "",
    data: "",
    nome: "",
  });

  /* =========================================================
     CARREGAMENTO
  ========================================================= */

  useEffect(() => {
    const dados = loadItems();

    setItems(Array.isArray(dados) ? dados : []);

    const ultima = localStorage.getItem(STORAGE_UPDATE_KEY);

    if (ultima) {
      setUltimaAtualizacao(ultima);
    }

    setLoaded(true);
  }, []);

  /* =========================================================
     SALVAMENTO AUTOMÁTICO
  ========================================================= */

  useEffect(() => {
    if (!loaded) return;

    saveItems(items);

    const agora = new Date().toISOString();

    localStorage.setItem(STORAGE_UPDATE_KEY, agora);
    setUltimaAtualizacao(agora);
  }, [items, loaded]);

  /* =========================================================
     DATAS
     
     O USUÁRIO SEMPRE VÊ:
     DD/MM/AAAA
     
     O SISTEMA PODE CONTINUAR TENDO:
     YYYY-MM-DD
     
     Isso mantém compatibilidade com dados antigos.
  ========================================================= */

  const formatarData = (data) => {
    if (!data) return "";

    const valor = String(data).trim();

    // DD/MM/AAAA
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
      return valor;
    }

    // DD-MM-AAAA
    if (/^\d{2}-\d{2}-\d{4}$/.test(valor)) {
      const [dia, mes, ano] = valor.split("-");
      return `${dia}/${mes}/${ano}`;
    }

    // AAAA-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [ano, mes, dia] = valor.split("-");
      return `${dia}/${mes}/${ano}`;
    }

    // AAAA/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(valor)) {
      const [ano, mes, dia] = valor.split("/");
      return `${dia}/${mes}/${ano}`;
    }

    const dataConvertida = new Date(valor);

    if (!Number.isNaN(dataConvertida.getTime())) {
      const dia = String(dataConvertida.getDate()).padStart(2, "0");
      const mes = String(dataConvertida.getMonth() + 1).padStart(2, "0");
      const ano = dataConvertida.getFullYear();

      return `${dia}/${mes}/${ano}`;
    }

    return valor;
  };

  /*
   * Converte DD/MM/AAAA para AAAA-MM-DD.
   *
   * Isso é usado apenas internamente para manter
   * compatibilidade com os dados existentes.
   */
  const dataParaInterno = (data) => {
    if (!data) return "";

    const valor = String(data).trim();

    // DD/MM/AAAA
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
      const [dia, mes, ano] = valor.split("/");
      return `${ano}-${mes}-${dia}`;
    }

    // DD-MM-AAAA
    if (/^\d{2}-\d{2}-\d{4}$/.test(valor)) {
      const [dia, mes, ano] = valor.split("-");
      return `${ano}-${mes}-${dia}`;
    }

    // Já está no formato interno
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return valor;
    }

    return valor;
  };

  /*
   * Máscara do campo de data.
   *
   * Exemplo:
   * 1        -> 1
   * 17       -> 17/
   * 1708     -> 17/08/
   * 17082026 -> 17/08/2026
   */
  const formatarInputData = (valor) => {
    const numeros = String(valor || "")
      .replace(/\D/g, "")
      .slice(0, 8);

    if (numeros.length <= 2) {
      return numeros;
    }

    if (numeros.length <= 4) {
      return `${numeros.slice(0, 2)}/${numeros.slice(2)}`;
    }

    return `${numeros.slice(0, 2)}/${numeros.slice(
      2,
      4
    )}/${numeros.slice(4, 8)}`;
  };

  /*
   * Verifica se a data digitada realmente existe.
   */
  const dataValida = (data) => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
      return false;
    }

    const [dia, mes, ano] = data.split("/").map(Number);

    if (mes < 1 || mes > 12) return false;
    if (dia < 1 || dia > 31) return false;
    if (ano < 1900 || ano > 3000) return false;

    const d = new Date(ano, mes - 1, dia);

    return (
      d.getFullYear() === ano &&
      d.getMonth() === mes - 1 &&
      d.getDate() === dia
    );
  };

  /*
   * Timestamp para ordenação.
   */
  const obterTimestampData = (data) => {
    if (!data) return Number.MAX_SAFE_INTEGER;

    const valor = String(data).trim();

    let ano;
    let mes;
    let dia;

    // AAAA-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      [ano, mes, dia] = valor.split("-").map(Number);
    }

    // DD/MM/AAAA
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
      [dia, mes, ano] = valor.split("/").map(Number);
    }

    // DD-MM-AAAA
    else if (/^\d{2}-\d{2}-\d{4}$/.test(valor)) {
      [dia, mes, ano] = valor.split("-").map(Number);
    }

    // AAAA/MM/DD
    else if (/^\d{4}\/\d{2}\/\d{2}$/.test(valor)) {
      [ano, mes, dia] = valor.split("/").map(Number);
    }

    else {
      const d = new Date(valor);

      return Number.isNaN(d.getTime())
        ? Number.MAX_SAFE_INTEGER
        : d.getTime();
    }

    const d = new Date(ano, mes - 1, dia);

    return Number.isNaN(d.getTime())
      ? Number.MAX_SAFE_INTEGER
      : d.getTime();
  };

  /* =========================================================
     DATA/HORA DA ÚLTIMA ATUALIZAÇÃO
  ========================================================= */

  const formatarUltimaAtualizacao = () => {
    if (!ultimaAtualizacao) {
      return "Nenhuma alteração registrada";
    }

    const data = new Date(ultimaAtualizacao);

    if (Number.isNaN(data.getTime())) {
      return "Nenhuma alteração registrada";
    }

    return formatarDataHoraPDF(data);
  };

  /* =========================================================
     NÚMERO PARA ORDENAÇÃO
  ========================================================= */

  const obterNumeroOrdenacao = (numero) => {
    if (numero === undefined || numero === null) {
      return Number.MAX_SAFE_INTEGER;
    }

    const texto = String(numero).trim();

    if (!texto) {
      return Number.MAX_SAFE_INTEGER;
    }

    const match = texto.match(/\d+/);

    if (!match) {
      return Number.MAX_SAFE_INTEGER;
    }

    const numeroConvertido = Number(match[0]);

    return Number.isNaN(numeroConvertido)
      ? Number.MAX_SAFE_INTEGER
      : numeroConvertido;
  };

  /* =========================================================
     ORDENAR
  ========================================================= */

  const ordenarItens = (lista) => {
    return [...lista].sort((a, b) => {
      const numeroA = obterNumeroOrdenacao(a.numero);
      const numeroB = obterNumeroOrdenacao(b.numero);

      if (numeroA !== numeroB) {
        return numeroA - numeroB;
      }

      const dataA = obterTimestampData(a.data);
      const dataB = obterTimestampData(b.data);

      if (dataA !== dataB) {
        return dataA - dataB;
      }

      const codigoA = String(a.codigo || "").toLowerCase();
      const codigoB = String(b.codigo || "").toLowerCase();

      return codigoA.localeCompare(codigoB, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      });
    });
  };

  /* =========================================================
     SOM
  ========================================================= */

  const beep = () => {
    try {
      const ctx = new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "square";
      o.frequency.value = 1200;
      g.gain.value = 0.05;

      o.connect(g);
      g.connect(ctx.destination);

      o.start();

      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 60);
    } catch {}
  };

  /* =========================================================
     HISTÓRICO
  ========================================================= */

  const salvarHistorico = (listaAtual) => {
    setHistory((prev) => [...prev, listaAtual]);
  };

  const desfazer = () => {
    if (history.length === 0) {
      alert("Nada para desfazer!");
      return;
    }

    const ultima = history[history.length - 1];

    setItems(ultima);

    setHistory((prev) => prev.slice(0, -1));
  };

  /* =========================================================
     EXPORTAR JSON
  ========================================================= */

  const exportJSON = () => {
    const data = JSON.stringify(items, null, 2);

    const blob = new Blob([data], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "dados.json";
    a.click();

    URL.revokeObjectURL(url);
  };

  /* =========================================================
     IMPORTAR JSON
  ========================================================= */

  const importJSON = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        if (Array.isArray(data)) {
          salvarHistorico(items);
          setItems(data);
        } else {
          alert("Arquivo inválido!");
        }
      } catch {
        alert("Erro ao ler JSON!");
      }

      e.target.value = "";
    };

    reader.readAsText(file);
  };

  /* =========================================================
     SCANNER
  ========================================================= */

  const handleNotFound = (code) => {
    const ok = confirm(
      "Item não existe. Deseja adicionar?"
    );

    if (!ok) return;

    setForm({
      numero: "",
      codigo: code,
      tamanho: "",
      data: "",
      nome: "",
    });

    setShowForm(true);
    setScanning(false);
  };

  const handleScan = (code) => {
    const codigo = String(code || "").trim();

    const found = items.find(
      (i) =>
        String(i.codigo || "")
          .toLowerCase() === codigo.toLowerCase()
    );

    if (found) {
      beep();

      setSearch(codigo);
      setTab("todos");
      setOpenItem(found.id);

      setScanning(false);
      return;
    }

    beep();
    handleNotFound(codigo);
  };

  /* =========================================================
     PESQUISA
  ========================================================= */

  const handleSearchKey = (e) => {
    if (e.key !== "Enter") return;

    const termo = search.trim().toLowerCase();

    if (!termo) return;

    const found = items.find((i) => {
      const codigo = String(i.codigo || "").toLowerCase();
      const nome = String(i.nome || "").toLowerCase();
      const numero = String(i.numero || "").toLowerCase();
      const tamanho = String(i.tamanho || "").toLowerCase();

      return (
        codigo.includes(termo) ||
        nome.includes(termo) ||
        numero.includes(termo) ||
        tamanho.includes(termo)
      );
    });

    if (!found) {
      handleNotFound(search.trim());
      return;
    }

    beep();

    setTab("todos");
    setOpenItem(found.id);
  };

  /* =========================================================
     ADICIONAR / EDITAR
  ========================================================= */

  const addItem = () => {
    if (!form.numero || !form.codigo) {
      alert("Preencha Número e Código!");
      return;
    }

    const codigoLimpo = form.codigo.trim();

    if (!codigoLimpo) {
      alert("Digite um código válido!");
      return;
    }

    // Se houver data, valida o formato DD/MM/AAAA.
    if (form.data && !dataValida(form.data)) {
      alert(
        "Digite uma data válida no formato DD/MM/AAAA."
      );
      return;
    }

    const jaExiste = items.some(
      (i) =>
        String(i.codigo || "")
          .trim()
          .toLowerCase() === codigoLimpo.toLowerCase() &&
        i.id !== editingId
    );

    if (jaExiste) {
      alert("Esse item já existe!");
      return;
    }

    salvarHistorico(items);

    /*
     * Salva a data internamente como YYYY-MM-DD.
     * Assim, dados antigos e novos ficam compatíveis.
     */
    const formParaSalvar = {
      ...form,
      codigo: codigoLimpo,
      data: dataParaInterno(form.data),
    };

    if (editingId) {
      setItems(
        items.map((i) =>
          i.id === editingId
            ? {
                ...i,
                ...formParaSalvar,
                nome:
                  tab === "uso"
                    ? form.nome
                    : i.nome || "",
                codigo: codigoLimpo,
              }
            : i
        )
      );

      setEditingId(null);
    } else {
      setItems([
        ...items,
        {
          ...formParaSalvar,
          nome: tab === "uso" ? form.nome : "",
          status: tab === "todos" ? "estoque" : tab,
          perdido: tab === "perdidos",
          lastStatus:
            tab === "perdidos" ? "estoque" : tab,
          devolvidoArmario: false,
          id: Date.now(),
        },
      ]);
    }

    setForm({
      numero: "",
      codigo: "",
      tamanho: "",
      data: "",
      nome: "",
    });

    setShowForm(false);
  };

  /* =========================================================
     ALTERAR STATUS
  ========================================================= */

  const toggleStatus = (id) => {
    salvarHistorico(items);

    setItems(
      items.map((i) => {
        if (i.id !== id) return i;

        let novoStatus = "estoque";

        if (i.status === "estoque") {
          novoStatus = "lavagem";
        } else if (i.status === "lavagem") {
          novoStatus = "uso";
        } else if (i.status === "uso") {
          novoStatus = "estoque";
        }

        return {
          ...i,
          status: novoStatus,
          lastStatus: novoStatus,
        };
      })
    );
  };

  /* =========================================================
     PERDIDO
  ========================================================= */

  const toggleP = (id) => {
    salvarHistorico(items);

    setItems(
      items.map((i) => {
        if (i.id !== id) return i;

        if (!i.perdido) {
          return {
            ...i,
            perdido: true,
            lastStatus: i.status,
            status: "perdido",
            devolvidoArmario: false,
          };
        }

        return {
          ...i,
          perdido: false,
          status: i.lastStatus || "estoque",
        };
      })
    );
  };

  /* =========================================================
     ARMÁRIO
  ========================================================= */

  const toggleArmario = (id) => {
    salvarHistorico(items);

    setItems(
      items.map((i) => {
        if (i.id !== id) return i;

        return {
          ...i,
          devolvidoArmario: !i.devolvidoArmario,
        };
      })
    );
  };

  /* =========================================================
     EDITAR
  ========================================================= */

  const startEdit = (item) => {
    setForm({
      numero: item.numero || "",
      codigo: item.codigo || "",
      tamanho: item.tamanho || "",
      data: formatarData(item.data),
      nome: item.nome || "",
    });

    setEditingId(item.id);
    setShowForm(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowForm(false);

    setForm({
      numero: "",
      codigo: "",
      tamanho: "",
      data: "",
      nome: "",
    });
  };

  /* =========================================================
     EXCLUIR
  ========================================================= */

  const removeItem = (id) => {
    if (!confirm("Excluir item?")) {
      return;
    }

    salvarHistorico(items);

    setItems(items.filter((i) => i.id !== id));
  };

  /* =========================================================
     FILTRO
  ========================================================= */

  const filtered = ordenarItens(
    items.filter((i) => {
      const termo = search.trim().toLowerCase();

      const codigo = String(i.codigo || "").toLowerCase();
      const nome = String(i.nome || "").toLowerCase();
      const numero = String(i.numero || "").toLowerCase();
      const tamanho = String(i.tamanho || "").toLowerCase();

      const matchSearch =
        !termo ||
        codigo.includes(termo) ||
        nome.includes(termo) ||
        numero.includes(termo) ||
        tamanho.includes(termo);

      if (!matchSearch) return false;

      if (tab === "estoque") {
        return i.status === "estoque" && !i.perdido;
      }

      if (tab === "lavagem") {
        return i.status === "lavagem" && !i.perdido;
      }

      if (tab === "uso") {
        return i.status === "uso" && !i.perdido;
      }

      if (tab === "perdidos") {
        return i.perdido;
      }

      if (tab === "todos") {
        return true;
      }

      return true;
    })
  );

  /* =========================================================
     CONTADORES
  ========================================================= */

  const count = {
    estoque: items.filter(
      (i) => i.status === "estoque" && !i.perdido
    ).length,

    lavagem: items.filter(
      (i) => i.status === "lavagem" && !i.perdido
    ).length,

    uso: items.filter(
      (i) => i.status === "uso" && !i.perdido
    ).length,

    perdidos: items.filter((i) => i.perdido).length,

    todos: items.length,
  };

  /* =========================================================
     DATA FINAL DA LAVAGEM
  ========================================================= */

  const calcularDataFinal = (data) => {
    if (!data) return "";

    const interna = dataParaInterno(data);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(interna)) {
      return "";
    }

    const [ano, mes, dia] = interna
      .split("-")
      .map(Number);

    const d = new Date(ano, mes - 1, dia);

    if (Number.isNaN(d.getTime())) {
      return "";
    }

    const diaSemana = d.getDay();

    if (diaSemana === 1) {
      // Segunda -> Sexta
      d.setDate(d.getDate() + 4);
    } else if (diaSemana === 3) {
      // Quarta -> Segunda
      d.setDate(d.getDate() + 5);
    } else if (diaSemana === 5) {
      // Sexta -> Quarta
      d.setDate(d.getDate() + 5);
    } else {
      return "Funciona somente: Seg/Qua/Sex";
    }

    const novoDia = String(d.getDate()).padStart(2, "0");
    const novoMes = String(d.getMonth() + 1).padStart(2, "0");
    const novoAno = d.getFullYear();

    return `${novoDia}/${novoMes}/${novoAno}`;
  };

  /* =========================================================
     DATA/HORA PDF
  ========================================================= */

  const formatarDataHoraPDF = (data) => {
    if (!data) return "";

    const dia = String(data.getDate()).padStart(2, "0");
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const ano = data.getFullYear();

    const horas = String(data.getHours()).padStart(2, "0");
    const minutos = String(data.getMinutes()).padStart(2, "0");
    const segundos = String(data.getSeconds()).padStart(2, "0");

    return `${dia}/${mes}/${ano} ${horas}:${minutos}:${segundos}`;
  };

  /* =========================================================
     PDF
  ========================================================= */

  const gerarPDF = (tipoRelatorio) => {
    if (!tipoRelatorio) return;

    setPdfLoading(true);

    setTimeout(() => {
      try {
        const doc = new jsPDF();

        let y = 15;

        const safe = (v) =>
          v !== undefined && v !== null
            ? String(v)
            : "";

        const estoque = ordenarItens(
          items.filter(
            (i) => i.status === "estoque" && !i.perdido
          )
        );

        const lavagem = ordenarItens(
          items.filter(
            (i) => i.status === "lavagem" && !i.perdido
          )
        );

        const uso = ordenarItens(
          items.filter(
            (i) => i.status === "uso" && !i.perdido
          )
        );

        const perdidos = ordenarItens(
          items.filter((i) => i.perdido)
        );

        const drawWatermark = () => {
          try {
            const gState = doc.GState({
              opacity: 0.08,
            });

            doc.setGState(gState);

            doc.setFontSize(30);
            doc.setTextColor(0, 0, 0);

            doc.text(
              "Gustavo Henrique Ribeiro",
              105,
              150,
              {
                align: "center",
                angle: 45,
              }
            );

            doc.setGState(
              doc.GState({
                opacity: 1,
              })
            );
          } catch {}

          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
        };

        const verificarPagina = () => {
          if (y > 270) {
            drawWatermark();
            doc.addPage();

            y = 15;

            drawWatermark();
          }
        };

        const write = (title, list, type) => {
          verificarPagina();

          doc.setFontSize(14);
          doc.setFont(undefined, "bold");

          doc.text(
            `${title} (${list.length})`,
            10,
            y
          );

          y += 8;

          doc.setFontSize(9);
          doc.setFont(undefined, "bold");

          if (type === "lavagem") {
            doc.text(
              "Número / Código / Tamanho / Data final",
              10,
              y
            );
          } else if (type === "uso") {
            doc.text(
              "Número / Código / Tamanho / Data / Nome / Devolvido?",
              10,
              y
            );
          } else {
            doc.text(
              "Número / Código / Tamanho",
              10,
              y
            );
          }

          y += 6;

          doc.setFont(undefined, "normal");

          list.forEach((i) => {
            verificarPagina();

            let linha = "";

            if (type === "lavagem") {
              const dataFinal = calcularDataFinal(i.data);

              linha =
                `${safe(i.numero)} / ` +
                `${safe(i.codigo)} / ` +
                `${safe(i.tamanho)} / ` +
                `${safe(dataFinal)}`;
            } else if (type === "uso") {
              const devolvido = i.devolvidoArmario
                ? "Sim"
                : "Não";

              linha =
                `${safe(i.numero)} / ` +
                `${safe(i.codigo)} / ` +
                `${safe(i.tamanho)} / ` +
                `${safe(formatarData(i.data))} / ` +
                `${safe(i.nome)} / ` +
                `${devolvido}`;
            } else {
              linha =
                `${safe(i.numero)} / ` +
                `${safe(i.codigo)} / ` +
                `${safe(i.tamanho)}`;
            }

            const linhas = doc.splitTextToSize(
              linha,
              185
            );

            doc.text(linhas, 10, y);

            y += 5 * linhas.length + 2;
          });

          y += 6;
        };

        drawWatermark();

        doc.setFontSize(18);
        doc.setFont(undefined, "bold");

        doc.text(
          "RELATÓRIO DE MACACÕES",
          10,
          y
        );

        y += 7;

        doc.setFontSize(9);
        doc.setFont(undefined, "normal");

        doc.text(
          `Gerado em: ${formatarDataHoraPDF(
            new Date()
          )}`,
          10,
          y
        );

        y += 10;

        if (tipoRelatorio === "estoque") {
          write(
            "ESTOQUE",
            estoque,
            "estoque"
          );
        }

        if (tipoRelatorio === "lavagem") {
          write(
            "LAVAGEM",
            lavagem,
            "lavagem"
          );
        }

        if (tipoRelatorio === "uso") {
          write(
            "EM USO",
            uso,
            "uso"
          );
        }

        if (tipoRelatorio === "perdidos") {
          write(
            "PERDIDOS",
            perdidos,
            "perdidos"
          );
        }

        if (tipoRelatorio === "todos") {
          write(
            "ESTOQUE",
            estoque,
            "estoque"
          );

          write(
            "LAVAGEM",
            lavagem,
            "lavagem"
          );

          write(
            "EM USO",
            uso,
            "uso"
          );

          write(
            "PERDIDOS",
            perdidos,
            "perdidos"
          );
        }

        doc.save(
          `relatorio-${tipoRelatorio}.pdf`
        );
      } catch (error) {
        console.error(error);

        alert(
          "Não foi possível gerar o PDF."
        );
      } finally {
        setPdfLoading(false);
        setShowPDFModal(false);
      }
    }, 150);
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className={`app ${dark ? "dark" : ""}`}>
      <div className="app-shell">

        {/* HEADER */}
        <header className="header">
          <div>
            <div className="eyebrow">
              CONTROLE DE ESTOQUE
            </div>

            <h1 className="title">
              Controle de Macacões
            </h1>

            <div className="last-update">
              <span className="update-dot"></span>

              <span>
                Última atualização:
              </span>

              <strong>
                {formatarUltimaAtualizacao()}
              </strong>
            </div>
          </div>

          <button
            className="theme-btn"
            onClick={() => setDark(!dark)}
          >
            {dark ? "☀️" : "🌙"}

            <span>
              {dark
                ? "Modo Claro"
                : "Modo Noturno"}
            </span>
          </button>
        </header>

        {/* BARRA PRINCIPAL */}
        <div className="top-bar">
          <button
            className="action-btn undo-btn"
            onClick={desfazer}
          >
            ↩️ <span>Desfazer</span>
          </button>

          <div className="search-box">
            <span className="search-icon">
              🔎
            </span>

            <input
              placeholder="Pesquisar por código, nome, número ou tamanho..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              onKeyDown={handleSearchKey}
            />

            {search && (
              <button
                className="clear-search"
                onClick={() => {
                  setSearch("");
                  setOpenItem(null);
                }}
              >
                ×
              </button>
            )}
          </div>

          <button
            className="action-btn scanner-btn"
            onClick={() => setScanning(true)}
            title="Escanear código"
          >
            📷
          </button>

          <button
            className="action-btn pdf-btn"
            onClick={() => setShowPDFModal(true)}
          >
            📄 <span>PDF</span>
          </button>

          <button
            className="action-btn export-btn"
            onClick={exportJSON}
          >
            📤 <span>Exportar</span>
          </button>

          <button
            className="action-btn import-btn"
            onClick={() =>
              document
                .getElementById("import-json")
                .click()
            }
          >
            📥 <span>Importar</span>
          </button>

          <input
            id="import-json"
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={importJSON}
          />
        </div>

        {/* ABAS */}
        <div className="tabs">
          <button
            className={`tab-btn estoque ${
              tab === "estoque" ? "active" : ""
            }`}
            onClick={() => setTab("estoque")}
          >
            <span className="tab-icon">📦</span>
            <span>Estoque</span>
            <b>{count.estoque}</b>
          </button>

          <button
            className={`tab-btn uso ${
              tab === "uso" ? "active" : ""
            }`}
            onClick={() => setTab("uso")}
          >
            <span className="tab-icon">👤</span>
            <span>Em Uso</span>
            <b>{count.uso}</b>
          </button>

          <button
            className={`tab-btn lavagem ${
              tab === "lavagem" ? "active" : ""
            }`}
            onClick={() => setTab("lavagem")}
          >
            <span className="tab-icon">🧺</span>
            <span>Lavagem</span>
            <b>{count.lavagem}</b>
          </button>

          <button
            className={`tab-btn perdidos ${
              tab === "perdidos" ? "active" : ""
            }`}
            onClick={() => setTab("perdidos")}
          >
            <span className="tab-icon">⚠️</span>
            <span>Perdidos</span>
            <b>{count.perdidos}</b>
          </button>

          <button
            className={`tab-btn todos ${
              tab === "todos" ? "active" : ""
            }`}
            onClick={() => setTab("todos")}
          >
            <span className="tab-icon">📋</span>
            <span>Todos</span>
            <b>{count.todos}</b>
          </button>
        </div>

        {/* NOVO MACACÃO */}
        <button
          className="add-btn"
          onClick={() => setShowForm(!showForm)}
        >
          <span className="add-icon">
            {showForm ? "−" : "+"}
          </span>

          {showForm
            ? "Fechar formulário"
            : "Novo Macacão"}
        </button>

        {/* FORMULÁRIO */}
        {showForm && (
          <div className="form">
            <div className="form-header">
              <div>
                <span className="form-eyebrow">
                  {editingId ? "EDIÇÃO" : "CADASTRO"}
                </span>

                <h2>
                  {editingId
                    ? "Editar macacão"
                    : "Cadastrar novo macacão"}
                </h2>
              </div>

              <span className="form-badge">
                {tab === "uso"
                  ? "EM USO"
                  : tab === "lavagem"
                  ? "LAVAGEM"
                  : tab === "perdidos"
                  ? "PERDIDO"
                  : "ESTOQUE"}
              </span>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Número</label>

                <input
                  placeholder="Ex.: 32"
                  value={form.numero}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      numero: e.target.value,
                    })
                  }
                />
              </div>

              <div className="field">
                <label>Código</label>

                <div className="input-with-button">
                  <input
                    placeholder="Código do macacão"
                    value={form.codigo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        codigo: e.target.value,
                      })
                    }
                  />

                  <button
                    onClick={() =>
                      setScanning(true)
                    }
                    title="Escanear código"
                  >
                    📷
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Tamanho</label>

                <input
                  placeholder="Ex.: M"
                  value={form.tamanho}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tamanho: e.target.value,
                    })
                  }
                />
              </div>

              {/* =================================================
                  DATA CORRIGIDA
                  
                  NÃO USAMOS MAIS type="date".
                  
                  Agora aparece:
                  DD/MM/AAAA
              ================================================= */}
              <div className="field">
                <label>Data</label>

                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="DD/MM/AAAA"
                  value={form.data}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      data: formatarInputData(
                        e.target.value
                      ),
                    })
                  }
                />

                <small
                  style={{
                    display: "block",
                    marginTop: "5px",
                    opacity: 0.7,
                  }}
                >
                  Digite no formato dia/mês/ano
                </small>
              </div>

              {tab === "uso" && (
                <div className="field full">
                  <label>
                    Nome da pessoa
                  </label>

                  <input
                    placeholder="Nome de quem está usando"
                    value={form.nome}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        nome: e.target.value,
                      })
                    }
                  />
                </div>
              )}
            </div>

            <div className="form-actions">
              <button
                className="save-btn"
                onClick={addItem}
              >
                {editingId
                  ? "✓ Atualizar"
                  : "✓ Salvar"}
              </button>

              <button
                className="cancel-btn"
                onClick={cancelEdit}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* INDICADOR DA PESQUISA */}
        {search.trim() && (
          <div className="search-result-info">
            <span>🔎</span>

            <span>
              Pesquisando por:
              <strong>
                {" "}
                "{search}"
              </strong>
            </span>

            <span className="result-count">
              {filtered.length} resultado
              {filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* LISTA */}
        <div className="list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                {search
                  ? "🔍"
                  : tab === "perdidos"
                  ? "🎉"
                  : "📦"}
              </div>

              <h3>
                {search
                  ? "Nenhum resultado encontrado"
                  : "Nenhum macacão nesta aba"}
              </h3>

              <p>
                {search
                  ? "Tente pesquisar por outro código, nome, número ou tamanho."
                  : "Os macacões cadastrados aparecerão aqui."}
              </p>
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className={`item ${
                  openItem === item.id
                    ? "expanded"
                    : ""
                } ${
                  item.perdido
                    ? "item-lost"
                    : ""
                }`}
              >
                {/* PERDIDO */}
                <button
                  className={`item-action p ${
                    item.perdido
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    toggleP(item.id)
                  }
                  title={
                    item.perdido
                      ? "Remover dos perdidos"
                      : "Marcar como perdido"
                  }
                >
                  P
                </button>

                {/* ARMÁRIO */}
                {tab === "uso" &&
                  item.status === "uso" &&
                  !item.perdido && (
                    <button
                      className={`item-action armario ${
                        item.devolvidoArmario
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        toggleArmario(
                          item.id
                        )
                      }
                      title={
                        item.devolvidoArmario
                          ? "Macacão marcado como devolvido ao armário"
                          : "Marcar como devolvido ao armário"
                      }
                    >
                      🗄️
                    </button>
                  )}

                {/* INFORMAÇÕES */}
                <div
                  className="item-main"
                  onClick={() =>
                    setOpenItem(
                      openItem === item.id
                        ? null
                        : item.id
                    )
                  }
                >
                  <div className="item-heading">
                    <div>
                      <span className="item-label">
                        MACACÃO
                      </span>

                      <strong>
                        {item.numero}
                      </strong>
                    </div>

                    <span
                      className={`status-pill ${item.status} ${
                        item.perdido
                          ? "lost"
                          : ""
                      }`}
                    >
                      {item.perdido
                        ? "PERDIDO"
                        : item.status === "uso"
                        ? "EM USO"
                        : item.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="item-summary">
                    <span>
                      <small>Código</small>
                      {item.codigo}
                    </span>

                    <span>
                      <small>Tamanho</small>
                      {item.tamanho || "—"}
                    </span>

                    {item.status === "uso" &&
                      item.nome && (
                        <span>
                          <small>Nome</small>
                          {item.nome}
                        </span>
                      )}
                  </div>

                  {/* DETALHES */}
                  {openItem === item.id && (
                    <div className="item-details">
                      <div className="detail">
                        <span>Código</span>

                        <strong>
                          {item.codigo || "—"}
                        </strong>
                      </div>

                      <div className="detail">
                        <span>Número</span>

                        <strong>
                          {item.numero || "—"}
                        </strong>
                      </div>

                      <div className="detail">
                        <span>Tamanho</span>

                        <strong>
                          {item.tamanho || "—"}
                        </strong>
                      </div>

                      <div className="detail">
                        <span>Data</span>

                        <strong>
                          {item.data
                            ? formatarData(
                                item.data
                              )
                            : "—"}
                        </strong>
                      </div>

                      {item.status === "uso" && (
                        <>
                          <div className="detail full-detail">
                            <span>Nome</span>

                            <strong>
                              {item.nome || "—"}
                            </strong>
                          </div>

                          <div className="detail full-detail">
                            <span>
                              Devolvido ao armário
                            </span>

                            <strong
                              className={
                                item.devolvidoArmario
                                  ? "yes"
                                  : "no"
                              }
                            >
                              {item.devolvidoArmario
                                ? "✓ Sim"
                                : "✕ Não"}
                            </strong>
                          </div>
                        </>
                      )}

                      {item.status ===
                        "lavagem" &&
                        !item.perdido && (
                          <div className="detail full-detail">
                            <span>
                              Data final
                            </span>

                            <strong>
                              {calcularDataFinal(
                                item.data
                              )}
                            </strong>
                          </div>
                        )}
                    </div>
                  )}
                </div>

                {/* STATUS */}
                {!item.perdido && (
                  <button
                    className={`status-change ${item.status}`}
                    onClick={() =>
                      toggleStatus(item.id)
                    }
                    title="Alterar status"
                  >
                    {item.status === "estoque"
                      ? "📦 Estoque"
                      : item.status === "lavagem"
                      ? "🧺 Lavagem"
                      : item.status === "uso"
                      ? "👤 Em Uso"
                      : item.status}
                  </button>
                )}

                {/* EDITAR */}
                <button
                  className="item-action edit"
                  onClick={() =>
                    startEdit(item)
                  }
                  title="Editar"
                >
                  ✏️
                </button>

                {/* EXCLUIR */}
                <button
                  className="item-action delete"
                  onClick={() =>
                    removeItem(item.id)
                  }
                  title="Excluir"
                >
                  ❌
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* =====================================================
          MODAL PDF
      ===================================================== */}

      {showPDFModal && (
        <div
          className="modal-overlay"
          onClick={() =>
            !pdfLoading &&
            setShowPDFModal(false)
          }
        >
          <div
            className="pdf-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="modal-icon">
              📄
            </div>

            <h2>
              Gerar relatório PDF
            </h2>

            <p>
              Escolha qual parte do sistema
              você deseja colocar no relatório.
            </p>

            <div className="pdf-options">
              <button
                onClick={() =>
                  gerarPDF("estoque")
                }
              >
                <span>📦</span>

                <div>
                  <strong>
                    Estoque
                  </strong>

                  <small>
                    {count.estoque} macacões
                  </small>
                </div>
              </button>

              <button
                onClick={() =>
                  gerarPDF("lavagem")
                }
              >
                <span>🧺</span>

                <div>
                  <strong>
                    Lavagem
                  </strong>

                  <small>
                    {count.lavagem} macacões
                  </small>
                </div>
              </button>

              <button
                onClick={() =>
                  gerarPDF("uso")
                }
              >
                <span>👤</span>

                <div>
                  <strong>
                    Em Uso
                  </strong>

                  <small>
                    {count.uso} macacões
                  </small>
                </div>
              </button>

              <button
                onClick={() =>
                  gerarPDF("perdidos")
                }
              >
                <span>⚠️</span>

                <div>
                  <strong>
                    Perdidos
                  </strong>

                  <small>
                    {count.perdidos} macacões
                  </small>
                </div>
              </button>

              <button
                className="pdf-all"
                onClick={() =>
                  gerarPDF("todos")
                }
              >
                <span>📋</span>

                <div>
                  <strong>
                    Todos
                  </strong>

                  <small>
                    Relatório completo
                  </small>
                </div>
              </button>
            </div>

            <button
              className="modal-cancel"
              onClick={() =>
                setShowPDFModal(false)
              }
              disabled={pdfLoading}
            >
              Cancelar
            </button>

            {pdfLoading && (
              <div className="pdf-loading">
                Gerando relatório...
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          SCANNER
      ===================================================== */}

      {scanning && (
        <div className="camera">
          <div className="scanner-card">
            <Scanner
              onScan={handleScan}
            />

            <button
              className="scanner-close"
              onClick={() =>
                setScanning(false)
              }
            >
              Fechar scanner
            </button>
          </div>
        </div>
      )}
    </div>
  );
}