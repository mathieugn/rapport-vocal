// Rapport Vocal capture page: pick a report type, record, then share the audio file to iCloud Drive.
// Adding a report type = one line here + Modeles/<type>.docx on the PC.
const TYPES = { visite: "Visite", intervention: "Intervention", reunion: "Réunion" };

// Must match NAME_RE in rapport.py: <type>_YYYY-MM-DD_HHmm.<ext>
function fileName(type, date, mime) {
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
  const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "m4a"; // Safari gives audio/mp4
  return `${type}_${stamp}.${ext}`;
}

if (typeof module !== "undefined") module.exports = { fileName };

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  let type = null, recorder = null, chunks = [], startedAt = null, timer = null, file = null, wakeLock = null;

  for (const [key, label] of Object.entries(TYPES)) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => {
      if (recorder) return;
      type = key;
      document.querySelectorAll("#types button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      $("rec").disabled = false;
      status(`Type : ${label}. Prêt à enregistrer.`);
    };
    b.setAttribute("aria-pressed", "false");
    $("types").append(b);
  }

  function status(t) { $("status").textContent = t; }

  $("rec").onclick = async () => {
    if (recorder) return recorder.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/mp4", "audio/webm", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    } catch (e) {
      return status(`Micro inaccessible : ${e.message}`);
    }
    chunks = [];
    file = null;
    $("share").hidden = true;
    startedAt = new Date();
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      clearInterval(timer);
      wakeLock?.release().catch(() => {});
      const mime = recorder.mimeType || chunks[0]?.type || "audio/mp4";
      file = new File(chunks, fileName(type, startedAt, mime), { type: mime });
      recorder = null;
      $("rec").textContent = "Enregistrer";
      $("rec").classList.remove("on");
      $("share").hidden = false;
      status(`${file.name} (${Math.round(file.size / 1024)} Ko). Touchez « Partager » puis « Enregistrer dans Fichiers ».`);
    };
    recorder.start(1000); // timeslice: keep data if the page is interrupted mid-recording
    // Screen lock stops recording on iOS; keep the screen on while dictating.
    wakeLock = await navigator.wakeLock?.request("screen").catch(() => null);
    $("rec").textContent = "Stop";
    $("rec").classList.add("on");
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      status(`Enregistrement… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    }, 500);
    status("Enregistrement… 0:00");
  };

  // Separate tap: iOS only allows navigator.share() directly inside a user gesture.
  $("share").onclick = async () => {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return status(`${file.name} partagé.`);
      } catch (e) {
        if (e.name === "AbortError") return; // user closed the share sheet
        // Windows Chrome/Edge pass canShare() but reject some types (audio/webm) with NotAllowedError.
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    status(`${file.name} téléchargé (partage indisponible sur cet appareil).`);
  };
}
