/* XDock Plus – content script
*/

const AB_BACKEND = "https://gp-eff.alwaysdata.net/xdockplus/AB/ab_status_backend.php";
const CONTACTS_API = "https://gp-eff.alwaysdata.net/xdockplus/contacts/api.php";

/* xdock.js — XDock Plus (STORE)
   1 Jabber (EM/SM + listes)
   2 Destinations cliquables (Synthèse camion)
   3 Code-barres porte (Warenausgang/*) — JsBarcode local
   4 Compteurs + filtre voyants (Gestion du parc)
   5 AB (détection EM + coloration uniquement EM, backend)
   6 Alertes (statut 44 + IPPC manquant)
   7 Icône Contacts (toutes pages) + panneau intégré
*/
(function () {
  "use strict";

  // ---------- Config ----------
  // ← mets ici l’URL de ton API annuaire (publique, CORS: *)
  const CONTACTS_API = "https://gp-eff.alwaysdata.net/xdockplus/contacts/api.php";

  // ---------- Utils ----------
  const PATH = location.pathname || "";
  const QSA = (sel, root = document) => root.querySelectorAll(sel);
  const Q = (sel, root = document) => root.querySelector(sel);
  const debounce = (fn, wait = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };
  const runIdle = (fn) => ("requestIdleCallback" in window) ? requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 0);

  // JsBarcode local (pas de CDN)
  function ensureJsBarcodeLocal() {
    return (typeof JsBarcode !== "undefined")
      ? Promise.resolve()
      : Promise.reject(new Error("JsBarcode local non chargé"));
  }

  // ---------- 1) Cisco Jabber (champ Téléphone/Pager) ----------
  (function jabberField() {
    try {
      const id = "jabber-call-button";
      if (document.getElementById(id)) return;
      const inputs = QSA("input");
      let phoneInput = null;
      for (let input of inputs) {
        const label = input.closest("td, div")?.innerText?.toLowerCase() || "";
        const val = (input.value || "").trim();
        if (!val) continue;
        const isPhoneLike = /^\+?\d{9,15}$/.test(val);
        if (!isPhoneLike) continue;
        if (label.includes("téléphone") || label.includes("pager")) { phoneInput = input; break; }
      }
      if (!phoneInput) return;
      const raw = phoneInput.value.trim().replace(/\D/g, "");
      const phone = phoneInput.value.startsWith("+") ? phoneInput.value : `+${raw}`;
      const btn = document.createElement("a");
      btn.id = id;
      btn.href = `ciscotel:${phone}`;
      btn.title = "Appeler avec Cisco Jabber";
      Object.assign(btn.style, { marginLeft: "8px", verticalAlign: "middle", display: "inline-block" });
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" height="20" width="20" fill="#007AFF" viewBox="0 0 24 24">
          <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.21c1.21.49 2.53.76 3.88.76a1 1 0 011 1v3.5a1 1 0 01-1 1C10.3 22.13 1.88 13.7 1.88 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.35.26 2.67.76 3.88a1 1 0 01-.21 1.11l-2.3 2.3z"/>
        </svg>`;
      phoneInput.parentElement?.appendChild(btn);
    } catch {}
  })();

  // ---------- 1bis) Cisco Jabber dans les listes ----------
  (function jabberList() {
    try {
      const valid = [
        "/Taskmanagement/TaskmanagementInArbeit",
        "/Taskmanagement/Abfahrbereit",
        "/Taskmanagement/InHouse",
        "/Taskmanagement/Yardmanagement",
        "/Taskmanagement"
      ];
      if (!valid.some(url => PATH.startsWith(url))) return;

      const paintPhones = debounce(() => {
        QSA("table tbody tr").forEach(tr => {
          tr.querySelectorAll("td").forEach(td => {
            const telText = (td.textContent || "").trim();
            if (!telText || !telText.startsWith("+")) return;
            const digits = telText.replace(/\D/g, "");
            if (digits.length < 9 || digits.length > 15) return;
            if (td.querySelector(".jabber-icon")) return;
            const a = document.createElement("a");
            a.href = `ciscotel:${telText}`;
            a.title = `Appeler ${telText} avec Jabber`;
            a.className = "jabber-icon";
            Object.assign(a.style, { marginLeft: "6px", verticalAlign: "middle", display: "inline-block" });
            a.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" fill="#007AFF" viewBox="0 0 24 24">
                <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.21c1.21.49 2.53.76 3.88.76a1 1 0 011 1v3.5a1 1 0 01-1 1C10.3 22.13 1.88 13.7 1.88 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.35.26 2.67.76 3.88a1 1 0 01-.21 1.11l-2.3 2.3z"/>
              </svg>`;
            td.appendChild(a);
          });
        });
      }, 200);

      const mo = new MutationObserver(paintPhones);
      mo.observe(document.body, { childList: true, subtree: true });
      runIdle(paintPhones);
    } catch {}
  })();

  // ---------- 2) Destinations cliquables (Synthèse camion) ----------
  (function destinations() {
    try {
      if (!PATH.includes("/Taskmanagement/LkwUebersicht")) return;
      const dest = {
        "Alcalá":"Alcalá","Beaucaire":"Beaucaire","Vitoria":"Vitoria","Palmela":"Palmela","Valencia":"Valencia","Ablis":"Ablis",
        "Arcs-sur-Argens":"Arcs","Barbery":"Barbery","Barcelona":"Barcelona","Baziège":"Baziège","Béziers":"Béziers",
        "Carquefou":"Carquefou","Cestas":"Cestas","Chanteloup-Les-Vignes":"Chanteloup-Les-Vigne","Entzheim":"Entzheim","Gondreville":"Gondreville",
        "Gran Canaria":"Gran Canaria","Granada":"Granada","Honguemare-Guenouville":"Honguemare-Guenouville","La Chapelle D'Armentières":"La Chapelle D'Armentières",
        "Le Coudray-Montceaux":"Le Coudray-Montceaux","Liffré":"Liffré","Loures":"Loures","Málaga":"Málaga","Martorell":"Martorell",
        "Meaux":"Meaux","Montchanin":"Montchanin","Montoy Flanville":"Montoy Flanville","Murcia":"Murcia","Narón":"Narón",
        "Plouagat":"Plouagat","Pontcharra":"Pontcharra","Provence":"Provence","Sailly-lez-Cambrai":"Sailly-lez-Cambrai",
        "Saint Augustin":"Saint Augustin","Saint Quentin Fallavier":"Saint Quentin Fallavier","Santo Tirso":"Santo Tirso","Sevilla":"Sevilla",
        "Sorigny":"Sorigny","Tarragona":"Tarragona","Tenerife":"Tenerife","Torres Novas":"Torres Novas","Vars":"Vars"
      };
      const makeLinks = debounce(() => {
        const today = new Date().toISOString().split("T")[0];
        QSA("td").forEach(td => {
          if (td.querySelector("a")) return;
          const txt = (td.innerText || "").trim();
          const code = dest[txt];
          if (!code) return;
          const a = document.createElement("a");
          a.href = `/Warenausgang/Tag?sort=StatusASC&selecteddate=${today}&search=${encodeURIComponent(code)}`;
          a.innerText = txt; a.title = `Ouvrir la page de sortie pour ${txt}`;
          a.style.color = "#000"; td.innerHTML = ""; td.appendChild(a);
        });
      }, 200);
      const mo = new MutationObserver(makeLinks);
      mo.observe(document.body, { childList: true, subtree: true });
      runIdle(makeLinks);
    } catch {}
  })();

  // ---------- 3) Code-barres porte (Warenausgang/*) ----------
  (function barcode() {
    try {
      if (!PATH.startsWith("/Warenausgang/")) return;
      Q("#barcode-mini")?.remove(); Q("#barcode-zoom")?.remove();

      const porteLabel = Array.from(QSA("label")).find(l => /porte|door/i.test(l.textContent || ""));
      const porteInput = porteLabel ? porteLabel.parentElement?.querySelector("input") : null;
      const porte = porteInput && (porteInput.value || "").trim() ? porteInput.value.trim() : null;
      if (!porte) return;

      const mini = document.createElement("div");
      mini.id = "barcode-mini";
      mini.style.cssText = "margin-top:10px;background:#fff;border:1px solid #000;padding:8px;width:fit-content;cursor:pointer;border-radius:10px";
      mini.innerHTML = `<svg id="barcodeCanvas"></svg>`;
      porteInput?.parentElement?.appendChild(mini);

      const overlay = document.createElement("div");
      overlay.id = "barcode-zoom";
      Object.assign(overlay.style, {
        position:"fixed",top:"0",left:"0",width:"100%",height:"100%",background:"rgba(0,0,0,0.7)",
        display:"none",zIndex:999999,justifyContent:"center",alignItems:"center"
      });
      overlay.innerHTML = `
        <div style="position: relative; background:white; padding:20px; border-radius:10px; max-width:90vw;">
          <span id="closeZoom" style="position:absolute;top:10px;right:10px;cursor:pointer;font-size:20px;color:#444;">❌</span>
          <h2 style="text-align:center;">Porte ${porte}</h2>
          <svg id="barcodeZoom"></svg>
        </div>`;
      document.body.appendChild(overlay);

      ensureJsBarcodeLocal().then(() => {
        const miniSVG = Q("#barcodeCanvas");
        if (miniSVG) JsBarcode(miniSVG, String(porte), { format:"CODE128", width:2, height:40, displayValue:false });
        mini.onclick = () => {
          const zoomSVG = Q("#barcodeZoom");
          if (zoomSVG) JsBarcode(zoomSVG, String(porte), { format:"CODE128", width:4, height:120, displayValue:true });
          overlay.style.display = "flex";
        };
      }).catch(() => {
        console.warn("[XDockPlus] JsBarcode local absent — code-barres non généré.");
      });

      Q("#closeZoom")?.addEventListener("click", () => { overlay.style.display = "none"; });
      document.addEventListener("keydown", e => { if (e.key === "Escape") overlay.style.display = "none"; }, { passive: true });
    } catch {}
  })();

  // ---------- 4) Compteurs + filtre voyants (Gestion du parc) ----------
  (function counters() {
    try {
      if (!PATH.includes("/Yardmanagement")) return;

      const applyFilter = (value) => {
        QSA("table tbody tr").forEach(row => {
          const hasRed = row.querySelector(".trafficLightVorrauswareRed");
          const hasYellow = row.querySelector(".trafficLightVorrauswareYellow");
          const hasGreen = row.querySelector(".trafficLightVorrauswareGreen");
          row.style.display = "table-row";
          if (value === "green"  && !hasGreen)  row.style.display = "none";
          if (value === "yellow" && !hasYellow) row.style.display = "none";
          if (value === "red"    && !hasRed)    row.style.display = "none";
        });
      };

      const updateCounters = () => {
        const verts  = QSA(".trafficLightVorrauswareGreen").length;
        const jaunes = QSA(".trafficLightVorrauswareYellow").length;
        const rouges = QSA(".trafficLightVorrauswareRed").length;

        const titre = Array.from(QSA("h1, h2")).find(el => /gestion du parc/i.test(el.textContent || ""));
        if (!titre) return;

        let container = Q("#filtrage-et-compteurs");
        if (!container) {
          container = document.createElement("div");
          container.id = "filtrage-et-compteurs";
          Object.assign(container.style, {
            display:"flex",alignItems:"center",gap:"20px",marginTop:"10px",
            justifyContent:"center",position:"absolute",top:"50%",transform:"translateY(-50%)",
            left:"200px",zIndex:"9999"
          });
          titre.parentElement?.insertBefore(container, titre.nextSibling);
        }

        let select = Q("#filtre-couleur");
        if (!select) {
          select = document.createElement("select");
          select.id = "filtre-couleur";
          Object.assign(select.style, {
            fontSize:"18px",padding:"6px 12px",border:"1px solid #ccc",borderRadius:"10px",
            boxShadow:"0 2px 4px rgba(0,0,0,0.1)",backgroundColor:"#f5f5f5",fontWeight:"bold",height:"42px"
          });
          select.innerHTML = `
            <option value="all">Afficher tous</option>
            <option value="green">🟢 Aucune précommande</option>
            <option value="yellow">🟡 Partiel</option>
            <option value="red">🔴 Complet</option>`;
          const saved = localStorage.getItem("filtre-couleur");
          if (saved) select.value = saved;
          select.addEventListener("change", () => {
            localStorage.setItem("filtre-couleur", select.value);
            applyFilter(select.value);
          });
          container.appendChild(select);
        }
        applyFilter(select.value);

        let compteur = Q("#compteurs-marchandises");
        if (!compteur) {
          compteur = document.createElement("span");
          compteur.id = "compteurs-marchandises";
          Object.assign(compteur.style, {
            fontSize:"18px",padding:"6px 12px",border:"1px solid #ccc",
            borderRadius:"10px",background:"#fff",boxShadow:"0 2px 4px rgba(0,0,0,0.1)"
          });
          container.appendChild(compteur);
        }
        compteur.innerHTML = `🟢 ${verts} &nbsp;&nbsp; 🟡 ${jaunes} &nbsp;&nbsp; 🔴 ${rouges}`;
      };

      setTimeout(() => { updateCounters(); setInterval(updateCounters, 10000); }, 1200);
    } catch {}
  })();

  // ---------- 5) AB — Coloration EM dans Yardmanagement (backend map) ----------
  (function () {
    if (!location.pathname.includes("/Yardmanagement")) return;

    const backendURL = "https://gp-eff.alwaysdata.net/xdockplus/AB/ab_status_backend.php";
    const TABLE_SELECTOR = "table tbody tr";
    const BADGE_CLASS = "ab-badge-xdockplus";

    async function fetchABMap() {
      try {
        const r = await fetch(backendURL, { cache: "no-store" });
        return await r.json(); // { "1435069": true, ... }
      } catch (e) {
        console.warn("[AB] fetch backend failed:", e);
        return {};
      }
    }

    function getTourIdFromRow(tr) {
      const a = tr.querySelector('a[href*="weTourId="]');
      if (a) {
        try {
          const url = new URL(a.href, location.origin);
          const id = url.searchParams.get("weTourId");
          if (id) return id.trim();
        } catch {}
      }
      const dataId = tr.getAttribute("data-wetourid") || tr.getAttribute("data-tourid");
      if (dataId) return dataId.trim();
      const hidden = tr.querySelector('input[name="WeTourId"], input[name*="WeTourId"]');
      if (hidden && hidden.value) return hidden.value.trim();
      for (const td of tr.querySelectorAll("td:nth-child(1), td:nth-child(2)")) {
        const txt = td.textContent.trim();
        const m = txt.match(/\b\d{6,}\b/);
        if (m) return m[0];
      }
      return null;
    }

    function ensureBadge(td) {
      let badge = td.querySelector(`.${BADGE_CLASS}`);
      if (!badge) {
        badge = document.createElement("span");
        badge.className = BADGE_CLASS;
        badge.textContent = " 📦 AB";
        badge.style.marginLeft = "6px";
        badge.style.fontWeight = "600";
        badge.style.color = "#2e7d32";
        td.appendChild(badge);
      }
      return badge;
    }

    function removeBadge(tr) {
      tr.querySelectorAll(`.${BADGE_CLASS}`).forEach(b => b.remove());
    }

    function applyABStyles(tr, isAB) {
      if (isAB) {
        tr.style.setProperty("background-color", "#d4f8c4", "important");
        const td = tr.querySelector("td") || tr;
        ensureBadge(td);
      } else {
        tr.style.removeProperty("background-color");
        removeBadge(tr);
      }
    }

    function paint(abMap) {
      document.querySelectorAll(TABLE_SELECTOR).forEach(tr => {
        const id = getTourIdFromRow(tr);
        if (!id) return;
        const isAB = !!abMap[id];
        applyABStyles(tr, isAB);
      });
    }

    async function refresh() {
      const map = await fetchABMap();
      paint(map);
    }

    setTimeout(refresh, 1500);
    setInterval(refresh, 15000);

    const root = document.querySelector("table")?.closest("div, section, main, body") || document.body;
    const mo = new MutationObserver((muts) => {
      const need = muts.some(m => m.addedNodes && m.addedNodes.length);
      if (need) refresh();
    });
    mo.observe(root, { subtree: true, childList: true });
  })();

  // === EM auto: détecte les AB (KLSTB YYMMDD = demain) et POST vers backend ===
  (function () {
    if (!location.pathname.startsWith("/Wareneingang/Tour")) return;

    const BACKEND = "https://gp-eff.alwaysdata.net/xdockplus/AB/ab_status_backend.php";
    const tourId = new URLSearchParams(location.search).get("weTourId");
    if (!tourId) return;

    function fmtTomorrowYYMMDD() {
      const t = new Date(); t.setDate(t.getDate() + 1);
      return `${String(t.getFullYear()).slice(-2)}${String(t.getMonth()+1).padStart(2,"0")}${String(t.getDate()).padStart(2,"0")}`;
    }
    const tomorrow = fmtTomorrowYYMMDD();

    function hasABTomorrow() {
      const re = /KLSTB(\d{6})/gi;
      const allText = Array.from(document.querySelectorAll("td,#referenzTd"))
        .map(n => n.textContent || "").join(" ");
      let m;
      while ((m = re.exec(allText))) {
        if (m[1] === tomorrow) return true;
      }
      return false;
    }

    async function postAB(ab) {
      try {
        await fetch(BACKEND, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournee: String(tourId), ab: !!ab })
        });
      } catch (e) {
        console.warn("[AB][EM] POST error", e);
      }
    }

    let last = null;
    function scanAndSend() {
      const ab = hasABTomorrow();
      if (ab !== last) {
        last = ab;
        postAB(ab);
      }
    }

    setTimeout(scanAndSend, 800);
    setInterval(scanAndSend, 10000);
    new MutationObserver(() => scanAndSend())
      .observe(document.body, { childList: true, subtree: true });
  })();

  // ---------- 6) Alertes statut 44 + IPPC manquant ----------
  (function alerts() {
    try {
      const targets = ["/Taskmanagement/TaskmanagementAmLager", "/Taskmanagement/TaskmanagementInArbeit"];
      if (!targets.some(p => PATH.startsWith(p))) return;

      const alerted = new Set();
      let container = Q("#xdp-toast-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "xdp-toast-container";
        Object.assign(container.style, {
          position:"fixed", right:"16px", bottom:"16px", zIndex:1000000,
          display:"flex", flexDirection:"column", gap:"10px"
        });
        document.body.appendChild(container);
      }

      const show = ({ em, message, href }) => {
        const key = `${em}|${message}`;
        if (alerted.has(key)) return;
        alerted.add(key);
        const toast = document.createElement("div");
        Object.assign(toast.style, {
          background:"rgba(128,0,255,0.5)", color:"#fff", borderRadius:"12px",
          padding:"12px 14px", minWidth:"280px", boxShadow:"0 6px 18px rgba(0,0,0,0.2)",
          backdropFilter:"blur(2px)", position:"relative", cursor: href ? "pointer" : "default"
        });
        toast.innerHTML = `
          <div style="font-weight:700; margin-bottom:4px;">${em ? `EM ${em}` : "Tour"}</div>
          <div style="font-size:14px; line-height:1.3;">${message}</div>
          <button aria-label="Fermer" style="position:absolute; top:6px; right:8px; background:transparent; border:none; color:#fff; font-size:16px; cursor:pointer;">×</button>`;
        if (href) {
          toast.addEventListener("click", (e) => {
            const t = e.target;
            if (t && t.tagName && t.tagName.toLowerCase() === "button") return;
            window.open(href, "_blank");
          });
        }
        toast.querySelector("button")?.addEventListener("click", (e) => { e.stopPropagation(); toast.remove(); });
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 10000);
      };

      const rxIPPC = /WE\s*IPPC[- ]Stempel\s*fehlt/i;
      const rx44 = /\b(?:status|statut)\s*[:]?[\s[]*44\b/i;

      const parse = (row) => {
        const emLink = row.querySelector('a[href*="/Wareneingang/Tour"][href*="weTourId="]');
        const emId = emLink ? new URL(emLink.href, location.origin).searchParams.get("weTourId") : null;
        const txt = (row.textContent || "").replace(/\s+/g, " ").trim();
        const hasIPPC = rxIPPC.test(txt);
        const has44 = rx44.test(txt) || /\[\s*44\s*]/.test(txt);
        const href = emLink?.getAttribute("href") || null;
        return { emId, hasIPPC, has44, href };
      };

      const scan = debounce(() => {
        QSA("table tbody tr").forEach(tr => {
          const { emId, hasIPPC, has44, href } = parse(tr);
          if (hasIPPC) show({ em: emId || "?", message: "WE IPPC-Stempel fehlt", href });
          if (has44)   show({ em: emId || "?", message: "Statut 44 détecté", href });
        });
      }, 200);

      setTimeout(scan, 1000);
      const mo = new MutationObserver(scan);
      mo.observe(document.body, { childList: true, subtree: true });
      setInterval(scan, 15000);
    } catch {}
  })();

  // ---------- 7) Icône Contacts (toutes pages) + panneau intégré ----------
(function () {
  "use strict";
  const CONTACTS_API = "https://gp-eff.alwaysdata.net/xdockplus/contacts/api.php";

  const SVG_PHONE = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
         aria-hidden="true" focusable="false" style="display:block;">
      <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.21
               12.3 12.3 0 003.88.76 1 1 0 011 1V20a1 1 0 01-1 1C10.3 22.13 1.88 13.7
               1.88 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.35.26 2.67.76 3.88a1 1 0 01-.21 1.11l-2.3 2.3z"/>
    </svg>`;

  function normPhone(p){ const d=String(p||"").replace(/[^\d+]/g,""); return d? (d.startsWith("+")?d:"+"+d):""; }
  function topCall(phone){ const n=normPhone(phone); if(n) try{ location.href="ciscotel:"+n; }catch{} }

  // Insertion bouton — si la nav n’existe pas, on crée un FAB (floating button)
  function insertButton() {
    if (document.getElementById("xdp-contacts-btn")) return true;

    let host = document.querySelector('a[href*="/Taskmanagement"]')?.closest("li");
    let mode = "nav";
    if (!host) {
      // FAB
      mode = "fab";
      const fab = document.createElement("button");
      fab.id = "xdp-contacts-btn";
      fab.title = "Contacts";
      fab.innerHTML = SVG_PHONE;
      Object.assign(fab.style, {
        position:"fixed", right:"16px", bottom:"16px", zIndex:100000,
        width:"44px", height:"44px", borderRadius:"12px",
        border:"1px solid rgba(0,0,0,.2)", background:"#0f62fe", color:"#fff",
        cursor:"pointer", boxShadow:"0 6px 16px rgba(0,0,0,.25)"
      });
      const svg = fab.querySelector("svg"); svg.style.width="22px"; svg.style.height="22px"; svg.style.fill="#fff";
      document.body.appendChild(fab);
      fab.addEventListener("click", openPanelSafely);
      return true;
    }

    // Ajout dans la nav
    const li = document.createElement("li");
    const a = document.createElement("a");
    li.id = "xdp-contacts-btn";
    a.href = "javascript:void(0)";
    a.title = "Contacts";
    a.innerHTML = SVG_PHONE;
    const svg = a.firstElementChild; svg.style.width="20px"; svg.style.height="20px"; svg.style.fill="#fff";
    a.style.display = "inline-flex"; a.style.alignItems="center"; a.style.gap="6px"; a.style.padding="0 6px";
    li.appendChild(a);
    (host.parentElement || host).appendChild(li);
    a.addEventListener("click", openPanelSafely);
    return true;
  }

  let panel = null, ifr=null, hiddenNode=null, messageHandler=null;
  function findHeader(){
    return document.querySelector("header, .navbar, .topbar, .navbar-fixed-top") || document.body;
  }
  function findContentRoot(){
    const h = Array.from(document.querySelectorAll("h1,h2,h3")).find(el =>
      /Ihre\s+Lager|Entrée de marchandises|Sortie de marchandises|Gestion du parc|Task/i.test(el.textContent||"")
    );
    return h ? (h.closest("section, .container, .container-fluid, main, .content, body > div") || h.parentElement) : null;
  }
  function syncTop(){
    if (!panel) return;
    const header = findHeader();
    panel.style.top = (header.getBoundingClientRect().bottom + window.scrollY) + "px";
  }

  function openPanel() {
    if (panel) return;
    hiddenNode = findContentRoot(); if (hiddenNode) hiddenNode.style.display = "none";

    panel = document.createElement("div");
    Object.assign(panel.style, {
      position:"fixed", left:"0", right:"0", bottom:"0",
      background:"#0d1b2a", zIndex:100000, borderTop:"1px solid rgba(255,255,255,.08)"
    });
    document.body.appendChild(panel); syncTop();
    const bar = document.createElement("div");
    bar.style.cssText="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0f253b;border-bottom:1px solid rgba(255,255,255,.08);";
    bar.innerHTML=`<div style="font-weight:800;color:#e6edf3">Contacts</div>`;
    const close = document.createElement("button");
    close.textContent="×"; close.title="Fermer";
    close.style.cssText="margin-left:auto;width:32px;height:32px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#172c43;color:#fff;cursor:pointer;font-size:18px;";
    close.onclick = closePanel;
    bar.appendChild(close); panel.appendChild(bar);

    // charge l’iframe contacts (doit être web_accessible_resources)
    const params = new URLSearchParams({ api: CONTACTS_API });
    const urlWithApi = chrome.runtime.getURL("contacts/index.html") + "?" + params.toString();

    ifr = document.createElement("iframe");
    ifr.src = urlWithApi;
    ifr.style.cssText = "border:0;width:100%;height:calc(100% - 48px);background:#0d1b2a;";
    panel.appendChild(ifr);

    messageHandler = (e) => {
      if (!ifr || e.source !== ifr.contentWindow) return;
      const d = e.data;
      if (d && d.xdockplus === true && d.type === "CALL" && d.phone) topCall(d.phone);
    };
    window.addEventListener("message", messageHandler);

    document.addEventListener("keydown", onEsc, { passive:true });
    window.addEventListener("resize", onResize, { passive:true });
  }

  function closePanel(){
    if (messageHandler) window.removeEventListener("message", messageHandler);
    messageHandler=null;
    panel?.remove(); panel=null; ifr=null;
    if (hiddenNode) hiddenNode.style.display="";
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onEsc);
  }
  function onEsc(e){ if(e.key==="Escape") closePanel(); }
  function onResize(){ syncTop(); }

  // Fallback si l’iframe est bloquée par CSP → ouverture dans un nouvel onglet
  function openPanelSafely(){
    try {
      // test rapide: essaye d’ouvrir l’iframe, si on a une erreur de charge dans ~300ms → fallback
      let failed = false;
      const t = setTimeout(() => {
        if (!panel || !ifr || failed) return;
        // si l’iframe refuse de se peindre (souvent CSP), on fallback
        if (!ifr.contentWindow) { failed = true; fallbackNewTab(); }
      }, 300);

      openPanel();
      ifr.addEventListener("error", () => { failed = true; clearTimeout(t); fallbackNewTab(); }, { once:true });
    } catch {
      fallbackNewTab();
    }
  }
  function fallbackNewTab(){
    const params = new URLSearchParams({ api: CONTACTS_API });
    const urlWithApi = chrome.runtime.getURL("contacts/index.html") + "?" + params.toString();
    window.open(urlWithApi, "_blank"); // nouvel onglet de l’extension
  }

  // essaye d’insérer le bouton; sinon FAB
  let tries=0;
  const iv=setInterval(()=>{ const ok=insertButton(); if(ok||++tries>40) clearInterval(iv); },350);
  new MutationObserver(()=>{ if(!document.getElementById("xdp-contacts-btn")) insertButton(); })
    .observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>{/* stop observer auto si tout va bien */},20000);
})();

// ---------- 8) Echange de palettes/Echange pas de palettes ---------
(function () {
  // Seulement sur la page Tournée EM
  if (!/\/Wareneingang\/Tour/i.test(location.pathname)) return;

  // --- helpers ---
  function getExchangeSelect() {
    // select natif
    const s1 = document.querySelector('select#WeTourheader_PalettentauschArt')
      || document.querySelector('select[name="WeTourheader.PalettentauschArt"]')
      || document.querySelector('select[id*="PalettentauschArt"]')
      || document.querySelector('select[name*="PalettentauschArt"]');
    if (s1) return s1;

    // bootstrap-select (affichage)
    const bs = document.querySelector(".filter-option-inner-inner");
    return bs ? { _bs: true, el: bs } : null;
  }

  function readExchangeText() {
    const sel = getExchangeSelect();
    if (!sel) return "";
    if (sel._bs) return (sel.el.textContent || "").trim();            // libellé visible
    const opt = sel.selectedOptions && sel.selectedOptions[0];         // select natif
    return (opt ? opt.textContent : sel.value || "").trim();
  }

  function normalizePhrase(txt) {
    const t = (txt || "").toLowerCase();
    if (t.includes("pas d'échange") || t.includes("pas d’echange")) {
      return "Pas d'échange de palettes";
    }
    return "Échange de palettes";
  }

  // >>> cible exacte du commentaire interne
  function getInternalTextarea() {
    return (
      document.querySelector('#kommentarIntern') ||
      document.querySelector('textarea[name="WeTourheader.KommentarIntern"]') ||
      document.querySelector('textarea[id*="kommentarIntern"]')
    );
  }

  function writeOnceIntoInternalComment() {
    const ta = getInternalTextarea();
    if (!ta) return;
    const phrase = normalizePhrase(readExchangeText());
    if ((ta.value || "").trim() === phrase) return;       // déjà correct -> ne pas flood

    ta.value = phrase;
    ta.dispatchEvent(new Event("input",  { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function wireOnceOnSave() {
    // bouton "Enregistrer"
    const saveBtn = Array.from(document.querySelectorAll("button, a"))
      .find(el => /enregistrer/i.test((el.textContent || "").trim()));
    if (saveBtn && !saveBtn.dataset._wireAbOnce) {
      saveBtn.dataset._wireAbOnce = "1";
      saveBtn.addEventListener("click", writeOnceIntoInternalComment, true);
    }
    // soumission des formulaires
    document.querySelectorAll("form").forEach(f => {
      if (!f.dataset._wireAbOnce) {
        f.dataset._wireAbOnce = "1";
        f.addEventListener("submit", writeOnceIntoInternalComment, true);
      }
    });
  }

  // attendre que le select + textarea existent
  const poll = setInterval(() => {
    if (getExchangeSelect() && getInternalTextarea()) {
      clearInterval(poll);
      wireOnceOnSave();
    }
  }, 250);

  // si la page réinjecte du DOM (ajax), on recâble
  new MutationObserver(wireOnceOnSave).observe(document.body, { childList: true, subtree: true });
})();

