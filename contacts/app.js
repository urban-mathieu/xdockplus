// lit l’API fournie par l’extension (envoyée via query)
const params = new URLSearchParams(location.search);
const API = params.get("api");

function normPhone(p){ const d = String(p||"").replace(/[^\d+]/g,""); return d ? (d.startsWith("+")?d:"+"+d) : ""; }

async function fetchContacts() {
  const r = await fetch(API, { cache: "no-store" });
  return await r.json(); // { "Matin":[...], "Après-midi":[...], "Nuit":[...] }
}

function render(list, data){
  const root = document.getElementById("list");
  const tpl = document.getElementById("row");
  root.innerHTML = "";

  const flat = [];
  for (const [group, arr] of Object.entries(data)) {
    arr.forEach(x => flat.push({ name:x.name, phone:x.phone, group }));
  }

  const q = (document.getElementById("q").value || "").toLowerCase().trim();
  const items = flat.filter(x =>
    !q || x.name.toLowerCase().includes(q) || x.group.toLowerCase().includes(q)
  );

  for (const c of items) {
    const n = tpl.content.cloneNode(true);
    n.querySelector(".name").textContent = c.name;
    n.querySelector(".group").textContent = c.group;
    const a = n.querySelector(".call");
    a.href = "ciscotel:" + normPhone(c.phone);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      // on remonte le CALL au content-script (qui fera location.href=ciscotel:)
      parent.postMessage({ xdockplus:true, type:"CALL", phone: c.phone }, "*");
    });
    root.appendChild(n);
  }
}

async function start(){
  const data = await fetchContacts();
  render(document.getElementById("list"), data);
  document.getElementById("q").addEventListener("input", () => render(null, data));
}

// passe l’URL de l’API en query pour éviter le CORS de l’iframe
if (!API) {
  // fallback : essaye de deviner depuis le content-script (sera surchargé)
  const guess = "https://gp-eff.alwaysdata.net/xdockplus/contacts/api.php";
  location.search = "?api=" + encodeURIComponent(guess);
} else {
  start().catch(console.error);
}
