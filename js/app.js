/* =============================================================
   App.js — Router & Home Page
   Smart Plannification IA — HTML/JS Version
   ============================================================= */

const App = (() => {

  let currentPage = 'home';

  /* ── Module definitions ────────────────────────────────────── */
  const MODULES = [
    {
      id:    'ordonnancement',
      icon:  '🎯',
      title: 'Ordonnancement des tâches',
      desc:  'Séquencez vos tâches sur 1 machine, machines parallèles, Flow Shop ou Job Shop. Minimisez le makespan, les retards ou le temps moyen de traitement.',
      tag:   'Actif',
      module: Ordonnancement,
    },
    {
      id:    'logistique',
      icon:  '🚛',
      title: 'Déchargement entrepôt',
      desc:  'Affectez les camions aux quais de déchargement selon leurs horaires d\'arrivée et leurs priorités. Visualisez le Gantt des quais.',
      tag:   'Actif',
      module: Logistique,
    },
    {
      id:    'maintenance',
      icon:  '🔧',
      title: 'Maintenance & interventions',
      desc:  'Planifiez les interventions préventives et correctives. Affectez les techniciens et minimisez les temps d\'arrêt machines.',
      tag:   'Actif',
      module: Maintenance,
    },
    {
      id:    'stocks',
      icon:  '📦',
      title: 'Planification MRP',
      desc:  'Calculez les besoins nets multiniveaux, générez les ordres de fabrication et d\'achat à partir de vos prévisions de demande.',
      tag:   'Actif',
      module: Stocks,
    },
  ];

  /* ── Navigate ────────────────────────────────────────────────── */
  function navigate(page) {
    currentPage = page;
    render();
    window.scrollTo(0, 0);
  }

  /* ── Render ──────────────────────────────────────────────────── */
  function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    if (currentPage === 'home') {
      renderHome(app);
    } else {
      const mod = MODULES.find(m => m.id === currentPage);
      if (mod && mod.module && typeof mod.module.render === 'function') {
        mod.module.render(app);
      } else {
        renderHome(app);
      }
    }
  }

  /* ── Home page ───────────────────────────────────────────────── */
  function renderHome(app) {
    const wrap = Utils.div('');
    wrap.innerHTML = `
      <div class="hero">
        <h1 class="hero-title">📅 Smart Plannification IA</h1>
        <p class="hero-sub">Planification industrielle pilotée par des algorithmes d'optimisation</p>
        <div class="hero-badge">⚡ Ordonnancement · 🚛 Déchargement · 🔧 Maintenance · 📦 MRP</div>
      </div>

      <div class="modules-grid" id="home-cards"></div>

      <div class="features-bar">
        <div class="feat-item">
          <span class="feat-icon">⚡</span>
          <div class="feat-label">Calcul instantané</div>
        </div>
        <div class="feat-item">
          <span class="feat-icon">📈</span>
          <div class="feat-label">Diagramme de Gantt</div>
        </div>
        <div class="feat-item">
          <span class="feat-icon">📤</span>
          <div class="feat-label">Export CSV</div>
        </div>
      </div>

      <div class="home-footer">
        Algorithmes — SPT · EDD · NEH · Johnson · Moore-Hodgson · WSPT · LPT · Giffler-Thompson
      </div>

      <div class="credit-bar">
        Developed by Nabil Benkirane &nbsp;·&nbsp; Supervised by Prof. Faouzi Tayalati
      </div>`;

    app.appendChild(wrap);

    // Module cards
    const cardsContainer = document.getElementById('home-cards');
    MODULES.forEach(mod => {
      const card = Utils.div('module-card');
      card.innerHTML = `
        <div class="mod-icon">${mod.icon}</div>
        <div class="mod-title">${mod.title}</div>
        <div class="mod-desc">${mod.desc}</div>
        <span class="mod-tag">${mod.tag}</span>
        <br/>
        <button class="btn btn-primary btn-access btn-full" style="margin-top:.8rem">Accéder →</button>`;

      card.querySelector('.btn-access').onclick = (e) => {
        e.stopPropagation();
        navigate(mod.id);
      };
      card.onclick = () => navigate(mod.id);
      cardsContainer.appendChild(card);
    });
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    render();
  }

  return { navigate, render, init };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
