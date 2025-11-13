// ==============================
// ERG Multimedia Dashboard (Final Stable + Nota Otomatis)
// ==============================
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
  getDoc,
  setDoc,
  updateDoc as upd,
  increment,
  where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ==============================
// FUNGSI UTAMA (dipanggil setelah login Firebase)
// ==============================
export function initDashboard() {
  console.log("✅ Dashboard initialized");

  // DOM elements
  const jobForm = document.getElementById("jobForm");
  const jobTableBody = document.getElementById("jobTableBody");
  const filterStatus = document.getElementById("filterStatus");
  const exportJobsBtn = document.getElementById("exportJobs");
  const exportTrxBtn = document.getElementById("exportTrx");
  const trxList = document.getElementById("trxList");
  const totalJobs = document.getElementById("totalJobs");
  const doneJobs = document.getElementById("doneJobs");
  const totalIncome = document.getElementById("totalIncome");
  const ctx = document.getElementById("incomeChart").getContext("2d");

  const jobsRef = collection(db, "jobs");
  const trxRef = collection(db, "transactions");

  let latestJobsCache = [];
  let latestTrxCache = [];
  let incomeChart = null;

  // ==============================
  // TAMBAH JOB + TRANSAKSI OTOMATIS
  // ==============================
  jobForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nama = document.getElementById("projectName").value.trim();
    const client = document.getElementById("clientName").value.trim();
    const category = document.getElementById("category").value;
    const price = Number(document.getElementById("price").value) || 0;
    const notes = document.getElementById("notes").value.trim();

    if (!nama || !client) return alert("Nama project dan klien wajib diisi!");

    try {
      const createdAt = serverTimestamp();
      const jobRef = await addDoc(jobsRef, {
        nama,
        client,
        category,
        price,
        notes,
        status: "masuk",
        created: createdAt
      });

      await addDoc(trxRef, {
        jobId: jobRef.id,
        total: price,
        status: "pending",
        tanggal: createdAt
      });

      jobForm.reset();
      alert("✅ Job & transaksi otomatis ditambahkan!");
    } catch (err) {
      alert("❌ Gagal menambah job: " + err.message);
    }
  });

  // ==============================
  // REALTIME LISTENER
  // ==============================
  const jobsQ = query(jobsRef, orderBy("created", "desc"));
  onSnapshot(jobsQ, (snap) => {
    latestJobsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderJobsTable(latestJobsCache);
    updateStats(latestJobsCache);
  });

  const trxQ = query(trxRef, orderBy("tanggal", "desc"));
  onSnapshot(trxQ, (snap) => {
    latestTrxCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTransactions(latestTrxCache);
    updateTotalIncome(latestTrxCache);
    updateIncomeChart(latestTrxCache);
  });

  // ==============================
  // RENDER JOB TABLE
  // ==============================
  function renderJobsTable(jobs) {
    jobTableBody.innerHTML = "";
    const filter = filterStatus.value || "all";
    const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

    filtered.forEach((j) => {
      const tanggal = j.created?.toDate ? j.created.toDate().toLocaleDateString("id-ID") : "-";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(j.nama)}</td>
        <td>${escapeHtml(j.client)}</td>
        <td>${escapeHtml(j.category || "-")}</td>
        <td>Rp ${Number(j.price || 0).toLocaleString("id-ID")}</td>
        <td>${tanggal}</td>
        <td>${escapeHtml(j.notes || "-")}</td>
        <td>
          <select data-id="${j.id}" class="form-select form-select-sm statusSel">
            <option value="masuk" ${j.status === "masuk" ? "selected" : ""}>Masuk</option>
            <option value="proses" ${j.status === "proses" ? "selected" : ""}>Proses</option>
            <option value="selesai" ${j.status === "selesai" ? "selected" : ""}>Selesai</option>
          </select>
        </td>
        <td><button class="btn btn-sm btn-outline-danger btn-delete" data-id="${j.id}">🗑️</button></td>
      `;
      jobTableBody.appendChild(tr);
    });

    document.querySelectorAll(".statusSel").forEach((sel) => {
      sel.onchange = async () => {
        await updateDoc(doc(db, "jobs", sel.dataset.id), { status: sel.value });
      };
    });

    document.querySelectorAll(".btn-delete").forEach((b) => {
      b.onclick = async () => {
        const jobId = b.dataset.id;
        if (confirm("Hapus job ini beserta transaksi terkait?")) {
          const relTrx = query(trxRef, where("jobId", "==", jobId));
          const snap = await getDocs(relTrx);
          snap.forEach(async (d) => await deleteDoc(doc(db, "transactions", d.id)));
          await deleteDoc(doc(db, "jobs", jobId));
        }
      };
    });
  }

  // ==============================
  // RENDER TRANSAKSI
  // ==============================
  function renderTransactions(trxs) {
    trxList.innerHTML = "";
    trxs.slice(0, 8).forEach((t) => {
      const date = t.tanggal?.toDate ? t.tanggal.toDate().toLocaleString("id-ID") : "";
      const notaBtn = t.status === "lunas" ? `<button class="btn btn-sm btn-outline-primary btn-nota" data-id="${t.id}">🧾 Nota</button>` : "";
      trxList.innerHTML += `
        <div class="d-flex justify-content-between align-items-center border-bottom py-1 small">
          <div>
            Rp ${Number(t.total || 0).toLocaleString("id-ID")} 
            <select data-id="${t.id}" class="form-select form-select-sm d-inline w-auto trxStatusSel">
              <option value="pending" ${t.status === "pending" ? "selected" : ""}>Pending</option>
              <option value="lunas" ${t.status === "lunas" ? "selected" : ""}>Lunas</option>
            </select>
          </div>
          <div>${notaBtn} <span class="text-muted">${date}</span></div>
        </div>`;
    });

    document.querySelectorAll(".trxStatusSel").forEach((sel) => {
      sel.onchange = async () => {
        await updateDoc(doc(db, "transactions", sel.dataset.id), { status: sel.value });
      };
    });

    document.querySelectorAll(".btn-nota").forEach((btn) => {
      btn.addEventListener("click", () => generateNotaPDF(btn.dataset.id));
    });
  }

  // ==============================
  // FUNGSI PENOMORAN NOTA
  // ==============================
  async function getNextNotaNumber() {
    const counterRef = doc(db, "config", "nota_counter");
    const snap = await getDoc(counterRef);

    if (!snap.exists()) {
      await setDoc(counterRef, { lastNumber: 1 });
      return 1;
    }

    const data = snap.data();
    const next = (data.lastNumber || 0) + 1;
    await upd(counterRef, { lastNumber: increment(1) });
    return next;
  }

  // ==============================
  // GENERATE NOTA PDF
  // ==============================
  async function generateNotaPDF(trxId) {
    const { jsPDF } = window.jspdf;
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("⚠️ jsPDF belum ter-load.");
      return;
    }

    const tDoc = latestTrxCache.find((t) => t.id === trxId);
    if (!tDoc) return alert("Data transaksi tidak ditemukan.");
    const job = latestJobsCache.find((j) => j.id === tDoc.jobId);

    // === NOMOR NOTA ===
    const notaNumber = await getNextNotaNumber();
    const notaCode = `ERG/INV/${notaNumber.toString().padStart(4, "0")}`;

    const pdf = new jsPDF({
  orientation: "p",
  unit: "mm",
  format: "a4",
  compress: true,
});
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    const logo = await loadImageToBase64("logo.png");
    const ttd = await loadImageToBase64("ttd_founder.png");
    const capLunas = await loadImageToBase64("lunas.png");

    // === HEADER ===
    if (logo) pdf.addImage(logo, "PNG", 15, 10, 25, 25);
    pdf.setFontSize(18);
    pdf.setTextColor(11, 105, 255);
    pdf.text("ERG MULTIMEDIA CREATIVE", 45, 20);
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text("Nota Pembayaran Layanan Multimedia", 45, 27);
    pdf.setFontSize(11);
    pdf.setTextColor(11, 105, 255);
    pdf.text(notaCode, pageWidth - 20, 20, { align: "right" });
    pdf.setDrawColor(11, 105, 255);
    pdf.line(10, 38, pageWidth - 10, 38);

    // === INFO UTAMA ===
    const tanggal = tDoc.tanggal?.toDate ? tDoc.tanggal.toDate().toLocaleString("id-ID") : "-";
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Tanggal : ${tanggal}`, 15, 50);
    pdf.text(`Klien   : ${job?.client || "-"}`, 15, 57);
    pdf.text(`Project : ${job?.nama || "-"}`, 15, 64);
    pdf.text(`Kategori: ${job?.category || "-"}`, 15, 71);
    pdf.text(`Catatan : ${job?.notes || "-"}`, 15, 78);
    pdf.text(`Status  : ${tDoc.status}`, 15, 85);

    // === TABEL ===
    pdf.autoTable({
      startY: 95,
      head: [["Deskripsi", "Catatan", "Harga (Rp)"]],
      body: [[job?.nama || "-", job?.notes || "-", Number(tDoc.total || 0).toLocaleString("id-ID")]],
      theme: "striped",
      headStyles: { fillColor: [11, 105, 255], textColor: 255 },
    });

    // === TOTAL ===
    const totalY = pdf.lastAutoTable.finalY + 10;
    pdf.setFontSize(12);
    pdf.setTextColor(11, 105, 255);
    pdf.text(`Total Pembayaran: Rp ${Number(tDoc.total || 0).toLocaleString("id-ID")}`, pageWidth - 15, totalY, { align: "right" });

    // === CAP DIGITAL ===
    if (tDoc.status === "lunas" && capLunas) {
      pdf.setGState(new pdf.GState({ opacity: 0.25 }));
      pdf.addImage(capLunas, "PNG", pageWidth / 2 - 25, totalY + 5, 50, 50);
      pdf.setGState(new pdf.GState({ opacity: 1 }));
    }

    // === TTD ===
    const signY = totalY + 35;
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text("Hormat Kami,", pageWidth - 55, signY);
    if (ttd) pdf.addImage(ttd, "PNG", pageWidth - 65, signY + 5, 40, 25);
    pdf.text("(Founder ERG)", pageWidth - 45, signY + 35);

  // === FOOTER ===
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text("Terima kasih telah menggunakan layanan ERG Multimedia Creative", pageWidth / 2, 284, { align: "center" });
  pdf.text("Jl. Raya Dieng Batur - Dieng No.05 km, Dusun Gembol 2, Gembol, Kec. Pejawaran, Kab. Banjarnegara, Jawa Tengah | erg-elfanriscy.my.id", pageWidth / 2, 291, { align: "center" });
    pdf.save(`Nota-${notaCode}.pdf`);
  }

  // ==============================
  // HELPER GAMBAR
  // ==============================
  async function loadImageToBase64(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn("⚠️ Gagal memuat gambar:", url);
      return null;
    }
  }

  // ==============================
  // STATS & CHART
  // ==============================
  function updateStats(jobs) {
    totalJobs.textContent = jobs.length;
    doneJobs.textContent = jobs.filter((j) => j.status === "selesai").length;
  }

  function updateTotalIncome(trxs) {
    const total = trxs.filter((t) => t.status === "lunas").reduce((a, t) => a + (Number(t.total) || 0), 0);
    totalIncome.textContent = "Rp " + total.toLocaleString("id-ID");
  }

  function updateIncomeChart(trxs) {
    const map = {};
    trxs.filter((t) => t.status === "lunas").forEach((t) => {
      if (!t.tanggal?.toDate) return;
      const d = t.tanggal.toDate();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[key] = (map[key] || 0) + (Number(t.total) || 0);
    });
    const months = getLastNMonths(6);
    const labels = months.map(formatMonthLabel);
    const data = months.map((m) => map[m] || 0);
    if (!incomeChart) {
      incomeChart = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "Pendapatan", data, backgroundColor: "#0b69ff" }] },
        options: { maintainAspectRatio: false }
      });
    } else {
      incomeChart.data.labels = labels;
      incomeChart.data.datasets[0].data = data;
      incomeChart.update();
    }
  }

  function getLastNMonths(n) {
    const arr = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return arr;
  }

  function formatMonthLabel(k) {
    const [y, m] = k.split("-");
    const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    return `${months[Number(m) - 1]} ${y}`;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }
}


