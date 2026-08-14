import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function Scanner({ onScan }) {
  const runningRef = useRef(false);
  const lastCodeRef = useRef("");
  const cooldownRef = useRef(false);

  useEffect(() => {
    const qrRegionId = "reader";
    const scanner = new Html5Qrcode(qrRegionId);

    const start = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();

        if (!devices || devices.length === 0) {
          alert("Nenhuma câmera encontrada");
          return;
        }

        const cameraId = devices[0].id;

        await scanner.start(
          cameraId,
          {
            fps: 10,
            qrbox: 250,
          },
          async (decodedText) => {
            // 🔥 bloqueia leitura duplicada rápida
            if (cooldownRef.current) return;

            if (decodedText === lastCodeRef.current) return;

            lastCodeRef.current = decodedText;
            cooldownRef.current = true;

            onScan(decodedText);

            // para scanner após leitura válida
            try {
              await scanner.stop();
            } catch {}

            runningRef.current = false;

            // libera leitura depois de um tempo (anti bug)
            setTimeout(() => {
              cooldownRef.current = false;
            }, 1500);
          },
          () => {
            // ignorar erros de frame
          }
        );

        runningRef.current = true;
      } catch (err) {
        console.error("Erro scanner:", err);
        alert("Erro ao iniciar câmera. Veja o console.");
      }
    };

    start();

    return () => {
      if (runningRef.current) {
        scanner.stop().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 500,
        marginTop: 20,
      }}
    >
      <div
        id="reader"
        style={{
          width: "100%",
          minHeight: 350,
          borderRadius: 12,
          overflow: "hidden",
          background: "#000",
        }}
      />
    </div>
  );
}