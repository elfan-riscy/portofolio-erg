// dashboard.js (ERG Digital Invoice System v2)
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
  where,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---------------- DOM refs ---------------- */
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

let incomeChart = null;
let latestJobsCache = [];
let latestTrxCache = [];

/* ---------------- Firestore refs ---------------- */
const jobsRef = collection(db, "jobs");
const trxRef = collection(db, "transactions");

/* ---------------- Tambah Job Otomatis + Transaksi Pending ---------------- */
if (jobForm) {
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

      // Tambahkan job
      const jobRef = await addDoc(jobsRef, {
        nama,
        client,
        category,
        price,
        notes,
        status: "masuk",
        created: createdAt,
      });

      // Tambahkan transaksi otomatis
      await addDoc(trxRef, {
        jobId: jobRef.id,
        total: price,
        status: "pending",
        tanggal: createdAt,
      });

      alert("✅ Job dan transaksi otomatis ditambahkan!");
      jobForm.reset();
    } catch (err) {
      alert("❌ Gagal menambah job: " + err.message);
    }
  });
}

/* ---------------- Realtime Firestore ---------------- */
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

/* ---------------- Filter Status ---------------- */
if (filterStatus) {
  filterStatus.addEventListener("change", () => renderJobsTable(latestJobsCache));
}

/* ---------------- Render Jobs Table ---------------- */
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
      <td><button class="btn btn-sm btn-outline-danger btn-delete" data-id="${j.id}">Hapus</button></td>`;
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
        alert("✅ Job & transaksi terkait dihapus!");
      }
    };
  });
}

/* ---------------- Render Transaksi ---------------- */
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
    btn.onclick = () => generateNotaPDF(btn.dataset.id);
  });
}

/* ---------------- Generate Nota Digital Premium ---------------- */
async function generateNotaPDF(trxId) {
  const { jsPDF } = window.jspdf;
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("⚠️ jsPDF belum ter-load, periksa koneksi internet.");
    return;
  }

  const tDoc = latestTrxCache.find((t) => t.id === trxId);
  if (!tDoc) return alert("Data transaksi tidak ditemukan.");
  const job = latestJobsCache.find((j) => j.id === tDoc.jobId);

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();

  // Load logo dan ttd founder
  const logo = await loadImageToBase64("logo.png");
  const ttd = await loadImageToBase64("ttd_founder.png");

  /* === HEADER === */
  if (logo) pdf.addImage(logo, "PNG", 15, 10, 25, 25);
  pdf.setFontSize(18);
  pdf.setTextColor(11, 105, 255);
  pdf.text("ERG MULTIMEDIA CREATIVE", 45, 20);
  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text("Jasa Desain, Fotografi, Videografi, dan Multimedia Profesional", 45, 27);
  pdf.setDrawColor(11, 105, 255);
  pdf.line(10, 38, pageWidth - 10, 38);

  /* === WATERMARK LOGO TRANSPARAN === */
  if (logo) {
    pdf.addImage(logo, "PNG", 60, 90, 90, 90, "", "FAST");
    pdf.setGState(new pdf.GState({ opacity: 0.08 }));
  }

  /* === INFO UTAMA (2 kolom) === */
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(11);
  const tanggal = tDoc.tanggal?.toDate ? tDoc.tanggal.toDate().toLocaleString("id-ID") : "-";

  pdf.text("📅 Tanggal", 15, 50);
  pdf.text(": " + tanggal, 45, 50);
  pdf.text("👤 Klien", 15, 57);
  pdf.text(": " + (job?.client || "-"), 45, 57);
  pdf.text("💼 Project", 15, 64);
  pdf.text(": " + (job?.nama || "-"), 45, 64);
  pdf.text("📁 Kategori", 15, 71);
  pdf.text(": " + (job?.category || "-"), 45, 71);
  pdf.text("📝 Catatan", 15, 78);
  pdf.text(": " + (job?.notes || "-"), 45, 78);

  pdf.text("Status", 130, 50);
  pdf.text(": " + (tDoc.status === "lunas" ? "Lunas ✅" : "Pending ⏳"), 160, 50);
  pdf.text("Total Harga", 130, 57);
  pdf.text(": Rp " + Number(tDoc.total || 0).toLocaleString("id-ID"), 160, 57);

  /* === TABEL RINCIAN === */
  pdf.autoTable({
    startY: 90,
    head: [["Deskripsi", "Harga (Rp)"]],
    body: [[job?.nama || "-", Number(tDoc.total || 0).toLocaleString("id-ID")]],
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [11, 105, 255], textColor: 255 },
    theme: "striped",
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: "right" }
    },
  });

  /* === TOTAL AKHIR === */
  const totalY = pdf.lastAutoTable.finalY + 10;
  pdf.setFontSize(13);
  pdf.setTextColor(11, 105, 255);
  pdf.text(`Total Pembayaran: Rp ${Number(tDoc.total || 0).toLocaleString("id-ID")}`, pageWidth - 15, totalY, { align: "right" });

  /* === TANDA TANGAN FOUNDER === */
  const signY = totalY + 25;
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.text("Hormat Kami,", pageWidth - 55, signY);
  if (ttd) pdf.addImage(ttd, "PNG", pageWidth - 65, signY + 5, 40, 25);
  pdf.text("(Founder ERG)", pageWidth - 45, signY + 38);

  /* === FOOTER === */
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text("Terima kasih telah menggunakan layanan ERG Multimedia Creative 💙", pageWidth / 2, 285, { align: "center" });
  pdf.text("Jl. Profesionalitas No.1, Makassar | www.ergcreative.com", pageWidth / 2, 291, { align: "center" });

  pdf.save(`Nota-${job?.nama || "Project"}.pdf`);
}


/* ---------------- Helper ---------------- */
async function loadImageToBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
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
      options: { maintainAspectRatio: false },
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
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${months[Number(m) - 1]} ${y}`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
