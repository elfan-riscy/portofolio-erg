// ==============================
// ERG Multimedia Dashboard - FULL (Final)
// - Semua fitur: jobs, transactions, export CSV, nota PDF (penomoran),
//   chart, rekapan keuangan, tabungan (add/delete).
// ==============================

import { db } from "./firebase-config.js";
import {
  collection, addDoc, onSnapshot, updateDoc, deleteDoc, doc,
  serverTimestamp, query, orderBy, getDocs, getDoc, setDoc,
  increment, where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export function initDashboard() {
  console.log("✅ ERG Dashboard init");

  // ---------- DOM ----------
  const jobForm = document.getElementById("jobForm");
  const jobTableBody = document.getElementById("jobTableBody");
  const filterStatus = document.getElementById("filterStatus");
  const exportJobsBtn = document.getElementById("exportJobs");
  const exportTrxBtn = document.getElementById("exportTrx");
  const trxList = document.getElementById("trxList");
  const totalJobs = document.getElementById("totalJobs");
  const doneJobs = document.getElementById("doneJobs");
  const totalIncomeEl = document.getElementById("totalIncome");
  const ctx = document.getElementById("incomeChart").getContext("2d");

  // Rekapan UI (pemasukan bersih)
  const rekapPemasukanEl = document.getElementById("rekapPemasukan");
  const rekapBersihEl = document.getElementById("rekapBersih");
  const inputPengeluaran = document.getElementById("inputPengeluaran");
  const simpanPengeluaran = document.getElementById("simpanPengeluaran");

  // Tabungan UI
  const tabTanggal = document.getElementById("tabTanggal");
  const tabJenis = document.getElementById("tabJenis");
  const tabNominal = document.getElementById("tabNominal");
  const tabKet = document.getElementById("tabKet");
  const simpanTabungan = document.getElementById("simpanTabungan");
  const tabelTabungan = document.getElementById("tabelTabungan");
  const saldoTabungan = document.getElementById("saldoTabungan");

  // ---------- Refs ----------
  const jobsRef = collection(db, "jobs");
  const trxRef = collection(db, "transactions");
  const tabunganRef = collection(db, "tabungan");
  const notaCounterRef = doc(db, "config", "nota_counter");
  const rekapanRef = doc(db, "config", "rekapan_keuangan");

  // ---------- Local caches & state ----------
  let latestJobs = [];
  let latestTrx = [];
  let incomeChart = null;
  let totalPemasukan = 0;
  let totalPengeluaran = 0;

  // -------------------------
  // 1) ADD JOB -> also create transaction pending
  // -------------------------
  if (jobForm) {
    jobForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nama = document.getElementById("projectName").value.trim();
      const client = document.getElementById("clientName").value.trim();
      const category = document.getElementById("category").value;
      const price = Number(document.getElementById("price").value) || 0;
      const notes = document.getElementById("notes").value.trim();

      if (!nama || !client) return alert("Nama project & klien wajib diisi.");

      try {
        const created = serverTimestamp();
        const jobDocRef = await addDoc(jobsRef, { nama, client, category, price, notes, status: "masuk", created });
        await addDoc(trxRef, { jobId: jobDocRef.id, total: price, status: "pending", tanggal: created });
        jobForm.reset();
        alert("✅ Job & transaksi ditambahkan.");
      } catch (err) {
        alert("❌ Gagal menambah job: " + err.message);
      }
    });
  }

  // -------------------------
  // 2) Realtime listeners - jobs & transactions
  // -------------------------
  const jobsQ = query(jobsRef, orderBy("created", "desc"));
  onSnapshot(jobsQ, (snap) => {
    latestJobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderJobs(latestJobs);
    updateStats(latestJobs);
  });

  const trxQ = query(trxRef, orderBy("tanggal", "desc"));
  onSnapshot(trxQ, (snap) => {
    latestTrx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTransactions(latestTrx);
    updateTotalIncome(latestTrx); // will also update chart & rekapan UI
  });

  // ==============================
// FILTER STATUS JOB
// ==============================
filterStatus.addEventListener("change", () => {
  const filter = filterStatus.value;
  const filtered = filter === "all"
    ? latestJobsCache
    : latestJobsCache.filter((j) => j.status === filter);
  renderJobsTable(filtered);
});


  // -------------------------
  // 3) Render jobs table
  // -------------------------
  function renderJobs(jobs) {
    if (!jobTableBody) return;
    jobTableBody.innerHTML = "";
    const filter = filterStatus?.value || "all";
    const filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);

    filtered.forEach(j => {
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

    document.querySelectorAll(".statusSel").forEach(sel => {
      sel.onchange = async () => {
        try { await updateDoc(doc(db, "jobs", sel.dataset.id), { status: sel.value }); }
        catch (e) { console.warn(e); }
      };
    });

    document.querySelectorAll(".btn-delete").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.id;
        if (!confirm("Hapus job dan transaksi terkait?")) return;
        try {
          // delete related transactions
          const rel = query(trxRef, where("jobId", "==", id));
          const snap = await getDocs(rel);
          const deletes = snap.docs.map(d => deleteDoc(doc(db, "transactions", d.id)));
          await Promise.all(deletes);
          await deleteDoc(doc(db, "jobs", id));
        } catch (err) { console.warn(err); }
      };
    });
  }

  // -------------------------
  // 4) Render transactions (last N) + status change + nota button
  // -------------------------
  function renderTransactions(trxs) {
    if (!trxList) return;
    trxList.innerHTML = "";
    trxs.slice(0, 8).forEach(t => {
      const date = t.tanggal?.toDate ? t.tanggal.toDate().toLocaleString("id-ID") : (t.tanggal ? new Date(t.tanggal).toLocaleString("id-ID") : "");
      const notaBtn = t.status === "lunas" ? `<button class="btn btn-sm btn-outline-primary btn-nota" data-id="${t.id}">🧾 Nota</button>` : "";
      const row = document.createElement("div");
      row.className = "border-bottom py-1 small d-flex justify-content-between align-items-center";
      row.innerHTML = `
        <div>Rp ${Number(t.total || 0).toLocaleString("id-ID")} - 
          <select data-id="${t.id}" class="form-select form-select-sm d-inline w-auto trxStatusSel">
            <option value="pending" ${t.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="lunas" ${t.status === "lunas" ? "selected" : ""}>Lunas</option>
          </select>
        </div>
        <div>${notaBtn} <small class="text-muted">${date}</small></div>
      `;
      trxList.appendChild(row);
    });

    document.querySelectorAll(".trxStatusSel").forEach(sel => {
      sel.onchange = async () => {
        try { await updateDoc(doc(db, "transactions", sel.dataset.id), { status: sel.value }); }
        catch (e) { console.warn(e); }
      };
    });

    document.querySelectorAll(".btn-nota").forEach(btn => {
      btn.onclick = () => generateNotaPDF(btn.dataset.id);
    });
  }

  // -------------------------
  // 5) EXPORT CSV (jobs & transactions)
  // -------------------------
  if (exportJobsBtn) exportJobsBtn.onclick = exportJobs;
  if (exportTrxBtn) exportTrxBtn.onclick = exportTransactions;

  async function exportJobs() {
    try {
      const snap = await getDocs(jobsRef);
      const rows = [["Nama Project","Klien","Kategori","Harga","Status","Tanggal","Catatan"]];
      snap.docs.forEach(d => {
        const j = d.data();
        const tgl = j.created?.toDate ? j.created.toDate().toLocaleDateString("id-ID") : "";
        rows.push([j.nama, j.client, j.category, j.price, j.status, tgl, j.notes]);
      });
      downloadCSV(rows, "jobs_export.csv");
    } catch (e) { alert("Gagal export jobs: " + e.message); }
  }

  async function exportTransactions() {
    try {
      const snap = await getDocs(trxRef);
      const rows = [["Tanggal","Job ID","Status","Total"]];
      snap.docs.forEach(d => {
        const t = d.data();
        const date = t.tanggal?.toDate ? t.tanggal.toDate().toLocaleString("id-ID") : (t.tanggal ? new Date(t.tanggal).toLocaleString("id-ID") : "");
        rows.push([date, t.jobId, t.status, t.total]);
      });
      downloadCSV(rows, "transactions_export.csv");
    } catch (e) { alert("Gagal export transaksi: " + e.message); }
  }

  function downloadCSV(rows, filename) {
    const csv = rows.map(r => r.map(x => `"${String(x ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }

  // -------------------------
  // 6) NOTA PDF (professional) + penomoran + cap LUNAS
  // -------------------------
  async function getNextNotaNumber() {
    try {
      const snap = await getDoc(notaCounterRef);
      if (!snap.exists()) {
        await setDoc(notaCounterRef, { lastNumber: 1 });
        return 1;
      }
      const last = snap.data().lastNumber || 0;
      await updateDoc(notaCounterRef, { lastNumber: increment(1) });
      return last + 1;
    } catch (e) {
      console.warn("getNextNotaNumber:", e);
      // fallback random small number
      return Math.floor(Math.random() * 9000) + 100;
    }
  }

  async function generateNotaPDF(trxId) {
    console.log("Generate nota:", trxId);
    const { jsPDF } = window.jspdf || {};
    if (!window.jspdf || !jsPDF) return alert("jsPDF belum ter-load.");

    const trx = latestTrx.find(t => t.id === trxId);
    if (!trx) return alert("Transaksi tidak ditemukan.");
    const job = latestJobs.find(j => j.id === trx.jobId) || {};

    // nomor nota
    const no = await getNextNotaNumber();
    const notaCode = `ERG/INV/${String(no).padStart(4,"0")}`;

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // load images (compressed)
    const logo = await loadImageToBase64("logo.png");
    const ttd = await loadImageToBase64("ttd_founder.png");
    const capLunas = await loadImageToBase64("lunas.png");

    // header
    if (logo) pdf.addImage(logo, "PNG", 15, 10, 28, 28);
    pdf.setFontSize(18);
    pdf.setTextColor(11,105,255);
    pdf.text("ERG MULTIMEDIA CREATIVE", 48, 20);
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    pdf.text("Nota Pembayaran Layanan Multimedia", 48, 27);
    pdf.setFontSize(11);
    pdf.setTextColor(11,105,255);
    pdf.text(notaCode, pageWidth - 18, 20, { align: "right" });
    pdf.setDrawColor(11,105,255);
    pdf.line(10, 38, pageWidth - 10, 38);

    // info
    const tanggal = trx.tanggal?.toDate ? trx.tanggal.toDate().toLocaleString("id-ID") : (trx.tanggal ? new Date(trx.tanggal).toLocaleString("id-ID") : "-");
    pdf.setFontSize(11);
    pdf.setTextColor(0);
    pdf.text(`Tanggal : ${tanggal}`, 15, 50);
    pdf.text(`Klien   : ${job.client || "-"}`, 15, 57);
    pdf.text(`Project : ${job.nama || "-"}`, 15, 64);
    pdf.text(`Kategori: ${job.category || "-"}`, 15, 71);
    pdf.text(`Catatan : ${job.notes || "-"}`, 15, 78);
    pdf.text(`Status  : ${trx.status}`, 15, 85);

    // table (autoTable)
    pdf.autoTable({
      startY: 95,
      head: [["No", "Deskripsi", "Catatan", "Harga (Rp)"]],
      body: [[1, job.nama || "-", job.notes || "-", Number(trx.total || 0).toLocaleString("id-ID")]],
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [11,105,255], textColor: 255 },
      columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 95 }, 2: { cellWidth: 50 }, 3: { cellWidth: 30, halign: "right" } }
    });

    const totalY = pdf.lastAutoTable.finalY + 8;
    pdf.setFontSize(12);
    pdf.setTextColor(11,105,255);
    pdf.text(`Total Pembayaran: Rp ${Number(trx.total || 0).toLocaleString("id-ID")}`, pageWidth - 15, totalY, { align: "right" });

    // cap LUNAS
    if (trx.status === "lunas" && capLunas) {
      try {
        pdf.setGState(new pdf.GState({ opacity: 0.25 }));
      } catch(e) { /* old jspdf might not support GState; ignore */ }
      // try center stamp
      pdf.addImage(capLunas, "PNG", pageWidth/2 - 30, totalY + 8, 60, 60);
      try { pdf.setGState(new pdf.GState({ opacity: 1 })); } catch(e){}
    }

    // tanda tangan
    const signY = totalY + 70;
    pdf.setFontSize(11);
    pdf.setTextColor(0);
    pdf.text("Hormat Kami,", pageWidth - 55, signY);
    if (ttd) pdf.addImage(ttd, "PNG", pageWidth - 65, signY + 4, 40, 25);
    pdf.text("(Founder ERG)", pageWidth - 45, signY + 34);

    // footer
    // footer (alamat kamu)
pdf.setFontSize(9);
pdf.setTextColor(120);
pdf.text("Terima kasih telah menggunakan layanan ERG Multimedia Creative", pageWidth/2, pageHeight - 18, { align: "center" });
pdf.text("Jl. Raya Dieng Batur - Dieng No.05 km, Dusun Gembol 2, Gembol, Kec. Pejawaran, Kab. Banjarnegara, Jawa Tengah | erg-elfanriscy.my.id", pageWidth/2, pageHeight - 10, { align: "center" });


    // save
    pdf.save(`Nota-${notaCode}.pdf`);
  }

  // -------------------------
  // image helper (resize & compress to jpeg dataURL)
  // -------------------------
  async function loadImageToBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      // Buat canvas dengan ukuran gambar asli
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // set ukuran sesuai gambar
      canvas.width = img.width;
      canvas.height = img.height;

      // gambar tetap dengan alpha channel (transparan)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // hasilkan base64 PNG (bukan JPEG)
      const dataURL = canvas.toDataURL("image/png"); // <-- ini penting!
      resolve(dataURL);
    };
    img.onerror = reject;
    img.src = url;
  });
}


  // -------------------------
  // 7) REKAPAN KEUANGAN (pemasukan bersih)
  // -------------------------
  onSnapshot(rekapanRef, (snap) => {
    if (snap.exists && snap.exists()) {
      totalPengeluaran = snap.data().pengeluaran || 0;
      if (inputPengeluaran) inputPengeluaran.value = totalPengeluaran;
    } else {
      totalPengeluaran = 0;
      if (inputPengeluaran) inputPengeluaran.value = "";
    }
    refreshRekapUI();
  });

  if (simpanPengeluaran) {
    simpanPengeluaran.onclick = async () => {
      const nilai = Number(inputPengeluaran.value) || 0;
      totalPengeluaran = nilai;
      refreshRekapUI();
      try { await setDoc(rekapanRef, { pengeluaran: nilai }, { merge: true }); alert("✅ Pengeluaran disimpan"); }
      catch (e) { alert("Gagal menyimpan: " + e.message); }
    };
  }

  function refreshRekapUI() {
    if (rekapPemasukanEl) rekapPemasukanEl.textContent = "Rp " + totalPemasukan.toLocaleString("id-ID");
    const bersih = totalPemasukan - totalPengeluaran;
    if (rekapBersihEl) {
      rekapBersihEl.textContent = "Rp " + bersih.toLocaleString("id-ID");
      rekapBersihEl.className = "fw-bold " + (bersih >= 0 ? "text-success" : "text-danger");
    }
  }

  // -------------------------
  // 8) TABUNGAN (add / realtime list / delete)
  // -------------------------
  if (simpanTabungan) {
    simpanTabungan.onclick = async () => {
      const data = {
        tanggal: tabTanggal?.value || new Date().toISOString().split("T")[0],
        jenis: tabJenis?.value || "setoran",
        nominal: Number(tabNominal?.value) || 0,
        keterangan: tabKet?.value || "-",
        created: serverTimestamp()
      };
      if (data.nominal <= 0) return alert("Nominal harus > 0");
      try {
        await addDoc(tabunganRef, data);
        tabNominal.value = ""; tabKet.value = "";
      } catch (e) { alert("Gagal tambah tabungan: " + e.message); }
    };
  }

  const qTab = query(tabunganRef, orderBy("created", "desc"));
  onSnapshot(qTab, (snap) => {
    if (!tabelTabungan) return;
    let html = "";
    let saldo = 0;
    snap.forEach(d => {
      const t = d.data();
      const id = d.id;
      html += `<tr>
        <td>${t.tanggal || "-"}</td>
        <td>${t.jenis === "setoran" ? "➕ Setoran" : "➖ Penarikan"}</td>
        <td>Rp ${Number(t.nominal || 0).toLocaleString("id-ID")}</td>
        <td>${escapeHtml(t.keterangan || "-")}</td>
        <td><button class="btn btn-sm btn-outline-danger btn-hapus-tab" data-id="${id}">Hapus</button></td>
      </tr>`;
      saldo += (t.jenis === "setoran" ? Number(t.nominal || 0) : -Number(t.nominal || 0));
    });
    tabelTabungan.innerHTML = html;
    if (saldoTabungan) {
      saldoTabungan.textContent = "Rp " + saldo.toLocaleString("id-ID");
      saldoTabungan.className = "fw-bold " + (saldo >= 0 ? "text-success" : "text-danger");
    }

    // attach delete handlers
    document.querySelectorAll(".btn-hapus-tab").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.id;
        if (!confirm("Hapus data tabungan ini?")) return;
        try { await deleteDoc(doc(db, "tabungan", id)); } catch (e) { console.warn(e); }
      };
    });
  });

  // -------------------------
  // 9) TOTAL & CHART (6 months)
  // -------------------------
  function updateTotalIncome(trxs) {
    const lunas = trxs.filter(t => t.status === "lunas");
    totalPemasukan = lunas.reduce((a,t) => a + (Number(t.total)||0), 0);
    if (totalIncomeEl) totalIncomeEl.textContent = "Rp " + totalPemasukan.toLocaleString("id-ID");
    refreshRekapUI();
    updateIncomeChart(lunas);
  }

  function updateIncomeChart(trxs) {
    // trxs are expected to have tanggal either Timestamp or ISO string
    const map = {};
    trxs.forEach(t => {
      let d;
      if (t.tanggal?.toDate) d = t.tanggal.toDate();
      else if (t.tanggal) d = new Date(t.tanggal);
      else d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      map[key] = (map[key]||0) + (Number(t.total)||0);
    });

    const months = getLastNMonths(6);
    const labels = months.map(formatMonthLabel);
    const data = months.map(m => map[m] || 0);

    if (!incomeChart) {
      incomeChart = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "Pendapatan (Rp)", data, backgroundColor: "#0d6efd" }] },
        options: {
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } },
          maintainAspectRatio: false
        }
      });
    } else {
      incomeChart.data.labels = labels;
      incomeChart.data.datasets[0].data = data;
      incomeChart.update();
    }
  }

  function getLastNMonths(n) {
    const out = [];
    const now = new Date();
    for (let i = n-1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
    }
    return out;
  }
  function formatMonthLabel(k) {
    const [y,m] = k.split("-");
    const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    return `${months[Number(m)-1]} ${y}`;
  }

  // -------------------------
  // 10) Stats
  // -------------------------
  function updateStats(jobs) {
    if (totalJobs) totalJobs.textContent = jobs.length;
    if (doneJobs) doneJobs.textContent = jobs.filter(j => j.status === "selesai").length;
  }

  // -------------------------
  // Utilities
  // -------------------------
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  }

} // end initDashboard

