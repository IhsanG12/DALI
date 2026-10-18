// Qr.jsx — showing and scanning a shelter's join QR code.
//
// A shelter's printed card has a QR code that holds two things:
//   the join code      proves this is a real, registered shelter (checked by the server)
//   the network phrase unlocks protected names (stays on shelter devices, never sent)
// Scanning saves volunteers from typing both at 2 a.m.

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import QrScanner from "qr-scanner";

const PREFIX = "TETHER1";

export const joinQrText = (joinCode, phrase) => `${PREFIX}|${joinCode}|${phrase}`;

export function parseJoinQr(text) {
  const [prefix, joinCode, phrase] = String(text).split("|");
  return prefix === PREFIX && joinCode && phrase ? { joinCode, phrase } : null;
}

export function ShowQr({ text, label }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setSrc);
  }, [text]);
  return src ? <img className="qr" src={src} alt={label} width="240" height="240" /> : null;
}

export function ScanQr({ onResult, onCancel }) {
  const video = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const scanner = new QrScanner(
      video.current,
      (result) => {
        const parsed = parseJoinQr(result.data);
        if (parsed) {
          scanner.stop();
          onResult(parsed);
        } else {
          setError("That isn't a Tether shelter code. Try the QR on the shelter's card.");
        }
      },
      { returnDetailedScanResult: true, highlightScanRegion: true }
    );
    scanner.start().catch(() => setError("Couldn't open the camera. You can type the code instead."));
    return () => scanner.destroy();
  }, [onResult]);

  return (
    <div className="scanner">
      <video ref={video} muted playsInline />
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={onCancel}>Type the code instead</button>
    </div>
  );
}
