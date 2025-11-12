// dashboard.js (profesional)
// Pastikan firebase-config.js ada di folder yang sama dan mengekspor `db`
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
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---------------- DOM refs ---------------- */
const jobForm = document.getElementById("jobForm");
const jobTableBody = document.getElementById("jobTableBody");
const filterStatus = document.getElementById("filterStatus");

const trxForm = document.getElementById("trxForm");
const trxJobSelect = document.getElementById("trxJobSelect");
const trxList = document.getElementById("trxList");

const totalJobs = document.getElementById("totalJobs");
const doneJobs = document.getElementById("doneJobs");
const totalIncome = document.getElementById("totalIncome");

const ctx = document.getElementById("incomeChart").getContext("2d");
let incomeChart = null;

/* ---------------- Firestore refs ---------------- */
const jobsRef = collection(db, "jobs");
const trxRef = collection(db, "transactions");

/* ---------------- Add Job ---------------- */
if (jobForm) {
  jobForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nama = document.getElementById("projectName").value.trim();
    const client = document.getElementById("clientName").value.trim();
    const category = document.getElementById("category").value;
    const price = Number(document.getElementById("price").value) || 0;
    const notes = document.getElementById("notes").value.trim();
    if (!nama || !client) return alert("Nama project & klien wajib.");
    try {
      await addDoc(jobsRef, { nama, client, category, price, notes, status: "masuk", created: serverTimestamp() });
    if (jobForm) {
  jobForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nama = document.getElementById("projectName").value.trim();
    const client = document.getElementById("clientName").value.trim();
    const category = document.getElementById("category").value;
    const price = Number(document.getElementById("price").value) || 0;
    const notes = document.getElementById("notes").value.trim();

    if (!nama || !client) return alert("Nama project & klien wajib.");

    try {
      // 1️⃣ Tambah job baru ke Firestore
      const jobRef = await addDoc(jobsRef, {
        nama,
        client,
        category,
        price,
        notes,
        status: "masuk",
        created: serverTimestamp(),
      });

      // 2️⃣ Tambah transaksi otomatis (status pending)
      await addDoc(trxRef, {
        jobId: jobRef.id,
        total: price,
        status: "pending",
        tanggal: serverTimestamp(),
      });

      jobForm.reset();
      alert("✅ Job dan transaksi otomatis berhasil ditambahkan!");
    } catch (err) {
      console.error(err);
      alert("❌ Gagal menambah job: " + err.message);
    }
  });
}

    } catch (err) {
      console.error(err);
      alert("Gagal menambah job: " + err.message);
    }
  });
}

/* ---------------- Add Transaction ---------------- */
if (trxForm) {
  trxForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const jobId = trxJobSelect.value || null;
    const amount = Number(document.getElementById("trxAmount").value) || 0;
    const status = document.getElementById("trxStatus").value;
    if (!amount) return alert("Isi nominal transaksi.");
    try {
      await addDoc(trxRef, { jobId, total: amount, status, tanggal: serverTimestamp() });
      trxForm.reset();
    } catch (err) {
      console.error(err);
      alert("Gagal tambah transaksi: " + err.message);
    }
  });
}

/* ---------------- Realtime listeners ---------------- */
// Jobs (ordered by created desc)
const jobsQ = query(jobsRef, orderBy("created", "desc"));
onSnapshot(jobsQ, (snap) => {
  const jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderJobsTable(jobs);
  populateJobSelect(jobs);
  updateStats(jobs);
});

// Transactions (latest first)
const trxQ = query(trxRef, orderBy("tanggal", "desc"));
onSnapshot(trxQ, (snap) => {
  const trxs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTransactions(trxs);
  updateIncomeChart(trxs);
  updateTotalIncome(trxs);
});


/* ---------------- Render Jobs Table ---------------- */
function renderJobsTable(jobs) {
  jobTableBody.innerHTML = "";
  const filter = filterStatus ? filterStatus.value : "all";
  const filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);

  filtered.forEach((j) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(j.nama)}</td>
      <td>${escapeHtml(j.client)}</td>
      <td>${escapeHtml(j.category || "-")}</td>
      <td>Rp ${Number(j.price || 0).toLocaleString("id-ID")}</td>
      <td>
        <select data-id="${j.id}" class="form-select form-select-sm statusSel">
          <option value="masuk" ${j.status==='masuk'?'selected':''}>Masuk</option>
          <option value="proses" ${j.status==='proses'?'selected':''}>Proses</option>
          <option value="selesai" ${j.status==='selesai'?'selected':''}>Selesai</option>
        </select>
      </td>
      <td>
        <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${j.id}">Hapus</button>
      </td>
    `;
    jobTableBody.appendChild(tr);
  });

  // attach listeners
  document.querySelectorAll(".statusSel").forEach(sel => {
    sel.onchange = async () => {
      const id = sel.dataset.id;
      await updateDoc(doc(db, "jobs", id), { status: sel.value });
    };
  });
  document.querySelectorAll(".btn-delete").forEach(b => {
  b.onclick = async () => {
    const jobId = b.dataset.id;
    if (confirm("Hapus job ini beserta transaksi terkait?")) {
      try {
        // 1️⃣ Hapus job
        await deleteDoc(doc(db, "jobs", jobId));

        // 2️⃣ Ambil semua transaksi dengan jobId yang sama, lalu hapus
        const q = query(trxRef);
        onSnapshot(q, (snap) => {
          snap.docs.forEach(async (d) => {
            const t = d.data();
            if (t.jobId === jobId) {
              await deleteDoc(doc(db, "transactions", d.id));
            }
          });
        });

        alert("✅ Job & transaksi terkait sudah dihapus!");
      } catch (err) {
        console.error(err);
        alert("❌ Gagal menghapus job: " + err.message);
      }
    }
  };
});
}

/* ---------------- Populate Job Select for Transaction ---------------- */
function populateJobSelect(jobs){
  if(!trxJobSelect) return;
  const cur = trxJobSelect.value;
  trxJobSelect.innerHTML = `<option value="">Pilih Job (opsional)</option>`;
  jobs.forEach(j => {
    const opt = document.createElement("option");
    opt.value = j.id;
    opt.textContent = `${j.nama} — ${j.client} (Rp ${Number(j.price||0).toLocaleString("id-ID")})`;
    trxJobSelect.appendChild(opt);
  });
  if(cur) trxJobSelect.value = cur;
}

/* ---------------- Render Transactions & small list ---------------- */
function renderTransactions(trxs){
  // small recent list
  trxList.innerHTML = "";
  trxs.slice(0,6).forEach(t => {
    const wrap = document.createElement("div");
    const date = t.tanggal?.toDate ? t.tanggal.toDate().toLocaleString() : "";
    wrap.innerHTML = `<div class="d-flex justify-content-between"><div>Rp ${Number(t.total||0).toLocaleString("id-ID")}</div><div class="text-muted small">${date}</div></div>`;
    trxList.appendChild(wrap);
  });
}

/* ---------------- Update stats ---------------- */
function updateStats(jobs){
  totalJobs.textContent = jobs.length;
  doneJobs.textContent = jobs.filter(j=>j.status==='selesai').length;
}

/* ---------------- Update total income ---------------- */
function updateTotalIncome(trxs){
  const sum = trxs.reduce((acc,t)=> acc + (Number(t.total)||0), 0);
  totalIncome.textContent = `Rp ${sum.toLocaleString("id-ID")}`;
}

/* ---------------- Chart: income per month ---------------- */
function updateIncomeChart(trxs){
  // Aggregate by YYYY-MM (local month)
  const map = {};
  trxs.forEach(t => {
    if(!t.tanggal?.toDate) return;
    const d = t.tanggal.toDate();
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    map[key] = (map[key] || 0) + (Number(t.total) || 0);
  });

  // Take last 6 months sorted
  const keys = Object.keys(map).sort();
  // ensure we show last 6 months even if empty
  const lastMonths = getLastNMonths(6);
  const labels = lastMonths.map(k => formatMonthLabel(k));
  const data = lastMonths.map(k => map[k] || 0);

  // Render or update chart
  if(!incomeChart){
    incomeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Pendapatan',
          data,
          backgroundColor: '#0b69ff'
        }]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          y: { ticks: { callback: v => 'Rp ' + Number(v).toLocaleString('id-ID') } }
        }
      }
    });
  } else {
    incomeChart.data.labels = labels;
    incomeChart.data.datasets[0].data = data;
    incomeChart.update();
  }
}

/* ---------------- Helpers ---------------- */
function getLastNMonths(n){
  const arr = [];
  const now = new Date();
  for(let i = n-1; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    arr.push(key);
  }
  return arr;
}
function formatMonthLabel(key){
  const [y,m] = key.split('-');
  const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${monthNames[Number(m)-1]} ${y}`;
}
/* ---------------- EXPORT CSV ---------------- */
const exportJobsBtn = document.getElementById("exportJobs");
const exportTrxBtn = document.getElementById("exportTrx");

if (exportJobsBtn) {
  exportJobsBtn.addEventListener("click", async () => {
    const q = query(jobsRef, orderBy("created", "desc"));
    const snap = await getDocs(q);
    const rows = [["Nama Project","Klien","Kategori","Harga","Status","Catatan"]];
    snap.docs.forEach(d => {
      const j = d.data();
      rows.push([
        j.nama || "",
        j.client || "",
        j.category || "",
        j.price || 0,
        j.status || "",
        j.notes || ""
      ]);
    });
    downloadCSV(rows, "jobs_export.csv");
  });
}

if (exportTrxBtn) {
  exportTrxBtn.addEventListener("click", async () => {
    const q = query(trxRef, orderBy("tanggal", "desc"));
    const snap = await getDocs(q);
    const rows = [["Tanggal","Job ID","Status","Total (Rp)"]];
    snap.docs.forEach(d => {
      const t = d.data();
      const date = t.tanggal?.toDate ? t.tanggal.toDate().toLocaleString("id-ID") : "";
      rows.push([date, t.jobId || "-", t.status || "", t.total || 0]);
    });
    downloadCSV(rows, "transactions_export.csv");
  });
}

// Fungsi helper download CSV
function downloadCSV(rows, filename) {
  let csvContent = "data:text/csv;charset=utf-8," 
    + rows.map(e => e.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


function escapeHtml(s){ return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

